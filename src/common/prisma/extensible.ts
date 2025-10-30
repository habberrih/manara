import { PrismaClient } from '@prisma/client';

export type PrismaExtensible = { $extends: PrismaClient['$extends'] };
