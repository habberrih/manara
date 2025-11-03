import { ClassSerializerInterceptor } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationMemberGuard, TenantContextInterceptor } from 'src/common';
import { PlanLimitGuard } from 'src/subscriptions/guards/plan-limit.guard';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import {
  ApiKeyResponseDto,
  ApiKeyWithSecretResponseDto,
} from './entities/api-key.entity';

describe('ApiKeysController', () => {
  let controller: ApiKeysController;
  let apiKeysService: {
    createApiKey: jest.Mock;
    listApiKeys: jest.Mock;
    removeApiKey: jest.Mock;
  };

  beforeEach(async () => {
    apiKeysService = {
      createApiKey: jest.fn(),
      listApiKeys: jest.fn(),
      removeApiKey: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApiKeysController],
      providers: [{ provide: ApiKeysService, useValue: apiKeysService }],
    })
      .overrideGuard(OrganizationMemberGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideGuard(PlanLimitGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .overrideInterceptor(TenantContextInterceptor)
      .useValue({ intercept: jest.fn((_: any, next: any) => next.handle()) })
      .overrideInterceptor(ClassSerializerInterceptor)
      .useValue({ intercept: jest.fn((_: any, next: any) => next.handle()) })
      .compile();

    controller = module.get(ApiKeysController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates API key and returns secret', async () => {
    apiKeysService.createApiKey.mockResolvedValue({
      record: {
        id: 'key-1',
        name: 'Primary',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastUsedAt: null,
      },
      secret: 'plain-secret',
    });

    const result = await controller.create('org-1', {
      name: 'Primary',
    } as any);

    expect(apiKeysService.createApiKey).toHaveBeenCalledWith('org-1', {
      name: 'Primary',
    });
    expect(result).toBeInstanceOf(ApiKeyWithSecretResponseDto);
    expect(result).toMatchObject({ secret: 'plain-secret' });
  });

  it('lists API keys for organization', async () => {
    apiKeysService.listApiKeys.mockResolvedValue([
      {
        id: 'key-1',
        name: 'Primary',
        createdAt: new Date(),
        updatedAt: new Date(),
        lastUsedAt: null,
      },
    ]);

    const result = await controller.findAll('org-1');

    expect(apiKeysService.listApiKeys).toHaveBeenCalledWith('org-1');
    expect(result[0]).toBeInstanceOf(ApiKeyResponseDto);
  });

  it('removes API key through service', async () => {
    apiKeysService.removeApiKey.mockResolvedValue({
      id: 'key-1',
      name: 'Primary',
      createdAt: new Date(),
      updatedAt: new Date(),
      lastUsedAt: null,
    });

    const result = await controller.remove('org-1', 'key-1');

    expect(apiKeysService.removeApiKey).toHaveBeenCalledWith('org-1', 'key-1');
    expect(result).toBeInstanceOf(ApiKeyResponseDto);
  });
});
