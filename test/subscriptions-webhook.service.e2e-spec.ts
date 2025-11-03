import { HttpException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { SubscriptionsService } from 'src/subscriptions/subscriptions.service';
import { SubscriptionsWebhookService } from 'src/subscriptions/webhook/webhook.service';
import Stripe from 'stripe';

describe('SubscriptionsWebhookService (integration-like)', () => {
  let service: SubscriptionsWebhookService;
  let stripeMock: {
    webhooks: { constructEvent: jest.Mock };
    subscriptions: { retrieve: jest.Mock };
  };
  let paymentEventMock: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
  let prismaMock: PrismaService;
  let configMock: ConfigService;
  let subscriptionsServiceMock: SubscriptionsService;

  const payload = Buffer.from('{}');

  beforeEach(() => {
    stripeMock = {
      webhooks: { constructEvent: jest.fn() },
      subscriptions: { retrieve: jest.fn() },
    };

    paymentEventMock = {
      findUnique: jest.fn(),
      create: jest.fn(),
    };

    prismaMock = {
      paymentEvent: paymentEventMock,
    } as unknown as PrismaService;

    configMock = {
      get: jest.fn().mockReturnValue('wh_secret'),
    } as unknown as ConfigService;

    subscriptionsServiceMock = {
      upsertStripeSubscription: jest.fn(),
      removeStripeSubscription: jest.fn(),
    } as unknown as SubscriptionsService;

    jest.clearAllMocks();

    service = new SubscriptionsWebhookService(
      stripeMock as unknown as Stripe,
      prismaMock,
      configMock,
      subscriptionsServiceMock,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws when signature verification fails', async () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    stripeMock.webhooks.constructEvent.mockImplementation(() => {
      throw new Error('invalid signature');
    });

    await expect(service.handleWebhook(payload, 'sig')).rejects.toThrow(
      HttpException,
    );
    expect(errorSpy).toHaveBeenCalledWith(
      '⚠️ Stripe signature verification failed:',
      expect.any(String),
    );
  });

  it('rejects when webhook secret is not configured', async () => {
    const stripeVariant = {
      webhooks: {
        constructEvent: jest
          .fn()
          .mockReturnValue({
            id: 'evt',
            type: 'invoice.created',
            data: { object: {} },
          }),
      },
      subscriptions: { retrieve: jest.fn() },
    };
    const noSecretService = new SubscriptionsWebhookService(
      stripeVariant as unknown as Stripe,
      prismaMock,
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
      subscriptionsServiceMock,
    );

    await expect(noSecretService.handleWebhook(payload, 'sig')).rejects.toThrow(
      HttpException,
    );
  });

  it('skips already handled events', async () => {
    const debugSpy = jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
    const event = {
      id: 'evt_1',
      type: 'customer.subscription.updated',
      data: { object: {} },
    } as unknown as Stripe.Event;
    stripeMock.webhooks.constructEvent.mockReturnValue(event);
    paymentEventMock.findUnique.mockResolvedValue({ id: 'existing' });

    await service.handleWebhook(payload, 'sig');

    expect(paymentEventMock.create).not.toHaveBeenCalled();
    expect(
      subscriptionsServiceMock.upsertStripeSubscription,
    ).not.toHaveBeenCalled();
    expect(debugSpy).toHaveBeenCalledWith(
      'Skipping duplicate webhook event evt_1',
    );
  });

  it('handles checkout session completion by retrieving subscription', async () => {
    const session = {
      subscription: 'sub_1',
    } as unknown as Stripe.Checkout.Session;
    const retrievedSubscription = { id: 'sub_1' } as Stripe.Subscription;
    const event = {
      id: 'evt_checkout',
      type: 'checkout.session.completed',
      data: { object: session },
    } as unknown as Stripe.Event;

    stripeMock.webhooks.constructEvent.mockReturnValue(event);
    paymentEventMock.findUnique.mockResolvedValue(null);
    paymentEventMock.create.mockResolvedValue({ id: 'created' });
    stripeMock.subscriptions.retrieve.mockResolvedValue(retrievedSubscription);

    await service.handleWebhook(payload, 'sig');

    expect(stripeMock.subscriptions.retrieve).toHaveBeenCalledWith('sub_1', {
      expand: ['items.data.price.product', 'customer'],
    });
    expect(
      subscriptionsServiceMock.upsertStripeSubscription,
    ).toHaveBeenCalledWith(retrievedSubscription);
  });

  it('warns when checkout session lacks subscription reference', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const session = {
      subscription: null,
    } as unknown as Stripe.Checkout.Session;
    const event = {
      id: 'evt_checkout_missing',
      type: 'checkout.session.completed',
      data: { object: session },
    } as unknown as Stripe.Event;

    stripeMock.webhooks.constructEvent.mockReturnValue(event);
    paymentEventMock.findUnique.mockResolvedValue(null);
    paymentEventMock.create.mockResolvedValue({ id: 'created' });

    await service.handleWebhook(payload, 'sig');

    expect(warnSpy).toHaveBeenCalledWith(
      'Received checkout session without subscription reference',
    );
    expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it('delegates subscription create/update events to upsert handler', async () => {
    const subscription = { id: 'sub_123' } as Stripe.Subscription;
    const event = {
      id: 'evt_sub',
      type: 'customer.subscription.created',
      data: { object: subscription },
    } as unknown as Stripe.Event;
    stripeMock.webhooks.constructEvent.mockReturnValue(event);
    paymentEventMock.findUnique.mockResolvedValue(null);
    paymentEventMock.create.mockResolvedValue({ id: 'created' });

    await service.handleWebhook(payload, 'sig');

    expect(
      subscriptionsServiceMock.upsertStripeSubscription,
    ).toHaveBeenCalledWith(subscription);
  });

  it('delegates subscription deletion to remove handler', async () => {
    const subscription = { id: 'sub_123' } as Stripe.Subscription;
    const event = {
      id: 'evt_delete',
      type: 'customer.subscription.deleted',
      data: { object: subscription },
    } as unknown as Stripe.Event;
    stripeMock.webhooks.constructEvent.mockReturnValue(event);
    paymentEventMock.findUnique.mockResolvedValue(null);
    paymentEventMock.create.mockResolvedValue({ id: 'created' });

    await service.handleWebhook(payload, 'sig');

    expect(
      subscriptionsServiceMock.removeStripeSubscription,
    ).toHaveBeenCalledWith(subscription);
  });

  it('logs unhandled event types without throwing', async () => {
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    const event = {
      id: 'evt_other',
      type: 'invoice.created',
      data: { object: {} },
    } as unknown as Stripe.Event;

    stripeMock.webhooks.constructEvent.mockReturnValue(event);
    paymentEventMock.findUnique.mockResolvedValue(null);
    paymentEventMock.create.mockResolvedValue({ id: 'created' });

    await service.handleWebhook(payload, 'sig');

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unhandled Stripe event type'),
    );
  });
});
