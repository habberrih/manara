import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationMemberGuard } from 'src/common';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';

describe('SubscriptionsController', () => {
  let controller: SubscriptionsController;
  let subscriptionsService: {
    syncPlans: jest.Mock;
    ensureCustomer: jest.Mock;
  };

  beforeEach(async () => {
    subscriptionsService = {
      syncPlans: jest.fn(),
      ensureCustomer: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SubscriptionsController],
      providers: [
        { provide: SubscriptionsService, useValue: subscriptionsService },
      ],
    })
      .overrideGuard(OrganizationMemberGuard)
      .useValue({ canActivate: jest.fn().mockReturnValue(true) })
      .compile();

    controller = module.get(SubscriptionsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('syncs plans via service', async () => {
    const summary = { created: 1, updated: 2, deactivated: 0 };
    subscriptionsService.syncPlans.mockResolvedValue(summary);

    const result = await controller.syncPlans({ limit: 20 });

    expect(subscriptionsService.syncPlans).toHaveBeenCalledWith({ limit: 20 });
    expect(result).toBe(summary);
  });

  it('ensures customer for organization', async () => {
    subscriptionsService.ensureCustomer.mockResolvedValue('cus_123');

    const result = await controller.ensureCustomer('org-1');

    expect(subscriptionsService.ensureCustomer).toHaveBeenCalledWith('org-1');
    expect(result).toEqual({ customerId: 'cus_123' });
  });
});
