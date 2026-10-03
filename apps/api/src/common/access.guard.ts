import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { API_CONFIG, type ApiConfig } from '../config';
import { AuthService } from '../modules/auth/auth.service';
import { validCsrfToken } from '../modules/auth/session-token';
import { ACCESS_METADATA, type AccessPolicy } from './access.decorator';
import { ApiError } from './api-error';
import type { ApiRequest } from './request';

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiRequest>();
    const policy = this.reflector.getAllAndOverride<AccessPolicy>(ACCESS_METADATA, [context.getHandler(), context.getClass()]);
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    if (policy && 'public' in policy) {
      if (mutation) this.checkOrigin(request);
      return true;
    }
    request.auth = await this.authService.authenticate(this.authService.readCookie(request));
    // New routes receive no accidental access: explicitly declare their policy.
    if (!policy) throw new ApiError(403, 'ACCESS_POLICY_MISSING', 'This action has no configured access policy.');
    if ('permissions' in policy && (policy.permissions.length === 0 || !policy.permissions.every((permission) => request.auth!.response.permissions.includes(permission)))) {
      throw new ApiError(403, 'FORBIDDEN', 'Your account does not have permission for this action.');
    }
    if (mutation) {
      this.checkOrigin(request);
      if (!validCsrfToken(request.auth.token, request.get('x-csrf-token'))) {
        throw new ApiError(403, 'CSRF_INVALID', 'Refresh this page and try again. The security token is missing or invalid.');
      }
    }
    return true;
  }

  private checkOrigin(request: ApiRequest): void {
    if (request.get('origin') !== this.config.webOrigin) {
      throw new ApiError(403, 'ORIGIN_FORBIDDEN', 'This request must originate from the staff application.');
    }
  }
}
