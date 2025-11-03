import { Test, TestingModule } from '@nestjs/testing';
import { WebhookController } from './webhook.controller';
import { SubscriptionsWebhookService } from './webhook.service';

describe('WebhookController', () => {
  let controller: WebhookController;
  let webhookService: { handleWebhook: jest.Mock };

  beforeEach(async () => {
    webhookService = { handleWebhook: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhookController],
      providers: [
        { provide: SubscriptionsWebhookService, useValue: webhookService },
      ],
    }).compile();

    controller = module.get(WebhookController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('delegates webhook handling to service', async () => {
    const req = { body: Buffer.from('payload') } as any;

    const result = await controller.handle(req, 'sig');

    expect(webhookService.handleWebhook).toHaveBeenCalledWith(req.body, 'sig');
    expect(result).toEqual({ received: true });
  });
});
