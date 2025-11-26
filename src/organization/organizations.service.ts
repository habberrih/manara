import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PaginationInterface,
  PaginationParams,
  findManyAndCount,
} from 'src/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UsersService } from 'src/user/user.service';
import {
  Membership,
  Organization,
  Prisma,
} from '../../prisma/generated/client';
import { MembershipStatus, OrgRole, Plan } from '../../prisma/generated/enums';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

const MAX_SLUG_ITERATIONS = 50;

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async createOrganization(
    ownerId: string,
    dto: CreateOrganizationDto,
  ): Promise<Organization> {
    const baseSlug = dto.slug ?? dto.name;
    const slug = await this.ensureUniqueSlug(baseSlug);

    return this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: dto.name.trim(),
          slug,
          plan: dto.plan ?? Plan.FREE,
        },
      });

      await tx.membership.create({
        data: {
          organizationId: organization.id,
          userId: ownerId,
          role: OrgRole.OWNER,
          status: MembershipStatus.ACCEPTED,
        },
      });

      return organization;
    });
  }

  async findAllForUser(
    userId: string,
    params?: PaginationParams,
  ): Promise<PaginationInterface<Organization>> {
    return findManyAndCount<Organization, typeof this.prisma.organization>(
      this.prisma.organization,
      {
        take: params?.take,
        skip: params?.skip,
        where: {
          ...(params?.where ?? {}),
          memberships: {
            some: {
              userId,
              status: MembershipStatus.ACCEPTED,
              deletedAt: null,
            },
          },
        },
        include: params?.include,
        orderBy: { createdAt: 'desc' },
        search: params?.search,
        searchableFields: {
          items: ['name', 'slug'],
          mode: 'insensitive',
        },
      },
    );
  }

  async listMembers(organizationId: string): Promise<Membership[]> {
    return this.prisma.membership.findMany({
      where: {
        organizationId,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async findOneForUser(
    organizationId: string,
    userId: string,
  ): Promise<Organization> {
    const organization = await this.prisma.organization.findFirst({
      where: {
        id: organizationId,
        memberships: {
          some: {
            userId,
            status: MembershipStatus.ACCEPTED,
            deletedAt: null,
          },
        },
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return organization;
  }

  async updateOrganization(
    organizationId: string,
    dto: UpdateOrganizationDto,
  ): Promise<Organization> {
    const data: Prisma.OrganizationUpdateInput = {};

    if (dto.name !== undefined) {
      data.name = dto.name.trim();
    }

    if (dto.plan !== undefined) {
      data.plan = dto.plan;
    }

    if (dto.slug !== undefined) {
      data.slug = await this.ensureUniqueSlug(dto.slug);
    }

    try {
      return await this.prisma.organization.update({
        where: { id: organizationId },
        data,
      });
    } catch (error) {
      throw this.handlePrismaError(error);
    }
  }

  async softDeleteOrganization(organizationId: string): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: organizationId },
        data: { deletedAt: new Date() },
      });

      // Keep memberships aligned with org soft-delete
      await tx.membership.updateMany({
        where: { organizationId },
        data: { deletedAt: new Date() },
      });
    });
  }

  async inviteMember(
    organizationId: string,
    inviterId: string,
    dto: InviteMemberDto,
  ): Promise<Membership> {
    if (inviterId === dto.userId) {
      throw new BadRequestException('You cannot invite yourself.');
    }

    await this.ensureUserExists(dto.userId);

    const role = dto.role ?? OrgRole.MEMBER;

    const existing = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: dto.userId,
          organizationId,
        },
      },
    });

    if (
      existing &&
      !existing.deletedAt &&
      existing.status === MembershipStatus.ACCEPTED
    ) {
      throw new ConflictException(
        'User is already a member of this organization.',
      );
    }

    if (existing) {
      return this.prisma.membership.update({
        where: {
          userId_organizationId: {
            userId: dto.userId,
            organizationId,
          },
        },
        data: {
          role,
          status: MembershipStatus.PENDING,
          deletedAt: null,
        },
      });
    }

    return this.prisma.membership.create({
      data: {
        organizationId,
        userId: dto.userId,
        role,
        status: MembershipStatus.PENDING,
      },
    });
  }

  async acceptMembership(
    organizationId: string,
    userId: string,
  ): Promise<Membership> {
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          organizationId,
          userId,
        },
      },
    });

    if (!membership || membership.deletedAt) {
      throw new NotFoundException('Invitation not found.');
    }

    if (membership.status === MembershipStatus.ACCEPTED) {
      return membership;
    }

    return this.prisma.membership.update({
      where: {
        userId_organizationId: {
          organizationId,
          userId,
        },
      },
      data: {
        status: MembershipStatus.ACCEPTED,
        deletedAt: null,
      },
    });
  }

  async updateMembershipRole(
    organizationId: string,
    userId: string,
    dto: UpdateMembershipDto,
  ): Promise<Membership> {
    if (dto.role === OrgRole.OWNER) {
      throw new ForbiddenException(
        'Use dedicated transfer ownership flow to assign OWNER role.',
      );
    }

    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          organizationId,
          userId,
        },
      },
    });

    if (!membership || membership.deletedAt) {
      throw new NotFoundException('Membership not found.');
    }

    if (membership.role === OrgRole.OWNER) {
      throw new ForbiddenException(
        'Owner role changes require transfer ownership flow.',
      );
    }

    return this.prisma.membership.update({
      where: {
        userId_organizationId: {
          organizationId,
          userId,
        },
      },
      data: {
        role: dto.role,
      },
    });
  }

  async removeMembership(
    organizationId: string,
    userId: string,
  ): Promise<Membership> {
    const membership = await this.prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          organizationId,
          userId,
        },
      },
    });

    if (!membership || membership.deletedAt) {
      throw new NotFoundException('Membership not found.');
    }

    if (membership.role === OrgRole.OWNER) {
      throw new ForbiddenException('Cannot remove the organization owner.');
    }

    return this.prisma.membership.update({
      where: {
        userId_organizationId: {
          organizationId,
          userId,
        },
      },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  private async ensureUniqueSlug(candidate: string): Promise<string> {
    let base = this.slugify(candidate);
    if (!base) {
      base = `org-${Date.now()}`;
    }

    let slug = base;
    let iteration = 1;

    while (iteration <= MAX_SLUG_ITERATIONS) {
      const existing = await this.prisma.organization.findUnique({
        where: { slug },
        select: { id: true },
      });

      if (!existing) {
        return slug;
      }

      slug = `${base}-${iteration}`;
      iteration += 1;
    }

    throw new ConflictException(
      'Unable to generate unique slug, please try another.',
    );
  }

  private slugify(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-');
  }

  private async ensureUserExists(userId: string): Promise<void> {
    try {
      await this.usersService.findOneUser(userId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw new BadRequestException('Target user does not exist.');
      }
      throw error;
    }
  }

  private handlePrismaError(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException('Organization slug must be unique.');
    }

    return error;
  }
}
