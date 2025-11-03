import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationMemberGuard } from '../src/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { SubscriptionsController } from '../src/subscriptions/subscriptions.controller';
import { SubscriptionsService } from '../src/subscriptions/subscriptions.service';

describe('SubscriptionsController (e2e)', () => {
  let app: INestApplication;
  let controller: SubscriptionsController;
  const subscriptionsServiceMock = {
    syncPlans: jest.fn(),
    ensureCustomer: jest.fn(),
  };

  beforeAll(async () => {
    const prismaStub = {
      membership: {
        findUnique: jest.fn(),
      },
    } as unknown as PrismaService;
    const organizationGuardStub = { canActivate: jest.fn(() => true) };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionsController],
      providers: [
        { provide: SubscriptionsService, useValue: subscriptionsServiceMock },
        { provide: PrismaService, useValue: prismaStub },
        { provide: OrganizationMemberGuard, useValue: organizationGuardStub },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    controller = app.get(SubscriptionsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('synchronizes plans via the service', async () => {
    subscriptionsServiceMock.syncPlans.mockResolvedValue({
      created: 1,
      updated: 2,
      deactivated: 0,
    });

    const response = await controller.syncPlans({ limit: 50 });

    expect(subscriptionsServiceMock.syncPlans).toHaveBeenCalledWith({
      limit: 50,
    });
    expect(response).toEqual({
      created: 1,
      updated: 2,
      deactivated: 0,
    });
  });

  it('ensures a Stripe customer exists for an organization', async () => {
    subscriptionsServiceMock.ensureCustomer.mockResolvedValue('cus_123');

    const response = await controller.ensureCustomer('org-1');

    expect(subscriptionsServiceMock.ensureCustomer).toHaveBeenCalledWith(
      'org-1',
    );
    expect(response).toEqual({ customerId: 'cus_123' });
  });
});
