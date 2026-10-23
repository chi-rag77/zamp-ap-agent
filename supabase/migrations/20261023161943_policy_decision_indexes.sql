-- Cover Phase 04 foreign keys and latest-decision lookups.
create index if not exists agent_decisions_policy_idx on agent_decisions(policy_id);
create index if not exists agent_decisions_run_invoice_idx on agent_decisions(run_id,invoice_id);
create index if not exists agent_decisions_validation_idx on agent_decisions(validation_run_id) where validation_run_id is not null;
