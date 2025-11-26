import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  MembershipStatus,
  OrgRole,
  Organization,
  User,
} from '../prisma/generated/client';
import { OrganizationMemberGuard, PaginationInterface } from '../src/common';
import { MembershipResponseDto } from '../src/organization/entities/membership.entity';
import { OrganizationResponseDto } from '../src/organization/entities/organization.entity';
import { OrganizationsController } from '../src/organization/organizations.controller';
import { OrganizationsService } from '../src/organization/organizations.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContextService } from '../src/tenant/tenant-context.service';

describe('OrganizationsController (e2e)', () => {
  let app: INestApplication;
  let controller: OrganizationsController;
  let organizationsServiceMock: Record<string, jest.Mock>;
  const prismaStub = {
    membership: {
      findUnique: jest.fn(),
    },
  } as unknown as PrismaService;
  const guardStub = { canActivate: jest.fn(() => true) };

  beforeAll(async () => {
    organizationsServiceMock = {
      createOrganization: jest.fn(),
      findAllForUser: jest.fn(),
      findOneForUser: jest.fn(),
      listMembers: jest.fn(),
      updateOrganization: jest.fn(),
      softDeleteOrganization: jest.fn(),
      inviteMember: jest.fn(),
      acceptMembership: jest.fn(),
      updateMembershipRole: jest.fn(),
      removeMembership: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [
        { provide: OrganizationsService, useValue: organizationsServiceMock },
        { provide: PrismaService, useValue: prismaStub },
        TenantContextService,
        { provide: OrganizationMemberGuard, useValue: guardStub },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    controller = app.get(OrganizationsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a new organization for the authenticated user', async () => {
    const now = new Date('2024-01-01T00:00:00.000Z');
    organizationsServiceMock.createOrganization.mockResolvedValue({
      id: 'org-1',
      name: 'Acme Inc',
      slug: 'acme-inc',
      plan: 'FREE',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    } as Organization);

    const response = await controller.create({ id: 'user-1' } as User, {
      name: 'Acme Inc',
    });

    expect(organizationsServiceMock.createOrganization).toHaveBeenCalledWith(
      'user-1',
      { name: 'Acme Inc' },
    );
    expect(response).toBeInstanceOf(OrganizationResponseDto);
    expect(JSON.parse(JSON.stringify(response))).toEqual({
      id: 'org-1',
      name: 'Acme Inc',
      slug: 'acme-inc',
      plan: 'FREE',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      deletedAt: null,
    });
  });

  it('lists organizations for the user with pagination metadata preserved', async () => {
    const now = new Date('2024-01-01T00:00:00.000Z');
    const page: PaginationInterface<Organization> = {
      data: [
        {
          id: 'org-1',
          name: 'Acme Inc',
          slug: 'acme-inc',
          plan: 'PRO' as any,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        } as Organization,
      ],
      count: 1,
      total: 1,
    };
    organizationsServiceMock.findAllForUser.mockResolvedValue(page);

    const result = await controller.findAll({ id: 'user-1' } as User, {
      take: 5,
      skip: 0,
    });

    expect(organizationsServiceMock.findAllForUser).toHaveBeenCalledWith(
      'user-1',
      { take: 5, skip: 0 },
    );
    expect(result.count).toBe(1);
    expect(result.total).toBe(1);
    expect(
      result.data.every((item) => item instanceof OrganizationResponseDto),
    ).toBe(true);
    expect(JSON.parse(JSON.stringify(result.data[0]))).toMatchObject({
      id: 'org-1',
      plan: 'PRO',
    });
  });

  it('retrieves a single organization scoped to the user', async () => {
    const org: Organization = {
      id: 'org-1',
      name: 'Acme',
      slug: 'acme',
      plan: 'FREE' as any,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      stripeCustomerId: null,
    };
    organizationsServiceMock.findOneForUser.mockResolvedValue(org);

    const result = await controller.findOne({ id: 'user-1' } as User, 'org-1');

    expect(organizationsServiceMock.findOneForUser).toHaveBeenCalledWith(
      'org-1',
      'user-1',
    );
    expect(result).toBeInstanceOf(OrganizationResponseDto);
  });

  it('lists organization members', async () => {
    const membership = {
      userId: 'user-1',
      organizationId: 'org-1',
      role: OrgRole.ADMIN,
      status: MembershipStatus.ACCEPTED,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    organizationsServiceMock.listMembers.mockResolvedValue([membership]);

    const result = await controller.listMembers('org-1');

    expect(organizationsServiceMock.listMembers).toHaveBeenCalledWith('org-1');
    expect(result[0]).toBeInstanceOf(MembershipResponseDto);
  });

  it('updates organization metadata', async () => {
    const now = new Date();
    organizationsServiceMock.updateOrganization.mockResolvedValue({
      id: 'org-1',
      name: 'Updated',
      slug: 'updated',
      plan: 'FREE',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const response = await controller.update('org-1', { name: 'Updated' });

    expect(organizationsServiceMock.updateOrganization).toHaveBeenCalledWith(
      'org-1',
      { name: 'Updated' },
    );
    expect(response).toBeInstanceOf(OrganizationResponseDto);
  });

  it('soft deletes an organization', async () => {
    organizationsServiceMock.softDeleteOrganization.mockResolvedValue(
      undefined,
    );

    await controller.remove('org-1');

    expect(
      organizationsServiceMock.softDeleteOrganization,
    ).toHaveBeenCalledWith('org-1');
  });

  it('invites a member to an organization', async () => {
    const membership = {
      userId: 'user-2',
      organizationId: 'org-1',
      role: OrgRole.MEMBER,
      status: MembershipStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    organizationsServiceMock.inviteMember.mockResolvedValue(membership);

    const response = await controller.inviteMember(
      { id: 'user-1' } as User,
      'org-1',
      { userId: 'user-2', role: OrgRole.MEMBER },
    );

    expect(organizationsServiceMock.inviteMember).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      { userId: 'user-2', role: OrgRole.MEMBER },
    );
    expect(response).toBeInstanceOf(MembershipResponseDto);
  });

  it('accepts a membership invitation for the current user', async () => {
    const membership = {
      userId: 'user-1',
      organizationId: 'org-1',
      role: OrgRole.MEMBER,
      status: MembershipStatus.ACCEPTED,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    organizationsServiceMock.acceptMembership.mockResolvedValue(membership);

    const response = await controller.acceptInvitation(
      { id: 'user-1' } as User,
      'org-1',
    );

    expect(organizationsServiceMock.acceptMembership).toHaveBeenCalledWith(
      'org-1',
      'user-1',
    );
    expect(response).toBeInstanceOf(MembershipResponseDto);
  });

  it('updates a member role', async () => {
    const membership = {
      userId: 'user-2',
      organizationId: 'org-1',
      role: OrgRole.ADMIN,
      status: MembershipStatus.ACCEPTED,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };
    organizationsServiceMock.updateMembershipRole.mockResolvedValue(membership);

    const response = await controller.updateMember('org-1', 'user-2', {
      role: OrgRole.ADMIN,
    });

    expect(organizationsServiceMock.updateMembershipRole).toHaveBeenCalledWith(
      'org-1',
      'user-2',
      { role: OrgRole.ADMIN },
    );
    expect(response).toBeInstanceOf(MembershipResponseDto);
  });

  it('removes a member from an organization', async () => {
    const membership = {
      userId: 'user-2',
      organizationId: 'org-1',
      role: OrgRole.MEMBER,
      status: MembershipStatus.ACCEPTED,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: new Date(),
    };
    organizationsServiceMock.removeMembership.mockResolvedValue(membership);

    const response = await controller.removeMember('org-1', 'user-2');

    expect(organizationsServiceMock.removeMembership).toHaveBeenCalledWith(
      'org-1',
      'user-2',
    );
    expect(response).toBeInstanceOf(MembershipResponseDto);
  });
});
