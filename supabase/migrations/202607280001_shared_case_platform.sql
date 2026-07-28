begin;

create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('tracer', 'internal', 'admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.account_status as enum ('pending', 'approved', 'suspended');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role public.app_role not null default 'tracer',
  account_status public.account_status not null default 'pending',
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  case_reference text not null check (length(btrim(case_reference)) > 0),
  owner_id uuid not null references public.profiles(user_id),
  deceased_name text not null default '',
  case_data jsonb not null default '{}'::jsonb check (not (case_data ? 'presenter')),
  readiness text not null default 'Not ready',
  progress_percent integer not null default 0 check (progress_percent between 0 and 100),
  progress_have integer not null default 0 check (progress_have >= 0),
  progress_applicable integer not null default 0 check (progress_applicable >= 0),
  progress_actionable integer not null default 0 check (progress_actionable >= 0),
  progress_missing integer not null default 0 check (progress_missing >= 0),
  progress_unclear integer not null default 0 check (progress_unclear >= 0),
  version bigint not null default 1,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cases_case_reference_unique
  on public.cases (lower(btrim(case_reference)));
create index if not exists cases_owner_id_idx on public.cases(owner_id);
create index if not exists cases_updated_at_idx on public.cases(updated_at desc);
create index if not exists cases_archived_at_idx on public.cases(archived_at);

create table if not exists public.case_internal_data (
  case_id uuid primary key references public.cases(id) on delete cascade,
  presenter jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles(user_id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.case_activity (
  id bigint generated always as identity primary key,
  case_id uuid not null references public.cases(id) on delete cascade,
  actor_id uuid references public.profiles(user_id) on delete set null,
  action text not null check (action in ('created', 'updated', 'archived', 'restored', 'ownership_changed', 'internal_notes_updated')),
  version bigint not null,
  progress_percent integer not null,
  progress_actionable integer not null,
  readiness text not null,
  created_at timestamptz not null default now()
);

create index if not exists case_activity_case_id_idx
  on public.case_activity(case_id, created_at desc);

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where user_id = (select auth.uid());
$$;

create or replace function public.current_account_status()
returns public.account_status
language sql
stable
security definer
set search_path = ''
as $$
  select account_status from public.profiles where user_id = (select auth.uid());
$$;

create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_account_status() = 'approved', false);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_approved() and public.current_app_role() = 'admin';
$$;

create or replace function public.is_internal_reader()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_approved() and public.current_app_role() in ('internal', 'admin');
$$;

create or replace function public.save_case_snapshot(
  p_id uuid,
  p_expected_version bigint,
  p_owner_id uuid,
  p_case_reference text,
  p_deceased_name text,
  p_case_data jsonb,
  p_readiness text,
  p_progress_percent integer,
  p_progress_have integer,
  p_progress_applicable integer,
  p_progress_actionable integer,
  p_progress_missing integer,
  p_progress_unclear integer,
  p_presenter jsonb default null
)
returns public.cases
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_case public.cases;
  effective_owner uuid;
begin
  if not public.is_approved() or public.current_app_role() not in ('tracer', 'admin') then
    raise exception 'This account cannot save cases' using errcode = '42501';
  end if;

  effective_owner := case
    when public.current_app_role() = 'admin' then coalesce(p_owner_id, auth.uid())
    else auth.uid()
  end;

  if p_id is null then
    insert into public.cases (
      case_reference,
      owner_id,
      deceased_name,
      case_data,
      readiness,
      progress_percent,
      progress_have,
      progress_applicable,
      progress_actionable,
      progress_missing,
      progress_unclear
    ) values (
      btrim(p_case_reference),
      effective_owner,
      coalesce(p_deceased_name, ''),
      coalesce(p_case_data, '{}'::jsonb),
      coalesce(p_readiness, 'Not ready'),
      coalesce(p_progress_percent, 0),
      coalesce(p_progress_have, 0),
      coalesce(p_progress_applicable, 0),
      coalesce(p_progress_actionable, 0),
      coalesce(p_progress_missing, 0),
      coalesce(p_progress_unclear, 0)
    )
    returning * into saved_case;
  else
    update public.cases
    set case_reference = btrim(p_case_reference),
        deceased_name = coalesce(p_deceased_name, ''),
        case_data = coalesce(p_case_data, '{}'::jsonb),
        readiness = coalesce(p_readiness, 'Not ready'),
        progress_percent = coalesce(p_progress_percent, 0),
        progress_have = coalesce(p_progress_have, 0),
        progress_applicable = coalesce(p_progress_applicable, 0),
        progress_actionable = coalesce(p_progress_actionable, 0),
        progress_missing = coalesce(p_progress_missing, 0),
        progress_unclear = coalesce(p_progress_unclear, 0)
    where id = p_id
      and version = p_expected_version
    returning * into saved_case;

    if saved_case.id is null then
      raise exception 'Case version conflict' using errcode = '40001';
    end if;
  end if;

  if public.current_app_role() = 'admin' and p_presenter is not null then
    insert into public.case_internal_data (case_id, presenter, updated_by)
    values (saved_case.id, p_presenter, auth.uid())
    on conflict (case_id) do update
      set presenter = excluded.presenter,
          updated_by = excluded.updated_by;
  end if;

  return saved_case;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (user_id) do update
    set email = excluded.email,
        display_name = case
          when public.profiles.display_name = '' then excluded.display_name
          else public.profiles.display_name
        end,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.touch_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute procedure public.touch_profile();

create or replace function public.touch_case()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  new.version = old.version + 1;
  return new;
end;
$$;

drop trigger if exists cases_touch_updated_at on public.cases;
create trigger cases_touch_updated_at
  before update on public.cases
  for each row execute procedure public.touch_case();

create or replace function public.record_case_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  activity_action text;
begin
  if tg_op = 'INSERT' then
    activity_action := 'created';
  elsif old.archived_at is null and new.archived_at is not null then
    activity_action := 'archived';
  elsif old.archived_at is not null and new.archived_at is null then
    activity_action := 'restored';
  elsif old.owner_id is distinct from new.owner_id then
    activity_action := 'ownership_changed';
  else
    activity_action := 'updated';
  end if;

  insert into public.case_activity (
    case_id,
    actor_id,
    action,
    version,
    progress_percent,
    progress_actionable,
    readiness
  ) values (
    new.id,
    auth.uid(),
    activity_action,
    new.version,
    new.progress_percent,
    new.progress_actionable,
    new.readiness
  );
  return new;
end;
$$;

drop trigger if exists cases_record_activity on public.cases;
create trigger cases_record_activity
  after insert or update on public.cases
  for each row execute procedure public.record_case_activity();

create or replace function public.touch_internal_case_data()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_case public.cases;
begin
  new.updated_at = now();
  select * into current_case from public.cases where id = new.case_id;
  insert into public.case_activity (
    case_id,
    actor_id,
    action,
    version,
    progress_percent,
    progress_actionable,
    readiness
  ) values (
    new.case_id,
    auth.uid(),
    'internal_notes_updated',
    current_case.version,
    current_case.progress_percent,
    current_case.progress_actionable,
    current_case.readiness
  );
  return new;
end;
$$;

drop trigger if exists internal_data_record_activity on public.case_internal_data;
create trigger internal_data_record_activity
  before insert or update on public.case_internal_data
  for each row execute procedure public.touch_internal_case_data();

alter table public.profiles enable row level security;
alter table public.cases enable row level security;
alter table public.case_internal_data enable row level security;
alter table public.case_activity enable row level security;

drop policy if exists "profiles_select_allowed" on public.profiles;
create policy "profiles_select_allowed"
  on public.profiles for select to authenticated
  using (
    user_id = (select auth.uid())
    or public.is_admin()
    or (
      public.is_approved()
      and public.current_app_role() = 'internal'
      and exists (
        select 1 from public.cases
        where cases.owner_id = profiles.user_id
      )
    )
  );

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update"
  on public.profiles for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "cases_select_visible" on public.cases;
create policy "cases_select_visible"
  on public.cases for select to authenticated
  using (
    public.is_approved()
    and (
      owner_id = (select auth.uid())
      or public.current_app_role() in ('internal', 'admin')
    )
  );

drop policy if exists "cases_insert_owned" on public.cases;
create policy "cases_insert_owned"
  on public.cases for insert to authenticated
  with check (
    public.is_approved()
    and public.current_app_role() in ('tracer', 'admin')
    and (
      owner_id = (select auth.uid())
      or public.current_app_role() = 'admin'
    )
  );

drop policy if exists "cases_update_owned_or_admin" on public.cases;
create policy "cases_update_owned_or_admin"
  on public.cases for update to authenticated
  using (
    public.is_approved()
    and (
      (public.current_app_role() = 'tracer' and owner_id = (select auth.uid()))
      or public.current_app_role() = 'admin'
    )
  )
  with check (
    public.is_approved()
    and (
      (public.current_app_role() = 'tracer' and owner_id = (select auth.uid()))
      or public.current_app_role() = 'admin'
    )
  );

drop policy if exists "internal_data_select_internal" on public.case_internal_data;
create policy "internal_data_select_internal"
  on public.case_internal_data for select to authenticated
  using (public.is_internal_reader());

drop policy if exists "internal_data_admin_insert" on public.case_internal_data;
create policy "internal_data_admin_insert"
  on public.case_internal_data for insert to authenticated
  with check (public.is_admin());

drop policy if exists "internal_data_admin_update" on public.case_internal_data;
create policy "internal_data_admin_update"
  on public.case_internal_data for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "activity_select_visible" on public.case_activity;
create policy "activity_select_visible"
  on public.case_activity for select to authenticated
  using (
    exists (
      select 1 from public.cases
      where cases.id = case_activity.case_id
    )
  );

grant usage on schema public to authenticated;
grant select on public.profiles, public.cases, public.case_internal_data, public.case_activity to authenticated;
grant insert, update on public.cases to authenticated;
grant insert, update on public.case_internal_data to authenticated;
grant update on public.profiles to authenticated;
grant usage, select on sequence public.case_activity_id_seq to authenticated;
revoke all on function public.save_case_snapshot(
  uuid, bigint, uuid, text, text, jsonb, text,
  integer, integer, integer, integer, integer, integer, jsonb
) from public, anon;
grant execute on function public.save_case_snapshot(
  uuid, bigint, uuid, text, text, jsonb, text,
  integer, integer, integer, integer, integer, integer, jsonb
) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cases'
  ) then
    alter publication supabase_realtime add table public.cases;
  end if;
end $$;

commit;
