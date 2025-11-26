const SENSITIVE_KEYS = new Set(['password', 'refreshToken']);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Object.prototype.toString.call(v) === '[object Object]';
}

/**
 * Strip sensitive keys from result.
 * If allowAtRoot contains a key, it is NOT stripped at depth 0 (root) only.
 * Nested objects/arrays still get stripped (safer).
 */
function stripSensitive<T>(
  data: T,
  opts: { allowAtRoot?: Set<string>; _depth?: number } = {},
): T {
  const depth = opts._depth ?? 0;

  if (Array.isArray(data)) {
    return data.map((item) =>
      stripSensitive(item, { ...opts, _depth: depth + 1 }),
    ) as T;
  }

  if (isPlainObject(data)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      const isSensitive = SENSITIVE_KEYS.has(k);
      const allowedAtRoot = depth === 0 && (opts.allowAtRoot?.has(k) ?? false);

      if (isSensitive && !allowedAtRoot) {
        // strip
        continue;
      }

      out[k] =
        v && (Array.isArray(v) || isPlainObject(v))
          ? stripSensitive(v as any, { ...opts, _depth: depth + 1 })
          : v;
    }
    return out as T;
  }

  return data;
}

/**
 * If caller explicitly selected a sensitive scalar on User,
 * allow it at root (for this query only).
 */
function getAllowedSensitiveKeysFromArgs(args: any): Set<string> {
  const allow = new Set<string>();
  const sel = args?.select;
  if (sel?.password === true) allow.add('password');
  if (sel?.refreshToken === true) allow.add('refreshToken');
  return allow;
}

export function withSensitiveRedaction() {
  return {
    name: 'sensitiveRedaction',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const result = await query(args);

          // Only redact User results
          if (model !== 'User') return result;

          // Redact for reads *and* writes that return a record
          const opsNeedingRedaction = new Set([
            // reads
            'findUnique',
            'findUniqueOrThrow',
            'findFirst',
            'findFirstOrThrow',
            'findMany',
            'aggregate',
            'groupBy',
            'count',
            // writes that return the record
            'create',
            'update',
            'upsert',
            'delete',
          ]);

          if (!opsNeedingRedaction.has(operation)) return result;

          const allowAtRoot = getAllowedSensitiveKeysFromArgs(args);
          return stripSensitive(result, { allowAtRoot });
        },
      },
    },
  };
}
