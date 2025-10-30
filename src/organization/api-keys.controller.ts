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
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { OrgRole } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import {
  OrganizationMemberGuard,
  OrganizationRoles,
  TenantContextInterceptor,
} from 'src/common';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import {
  ApiKeyResponseDto,
  ApiKeyWithSecretResponseDto,
} from './entities/api-key.entity';

@ApiTags('Organization API Keys')
@UseGuards(OrganizationMemberGuard)
@OrganizationRoles(OrgRole.ADMIN, OrgRole.OWNER)
@UseInterceptors(ClassSerializerInterceptor, TenantContextInterceptor)
@Controller({
  version: '1',
  path: 'organizations/:organizationId/api-keys',
})
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @ApiOperation({ summary: 'Create a new API key for the organization' })
  @ApiCreatedResponse({ type: ApiKeyWithSecretResponseDto })
  @Post()
  async create(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Body() dto: CreateApiKeyDto,
  ) {
    const { record, secret } = await this.apiKeysService.createApiKey(
      organizationId,
      dto,
    );
    return plainToInstance(ApiKeyWithSecretResponseDto, {
      ...record,
      secret,
    });
  }

  @ApiOperation({ summary: 'List API keys for the organization' })
  @ApiOkResponse({ type: ApiKeyResponseDto, isArray: true })
  @Get()
  async findAll(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
  ) {
    const keys = await this.apiKeysService.listApiKeys(organizationId);
    return plainToInstance(ApiKeyResponseDto, keys);
  }

  @ApiOperation({ summary: 'Revoke (soft delete) an API key' })
  @ApiOkResponse({ type: ApiKeyResponseDto })
  @ApiParam({ name: 'apiKeyId', type: 'string', required: true })
  @HttpCode(HttpStatus.OK)
  @Delete(':apiKeyId')
  async remove(
    @Param('organizationId', new ParseUUIDPipe()) organizationId: string,
    @Param('apiKeyId', new ParseUUIDPipe()) apiKeyId: string,
  ) {
    const key = await this.apiKeysService.removeApiKey(
      organizationId,
      apiKeyId,
    );
    return plainToInstance(ApiKeyResponseDto, key);
  }
}
