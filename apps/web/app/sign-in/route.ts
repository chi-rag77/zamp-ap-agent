import {getSignInUrl,getWorkOS} from '@workos-inc/authkit-nextjs';
import {NextRequest,NextResponse} from 'next/server';
import {workosAuthEnabled,workosRedirectUri} from '../../lib/workos-auth';

function safeReturnTo(value:string|null){return value?.startsWith('/')&&!value.startsWith('//')&&!value.includes('\\')?value:'/'}
function completionPath(returnTo:string){return `/auth/complete?returnTo=${encodeURIComponent(returnTo)}`}

export async function GET(request:NextRequest){
  if(!workosAuthEnabled()){
    return new NextResponse('WorkOS sign-in is not enabled for this deployment.',{status:503,headers:{'Cache-Control':'no-store'}});
  }
  const email=request.nextUrl.searchParams.get('email')?.trim().slice(0,320);
  let organizationId:string|undefined;
  if(email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    try{
      const workos=getWorkOS();
      const users=await workos.userManagement.listUsers({email:email.toLowerCase(),limit:100});
      const user=users.data.find(item=>item.email.toLowerCase()===email.toLowerCase());
      if(user){
        const memberships=await workos.userManagement.listOrganizationMemberships({userId:user.id,statuses:['active'],limit:100});
        const memberOrganizationIds=new Set(memberships.data.map(item=>item.organizationId));
        const preferred=process.env.ZAMP_WORKOS_ORGANIZATION_ID;
        organizationId=preferred&&memberOrganizationIds.has(preferred)?preferred:memberships.data[0]?.organizationId;
      }
    }catch{
      return NextResponse.redirect(new URL('/login?error=configuration',request.url));
    }
  }
  const returnTo=safeReturnTo(request.nextUrl.searchParams.get('returnTo'));
  const redirectUri=workosRedirectUri();
  if(!redirectUri)return NextResponse.redirect(new URL('/login?error=configuration',request.url));
  return NextResponse.redirect(await getSignInUrl({redirectUri,...(organizationId?{organizationId}:{}),returnTo:completionPath(returnTo),...(email?{loginHint:email}:{})}));
}
