import {
  CallHandler,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Observable } from 'rxjs';
import { OrganizationMemberGuard } from '../src/common';
import { TenantContextInterceptor } from '../src/common/interceptors/tenant-context.interceptor';
import { ApiKeysController } from '../src/organization/api-keys.controller';
import { ApiKeysService } from '../src/organization/api-keys.service';
import {
  ApiKeyResponseDto,
  ApiKeyWithSecretResponseDto,
} from '../src/organization/entities/api-key.entity';
import { PrismaService } from '../src/prisma/prisma.service';
import { PlanLimitGuard } from '../src/subscriptions/guards/plan-limit.guard';
import { TenantContextService } from '../src/tenant/tenant-context.service';

class TenantContextInterceptorStub extends TenantContextInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle();
  }
}

describe('ApiKeysController (e2e)', () => {
  let app: INestApplication;
  let controller: ApiKeysController;
  const serviceMock = {
    createApiKey: jest.fn(),
    listApiKeys: jest.fn(),
    removeApiKey: jest.fn(),
  };
  const prismaStub = {
    membership: {
      findUnique: jest.fn(),
    },
    organization: {
      findUnique: jest.fn().mockResolvedValue({ id: 'org-1', plan: 'FREE' }),
    },
    apiKey: {
      count: jest.fn().mockResolvedValue(0),
    },
  } as unknown as PrismaService;
  const organizationGuardStub = { canActivate: jest.fn(() => true) };
  const planLimitGuardStub = { canActivate: jest.fn(() => true) };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ApiKeysController],
      providers: [
        { provide: ApiKeysService, useValue: serviceMock },
        { provide: PrismaService, useValue: prismaStub },
        TenantContextService,
        { provide: OrganizationMemberGuard, useValue: organizationGuardStub },
        { provide: PlanLimitGuard, useValue: planLimitGuardStub },
        {
          provide: TenantContextInterceptor,
          useClass: TenantContextInterceptorStub,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    controller = app.get(ApiKeysController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates an API key and returns the secret once', async () => {
    const createdAt = new Date('2024-06-01T00:00:00.000Z');
    const updatedAt = new Date('2024-06-01T00:00:00.000Z');
    serviceMock.createApiKey.mockResolvedValue({
      record: {
        id: 'key-1',
        organizationId: 'org-1',
        name: 'Production Key',
        createdAt,
        updatedAt,
        deletedAt: null,
        lastUsedAt: null,
        keyHash: 'hash',
      },
      secret: 'manara_secret',
    });

    const response = await controller.create('org-1', {
      name: 'Production Key',
    });

    expect(serviceMock.createApiKey).toHaveBeenCalledWith('org-1', {
      name: 'Production Key',
    });
    expect(response).toBeInstanceOf(ApiKeyWithSecretResponseDto);
    expect(JSON.parse(JSON.stringify(response))).toMatchObject({
      id: 'key-1',
      name: 'Production Key',
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      lastUsedAt: null,
      secret: 'manara_secret',
    });
  });

  it('lists API keys for an organization', async () => {
    const createdAt = new Date('2024-05-01T00:00:00.000Z');
    const updatedAt = new Date('2024-05-02T00:00:00.000Z');
    serviceMock.listApiKeys.mockResolvedValue([
      {
        id: 'key-1',
        organizationId: 'org-1',
        name: 'First Key',
        createdAt,
        updatedAt,
        deletedAt: null,
        lastUsedAt: null,
        keyHash: 'hash',
      },
    ]);

    const response = await controller.findAll('org-1');

    expect(serviceMock.listApiKeys).toHaveBeenCalledWith('org-1');
    expect(Array.isArray(response)).toBe(true);
    expect(response[0]).toBeInstanceOf(ApiKeyResponseDto);
    expect(JSON.parse(JSON.stringify(response[0]))).toMatchObject({
      id: 'key-1',
      name: 'First Key',
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      lastUsedAt: null,
    });
  });

  it('revokes an API key', async () => {
    const updatedAt = new Date('2024-07-01T00:00:00.000Z');
    serviceMock.removeApiKey.mockResolvedValue({
      id: 'key-1',
      organizationId: 'org-1',
      name: 'First Key',
      createdAt: new Date('2024-05-01T00:00:00.000Z'),
      updatedAt,
      deletedAt: new Date('2024-07-01T00:00:00.000Z'),
      lastUsedAt: null,
      keyHash: 'hash',
    });

    const response = await controller.remove('org-1', 'key-1');

    expect(serviceMock.removeApiKey).toHaveBeenCalledWith('org-1', 'key-1');
    expect(response).toBeInstanceOf(ApiKeyResponseDto);
    expect(JSON.parse(JSON.stringify(response))).toMatchObject({
      id: 'key-1',
      updatedAt: updatedAt.toISOString(),
    });
  });
});
