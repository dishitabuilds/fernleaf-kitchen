import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { SessionResponse } from '@fernleaf/contracts';
import { Public, RequirePermissions } from '../../common/access.decorator';
import { API_CONFIG, type ApiConfig } from '../../config';
import type { ApiRequest } from '../../common/request';
import { AuthService } from './auth.service';
import { LoginDto } from './login.dto';

@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginDto, @Req() request: ApiRequest, @Res({ passthrough: true }) response: Response): Promise<SessionResponse> {
    const session = await this.authService.login(body, this.authService.readCookie(request));
    response.cookie(this.authService.cookieName(), session.token, {
      httpOnly: true, secure: this.config.production, sameSite: 'lax', path: '/',
      maxAge: this.config.sessionTtlHours * 60 * 60 * 1000,
    });
    return session.response;
  }

  @RequirePermissions('session.read')
  @Get('me')
  me(@Req() request: ApiRequest): SessionResponse {
    return request.auth!.response;
  }

  @RequirePermissions('session.logout')
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() request: ApiRequest, @Res({ passthrough: true }) response: Response): Promise<void> {
    await this.authService.logout(request.auth!.sessionId);
    response.clearCookie(this.authService.cookieName(), {
      httpOnly: true, secure: this.config.production, sameSite: 'lax', path: '/',
    });
  }
}
