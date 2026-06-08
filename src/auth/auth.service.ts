import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';

import type { AppConfig } from '../config/configuration';
import type { AuthenticatedUser } from './authenticated-user';

type JwksResolver = ReturnType<typeof createRemoteJWKSet>;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly disabled: boolean;
  private readonly issuer?: string;
  private readonly audience?: string;
  private readonly jwks?: JwksResolver;

  constructor(config: ConfigService<AppConfig, true>) {
    const auth = config.get('auth', { infer: true });
    this.disabled = auth.disabled;
    this.issuer = auth.issuer;
    this.audience = auth.audience;

    if (this.disabled) {
      this.logger.warn(
        'AUTH_DISABLED=true — requests are NOT authenticated. Do not use in production.',
      );
    } else if (auth.jwksUri) {
      // createRemoteJWKSet caches keys in-memory and refreshes on unknown `kid`,
      // so we build it once and reuse it across requests.
      this.jwks = createRemoteJWKSet(new URL(auth.jwksUri));
    }
  }

  get isDisabled(): boolean {
    return this.disabled;
  }

  /**
   * Verify a raw bearer token and return the authenticated user, or throw
   * UnauthorizedException. Never returns a partial/unverified identity.
   */
  async verify(token: string): Promise<AuthenticatedUser> {
    if (!this.jwks) {
      // Auth is enabled but misconfigured (no JWKS). Fail closed.
      throw new UnauthorizedException('Authentication is not configured.');
    }

    let payload: JWTPayload;
    try {
      ({ payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
      }));
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'invalid token';
      this.logger.debug(`Token verification failed: ${reason}`);
      throw new UnauthorizedException('Invalid or expired token.');
    }

    if (!payload.sub) {
      throw new UnauthorizedException('Token is missing a subject (sub) claim.');
    }

    const email =
      typeof payload.email === 'string' ? payload.email : undefined;

    return { userId: payload.sub, email, claims: payload };
  }
}
