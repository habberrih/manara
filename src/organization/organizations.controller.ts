import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import { OrgRole, User } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import {
  GetCurrentUser,
  OrganizationMemberGuard,
  OrganizationRoles,
  TenantContextInterceptor,
  PaginationParams,
} from 'src/helpers';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMembershipDto } from './dto/update-membership.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { MembershipResponseDto } from './entities/membership.entity';
import { OrganizationResponseDto } from './entities/organization.entity';
import { OrganizationsService } from './organizations.service';

@ApiTags('Organizations')
@UseInterceptors(ClassSerializerInterceptor, TenantContextInterceptor)
@Controller({
  version: '1',
  path: 'organizations',
})
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @ApiOperation({ summary: 'Create a new organization and join as OWNER' })
  @ApiCreatedResponse({ type: OrganizationResponseDto })
  @HttpCode(HttpStatus.CREATED)
  @Post()
  async create(
    @GetCurrentUser() user: User,
    @Body() dto: CreateOrganizationDto,
  ) {
    const organization = await this.organizationsService.createOrganization(
      user.id,
      dto,
    );
    return plainToInstance(OrganizationResponseDto, organization);
  }

  @ApiOperation({ summary: 'List organizations for the current user' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: { $ref: getSchemaPath(OrganizationResponseDto) },
        },
        total: { type: 'number' },
        count: { type: 'number' },
      },
    },
  })
  @Get()
  async findAll(
    @GetCurrentUser() user: User,
    @Query() params: PaginationParams,
  ) {
    const result = await this.organizationsService.findAllForUser(
      user.id,
      params,
    );
    return {
      ...result,
      data: plainToInstance(OrganizationResponseDto, result.data),
    };
  }

  @ApiOperation({
    summary: 'Retrieve a single organization the user belongs to',
  })
  @ApiOkResponse({ type: OrganizationResponseDto })
  @ApiParam({ name: 'organizationId', type: 'string', required: true })
  @UseGuards(OrganizationMemberGuard)
  @Get(':organizationId')
  async findOne(
    @GetCurrentUser() user: User,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
  ) {
    const organization = await this.organizationsService.findOneForUser(
      organizationId,
      user.id,
    );
    return plainToInstance(OrganizationResponseDto, organization);
  }

  @ApiOperation({ summary: 'List members for an organization' })
  @ApiOkResponse({ type: MembershipResponseDto, isArray: true })
  @ApiParam({ name: 'organizationId', type: 'string', required: true })
  @UseGuards(OrganizationMemberGuard)
  @Get(':organizationId/members')
  async listMembers(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
  ) {
    const members = await this.organizationsService.listMembers(organizationId);
    return plainToInstance(MembershipResponseDto, members);
  }

  @ApiOperation({ summary: 'Update organization details (ADMIN or OWNER)' })
  @ApiOkResponse({ type: OrganizationResponseDto })
  @ApiParam({ name: 'organizationId', type: 'string', required: true })
  @UseGuards(OrganizationMemberGuard)
  @OrganizationRoles(OrgRole.ADMIN, OrgRole.OWNER)
  @Patch(':organizationId')
  async update(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Body() dto: UpdateOrganizationDto,
  ) {
    const organization = await this.organizationsService.updateOrganization(
      organizationId,
      dto,
    );
    return plainToInstance(OrganizationResponseDto, organization);
  }

  @ApiOperation({ summary: 'Soft-delete organization (OWNER only)' })
  @ApiParam({ name: 'organizationId', type: 'string', required: true })
  @ApiNoContentResponse()
  @UseGuards(OrganizationMemberGuard)
  @OrganizationRoles(OrgRole.OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':organizationId')
  async remove(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
  ) {
    await this.organizationsService.softDeleteOrganization(organizationId);
  }

  @ApiOperation({ summary: 'Invite a user to the organization' })
  @ApiCreatedResponse({ type: MembershipResponseDto })
  @ApiParam({ name: 'organizationId', type: 'string', required: true })
  @UseGuards(OrganizationMemberGuard)
  @OrganizationRoles(OrgRole.ADMIN, OrgRole.OWNER)
  @Post(':organizationId/members')
  async inviteMember(
    @GetCurrentUser() inviter: User,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Body() dto: InviteMemberDto,
  ) {
    const membership = await this.organizationsService.inviteMember(
      organizationId,
      inviter.id,
      dto,
    );
    return plainToInstance(MembershipResponseDto, membership);
  }

  @ApiOperation({
    summary: 'Accept an organization invite (current user only)',
  })
  @ApiOkResponse({ type: MembershipResponseDto })
  @ApiParam({ name: 'organizationId', type: 'string', required: true })
  @HttpCode(HttpStatus.OK)
  @Post(':organizationId/members/accept')
  async acceptInvitation(
    @GetCurrentUser() user: User,
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
  ) {
    const membership = await this.organizationsService.acceptMembership(
      organizationId,
      user.id,
    );
    return plainToInstance(MembershipResponseDto, membership);
  }

  @ApiOperation({ summary: 'Update a member role (ADMIN or OWNER)' })
  @ApiOkResponse({ type: MembershipResponseDto })
  @ApiParam({ name: 'organizationId', type: 'string', required: true })
  @ApiParam({ name: 'userId', type: 'string', required: true })
  @UseGuards(OrganizationMemberGuard)
  @OrganizationRoles(OrgRole.ADMIN, OrgRole.OWNER)
  @Patch(':organizationId/members/:userId')
  async updateMember(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: UpdateMembershipDto,
  ) {
    const membership = await this.organizationsService.updateMembershipRole(
      organizationId,
      userId,
      dto,
    );
    return plainToInstance(MembershipResponseDto, membership);
  }

  @ApiOperation({ summary: 'Remove a member from the organization' })
  @ApiOkResponse({ type: MembershipResponseDto })
  @ApiParam({ name: 'organizationId', type: 'string', required: true })
  @ApiParam({ name: 'userId', type: 'string', required: true })
  @UseGuards(OrganizationMemberGuard)
  @OrganizationRoles(OrgRole.ADMIN, OrgRole.OWNER)
  @Delete(':organizationId/members/:userId')
  async removeMember(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    const membership = await this.organizationsService.removeMembership(
      organizationId,
      userId,
    );
    return plainToInstance(MembershipResponseDto, membership);
  }
}
