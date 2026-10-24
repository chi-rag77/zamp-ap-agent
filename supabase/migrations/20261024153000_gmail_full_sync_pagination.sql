-- Keep Gmail first-time / expired-cursor scans resumable across short requests.
alter table email_sync_state
  add column if not exists full_sync_page_token text;
