-- Bound each Gmail history sync invocation and resume safely at the next page.
alter table public.email_sync_state
  add column if not exists history_page_token text,
  add column if not exists history_target_id text;
