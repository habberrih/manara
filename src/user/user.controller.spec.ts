import { Test, TestingModule } from '@nestjs/testing';
import { PaginationInterface } from 'src/common';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './entities/user.entity';
import { UsersController } from './user.controller';
import { UsersService } from './user.service';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: {
    findOneUser: jest.Mock;
    findAll: jest.Mock;
    updateUser: jest.Mock;
    updatePassword: jest.Mock;
    removeUser: jest.Mock;
  };

  beforeEach(async () => {
    usersService = {
      findOneUser: jest.fn(),
      findAll: jest.fn(),
      updateUser: jest.fn(),
      updatePassword: jest.fn(),
      removeUser: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: usersService }],
    }).compile();

    controller = module.get(UsersController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns current user as UserResponseDto', async () => {
    usersService.findOneUser.mockResolvedValue({
      id: 'user-1',
      email: 'current@example.com',
      name: 'Current User',
      password: 'hashed',
      isSuperAdmin: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    const result = await controller.findMe({ id: 'user-1' } as any);

    expect(usersService.findOneUser).toHaveBeenCalledWith('user-1');
    expect(result).toBeInstanceOf(UserResponseDto);
    expect(result).toMatchObject({
      id: 'user-1',
      email: 'current@example.com',
    });
    expect((result as any).password).toBeUndefined();
  });

  it('forwards pagination params to service and returns list', async () => {
    const response: PaginationInterface<any> = {
      data: [
        {
          id: 'user-1',
          email: 'first@example.com',
          name: 'First',
          isSuperAdmin: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
      ],
      total: 1,
      count: 1,
    };
    usersService.findAll.mockResolvedValue(response);

    const result = await controller.findAll({ take: 10 });

    expect(usersService.findAll).toHaveBeenCalledWith({ take: 10 });
    expect(result.total).toBe(1);
    expect(result.data[0]).toMatchObject({
      id: 'user-1',
      email: 'first@example.com',
    });
    expect((result.data[0] as any).password).toBeUndefined();
  });

  it('retrieves user by id', async () => {
    usersService.findOneUser.mockResolvedValue({
      id: 'user-2',
      email: 'user2@example.com',
      name: 'User Two',
      isSuperAdmin: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    const result = await controller.findOne('user-2');

    expect(usersService.findOneUser).toHaveBeenCalledWith('user-2');
    expect(result).toBeInstanceOf(UserResponseDto);
  });

  it('updates user profile', async () => {
    const dto: UpdateUserDto = { name: 'Updated' };
    usersService.updateUser.mockResolvedValue({
      id: 'user-3',
      email: 'user3@example.com',
      name: 'Updated',
      isSuperAdmin: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    });

    const result = await controller.update('user-3', dto);

    expect(usersService.updateUser).toHaveBeenCalledWith('user-3', dto);
    expect(result).toBeInstanceOf(UserResponseDto);
  });

  it('delegates password update to service', async () => {
    const dto: UpdatePasswordDto = {
      currentPassword: 'Old123',
      newPassword: 'New456',
    };
    usersService.updatePassword.mockResolvedValue({ success: true });

    const result = await controller.updatePassword('user-4', dto);

    expect(usersService.updatePassword).toHaveBeenCalledWith('user-4', dto);
    expect(result).toEqual({ success: true });
  });

  it('soft deletes user and returns response dto', async () => {
    usersService.removeUser.mockResolvedValue({
      id: 'user-5',
      email: 'user5@example.com',
      name: 'Removed',
      isSuperAdmin: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: new Date(),
    });

    const result = await controller.delete('user-5');

    expect(usersService.removeUser).toHaveBeenCalledWith('user-5');
    expect(result).toBeInstanceOf(UserResponseDto);
  });
});
