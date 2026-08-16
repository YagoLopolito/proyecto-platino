create table public.psn_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  online_id text not null,
  account_id text not null,
  npsso_encrypted text not null,
  token_status text not null default 'valid' check (token_status in ('valid', 'expired', 'invalid')),
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

alter table public.psn_accounts enable row level security;

create policy "psn_accounts_select_own"
  on public.psn_accounts for select
  using (auth.uid() = user_id);

create policy "psn_accounts_insert_own"
  on public.psn_accounts for insert
  with check (auth.uid() = user_id);

create policy "psn_accounts_update_own"
  on public.psn_accounts for update
  using (auth.uid() = user_id);

create policy "psn_accounts_delete_own"
  on public.psn_accounts for delete
  using (auth.uid() = user_id);
