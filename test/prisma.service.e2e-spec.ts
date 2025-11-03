jest.mock('@prisma/client', () => {
  class PrismaClientMock {
    public $connect = jest.fn().mockResolvedValue(undefined);
    public $disconnect = jest.fn().mockResolvedValue(undefined);
    public use = jest.fn();
  }

  return {
    PrismaClient: PrismaClientMock,
    Prisma: {},
  };
});

jest.mock('src/common', () => {
  const original = jest.requireActual('src/common');
  return {
    ...original,
    withSoftDeleteFilter: jest.fn((client: unknown) => client),
    withOrganizationScope: jest.fn((client: unknown) => client),
    withSensitiveRedaction: jest.fn((client: unknown) => client),
  };
});

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/prisma/prisma.service';
import { TenantContextService } from 'src/tenant/tenant-context.service';

describe('PrismaService (integration-like)', () => {
  let configMock: ConfigService;
  let tenantContextMock: TenantContextService;

  beforeEach(() => {
    configMock = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'test';
        return undefined;
      }),
    } as unknown as ConfigService;

    tenantContextMock = new TenantContextService();
  });

  it('selects verbose logging outside production', () => {
    const logging = (PrismaService as any).resolveLogging('development');
    expect(logging).toEqual(['query', 'info', 'warn', 'error']);
  });

  it('limits logging in production', () => {
    const logging = (PrismaService as any).resolveLogging('production');
    expect(logging).toEqual(['error']);
  });

  it('disables Prisma logging in test environment', () => {
    const logging = (PrismaService as any).resolveLogging('test');
    expect(logging).toEqual([]);
  });

  it('connects and disconnects via lifecycle hooks', async () => {
    const service = new PrismaService(configMock, tenantContextMock);

    const connectSpy = jest.spyOn(service, '$connect');
    const disconnectSpy = jest.spyOn(service, '$disconnect');

    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('logs lifecycle events when logging is enabled', async () => {
    const localConfig = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'development';
        return undefined;
      }),
    } as unknown as ConfigService;
    const service = new PrismaService(localConfig, tenantContextMock);
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    await service.onModuleInit();
    await service.onModuleDestroy();

    expect(logSpy).toHaveBeenCalledWith('Connecting to the database...');
    expect(logSpy).toHaveBeenCalledWith('Connected to the database.');
    expect(logSpy).toHaveBeenCalledWith('Disconnecting from the database...');
    expect(logSpy).toHaveBeenCalledWith('Disconnected from the database.');
    logSpy.mockRestore();
  });
});
