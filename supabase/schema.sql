-- Sport 3 · base de datos de la landing (Supabase)
-- Pegar todo en Supabase → SQL Editor → New query → Run

-- 1) Horas ocupadas: cuántas canchas están tomadas por fecha, deporte y hora
create table if not exists public.ocupados (
  fecha    date    not null,
  deporte  text    not null check (deporte in ('futbol','wally')),
  hora     int     not null check (hora between 0 and 23),
  canchas  int     not null default 0 check (canchas >= 0),
  actualizado timestamptz not null default now(),
  primary key (fecha, deporte, hora)
);

-- 2) Configuración del negocio (WhatsApp del dueño)
create table if not exists public.config (
  clave text primary key,
  valor text not null
);
insert into public.config (clave, valor) values ('telefono', '57905773')
on conflict (clave) do nothing;

-- 3) Seguridad: cualquiera puede LEER; solo el dueño (usuario con sesión) puede ESCRIBIR
alter table public.ocupados enable row level security;
alter table public.config   enable row level security;

create policy "leer ocupados"      on public.ocupados for select to anon, authenticated using (true);
create policy "dueno escribe ocup" on public.ocupados for all    to authenticated using (true) with check (true);
create policy "leer config"        on public.config   for select to anon, authenticated using (true);
create policy "dueno escribe conf" on public.config   for all    to authenticated using (true) with check (true);

-- 4) Tiempo real: la página se actualiza sola cuando el dueño marca una hora
alter publication supabase_realtime add table public.ocupados;
alter publication supabase_realtime add table public.config;
