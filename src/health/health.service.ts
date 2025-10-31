import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { HealthCheckResult, HealthResponse } from './health.types';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthResponse> {
    const [database] = await Promise.all([this.checkDatabase()]);

    const provider: HealthCheckResult = {
      status: 'pending',
      message: 'Provider checks are not implemented yet.',
    };

    return {
      status: this.resolveOverallStatus([database]),
      timestamp: new Date().toISOString(),
      checks: {
        database,
        provider,
      },
    };
  }

  private async checkDatabase(): Promise<HealthCheckResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up' };
    } catch (error) {
      return {
        status: 'down',
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private resolveOverallStatus(checks: HealthCheckResult[]): 'ok' | 'error' {
    const hasDown = checks.some((check) => check.status === 'down');
    return hasDown ? 'error' : 'ok';
  }
}
