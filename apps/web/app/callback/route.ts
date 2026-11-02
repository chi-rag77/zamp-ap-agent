import {NextResponse,type NextRequest} from 'next/server';
import {handleAuth} from '@workos-inc/authkit-nextjs';
import {workosAuthEnabled,workosRedirectUri} from '../../lib/workos-auth';

const publicCallbackUri=workosRedirectUri();
const handleCallback=handleAuth({
  ...(publicCallbackUri?{baseURL:new URL(publicCallbackUri).origin}:{}),
  returnPathname:'/',
});

export async function GET(request:NextRequest){
  if(!workosAuthEnabled()){
    return new NextResponse('WorkOS authentication is not enabled for this deployment.',{status:503,headers:{'Cache-Control':'no-store'}});
  }
  return handleCallback(request);
}
