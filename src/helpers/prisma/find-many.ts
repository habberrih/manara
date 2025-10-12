import { Prisma } from '@prisma/client';
import { DelegateOf, PaginationInterface, SearchableFields } from '..';

export async function findManyAndCount<
  TModel,
  TDelegate extends DelegateOf<TModel>,
>(
  delegate: TDelegate,
  params?: {
    take?: number;
    skip?: number;
    where?: Record<string, unknown>;
    include?: Record<string, unknown>;
    orderBy?: Record<string, unknown>;
    search?: string;
    searchableFields?: SearchableFields;
    enforceSoftDeleteKey?: string; // e.g. 'deletedAt'
    enforceUpdatedAtOrder?: boolean;
  },
): Promise<PaginationInterface<TModel>> {
  const take = Math.min(Math.max(params?.take ?? 10, 1), 100);
  const skip = Math.max(params?.skip ?? 0, 0);

  // ---- Build where safely ----
  const baseWhere = { ...(params?.where ?? {}) };

  const softDeleteWhere = params?.enforceSoftDeleteKey
    ? { [params.enforceSoftDeleteKey]: null as null }
    : undefined;

  let searchWhere: Record<string, unknown> | undefined;
  if (params?.search && params.searchableFields?.items?.length) {
    const mode: Prisma.QueryMode =
      params.searchableFields.mode ?? 'insensitive';
    searchWhere = {
      OR: params.searchableFields.items.map((field) => ({
        [field]: { contains: params.search!, mode },
      })),
    };
  }

  const andParts = [baseWhere, softDeleteWhere, searchWhere].filter(
    (p) => p && Object.keys(p).length,
  ) as Record<string, unknown>[];

  const where =
    andParts.length === 0
      ? undefined
      : andParts.length === 1
        ? andParts[0]
        : { AND: andParts };

  // ---- Include / Order ----
  const include = params?.include ?? undefined;
  const orderBy =
    params?.orderBy ??
    (params?.enforceUpdatedAtOrder ? { updatedAt: 'desc' } : undefined);

  // ---- Run queries (NOTE: await Promise.all) ----
  const [data, total] = await Promise.all([
    delegate.findMany({ take, skip, where, include, orderBy }),
    delegate.count({ where }),
  ]);

  return {
    data,
    total,
    count: data.length,
  };
}
