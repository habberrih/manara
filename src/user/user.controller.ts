import {
  Body,
  ClassSerializerInterceptor,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import {
  GetCurrentUser,
  PaginationInterface,
  PaginationParams,
} from 'src/helpers';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './entities/user.entity';
import { UsersService } from './user.service';

@ApiTags('Users')
@UseInterceptors(ClassSerializerInterceptor) // safe even if also enabled globally
@Controller({
  version: '1',
  path: 'users',
})
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @HttpCode(HttpStatus.OK)
  @Get('me')
  @ApiOperation({ summary: 'Get the currently authenticated user' })
  @ApiOkResponse({ type: UserResponseDto })
  async findMe(@GetCurrentUser() user: User) {
    const foundUser = await this.usersService.findOneUser(user.id);
    return plainToInstance(UserResponseDto, foundUser);
  }

  @HttpCode(HttpStatus.OK)
  @Get()
  findAll(
    @Query() params?: PaginationParams,
  ): Promise<PaginationInterface<User>> {
    return this.usersService.findAll(params);
  }

  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description:
      'Get user by userId. If not found, throws NotFoundException.',
    type: UserResponseDto,
  })
  @Get(':userId')
  async findOne(@Param('userId') userId: string) {
    const user = await this.usersService.findOneUser(userId);
    return plainToInstance(UserResponseDto, user);
  }

  @Patch(':userId')
  @ApiOperation({ summary: 'Update user profile (no password here)' })
  @ApiOkResponse({ type: UserResponseDto })
  async update(@Param('userId') userId: string, @Body() dto: UpdateUserDto) {
    const user = await this.usersService.updateUser(userId, dto);
    return plainToInstance(UserResponseDto, user);
  }

  @Patch(':userId/password')
  @ApiOperation({ summary: 'Update user password (separate endpoint)' })
  @ApiBody({ type: UpdatePasswordDto })
  @HttpCode(HttpStatus.OK)
  async updatePassword(
    @Param('userId') userId: string,
    @Body() dto: UpdatePasswordDto,
  ) {
    return this.usersService.updatePassword(userId, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Delete(':userId')
  @ApiOperation({ summary: 'Soft delete user' })
  @ApiOkResponse({ type: UserResponseDto })
  async delete(@Param('userId') userId: string) {
    const user = await this.usersService.removeUser(userId);
    return plainToInstance(UserResponseDto, user);
  }
}
