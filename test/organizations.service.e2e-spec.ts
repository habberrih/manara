import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MembershipStatus,
  OrgRole,
  Organization,
  Plan,
  Prisma,
} from '@prisma/client';
import { findManyAndCount } from 'src/common';
import { CreateOrganizationDto } from 'src/organization/dto/create-organization.dto';
import { InviteMemberDto } from 'src/organization/dto/invite-member.dto';
import { UpdateMembershipDto } from 'src/organization/dto/update-membership.dto';
import { UpdateOrganizationDto } from 'src/organization/dto/update-organization.dto';
import { OrganizationsService } from 'src/organization/organizations.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { UsersService } from 'src/user/user.service';

jest.mock('src/common', () => {
  const actual = jest.requireActual('src/common');
  return {
    ...actual,
    findManyAndCount: jest.fn(),
  };
});

type PrismaOrganizationMock = {
  findUnique: jest.Mock;
  findFirst: jest.Mock;
  findMany: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
};

type PrismaMembershipMock = {
  findMany: jest.Mock;
  findUnique: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
};

type PrismaServiceMock = {
  organization: PrismaOrganizationMock;
  membership: PrismaMembershipMock;
  $transaction: jest.Mock;
};

const createPrismaMock = (): PrismaServiceMock => {
  const prisma: PrismaServiceMock = {
    organization: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    membership: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  prisma.$transaction.mockImplementation(async (handler: any) =>
    handler(prisma),
  );

  return prisma;
};

describe('OrganizationsService (integration-like)', () => {
  let service: OrganizationsService;
  let prisma: PrismaServiceMock;
  let usersService: { findOneUser: jest.Mock };
  const findManySpy = findManyAndCount as unknown as jest.Mock;

  beforeEach(async () => {
    prisma = createPrismaMock();
    usersService = {
      findOneUser: jest.fn(),
    };
    findManySpy.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        {
          provide: PrismaService,
          useValue: prisma as unknown as PrismaService,
        },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    service = module.get(OrganizationsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  const mockSlugAvailability = (availability: Array<boolean>) => {
    availability.forEach((isFree) => {
      prisma.organization.findUnique.mockResolvedValueOnce(
        isFree ? null : ({ id: 'existing' } as Partial<Organization>),
      );
    });
  };

  describe('createOrganization', () => {
    it('creates organization with unique slug and owner membership', async () => {
      const ownerId = 'user-1';
      const dto: CreateOrganizationDto = {
        name: 'Test Org',
      };
      mockSlugAvailability([true]);
      prisma.organization.create.mockResolvedValue({
        id: 'org-1',
        name: dto.name,
        slug: 'test-org',
        plan: Plan.FREE,
      });
      prisma.membership.create.mockResolvedValue({
        organizationId: 'org-1',
        userId: ownerId,
      });

      const organization = await service.createOrganization(ownerId, dto);

      expect(prisma.organization.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: dto.name.trim(),
          slug: 'test-org',
          plan: Plan.FREE,
        }),
      });
      expect(prisma.membership.create).toHaveBeenCalledWith({
        data: {
          organizationId: 'org-1',
          userId: ownerId,
          role: OrgRole.OWNER,
          status: MembershipStatus.ACCEPTED,
        },
      });
      expect(organization.slug).toBe('test-org');
    });

    it('appends counter when slug already exists', async () => {
      const dto: CreateOrganizationDto = {
        name: 'Test Org',
      };
      mockSlugAvailability([false, true]);
      prisma.organization.create.mockResolvedValue({
        id: 'org-1',
        name: dto.name,
        slug: 'test-org-1',
        plan: Plan.FREE,
      });

      await service.createOrganization('user-1', dto);

      const createArgs = prisma.organization.create.mock.calls[0][0];
      expect(createArgs.data.slug).toBe('test-org-1');
    });
  });

  describe('findAllForUser', () => {
    it('delegates to findManyAndCount with membership filter', async () => {
      const response = { data: [], total: 0, count: 0 };
      findManySpy.mockResolvedValue(response);

      const result = await service.findAllForUser('user-1', { take: 5 });

      expect(findManySpy).toHaveBeenCalledWith(
        prisma.organization,
        expect.objectContaining({
          take: 5,
          where: expect.objectContaining({
            memberships: expect.objectContaining({
              some: expect.objectContaining({
                userId: 'user-1',
                status: MembershipStatus.ACCEPTED,
              }),
            }),
          }),
        }),
      );
      expect(result).toBe(response);
    });
  });

  describe('listMembers', () => {
    it('returns ordered active memberships', async () => {
      const members = [{ userId: 'user-1' }];
      prisma.membership.findMany.mockResolvedValue(members);

      const result = await service.listMembers('org-1');

      expect(prisma.membership.findMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1', deletedAt: null },
        orderBy: { createdAt: 'asc' },
      });
      expect(result).toBe(members);
    });
  });

  describe('findOneForUser', () => {
    it('returns organization when user is member', async () => {
      const org = { id: 'org-1' } as Organization;
      prisma.organization.findFirst.mockResolvedValue(org);

      const result = await service.findOneForUser('org-1', 'user-1');

      expect(result).toBe(org);
      expect(prisma.organization.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'org-1',
          memberships: {
            some: {
              userId: 'user-1',
              status: MembershipStatus.ACCEPTED,
              deletedAt: null,
            },
          },
        },
      });
    });

    it('throws NotFound when user is not member', async () => {
      prisma.organization.findFirst.mockResolvedValue(null);

      await expect(service.findOneForUser('org-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateOrganization', () => {
    it('updates organization fields and enforces unique slug when provided', async () => {
      const dto: UpdateOrganizationDto = {
        name: ' Updated Org ',
        plan: Plan.PRO,
        slug: 'custom-slug',
      };
      mockSlugAvailability([true]);
      const trimmedName = dto.name!.trim();
      prisma.organization.update.mockResolvedValue({
        id: 'org-1',
        name: trimmedName,
        plan: dto.plan!,
        slug: dto.slug,
      } as Organization);

      const result = await service.updateOrganization('org-1', dto);

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: {
          name: trimmedName,
          plan: Plan.PRO,
          slug: 'custom-slug',
        },
      });
      expect(result.slug).toBe('custom-slug');
    });

    it('generates fallback slug when candidate slugifies to empty string', async () => {
      jest.spyOn(Date, 'now').mockReturnValue(42);
      prisma.organization.findUnique.mockResolvedValueOnce(null);
      prisma.organization.update.mockResolvedValue({
        id: 'org-1',
        name: 'Name',
        plan: Plan.FREE,
        slug: 'org-42',
      } as Organization);

      await service.updateOrganization('org-1', { slug: '   ' });

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: expect.objectContaining({ slug: 'org-42' }),
      });
    });

    it('throws Conflict when slug cannot be generated after max attempts', async () => {
      prisma.organization.findUnique.mockResolvedValue({ id: 'taken' });

      await expect(
        service.updateOrganization('org-1', { slug: 'duplicate' }),
      ).rejects.toThrow(ConflictException);
      expect(prisma.organization.update).not.toHaveBeenCalled();
    });

    it('converts Prisma unique constraint error to ConflictException', async () => {
      const error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          clientVersion: 'test',
          code: 'P2002',
        },
      );
      prisma.organization.update.mockRejectedValue(error);

      await expect(
        service.updateOrganization('org-1', { name: 'Org' }),
      ).rejects.toThrow(ConflictException);
    });

    it('re-throws unknown Prisma errors', async () => {
      const error = new Error('database down');
      prisma.organization.update.mockRejectedValue(error);

      await expect(
        service.updateOrganization('org-1', { name: 'Org' }),
      ).rejects.toThrow(error);
    });
  });

  describe('softDeleteOrganization', () => {
    it('soft deletes organization and memberships in transaction', async () => {
      await service.softDeleteOrganization('org-1');

      expect(prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org-1' },
        data: { deletedAt: expect.any(Date) },
      });
      expect(prisma.membership.updateMany).toHaveBeenCalledWith({
        where: { organizationId: 'org-1' },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });

  describe('inviteMember', () => {
    const orgId = 'org-1';
    const inviterId = 'inviter';

    beforeEach(() => {
      usersService.findOneUser.mockResolvedValue({ id: 'user-2' });
    });

    it('rejects self invitation', async () => {
      const dto: InviteMemberDto = { userId: inviterId, role: OrgRole.ADMIN };

      await expect(service.inviteMember(orgId, inviterId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('returns conflict when member is already accepted', async () => {
      const dto: InviteMemberDto = { userId: 'user-2', role: OrgRole.ADMIN };
      prisma.membership.findUnique.mockResolvedValue({
        userId: 'user-2',
        organizationId: orgId,
        status: MembershipStatus.ACCEPTED,
        deletedAt: null,
      });

      await expect(service.inviteMember(orgId, inviterId, dto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('revives existing membership by resetting status and role', async () => {
      const dto: InviteMemberDto = { userId: 'user-2', role: OrgRole.ADMIN };
      prisma.membership.findUnique.mockResolvedValue({
        userId: 'user-2',
        organizationId: orgId,
        status: MembershipStatus.PENDING,
        deletedAt: new Date(),
      });
      prisma.membership.update.mockResolvedValue({
        userId: 'user-2',
        organizationId: orgId,
        status: MembershipStatus.PENDING,
      });

      const result = await service.inviteMember(orgId, inviterId, dto);

      expect(prisma.membership.update).toHaveBeenCalledWith({
        where: {
          userId_organizationId: {
            userId: 'user-2',
            organizationId: orgId,
          },
        },
        data: {
          role: OrgRole.ADMIN,
          status: MembershipStatus.PENDING,
          deletedAt: null,
        },
      });
      expect(result.status).toBe(MembershipStatus.PENDING);
    });

    it('creates new membership when none exists', async () => {
      const dto: InviteMemberDto = { userId: 'user-3' };
      prisma.membership.findUnique.mockResolvedValue(null);
      prisma.membership.create.mockResolvedValue({
        userId: dto.userId,
        organizationId: orgId,
        status: MembershipStatus.PENDING,
        role: OrgRole.MEMBER,
      });

      const result = await service.inviteMember(orgId, inviterId, dto);

      expect(prisma.membership.create).toHaveBeenCalledWith({
        data: {
          organizationId: orgId,
          userId: dto.userId,
          role: OrgRole.MEMBER,
          status: MembershipStatus.PENDING,
        },
      });
      expect(result.role).toBe(OrgRole.MEMBER);
    });

    it('raises BadRequest when user does not exist', async () => {
      usersService.findOneUser.mockRejectedValue(new NotFoundException());

      await expect(
        service.inviteMember(orgId, inviterId, { userId: 'ghost' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rethrows unexpected errors from user lookup', async () => {
      const unexpected = new Error('lookup failed');
      usersService.findOneUser.mockRejectedValue(unexpected);

      await expect(
        service.inviteMember(orgId, inviterId, { userId: 'err' }),
      ).rejects.toThrow(unexpected);
    });
  });

  describe('acceptMembership', () => {
    const orgId = 'org-1';
    const userId = 'user-2';

    it('throws when invitation missing or deleted', async () => {
      prisma.membership.findUnique.mockResolvedValue(null);

      await expect(service.acceptMembership(orgId, userId)).rejects.toThrow(
        NotFoundException,
      );

      prisma.membership.findUnique.mockResolvedValue({
        userId,
        organizationId: orgId,
        deletedAt: new Date(),
      });

      await expect(service.acceptMembership(orgId, userId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns membership when already accepted', async () => {
      const membership = {
        organizationId: orgId,
        userId,
        status: MembershipStatus.ACCEPTED,
        deletedAt: null,
      };
      prisma.membership.findUnique.mockResolvedValue(membership);

      const result = await service.acceptMembership(orgId, userId);

      expect(prisma.membership.update).not.toHaveBeenCalled();
      expect(result).toBe(membership);
    });

    it('marks membership as accepted', async () => {
      prisma.membership.findUnique.mockResolvedValue({
        organizationId: orgId,
        userId,
        status: MembershipStatus.PENDING,
        deletedAt: null,
      });
      prisma.membership.update.mockResolvedValue({
        organizationId: orgId,
        userId,
        status: MembershipStatus.ACCEPTED,
      });

      const result = await service.acceptMembership(orgId, userId);

      expect(prisma.membership.update).toHaveBeenCalledWith({
        where: {
          userId_organizationId: {
            organizationId: orgId,
            userId,
          },
        },
        data: {
          status: MembershipStatus.ACCEPTED,
          deletedAt: null,
        },
      });
      expect(result.status).toBe(MembershipStatus.ACCEPTED);
    });
  });

  describe('updateMembershipRole', () => {
    it('prevents assigning OWNER role directly', async () => {
      const dto: UpdateMembershipDto = { role: OrgRole.OWNER };

      await expect(
        service.updateMembershipRole('org-1', 'user-2', dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFound when membership missing or deleted', async () => {
      const dto: UpdateMembershipDto = { role: OrgRole.ADMIN };
      prisma.membership.findUnique.mockResolvedValue(null);

      await expect(
        service.updateMembershipRole('org-1', 'user-2', dto),
      ).rejects.toThrow(NotFoundException);

      prisma.membership.findUnique.mockResolvedValue({
        organizationId: 'org-1',
        userId: 'user-2',
        deletedAt: new Date(),
        role: OrgRole.MEMBER,
      });

      await expect(
        service.updateMembershipRole('org-1', 'user-2', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('prevents demoting current owner', async () => {
      const dto: UpdateMembershipDto = { role: OrgRole.ADMIN };
      prisma.membership.findUnique.mockResolvedValue({
        organizationId: 'org-1',
        userId: 'user-2',
        deletedAt: null,
        role: OrgRole.OWNER,
      });

      await expect(
        service.updateMembershipRole('org-1', 'user-2', dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('updates membership role', async () => {
      const dto: UpdateMembershipDto = { role: OrgRole.ADMIN };
      prisma.membership.findUnique.mockResolvedValue({
        organizationId: 'org-1',
        userId: 'user-2',
        deletedAt: null,
        role: OrgRole.MEMBER,
      });
      prisma.membership.update.mockResolvedValue({
        organizationId: 'org-1',
        userId: 'user-2',
        role: OrgRole.ADMIN,
      });

      const result = await service.updateMembershipRole('org-1', 'user-2', dto);

      expect(prisma.membership.update).toHaveBeenCalledWith({
        where: {
          userId_organizationId: {
            organizationId: 'org-1',
            userId: 'user-2',
          },
        },
        data: { role: OrgRole.ADMIN },
      });
      expect(result.role).toBe(OrgRole.ADMIN);
    });
  });

  describe('removeMembership', () => {
    it('throws NotFound when membership missing or deleted', async () => {
      prisma.membership.findUnique.mockResolvedValue(null);

      await expect(service.removeMembership('org-1', 'user-2')).rejects.toThrow(
        NotFoundException,
      );

      prisma.membership.findUnique.mockResolvedValue({
        organizationId: 'org-1',
        userId: 'user-2',
        deletedAt: new Date(),
      });

      await expect(service.removeMembership('org-1', 'user-2')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('prevents removing owner', async () => {
      prisma.membership.findUnique.mockResolvedValue({
        organizationId: 'org-1',
        userId: 'user-2',
        role: OrgRole.OWNER,
        deletedAt: null,
      });

      await expect(service.removeMembership('org-1', 'user-2')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('soft deletes membership', async () => {
      prisma.membership.findUnique.mockResolvedValue({
        organizationId: 'org-1',
        userId: 'user-2',
        role: OrgRole.MEMBER,
        deletedAt: null,
      });
      prisma.membership.update.mockResolvedValue({
        organizationId: 'org-1',
        userId: 'user-2',
        deletedAt: new Date(),
      });

      const result = await service.removeMembership('org-1', 'user-2');

      expect(prisma.membership.update).toHaveBeenCalledWith({
        where: {
          userId_organizationId: {
            organizationId: 'org-1',
            userId: 'user-2',
          },
        },
        data: { deletedAt: expect.any(Date) },
      });
      expect(result.deletedAt).toBeInstanceOf(Date);
    });
  });
});
