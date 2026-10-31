-- MovieZone: datos de usuario sincronizados (perfiles, favoritos, historial, progreso).
-- Ejecútalo en Supabase > SQL Editor.

create table if not exists public.user_data (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint user_data_max_size check (pg_column_size(data) < 1048576) -- < 1 MB
);

-- La hora la pone el servidor (evita relojes desfasados en los dispositivos).
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists user_data_touch on public.user_data;
create trigger user_data_touch
  before insert or update on public.user_data
  for each row execute function public.touch_updated_at();

-- Seguridad: cada persona solo accede a SU fila.
alter table public.user_data enable row level security;

drop policy if exists "user_data_select_own" on public.user_data;
drop policy if exists "user_data_insert_own" on public.user_data;
drop policy if exists "user_data_update_own" on public.user_data;
drop policy if exists "user_data_delete_own" on public.user_data;

create policy "user_data_select_own" on public.user_data
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "user_data_insert_own" on public.user_data
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "user_data_update_own" on public.user_data
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "user_data_delete_own" on public.user_data
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Sin acceso para usuarios anónimos.
revoke all on public.user_data from anon;
grant select, insert, update, delete on public.user_data to authenticated;

-- Eliminar la propia cuenta desde la app (borra auth.users y, en cascada, user_data).
-- Se ejecuta con permisos del dueño de la función, pero SOLO puede borrar al usuario que la llama.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = (select auth.uid());
end $$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
