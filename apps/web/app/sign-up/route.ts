import {getSignUpUrl} from '@workos-inc/authkit-nextjs';
import {NextResponse} from 'next/server';
import {workosAuthEnabled,workosRedirectUri} from '../../lib/workos-auth';

export async function GET(request:Request){
  if(!workosAuthEnabled()){
    return new NextResponse('WorkOS sign-up is not enabled for this deployment.',{status:503,headers:{'Cache-Control':'no-store'}});
  }
  const redirectUri=workosRedirectUri();
  if(!redirectUri)return NextResponse.redirect(new URL('/login?error=configuration',request.url));
  return NextResponse.redirect(await getSignUpUrl({redirectUri,returnTo:'/auth/complete?returnTo=%2F'}));
}
