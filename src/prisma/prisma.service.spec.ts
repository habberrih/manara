const connectMock = jest.fn();
const disconnectMock = jest.fn();

const withSoftDeleteFilterMock = jest.fn(() => {
  return {
    name: 'softDeleteExt',
    query: { $allModels: { $allOperations: jest.fn() } },
  } as any;
});

const withOrganizationScopeMock = jest.fn(() => {
  return {
    name: 'orgScopeExt',
    query: { $allModels: { $allOperations: jest.fn() } },
  } as any;
});

const withSensitiveRedactionMock = jest.fn(() => {
  return {
    name: 'sensitiveExt',
    query: { $allModels: { $allOperations: jest.fn() } },
  } as any;
});

jest.mock('../../prisma/generated/client', () => {
  class PrismaClientMock {
    public _log: any;
    constructor(options?: { log?: any }) {
      this._log = options?.log ?? [];
    }

    $connect = connectMock;
    $disconnect = disconnectMock;
    $extends(..._args: any[]) {
      const chain: any = { $extends: (_: any) => chain };
      return chain;
    }
  }

  const PrismaStub = {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code?: string;
      constructor(message: string, info?: { code?: string }) {
        super(message);
        this.code = info?.code;
      }
    },
  };

  return {
    PrismaClient: PrismaClientMock,
    Prisma: PrismaStub,
  };
});

jest.mock('src/common', () => {
  const actual = jest.requireActual('src/common');
  return {
    ...actual,
    withSoftDeleteFilter: withSoftDeleteFilterMock,
    withOrganizationScope: withOrganizationScopeMock,
    withSensitiveRedaction: withSensitiveRedactionMock,
  };
});

import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TenantContextService } from 'src/tenant/tenant-context.service';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;
  let configService: { get: jest.Mock };
  let tenantContext: { getOrganizationId: jest.Mock };

  beforeEach(async () => {
    connectMock.mockReset();
    disconnectMock.mockReset();
    withSoftDeleteFilterMock.mockClear();
    withOrganizationScopeMock.mockClear();
    withSensitiveRedactionMock.mockClear();

    configService = {
      get: jest.fn((key: string) =>
        key === 'NODE_ENV' ? 'development' : undefined,
      ),
    };
    tenantContext = {
      getOrganizationId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        { provide: ConfigService, useValue: configService },
        { provide: TenantContextService, useValue: tenantContext },
      ],
    }).compile();

    service = module.get(PrismaService);
  });

  it('configures Prisma logging according to environment', () => {
    expect((service as any)._log).toEqual(
      PrismaService['resolveLogging']('development'),
    );
  });

  it('invokes soft delete, tenant scope, and redaction helpers during construction', () => {
    expect(withSoftDeleteFilterMock).toHaveBeenCalledWith(
      expect.objectContaining({
        field: 'deletedAt',
        models: ['User', 'Organization', 'Membership', 'ApiKey'],
      }),
    );

    expect(withOrganizationScopeMock).toHaveBeenCalledWith(
      tenantContext,
      expect.objectContaining({
        field: 'organizationId',
        models: ['Membership', 'Subscription', 'ApiKey'],
      }),
    );

    expect(withSensitiveRedactionMock).toHaveBeenCalled();
  });

  it('connects and disconnects via lifecycle hooks', async () => {
    await service.onModuleInit();
    expect(connectMock).toHaveBeenCalled();

    await service.onModuleDestroy();
    expect(disconnectMock).toHaveBeenCalled();
  });
});
