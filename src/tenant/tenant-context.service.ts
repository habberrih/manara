import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { TenantContextStore } from './types/tenant-context-store.type';

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantContextStore>();

  runWithin<T>(organizationId: string | undefined, callback: () => T): T {
    return this.storage.run({ organizationId }, callback);
  }

  getOrganizationId(): string | undefined {
    return this.storage.getStore()?.organizationId;
  }
}
