import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import Stripe from 'stripe';
import { Prisma } from '../../../prisma/generated/client';
import {
  STRIPE_CLIENT,
  SUBSCRIPTION_WEBHOOK_SECRET_KEY,
} from '../subscriptions.constants';
import { SubscriptionsService } from '../subscriptions.service';

@Injectable()
export class SubscriptionsWebhookService {
  private readonly logger = new Logger(SubscriptionsWebhookService.name);
  private readonly webhookSecret?: string;

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {
    this.webhookSecret = this.configService.get<string>(
      SUBSCRIPTION_WEBHOOK_SECRET_KEY,
    );
  }

  async handleWebhook(payload: Buffer, signature?: string): Promise<void> {
    const event = this.parseEvent(payload, signature);

    if (!event) {
      throw new HttpException(
        `Stripe signature verification failed`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const alreadyHandled = await this.prisma.paymentEvent.findUnique({
      where: { providerEventId: event.id },
    });

    if (alreadyHandled) {
      this.logger.debug(`Skipping duplicate webhook event ${event.id}`);
      return;
    }

    const eventPayload = event.data.object as unknown as Prisma.InputJsonValue;

    await this.prisma.paymentEvent.create({
      data: {
        provider: 'stripe',
        providerEventId: event.id,
        type: event.type,
        payload: eventPayload,
      },
    });

    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSession(
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.subscriptionsService.upsertStripeSubscription(
          event.data.object as Stripe.Subscription,
        );
        break;
      case 'customer.subscription.deleted':
        await this.subscriptionsService.removeStripeSubscription(
          event.data.object as Stripe.Subscription,
        );
        break;
      default:
        this.logger.log(`Unhandled Stripe event type ${event.type}`);
    }
  }

  private parseEvent(payload: Buffer, signature?: string): Stripe.Event | null {
    if (this.webhookSecret && signature) {
      try {
        return this.stripe.webhooks.constructEvent(
          payload,
          signature,
          this.webhookSecret,
        );
      } catch (error) {
        this.logger.error(
          '⚠️ Stripe signature verification failed:',
          error.message,
        );
      }
    }

    return null;
  }

  private async handleCheckoutSession(
    session: Stripe.Checkout.Session,
  ): Promise<void> {
    if (!session.subscription) {
      this.logger.warn(
        'Received checkout session without subscription reference',
      );
      return;
    }

    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription.id;

    const subscription = await this.stripe.subscriptions.retrieve(
      subscriptionId,
      {
        expand: ['items.data.price.product', 'customer'],
      },
    );

    await this.subscriptionsService.upsertStripeSubscription(subscription);
  }
}
