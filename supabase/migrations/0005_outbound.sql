-- Run AFTER 0004. Outbound telecalling: campaigns, contacts, DNC, wallet, dialer helpers.

alter table public.calls
  add column direction text not null default 'inbound' check (direction in ('inbound','outbound')),
  add column campaign_id uuid,
  add column contact_id uuid,
  add column external_id text,
  add column transcript jsonb;
create unique index calls_external_unique on public.calls(business_id, external_id) where external_id is not null;

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  goal text not null check (char_length(goal) between 10 and 1500),
  language text not null default 'Hindi' check (language in ('Hindi','Telugu','Tamil','Kannada','Malayalam','Marathi','English')),
  agent_name text not null default 'Meera' check (char_length(agent_name) between 1 and 30),
  company_name text check (char_length(company_name) <= 80),
  status text not null default 'draft' check (status in ('draft','running','paused','completed')),
  call_start time not null default '10:00',
  call_end time not null default '19:00',
  max_concurrent int not null default 3 check (max_concurrent between 1 and 20),
  max_attempts int not null default 3 check (max_attempts between 1 and 6),
  retry_minutes int not null default 120 check (retry_minutes between 5 and 2880),
  outcome_webhook text check (outcome_webhook is null or outcome_webhook ~ '^https://'),
  created_at timestamptz not null default now()
);
create index campaigns_business_idx on public.campaigns(business_id, status);

create table public.campaign_secrets (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  business_id uuid not null references public.businesses(id) on delete cascade,
  webhook_secret text not null,
  intake_secret text not null
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text,
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  status text not null default 'pending' check (status in ('pending','calling','done','dnc','failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  claimed_at timestamptz,
  last_outcome text,
  consent_attested boolean not null default false,
  created_at timestamptz not null default now(),
  unique (campaign_id, phone)
);
create index contacts_due_idx on public.contacts(campaign_id, status, next_attempt_at);

alter table public.calls
  add constraint calls_campaign_fk foreign key (campaign_id) references public.campaigns(id) on delete set null,
  add constraint calls_contact_fk foreign key (contact_id) references public.contacts(id) on delete set null;

create table public.dnc_numbers (
  business_id uuid not null references public.businesses(id) on delete cascade,
  phone text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  reason text,
  created_at timestamptz not null default now(),
  primary key (business_id, phone)
);

create table public.business_wallets (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  balance_paise bigint not null default 0,
  updated_at timestamptz not null default now()
);
create table public.wallet_ledger (
  id bigint generated always as identity primary key,
  business_id uuid not null references public.businesses(id) on delete cascade,
  delta_paise bigint not null,
  reason text not null,
  ref text,
  created_at timestamptz not null default now()
);
create unique index wallet_ledger_ref_unique on public.wallet_ledger(business_id, ref) where ref is not null;
create index wallet_ledger_business_idx on public.wallet_ledger(business_id, created_at desc);

alter table public.campaigns enable row level security;
alter table public.campaign_secrets enable row level security;
alter table public.contacts enable row level security;
alter table public.dnc_numbers enable row level security;
alter table public.business_wallets enable row level security;
alter table public.wallet_ledger enable row level security;

create policy campaigns_select on public.campaigns for select to authenticated using (public.is_member(business_id));
create policy campaigns_write on public.campaigns for all to authenticated
  using (public.has_role(business_id, array['owner','admin'])) with check (public.has_role(business_id, array['owner','admin']));
create policy campaign_secrets_all on public.campaign_secrets for all to authenticated
  using (public.has_role(business_id, array['owner','admin'])) with check (public.has_role(business_id, array['owner','admin']));
create policy contacts_select on public.contacts for select to authenticated using (public.is_member(business_id));
create policy contacts_write on public.contacts for all to authenticated
  using (public.has_role(business_id, array['owner','admin'])) with check (public.has_role(business_id, array['owner','admin']));
create policy dnc_select on public.dnc_numbers for select to authenticated using (public.is_member(business_id));
create policy dnc_write on public.dnc_numbers for all to authenticated
  using (public.has_role(business_id, array['owner','admin'])) with check (public.has_role(business_id, array['owner','admin']));
-- Wallet: owner/admin can READ; only the server (service role) changes balances.
create policy wallets_select on public.business_wallets for select to authenticated using (public.has_role(business_id, array['owner','admin']));
create policy ledger_select on public.wallet_ledger for select to authenticated using (public.has_role(business_id, array['owner','admin']));

create or replace function public.wallet_credit(p_business uuid, p_amount bigint, p_ref text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  insert into public.wallet_ledger (business_id, delta_paise, reason, ref) values (p_business, p_amount, 'topup', p_ref) on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then return false; end if;
  insert into public.business_wallets (business_id, balance_paise) values (p_business, p_amount)
    on conflict (business_id) do update set balance_paise = public.business_wallets.balance_paise + excluded.balance_paise, updated_at = now();
  return true;
end $$;

create or replace function public.wallet_debit(p_business uuid, p_amount bigint, p_reason text, p_ref text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  insert into public.wallet_ledger (business_id, delta_paise, reason, ref) values (p_business, -p_amount, p_reason, p_ref) on conflict do nothing;
  get diagnostics n = row_count;
  if n = 0 then return false; end if;
  insert into public.business_wallets (business_id, balance_paise) values (p_business, -p_amount)
    on conflict (business_id) do update set balance_paise = public.business_wallets.balance_paise - p_amount, updated_at = now();
  return true;
end $$;

-- Atomically claims due contacts so two dialer runs never call the same person twice.
create or replace function public.claim_contacts(p_campaign uuid, p_limit int) returns setof public.contacts
language plpgsql security definer set search_path = '' as $$
begin
  return query
  update public.contacts c set status = 'calling', attempts = c.attempts + 1, claimed_at = now()
  where c.id in (
    select id from public.contacts
    where campaign_id = p_campaign and status = 'pending' and next_attempt_at <= now()
    order by next_attempt_at limit p_limit for update skip locked)
  returning c.*;
end $$;

revoke all on function public.wallet_credit(uuid, bigint, text) from public, anon, authenticated;
revoke all on function public.wallet_debit(uuid, bigint, text, text) from public, anon, authenticated;
revoke all on function public.claim_contacts(uuid, int) from public, anon, authenticated;
grant execute on function public.wallet_credit(uuid, bigint, text) to service_role;
grant execute on function public.wallet_debit(uuid, bigint, text, text) to service_role;
grant execute on function public.claim_contacts(uuid, int) to service_role;
