import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OrganizationMemberGuard } from 'src/common';
import { PrismaModule } from 'src/prisma/prisma.module';
import Stripe from 'stripe';
import { PlanLimitGuard } from './guards/plan-limit.guard';
import { STRIPE_CLIENT } from './subscriptions.constants';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { WebhookController } from './webhook/webhook.controller';
import { SubscriptionsWebhookService } from './webhook/webhook.service';

@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [SubscriptionsController, WebhookController],
  providers: [
    SubscriptionsService,
    SubscriptionsWebhookService,
    OrganizationMemberGuard,
    PlanLimitGuard,
    {
      provide: STRIPE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const apiKey = config.get<string>('STRIPE_SECRET_KEY');

        if (!apiKey) {
          throw new Error('Missing STRIPE_SECRET_KEY configuration');
        }

        return new Stripe(apiKey, {
          maxNetworkRetries: 2,
        });
      },
    },
  ],
  exports: [SubscriptionsService, STRIPE_CLIENT, PlanLimitGuard],
})
export class SubscriptionsModule {}
