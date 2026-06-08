import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { AuthService } from './auth.service';
import type { AuthenticatedRequest, AuthenticatedUser } from './authenticated-user';

// Synthetic identity used only when AUTH_DISABLED=true (local development).
const DEV_USER: AuthenticatedUser = {
  userId: 'dev-user',
  email: 'dev@local',
  claims: { sub: 'dev-user' },
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (this.auth.isDisabled) {
      request.user = DEV_USER;
      return true;
    }

    const token = this.extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    request.user = await this.auth.verify(token);
    return true;
  }

  private extractBearerToken(header: string | undefined): string | undefined {
    if (!header) {
      return undefined;
    }
    const [scheme, value] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !value) {
      return undefined;
    }
    return value.trim();
  }
}
