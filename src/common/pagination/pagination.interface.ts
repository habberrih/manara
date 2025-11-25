import { Prisma } from '../../../prisma/generated/client';

export interface PaginationInterface<T> {
  data: T[];
  total: number;
  count: number;
}

export type SearchableFields = {
  items: string[]; // names of string fields to apply OR/contains to
  mode?: Prisma.QueryMode; // 'default' | 'insensitive'
};

export type DelegateOf<TModel> = {
  findMany: (args?: {
    where?: Record<string, unknown>;
    include?: Record<string, unknown>;
    take?: number;
    skip?: number;
    orderBy?: Record<string, unknown>;
  }) => Promise<TModel[]>;
  count: (args?: { where?: Record<string, unknown> }) => Promise<number>;
};
