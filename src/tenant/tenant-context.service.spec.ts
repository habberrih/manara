import { Test, TestingModule } from '@nestjs/testing';
import { TenantContextService } from './tenant-context.service';

describe('TenantContextService', () => {
  let service: TenantContextService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TenantContextService],
    }).compile();

    service = module.get(TenantContextService);
  });

  it('returns undefined when no context is active', () => {
    expect(service.getOrganizationId()).toBeUndefined();
  });

  it('stores organization id within runWithin scope', () => {
    service.runWithin('org-1', () => {
      expect(service.getOrganizationId()).toBe('org-1');
    });
  });

  it('isolates contexts for concurrent executions', async () => {
    const results: string[] = [];

    await Promise.all([
      new Promise<void>((resolve) => {
        service.runWithin('org-1', () => {
          setTimeout(() => {
            results.push(service.getOrganizationId() ?? 'missing');
            resolve();
          }, 0);
        });
      }),
      new Promise<void>((resolve) => {
        service.runWithin('org-2', () => {
          setTimeout(() => {
            results.push(service.getOrganizationId() ?? 'missing');
            resolve();
          }, 0);
        });
      }),
    ]);

    expect(results.sort()).toEqual(['org-1', 'org-2']);
  });

  it('returns callback result from runWithin', () => {
    const value = service.runWithin('org-3', () => 'result');
    expect(value).toBe('result');
  });
});
