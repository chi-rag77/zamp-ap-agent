import {afterEach,describe,expect,it,vi} from 'vitest';
import {workosAuthConfigured,workosAuthEnabled} from '../../apps/web/lib/workos-auth';

afterEach(()=>vi.unstubAllEnvs());

describe('WorkOS auth feature gate',()=>{
  it('does not enable sign-in just because production credentials exist',()=>{
    vi.stubEnv('WORKOS_API_KEY','sk_test');
    vi.stubEnv('WORKOS_CLIENT_ID','client_test');
    vi.stubEnv('WORKOS_COOKIE_PASSWORD','a-secure-cookie-secret-that-is-long-enough');
    vi.stubEnv('NEXT_PUBLIC_WORKOS_REDIRECT_URI','https://example.test/callback');
    vi.stubEnv('ZAMP_AUTH_REQUIRED','');

    expect(workosAuthConfigured()).toBe(true);
    expect(workosAuthEnabled()).toBe(false);
  });

  it('enables auth only when explicitly required and fully configured',()=>{
    vi.stubEnv('WORKOS_API_KEY','sk_test');
    vi.stubEnv('WORKOS_CLIENT_ID','client_test');
    vi.stubEnv('WORKOS_COOKIE_PASSWORD','a-secure-cookie-secret-that-is-long-enough');
    vi.stubEnv('NEXT_PUBLIC_WORKOS_REDIRECT_URI','https://example.test/callback');
    vi.stubEnv('ZAMP_AUTH_REQUIRED','true');
    vi.stubEnv('ZAMP_TENANT_ISOLATION_READY','true');

    expect(workosAuthEnabled()).toBe(true);
  });

  it('does not enable auth when the opt-in flag is set but credentials are incomplete',()=>{
    vi.stubEnv('ZAMP_AUTH_REQUIRED','true');
    vi.stubEnv('ZAMP_TENANT_ISOLATION_READY','true');
    vi.stubEnv('WORKOS_CLIENT_ID','client_test');
    vi.stubEnv('WORKOS_COOKIE_PASSWORD','');
    vi.stubEnv('NEXT_PUBLIC_WORKOS_REDIRECT_URI','https://example.test/callback');

    expect(workosAuthConfigured()).toBe(false);
    expect(workosAuthEnabled()).toBe(false);
  });

  it('keeps authentication disabled until tenant isolation has been verified',()=>{
    vi.stubEnv('WORKOS_API_KEY','sk_test');
    vi.stubEnv('WORKOS_CLIENT_ID','client_test');
    vi.stubEnv('WORKOS_COOKIE_PASSWORD','a-secure-cookie-secret-that-is-long-enough');
    vi.stubEnv('NEXT_PUBLIC_WORKOS_REDIRECT_URI','https://example.test/callback');
    vi.stubEnv('ZAMP_AUTH_REQUIRED','true');
    vi.stubEnv('ZAMP_TENANT_ISOLATION_READY','false');

    expect(workosAuthConfigured()).toBe(true);
    expect(workosAuthEnabled()).toBe(false);
  });
});
