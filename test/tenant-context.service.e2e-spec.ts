import { TenantContextService } from 'src/tenant/tenant-context.service';

describe('TenantContextService (integration-like)', () => {
  let service: TenantContextService;

  beforeEach(() => {
    service = new TenantContextService();
  });

  it('returns undefined when no context is active', () => {
    expect(service.getOrganizationId()).toBeUndefined();
  });

  it('stores and retrieves organization id within runWithin scope', () => {
    const insideValue = service.runWithin('org-123', () => {
      return service.getOrganizationId();
    });

    expect(insideValue).toBe('org-123');
    expect(service.getOrganizationId()).toBeUndefined();
  });

  it('supports nested contexts and restores parent scope', () => {
    service.runWithin('parent-org', () => {
      expect(service.getOrganizationId()).toBe('parent-org');

      const inner = service.runWithin('child-org', () => {
        expect(service.getOrganizationId()).toBe('child-org');
        return 'inner-return';
      });

      expect(inner).toBe('inner-return');
      expect(service.getOrganizationId()).toBe('parent-org');
    });

    expect(service.getOrganizationId()).toBeUndefined();
  });
});
