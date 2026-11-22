-- Kör detta en gång i Supabase: SQL Editor -> New query -> Run.
create sequence if not exists public.rows_seq;

create table if not exists public.rows (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  kind text not null,
  data jsonb,
  updated_at bigint not null,
  deleted boolean not null default false,
  seq bigint not null default nextval('public.rows_seq'),
  primary key (user_id, id)
);

create index if not exists rows_user_seq on public.rows (user_id, seq);

-- Senaste ändringen vinner; äldre skrivningar ignoreras. Varje ändring får
-- ett nytt löpnummer så att andra enheter kan hämta "allt sedan sist".
create or replace function public.rows_before_write() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at <= old.updated_at then
    return null;
  end if;
  new.seq := nextval('public.rows_seq');
  return new;
end $$;

drop trigger if exists rows_before_write on public.rows;
create trigger rows_before_write before insert or update on public.rows
  for each row execute function public.rows_before_write();

alter table public.rows enable row level security;

drop policy if exists "egna rader" on public.rows;
create policy "egna rader" on public.rows for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
