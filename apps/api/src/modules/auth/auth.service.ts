import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { ROLE_PERMISSIONS, type SessionResponse } from '@fernleaf/contracts';
import { API_CONFIG, type ApiConfig } from '../../config';
import { PrismaService } from '../../database/prisma.service';
import { ApiError } from '../../common/api-error';
import type { ApiRequest } from '../../common/request';
import type { LoginDto } from './login.dto';
import { dummyPasswordHash, verifyPassword } from './password';
import { csrfTokenForSession, hashSessionToken } from './session-token';

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  cookieName(): string {
    return this.config.production ? '__Host-fernleaf_session' : 'fernleaf_session';
  }

  readCookie(request: ApiRequest): string | undefined {
    const cookies: unknown = request.cookies;
    const token = cookies && typeof cookies === 'object' && this.cookieName() in cookies
      ? (cookies as Record<string, unknown>)[this.cookieName()]
      : undefined;
    return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
  }

  async login(dto: LoginDto, previousToken?: string): Promise<{ token: string; response: SessionResponse }> {
    const user = await this.prisma.staffUser.findUnique({ where: { email: dto.email } });
    const correct = await verifyPassword(dto.password, user?.passwordHash ?? await dummyPasswordHash);
    if (!user || !correct || !user.active) throw new ApiError(401, 'INVALID_CREDENTIALS', 'The email or password is incorrect.');
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.sessionTtlHours * 60 * 60 * 1000);
    const session = await this.prisma.$transaction(async (transaction) => {
      if (previousToken) await transaction.session.deleteMany({ where: { tokenHash: hashSessionToken(previousToken) } });
      return transaction.session.create({ data: { tokenHash: hashSessionToken(token), userId: user.id, expiresAt }, include: { user: true } });
    });
    return { token, response: this.responseFor(session.user, token, session.expiresAt) };
  }

  async authenticate(token: string | undefined): Promise<NonNullable<ApiRequest['auth']>> {
    if (!token) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    const session = await this.prisma.session.findUnique({ where: { tokenHash: hashSessionToken(token) }, include: { user: true } });
    if (!session) throw new ApiError(401, 'UNAUTHENTICATED', 'Your session is no longer valid. Sign in again.');
    if (session.expiresAt.getTime() <= Date.now() || !session.user.active) {
      await this.prisma.session.deleteMany({ where: { id: session.id } });
      throw new ApiError(401, 'SESSION_EXPIRED', 'Your session expired or the account was deactivated. Sign in again.');
    }
    return { sessionId: session.id, token, response: this.responseFor(session.user, token, session.expiresAt) };
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: sessionId } });
  }

  private responseFor(user: { id: string; email: string; displayName: string; role: SessionResponse['user']['role'] }, token: string, expiresAt: Date): SessionResponse {
    return {
      user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
      permissions: [...ROLE_PERMISSIONS[user.role]],
      csrfToken: csrfTokenForSession(token),
      expiresAt: expiresAt.toISOString(),
    };
  }
}
