-- Pickup: tenant helpers, RLS policies, create_business RPC, voice secrets, call sessions.
-- Run AFTER 0001_init.sql.

create table public.voice_secrets (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  secret text not null
);
create table public.call_sessions (
  business_id uuid not null references public.businesses(id) on delete cascade,
  session_key text not null,
  state jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, session_key)
);
alter table public.voice_secrets enable row level security;
alter table public.call_sessions enable row level security;

create or replace function public.is_member(b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m where m.business_id = b and m.user_id = auth.uid())
$$;
create or replace function public.has_role(b uuid, roles text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships m
    where m.business_id = b and m.user_id = auth.uid() and m.role = any(roles))
$$;
revoke all on function public.is_member(uuid) from public, anon;
revoke all on function public.has_role(uuid, text[]) from public, anon;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.has_role(uuid, text[]) to authenticated;

-- profiles: own row only
create policy profiles_select on public.profiles for select to authenticated using (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- businesses / memberships / settings: members read, owner+admin update. No direct INSERT/DELETE (use create_business).
create policy businesses_select on public.businesses for select to authenticated using (public.is_member(id));
create policy businesses_update on public.businesses for update to authenticated
  using (public.has_role(id, array['owner','admin'])) with check (public.has_role(id, array['owner','admin']));
create policy memberships_select on public.memberships for select to authenticated using (public.is_member(business_id));
create policy settings_select on public.receptionist_settings for select to authenticated using (public.is_member(business_id));
create policy settings_update on public.receptionist_settings for update to authenticated
  using (public.has_role(business_id, array['owner','admin'])) with check (public.has_role(business_id, array['owner','admin']));

-- knowledge: members read, owner+admin write
create policy facts_select on public.facts for select to authenticated using (public.is_member(business_id));
create policy facts_write on public.facts for all to authenticated
  using (public.has_role(business_id, array['owner','admin'])) with check (public.has_role(business_id, array['owner','admin']));

-- voice secret: owner+admin only
create policy voice_secrets_select on public.voice_secrets for select to authenticated
  using (public.has_role(business_id, array['owner','admin']));

-- operational data: any member of that business
create policy leads_all on public.leads for all to authenticated using (public.is_member(business_id)) with check (public.is_member(business_id));
create policy tasks_all on public.callback_tasks for all to authenticated using (public.is_member(business_id)) with check (public.is_member(business_id));
create policy calls_all on public.calls for all to authenticated using (public.is_member(business_id)) with check (public.is_member(business_id));
create policy gaps_all on public.knowledge_gaps for all to authenticated using (public.is_member(business_id)) with check (public.is_member(business_id));
create policy sessions_all on public.call_sessions for all to authenticated using (public.is_member(business_id)) with check (public.is_member(business_id));

-- Atomic business creation: business + owner membership + settings + webhook secret
create or replace function public.create_business(p_name text, p_category text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); bid uuid; nm text := btrim(p_name);
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if nm is null or char_length(nm) not between 1 and 80 then raise exception 'invalid business name'; end if;
  if (select count(*) from public.businesses where created_by = uid) >= 5 then raise exception 'business limit reached'; end if;
  insert into public.businesses (name, category, created_by) values (nm, nullif(btrim(p_category), ''), uid) returning id into bid;
  insert into public.memberships (business_id, user_id, role) values (bid, uid, 'owner');
  insert into public.receptionist_settings (business_id, greeting)
    values (bid, 'Hello, thanks for calling ' || nm || '. How can I help?');
  insert into public.voice_secrets (business_id, secret)
    values (bid, replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));
  return bid;
end $$;
revoke all on function public.create_business(text, text) from public, anon;
grant execute on function public.create_business(text, text) to authenticated;
