import { withOrganizationScope } from './tenant-scope.middleware';

describe('withOrganizationScope', () => {
  const createTenantContext = (organizationId?: string) => ({
    getOrganizationId: jest.fn(() => organizationId),
  });

  const invoke = async ({
    operation,
    args,
    organizationId,
    models = ['Subscription'],
    model = 'Subscription',
  }: {
    operation: string;
    args?: any;
    organizationId?: string;
    models?: string[];
    model?: string;
  }) => {
    const tenantContext = createTenantContext(organizationId);
    const extended = withOrganizationScope(tenantContext as any, {
      models,
    }) as any;

    const handler = extended.query.$allModels.$allOperations;
    const query = jest.fn((nextArgs) => Promise.resolve(nextArgs));

    const result = await handler({
      model,
      operation,
      args,
      query,
    });

    return { result, queryArgs: query.mock.calls[0]?.[0], tenantContext };
  };

  it('injects organizationId into read operations', async () => {
    const { queryArgs } = await invoke({
      operation: 'findMany',
      args: { where: { status: 'active' } },
      organizationId: 'org-1',
    });

    expect(queryArgs.where).toEqual({
      AND: [{ status: 'active' }, { organizationId: 'org-1' }],
    });
  });

  it('attaches organizationId to create operations', async () => {
    const { queryArgs } = await invoke({
      operation: 'create',
      args: { data: { name: 'Test' } },
      organizationId: 'org-2',
    });

    expect(queryArgs.data).toEqual({
      name: 'Test',
      organizationId: 'org-2',
    });
  });

  it('throws when create data contains mismatched organizationId', async () => {
    await expect(
      invoke({
        operation: 'create',
        args: { data: { organizationId: 'wrong' } },
        organizationId: 'org-3',
      }),
    ).rejects.toThrow('Tenant scope violation');
  });

  it('bypasses scoping when no organization is associated', async () => {
    const { queryArgs } = await invoke({
      operation: 'findMany',
      args: { where: { status: 'active' } },
      organizationId: undefined,
    });

    expect(queryArgs).toEqual({ where: { status: 'active' } });
  });

  it('ignores models outside the configured set', async () => {
    const { queryArgs } = await invoke({
      operation: 'findMany',
      args: { where: { status: 'active' } },
      organizationId: 'org-1',
      models: ['Subscription'],
      model: 'User',
    });

    expect(queryArgs).toEqual({ where: { status: 'active' } });
  });
});
