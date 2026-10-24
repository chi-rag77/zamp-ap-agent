import {getSignUpUrl} from '@workos-inc/authkit-nextjs';
import {NextResponse} from 'next/server';
import {workosAuthEnabled} from '../../lib/workos-auth';

export async function GET(){
  if(!workosAuthEnabled()){
    return new NextResponse('WorkOS sign-up is not enabled for this deployment.',{status:503,headers:{'Cache-Control':'no-store'}});
  }
  const organizationId=process.env.ZAMP_WORKOS_ORGANIZATION_ID;
  if(!organizationId)return new NextResponse('The Acme organization is not configured.',{status:503,headers:{'Cache-Control':'no-store'}});
  return NextResponse.redirect(await getSignUpUrl({organizationId,returnTo:'/'}));
}
