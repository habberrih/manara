import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { GetCurrentUser, Public } from 'src/common';
import { AuthService } from './auth.service';
import { CreateLoginDto } from './dto/create-login.dto';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';

@ApiTags('Authentication')
@Controller({
  version: '1',
  path: 'auth',
})
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @HttpCode(HttpStatus.OK)
  @ApiBody({ type: CreateLoginDto, required: true })
  @Public()
  @Post('login')
  login(@Body() loginDto: CreateLoginDto) {
    return this.authService.login(loginDto);
  }

  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ required: true })
  @Public()
  @Post('signup')
  signup(@Body() dto: any) {
    return this.authService.signup(dto);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  logout(@GetCurrentUser() currentUser: User): Promise<void> {
    return this.authService.logout(currentUser.id);
  }

  @UseGuards(JwtRefreshGuard)
  @Public()
  @Post('refresh')
  async refreshToken(@GetCurrentUser() currentUser: User) {
    const accessToken = await this.authService.getJwtAccessToken(
      currentUser.id,
      currentUser.email,
    );
    return {
      accessToken: accessToken,
    };
  }
}
