import {getSignUpUrl} from '@workos-inc/authkit-nextjs';
import {NextResponse} from 'next/server';
import {workosAuthEnabled} from '../../lib/workos-auth';

export async function GET(){
  if(!workosAuthEnabled()){
    return new NextResponse('WorkOS sign-up is not enabled for this deployment.',{status:503,headers:{'Cache-Control':'no-store'}});
  }
  return NextResponse.redirect(await getSignUpUrl({returnTo:'/auth/complete?returnTo=%2F'}));
}
