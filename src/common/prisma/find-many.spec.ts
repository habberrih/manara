import { findManyAndCount } from './find-many';

describe('findManyAndCount', () => {
  const createDelegate = () => ({
    findMany: jest.fn(),
    count: jest.fn(),
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('applies pagination defaults and returns aggregated result', async () => {
    const delegate = createDelegate();
    const items = [{ id: '1' }, { id: '2' }];
    delegate.findMany.mockResolvedValue(items);
    delegate.count.mockResolvedValue(5);

    const result = await findManyAndCount(delegate as any, {});

    expect(delegate.findMany).toHaveBeenCalledWith({
      take: 10,
      skip: 0,
      where: undefined,
      include: undefined,
      orderBy: undefined,
    });
    expect(result).toEqual({ data: items, total: 5, count: items.length });
  });

  it('respects provided pagination, include, and orderBy options', async () => {
    const delegate = createDelegate();
    delegate.findMany.mockResolvedValue([]);
    delegate.count.mockResolvedValue(0);

    await findManyAndCount(delegate as any, {
      take: 25,
      skip: 50,
      include: { memberships: true },
      orderBy: { createdAt: 'desc' },
    });

    expect(delegate.findMany).toHaveBeenCalledWith({
      take: 25,
      skip: 50,
      where: undefined,
      include: { memberships: true },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('adds search conditions with case-insensitive mode by default', async () => {
    const delegate = createDelegate();
    delegate.findMany.mockResolvedValue([]);
    delegate.count.mockResolvedValue(0);

    await findManyAndCount(delegate as any, {
      search: 'acme',
      searchableFields: {
        items: ['name', 'slug'],
      },
    });

    const args = delegate.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      OR: [
        { name: { contains: 'acme', mode: 'insensitive' } },
        { slug: { contains: 'acme', mode: 'insensitive' } },
      ],
    });
  });

  it('combines soft delete filter with existing where clauses', async () => {
    const delegate = createDelegate();
    delegate.findMany.mockResolvedValue([]);
    delegate.count.mockResolvedValue(0);

    await findManyAndCount(delegate as any, {
      where: { plan: 'PRO' },
      enforceSoftDeleteKey: 'deletedAt',
    });

    const args = delegate.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      AND: [{ plan: 'PRO' }, { deletedAt: null }],
    });
  });
});
