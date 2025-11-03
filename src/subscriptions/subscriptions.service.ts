import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Plan } from '@prisma/client';
import { PrismaService } from 'src/prisma/prisma.service';
import Stripe from 'stripe';
import { PLAN_LIMITS } from './plan-limits';
import { STRIPE_CLIENT } from './subscriptions.constants';
import { PlanSyncOptions, SyncSummary } from './types';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);
  private readonly defaultCurrency: string;

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.defaultCurrency =
      this.configService.get<string>('STRIPE_DEFAULT_CURRENCY') ?? 'usd';
  }

  async syncPlans(options: PlanSyncOptions = {}): Promise<SyncSummary> {
    const pageSize = Math.max(1, Math.min(options.limit ?? 100, 100));
    const prices = await this.fetchRecurringPrices(pageSize);
    const seenPriceIds = new Set<string>();
    let created = 0;
    let updated = 0;

    let deactivated = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const price of prices) {
        if (!price.active) continue;
        if (!('product' in price) || price.product === null) continue;
        const product = price.product as Stripe.Product;

        const planKey = this.extractPlanKey(price, product);
        if (!planKey) {
          this.logger.warn(
            `Skipping Stripe price ${price.id} - missing plan metadata`,
          );
          continue;
        }

        seenPriceIds.add(price.id);
        const amount = price.unit_amount ?? 0;
        const existing = await tx.subscriptionPlan.findUnique({
          where: { stripePriceId: price.id },
        });

        const payload = {
          plan: planKey,
          stripeProductId: product.id,
          nickname: price.nickname ?? product.name ?? planKey,
          interval: price.recurring?.interval ?? 'month',
          amountCents: amount,
          currency: price.currency ?? this.defaultCurrency,
          active: price.active,
          metadata: price.metadata,
        };

        if (existing) {
          await tx.subscriptionPlan.update({
            where: { stripePriceId: price.id },
            data: payload,
          });
          updated += 1;
        } else {
          await tx.subscriptionPlan.create({
            data: {
              ...payload,
              stripePriceId: price.id,
            },
          });
          created += 1;
        }
      }

      const result = await tx.subscriptionPlan.updateMany({
        where: {
          stripePriceId: {
            notIn: Array.from(seenPriceIds),
          },
        },
        data: { active: false },
      });
      deactivated = result.count;
    });

    return { created, updated, deactivated };
  }

  async ensureCustomer(organizationId: string): Promise<string> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    if (organization.stripeCustomerId) {
      return organization.stripeCustomerId;
    }

    const customer = await this.stripe.customers.create({
      name: organization.name,
      metadata: {
        organizationId,
        slug: organization.slug,
      },
    });

    await this.prisma.organization.update({
      where: { id: organizationId },
      data: { stripeCustomerId: customer.id },
    });

    return customer.id;
  }

  async upsertStripeSubscription(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const organizationId = await this.resolveOrganizationId(subscription);
    if (!organizationId) {
      this.logger.warn(
        `Subscription ${subscription.id} missing organization metadata. Skipping sync`,
      );
      return;
    }

    const priceId = subscription.items.data[0]?.price?.id;
    const plan = await this.resolvePlanFromPrice(priceId);
    const effectivePlan = this.resolveEffectivePlan(plan, subscription);

    const customerId = this.extractCustomerId(subscription);
    const currentPeriodEndUnix = this.getCurrentPeriodEnd(subscription);
    const currentPeriodEnd = currentPeriodEndUnix
      ? new Date(currentPeriodEndUnix * 1000)
      : new Date();

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.subscription.findUnique({
        where: { providerSubId: subscription.id },
      });

      const data = {
        organizationId,
        provider: 'stripe',
        providerCustomerId: customerId,
        status: subscription.status ?? 'active',
        plan,
        currentPeriodEnd,
      };

      if (current) {
        await tx.subscription.update({
          where: { providerSubId: subscription.id },
          data: {
            status: data.status,
            plan: data.plan,
            currentPeriodEnd: data.currentPeriodEnd,
            providerCustomerId: data.providerCustomerId,
            deletedAt: null,
          },
        });
      } else {
        await tx.subscription.create({
          data: {
            ...data,
            providerSubId: subscription.id,
          },
        });
      }

      await tx.organization.update({
        where: { id: organizationId },
        data: {
          plan: effectivePlan,
          stripeCustomerId: customerId,
        },
      });
    });

    if (effectivePlan === Plan.FREE) {
      await this.enforcePlanLimits(organizationId, effectivePlan);
    }
  }

  async removeStripeSubscription(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const organizationId = await this.resolveOrganizationId(subscription);
    if (!organizationId) {
      this.logger.warn(
        `Subscription ${subscription.id} missing organization metadata on delete event.`,
      );
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.subscription.updateMany({
        where: { providerSubId: subscription.id },
        data: {
          status: subscription.status ?? 'canceled',
          deletedAt: new Date(),
        },
      });

      await tx.organization.update({
        where: { id: organizationId },
        data: {
          plan: Plan.FREE,
        },
      });
    });

    await this.enforcePlanLimits(organizationId, Plan.FREE);
  }

  private async resolvePlanFromPrice(stripePriceId?: string): Promise<Plan> {
    if (!stripePriceId) {
      return Plan.FREE;
    }

    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { stripePriceId },
    });

    if (!plan) {
      this.logger.warn(
        `No matching subscription plan found for price ${stripePriceId}. Falling back to FREE plan`,
      );
      return Plan.FREE;
    }

    return plan.plan;
  }

  private async resolveOrganizationId(
    subscription: Stripe.Subscription,
  ): Promise<string | undefined> {
    const fromMetadata = subscription.metadata?.organizationId;
    if (fromMetadata) {
      return fromMetadata;
    }

    const customer = subscription.customer;
    if (!customer) {
      return undefined;
    }

    if (typeof customer === 'string') {
      const record = await this.stripe.customers.retrieve(customer);
      if (!record || record.deleted) {
        return undefined;
      }
      return record.metadata?.organizationId;
    }

    if (customer.deleted) {
      return undefined;
    }

    return customer.metadata?.organizationId;
  }

  private extractCustomerId(subscription: Stripe.Subscription): string {
    const customer = subscription.customer;
    if (!customer) {
      return 'unknown';
    }

    return typeof customer === 'string' ? customer : customer.id;
  }

  private resolveEffectivePlan(
    plan: Plan,
    subscription: Stripe.Subscription,
  ): Plan {
    const status = subscription.status;
    const periodEndUnix = this.getCurrentPeriodEnd(subscription);
    const periodEnd = periodEndUnix ? periodEndUnix * 1000 : undefined;
    const now = Date.now();

    const isLapsed =
      status === 'canceled' ||
      status === 'incomplete_expired' ||
      status === 'unpaid' ||
      (status === 'past_due' && periodEnd !== undefined && periodEnd < now) ||
      (subscription.cancel_at_period_end === true &&
        periodEnd !== undefined &&
        periodEnd < now);

    return isLapsed ? Plan.FREE : plan;
  }

  private async enforcePlanLimits(
    organizationId: string,
    plan: Plan,
  ): Promise<void> {
    const limits = PLAN_LIMITS[plan];
    if (!limits) {
      return;
    }

    const apiKeyLimit = limits.apiKeys;
    if (typeof apiKeyLimit === 'number') {
      const excessKeys = await this.prisma.apiKey.findMany({
        where: {
          organizationId,
          deletedAt: null,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: apiKeyLimit,
      });

      if (excessKeys.length > 0) {
        await this.prisma.apiKey.updateMany({
          where: {
            id: {
              in: excessKeys.map((key) => key.id),
            },
          },
          data: {
            deletedAt: new Date(),
          },
        });
      }
    }
  }

  private getCurrentPeriodEnd(
    subscription: Stripe.Subscription,
  ): number | undefined {
    const periodEnd = (
      subscription as Stripe.Subscription & { current_period_end?: number }
    ).current_period_end;

    if (typeof periodEnd === 'number') {
      return periodEnd;
    }

    const fallbackItem = subscription.items?.data?.[0];
    return fallbackItem?.current_period_end;
  }

  private extractPlanKey(
    price: Stripe.Price,
    product: Stripe.Product,
  ): Plan | undefined {
    const source = price.metadata?.plan ?? product.metadata?.plan;
    if (!source) return undefined;
    const planKey = source.toUpperCase();
    return this.isSupportedPlan(planKey) ? (planKey as Plan) : undefined;
  }

  private isSupportedPlan(plan: string): plan is Plan {
    return Object.values(Plan).includes(plan as Plan);
  }

  private async fetchRecurringPrices(limit: number): Promise<Stripe.Price[]> {
    const prices: Stripe.Price[] = [];
    let startingAfter: string | undefined;
    let hasMore = true;

    while (hasMore) {
      const page = await this.stripe.prices.list({
        active: true,
        type: 'recurring',
        expand: ['data.product'],
        limit,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });

      prices.push(...page.data);

      if (page.has_more && page.data.length > 0) {
        startingAfter = page.data[page.data.length - 1].id;
        hasMore = true;
      } else {
        startingAfter = undefined;
        hasMore = false;
      }
    }

    return prices;
  }
}
