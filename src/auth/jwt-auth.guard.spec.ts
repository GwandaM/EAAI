import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

import type { AuthService } from './auth.service';
import type { AuthenticatedRequest, AuthenticatedUser } from './authenticated-user';
import { JwtAuthGuard } from './jwt-auth.guard';

function contextFor(request: Partial<AuthenticatedRequest>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request as AuthenticatedRequest }),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  const verifiedUser: AuthenticatedUser = {
    userId: 'user-123',
    email: 'a@b.com',
    claims: { sub: 'user-123' },
  };

  it('bypasses verification and injects a dev user when auth is disabled', async () => {
    const auth = { isDisabled: true, verify: jest.fn() } as unknown as AuthService;
    const guard = new JwtAuthGuard(auth);
    const request: Partial<AuthenticatedRequest> = { headers: {} };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user?.userId).toBe('dev-user');
    expect(auth.verify).not.toHaveBeenCalled();
  });

  it('rejects requests without a bearer token when auth is enabled', async () => {
    const auth = { isDisabled: false, verify: jest.fn() } as unknown as AuthService;
    const guard = new JwtAuthGuard(auth);

    await expect(
      guard.canActivate(contextFor({ headers: {} })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auth.verify).not.toHaveBeenCalled();
  });

  it('rejects a non-bearer Authorization scheme', async () => {
    const auth = { isDisabled: false, verify: jest.fn() } as unknown as AuthService;
    const guard = new JwtAuthGuard(auth);

    await expect(
      guard.canActivate(contextFor({ headers: { authorization: 'Basic abc' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('verifies the token and attaches the user when auth is enabled', async () => {
    const verify = jest.fn().mockResolvedValue(verifiedUser);
    const auth = { isDisabled: false, verify } as unknown as AuthService;
    const guard = new JwtAuthGuard(auth);
    const request: Partial<AuthenticatedRequest> = {
      headers: { authorization: 'Bearer good.token.here' },
    };

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith('good.token.here');
    expect(request.user).toEqual(verifiedUser);
  });
});
