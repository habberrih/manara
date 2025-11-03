import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PaginationInterface } from '../src/common';
import { UserResponseDto } from '../src/user/entities/user.entity';
import { UsersController } from '../src/user/user.controller';
import { UsersService } from '../src/user/user.service';

describe('UsersController (e2e)', () => {
  let app: INestApplication;
  let controller: UsersController;
  let usersServiceMock: {
    findOneUser: jest.Mock;
    findAll: jest.Mock;
    updateUser: jest.Mock;
    updatePassword: jest.Mock;
    removeUser: jest.Mock;
  };

  beforeAll(async () => {
    usersServiceMock = {
      findOneUser: jest.fn(),
      findAll: jest.fn(),
      updateUser: jest.fn(),
      updatePassword: jest.fn(),
      removeUser: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersServiceMock }],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    controller = app.get(UsersController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the current user sanitized of sensitive fields', async () => {
    const createdAt = new Date('2024-03-01T10:00:00.000Z');
    const updatedAt = new Date('2024-03-02T10:00:00.000Z');
    usersServiceMock.findOneUser.mockResolvedValue({
      id: 'user-123',
      email: 'demo@example.com',
      name: 'Demo User',
      isSuperAdmin: false,
      createdAt,
      updatedAt,
      deletedAt: null,
      password: 'hashed-value',
      refreshToken: 'should-be-hidden',
    });

    const response = await controller.findMe({ id: 'user-123' } as any);

    expect(usersServiceMock.findOneUser).toHaveBeenCalledWith('user-123');
    expect(response).toBeInstanceOf(UserResponseDto);

    const serialized = JSON.parse(JSON.stringify(response));
    expect(serialized).toEqual({
      id: 'user-123',
      email: 'demo@example.com',
      name: 'Demo User',
      isSuperAdmin: false,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
      deletedAt: null,
    });
    expect(serialized).not.toHaveProperty('password');
    expect(serialized).not.toHaveProperty('refreshToken');
  });

  it('passes pagination parameters through to the service', async () => {
    const page: PaginationInterface<any> = {
      data: [],
      count: 0,
      total: 0,
    };
    usersServiceMock.findAll.mockResolvedValue(page);

    const result = await controller.findAll({ take: 10, skip: 20 } as any);

    expect(usersServiceMock.findAll).toHaveBeenCalledWith({
      take: 10,
      skip: 20,
    });
    expect(result).toBe(page);
  });

  it('fetches a user by identifier', async () => {
    usersServiceMock.findOneUser.mockResolvedValue({
      id: 'user-123',
      email: 'demo@example.com',
      name: 'Lookup User',
      isSuperAdmin: false,
      createdAt: new Date('2024-03-01T10:00:00.000Z'),
      updatedAt: new Date('2024-03-02T10:00:00.000Z'),
      deletedAt: null,
    });

    const response = await controller.findOne('user-123');

    expect(usersServiceMock.findOneUser).toHaveBeenCalledWith('user-123');
    expect(response).toBeInstanceOf(UserResponseDto);
  });

  it('updates a user and returns a serialized DTO', async () => {
    const updatedAt = new Date('2024-05-01T09:00:00.000Z');
    usersServiceMock.updateUser.mockResolvedValue({
      id: 'user-123',
      email: 'demo@example.com',
      name: 'Updated Name',
      isSuperAdmin: false,
      createdAt: new Date('2024-03-01T10:00:00.000Z'),
      updatedAt,
      deletedAt: null,
    });

    const result = await controller.update('user-123', {
      name: 'Updated Name',
    });

    expect(usersServiceMock.updateUser).toHaveBeenCalledWith('user-123', {
      name: 'Updated Name',
    });
    expect(JSON.parse(JSON.stringify(result))).toMatchObject({
      id: 'user-123',
      name: 'Updated Name',
      updatedAt: updatedAt.toISOString(),
    });
  });

  it('delegates password updates to the service', async () => {
    usersServiceMock.updatePassword.mockResolvedValue({ success: true });

    const response = await controller.updatePassword('user-123', {
      currentPassword: 'old',
      newPassword: 'new',
    } as any);

    expect(usersServiceMock.updatePassword).toHaveBeenCalledWith('user-123', {
      currentPassword: 'old',
      newPassword: 'new',
    });
    expect(response).toEqual({ success: true });
  });

  it('soft deletes a user using the service', async () => {
    const deletedAt = new Date('2024-05-02T12:00:00.000Z');
    usersServiceMock.removeUser.mockResolvedValue({
      id: 'user-123',
      email: 'demo@example.com',
      name: 'Demo User',
      isSuperAdmin: false,
      createdAt: new Date('2024-03-01T10:00:00.000Z'),
      updatedAt: new Date('2024-05-01T09:00:00.000Z'),
      deletedAt,
    });

    const response = await controller.delete('user-123');

    expect(usersServiceMock.removeUser).toHaveBeenCalledWith('user-123');
    expect(JSON.parse(JSON.stringify(response))).toMatchObject({
      id: 'user-123',
      deletedAt: deletedAt.toISOString(),
    });
  });
});
