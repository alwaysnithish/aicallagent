-- Pickup Phase 2: schema. RLS is ENABLED on every table with NO policies,
-- so all access by signed-in or anonymous users is denied until Phase 3.
-- Run this whole file once in the Supabase SQL Editor.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  category text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.memberships (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','member')),
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index memberships_user_idx on public.memberships(user_id);

create table public.receptionist_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  persona text not null default 'Asha',
  greeting text not null default 'Hello, thanks for calling. How can I help?',
  hours text,
  language text not null default 'English',
  handoff_number text,
  version int not null default 1,
  monthly_minute_limit int not null default 300 check (monthly_minute_limit >= 0),
  updated_at timestamptz not null default now()
);

create table public.facts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  keywords text not null,
  answer text not null,
  high_impact boolean not null default false,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index facts_business_idx on public.facts(business_id, status);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null,
  phone text not null,
  interest text,
  stage text not null default 'New' check (stage in ('New','Contacted','Booked','Won','Lost')),
  created_at timestamptz not null default now(),
  unique (business_id, phone)
);
create index leads_business_idx on public.leads(business_id);

create table public.callback_tasks (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  note text not null,
  status text not null default 'open' check (status in ('open','done')),
  created_at timestamptz not null default now()
);
create index tasks_business_idx on public.callback_tasks(business_id, status);

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  source text not null default 'test' check (source in ('test','phone')),
  started_at timestamptz not null default now(),
  duration_seconds int not null default 0 check (duration_seconds >= 0),
  outcome text not null default 'Answered',
  summary text
);
create index calls_business_idx on public.calls(business_id, started_at desc);

create table public.knowledge_gaps (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  question text not null,
  created_at timestamptz not null default now()
);
create index gaps_business_idx on public.knowledge_gaps(business_id);

-- Deny-by-default security: RLS on, no policies (policies arrive in Phase 3).
alter table public.profiles              enable row level security;
alter table public.businesses            enable row level security;
alter table public.memberships           enable row level security;
alter table public.receptionist_settings enable row level security;
alter table public.facts                 enable row level security;
alter table public.leads                 enable row level security;
alter table public.callback_tasks        enable row level security;
alter table public.calls                 enable row level security;
alter table public.knowledge_gaps        enable row level security;

-- Auto-create a profile row whenever someone signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
