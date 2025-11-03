import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { WebhookController } from '../src/subscriptions/webhook/webhook.controller';
import { SubscriptionsWebhookService } from '../src/subscriptions/webhook/webhook.service';

describe('Subscriptions Webhook Controller (e2e)', () => {
  let app: INestApplication;
  let controller: WebhookController;
  const webhookServiceMock = {
    handleWebhook: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        {
          provide: SubscriptionsWebhookService,
          useValue: webhookServiceMock,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    controller = app.get(WebhookController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('delegates webhook handling to the service', async () => {
    const payload = { id: 'evt_1', type: 'customer.created' };

    const response = await controller.handle(
      { body: payload } as any,
      'signature',
    );

    expect(webhookServiceMock.handleWebhook).toHaveBeenCalledWith(
      payload,
      'signature',
    );
    expect(response).toEqual({ received: true });
  });
});
