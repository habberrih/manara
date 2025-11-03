import { SetMetadata } from '@nestjs/common';
import { PlanFeature } from '../plan-limits';

export const PLAN_LIMIT_METADATA_KEY = 'planLimit';

export interface PlanLimitMetadata {
  feature: PlanFeature;
  message?: string;
}

export const PlanLimit = (
  feature: PlanFeature,
  options?: { message?: string },
) =>
  SetMetadata(PLAN_LIMIT_METADATA_KEY, {
    feature,
    message: options?.message,
  } satisfies PlanLimitMetadata);
