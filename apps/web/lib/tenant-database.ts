import 'server-only';
import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {getWorkOS, withAuth} from '@workos-inc/authkit-nextjs';
import {decodeJwt} from 'jose';
import {createServerClient} from '@zamp/database';
import {workosAuthEnabled} from './workos-auth';
import {redirect} from 'next/navigation';

export type TenantDatabase = {db: SupabaseClient; organizationId: string; workosOrganizationId: string};

/** Use the RLS-protected WorkOS client for interactive requests. */
export async function createWebServerClient(): Promise<SupabaseClient> {
  if (!workosAuthEnabled()) return createServerClient();
  const auth=await withAuth();
  if(!auth.user)redirect('/login');
  if(!auth.organizationId)redirect('/organization-setup');
  return (await createTenantDatabase(auth)).db;
}

/** Check ownership through Supabase RLS before a legacy service-role operation. */
export async function tenantCanAccess(table: string, id: string, column = 'id'): Promise<boolean> {
  if (!workosAuthEnabled()) return true;
  const db = (await createTenantDatabase()).db;
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
  if (!existingMember.data || existingMember.data.email!==user.email || existingMember.data.status!=='ACTIVE' || (role&&existingMember.data.role!==role)) {
    const memberResult = await service.from('organization_memberships').upsert({
      organization_id: organizationId,
      workos_user_id: user.id,
      email: user.email,
      ...(role ? {role} : {}),
      status: 'ACTIVE',
    }, {onConflict: 'organization_id,workos_user_id'});
    if (memberResult.error) throw new Error(`Tenant membership sync failed: ${memberResult.error.message}`);
  }

  const db = createClient(url, key, {
    accessToken: async () => accessToken,
    auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
  });
  return {db, organizationId, workosOrganizationId};
}
