-- Sport 3 · Confirmar desde WhatsApp (correr una vez, después de reservas.sql)
--  · Cada reserva recibe un código corto (ej. K7P2QX) que va en el mensaje de WhatsApp como enlace.
--  · El dueño toca el enlace y confirma con un botón (pide su sesión; el cliente no puede confirmarse solo).
--  · Una reserva pendiente aparta la cancha 2 horas (antes 30 minutos).

alter table public.reservas add column if not exists codigo text;

create or replace function public.nuevo_codigo() returns text
language plpgsql volatile as $$
declare
  letras text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- sin 0/O ni 1/I para que no se confundan
  c text; i int;
begin
  loop
    c := '';
    for i in 1..6 loop c := c || substr(letras, 1 + floor(random() * length(letras))::int, 1); end loop;
    exit when not exists (select 1 from public.reservas where codigo = c);
  end loop;
  return c;
end $$;

update public.reservas set codigo = public.nuevo_codigo() where codigo is null;
alter table public.reservas alter column codigo set default public.nuevo_codigo();
alter table public.reservas alter column codigo set not null;
create unique index if not exists reservas_codigo on public.reservas (codigo);

-- Pendiente = aparta la cancha 2 horas
create or replace function public.reserva_activa(r public.reservas) returns boolean
language sql stable as $$
  select r.estado = 'confirmada' or (r.estado = 'pendiente' and r.creada > now() - interval '2 hours')
$$;

-- reservar() ahora responde 'ok:CODIGO' cuando guarda
create or replace function public.reservar(
  p_fecha date, p_deporte text, p_desde int, p_hasta int, p_cancha int,
  p_nombre text, p_celular text, p_pago text, p_total int, p_cumple boolean default false
) returns text
language plpgsql security definer set search_path = public as $$
declare
  hoy date := (now() at time zone 'America/La_Paz')::date;
  total_canchas int := 3;
  h int; i int; manual int; libres int[]; tomadas int[]; cod text;
begin
  if coalesce(p_deporte,'') not in ('futbol','wally') or p_desde < 15 or p_hasta > 22 or p_hasta <= p_desde
     or p_cancha < 0 or p_cancha >= total_canchas
     or p_fecha < hoy or p_fecha > hoy + 40
     or length(trim(coalesce(p_nombre,''))) not between 2 and 60
     or coalesce(p_celular,'') !~ '^[67][0-9]{7}$' or coalesce(p_pago,'') not in ('qr','cancha')
     or p_fecha is null or p_desde is null or p_hasta is null or p_cancha is null then
    return 'invalida';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_fecha::text || p_deporte));

  if (select count(*) from public.reservas r
      where r.celular = p_celular and r.estado = 'pendiente' and public.reserva_activa(r)) >= 3 then
    return 'invalida';
  end if;

  for h in p_desde .. p_hasta - 1 loop
    select coalesce(array_agg(r.cancha), '{}') into tomadas
    from public.reservas r
    where r.fecha = p_fecha and r.deporte = p_deporte and r.desde <= h and r.hasta > h and public.reserva_activa(r);
    if p_cancha = any(tomadas) then return 'ocupada'; end if;

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
  values (p_fecha, p_deporte, p_desde, p_hasta, p_cancha, trim(p_nombre), p_celular, p_pago, coalesce(p_total,0), coalesce(p_cumple,false))
  returning codigo into cod;
  return 'ok:' || cod;
end $$;

revoke all on function public.nuevo_codigo() from public;
revoke all on function public.reservar(date,text,int,int,int,text,text,text,int,boolean) from public;
grant execute on function public.reservar(date,text,int,int,int,text,text,text,int,boolean) to anon, authenticated;
