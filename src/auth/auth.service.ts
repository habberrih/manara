import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { UsersService } from 'src/user/user.service';
import { CreateLoginDto } from './dto/create-login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly jwt: JwtService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {}

  async login(loginDto: CreateLoginDto) {
    const user = await this.prismaService.user.findUnique({
      where: {
        email: loginDto.email,
      },
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

    if (!user)
      throw new UnauthorizedException(
        'The credentials provided are incorrect.',
      );

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );

    if (!isPasswordValid)
      throw new UnauthorizedException(
        'The credentials provided are incorrect.',
      );

    const accessToken = await this.getJwtAccessToken(user.id, user.email);

    const refreshToken = await this.getJwtRefreshToken(user.id, user.email);

    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    await this.prismaService.user.update({
      where: { id: user.id },
      data: { refreshToken: hashedRefreshToken },
    });

    return {
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        deletedAt: user.deletedAt,
      },
      accessToken,
      refreshToken,
    };
  }

  async signup(dto: CreateUserDto) {
    const user = await this.usersService.createOneUser(dto);

    return {
      data: {
        id: user.id,
        name: dto.name ?? null,
        email: user.email,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        deletedAt: user.deletedAt,
      },
    };
  }

  async logout(userId: string): Promise<void> {
    await this.prismaService.user.updateMany({
      where: {
        id: userId,
        refreshToken: {
          not: null,
        },
      },
      data: {
        refreshToken: null,
      },
    });
  }

  async getJwtAccessToken(userId: string, email: string): Promise<string> {
    // TODO: Extend payload with richer claims (e.g. roles) once requirements are final.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore because Joi validation will enforce correct values later
    return await this.jwt.signAsync(
      { id: userId, email },
      {
        secret: this.configService.get<string>('JWT_SECRET_KEY'),
        expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN'),
      },
    );
  }

  async getJwtRefreshToken(userId: string, email: string) {
    // TODO: Mirror access token payload changes to keep refresh logic in sync.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore because Joi validation will enforce correct values later
    return await this.jwt.signAsync(
      { id: userId, email },
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET_KEY'),
        expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN'),
      },
    );
  }
}
