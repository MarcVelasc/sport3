-- Sport 3 · Bot de WhatsApp (correr una vez, después de reservas-v2.sql)
--  · wa_cliente: número de WhatsApp desde el que el cliente mandó su reserva (para avisarle al confirmar)
--  · wa_procesados: evita procesar dos veces el mismo mensaje cuando Meta reintenta

alter table public.reservas add column if not exists wa_cliente text;

create table if not exists public.wa_procesados (
  id       text primary key,
  recibido timestamptz not null default now()
);
-- Solo el bot (service role) la usa; sin políticas = nadie más puede leerla ni escribirla
alter table public.wa_procesados enable row level security;
