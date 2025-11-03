import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '../src/health/health.controller';
import { HealthService } from '../src/health/health.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('HealthController (integration)', () => {
  let app: INestApplication;
  const prismaMock = {
    $queryRaw: jest.fn().mockResolvedValue([1]),
  } as unknown as PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports database status as up', async () => {
    const controller = app.get(HealthController);
    const response = await controller.getHealth();

    expect(prismaMock.$queryRaw as unknown as jest.Mock).toHaveBeenCalled();
    expect(response).toMatchObject({
      status: 'ok',
      checks: {
        database: { status: 'up' },
      },
    });
    expect(typeof response.timestamp).toBe('string');
  });
});
