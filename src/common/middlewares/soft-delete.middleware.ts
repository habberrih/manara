type SoftDeleteOpts = {
  /** The soft-delete field name. Defaults to 'deletedAt'. */
  field?: string;
  /**
   * Limit to specific models, e.g. ['User', 'Post'].
   * If omitted, applies to all models.
   */
  models?: string[];
  /**
   * Which operations to filter. Defaults to common read ops.
   * (findUnique/OrThrow are handled specially below.)
   */
  operations?: Array<
    'findFirst' | 'findMany' | 'count' | 'aggregate' | 'groupBy'
  >;
};

/** --- tiny utils & type guards --- */
type AnyArgs = Record<string, any>;
const lc = (s: string) => s.toLowerCase();
const isObject = (v: unknown): v is Record<string, unknown> =>
  v != null && typeof v === 'object' && !Array.isArray(v);

function hasKeyDeep(obj: unknown, key: string): boolean {
  if (obj == null) return false;
  if (Array.isArray(obj)) return obj.some((v) => hasKeyDeep(v, key));
  if (isObject(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      if (k === key) return true;
      if (v && typeof v === 'object' && hasKeyDeep(v, key)) return true;
    }
  }
  return false;
}

function getWhere(args: unknown): any | undefined {
  if (!isObject(args)) return undefined;
  // TS-safe: only read where if it exists
  return 'where' in args ? (args as AnyArgs).where : undefined;
}

function withWhere(args: unknown, newWhere: any): AnyArgs {
  const base = (isObject(args) ? (args as AnyArgs) : {}) as AnyArgs;
  return { ...base, where: newWhere };
}

/**
 * Treats findUnique/findUniqueOrThrow "like others":
 *  - If caller already mentions deletedAt anywhere: respect & bypass.
 *  - Else try to add { deletedAt: null } directly to unique where.
 *  - If Prisma rejects due to unique-shape requirements, fallback to findFirst with AND filter.
 */
export function withSoftDeleteFilter(opts: SoftDeleteOpts = {}) {
  const field = opts.field ?? 'deletedAt';
  const allowedModels = opts.models?.map(lc);
  const readOps = new Set(
    (opts.operations ?? [
      'findFirst',
      'findMany',
      'count',
      'aggregate',
      'groupBy',
    ]) as string[],
  );

  return {
    name: 'softDeleteFilter',

    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          // respect model filter
          if (allowedModels && !allowedModels.includes(lc(model))) {
            return query(args);
          }

          // ---- findUnique / findUniqueOrThrow: optimistic + fallback ----
          if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
            const where = getWhere(args);

            // explicit caller intent -> bypass
            if (hasKeyDeep(where, field)) {
              return query(args);
            }

            // optimistic: add `{ deletedAt: null }` alongside unique keys
            const optimisticWhere = isObject(where)
              ? { ...(where as AnyArgs), [field]: null }
              : { [field]: null };
            const optimisticArgs = withWhere(args, optimisticWhere);

            try {
              return await query(optimisticArgs);
            } catch (e: any) {
              // If Prisma complains about shape/overload, fallback to findFirst + AND
              const msg = String(e?.message ?? '');
              const looksLikeShapeError =
                msg.includes('Unknown arg') ||
                (msg.includes('Argument') && msg.includes('is missing')) ||
                msg.includes('Exactly one of') ||
                (msg.includes('expected') && msg.includes('where'));

              if (!looksLikeShapeError) throw e;

              const ffWhere = where
                ? { AND: [{ [field]: null }, where] }
                : { [field]: null };

              const delegate: any = this[lc(model)];
              const ffArgs: any = withWhere(args, ffWhere);

              // Using delegate.findFirst(...) instead of query(...) to avoid infinite recursion
              return await delegate.findFirst(ffArgs);
            }
          }

          // ---- General read ops (findFirst/findMany/count/aggregate/groupBy) ----
          if (readOps.has(operation)) {
            const where = getWhere(args);

            if (hasKeyDeep(where, field)) {
              // caller specified deletedAt -> bypass
              return query(args);
            }

            const injectedWhere = where
              ? { AND: [{ [field]: null }, where] }
              : { [field]: null };
            const injectedArgs = withWhere(args, injectedWhere);

            return query(injectedArgs);
          }

          // other ops: pass through
          return query(args);
        },
      },
    },
  };
}
