import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateLoginDto } from './dto/create-login.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly jwt: JwtService,
    private readonly configService: ConfigService,
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

  // Todo: CreateUserDto type when user module is ready
  async signup(dto: any) {
    // Todo: Implement signup logic after user module is ready
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
    return await this.jwt.signAsync(
      { id: userId, email },
      {
        secret: this.configService.get<string>('JWT_SECRET_KEY'),
        expiresIn: Number(
          this.configService.get<string>('JWT_ACCESS_EXPIRES_IN'),
        ),
      },
    );
  }

  async getJwtRefreshToken(userId: string, email: string) {
    // TODO: Mirror access token payload changes to keep refresh logic in sync.
    return await this.jwt.signAsync(
      { id: userId, email },
      {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET_KEY'),
        expiresIn: Number(
          this.configService.get<string>('JWT_REFRESH_EXPIRES_IN'),
        ),
      },
    );
  }
}
