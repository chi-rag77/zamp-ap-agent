import {withAuth} from '@workos-inc/authkit-nextjs';
import {redirect} from 'next/navigation';

function safeReturnTo(value?:string){return value?.startsWith('/')&&!value.startsWith('//')&&!value.includes('\\')?value:'/'}

export default async function AuthCompletePage({searchParams}:{searchParams:Promise<{returnTo?:string}>}){
  const [{user,organizationId},params]=await Promise.all([withAuth(),searchParams]);
  const returnTo=safeReturnTo(params.returnTo);
  if(!user)redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  if(!organizationId)redirect(`/organization-setup?returnTo=${encodeURIComponent(returnTo)}`);
  redirect(returnTo);
}
