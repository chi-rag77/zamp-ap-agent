import {getSignInUrl} from '@workos-inc/authkit-nextjs';
import {NextRequest,NextResponse} from 'next/server';
import {workosAuthEnabled} from '../../lib/workos-auth';
import {getWorkOS} from '@workos-inc/authkit-nextjs';

function safeReturnTo(value:string|null){return value?.startsWith('/')&&!value.startsWith('//')&&!value.includes('\\')?value:'/'}
const personalEmailDomains=new Set(['gmail.com','googlemail.com','outlook.com','hotmail.com','live.com','yahoo.com','icloud.com','proton.me','protonmail.com']);

export async function GET(request:NextRequest){
  if(!workosAuthEnabled()){
    return new NextResponse('WorkOS sign-in is not enabled for this deployment.',{status:503,headers:{'Cache-Control':'no-store'}});
  }
  const email=request.nextUrl.searchParams.get('email')?.trim().slice(0,320);
  let organizationId:string|undefined;
  if(email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    const domain=email.toLowerCase().split('@').pop()!;
    try{
      const organizations=await getWorkOS().organizations.listOrganizations({domains:[domain],limit:100});
      organizationId=organizations.data.find(item=>item.domains.some(entry=>entry.domain.toLowerCase()===domain&&entry.state==='verified'))?.id;
    }catch{
      return NextResponse.redirect(new URL('/login?error=configuration',request.url));
    }
  }
  // Keep the provisioned Acme tenant usable for the initial administrator's
  // personal email. Unverified company domains must remain unscoped so a
  // separate tenant can authenticate without being assigned to Acme.
  const emailDomain=email?.toLowerCase().split('@').pop();
  if(!organizationId&&(!emailDomain||personalEmailDomains.has(emailDomain)))organizationId=process.env.ZAMP_WORKOS_ORGANIZATION_ID||undefined;
  return NextResponse.redirect(await getSignInUrl({...(organizationId?{organizationId}:{}),returnTo:safeReturnTo(request.nextUrl.searchParams.get('returnTo')),...(email?{loginHint:email}:{})}));
}
