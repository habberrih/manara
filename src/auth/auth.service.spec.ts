import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { UsersService } from 'src/user/user.service';
import { AuthService } from './auth.service';
import { CreateLoginDto } from './dto/create-login.dto';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

import * as bcrypt from 'bcryptjs';

type PrismaUserDelegateMock = {
  findUnique: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
};

type PrismaServiceMock = {
  user: PrismaUserDelegateMock;
};

const createPrismaMock = (): PrismaServiceMock => ({
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
});

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaServiceMock;
  let jwtService: { signAsync: jest.Mock };
  let configService: { get: jest.Mock };
  let usersService: { createOneUser: jest.Mock };

  const compareMock = bcrypt.compare as unknown as jest.Mock;
  const hashMock = bcrypt.hash as unknown as jest.Mock;

  beforeEach(async () => {
    prisma = createPrismaMock();
    jwtService = {
      signAsync: jest.fn(),
    };
    configService = {
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
    usersService = {
      createOneUser: jest.fn(),
    };

    compareMock.mockReset();
    hashMock.mockReset();
    jwtService.signAsync.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: prisma as unknown as PrismaService,
        },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('login', () => {
    const loginDto: CreateLoginDto = {
      email: 'jane@example.com',
      password: 'Passw0rd!',
    };

    it('returns tokens and persists hashed refresh token on success', async () => {
      const userRecord = {
        id: 'user-1',
        email: loginDto.email,
        name: 'Jane',
        password: 'hashed-pass',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
        deletedAt: null,
      };
      prisma.user.findUnique.mockResolvedValue(userRecord);
      compareMock.mockResolvedValue(true);
      jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');
      hashMock.mockResolvedValue('hashed-refresh');

      const result = await service.login(loginDto);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: loginDto.email },
        select: expect.any(Object),
      });
      expect(compareMock).toHaveBeenCalledWith(
        loginDto.password,
        userRecord.password,
      );
      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        1,
        { id: userRecord.id, email: userRecord.email },
        {
          secret: 'access-secret',
          expiresIn: '15m',
        },
      );
      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        2,
        { id: userRecord.id, email: userRecord.email },
        {
          secret: 'refresh-secret',
          expiresIn: '7d',
        },
      );
      expect(hashMock).toHaveBeenCalledWith('refresh-token', 10);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: userRecord.id },
        data: { refreshToken: 'hashed-refresh' },
      });
      expect(result).toEqual({
        data: {
          id: userRecord.id,
          name: userRecord.name,
          email: userRecord.email,
          createdAt: userRecord.createdAt,
          updatedAt: userRecord.updatedAt,
          deletedAt: userRecord.deletedAt,
        },
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });

    it('throws Unauthorized when user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(compareMock).not.toHaveBeenCalled();
      expect(jwtService.signAsync).not.toHaveBeenCalled();
    });

    it('throws Unauthorized when password mismatch', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: loginDto.email,
        password: 'stored-hash',
      });
      compareMock.mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(jwtService.signAsync).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('signup', () => {
    it('delegates to UsersService and returns sanitized data', async () => {
      const dto: CreateUserDto = {
        email: 'new@example.com',
        password: 'Secret123!',
        name: 'New User',
      };
      const created = {
        id: 'user-2',
        email: dto.email,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      usersService.createOneUser.mockResolvedValue(created);

      const result = await service.signup(dto);

      expect(usersService.createOneUser).toHaveBeenCalledWith(dto);
      expect(result.data).toEqual({
        id: created.id,
        name: dto.name,
        email: dto.email,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
        deletedAt: created.deletedAt,
      });
    });
  });

  describe('logout', () => {
    it('clears stored refresh token', async () => {
      await service.logout('user-1');

      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'user-1',
          refreshToken: { not: null },
        },
        data: { refreshToken: null },
      });
    });
  });

  describe('getJwtAccessToken', () => {
    it('signs JWT with access secret and expiry', async () => {
      jwtService.signAsync.mockResolvedValue('access-token');

      const token = await service.getJwtAccessToken(
        'user-1',
        'mail@example.com',
      );

      expect(jwtService.signAsync).toHaveBeenCalledWith(
        { id: 'user-1', email: 'mail@example.com' },
        {
          secret: 'access-secret',
          expiresIn: '15m',
        },
      );
      expect(token).toBe('access-token');
    });
  });

  describe('getJwtRefreshToken', () => {
    it('signs JWT with refresh secret and expiry', async () => {
      jwtService.signAsync.mockResolvedValue('refresh-token');

      const token = await service.getJwtRefreshToken(
        'user-1',
        'mail@example.com',
      );

      expect(jwtService.signAsync).toHaveBeenCalledWith(
        { id: 'user-1', email: 'mail@example.com' },
        {
          secret: 'refresh-secret',
          expiresIn: '7d',
        },
      );
      expect(token).toBe('refresh-token');
    });
  });
});
