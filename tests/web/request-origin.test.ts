import {afterEach,describe,expect,it,vi} from 'vitest';
import {originMatchesPublicApp} from '../../apps/web/lib/request-origin';

describe('originMatchesPublicApp',()=>{
  afterEach(()=>vi.unstubAllEnvs());

  it('accepts the configured public Render origin when Next sees its private proxy origin',()=>{
    expect(originMatchesPublicApp(
      'https://zamp-ap-agent.onrender.com',
      'http://0.0.0.0:10000',
      'https://zamp-ap-agent.onrender.com/',
      true,
    )).toBe(true);
  });

  it('rejects a different browser origin',()=>{
    expect(originMatchesPublicApp(
      'https://attacker.example',
      'http://0.0.0.0:10000',
      'https://zamp-ap-agent.onrender.com',
      true,
    )).toBe(false);
  });

  it('fails closed in production when the public app URL is missing',()=>{
    expect(originMatchesPublicApp(
      'https://zamp-ap-agent.onrender.com',
      'https://zamp-ap-agent.onrender.com',
      undefined,
      true,
    )).toBe(false);
  });

  it('uses the request origin as a development fallback',()=>{
    expect(originMatchesPublicApp(
      'http://localhost:3000',
      'http://localhost:3000',
      undefined,
      false,
    )).toBe(true);
  });

  it('rejects a missing or malformed Origin header',()=>{
    expect(originMatchesPublicApp(null,'https://zamp-ap-agent.onrender.com','https://zamp-ap-agent.onrender.com',true)).toBe(false);
    expect(originMatchesPublicApp('not a url','https://zamp-ap-agent.onrender.com','https://zamp-ap-agent.onrender.com',true)).toBe(false);
  });
});
