import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prismaService: PrismaService,
  ) {
    const secret = config.get<string>('JWT_SECRET_KEY');
    if (!secret) throw new Error('JWT_SECRET_KEY is not set'); // Todo: remove after env validation
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: { id: string; email: string }) {
    const currentUser = await this.prismaService.user.findUnique({
      where: { id: payload.id },
    });

    return currentUser;
  }
}
