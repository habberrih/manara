import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  withOrganizationScope,
  withSensitiveRedaction,
  withSoftDeleteFilter,
} from 'src/helpers';
import { TenantContextService } from 'src/tenant/tenant-context.service';

/**
 * PrismaService is a wrapper around the PrismaClient that provides database access
 * with proper lifecycle management and environment-aware logging.
 *
 * @remarks
 * This service extends the base PrismaClient and implements NestJS's OnModuleInit
 * and OnModuleDestroy interfaces to ensure proper database connection management.
 * It configures logging based on the current environment (development/production).
 *
 * @example
 * // Basic usage in a service
 * ```typescript
 * @Injectable()
 * export class UserService {
 *   constructor(private prisma: PrismaService) {}
 *
 *   async findUser(id: number) {
 *     return this.prisma.user.findUnique({ where: { id } });
 *   }
 * }
 * ```
 *
 * @example
 * // Environment variables used:
 * // - NODE_ENV: Determines the logging level ('production' or 'development')
 * // - DATABASE_URL: Connection string for the database (handled by Prisma)
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  /**
   * Creates an instance of PrismaService
   *
   * @param {ConfigService} configService - The configuration service for environment variables
   * @param {string} [configService.get('NODE_ENV')] - Determines the logging level
   */
  constructor(
    private readonly configService: ConfigService,
    private readonly tenantContext: TenantContextService,
  ) {
    const env = configService.get<string>('NODE_ENV') || 'development';
    super({
      log: PrismaService.resolveLogging(env),
    });

    // IMPORTANT: compose in this order (args first, then result):
    // 1) soft-delete injects filters into args
    // 2) redaction strips sensitive fields from results
    const withSoftDelete = withSoftDeleteFilter(this, {
      field: 'deletedAt',
      // Apply soft-delete filter only to models that define deletedAt
      models: ['User', 'Organization', 'Membership', 'ApiKey'],
      // operations: ['findFirst','findMany','count','aggregate','groupBy'],
    });

    const withTenantScope = withOrganizationScope(
      withSoftDelete,
      tenantContext,
      {
        field: 'organizationId',
        models: ['Membership', 'Subscription', 'ApiKey'],
      },
    );

    const extended = withSensitiveRedaction(withTenantScope);
    Object.assign(this, extended);
  }

  /**
   * Initializes the database connection when the module is initialized
   *
   * @remarks
   * This method is automatically called by NestJS when the application starts.
   * It establishes the database connection and logs the connection status.
   *
   * @returns {Promise<void>}
   */
  async onModuleInit(): Promise<void> {
    this.logger.log('Connecting to the database...');
    await this.$connect();
    this.logger.log('Connected to the database.');
  }

  /**
   * Closes the database connection when the module is destroyed
   *
   * @remarks
   * This method is automatically called by NestJS when the application shuts down.
   * It ensures that all database connections are properly closed.
   *
   * @returns {Promise<void>}
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('Disconnecting from the database...');
    await this.$disconnect();
    this.logger.log('Disconnected from the database.');
  }

  /**
   * Determines the appropriate logging configuration based on the environment
   *
   * @private
   * @static
   * @param {string} env - The current environment ('production' or 'development')
   * @returns {(Prisma.LogLevel | Prisma.LogDefinition)[]} Array of log levels for Prisma
   *
   * @remarks
   * In production, only errors are logged. In development, more verbose logging
   * is enabled including queries, info, warnings, and errors.
   */
  private static resolveLogging(
    env: string,
  ): (Prisma.LogLevel | Prisma.LogDefinition)[] {
    return env === 'production'
      ? ['error']
      : ['query', 'info', 'warn', 'error'];
  }
}
