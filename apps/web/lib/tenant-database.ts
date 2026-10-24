import 'server-only';
import {createClient, type SupabaseClient} from '@supabase/supabase-js';
import {getWorkOS, withAuth} from '@workos-inc/authkit-nextjs';
import {decodeJwt} from 'jose';
import {createServerClient} from '@zamp/database';
import {workosAuthEnabled} from './workos-auth';

export type TenantDatabase = {db: SupabaseClient; organizationId: string; workosOrganizationId: string};

/** Use the RLS-protected WorkOS client for interactive requests. */
export async function createWebServerClient(): Promise<SupabaseClient> {
  if (!workosAuthEnabled()) return createServerClient();
  return (await createTenantDatabase()).db;
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
export async function createTenantDatabase(): Promise<TenantDatabase> {
  const {user, organizationId: workosOrganizationId, accessToken, role: workosRoleClaim} = await withAuth();
  if (!user || !workosOrganizationId || !accessToken) {
    throw new Error('A signed-in WorkOS organization session is required.');
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Set the Supabase URL and publishable/anon key.');

  const service = createServerClient();
  const workosOrganization = await getWorkOS().organizations.getOrganization(workosOrganizationId);
  const orgResult = await service.from('organizations').upsert({
    workos_organization_id: workosOrganization.id,
    name: workosOrganization.name,
    slug: null,
  }, {onConflict: 'workos_organization_id'}).select('id').single();
  if (orgResult.error) throw new Error(`Tenant mapping failed: ${orgResult.error.message}`);

  const tokenClaims = decodeJwt(accessToken) as {user_role?: string; workos_role?: string};
  const workosRole = (tokenClaims.user_role ?? tokenClaims.workos_role ?? workosRoleClaim)?.toUpperCase();
  const role = workosRole && ['OWNER','ADMIN','AP_MANAGER','REVIEWER','MEMBER'].includes(workosRole)
    ? workosRole
    : undefined;
  const memberResult = await service.from('organization_memberships').upsert({
    organization_id: orgResult.data.id,
    workos_user_id: user.id,
    email: user.email,
    ...(role ? {role} : {}),
    status: 'ACTIVE',
  }, {onConflict: 'organization_id,workos_user_id'});
  if (memberResult.error) throw new Error(`Tenant membership sync failed: ${memberResult.error.message}`);

  const db = createClient(url, key, {
    accessToken: async () => accessToken,
    auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
  });
  return {db, organizationId: orgResult.data.id, workosOrganizationId};
}
