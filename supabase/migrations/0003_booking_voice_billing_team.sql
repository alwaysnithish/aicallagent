-- Run AFTER 0002. Adds: booking config, appointments, phone numbers, billing state, team functions.

alter table public.receptionist_settings
  add column timezone text not null default 'Asia/Kolkata',
  add column open_time time not null default '09:00',
  add column close_time time not null default '18:00',
  add column work_days int[] not null default '{1,2,3,4,5,6}',
  add column slot_minutes int not null default 30 check (slot_minutes between 10 and 240),
  add column booking_enabled boolean not null default true;

create table public.phone_numbers (
  number text primary key check (number ~ '^\+[1-9][0-9]{7,14}$'),
  business_id uuid not null references public.businesses(id) on delete cascade,
  provider text not null default 'twilio',
  created_at timestamptz not null default now()
);
create index phone_numbers_business_idx on public.phone_numbers(business_id);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  customer_name text not null,
  customer_phone text not null,
  notes text,
  status text not null default 'booked' check (status in ('booked','cancelled','completed')),
  source text not null default 'call',
  created_at timestamptz not null default now()
);
-- Prevents double booking of the same start time
create unique index appointments_no_double_booking on public.appointments(business_id, starts_at) where status = 'booked';
create index appointments_business_idx on public.appointments(business_id, starts_at);

create table public.business_billing (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','starter','pro')),
  status text not null default 'none',
  stripe_customer_id text,
  stripe_subscription_id text,
  updated_at timestamptz not null default now()
);
insert into public.business_billing (business_id) select id from public.businesses on conflict do nothing;

alter table public.phone_numbers enable row level security;
alter table public.appointments enable row level security;
alter table public.business_billing enable row level security;

create policy phones_select on public.phone_numbers for select to authenticated using (public.is_member(business_id));
create policy phones_write on public.phone_numbers for all to authenticated
  using (public.has_role(business_id, array['owner','admin'])) with check (public.has_role(business_id, array['owner','admin']));
create policy appts_all on public.appointments for all to authenticated
  using (public.is_member(business_id)) with check (public.is_member(business_id));
-- Billing rows are readable by owner/admin; written ONLY by the server with the service role (Stripe webhook).
create policy billing_select on public.business_billing for select to authenticated
  using (public.has_role(business_id, array['owner','admin']));

-- create_business now also creates the billing row and a 100-minute free limit
create or replace function public.create_business(p_name text, p_category text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); bid uuid; nm text := btrim(p_name);
begin
  if uid is null then raise exception 'not authenticated'; end if;
  if nm is null or char_length(nm) not between 1 and 80 then raise exception 'invalid business name'; end if;
  if (select count(*) from public.businesses where created_by = uid) >= 5 then raise exception 'business limit reached'; end if;
  insert into public.businesses (name, category, created_by) values (nm, nullif(btrim(p_category), ''), uid) returning id into bid;
  insert into public.memberships (business_id, user_id, role) values (bid, uid, 'owner');
  insert into public.receptionist_settings (business_id, greeting, monthly_minute_limit)
    values (bid, 'Hello, thanks for calling ' || nm || '. How can I help?', 100);
  insert into public.voice_secrets (business_id, secret)
    values (bid, replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));
  insert into public.business_billing (business_id) values (bid);
  return bid;
end $$;

-- Team management (no email sending: the person must have signed up first)
create or replace function public.list_members(p_business uuid)
returns table(user_id uuid, email text, role text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_member(p_business) then raise exception 'forbidden'; end if;
  return query select m.user_id, u.email::text, m.role
    from public.memberships m join auth.users u on u.id = m.user_id
    where m.business_id = p_business order by m.created_at;
end $$;

create or replace function public.add_member_by_email(p_business uuid, p_email text, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  if p_role not in ('admin','member') then raise exception 'invalid role'; end if;
  if not public.has_role(p_business, array['owner','admin']) then raise exception 'forbidden'; end if;
  if p_role = 'admin' and not public.has_role(p_business, array['owner']) then raise exception 'only the owner can add admins'; end if;
  select id into target from auth.users where lower(email) = lower(btrim(p_email));
  if target is null then raise exception 'No account with that email. Ask them to sign up first.'; end if;
  insert into public.memberships (business_id, user_id, role) values (p_business, target, p_role)
    on conflict (business_id, user_id) do nothing;
end $$;

create or replace function public.remove_member(p_business uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.has_role(p_business, array['owner']) then raise exception 'only the owner can remove members'; end if;
  delete from public.memberships where business_id = p_business and user_id = p_user and role <> 'owner';
end $$;

revoke all on function public.list_members(uuid) from public, anon;
revoke all on function public.add_member_by_email(uuid, text, text) from public, anon;
revoke all on function public.remove_member(uuid, uuid) from public, anon;
revoke all on function public.create_business(text, text) from public, anon;
grant execute on function public.list_members(uuid) to authenticated;
grant execute on function public.add_member_by_email(uuid, text, text) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
grant execute on function public.create_business(text, text) to authenticated;
