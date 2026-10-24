-- Pin the search path on Phase 9 helper/trigger functions flagged by Supabase's security advisor.
alter function public.phase9_classify_error(text) set search_path=public;
alter function public.phase9_set_run_error_class() set search_path=public;
alter function public.phase9_set_step_error_class() set search_path=public;
alter function public.phase9_guard_run_transition() set search_path=public;
alter function public.phase9_guard_step_transition() set search_path=public;
