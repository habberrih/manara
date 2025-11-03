import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let healthService: { check: jest.Mock };

  beforeEach(async () => {
    healthService = { check: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: healthService }],
    }).compile();

    controller = module.get(HealthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns health status from service', async () => {
    const response = { status: 'ok' };
    healthService.check.mockResolvedValue(response);

    const result = await controller.getHealth();

    expect(healthService.check).toHaveBeenCalled();
    expect(result).toBe(response);
  });
});
