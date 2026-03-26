-- Prompt Chain Tool schema
-- Includes required non-null audit fields on every table.

create table if not exists public.humor_flavors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text null,
  created_by_user_id uuid not null references public.profiles(id),
  modified_by_user_id uuid not null references public.profiles(id),
  created_datetime_utc timestamptz not null default now(),
  modified_datetime_utc timestamptz not null default now()
);

create table if not exists public.humor_flavor_steps (
  id uuid primary key default gen_random_uuid(),
  humor_flavor_id uuid not null references public.humor_flavors(id) on delete cascade,
  step_order integer not null check (step_order > 0),
  instruction text not null,
  created_by_user_id uuid not null references public.profiles(id),
  modified_by_user_id uuid not null references public.profiles(id),
  created_datetime_utc timestamptz not null default now(),
  modified_datetime_utc timestamptz not null default now(),
  unique (humor_flavor_id, step_order)
);

-- Automatically refresh modified_datetime_utc on updates.
create or replace function public.set_modified_datetime_utc()
returns trigger
language plpgsql
as $$
begin
  new.modified_datetime_utc = now();
  return new;
end;
$$;

drop trigger if exists trg_set_modified_datetime_flavors on public.humor_flavors;
create trigger trg_set_modified_datetime_flavors
before update on public.humor_flavors
for each row
execute function public.set_modified_datetime_utc();

drop trigger if exists trg_set_modified_datetime_steps on public.humor_flavor_steps;
create trigger trg_set_modified_datetime_steps
before update on public.humor_flavor_steps
for each row
execute function public.set_modified_datetime_utc();

-- Suggested RLS policy: allow only matrix/super admins.
-- Adapt these to your project-wide policy style as needed.
alter table public.humor_flavors enable row level security;
alter table public.humor_flavor_steps enable row level security;

create policy if not exists humor_flavors_admin_only on public.humor_flavors
for all
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (p.is_superadmin = true or p.is_matrix_admin = true)
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (p.is_superadmin = true or p.is_matrix_admin = true)
  )
);

create policy if not exists humor_flavor_steps_admin_only on public.humor_flavor_steps
for all
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (p.is_superadmin = true or p.is_matrix_admin = true)
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and (p.is_superadmin = true or p.is_matrix_admin = true)
  )
);
