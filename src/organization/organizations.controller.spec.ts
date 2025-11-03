import { ClassSerializerInterceptor } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrgRole } from '@prisma/client';
import { OrganizationMemberGuard, TenantContextInterceptor } from 'src/common';
import { MembershipResponseDto } from './entities/membership.entity';
import { OrganizationResponseDto } from './entities/organization.entity';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';

describe('OrganizationsController', () => {
  let controller: OrganizationsController;
  let organizationsService: {
    createOrganization: jest.Mock;
    findAllForUser: jest.Mock;
    findOneForUser: jest.Mock;
    listMembers: jest.Mock;
    updateOrganization: jest.Mock;
    softDeleteOrganization: jest.Mock;
    inviteMember: jest.Mock;
    acceptMembership: jest.Mock;
    updateMembershipRole: jest.Mock;
    removeMembership: jest.Mock;
  };

  const baseOrg = {
    id: 'org-1',
    name: 'Acme',
    slug: 'acme',
    plan: 'FREE',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const baseMember = {
    organizationId: 'org-1',
    userId: 'user-2',
    role: OrgRole.MEMBER,
    status: 'PENDING',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(async () => {
    organizationsService = {
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

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [
        { provide: OrganizationsService, useValue: organizationsService },
      ],
    })
      .overrideGuard(OrganizationMemberGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideInterceptor(TenantContextInterceptor)
      .useValue({ intercept: jest.fn((_: any, next: any) => next.handle()) })
      .overrideInterceptor(ClassSerializerInterceptor)
      .useValue({ intercept: jest.fn((_: any, next: any) => next.handle()) })
      .compile();

    controller = module.get(OrganizationsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates organization for current user', async () => {
    organizationsService.createOrganization.mockResolvedValue(baseOrg);

    const result = await controller.create(
      { id: 'user-1' } as any,
      { name: 'Acme' } as any,
    );

    expect(organizationsService.createOrganization).toHaveBeenCalledWith(
      'user-1',
      { name: 'Acme' },
    );
    expect(result).toBeInstanceOf(OrganizationResponseDto);
  });

  it('lists organizations for current user', async () => {
    organizationsService.findAllForUser.mockResolvedValue({
      data: [baseOrg],
      total: 1,
      count: 1,
    });

    const result = await controller.findAll(
      { id: 'user-1' } as any,
      {
        take: 5,
      } as any,
    );

    expect(organizationsService.findAllForUser).toHaveBeenCalledWith('user-1', {
      take: 5,
    });
    expect(result.data[0]).toBeInstanceOf(OrganizationResponseDto);
  });

  it('finds organization user belongs to', async () => {
    organizationsService.findOneForUser.mockResolvedValue(baseOrg);

    const result = await controller.findOne({ id: 'user-1' } as any, 'org-1');

    expect(organizationsService.findOneForUser).toHaveBeenCalledWith(
      'org-1',
      'user-1',
    );
    expect(result).toBeInstanceOf(OrganizationResponseDto);
  });

  it('lists organization members', async () => {
    organizationsService.listMembers.mockResolvedValue([baseMember]);

    const result = await controller.listMembers('org-1');

    expect(organizationsService.listMembers).toHaveBeenCalledWith('org-1');
    expect(result[0]).toBeInstanceOf(MembershipResponseDto);
  });

  it('updates organization details', async () => {
    organizationsService.updateOrganization.mockResolvedValue({
      ...baseOrg,
      plan: 'PRO',
    });

    const result = await controller.update('org-1', { plan: 'PRO' } as any);

    expect(organizationsService.updateOrganization).toHaveBeenCalledWith(
      'org-1',
      { plan: 'PRO' },
    );
    expect(result).toBeInstanceOf(OrganizationResponseDto);
  });

  it('soft deletes organization', async () => {
    organizationsService.softDeleteOrganization.mockResolvedValue(undefined);

    await controller.remove('org-1');

    expect(organizationsService.softDeleteOrganization).toHaveBeenCalledWith(
      'org-1',
    );
  });

  it('invites member and returns membership dto', async () => {
    organizationsService.inviteMember.mockResolvedValue(baseMember);

    const result = await controller.inviteMember(
      { id: 'user-1' } as any,
      'org-1',
      { userId: 'user-2' } as any,
    );

    expect(organizationsService.inviteMember).toHaveBeenCalledWith(
      'org-1',
      'user-1',
      { userId: 'user-2' },
    );
    expect(result).toBeInstanceOf(MembershipResponseDto);
  });

  it('accepts membership for current user', async () => {
    organizationsService.acceptMembership.mockResolvedValue({
      ...baseMember,
      status: 'ACCEPTED',
    });

    const result = await controller.acceptInvitation(
      { id: 'user-2' } as any,
      'org-1',
    );

    expect(organizationsService.acceptMembership).toHaveBeenCalledWith(
      'org-1',
      'user-2',
    );
    expect(result).toBeInstanceOf(MembershipResponseDto);
  });

  it('updates membership role', async () => {
    organizationsService.updateMembershipRole.mockResolvedValue({
      ...baseMember,
      role: OrgRole.ADMIN,
    });

    const result = await controller.updateMember('org-1', 'user-2', {
      role: OrgRole.ADMIN,
    } as any);

    expect(organizationsService.updateMembershipRole).toHaveBeenCalledWith(
      'org-1',
      'user-2',
      { role: OrgRole.ADMIN },
    );
    expect(result).toBeInstanceOf(MembershipResponseDto);
  });

  it('removes membership via service', async () => {
    organizationsService.removeMembership.mockResolvedValue({
      ...baseMember,
      deletedAt: new Date(),
    });

    const result = await controller.removeMember('org-1', 'user-2');

    expect(organizationsService.removeMembership).toHaveBeenCalledWith(
      'org-1',
      'user-2',
    );
    expect(result).toBeInstanceOf(MembershipResponseDto);
  });
});
