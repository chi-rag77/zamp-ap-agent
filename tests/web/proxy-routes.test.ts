import {pathToRegexp} from 'path-to-regexp';
import {describe,expect,it} from 'vitest';
import {unauthenticatedPaths} from '../../apps/web/lib/public-routes';

describe('WorkOS unauthenticated route matchers',()=>{
  it('parses every configured route matcher',()=>{
    expect(()=>unauthenticatedPaths.map(path=>pathToRegexp(path))).not.toThrow();
  });

  it.each([
    ['/approvals/email/:path*','/approvals/email'],
    ['/approvals/email/:path*','/approvals/email/test-token'],
    ['/api/approvals/email/:path*','/api/approvals/email'],
    ['/api/approvals/email/:path*','/api/approvals/email/test-token'],
  ])('matches the public email approval URL %s → %s',(matcher,path)=>{
    expect(unauthenticatedPaths).toContain(matcher);
    expect(pathToRegexp(matcher).test(path)).toBe(true);
  });
});
