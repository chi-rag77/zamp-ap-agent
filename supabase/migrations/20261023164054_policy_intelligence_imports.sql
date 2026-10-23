-- Policy Intelligence imports remain drafts until explicit simulation and activation.
create table policy_import_runs (
 id uuid primary key default gen_random_uuid(), status text not null default 'UPLOADED' check(status in ('UPLOADED','PROCESSING','REVIEW_READY','DRAFT','SIMULATED','ACTIVE','FAILED')),
 policy_name text, description text, document_count integer not null default 0 check(document_count between 0 and 12),
 rules_detected integer not null default 0, high_confidence_count integer not null default 0, medium_confidence_count integer not null default 0, low_confidence_count integer not null default 0,
 ambiguity_count integer not null default 0, conflict_count integer not null default 0, unsupported_count integer not null default 0,
 quality_score integer check(quality_score between 0 and 100), summary jsonb not null default '{}'::jsonb check(jsonb_typeof(summary)='object'),
 draft_policy_id uuid references policies(id), error_code text, error_message text, started_at timestamptz, completed_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index policy_import_runs_created_idx on policy_import_runs(created_at desc);
create table policy_source_documents (
 id uuid primary key default gen_random_uuid(), import_run_id uuid not null references policy_import_runs(id) on delete cascade,
 filename text not null, mime_type text not null, storage_path text not null unique, file_hash text not null check(file_hash ~ '^[0-9a-f]{64}$'), file_size bigint not null check(file_size between 1 and 20971520),
 processing_status text not null default 'UPLOADED' check(processing_status in ('UPLOADED','PARSED','FAILED')), page_count integer check(page_count>0), sheet_count integer check(sheet_count>0),
 uploaded_by uuid references auth.users(id), uploaded_at timestamptz not null default now(), error_message text,
 unique(import_run_id,file_hash), check(storage_path like import_run_id::text || '/%')
);
create index policy_source_documents_run_idx on policy_source_documents(import_run_id);
create table policy_source_chunks (
 id uuid primary key default gen_random_uuid(), document_id uuid not null references policy_source_documents(id) on delete cascade,
 chunk_index integer not null check(chunk_index>=0), page_number integer check(page_number>0), sheet_name text, cell_range text, section text,
 content text not null check(length(content) between 1 and 12000), created_at timestamptz not null default now(), unique(document_id,chunk_index)
);
create index policy_source_chunks_document_idx on policy_source_chunks(document_id,chunk_index);
create table imported_policy_rules (
 id uuid primary key default gen_random_uuid(), import_run_id uuid not null references policy_import_runs(id) on delete cascade,
 source_document_id uuid not null references policy_source_documents(id), extracted_rule jsonb not null check(jsonb_typeof(extracted_rule)='object'),
 final_rule jsonb not null check(jsonb_typeof(final_rule)='object'), confidence numeric(5,4) not null check(confidence between 0 and 1),
 source_evidence jsonb not null check(jsonb_typeof(source_evidence)='array'), status text not null default 'SUGGESTED' check(status in ('SUGGESTED','EDITED','APPROVED','IGNORED')),
 edited_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index imported_policy_rules_run_idx on imported_policy_rules(import_run_id,created_at);
create table policy_import_issues (
 id uuid primary key default gen_random_uuid(), import_run_id uuid not null references policy_import_runs(id) on delete cascade,
 issue_type text not null check(issue_type in ('AMBIGUITY','CONFLICT','UNSUPPORTED','DRIFT')),
 description text not null, rule_ids uuid[] not null default '{}', evidence jsonb not null default '[]'::jsonb check(jsonb_typeof(evidence)='array'),
 status text not null default 'OPEN' check(status in ('OPEN','RESOLVED','IGNORED')), resolution text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index policy_import_issues_run_idx on policy_import_issues(import_run_id,status);
create table policy_import_simulations (
 id uuid primary key default gen_random_uuid(), import_run_id uuid not null references policy_import_runs(id) on delete cascade,
 draft_policy_id uuid not null references policies(id), window_start timestamptz not null, window_end timestamptz not null,
 invoice_count integer not null check(invoice_count>=0), current_counts jsonb not null, proposed_counts jsonb not null,
 decision_diffs jsonb not null check(jsonb_typeof(decision_diffs)='array'), created_at timestamptz not null default now()
);
create index policy_import_simulations_run_idx on policy_import_simulations(import_run_id,created_at desc);

alter table policy_import_runs enable row level security;
alter table policy_source_documents enable row level security;
alter table policy_source_chunks enable row level security;
alter table imported_policy_rules enable row level security;
alter table policy_import_issues enable row level security;
alter table policy_import_simulations enable row level security;
revoke all on policy_import_runs,policy_source_documents,policy_source_chunks,imported_policy_rules,policy_import_issues,policy_import_simulations from anon,authenticated;
grant all on policy_import_runs,policy_source_documents,policy_source_chunks,imported_policy_rules,policy_import_issues,policy_import_simulations to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('policy-sources','policy-sources',false,20971520,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel','text/csv','image/png','image/jpeg'])
on conflict(id) do nothing;
