import {describe,expect,it} from 'vitest';
import {createIntegrationApiKey,hashIntegrationApiKey,integrationApiKeyFromRequest,validIntegrationApiKey} from '../../packages/integrations/src/api-key';

describe('integration API keys',()=>{
 it('creates a one-time secret with a stable digest and safe display prefix',()=>{
  const first=createIntegrationApiKey();const second=createIntegrationApiKey();
  expect(first.key).toMatch(/^zamp_live_[A-Za-z0-9_-]{40,60}$/);
  expect(first.key).not.toBe(second.key);
  expect(first.hash).toBe(hashIntegrationApiKey(first.key));
  expect(first.hash).not.toContain(first.key);
  expect(first.prefix).toBe(first.key.slice(0,18));
 });
 it('accepts Bearer and X-API-Key credentials and ignores malformed input',()=>{
  const {key}=createIntegrationApiKey();
  expect(integrationApiKeyFromRequest(new Request('https://zamp.test/api/v1/health',{headers:{Authorization:`Bearer ${key}`}}))).toBe(key);
  expect(integrationApiKeyFromRequest(new Request('https://zamp.test/api/v1/health',{headers:{'X-API-Key':key}}))).toBe(key);
  expect(integrationApiKeyFromRequest(new Request('https://zamp.test/api/v1/health',{headers:{Authorization:'Bearer nope'}}))).toBeNull();
  expect(validIntegrationApiKey('zamp_live_bad')).toBe(false);
 });
});
