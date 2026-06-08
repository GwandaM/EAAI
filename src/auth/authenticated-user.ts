import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { JWTPayload } from 'jose';

/**
 * The identity attached to a request after the JWT guard runs. Single-tenant:
 * we only carry the user id (the token `sub`) plus the raw claims for anything
 * downstream code needs.
 */
export interface AuthenticatedUser {
  userId: string;
  email?: string;
  claims: JWTPayload;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

/**
 * Controller param decorator: `@CurrentUser() user: AuthenticatedUser`.
 * Only meaningful on routes protected by JwtAuthGuard.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | undefined => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
