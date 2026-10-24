'use server';

import {createHash} from 'node:crypto';
import {getWorkOS,refreshSession,withAuth} from '@workos-inc/authkit-nextjs';
import {redirect} from 'next/navigation';

export type OrganizationSetupState={error?:string};

function safeReturnTo(value:FormDataEntryValue|null){
  const path=typeof value==='string'?value:'/';
  return path.startsWith('/')&&!path.startsWith('//')&&!path.includes('\\')?path:'/';
}

export async function createOrganizationAction(_state:OrganizationSetupState,formData:FormData):Promise<OrganizationSetupState>{
  const name=String(formData.get('name')??'').trim().replace(/\s+/g,' ');
  const returnTo=safeReturnTo(formData.get('returnTo'));
  if(name.length<2||name.length>80)return {error:'Enter an organization name between 2 and 80 characters.'};

  try{
    const {user,organizationId}=await withAuth({ensureSignedIn:true});
    if(organizationId)redirect(returnTo);

    const workos=getWorkOS();
    const idempotencyKey=createHash('sha256').update(`${user.id}:${name.toLowerCase()}`).digest('hex');
    const organization=await workos.organizations.createOrganization({
      name,
      externalId:`zamp-${user.id}`,
      metadata:{created_by_workos_user_id:user.id},
    },{idempotencyKey});

    const activeMemberships=await workos.userManagement.listOrganizationMemberships({
      organizationId:organization.id,userId:user.id,statuses:['active'],limit:100,
    });
    if(!activeMemberships.data.length){
      await workos.userManagement.createOrganizationMembership({
        organizationId:organization.id,userId:user.id,roleSlug:'admin',
      });
    }

    await refreshSession({organizationId:organization.id,ensureSignedIn:true});
  }catch(error){
    if(error&&typeof error==='object'&&'digest' in error&&typeof error.digest==='string'&&error.digest.startsWith('NEXT_REDIRECT'))throw error;
    return {error:'We could not create your organization. Please try again, or contact support if this keeps happening.'};
  }

  redirect(returnTo);
}
