import {describe,it,expect,vi,beforeEach} from 'vitest';
import {integrationInput,parseOpenAPI} from '../../packages/integrations/src/config';
import {catalog} from '../../packages/integrations/src/catalog';
import {publicAddress,resolvePublic,retryable,backoff} from '../../packages/integrations/src/transport';
import {lookup} from 'node:dns/promises';
vi.mock('node:dns/promises',()=>({lookup:vi.fn()}));
const valid={name:'ERP sandbox',provider:'rest',environment:'development',endpoint:'https://api.example.com',test_path:'/health',auth_type:'none',credential_ref:null,header_name:'X-API-Key'};
describe('Integration configuration',()=>{
 it('creates a valid draft configuration',()=>expect(integrationInput.parse(valid)).toEqual(valid));
 it.each(['http://example.com','https://user:secret@example.com','https://example.com?token=secret','https://example.com#secret','https://example.com:8443'])('rejects unsafe or credential-bearing endpoint %s',endpoint=>expect(integrationInput.safeParse({...valid,endpoint}).success).toBe(false));
 it.each(['//other.example.com','https://other.example.com','/health?token=secret','/health\r\nHost: evil'])('rejects unsafe test path %s',test_path=>expect(integrationInput.safeParse({...valid,test_path}).success).toBe(false));
 it('requires a server reference for authentication',()=>expect(integrationInput.safeParse({...valid,auth_type:'bearer'}).success).toBe(false));
 it.each(['SUPABASE_SERVICE_ROLE_KEY','NVIDIA_API_KEY','actual-secret-value'])('cannot reference unrelated server credentials',credential_ref=>expect(integrationInput.safeParse({...valid,auth_type:'bearer',credential_ref}).success).toBe(false));
 it('accepts a namespaced reference without storing a token',()=>expect(integrationInput.parse({...valid,auth_type:'bearer',credential_ref:'INTEGRATION_ERP_TOKEN'}).credential_ref).toBe('INTEGRATION_ERP_TOKEN'));
 it.each(['Host','Cookie','Content-Length','Transfer-Encoding','Proxy-Authorization','X-Forwarded-Host'])('rejects reserved header %s',header_name=>expect(integrationInput.safeParse({...valid,header_name}).success).toBe(false));
 it('rejects forged healthy state and raw credentials',()=>expect(integrationInput.safeParse({...valid,status:'HEALTHY',secret:'abc'}).success).toBe(false));
 it('does not enable an unimplemented native adapter',()=>expect(integrationInput.safeParse({...valid,provider:'sap'}).success).toBe(false));
});
describe('Outbound network boundary',()=>{
 beforeEach(()=>vi.clearAllMocks());
 it.each(['127.0.0.1','10.0.0.1','172.16.0.1','172.31.255.255','192.168.0.1','169.254.169.254','100.64.0.1','0.0.0.0','224.0.0.1','198.18.0.1','192.0.2.1','198.51.100.1','203.0.113.1','::1','::ffff:127.0.0.1','fc00::1','invalid'])('blocks private, reserved or unsupported address %s',value=>expect(publicAddress(value)).toBe(false));
 it('allows a globally routable IPv4 address',()=>expect(publicAddress('8.8.8.8')).toBe(true));
 it('rejects a hostname with any private DNS answer',async()=>{vi.mocked(lookup).mockResolvedValue([{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}] as never);await expect(resolvePublic(new URL('https://example.com'))).rejects.toThrow('UNSAFE_ENDPOINT')});
 it('returns the exact validated address for connection pinning',async()=>{vi.mocked(lookup).mockResolvedValue([{address:'8.8.8.8',family:4}] as never);await expect(resolvePublic(new URL('https://example.com'))).resolves.toBe('8.8.8.8')});
 it.each([429,500,502,503,504])('retries transient response %s',status=>expect(retryable(status)).toBe(true));
 it.each([301,400,401,403,404,409])('does not blindly retry response %s',status=>expect(retryable(status)).toBe(false));
 it('bounds backoff with jitter',()=>{expect(backoff(0,()=>0)).toBe(250);expect(backoff(10,()=>.5)).toBe(4100)});
});
describe('OpenAPI discovery and catalog truthfulness',()=>{
 it('discovers operations without fetching external references',()=>{const imported=parseOpenAPI({openapi:'3.1.0',info:{title:'ERP'},servers:[{url:'https://api.example.com'}],paths:{'/vendors':{get:{},post:{},parameters:[]},'/invoice':{$ref:'http://127.0.0.1/private'}}});expect(imported.operations).toEqual([{path:'/vendors',method:'GET'},{path:'/vendors',method:'POST'}])});
 it('rejects unsupported documents',()=>expect(()=>parseOpenAPI({swagger:'2.0'})).toThrow());
 it('labels nonfunctional providers unavailable',()=>expect(catalog.filter(item=>item.available).map(item=>item.id)).toEqual(['gmail','rest','odata']));
 it('has unique provider identities',()=>expect(new Set(catalog.map(item=>item.id)).size).toBe(catalog.length));
});
