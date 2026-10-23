-- Phase 04: decisions record eligibility only; no invoice status or payment mutation.
alter type agent_decision_type add value if not exists 'CANNOT_DECIDE';
alter table agent_decisions add column if not exists validation_run_id uuid references invoice_validation_runs(id), add column if not exists reason_code text, add column if not exists evidence jsonb not null default '[]'::jsonb, add column if not exists blockers jsonb not null default '[]'::jsonb, add column if not exists warnings jsonb not null default '[]'::jsonb, add column if not exists recommended_action text, add column if not exists evaluation_duration_ms integer;
create unique index if not exists agent_decisions_validation_policy_idx on agent_decisions(validation_run_id,policy_id) where validation_run_id is not null;
create index if not exists agent_decisions_invoice_created_idx on agent_decisions(invoice_id,created_at desc);
alter table agent_decisions add constraint agent_decisions_evidence_array check (jsonb_typeof(evidence)='array' and jsonb_typeof(blockers)='array' and jsonb_typeof(warnings)='array');

create function reject_policy_configuration_mutation() returns trigger language plpgsql set search_path=public as $$
begin
 if exists(select 1 from agent_decisions where policy_id=old.id) and (old.configuration is distinct from new.configuration or old.version is distinct from new.version or old.name is distinct from new.name) then
  raise exception 'Used policy versions are immutable';
 end if;
 return new;
end $$;
create trigger policies_used_version_immutable before update on policies for each row execute function reject_policy_configuration_mutation();

create function reject_policy_decision_mutation() returns trigger language plpgsql set search_path=public as $$
begin raise exception 'Policy decisions are append-only'; end $$;
create trigger agent_decisions_immutable before update or delete on agent_decisions for each row execute function reject_policy_decision_mutation();

create function persist_policy_decision(p_validation_run_id uuid,p_policy_id uuid,p_decision jsonb)
returns uuid language plpgsql security invoker set search_path=public as $$
declare v_validation invoice_validation_runs%rowtype;v_policy policies%rowtype;v_id uuid;v_kind agent_decision_type;
begin
 select * into v_validation from invoice_validation_runs where id=p_validation_run_id;
 if not found or v_validation.status='ERROR' then raise exception 'Completed validation not found'; end if;
 select * into v_policy from policies where id=p_policy_id;
 if not found or v_policy.status<>'ACTIVE' then raise exception 'Active policy not found'; end if;
 if p_decision->>'invoiceId'<>v_validation.invoice_id::text or p_decision->>'validationRunId'<>v_validation.run_id::text or p_decision->>'policyId'<>v_policy.id::text or p_decision->>'policyVersion'<>v_policy.version then raise exception 'Decision identity mismatch'; end if;
 if p_decision->>'decision' not in ('AUTO_APPROVE','AUTO_REJECT','NEEDS_REVIEW','CANNOT_DECIDE') or p_decision->>'reasonCode' is null then raise exception 'Invalid policy decision'; end if;
 v_kind:=case p_decision->>'decision' when 'AUTO_APPROVE' then 'AUTO_APPROVED' when 'AUTO_REJECT' then 'AUTO_REJECTED' when 'NEEDS_REVIEW' then 'NEEDS_REVIEW' else 'CANNOT_DECIDE' end::agent_decision_type;
 insert into agent_decisions(invoice_id,run_id,validation_run_id,decision,confidence,summary,reasoning_summary,policy_id,policy_version,reason_code,evidence,blockers,warnings,recommended_action,evaluation_duration_ms,action,action_status)
 values(v_validation.invoice_id,v_validation.run_id,p_validation_run_id,v_kind,(p_decision->>'confidence')::numeric,p_decision->>'summary',p_decision->>'summary',v_policy.id,v_policy.version,p_decision->>'reasonCode',p_decision->'evidence',p_decision->'blockers',p_decision->'warnings',p_decision->>'recommendedAction',(p_decision->>'evaluationDurationMs')::integer,'NONE','PENDING')
 on conflict (validation_run_id,policy_id) where validation_run_id is not null do nothing returning id into v_id;
 if v_id is null then select id into v_id from agent_decisions where validation_run_id=p_validation_run_id and policy_id=p_policy_id;return v_id;end if;
 insert into audit_events(invoice_id,run_id,actor_type,event_type,description,metadata)
 values(v_validation.invoice_id,v_validation.run_id,'AGENT','POLICY_EVALUATED','Invoice policy evaluation completed with '||(p_decision->>'decision')||' decision',jsonb_build_object('decision_id',v_id,'validation_run_id',p_validation_run_id,'policy_id',v_policy.id,'policy_version',v_policy.version,'reason_code',p_decision->>'reasonCode','decision',p_decision->>'decision'));
 return v_id;
end $$;
revoke all on function persist_policy_decision(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function persist_policy_decision(uuid,uuid,jsonb) to service_role;
