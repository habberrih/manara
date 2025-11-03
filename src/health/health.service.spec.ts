import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;
  let prisma: { $queryRaw: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRaw: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: PrismaService,
          useValue: prisma as unknown as PrismaService,
        },
      ],
    }).compile();

    service = module.get(HealthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('reports ok status when database check passes', async () => {
    prisma.$queryRaw.mockResolvedValueOnce(1);

    const result = await service.check();

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(result.status).toBe('ok');
    expect(result.checks.database).toEqual({ status: 'up' });
    expect(result.checks.provider).toEqual({
      status: 'pending',
      message: 'Provider checks are not implemented yet.',
    });
    expect(new Date(result.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('reports error status when database check fails', async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error('connection failed'));

    const result = await service.check();

    expect(result.status).toBe('error');
    expect(result.checks.database).toEqual({
      status: 'down',
      message: 'connection failed',
    });
  });
});
