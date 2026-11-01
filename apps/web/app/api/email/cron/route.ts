import {after,NextRequest,NextResponse} from 'next/server';
import {createPublicKey,createVerify,timingSafeEqual} from 'node:crypto';
import {syncGmailMailbox} from '@zamp/email';
import {dispatchAgentWorker} from '../../../../lib/agent-worker';

export const runtime='nodejs';
export const maxDuration=300;

const githubIssuer='https://token.actions.githubusercontent.com';
const githubWorkflow='chi-rag77/zamp-ap-agent/.github/workflows/gmail-inbox-sync.yml@refs/heads/main';
type GitHubJwk={kid:string;kty:'RSA';alg?:string;use?:string;n:string;e:string};
let jwksCache:{keys:GitHubJwk[];expiresAt:number}|undefined;

async function githubWorkflowAuthorized(token:string){
 try{
  if(token.length>16_384)return false;
  const [encodedHeader,encodedClaims,encodedSignature]=token.split('.');
  if(!encodedHeader||!encodedClaims||!encodedSignature)return false;
  const header=JSON.parse(Buffer.from(encodedHeader,'base64url').toString('utf8')) as {alg?:string;kid?:string};
  if(header.alg!=='RS256'||!header.kid)return false;
  const now=Math.floor(Date.now()/1000);
  let keys=jwksCache;
  if(!keys||keys.expiresAt<now){
   const response=await fetch(`${githubIssuer}/.well-known/jwks`,{signal:AbortSignal.timeout(5000),cache:'no-store'});
   if(!response.ok)return false;
   const body=await response.json() as {keys?:GitHubJwk[]};
   if(!body.keys?.length)return false;
   keys={keys:body.keys,expiresAt:now+3600};jwksCache=keys;
  }
  let jwk=keys.keys.find(key=>key.kid===header.kid);
  if(!jwk){
   jwksCache=undefined;
   const response=await fetch(`${githubIssuer}/.well-known/jwks`,{signal:AbortSignal.timeout(5000),cache:'no-store'});
   if(!response.ok)return false;
   const body=await response.json() as {keys?:GitHubJwk[]};
   if(!body.keys?.length)return false;
   jwksCache={keys:body.keys,expiresAt:now+3600};
   jwk=body.keys.find(key=>key.kid===header.kid);
  }
  if(!jwk||jwk.kty!=='RSA'||jwk.alg!=='RS256'||jwk.use!=='sig')return false;
  const claims=JSON.parse(Buffer.from(encodedClaims,'base64url').toString('utf8')) as {
   iss?:string;aud?:string|string[];exp?:number;nbf?:number;iat?:number;repository?:string;ref?:string;workflow_ref?:string;event_name?:string;
  };
  const audience=process.env.EMAIL_CRON_OIDC_AUDIENCE??'https://zamp-ap-agent.onrender.com';
  const audiences=Array.isArray(claims.aud)?claims.aud:[claims.aud];
  if(claims.iss!==githubIssuer||!audiences.includes(audience)||!claims.exp||claims.exp<=now||!claims.iat||claims.iat>now+60||now-claims.iat>600||claims.exp-claims.iat>600||(claims.nbf&&claims.nbf>now+60))return false;
  if(claims.repository!=='chi-rag77/zamp-ap-agent'||claims.ref!=='refs/heads/main'||claims.workflow_ref!==githubWorkflow||!['schedule','workflow_dispatch'].includes(claims.event_name??''))return false;
  const verifier=createVerify('RSA-SHA256');
  verifier.update(`${encodedHeader}.${encodedClaims}`);
  verifier.end();
  return verifier.verify(createPublicKey({key:jwk,format:'jwk'}),Buffer.from(encodedSignature,'base64url'));
 }catch{return false}
}

async function authorized(request:NextRequest){
 const expected=process.env.EMAIL_CRON_TOKEN;
 const supplied=request.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
 if(!supplied)return false;
 if(expected){
  const a=Buffer.from(expected),b=Buffer.from(supplied);
  if(a.length===b.length&&timingSafeEqual(a,b))return true;
 }
 return githubWorkflowAuthorized(supplied);
}

export async function POST(request:NextRequest){
 if(!await authorized(request))return NextResponse.json({error:'Unauthorized'},{status:401});
 try{
  const result=await syncGmailMailbox();
  if(!result.hasMore)after(async()=>{await dispatchAgentWorker(request.nextUrl.origin)});
  return NextResponse.json(result);
 }catch(error){
  console.error('Scheduled Gmail sync failed',error);
  return NextResponse.json({error:error instanceof Error?error.message:'Gmail sync failed'},{status:502});
 }
}
