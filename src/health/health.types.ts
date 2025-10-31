export type HealthStatus = 'up' | 'down' | 'pending';

export interface HealthCheckResult {
  status: HealthStatus;
  message?: string;
}

export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  checks: {
    database: HealthCheckResult;
    provider: HealthCheckResult;
  };
}
