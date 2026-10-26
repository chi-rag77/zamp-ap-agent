import 'server-only';
import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {getWorkOS, withAuth} from '@workos-inc/authkit-nextjs';
import {decodeJwt} from 'jose';
import {createServerClient} from '@zamp/database';
import {workosAuthConfigured} from './workos-auth';
import {redirect} from 'next/navigation';

export type TenantDatabase = {db: SupabaseClient; organizationId: string; workosOrganizationId: string};

/** Use the RLS-protected WorkOS client for interactive requests. */
export async function createWebServerClient(): Promise<SupabaseClient> {
  if(workosAuthConfigured()){
    try{
      const auth=await withAuth();
      if(auth.user){if(!auth.organizationId)redirect('/organization-setup');return (await createTenantDatabase(auth)).db;}
    }catch(error){if(process.env.NODE_ENV==='production')redirect('/login');if(error instanceof Error&&error.message.includes('suspended'))throw error;}
  }
  if(process.env.NODE_ENV==='production')redirect('/login');
  return createServerClient();
}

/** Check ownership through Supabase RLS before a legacy service-role operation. */
export async function tenantCanAccess(table: string, id: string, column = 'id'): Promise<boolean> {
  if(!workosAuthConfigured())return process.env.NODE_ENV!=='production';
  let auth:Awaited<ReturnType<typeof withAuth>>;
  try{auth=await withAuth()}catch{return false;}
  if(!auth.user||!auth.organizationId||!auth.accessToken)return process.env.NODE_ENV!=='production';
  const db = (await createTenantDatabase(auth)).db;
  const {data, error} = await db.from(table).select(column).eq(column, id).maybeSingle();
  if (error) throw new Error(`Tenant access check failed: ${error.message}`);
  return Boolean(data);
}

/**
 * Creates a request-scoped Supabase client using the verified WorkOS access
 * token. RLS, rather than a service-role filter, is the tenant boundary.
 */
export async function createTenantDatabase(authContext?: Awaited<ReturnType<typeof withAuth>>): Promise<TenantDatabase> {
  const {user, organizationId: workosOrganizationId, accessToken, role: workosRoleClaim} = authContext ?? await withAuth();
  if (!user || !workosOrganizationId || !accessToken) {
    throw new Error('A signed-in WorkOS organization session is required.');
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Set the Supabase URL and publishable/anon key.');

  const service = createServerClient();
  // Existing organizations are already mapped by their verified WorkOS ID. Resolve that
  // mapping locally first; calling WorkOS on every page request added a network round trip.
  let orgResult = await service.from('organizations').select('id').eq('workos_organization_id',workosOrganizationId).maybeSingle();
  if (orgResult.error) throw new Error(`Tenant mapping failed: ${orgResult.error.message}`);
  if (!orgResult.data) {
    const workosOrganization = await getWorkOS().organizations.getOrganization(workosOrganizationId);
    orgResult = await service.from('organizations').upsert({
      workos_organization_id: workosOrganization.id,
      name: workosOrganization.name,
      slug: null,
    }, {onConflict: 'workos_organization_id'}).select('id').single();
    if (orgResult.error) throw new Error(`Tenant mapping failed: ${orgResult.error.message}`);
  }
  if (!orgResult.data) throw new Error('Tenant mapping did not return an organization ID.');
  const organizationId=orgResult.data.id;

  const tokenClaims = decodeJwt(accessToken) as {user_role?: string; workos_role?: string};
  const workosRole = (tokenClaims.user_role ?? tokenClaims.workos_role ?? workosRoleClaim)?.toUpperCase();
  const role = workosRole && ['OWNER','ADMIN','AP_MANAGER','REVIEWER','MEMBER'].includes(workosRole)
    ? workosRole
    : undefined;
  const existingMember = await service.from('organization_memberships').select('email,role,status')
    .eq('organization_id',organizationId).eq('workos_user_id',user.id).maybeSingle();
  if (existingMember.error) throw new Error(`Tenant membership lookup failed: ${existingMember.error.message}`);
  if(existingMember.data?.status==='INACTIVE')throw new Error('Your membership in this organization is suspended. Contact an administrator.');
  if (!existingMember.data) {
    const invitation=await service.from('organization_invitations').select('id,role,first_name,last_name,employee_id,department,team,job_title,approval_limit,approval_currency,approval_categories,routing_capabilities')
      .eq('organization_id',organizationId).eq('email',user.email.toLowerCase()).eq('status','PENDING').order('created_at',{ascending:false}).limit(1).maybeSingle();
    if(invitation.error)throw new Error(`Organization invitation lookup failed: ${invitation.error.message}`);
    const memberResult = await service.from('organization_memberships').upsert({
      organization_id: organizationId,
      workos_user_id: user.id,
      email: user.email,
      first_name: invitation.data?.first_name??user.firstName??null,
      last_name: invitation.data?.last_name??user.lastName??null,
      role: invitation.data?.role ?? role ?? 'MEMBER',
      ...(invitation.data?{employee_id:invitation.data.employee_id,department:invitation.data.department,team:invitation.data.team,job_title:invitation.data.job_title,approval_limit:invitation.data.approval_limit,approval_currency:invitation.data.approval_currency,approval_categories:invitation.data.approval_categories,routing_capabilities:invitation.data.routing_capabilities}:{}),
      status: 'ACTIVE',
    }, {onConflict: 'organization_id,workos_user_id'});
    if (memberResult.error) throw new Error(`Tenant membership sync failed: ${memberResult.error.message}`);
    if(invitation.data){const accepted=await service.from('organization_invitations').update({status:'ACCEPTED',updated_at:new Date().toISOString()}).eq('id',invitation.data.id);if(accepted.error)throw new Error('Membership was created, but invitation status could not be updated.');}
  } else if(existingMember.data.email!==user.email) {
    const memberResult=await service.from('organization_memberships').update({email:user.email,updated_at:new Date().toISOString()}).eq('organization_id',organizationId).eq('workos_user_id',user.id);
    if(memberResult.error)throw new Error(`Tenant membership sync failed: ${memberResult.error.message}`);
  }

  const db = createClient(url, key, {
    accessToken: async () => accessToken,
    auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
  });
  return {db, organizationId, workosOrganizationId};
}
