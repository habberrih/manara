import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { Public } from 'src/common';
import { HealthService } from './health.service';
import { HealthResponse } from './health.types';

@Controller({
  path: 'health',
  version: VERSION_NEUTRAL,
})
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @Public()
  async getHealth(): Promise<HealthResponse> {
    return this.healthService.check();
  }
}
