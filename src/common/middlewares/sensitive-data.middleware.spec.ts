import { withSensitiveRedaction } from './sensitive-data.middleware';

describe('withSensitiveRedaction', () => {
  const createExtended = () => {
    return withSensitiveRedaction() as any;
  };

  it('strips sensitive fields from user results', async () => {
    const extended = createExtended();
    const handler = extended.query.$allModels.$allOperations;
    const query = jest.fn().mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      password: 'secret',
      refreshToken: 'hashed',
    });

    const result = await handler({
      model: 'User',
      operation: 'findUnique',
      args: {},
      query,
    });

    expect(result).toEqual({
      id: 'user-1',
      email: 'test@example.com',
    });
  });

  it('allows root-level sensitive keys when explicitly selected', async () => {
    const extended = createExtended();
    const handler = extended.query.$allModels.$allOperations;
    const query = jest.fn().mockResolvedValue({
      id: 'user-1',
      password: 'secret',
      profile: { password: 'nested-secret' },
    });

    const result = await handler({
      model: 'User',
      operation: 'findUnique',
      args: { select: { password: true } },
      query,
    });

    expect(result).toEqual({
      id: 'user-1',
      password: 'secret',
      profile: {},
    });
  });

  it('skips redaction for non-user models', async () => {
    const extended = createExtended();
    const handler = extended.query.$allModels.$allOperations;
    const payload = { token: 'value' };
    const query = jest.fn().mockResolvedValue(payload);

    const result = await handler({
      model: 'Subscription',
      operation: 'findMany',
      args: {},
      query,
    });

    expect(result).toBe(payload);
  });

  it('ignores operations that are not listed for redaction', async () => {
    const extended = createExtended();
    const handler = extended.query.$allModels.$allOperations;
    const payload = { password: 'secret' };
    const query = jest.fn().mockResolvedValue(payload);

    const result = await handler({
      model: 'User',
      operation: 'deleteMany',
      args: {},
      query,
    });

    expect(result).toBe(payload);
  });
});
