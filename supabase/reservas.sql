-- Sport 3 · Reservas hechas desde la página
-- Pegar todo en Supabase → SQL Editor → New query → Run (una sola vez, después de schema.sql)
--
-- Cómo funciona:
--  · El cliente toca «Confirmar reserva» → se guarda como PENDIENTE y la cancha se bloquea para los demás.
--  · El dueño la ve en la pantalla #dueno y toca Confirmar, Pagó o Cancelar.
--  · Si una pendiente no se confirma en 30 minutos, la cancha vuelve a quedar libre sola.
--  · Los clientes nunca ven nombres ni celulares de otros: solo qué canchas están tomadas.

create table if not exists public.reservas (
  id        uuid primary key default gen_random_uuid(),
  creada    timestamptz not null default now(),
  fecha     date not null,
  deporte   text not null check (deporte in ('futbol','wally')),
  desde     int  not null check (desde between 0 and 23),
  hasta     int  not null check (hasta between 1 and 24 and hasta > desde),
  cancha    int  not null check (cancha between 0 and 2),
  nombre    text not null,
  celular   text not null,
  pago      text not null check (pago in ('qr','cancha')),
  total     int  not null default 0,
  cumple    boolean not null default false,
  estado    text not null default 'pendiente' check (estado in ('pendiente','confirmada','cancelada')),
  pagado    boolean not null default false
);
create index if not exists reservas_fecha on public.reservas (fecha, deporte);

-- Solo el dueño (con sesión) lee y cambia las reservas. Los clientes no tienen acceso directo.
alter table public.reservas enable row level security;
drop policy if exists "dueno ve reservas" on public.reservas;
create policy "dueno ve reservas" on public.reservas for all to authenticated using (true) with check (true);

-- Reserva activa = confirmada, o pendiente con menos de 30 minutos
create or replace function public.reserva_activa(r public.reservas) returns boolean
language sql stable as $$
  select r.estado = 'confirmada' or (r.estado = 'pendiente' and r.creada > now() - interval '30 minutes')
$$;

-- Lo que ven los clientes: qué cancha está tomada en qué horario (sin datos personales)
create or replace function public.ocupacion(p_desde date, p_hasta date)
returns table (fecha date, deporte text, desde int, hasta int, cancha int)
language sql stable security definer set search_path = public as $$
  select r.fecha, r.deporte, r.desde, r.hasta, r.cancha
  from public.reservas r
  where r.fecha between p_desde and p_hasta and public.reserva_activa(r)
$$;

-- Guardar una reserva desde la página. Revisa en el servidor que la cancha siga libre
-- (contando reservas activas y las horas marcadas a mano por el dueño) y responde:
-- 'ok' · 'ocupada' · 'invalida'
create or replace function public.reservar(
  p_fecha date, p_deporte text, p_desde int, p_hasta int, p_cancha int,
  p_nombre text, p_celular text, p_pago text, p_total int, p_cumple boolean default false
) returns text
language plpgsql security definer set search_path = public as $$
declare
  hoy date := (now() at time zone 'America/La_Paz')::date;
  total_canchas int := 3;
  h int; i int; manual int; libres int[]; tomadas int[];
begin
  if coalesce(p_deporte,'') not in ('futbol','wally') or p_desde < 15 or p_hasta > 22 or p_hasta <= p_desde
     or p_cancha < 0 or p_cancha >= total_canchas
     or p_fecha < hoy or p_fecha > hoy + 40
     or length(trim(coalesce(p_nombre,''))) not between 2 and 60
     or coalesce(p_celular,'') !~ '^[67][0-9]{7}$' or coalesce(p_pago,'') not in ('qr','cancha')
     or p_fecha is null or p_desde is null or p_hasta is null or p_cancha is null then
    return 'invalida';
  end if;

  -- Un cliente a la vez por día y deporte: evita que dos tomen la misma cancha al mismo tiempo
  perform pg_advisory_xact_lock(hashtext(p_fecha::text || p_deporte));

  -- Freno a reservas falsas: máximo 3 pendientes activas por celular
  if (select count(*) from public.reservas r
      where r.celular = p_celular and r.estado = 'pendiente' and public.reserva_activa(r)) >= 3 then
    return 'invalida';
  end if;

  for h in p_desde .. p_hasta - 1 loop
    select coalesce(array_agg(r.cancha), '{}') into tomadas
    from public.reservas r
    where r.fecha = p_fecha and r.deporte = p_deporte and r.desde <= h and r.hasta > h and public.reserva_activa(r);
    if p_cancha = any(tomadas) then return 'ocupada'; end if;

    -- Las marcadas a mano ocupan las primeras canchas que no tienen reserva (igual que en la página)
    select coalesce(o.canchas, 0) into manual from public.ocupados o
    where o.fecha = p_fecha and o.deporte = p_deporte and o.hora = h;
    manual := coalesce(manual, 0);
    libres := '{}';
    for i in 0 .. total_canchas - 1 loop
      if not (i = any(tomadas)) then libres := libres || i; end if;
    end loop;
    if manual > 0 and p_cancha = any(libres[1:manual]) then return 'ocupada'; end if;
  end loop;

  insert into public.reservas (fecha, deporte, desde, hasta, cancha, nombre, celular, pago, total, cumple)
  values (p_fecha, p_deporte, p_desde, p_hasta, p_cancha, trim(p_nombre), p_celular, p_pago, coalesce(p_total,0), coalesce(p_cumple,false));
  return 'ok';
end $$;

revoke all on function public.reservar(date,text,int,int,int,text,text,text,int,boolean) from public;
revoke all on function public.ocupacion(date,date) from public;
grant execute on function public.reservar(date,text,int,int,int,text,text,text,int,boolean) to anon, authenticated;
grant execute on function public.ocupacion(date,date) to anon, authenticated;

-- El dueño ve llegar las reservas nuevas al momento
do $$ begin
  alter publication supabase_realtime add table public.reservas;
exception when duplicate_object then null; end $$;
