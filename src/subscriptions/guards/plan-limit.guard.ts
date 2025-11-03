import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PrismaService } from 'src/prisma/prisma.service';
import { TenantContextService } from 'src/tenant/tenant-context.service';
import {
  PLAN_LIMIT_METADATA_KEY,
  PlanLimitMetadata,
} from '../decorators/plan-limit.decorator';
import { PLAN_LIMITS, PlanFeature } from '../plan-limits';

@Injectable()
export class PlanLimitGuard implements CanActivate {
  private readonly logger = new Logger(PlanLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.getAllAndOverride<
      PlanLimitMetadata | undefined
    >(PLAN_LIMIT_METADATA_KEY, [context.getHandler(), context.getClass()]);

    if (!metadata) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const organizationId =
      this.tenantContext.getOrganizationId() ??
      request.organizationId ??
      this.extractOrganizationId(request);

    if (!organizationId) {
      throw new BadRequestException(
        'Organization context is required to evaluate plan limits.',
      );
    }

    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const planConfig = PLAN_LIMITS[organization.plan];
    if (!planConfig) {
      this.logger.warn(
        `No plan configuration found for plan ${organization.plan}. Allowing request.`,
      );
      return true;
    }

    if (!(metadata.feature in planConfig)) {
      throw new InternalServerErrorException(
        `Unsupported plan feature '${metadata.feature}' requested in PlanLimitGuard.`,
      );
    }

    const limit = planConfig[metadata.feature];
    if (limit === undefined || limit === null) {
      return true;
    }

    const usage = await this.resolveUsage(metadata.feature, organizationId);

    if (usage >= limit) {
      throw new ForbiddenException(
        metadata.message ?? 'Plan limit reached for this feature.',
      );
    }

    return true;
  }

  private extractOrganizationId(request: Request): string | undefined {
    if (request.params?.organizationId) {
      return request.params.organizationId;
    }

    const header = request.headers['x-organization-id'];
    if (Array.isArray(header)) {
      return header[0];
    }
    return header;
  }

  private async resolveUsage(
    feature: PlanFeature,
    organizationId: string,
  ): Promise<number> {
    switch (feature) {
      case 'apiKeys':
        return this.prisma.apiKey.count({
          where: {
            organizationId,
            deletedAt: null,
          },
        });
      default:
        throw new InternalServerErrorException(
          `Usage resolver missing for feature '${feature}'.`,
        );
    }
  }
}
