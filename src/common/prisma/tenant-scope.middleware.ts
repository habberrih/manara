import { TenantContextService } from 'src/tenant/tenant-context.service';

type TenantScopeOptions = {
  field?: string;
  models?: string[];
};

type AnyArgs = Record<string, unknown>;

const lc = (value: string) => value.toLowerCase();
const isObject = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value);

const readOperations = new Set([
  'findFirst',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

const scopedWriteOperations = new Set(['updateMany', 'deleteMany']);
const createOperations = new Set(['create', 'createMany']);

function getWhere(args: unknown): AnyArgs | undefined {
  if (!isObject(args)) return undefined;
  const candidate = args.where;
  if (!isObject(candidate)) return undefined;
  return candidate;
}

function getData(args: unknown): unknown {
  if (!isObject(args)) return undefined;
  return args.data;
}

function withWhere(args: unknown, where: AnyArgs): AnyArgs {
  const base = isObject(args) ? { ...args } : {};
  base.where = where;
  return base;
}

function mergeWhere(existing: AnyArgs | undefined, injected: AnyArgs): AnyArgs {
  if (!existing || Object.keys(existing).length === 0) {
    return injected;
  }

  return { AND: [existing, injected] };
}

function ensureDataHasOrganizationId(
  data: unknown,
  field: string,
  organizationId: string,
): unknown {
  if (Array.isArray(data)) {
    return data.map((item) =>
      ensureDataHasOrganizationId(item, field, organizationId),
    );
  }

  if (!isObject(data)) {
    return data;
  }

  const currentValue = (data as AnyArgs)[field];
  if (currentValue && currentValue !== organizationId) {
    throw new Error('Tenant scope violation: organizationId mismatch.');
  }

  return { ...data, [field]: organizationId };
}

export function withOrganizationScope(
  tenantContext: TenantContextService,
  opts: TenantScopeOptions = {},
) {
  const field = opts.field ?? 'organizationId';
  const scopedModels = opts.models?.map(lc);

  return {
    name: 'organizationScope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (scopedModels && !scopedModels.includes(lc(model))) {
            return query(args);
          }

          const organizationId = tenantContext.getOrganizationId();
          if (!organizationId) {
            return query(args);
          }

          if (
            readOperations.has(operation) ||
            scopedWriteOperations.has(operation)
          ) {
            const existingWhere = getWhere(args);
            const scopedWhere = mergeWhere(existingWhere, {
              [field]: organizationId,
            });
            const scopedArgs = withWhere(args, scopedWhere);
            return query(scopedArgs);
          }

          if (createOperations.has(operation)) {
            const data = ensureDataHasOrganizationId(
              getData(args),
              field,
              organizationId,
            );
            const nextArgs = isObject(args) ? { ...args, data } : { data };
            return query(nextArgs);
          }

          return query(args);
        },
      },
    },
  };
}
