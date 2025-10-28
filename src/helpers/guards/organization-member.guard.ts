import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Membership, MembershipStatus, OrgRole, User } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from 'src/prisma/prisma.service';
import { ORG_ROLES_KEY } from '../decorators';

declare module 'express-serve-static-core' {
  interface Request {
    organizationId?: string;
    membership?: Membership;
  }
}

@Injectable()
export class OrganizationMemberGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles =
      this.reflector.getAllAndOverride<OrgRole[]>(ORG_ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as User | undefined;

    if (!user?.id) {
      throw new ForbiddenException('Authentication required.');
    }

    const organizationId =
      this.extractOrganizationId(request) ?? request.params?.organizationId;

    if (!organizationId) {
      throw new BadRequestException(
        'Organization identifier is required for this route.',
      );
    }

    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId,
        },
      },
    });

    if (!membership || membership.deletedAt) {
      throw new ForbiddenException(
        'You are not a member of this organization.',
      );
    }

    if (membership.status !== MembershipStatus.ACCEPTED) {
      throw new ForbiddenException(
        'Pending invitations must be accepted before accessing this resource.',
      );
    }

    if (requiredRoles.length > 0 && !requiredRoles.includes(membership.role)) {
      throw new ForbiddenException('Insufficient organization role.');
    }

    request.organizationId = organizationId;
    request.membership = membership;

    return true;
  }

  private extractOrganizationId(request: Request): string | undefined {
    const fromHeader = request.headers['x-organization-id'];
    if (Array.isArray(fromHeader)) {
      return fromHeader[0];
    }

    return fromHeader ?? request.params?.organizationId;
  }
}
