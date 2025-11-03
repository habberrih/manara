import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from 'src/common';
import { SubscriptionsWebhookService } from './webhook.service';

@ApiExcludeController()
@Controller({
  path: 'subscriptions/webhook',
  version: '1',
})
export class WebhookController {
  constructor(private readonly webhookService: SubscriptionsWebhookService) {}

  @Post()
  @HttpCode(200)
  @Public()
  async handle(
    @Req() req: Request,
    @Headers('stripe-signature') signature?: string,
  ): Promise<{ received: boolean }> {
    const { body } = req;
    await this.webhookService.handleWebhook(body, signature);
    return { received: true };
  }
}
