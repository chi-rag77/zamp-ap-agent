import {withAuth} from '@workos-inc/authkit-nextjs';
import {redirect} from 'next/navigation';
import {OrganizationSetupForm} from './organization-setup-form';
import './organization-setup.css';

function safeReturnTo(value?:string){return value?.startsWith('/')&&!value.startsWith('//')&&!value.includes('\\')?value:'/'}

export const metadata={title:'Create your organization — Zamp',description:'Set up a secure Zamp workspace for your organization.'};

export default async function OrganizationSetupPage({searchParams}:{searchParams:Promise<{returnTo?:string}>}){
  const [{user,organizationId},params]=await Promise.all([withAuth(),searchParams]);
  const returnTo=safeReturnTo(params.returnTo);
  if(!user)redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  if(organizationId)redirect(returnTo);
  return <main className="organization-setup-page"><header className="organization-setup-brand"><span>Z</span><strong>Zamp</strong><small>AP INVOICE</small></header><section className="organization-setup-card"><div className="organization-setup-symbol" aria-hidden="true">＋</div><p className="organization-setup-eyebrow">YOUR WORKSPACE</p><h1>Create your organization</h1><p className="organization-setup-description">Your account isn’t part of an organization yet. Create a workspace to securely manage your accounts payable workflow.</p><OrganizationSetupForm returnTo={returnTo}/><p className="organization-setup-account">Signed in as <strong>{user.email}</strong></p></section><footer className="organization-setup-footer">Each organization has its own isolated workspace and data.</footer></main>;
}
