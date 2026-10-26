-- Notifications commit in the same transaction as their source event.
create function private.workspace_notify() returns trigger language plpgsql set search_path='' as $$
declare recipients text[]; actor text; heading text; detail text; recipient_id text;
begin
 if tg_table_name='object_messages' then
  actor:=new.created_by;
  if tg_op='INSERT' then
   recipients:=new.mentions; heading:='You were mentioned';detail:=new.author_name||': '||left(new.body,200);
   if new.parent_id is not null then recipients:=array_append(recipients,(select created_by from public.object_messages where id=new.parent_id));heading:='Discussion updated';end if;
  elsif old.resolved_at is distinct from new.resolved_at and new.resolved_at is not null then
   recipients:=new.mentions;heading:='Discussion resolved';detail:='A discussion on this record was resolved.';
  else return new;
  end if;
 else
  actor:=new.updated_by;
  if tg_op='UPDATE' then if old.assignee is not distinct from new.assignee and old.waiting_on is not distinct from new.waiting_on and old.reason=new.reason and old.due_date is not distinct from new.due_date then return new;end if;end if;
  recipients:=array[new.assignee,new.waiting_on];heading:='Work assigned to you';detail:=coalesce(nullif(new.reason,''),'A record requires your attention.');
 end if;
 for recipient_id in select distinct unnest(recipients) loop
  if recipient_id is not null and recipient_id<>actor then
   if not exists(select 1 from public.organization_memberships where organization_id=new.organization_id and workos_user_id=recipient_id and status='ACTIVE') then raise exception 'Recipient is not an active organization member';end if;
   insert into public.object_notifications(organization_id,object_type,object_id,recipient,title,message) values(new.organization_id,new.object_type,new.object_id,recipient_id,heading,detail);
  end if;
 end loop;
 return new;
end $$;
revoke all on function private.workspace_notify() from public,anon,authenticated;
create trigger object_message_notify after insert or update on public.object_messages for each row execute function private.workspace_notify();
create trigger object_assignment_notify after insert or update on public.object_assignments for each row execute function private.workspace_notify();
