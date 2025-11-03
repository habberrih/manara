import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { Plan } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import Stripe from 'stripe';
import { STRIPE_CLIENT } from './subscriptions.constants';
import { SubscriptionsService } from './subscriptions.service';

type StripeMock = {
  prices: { list: jest.Mock };
  customers: { create: jest.Mock; retrieve: jest.Mock };
};

const createStripeMock = (): StripeMock => ({
  prices: { list: jest.fn() },
  customers: { create: jest.fn(), retrieve: jest.fn() },
});

type PrismaServiceMock = {
  subscriptionPlan: {
    findUnique: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
  };
  subscription: {
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    create: jest.Mock;
  };
  organization: {
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  apiKey: {
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

const createPrismaMock = (): PrismaServiceMock => {
  const prisma: PrismaServiceMock = {
    subscriptionPlan: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    subscription: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    apiKey: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  prisma.$transaction.mockImplementation(async (callback: any) =>
    callback(prisma),
  );

  return prisma;
};

describe('SubscriptionsService', () => {
  let service: SubscriptionsService;
  let prisma: PrismaServiceMock;
  let stripe: StripeMock;
  let loggerWarnSpy: jest.SpyInstance;

  beforeEach(async () => {
    stripe = createStripeMock();
    prisma = createPrismaMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: STRIPE_CLIENT, useValue: stripe },
        {
          provide: PrismaService,
          useValue: prisma as unknown as PrismaService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'STRIPE_DEFAULT_CURRENCY' ? 'usd' : undefined,
            ),
          },
        },
      ],
    }).compile();

    service = module.get(SubscriptionsService);
    loggerWarnSpy = jest
      .spyOn(service['logger'], 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
    loggerWarnSpy.mockRestore();
  });

  it('uses fallback currency when config missing', async () => {
    const altModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: STRIPE_CLIENT, useValue: stripe },
        {
          provide: PrismaService,
          useValue: prisma as unknown as PrismaService,
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn(() => undefined) },
        },
      ],
    }).compile();

    const altService = altModule.get(SubscriptionsService) as any;
    expect(altService.defaultCurrency).toBe('usd');
  });

  it('syncPlans paginates through Stripe prices and returns summary', async () => {
    const firstProduct = {
      id: 'prod_1',
      metadata: { plan: 'PRO' },
      name: 'Pro',
    } as unknown as Stripe.Product;
    const secondProduct = {
      id: 'prod_2',
      metadata: { plan: 'FREE' },
      name: 'Free',
    } as unknown as Stripe.Product;

    const firstPrice = {
      id: 'price_new',
      active: true,
      product: firstProduct,
      unit_amount: 1000,
      currency: 'usd',
      nickname: 'Pro Monthly',
      recurring: { interval: 'month' },
      metadata: { plan: 'PRO' },
    } as unknown as Stripe.Price;
    const secondPrice = {
      id: 'price_existing',
      active: true,
      product: secondProduct,
      unit_amount: 0,
      currency: 'usd',
      nickname: 'Free',
      recurring: { interval: 'month' },
      metadata: { plan: 'FREE' },
    } as unknown as Stripe.Price;

    stripe.prices.list
      .mockResolvedValueOnce({
        data: [firstPrice],
        has_more: true,
      })
      .mockResolvedValueOnce({
        data: [secondPrice],
        has_more: false,
      });

    prisma.subscriptionPlan.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ plan: Plan.FREE });
    prisma.subscriptionPlan.updateMany.mockResolvedValue({ count: 1 });

    const summary = await service.syncPlans({ limit: 50 });

    expect(stripe.prices.list).toHaveBeenCalledTimes(2);
    expect(prisma.subscriptionPlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stripePriceId: 'price_new',
        plan: Plan.PRO,
      }),
    });
    expect(prisma.subscriptionPlan.update).toHaveBeenCalledWith({
      where: { stripePriceId: 'price_existing' },
      data: expect.objectContaining({
        plan: Plan.FREE,
      }),
    });
    expect(summary).toEqual({ created: 1, updated: 1, deactivated: 1 });
    expect(loggerWarnSpy).not.toHaveBeenCalled();
  });

  it('syncPlans applies default values when Stripe fields missing', async () => {
    const product = { id: 'prod_fallback', metadata: { plan: 'PRO' } } as any;
    const price = {
      id: 'price_fallback',
      active: true,
      product,
      metadata: { plan: 'PRO' },
      recurring: undefined,
      unit_amount: undefined,
      nickname: undefined,
      currency: undefined,
    } as unknown as Stripe.Price;

    stripe.prices.list.mockResolvedValueOnce({
      data: [price],
      has_more: false,
    });
    prisma.subscriptionPlan.findUnique.mockResolvedValue(null);

    await service.syncPlans();

    expect(prisma.subscriptionPlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stripePriceId: 'price_fallback',
        amountCents: 0,
        interval: 'month',
        nickname: 'PRO',
        currency: 'usd',
      }),
    });
  });

  it('syncPlans ignores prices without product information', async () => {
    stripe.prices.list.mockResolvedValueOnce({
      data: [{ id: 'price_missing_product', active: true } as any],
      has_more: false,
    });

    await service.syncPlans();

    expect(prisma.subscriptionPlan.create).not.toHaveBeenCalled();
    expect(loggerWarnSpy).not.toHaveBeenCalled();
  });

  it('syncPlans skips inactive and unlabeled prices', async () => {
    const product = { id: 'prod', metadata: {}, name: 'Unknown' } as any;
    const inactivePrice = { id: 'price_inactive', active: false } as any;
    const missingMetadataPrice = {
      id: 'price_missing_meta',
      active: true,
      product,
      metadata: {},
    } as any;

    stripe.prices.list.mockResolvedValueOnce({
      data: [inactivePrice, missingMetadataPrice],
      has_more: false,
    });

    await service.syncPlans();

    expect(prisma.subscriptionPlan.create).not.toHaveBeenCalled();
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Skipping Stripe price price_missing_meta'),
    );
  });

  it('ensureCustomer throws when organization missing', async () => {
    prisma.organization.findUnique.mockResolvedValue(null);
    await expect(service.ensureCustomer('missing')).rejects.toThrow(
      'Organization not found',
    );
  });

  it('ensureCustomer returns existing Stripe customer id when present', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org_1',
      name: 'Org',
      slug: 'org',
      stripeCustomerId: 'cus_existing',
    } as any);

    const customerId = await service.ensureCustomer('org_1');

    expect(customerId).toBe('cus_existing');
    expect(stripe.customers.create).not.toHaveBeenCalled();
  });

  it('ensureCustomer creates Stripe customer when missing', async () => {
    prisma.organization.findUnique.mockResolvedValue({
      id: 'org_1',
      name: 'Org',
      slug: 'org',
      stripeCustomerId: null,
    } as any);
    stripe.customers.create.mockResolvedValue({ id: 'cus_new' });

    const customerId = await service.ensureCustomer('org_1');

    expect(stripe.customers.create).toHaveBeenCalledWith({
      name: 'Org',
      metadata: { organizationId: 'org_1', slug: 'org' },
    });
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      data: { stripeCustomerId: 'cus_new' },
    });
    expect(customerId).toBe('cus_new');
  });

  it('upsertStripeSubscription downgrades organization when subscription has lapsed', async () => {
    prisma.subscriptionPlan.findUnique.mockResolvedValue({
      plan: Plan.PRO,
    } as any);
    prisma.subscription.findUnique.mockResolvedValue(null);
    prisma.subscription.create.mockResolvedValue({ id: 'sub' });
    prisma.organization.update.mockResolvedValue({ id: 'org_1' });
    prisma.apiKey.findMany.mockResolvedValue([{ id: 'key_old' }]);
    prisma.apiKey.updateMany.mockResolvedValue({ count: 1 });

    const expiredTimestamp = Math.floor(Date.now() / 1000) - 3600;

    const subscription = {
      id: 'sub_123',
      status: 'past_due',
      metadata: {
        organizationId: 'org_1',
      },
      current_period_end: expiredTimestamp,
      cancel_at_period_end: false,
      customer: 'cus_123',
      items: {
        data: [
          {
            current_period_end: expiredTimestamp,
            price: {
              id: 'price_existing',
              metadata: { plan: 'PRO' },
            },
          },
        ],
      },
    } as unknown as Stripe.Subscription;

    await service.upsertStripeSubscription(subscription);

    expect(prisma.subscription.create).toHaveBeenCalled();
    expect(prisma.subscription.update).not.toHaveBeenCalled();
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      data: expect.objectContaining({ plan: Plan.FREE }),
    });
    expect(prisma.apiKey.updateMany).toHaveBeenCalled();
  });

  it('upsertStripeSubscription logs and skips when organization metadata missing', async () => {
    const subscription = {
      id: 'sub_no_org',
      status: 'active',
      metadata: {},
      customer: null,
      items: { data: [] },
    } as unknown as Stripe.Subscription;

    await service.upsertStripeSubscription(subscription);

    expect(
      loggerWarnSpy.mock.calls.some((call) =>
        call[0].includes('missing organization metadata'),
      ),
    ).toBe(true);
    expect(prisma.subscription.create).not.toHaveBeenCalled();
  });

  it('upsertStripeSubscription defaults status to active when missing', async () => {
    prisma.subscriptionPlan.findUnique.mockResolvedValue({
      plan: Plan.PRO,
    } as any);
    prisma.subscription.findUnique.mockResolvedValue(null);
    prisma.subscription.create.mockResolvedValue({ id: 'sub_created' });
    prisma.organization.update.mockResolvedValue({ id: 'org_1' });

    const subscription = {
      id: 'sub_default_status',
      metadata: { organizationId: 'org_1' },
      customer: 'cus_123',
      items: {
        data: [{ price: { id: 'price_pro', metadata: { plan: 'PRO' } } }],
      },
    } as unknown as Stripe.Subscription;

    await service.upsertStripeSubscription(subscription);

    const createArgs = prisma.subscription.create.mock.calls[0][0];
    expect(createArgs.data.status).toBe('active');
  });

  it('upsertStripeSubscription uses current period fallback when undefined', async () => {
    prisma.subscriptionPlan.findUnique.mockResolvedValue({
      plan: Plan.PRO,
    } as any);
    prisma.subscription.findUnique.mockResolvedValue({ id: 'existing' });
    prisma.organization.update.mockResolvedValue({ id: 'org_1' });

    const subscription = {
      id: 'sub_no_period',
      status: 'active',
      metadata: { organizationId: 'org_1' },
      customer: 'cus_123',
      items: {
        data: [{ price: { id: 'price_existing', metadata: { plan: 'PRO' } } }],
      },
    } as unknown as Stripe.Subscription;

    await service.upsertStripeSubscription(subscription);

    const updateArgs = prisma.subscription.update.mock.calls[0][0];
    expect(updateArgs.data.currentPeriodEnd).toBeInstanceOf(Date);
  });

  it('upsertStripeSubscription updates existing subscription when present', async () => {
    prisma.subscriptionPlan.findUnique.mockResolvedValue({
      plan: Plan.PRO,
    } as any);
    prisma.subscription.findUnique.mockResolvedValue({ id: 'existing' });
    prisma.organization.update.mockResolvedValue({ id: 'org_1' });

    const subscription = {
      id: 'sub_123',
      status: 'active',
      metadata: {
        organizationId: 'org_1',
      },
      current_period_end: Math.floor(Date.now() / 1000) + 3600,
      cancel_at_period_end: false,
      customer: {
        id: 'cus_123',
        metadata: { organizationId: 'org_1' },
      },
      items: {
        data: [
          {
            price: { id: 'price_existing', metadata: { plan: 'PRO' } },
          },
        ],
      },
    } as unknown as Stripe.Subscription;

    await service.upsertStripeSubscription(subscription);

    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { providerSubId: 'sub_123' },
      data: expect.objectContaining({
        status: 'active',
        plan: Plan.PRO,
        deletedAt: null,
      }),
    });
    expect(prisma.apiKey.findMany).not.toHaveBeenCalled();
  });

  it('resolvePlanFromPrice falls back to FREE when plan is unknown', async () => {
    prisma.subscriptionPlan.findUnique.mockResolvedValue(null);

    const plan = await (service as any).resolvePlanFromPrice('price_unknown');

    expect(
      loggerWarnSpy.mock.calls.some((call) =>
        call[0].includes('No matching subscription plan'),
      ),
    ).toBe(true);
    expect(plan).toBe(Plan.FREE);
  });

  it('resolvePlanFromPrice defaults to FREE when price id missing', async () => {
    const plan = await (service as any).resolvePlanFromPrice(undefined);
    expect(plan).toBe(Plan.FREE);
  });

  it('resolveOrganizationId returns undefined when customer missing', async () => {
    const subscription = { metadata: {}, customer: null } as any;
    expect(
      await (service as any).resolveOrganizationId(subscription),
    ).toBeUndefined();
  });

  it('resolveOrganizationId returns undefined when expanded customer deleted', async () => {
    const subscription = { metadata: {}, customer: { deleted: true } } as any;
    expect(
      await (service as any).resolveOrganizationId(subscription),
    ).toBeUndefined();
  });

  it('resolveOrganizationId handles metadata, string, and expanded customers', async () => {
    let subscription: any = { metadata: { organizationId: 'org_meta' } };
    expect(await (service as any).resolveOrganizationId(subscription)).toBe(
      'org_meta',
    );

    stripe.customers.retrieve.mockResolvedValue({
      id: 'cus_123',
      deleted: false,
      metadata: { organizationId: 'org_customer' },
    });
    subscription = { metadata: {}, customer: 'cus_123' };
    expect(await (service as any).resolveOrganizationId(subscription)).toBe(
      'org_customer',
    );

    stripe.customers.retrieve.mockResolvedValue({ deleted: true });
    expect(
      await (service as any).resolveOrganizationId({
        metadata: {},
        customer: 'cus_deleted',
      }),
    ).toBeUndefined();

    subscription = {
      metadata: {},
      customer: {
        id: 'cus_expanded',
        deleted: false,
        metadata: { organizationId: 'org_expanded' },
      },
    };
    expect(await (service as any).resolveOrganizationId(subscription)).toBe(
      'org_expanded',
    );
  });

  it('removeStripeSubscription defaults status when undefined', async () => {
    prisma.subscription.updateMany.mockResolvedValue({ count: 1 });
    prisma.organization.update.mockResolvedValue({ id: 'org_1' });

    await service.removeStripeSubscription({
      id: 'sub_no_status',
      metadata: { organizationId: 'org_1' },
      items: { data: [] },
    } as any);

    const updateArgs = prisma.subscription.updateMany.mock.calls[0][0];
    expect(updateArgs.data.status).toBe('canceled');
  });

  it('removeStripeSubscription soft deletes subscription and resets plan', async () => {
    prisma.subscription.updateMany.mockResolvedValue({ count: 1 });
    prisma.organization.update.mockResolvedValue({ id: 'org_1' });

    const subscription = {
      id: 'sub_123',
      status: 'canceled',
      metadata: { organizationId: 'org_1' },
      items: { data: [] },
    } as any;

    await service.removeStripeSubscription(subscription);

    expect(prisma.subscription.updateMany).toHaveBeenCalled();
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: 'org_1' },
      data: { plan: Plan.FREE },
    });
  });

  it('removeStripeSubscription skips when organization id missing', async () => {
    await service.removeStripeSubscription({
      id: 'sub_missing_org',
      metadata: {},
      customer: null,
      items: { data: [] },
    } as any);

    expect(
      loggerWarnSpy.mock.calls.some((call) =>
        call[0].includes('missing organization metadata on delete event'),
      ),
    ).toBe(true);
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
  });

  it('enforcePlanLimits returns early when plan configuration missing', async () => {
    await (service as any).enforcePlanLimits('org_1', 'UNKNOWN' as Plan);
    expect(prisma.apiKey.findMany).not.toHaveBeenCalled();
  });

  it('enforcePlanLimits ignores unlimited plans', async () => {
    await (service as any).enforcePlanLimits('org_1', Plan.ENTERPRISE);
    expect(prisma.apiKey.findMany).not.toHaveBeenCalled();
  });

  it('enforcePlanLimits soft deletes excess keys when limit exceeded', async () => {
    prisma.apiKey.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    await (service as any).enforcePlanLimits('org_1', Plan.FREE);
    expect(prisma.apiKey.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'b'] } },
      data: { deletedAt: expect.any(Date) },
    });
  });

  it('getCurrentPeriodEnd uses subscription value before fallback', () => {
    const subscription = {
      current_period_end: 999,
      items: { data: [{ current_period_end: 123 }] },
    } as any;
    expect((service as any).getCurrentPeriodEnd(subscription)).toBe(999);

    delete subscription.current_period_end;
    expect((service as any).getCurrentPeriodEnd(subscription)).toBe(123);
  });

  it('extractPlanKey filters unsupported plan values', () => {
    const price = { metadata: { plan: 'pro' } } as any;
    const product = { metadata: {}, name: 'Pro' } as any;
    expect((service as any).extractPlanKey(price, product)).toBe(Plan.PRO);

    price.metadata.plan = 'unsupported';
    expect((service as any).extractPlanKey(price, product)).toBeUndefined();
  });

  it('fetchRecurringPrices aggregates Stripe pagination', async () => {
    stripe.prices.list
      .mockResolvedValueOnce({
        data: [{ id: 'price_1' }],
        has_more: true,
      })
      .mockResolvedValueOnce({
        data: [{ id: 'price_2' }],
        has_more: false,
      });

    const prices = await (service as any).fetchRecurringPrices(5);

    expect(prices.map((p: Stripe.Price) => p.id)).toEqual([
      'price_1',
      'price_2',
    ]);
  });

  it('fetchRecurringPrices stops on empty data even if has_more true', async () => {
    stripe.prices.list.mockResolvedValueOnce({
      data: [],
      has_more: true,
    });

    const prices = await (service as any).fetchRecurringPrices(5);
    expect(prices).toEqual([]);
  });

  it('extractCustomerId returns fallback when customer missing', () => {
    expect((service as any).extractCustomerId({ customer: null } as any)).toBe(
      'unknown',
    );
    expect(
      (service as any).extractCustomerId({ customer: 'cus_123' } as any),
    ).toBe('cus_123');
    expect(
      (service as any).extractCustomerId({
        customer: { id: 'cus_obj' },
      } as any),
    ).toBe('cus_obj');
  });

  it('resolveEffectivePlan returns FREE when period ended and cancel flag set', () => {
    const subscription = {
      status: 'active',
      cancel_at_period_end: true,
      items: {
        data: [
          {
            current_period_end: Math.floor(Date.now() / 1000) - 1,
          },
        ],
      },
    } as any;

    expect((service as any).resolveEffectivePlan(Plan.PRO, subscription)).toBe(
      Plan.FREE,
    );
  });

  it('resolveEffectivePlan preserves plan when subscription is active', () => {
    const subscription = {
      status: 'active',
      cancel_at_period_end: false,
      items: {
        data: [
          {
            current_period_end: Math.floor(Date.now() / 1000) + 10_000,
          },
        ],
      },
    } as any;

    expect((service as any).resolveEffectivePlan(Plan.PRO, subscription)).toBe(
      Plan.PRO,
    );
  });
});
