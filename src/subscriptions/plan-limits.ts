import { Plan } from '@prisma/client';

export type PlanFeature = 'apiKeys';

export interface PlanLimitConfig {
  [feature: string]: number | null | undefined;
}

export const PLAN_LIMITS: Record<Plan, PlanLimitConfig> = {
  // TODO: Move plan limits to configuration or persistence layer so product can adjust without redeploys.
  [Plan.FREE]: {
    apiKeys: 1,
  },
  [Plan.PRO]: {
    apiKeys: 5,
  },
  [Plan.ENTERPRISE]: {
    apiKeys: null,
  },
};
