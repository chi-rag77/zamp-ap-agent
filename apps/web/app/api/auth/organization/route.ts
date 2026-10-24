import {getWorkOS} from '@workos-inc/authkit-nextjs';
import {NextRequest,NextResponse} from 'next/server';
import {workosAuthEnabled} from '../../../../lib/workos-auth';

const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(request:NextRequest){
  const email=request.nextUrl.searchParams.get('email')?.trim().toLowerCase().slice(0,320)??'';
  if(!emailPattern.test(email))return NextResponse.json({organization:null},{headers:{'Cache-Control':'no-store'}});
  if(!workosAuthEnabled())return NextResponse.json({organization:null},{headers:{'Cache-Control':'no-store'}});
  try{
    const domain=email.split('@').pop()!;
    const organizations=await getWorkOS().organizations.listOrganizations({domains:[domain],limit:100});
    const organization=organizations.data.find(item=>item.domains.some(entry=>entry.domain.toLowerCase()===domain&&entry.state==='verified'));
    if(!organization)return NextResponse.json({organization:null},{headers:{'Cache-Control':'no-store'}});
    const connections=await getWorkOS().sso.listConnections({organizationId:organization.id,limit:100});
    const ssoConfigured=connections.data.some(connection=>connection.state==='active'&&connection.domains.some(entry=>entry.domain.toLowerCase()===domain));
    return NextResponse.json({organization:{name:organization.name,ssoConfigured}},{headers:{'Cache-Control':'no-store'}});
  }catch{
    return NextResponse.json({error:'organization_lookup_unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
