alter table agent_runs add column if not exists reason_code text;
update agent_runs r set reason_code=d.reason_code from agent_run_decisions l join agent_decisions d on d.id=l.decision_id where l.agent_run_id=r.id and r.reason_code is null;
