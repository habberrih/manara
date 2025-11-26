import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { User } from '../prisma/generated/client';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { UsersService } from '../src/user/user.service';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let controller: AuthController;
  let prismaMock: {
    user: {
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let jwtMock: { signAsync: jest.Mock };
  let configMock: { get: jest.Mock };
  let usersServiceMock: { createOneUser: jest.Mock };

  beforeAll(async () => {
    prismaMock = {
      user: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue(undefined),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    jwtMock = {
      signAsync: jest.fn().mockImplementation((_payload, options) => {
        if (options?.secret === 'access-secret') {
          return 'access-token';
        }
        if (options?.secret === 'refresh-secret') {
          return 'refresh-token';
        }
        return 'generic-token';
      }),
    };

    configMock = {
      get: jest.fn((key: string) => {
        switch (key) {
          case 'JWT_SECRET_KEY':
            return 'access-secret';
          case 'JWT_ACCESS_EXPIRES_IN':
            return '15m';
          case 'JWT_REFRESH_SECRET_KEY':
            return 'refresh-secret';
          case 'JWT_REFRESH_EXPIRES_IN':
            return '7d';
          default:
            return undefined;
        }
      }),
    };

    usersServiceMock = {
      createOneUser: jest.fn(),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtMock },
        { provide: ConfigService, useValue: configMock },
        { provide: UsersService, useValue: usersServiceMock },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    controller = app.get(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('logs in a user with valid credentials', async () => {
    const hashedPassword = await bcrypt.hash('super-secret', 10);
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      name: 'Test User',
      password: hashedPassword,
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-02T00:00:00.000Z'),
      deletedAt: null,
    });

    const response = await controller.login({
      email: 'user@example.com',
      password: 'super-secret',
    });

    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
      },
    });
    expect(jwtMock.signAsync).toHaveBeenCalledTimes(2);
    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { refreshToken: expect.any(String) },
    });
    const storedToken =
      prismaMock.user.update.mock.calls[0][0].data.refreshToken;
    expect(storedToken).not.toEqual('refresh-token');

    expect(response).toMatchObject({
      data: {
        id: 'user-1',
        email: 'user@example.com',
        name: 'Test User',
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-02T00:00:00.000Z'),
        deletedAt: null,
      },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });
  });

  it('rejects login with incorrect credentials', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(
      controller.login({
        email: 'missing@example.com',
        password: 'irrelevant',
      }),
    ).rejects.toThrow('The credentials provided are incorrect.');

    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });

  it('signs a user up and returns sanitized payload', async () => {
    const createdAt = new Date('2024-01-01T12:00:00.000Z');
    const updatedAt = new Date('2024-01-02T12:00:00.000Z');
    usersServiceMock.createOneUser.mockResolvedValue({
      id: 'user-99',
      email: 'signup@example.com',
      createdAt,
      updatedAt,
      deletedAt: null,
    });

    const response = await controller.signup({
      email: 'signup@example.com',
      password: 'super-secret',
      name: 'New User',
    });

    expect(usersServiceMock.createOneUser).toHaveBeenCalledWith({
      email: 'signup@example.com',
      password: 'super-secret',
      name: 'New User',
    });
    expect(response).toEqual({
      data: {
        id: 'user-99',
        name: 'New User',
        email: 'signup@example.com',
        createdAt,
        updatedAt,
        deletedAt: null,
      },
    });
  });

  it('logs the current user out', async () => {
    const user = { id: 'user-1' } as User;

    await controller.logout(user);

    expect(prismaMock.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
        refreshToken: { not: null },
      },
      data: { refreshToken: null },
    });
  });

  it('issues a new access token during refresh', async () => {
    const user = { id: 'user-1', email: 'user@example.com' } as User;

    const response = await controller.refreshToken(user);

    expect(jwtMock.signAsync).toHaveBeenCalledWith(
      { id: 'user-1', email: 'user@example.com' },
      expect.objectContaining({
        secret: 'access-secret',
        expiresIn: '15m',
      }),
    );
    expect(response).toEqual({ accessToken: 'access-token' });
  });
});
