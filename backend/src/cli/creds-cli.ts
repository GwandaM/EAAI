/**
 * Credential inspector CLI: print the security tokens the backend sends
 * upstream — MASKED — so you can check whether they are stale/expired without
 * leaking secrets into terminal history or logs.
 *
 *   npm run creds            (from the repo root or backend/)
 *
 * Covers:
 *   - COMPANY_API_TOKEN  (Authorization: Bearer … to the business API);
 *     decoded as a JWT when possible to show issuer/expiry.
 *   - AWS credentials resolved through the same provider chain Bedrock uses
 *     (env -> ~/.aws/credentials -> SSO -> instance role), with expiration.
 *   - Incoming-auth config (AUTH_DISABLED / JWKS), for completeness.
 *
 * Full token values are never printed. Exit codes: 0 = all usable,
 * 1 = something is missing/expired.
 */
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';
import { config as loadDotenv } from 'dotenv';

import { buildAppConfig } from '../config/configuration';
import { validateEnv } from '../config/env.validation';

/** Show just enough of a secret to recognise it (first/last 4 chars). */
function mask(value: string): string {
  if (value.length <= 12) {
    return `${'*'.repeat(value.length)} (${value.length} chars)`;
  }
  return `${value.slice(0, 4)}…${value.slice(-4)} (${value.length} chars)`;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const payload: unknown = JSON.parse(json);
    return typeof payload === 'object' && payload !== null
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function describeExpiry(expiresAt: Date): { line: string; expired: boolean } {
  const deltaMs = expiresAt.getTime() - Date.now();
  const minutes = Math.round(Math.abs(deltaMs) / 60_000);
  const human =
    minutes >= 2880
      ? `${Math.round(minutes / 1440)}d`
      : minutes >= 120
        ? `${Math.round(minutes / 60)}h`
        : `${minutes}m`;
  return deltaMs <= 0
    ? { line: `EXPIRED ${human} ago (${expiresAt.toISOString()})`, expired: true }
    : { line: `valid for ${human} (until ${expiresAt.toISOString()})`, expired: false };
}

async function main(): Promise<void> {
  loadDotenv(); // same .env the Nest ConfigModule reads (cwd = backend/)
  const config = buildAppConfig(validateEnv(process.env));
  let problem = false;

  console.log('Upstream credentials the backend is using\n');

  // --- Business API bearer token -------------------------------------------
  console.log(`Business API (${config.companyApi.baseUrl})`);
  const apiToken = config.companyApi.token;
  if (!apiToken) {
    console.log('  COMPANY_API_TOKEN: not set — requests go out WITHOUT Authorization.');
  } else {
    console.log(`  COMPANY_API_TOKEN: ${mask(apiToken)}`);
    const payload = decodeJwtPayload(apiToken);
    if (payload) {
      if (typeof payload.iss === 'string') console.log(`    issuer:  ${payload.iss}`);
      if (typeof payload.sub === 'string') console.log(`    subject: ${payload.sub}`);
      if (typeof payload.iat === 'number') {
        console.log(`    issued:  ${new Date(payload.iat * 1000).toISOString()}`);
      }
      if (typeof payload.exp === 'number') {
        const expiry = describeExpiry(new Date(payload.exp * 1000));
        console.log(`    expiry:  ${expiry.line}`);
        problem ||= expiry.expired;
      } else {
        console.log('    expiry:  no exp claim (does not expire on its own).');
      }
    } else {
      console.log('    (opaque token, not a decodable JWT — no expiry to read.)');
    }
  }

  // --- AWS / Bedrock --------------------------------------------------------
  console.log(`\nAWS / Bedrock (region ${config.aws.region}, model ${config.bedrock.modelId})`);
  try {
    const credentials = await fromNodeProviderChain()();
    console.log(`  accessKeyId:  ${mask(credentials.accessKeyId)}`);
    console.log(
      `  sessionToken: ${
        credentials.sessionToken
          ? `${mask(credentials.sessionToken)} — temporary credentials (STS/SSO)`
          : 'none — long-lived IAM user keys'
      }`,
    );
    if (credentials.expiration) {
      const expiry = describeExpiry(credentials.expiration);
      console.log(`  expiry:       ${expiry.line}`);
      problem ||= expiry.expired;
    } else if (credentials.sessionToken) {
      console.log('  expiry:       unknown (provider did not report one).');
    }
  } catch (error) {
    problem = true;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  FAILED to resolve credentials from the provider chain: ${message}`);
  }

  // --- Incoming auth (what the backend itself accepts) ----------------------
  console.log('\nIncoming request auth');
  if (config.auth.disabled) {
    console.log('  AUTH_DISABLED=true — bearer tokens are not verified (dev only).');
  } else {
    console.log(`  JWKS: ${config.auth.jwksUri ?? '(missing!)'}`);
    if (config.auth.issuer) console.log(`  issuer:   ${config.auth.issuer}`);
    if (config.auth.audience) console.log(`  audience: ${config.auth.audience}`);
  }

  console.log(
    problem
      ? '\nResult: at least one credential is missing, expired, or unresolvable.'
      : '\nResult: all configured credentials look usable.',
  );
  process.exit(problem ? 1 : 0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(1);
});
