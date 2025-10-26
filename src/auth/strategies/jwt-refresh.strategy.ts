import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(
    config: ConfigService,
    // Todo: inject users service
  ) {
    const secret = config.get<string>('JWT_REFRESH_SECRET_KEY');
    if (!secret) throw new Error('JWT_REFRESH_SECRET_KEY is not set'); // Todo: remove after env validation

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      passReqToCallback: true,
    });
  }

  validate(req: Request, payload: { id: string; email: string }) {
    const refreshToken = req.headers.authorization?.split(' ')[1];

    if (!refreshToken) throw new ForbiddenException('Refresh token malformed');

    // Todo: validate refresh token with users service.
  }
}
