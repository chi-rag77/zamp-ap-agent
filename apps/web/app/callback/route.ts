import {NextResponse,type NextRequest} from 'next/server';
import {handleAuth} from '@workos-inc/authkit-nextjs';
import {workosAuthEnabled} from '../../lib/workos-auth';

const handleCallback=handleAuth({returnPathname:'/'});

export async function GET(request:NextRequest){
  if(!workosAuthEnabled()){
    return new NextResponse('WorkOS authentication is not enabled for this deployment.',{status:503,headers:{'Cache-Control':'no-store'}});
  }
  return handleCallback(request);
}
