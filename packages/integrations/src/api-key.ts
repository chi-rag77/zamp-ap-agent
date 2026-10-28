import {createHash,randomBytes} from 'node:crypto';

const API_KEY_PATTERN=/^zamp_live_[A-Za-z0-9_-]{40,60}$/;

export function createIntegrationApiKey(){
 const key=`zamp_live_${randomBytes(32).toString('base64url')}`;
 return {key,prefix:key.slice(0,18),hash:hashIntegrationApiKey(key)};
}

export function hashIntegrationApiKey(key:string){
 return createHash('sha256').update(key).digest('hex');
}

export function validIntegrationApiKey(key:string){return API_KEY_PATTERN.test(key)}

export function integrationApiKeyFromRequest(request:Request){
 const bearer=request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
 const header=request.headers.get('x-api-key')?.trim();
 const key=bearer||header||'';
 return validIntegrationApiKey(key)?key:null;
}
