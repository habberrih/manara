import { SetMetadata } from '@nestjs/common';
import { OrgRole } from '@prisma/client';

export const ORG_ROLES_KEY = 'orgRoles';
export const OrganizationRoles = (...roles: OrgRole[]) =>
  SetMetadata(ORG_ROLES_KEY, roles);
