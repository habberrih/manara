import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { findManyAndCount } from 'src/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './user.service';

jest.mock('bcryptjs', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

jest.mock('src/common', () => {
  const actual = jest.requireActual('src/common');
  return {
    ...actual,
    findManyAndCount: jest.fn(),
  };
});

type PrismaUserDelegateMock = {
  findUnique: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  count: jest.Mock;
  findMany: jest.Mock;
};

type PrismaServiceMock = {
  user: PrismaUserDelegateMock;
};

const createPrismaServiceMock = (): PrismaServiceMock => ({
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    findMany: jest.fn(),
  },
});

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaServiceMock;

  const hashMock = bcrypt.hash as unknown as jest.Mock;
  const compareMock = bcrypt.compare as unknown as jest.Mock;
  const findManySpy = findManyAndCount as unknown as jest.Mock;

  beforeEach(async () => {
    prisma = createPrismaServiceMock();
    findManySpy.mockReset();
    hashMock.mockReset();
    compareMock.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: prisma as unknown as PrismaService,
        },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createOneUser', () => {
    it('creates a new user with hashed password', async () => {
      const dto: CreateUserDto = {
        email: 'test@example.com',
        password: 'PlainPassword123',
        name: 'Test User',
      };
      prisma.user.findUnique.mockResolvedValue(null);
      hashMock.mockResolvedValue('hashed-password');
      const createdUser = { id: 'user-1', ...dto, password: 'hashed-password' };
      prisma.user.create.mockResolvedValue(createdUser);

      const result = await service.createOneUser(dto);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: dto.email },
      });
      expect(hashMock).toHaveBeenCalledWith(dto.password, 10);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          ...dto,
          password: 'hashed-password',
        },
      });
      expect(result).toEqual(createdUser);
    });

    it('throws when email already exists', async () => {
      const dto: CreateUserDto = {
        email: 'exists@example.com',
        password: 'password',
        name: 'Existing User',
      };
      prisma.user.findUnique.mockResolvedValue({
        id: 'existing',
        email: dto.email,
      });

      await expect(service.createOneUser(dto)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('delegates to findManyAndCount with pagination defaults', async () => {
      const expected = { data: [], total: 0, count: 0 };
      findManySpy.mockResolvedValue(expected);

      const result = await service.findAll({ take: 5, skip: 10 });

      expect(findManySpy).toHaveBeenCalledWith(
        prisma.user,
        expect.objectContaining({
          take: 5,
          skip: 10,
          searchableFields: expect.any(Object),
          enforceSoftDeleteKey: 'deletedAt',
        }),
      );
      expect(result).toBe(expected);
    });
  });

  describe('findOneUser', () => {
    it('returns user when found', async () => {
      const user = { id: 'user-1' };
      prisma.user.findUnique.mockResolvedValue(user);

      await expect(service.findOneUser('user-1')).resolves.toBe(user);
    });

    it('throws NotFoundException when user missing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findOneUser('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateUser', () => {
    it('throws when password provided in dto', async () => {
      const existing = { id: 'user-1' };
      prisma.user.findUnique.mockResolvedValue(existing);

      await expect(
        service.updateUser('user-1', {
          password: 'hack',
        } as unknown as UpdateUserDto),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('updates user data', async () => {
      const existing = { id: 'user-1' };
      const dto: UpdateUserDto = { name: 'Updated' };
      prisma.user.findUnique.mockResolvedValue(existing);
      const updated = { ...existing, ...dto };
      prisma.user.update.mockResolvedValue(updated);

      const result = await service.updateUser('user-1', dto);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: dto,
      });
      expect(result).toEqual(updated);
    });
  });

  describe('updatePassword', () => {
    const dto: UpdatePasswordDto = {
      currentPassword: 'Current123',
      newPassword: 'NewPassword456',
    };

    it('throws NotFound when user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.updatePassword('user-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws Unauthorized when password hash missing', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        password: null,
      });

      await expect(service.updatePassword('user-1', dto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('throws Forbidden when current password invalid', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        password: 'hashed',
      });
      compareMock.mockResolvedValue(false);

      await expect(service.updatePassword('user-1', dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('updates password when valid', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        password: 'hashed',
      });
      compareMock.mockResolvedValue(true);
      hashMock.mockResolvedValue('new-hash');

      await service.updatePassword('user-1', dto);

      expect(compareMock).toHaveBeenCalledWith(dto.currentPassword, 'hashed');
      expect(hashMock).toHaveBeenCalledWith(dto.newPassword, 10);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { password: 'new-hash' },
      });
    });
  });

  describe('removeUser', () => {
    it('soft deletes the user', async () => {
      const existing = { id: 'user-1' };
      prisma.user.findUnique.mockResolvedValue(existing);
      const softDeleted = { ...existing, deletedAt: new Date() };
      prisma.user.update.mockResolvedValue(softDeleted);

      const result = await service.removeUser('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          deletedAt: expect.any(Date),
        }),
      });
      expect(result).toEqual(softDeleted);
    });
  });

  describe('getUserIfRefreshTokenMatch', () => {
    it('throws Unauthorized when user missing or refresh token absent', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.getUserIfRefreshTokenMatch('token', 'user-1'),
      ).rejects.toThrow(UnauthorizedException);

      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        refreshToken: null,
      });

      await expect(
        service.getUserIfRefreshTokenMatch('token', 'user-1'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws Forbidden when refresh token does not match', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        refreshToken: 'stored-hash',
      });
      compareMock.mockResolvedValue(false);

      await expect(
        service.getUserIfRefreshTokenMatch('token', 'user-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns user when refresh token matches', async () => {
      const user = {
        id: 'user-1',
        refreshToken: 'stored-hash',
      };
      prisma.user.findUnique.mockResolvedValue(user);
      compareMock.mockResolvedValue(true);

      const result = await service.getUserIfRefreshTokenMatch(
        'token',
        'user-1',
      );

      expect(compareMock).toHaveBeenCalledWith('token', 'stored-hash');
      expect(result).toBe(user);
    });
  });
});
