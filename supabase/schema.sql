-- IDEAS APP backend foundation (Supabase / PostgreSQL)
-- Run ONLY in a NEW, dedicated IDEAS APP Supabase project.
-- Do NOT run this in the separate JM SHOP project.
-- This migration creates tables and row-level security policies; it does not
-- connect payments, create an admin user, or publish a live application.

begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text unique,
  display_name text,
  avatar_path text,
  role text not null default 'customer' check (role in ('customer','tipster','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tipsters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  username text not null unique,
  bio text,
  cover_path text,
  agreement_version text,
  agreement_accepted_at timestamptz,
  status text not null default 'pending' check (status in ('pending','approved','suspended','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.betslips (
  id uuid primary key default gen_random_uuid(),
  tipster_id uuid not null references public.tipsters(id),
  total_odds numeric(12,2) not null check (total_odds > 1),
  price_tzs bigint not null check (price_tzs > 0),
  betting_company text not null,
  expires_at timestamptz not null,
  status text not null default 'draft' check (status in ('draft','published','removed','expired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep private image object paths separate from public slip metadata.
create table if not exists public.slip_assets (
  slip_id uuid primary key references public.betslips(id) on delete cascade,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id),
  slip_id uuid not null references public.betslips(id),
  amount_tzs bigint not null check (amount_tzs > 0),
  status text not null default 'pending' check (status in ('pending','paid','failed','refunded')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (customer_id, slip_id)
);

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.purchases(id),
  provider text not null,
  provider_reference text unique,
  phone text not null,
  amount_tzs bigint not null check (amount_tzs > 0),
  status text not null default 'pending' check (status in ('pending','successful','failed','cancelled')),
  provider_payload jsonb,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.result_submissions (
  id uuid primary key default gen_random_uuid(),
  slip_id uuid not null references public.betslips(id),
  submitted_by uuid not null references public.profiles(id),
  submitted_result text not null check (submitted_result in ('won','lost')),
  note text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  active boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id),
  action text not null,
  target_type text,
  target_id uuid,
  reason text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

create index if not exists betslips_marketplace_idx on public.betslips(status, expires_at);
create index if not exists betslips_tipster_idx on public.betslips(tipster_id, created_at desc);
create index if not exists purchases_customer_idx on public.purchases(customer_id, created_at desc);
create index if not exists payments_purchase_idx on public.payment_transactions(purchase_id, created_at desc);
create index if not exists results_status_idx on public.result_submissions(status, created_at);

create or replace function public.is_ideas_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.current_user_is_approved_tipster()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tipsters t
    where t.user_id = auth.uid() and t.status = 'approved'
  );
$$;

create or replace function public.create_ideas_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, phone, display_name, role)
  values (new.id, new.phone, coalesce(new.raw_user_meta_data->>'display_name',''), 'customer')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_ideas_auth_user_created on auth.users;
create trigger on_ideas_auth_user_created
after insert on auth.users
for each row execute procedure public.create_ideas_profile();

alter table public.profiles enable row level security;
alter table public.tipsters enable row level security;
alter table public.betslips enable row level security;
alter table public.slip_assets enable row level security;
alter table public.purchases enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.result_submissions enable row level security;
alter table public.announcements enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.app_settings enable row level security;

-- Profiles: users can see/edit their own profile; admins can manage all.
drop policy if exists "ideas_profiles_read_own_or_admin" on public.profiles;
create policy "ideas_profiles_read_own_or_admin" on public.profiles
for select to authenticated using (id = auth.uid() or public.is_ideas_admin());
drop policy if exists "ideas_profiles_update_own_or_admin" on public.profiles;
create policy "ideas_profiles_update_own_or_admin" on public.profiles
for update to authenticated using (id = auth.uid() or public.is_ideas_admin())
with check ((id = auth.uid() and role = 'customer') or public.is_ideas_admin());

-- Tipster public profiles are visible only after approval.
drop policy if exists "ideas_tipsters_read_approved_or_owner_admin" on public.tipsters;
create policy "ideas_tipsters_read_approved_or_owner_admin" on public.tipsters
for select to anon, authenticated using (
  status = 'approved' or user_id = auth.uid() or public.is_ideas_admin()
);
drop policy if exists "ideas_tipsters_owner_insert" on public.tipsters;
create policy "ideas_tipsters_owner_insert" on public.tipsters
for insert to authenticated with check (user_id = auth.uid() and status = 'pending');
drop policy if exists "ideas_tipsters_admin_manage" on public.tipsters;
create policy "ideas_tipsters_admin_manage" on public.tipsters
for all to authenticated using (public.is_ideas_admin()) with check (public.is_ideas_admin());

-- Marketplace rows contain only safe metadata; no betslip image path is exposed.
drop policy if exists "ideas_betslips_read_published" on public.betslips;
create policy "ideas_betslips_read_published" on public.betslips
for select to anon, authenticated using (
  (status = 'published' and expires_at > now())
  or exists (select 1 from public.tipsters t where t.id = tipster_id and t.user_id = auth.uid())
  or public.is_ideas_admin()
);
drop policy if exists "ideas_betslips_approved_tipster_insert" on public.betslips;
create policy "ideas_betslips_approved_tipster_insert" on public.betslips
for insert to authenticated with check (
  public.current_user_is_approved_tipster()
  and exists (select 1 from public.tipsters t where t.id = tipster_id and t.user_id = auth.uid())
);
drop policy if exists "ideas_betslips_owner_update" on public.betslips;
create policy "ideas_betslips_owner_update" on public.betslips
for update to authenticated using (
  exists (select 1 from public.tipsters t where t.id = tipster_id and t.user_id = auth.uid())
  or public.is_ideas_admin()
) with check (
  exists (select 1 from public.tipsters t where t.id = tipster_id and t.user_id = auth.uid() and t.status = 'approved')
  or public.is_ideas_admin()
);

-- Only the buyer after a verified paid purchase, the owning tipster, or admin can access the private asset row.
drop policy if exists "ideas_slip_assets_paid_buyer_owner_admin" on public.slip_assets;
create policy "ideas_slip_assets_paid_buyer_owner_admin" on public.slip_assets
for select to authenticated using (
  public.is_ideas_admin()
  or exists (select 1 from public.tipsters t join public.betslips b on b.tipster_id=t.id
             where b.id=slip_id and t.user_id=auth.uid())
  or exists (select 1 from public.purchases p where p.slip_id=slip_assets.slip_id
             and p.customer_id=auth.uid() and p.status='paid')
);
drop policy if exists "ideas_slip_assets_owner_insert" on public.slip_assets;
create policy "ideas_slip_assets_owner_insert" on public.slip_assets
for insert to authenticated with check (
  public.is_ideas_admin()
  or exists (select 1 from public.tipsters t join public.betslips b on b.tipster_id=t.id
             where b.id=slip_id and t.user_id=auth.uid() and t.status='approved')
);

-- Purchase/payment records are written only by trusted server functions (service role).
drop policy if exists "ideas_purchases_read_buyer_admin" on public.purchases;
create policy "ideas_purchases_read_buyer_admin" on public.purchases
for select to authenticated using (customer_id=auth.uid() or public.is_ideas_admin());
drop policy if exists "ideas_payments_read_buyer_admin" on public.payment_transactions;
create policy "ideas_payments_read_buyer_admin" on public.payment_transactions
for select to authenticated using (
  public.is_ideas_admin()
  or exists (select 1 from public.purchases p where p.id=purchase_id and p.customer_id=auth.uid())
);

drop policy if exists "ideas_results_read_owner_admin" on public.result_submissions;
create policy "ideas_results_read_owner_admin" on public.result_submissions
for select to authenticated using (
  submitted_by=auth.uid() or public.is_ideas_admin()
  or exists (select 1 from public.tipsters t join public.betslips b on b.tipster_id=t.id
             where b.id=slip_id and t.user_id=auth.uid())
);
drop policy if exists "ideas_results_tipster_submit" on public.result_submissions;
create policy "ideas_results_tipster_submit" on public.result_submissions
for insert to authenticated with check (
  submitted_by=auth.uid()
  and exists (select 1 from public.tipsters t join public.betslips b on b.tipster_id=t.id
              where b.id=slip_id and t.user_id=auth.uid())
);
drop policy if exists "ideas_results_admin_review" on public.result_submissions;
create policy "ideas_results_admin_review" on public.result_submissions
for update to authenticated using (public.is_ideas_admin()) with check (public.is_ideas_admin());

drop policy if exists "ideas_announcements_read_active" on public.announcements;
create policy "ideas_announcements_read_active" on public.announcements
for select to anon, authenticated using (active or public.is_ideas_admin());
drop policy if exists "ideas_announcements_admin_manage" on public.announcements;
create policy "ideas_announcements_admin_manage" on public.announcements
for all to authenticated using (public.is_ideas_admin()) with check (public.is_ideas_admin());

drop policy if exists "ideas_audit_admin_read" on public.admin_audit_logs;
create policy "ideas_audit_admin_read" on public.admin_audit_logs
for select to authenticated using (public.is_ideas_admin());
drop policy if exists "ideas_settings_read_authenticated" on public.app_settings;
create policy "ideas_settings_read_authenticated" on public.app_settings
for select to authenticated using (true);
drop policy if exists "ideas_settings_admin_manage" on public.app_settings;
create policy "ideas_settings_admin_manage" on public.app_settings
for all to authenticated using (public.is_ideas_admin()) with check (public.is_ideas_admin());

-- Prevent public/ordinary-client access to privileged write paths.
revoke insert, update, delete on public.purchases from anon, authenticated;
revoke insert, update, delete on public.payment_transactions from anon, authenticated;
revoke insert, update, delete on public.admin_audit_logs from anon, authenticated;
revoke insert, update, delete on public.app_settings from anon, authenticated;
grant select on public.tipsters, public.betslips, public.announcements to anon, authenticated;
grant select on public.profiles, public.slip_assets, public.purchases, public.payment_transactions,
  public.result_submissions, public.app_settings, public.admin_audit_logs to authenticated;
grant insert, update on public.betslips to authenticated;
grant insert on public.slip_assets to authenticated;
grant insert on public.result_submissions to authenticated;
grant update on public.result_submissions to authenticated;
grant insert on public.tipsters to authenticated;
grant update on public.tipsters to authenticated;
grant update (display_name, avatar_path, phone, updated_at) on public.profiles to authenticated;

commit;

-- After the first real admin account is created in Supabase Auth, promote it
-- manually from the SQL editor using that user's actual auth UUID:
-- update public.profiles set role = 'admin' where id = 'REPLACE-WITH-AUTH-USER-UUID';
--
-- IMPORTANT NEXT SETUP ITEMS (not covered by this SQL):
-- 1. Create a PRIVATE Storage bucket named "ideas-betslips".
-- 2. Add Storage policies so original image files can only be read by paid buyers,
--    the owning tipster and admin. Do not make the bucket public.
-- 3. Use Edge Functions / server-side code for order creation and payment provider
--    callbacks. Never let the browser set a purchase to "paid".
-- 4. Keep provider secrets and the Supabase service-role key out of GitHub and HTML/JS.
-- 5. Choose the authentication method before enabling real sign-up. Phone/password
--    without SMS needs a carefully designed server-side identity flow; do not fake
--    phone verification or store passwords in this app.
