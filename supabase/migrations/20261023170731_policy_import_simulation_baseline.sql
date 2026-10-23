alter table public.policy_import_simulations
  add column current_policy_id uuid references public.policies(id);

create or replace function public.activate_imported_policy(p_import_run_id uuid)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_run public.policy_import_runs%rowtype;
  v_policy public.policies%rowtype;
  v_sim public.policy_import_simulations%rowtype;
  v_active_id uuid;
begin
  select * into v_run from public.policy_import_runs where id = p_import_run_id for update;
  if not found or v_run.status <> 'SIMULATED' or v_run.draft_policy_id is null then
    raise exception 'A simulated draft is required before activation';
  end if;
  if exists(select 1 from public.policy_import_issues where import_run_id = p_import_run_id and status = 'OPEN') then
    raise exception 'Resolve all policy import issues before activation';
  end if;
  if exists(select 1 from public.imported_policy_rules where import_run_id = p_import_run_id and status not in ('APPROVED','IGNORED')) then
    raise exception 'Review every imported rule before activation';
  end if;
  if not exists(select 1 from public.imported_policy_rules where import_run_id = p_import_run_id and status = 'APPROVED') then
    raise exception 'At least one approved rule is required';
  end if;
  select * into v_policy from public.policies where id = v_run.draft_policy_id for update;
  if not found or v_policy.status <> 'DRAFT' then
    raise exception 'Draft policy is unavailable';
  end if;
  select * into v_sim from public.policy_import_simulations
   where import_run_id = p_import_run_id and draft_policy_id = v_policy.id
   order by created_at desc limit 1;
  if not found or v_sim.invoice_count < 1 or v_sim.current_policy_id is null then
    raise exception 'A current simulation with validated invoices is required';
  end if;
  select id into v_active_id from public.policies where status = 'ACTIVE' for update;
  if not found or v_active_id <> v_sim.current_policy_id then
    raise exception 'Active policy changed after simulation; simulate again';
  end if;
  update public.policies set status = 'ARCHIVED' where id = v_active_id;
  update public.policies set status = 'ACTIVE', effective_from = now() where id = v_policy.id;
  update public.policy_import_runs set status = 'ACTIVE', updated_at = now() where id = p_import_run_id;
  insert into public.audit_events(actor_type,event_type,description,metadata)
  values('SYSTEM','POLICY_IMPORT_ACTIVATED','Reviewed imported policy activated',
         jsonb_build_object('import_run_id',p_import_run_id,'policy_id',v_policy.id,'simulation_id',v_sim.id));
  return v_policy.id;
end $$;
revoke all on function public.activate_imported_policy(uuid) from public, anon, authenticated;
grant execute on function public.activate_imported_policy(uuid) to service_role;
