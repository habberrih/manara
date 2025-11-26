import { Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { SubscriptionsService } from 'src/subscriptions/subscriptions.service';
import Stripe from 'stripe';
import { Plan } from '../prisma/generated/enums';

type PrismaMock = {
  subscriptionPlan: {
    findUnique: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
  };
  subscription: {
    findUnique: jest.Mock;
    update: jest.Mock;
    create: jest.Mock;
    updateMany: jest.Mock;
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

const createPrismaMock = (): PrismaMock => {
  const prisma: PrismaMock = {
    subscriptionPlan: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    subscription: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    apiKey: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  prisma.$transaction.mockImplementation(async (handler: any) =>
    handler(prisma),
  );

  return prisma;
};

describe('SubscriptionsService (integration-like)', () => {
  let service: SubscriptionsService;
  let prisma: PrismaMock;
  let stripe: {
    customers: { create: jest.Mock; retrieve: jest.Mock };
    subscriptions: { retrieve: jest.Mock };
    prices: { list: jest.Mock };
  };
  let config: { get: jest.Mock };

  beforeEach(() => {
    prisma = createPrismaMock();
    stripe = {
      customers: { create: jest.fn(), retrieve: jest.fn() },
      subscriptions: { retrieve: jest.fn() },
      prices: { list: jest.fn() },
    };
    config = {
      get: jest.fn((key: string) => {
        if (key === 'STRIPE_DEFAULT_CURRENCY') return 'eur';
        return undefined;
      }),
    };

    service = new SubscriptionsService(
      stripe as unknown as Stripe,
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('syncPlans', () => {
    it('creates and updates plans and deactivates missing ones', async () => {
      jest.spyOn(service as any, 'fetchRecurringPrices').mockResolvedValue([
        {
          id: 'price_new',
          active: true,
          unit_amount: 500,
          currency: 'usd',
          recurring: { interval: 'month' },
          metadata: { plan: 'pro' },
          nickname: 'Pro',
          product: {
            id: 'prod_1',
            metadata: { plan: 'pro' },
            name: 'Pro Plan',
          },
        } as unknown as Stripe.Price,
        {
          id: 'price_existing',
          active: true,
          unit_amount: 1000,
          currency: 'usd',
          recurring: { interval: 'year' },
          metadata: {},
          nickname: 'Enterprise',
          product: {
            id: 'prod_2',
            metadata: { plan: 'enterprise' },
            name: 'Enterprise Plan',
          },
        } as unknown as Stripe.Price,
      ]);

      prisma.subscriptionPlan.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'plan-existing' });
      prisma.subscriptionPlan.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.syncPlans({ limit: 50 });

      expect(prisma.subscriptionPlan.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          stripePriceId: 'price_new',
          plan: 'PRO',
          amountCents: 500,
          currency: 'usd',
        }),
      });
      expect(prisma.subscriptionPlan.update).toHaveBeenCalledWith({
        where: { stripePriceId: 'price_existing' },
        data: expect.objectContaining({
          plan: 'ENTERPRISE',
          interval: 'year',
        }),
      });
      expect(result).toEqual({ created: 1, updated: 1, deactivated: 1 });
    });

    it('skips prices without plan metadata', async () => {
      jest.spyOn(service as any, 'fetchRecurringPrices').mockResolvedValue([
        {
          id: 'price_incomplete',
          active: true,
          product: { id: 'prod', metadata: {} },
          metadata: {},
        } as unknown as Stripe.Price,
      ]);

      prisma.subscriptionPlan.updateMany.mockResolvedValue({ count: 0 });
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      const result = await service.syncPlans();

      expect(result).toEqual({ created: 0, updated: 0, deactivated: 0 });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('missing plan metadata'),
      );
    });

    it('ignores inactive prices and those without product references', async () => {
      jest.spyOn(service as any, 'fetchRecurringPrices').mockResolvedValue([
        {
          id: 'price_inactive',
          active: false,
        } as unknown as Stripe.Price,
        {
          id: 'price_missing_product',
          active: true,
          product: null,
        } as unknown as Stripe.Price,
      ]);

      prisma.subscriptionPlan.updateMany.mockResolvedValue({ count: 0 });

      const summary = await service.syncPlans();

      expect(prisma.subscriptionPlan.create).not.toHaveBeenCalled();
      expect(summary).toEqual({ created: 0, updated: 0, deactivated: 0 });
    });
  });

  it('defaults currency to usd when configuration missing', async () => {
    const localPrisma = createPrismaMock();
    const localService = new SubscriptionsService(
      stripe as unknown as Stripe,
      localPrisma as unknown as PrismaService,
      {
        get: jest.fn().mockReturnValue(undefined),
      } as unknown as ConfigService,
    );

    jest.spyOn(localService as any, 'fetchRecurringPrices').mockResolvedValue([
      {
        id: 'price_default_currency',
        active: true,
        unit_amount: undefined,
        currency: undefined,
        metadata: { plan: 'pro' },
        product: {
          id: 'prod_default',
          metadata: { plan: 'pro' },
        },
      } as unknown as Stripe.Price,
    ]);

    localPrisma.subscriptionPlan.findUnique.mockResolvedValue(null);
    localPrisma.subscriptionPlan.updateMany.mockResolvedValue({ count: 0 });

    await localService.syncPlans();

    expect(localPrisma.subscriptionPlan.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ currency: 'usd' }),
    });
  });

  describe('ensureCustomer', () => {
    it('returns existing customer id', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        stripeCustomerId: 'cus_123',
      });

      const result = await service.ensureCustomer('org-1');
      expect(result).toBe('cus_123');
      expect(stripe.customers.create).not.toHaveBeenCalled();
    });

    it('creates customer when absent', async () => {
      prisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        name: 'Acme',
        slug: 'acme',
        stripeCustomerId: null,
      });
      stripe.customers.create.mockResolvedValue({ id: 'cus_new' });

      const result = await service.ensureCustomer('org-1');

      expect(stripe.customers.create).toHaveBeenCalledWith({
        name: 'Acme',
        metadata: { organizationId: 'org-1', slug: 'acme' },
      });
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { stripeCustomerId: 'cus_new' },
      });
      expect(result).toBe('cus_new');
    });

    it('throws when organization missing', async () => {
      prisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.ensureCustomer('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('upsertStripeSubscription', () => {
    const baseSubscription = {
      id: 'sub_1',
      status: 'active',
      metadata: {},
      items: { data: [{ price: { id: 'price_1' }, current_period_end: 1700 }] },
      customer: 'cus_1',
    } as unknown as Stripe.Subscription;

    beforeEach(() => {
      prisma.subscription.findUnique.mockResolvedValue(null);
      prisma.subscription.create.mockResolvedValue({});
      prisma.organization.update.mockResolvedValue({});
    });

    it('creates new subscription record and updates organization plan', async () => {
      jest
        .spyOn(service as any, 'resolveOrganizationId')
        .mockResolvedValue('org-1');
      jest
        .spyOn(service as any, 'resolvePlanFromPrice')
        .mockResolvedValue(Plan.PRO);
      jest
        .spyOn(service as any, 'resolveEffectivePlan')
        .mockReturnValue(Plan.PRO);
      jest.spyOn(service as any, 'extractCustomerId').mockReturnValue('cus_1');
      jest.spyOn(service as any, 'getCurrentPeriodEnd').mockReturnValue(1700);
      const enforceSpy = jest
        .spyOn(service as any, 'enforcePlanLimits')
        .mockResolvedValue(undefined);

      await service.upsertStripeSubscription(baseSubscription);

      expect(prisma.subscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: 'org-1',
          providerSubId: 'sub_1',
          plan: Plan.PRO,
        }),
      });
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: expect.objectContaining({
          plan: Plan.PRO,
          stripeCustomerId: 'cus_1',
        }),
      });
      expect(enforceSpy).not.toHaveBeenCalled();
    });

    it('updates existing subscription and enforces limits when plan becomes FREE', async () => {
      prisma.subscription.findUnique.mockResolvedValue({ id: 'sub_1' });
      jest
        .spyOn(service as any, 'resolveOrganizationId')
        .mockResolvedValue('org-1');
      jest
        .spyOn(service as any, 'resolvePlanFromPrice')
        .mockResolvedValue(Plan.PRO);
      jest
        .spyOn(service as any, 'resolveEffectivePlan')
        .mockReturnValue(Plan.FREE);
      jest.spyOn(service as any, 'extractCustomerId').mockReturnValue('cus_1');
      jest
        .spyOn(service as any, 'getCurrentPeriodEnd')
        .mockReturnValue(undefined);
      const enforceSpy = jest
        .spyOn(service as any, 'enforcePlanLimits')
        .mockResolvedValue(undefined);

      await service.upsertStripeSubscription(baseSubscription);

      expect(prisma.subscription.update).toHaveBeenCalledWith({
        where: { providerSubId: 'sub_1' },
        data: expect.objectContaining({
          status: 'active',
          deletedAt: null,
        }),
      });
      expect(enforceSpy).toHaveBeenCalledWith('org-1', Plan.FREE);
    });

    it('skips when organization metadata missing', async () => {
      jest
        .spyOn(service as any, 'resolveOrganizationId')
        .mockResolvedValue(undefined);
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      await service.upsertStripeSubscription(baseSubscription);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('missing organization metadata'),
      );
      expect(prisma.subscription.create).not.toHaveBeenCalled();
    });

    it('defaults subscription status to active when missing', async () => {
      const subscription = {
        id: 'sub-no-status',
        status: undefined,
        metadata: {},
        items: { data: [{ price: { id: 'price_1' }, current_period_end: 0 }] },
        customer: 'cus_1',
      } as unknown as Stripe.Subscription;

      jest
        .spyOn(service as any, 'resolveOrganizationId')
        .mockResolvedValue('org-1');
      jest
        .spyOn(service as any, 'resolvePlanFromPrice')
        .mockResolvedValue(Plan.PRO);
      jest
        .spyOn(service as any, 'resolveEffectivePlan')
        .mockReturnValue(Plan.PRO);
      jest.spyOn(service as any, 'extractCustomerId').mockReturnValue('cus_1');
      jest
        .spyOn(service as any, 'getCurrentPeriodEnd')
        .mockReturnValue(undefined);
      jest
        .spyOn(service as any, 'enforcePlanLimits')
        .mockResolvedValue(undefined);

      await service.upsertStripeSubscription(subscription);

      expect(prisma.subscription.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'active' }),
      });
    });
  });

  describe('removeStripeSubscription', () => {
    const subscription = {
      id: 'sub_1',
      customer: 'cus_1',
      metadata: { organizationId: 'org-1' },
      status: 'canceled',
    } as unknown as Stripe.Subscription;

    it('marks subscriptions deleted and enforces limits', async () => {
      jest
        .spyOn(service as any, 'resolveOrganizationId')
        .mockResolvedValue('org-1');
      const enforceSpy = jest
        .spyOn(service as any, 'enforcePlanLimits')
        .mockResolvedValue(undefined);

      await service.removeStripeSubscription(subscription);

      expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
        where: { providerSubId: 'sub_1' },
        data: expect.objectContaining({
          status: 'canceled',
          deletedAt: expect.any(Date),
        }),
      });
      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { plan: Plan.FREE },
      });
      expect(enforceSpy).toHaveBeenCalledWith('org-1', Plan.FREE);
    });

    it('logs warning when organization cannot be resolved', async () => {
      jest
        .spyOn(service as any, 'resolveOrganizationId')
        .mockResolvedValue(undefined);
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      await service.removeStripeSubscription(subscription);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('missing organization metadata'),
      );
      expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
    });

    it('defaults removal status to canceled when missing', async () => {
      jest
        .spyOn(service as any, 'resolveOrganizationId')
        .mockResolvedValue('org-1');
      const enforceSpy = jest
        .spyOn(service as any, 'enforcePlanLimits')
        .mockResolvedValue(undefined);

      await service.removeStripeSubscription({
        id: 'sub-no-status',
        metadata: { organizationId: 'org-1' },
        status: undefined,
      } as unknown as Stripe.Subscription);

      expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
        where: { providerSubId: 'sub-no-status' },
        data: expect.objectContaining({ status: 'canceled' }),
      });
      expect(enforceSpy).toHaveBeenCalledWith('org-1', Plan.FREE);
    });
  });

  describe('resolvePlanFromPrice', () => {
    it('returns FREE when price id undefined', async () => {
      await expect(
        (service as any).resolvePlanFromPrice(undefined),
      ).resolves.toBe(Plan.FREE);
    });

    it('returns stored plan when found', async () => {
      prisma.subscriptionPlan.findUnique.mockResolvedValue({
        plan: Plan.PRO,
      });

      await expect(
        (service as any).resolvePlanFromPrice('price_1'),
      ).resolves.toBe(Plan.PRO);
    });

    it('falls back to FREE and logs when plan missing', async () => {
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      prisma.subscriptionPlan.findUnique.mockResolvedValue(null);

      await expect(
        (service as any).resolvePlanFromPrice('price_unknown'),
      ).resolves.toBe(Plan.FREE);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('No matching subscription plan'),
      );
    });
  });

  describe('resolveOrganizationId', () => {
    it('prefers metadata field', async () => {
      const id = await (service as any).resolveOrganizationId({
        metadata: { organizationId: 'org-meta' },
        customer: null,
      });
      expect(id).toBe('org-meta');
    });

    it('handles string customer lookup', async () => {
      stripe.customers.retrieve.mockResolvedValue({
        metadata: { organizationId: 'org-customer' },
      });
      const id = await (service as any).resolveOrganizationId({
        metadata: {},
        customer: 'cus_123',
      } as unknown as Stripe.Subscription);
      expect(id).toBe('org-customer');
    });

    it('returns undefined for deleted customer object', async () => {
      const id = await (service as any).resolveOrganizationId({
        metadata: {},
        customer: { deleted: true },
      } as unknown as Stripe.Subscription);
      expect(id).toBeUndefined();
    });

    it('returns undefined when customer is absent', async () => {
      const id = await (service as any).resolveOrganizationId({
        metadata: {},
        customer: undefined,
      } as unknown as Stripe.Subscription);
      expect(id).toBeUndefined();
    });

    it('returns undefined when retrieved customer is deleted', async () => {
      stripe.customers.retrieve.mockResolvedValue({ deleted: true });
      const id = await (service as any).resolveOrganizationId({
        metadata: {},
        customer: 'cus_del',
      } as unknown as Stripe.Subscription);
      expect(id).toBeUndefined();
    });

    it('extracts metadata from expanded customer object', async () => {
      const id = await (service as any).resolveOrganizationId({
        metadata: {},
        customer: {
          deleted: false,
          metadata: { organizationId: 'org-expanded' },
        },
      } as unknown as Stripe.Subscription);
      expect(id).toBe('org-expanded');
    });
  });

  describe('extractCustomerId', () => {
    it('derives id from different representations', () => {
      expect(
        (service as any).extractCustomerId({
          customer: 'cus_1',
        } as unknown as Stripe.Subscription),
      ).toBe('cus_1');
      expect(
        (service as any).extractCustomerId({
          customer: { id: 'cus_2' },
        } as unknown as Stripe.Subscription),
      ).toBe('cus_2');
      expect(
        (service as any).extractCustomerId({
          customer: undefined,
        } as unknown as Stripe.Subscription),
      ).toBe('unknown');
    });
  });

  describe('resolveEffectivePlan', () => {
    it('returns FREE when subscription is canceled and period lapsed', () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(2000);
      const result = (service as any).resolveEffectivePlan(Plan.PRO, {
        status: 'canceled',
        cancel_at_period_end: true,
        items: { data: [] },
      } as unknown as Stripe.Subscription);
      expect(result).toBe(Plan.FREE);
      nowSpy.mockRestore();
    });

    it('preserves plan for active subscription', () => {
      const result = (service as any).resolveEffectivePlan(Plan.PRO, {
        status: 'active',
        cancel_at_period_end: false,
        items: { data: [] },
      } as unknown as Stripe.Subscription);
      expect(result).toBe(Plan.PRO);
    });

    it('downgrades past-due subscriptions when period elapsed', () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(2_000);
      jest.spyOn(service as any, 'getCurrentPeriodEnd').mockReturnValue(1);
      const result = (service as any).resolveEffectivePlan(Plan.PRO, {
        status: 'past_due',
        cancel_at_period_end: false,
        items: { data: [] },
      } as unknown as Stripe.Subscription);
      expect(result).toBe(Plan.FREE);
      nowSpy.mockRestore();
    });

    it('downgrades cancel-at-period-end subscriptions after expiry', () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(3_000);
      jest.spyOn(service as any, 'getCurrentPeriodEnd').mockReturnValue(1);
      const result = (service as any).resolveEffectivePlan(Plan.PRO, {
        status: 'active',
        cancel_at_period_end: true,
        items: { data: [] },
      } as unknown as Stripe.Subscription);
      expect(result).toBe(Plan.FREE);
      nowSpy.mockRestore();
    });
  });

  describe('enforcePlanLimits', () => {
    it('marks excess API keys as deleted according to plan limit', async () => {
      prisma.apiKey.findMany.mockResolvedValue([
        { id: 'key-1' },
        { id: 'key-2' },
      ]);

      await (service as any).enforcePlanLimits('org-1', Plan.FREE);

      expect(prisma.apiKey.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', deletedAt: null },
        orderBy: { createdAt: 'desc' },
        skip: expect.any(Number),
      });
      expect(prisma.apiKey.updateMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['key-1', 'key-2'] },
        },
        data: { deletedAt: expect.any(Date) },
      });
    });

    it('returns when plan has no limits', async () => {
      prisma.apiKey.findMany.mockResolvedValue([]);
      await (service as any).enforcePlanLimits('org-1', Plan.ENTERPRISE);
      expect(prisma.apiKey.updateMany).not.toHaveBeenCalled();
    });

    it('returns immediately when plan configuration missing', async () => {
      await (service as any).enforcePlanLimits(
        'org-1',
        'UNKNOWN' as unknown as Plan,
      );
      expect(prisma.apiKey.findMany).not.toHaveBeenCalled();
    });
  });

  describe('getCurrentPeriodEnd', () => {
    it('prefers subscription-level field', () => {
      const value = (service as any).getCurrentPeriodEnd({
        current_period_end: 1234,
        items: { data: [] },
      } as unknown as Stripe.Subscription);
      expect(value).toBe(1234);
    });

    it('falls back to first item', () => {
      const value = (service as any).getCurrentPeriodEnd({
        items: { data: [{ current_period_end: 5678 }] },
      } as unknown as Stripe.Subscription);
      expect(value).toBe(5678);
    });
  });

  describe('extractPlanKey', () => {
    it('extracts plan from price metadata and validates support', () => {
      const key = (service as any).extractPlanKey(
        {
          metadata: { plan: 'pro' },
        } as unknown as Stripe.Price,
        { metadata: {} } as Stripe.Product,
      );
      expect(key).toBe(Plan.PRO);
    });

    it('returns undefined for unsupported plan', () => {
      const key = (service as any).extractPlanKey(
        {
          metadata: { plan: 'unsupported' },
        } as unknown as Stripe.Price,
        { metadata: {} } as Stripe.Product,
      );
      expect(key).toBeUndefined();
    });
  });

  describe('fetchRecurringPrices', () => {
    it('paginates through Stripe API until exhausted', async () => {
      stripe.prices.list
        .mockResolvedValueOnce({
          data: [{ id: 'price_1' }],
          has_more: true,
        })
        .mockResolvedValueOnce({
          data: [{ id: 'price_2' }],
          has_more: false,
        });

      const prices = await (service as any).fetchRecurringPrices(2);

      expect(stripe.prices.list).toHaveBeenNthCalledWith(1, {
        active: true,
        type: 'recurring',
        expand: ['data.product'],
        limit: 2,
      });
      expect(stripe.prices.list).toHaveBeenNthCalledWith(2, {
        active: true,
        type: 'recurring',
        expand: ['data.product'],
        limit: 2,
        starting_after: 'price_1',
      });
      expect(prices.map((p: any) => p.id)).toEqual(['price_1', 'price_2']);
    });
  });
});
