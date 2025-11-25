import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import {
  findManyAndCount,
  PaginationInterface,
  PaginationParams,
} from 'src/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { User } from '../../prisma/generated/client';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prismaService: PrismaService) {}

  async createOneUser(createUserDto: CreateUserDto) {
    const user = createUserDto.email
      ? await this.prismaService.user.findUnique({
          where: { email: createUserDto.email },
        })
      : null;

    if (user) {
      throw new ConflictException(
        'An account with the provided details already exists. Please try signing in or use different credentials.',
      );
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const newUser = await this.prismaService.user.create({
      data: {
        ...createUserDto,
        password: hashedPassword,
      },
    });

    return newUser;
  }

  async findAll(params?: PaginationParams): Promise<PaginationInterface<User>> {
    return findManyAndCount<User, typeof this.prismaService.user>(
      this.prismaService.user,
      {
        take: params?.take,
        skip: params?.skip,
        where: params?.where,
        include: params?.include,
        search: params?.search,
        searchableFields: {
          items: ['email', 'name'],
          mode: 'insensitive',
        },
        enforceSoftDeleteKey: 'deletedAt',
        enforceUpdatedAtOrder: true,
      },
    );
  }

  async findOneUser(userId: string) {
    const foundUser = await this.prismaService.user.findUnique({
      where: { id: userId },
    });

    if (!foundUser) {
      throw new NotFoundException(`User with ID ${userId} is not found`);
    }

    return foundUser;
  }

  async updateUser(userId: string, dto: UpdateUserDto) {
    const foundUser = await this.findOneUser(userId);

    // Extra guard: if someone sneaks 'password' in, reject and tell them to use the dedicated endpoint
    if ((dto as any)?.password !== undefined) {
      throw new BadRequestException(
        'Use the dedicated endpoint to update the password.',
      );
    }

    const updatedUser = await this.prismaService.user.update({
      where: { id: foundUser.id },
      data: dto,
    });

    return updatedUser;
  }

  async updatePassword(userId: string, dto: UpdatePasswordDto) {
    const user = await this.findOneUser(userId);
    if (!user || !user.password) throw new UnauthorizedException();

    const ok = await bcrypt.compare(dto.currentPassword, user.password);
    if (!ok) throw new ForbiddenException('Current password is incorrect');

    const hash = await bcrypt.hash(dto.newPassword, 10);

    await this.prismaService.user.update({
      where: { id: userId },
      data: { password: hash },
    });

    // return minimal success (don’t return user with hash)
    return { success: true };
  }

  async removeUser(userId: string) {
    const foundUser = await this.findOneUser(userId);

    return await this.prismaService.user.update({
      where: { id: foundUser.id },
      data: {
        deletedAt: new Date(),
      },
    });
  }

  async getUserIfRefreshTokenMatch(
    refreshToken: string,
    userId: string,
  ): Promise<User> {
    const user = await this.prismaService.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!user || !user.refreshToken)
      throw new UnauthorizedException(
        'User not found or refresh token missing',
      );

    const refreshTokenMatches = await bcrypt.compare(
      refreshToken,
      user.refreshToken,
    );

    if (!refreshTokenMatches)
      throw new ForbiddenException(
        'You do not have permission to access this resource.',
      );

    return user;
  }
}
