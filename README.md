# Sport 3 · Reserva de canchas

Landing de reservas para Sport 3 (fútbol 6 y wally, Miraflores, Tarija). El cliente elige deporte, fecha, hora y cancha, deja su nombre y celular, elige cómo pagar (QR o en la cancha) y la reserva se envía al WhatsApp del dueño con el mensaje ya escrito.

Proyecto de la materia Marketing Móvil (MKD-314), UCB Tarija.
Equipo: Marco Velasco, Favian Paniagua, Regina Rodriguez, Luz Angel Cari.

## Estructura

```
index.html          Página (marcado)
css/styles.css      Estilos
js/config.js        Datos del negocio y claves públicas de Supabase  ← lo único que se edita
js/app.js           Lógica: horarios, canchas, reserva, WhatsApp, chat de ayuda, pantalla del dueño
img/                Logo, fondo y favicon
supabase/schema.sql Tablas y permisos de la base de datos
```

Sin frameworks ni compilación: HTML, CSS y JavaScript. Supabase se carga desde CDN (`@supabase/supabase-js@2.118.0`).

## Base de datos (Supabase)

| Tabla | Columnas | Uso |
|---|---|---|
| `ocupados` | fecha, deporte, hora, canchas | Cuántas canchas están ocupadas en cada turno |
| `config` | clave, valor | WhatsApp del dueño (`telefono`) |

Permisos (Row Level Security): cualquiera puede **leer**; solo el dueño con sesión iniciada puede **escribir**. La página se actualiza sola cuando el dueño marca un turno (Realtime).

| `reservas` | fecha, deporte, desde, hasta, cancha, nombre, celular, pago, total, estado, pagado | Reservas hechas desde la página |

Las reservas se guardan con la función `reservar()`, que revisa en el servidor que la cancha siga libre. Los clientes solo ven qué canchas están tomadas (función `ocupacion()`), nunca nombres ni celulares. Una reserva **pendiente** aparta la cancha 2 horas; si el dueño no la confirma, se libera sola.

**Confirmar desde WhatsApp:** cada reserva tiene un código (ej. `K7P2QX`). El mensaje que recibe el dueño termina con un enlace `…/#r=K7P2QX`; al tocarlo se abre esa reserva con botones grandes (Confirmar, Pagó, Cancelar y Avisar al cliente). Pide la sesión del dueño, que se inicia una sola vez en su celular.

Puesta en marcha:
1. Supabase → SQL Editor → pegar `supabase/schema.sql` → Run. Luego lo mismo con `supabase/reservas.sql` y `supabase/reservas-v2.sql`, en ese orden.
2. Authentication → Users → Add user (correo y contraseña del dueño, *Auto Confirm*). Desactivar *Allow new users to sign up*.
3. Copiar la Project URL y la clave **publishable** en `js/config.js`.

> En `js/config.js` va solo la clave publishable (`sb_publishable_…`). La clave secret (`sb_secret_…`) nunca se sube al repositorio.

Si `supabaseUrl` está vacío, la página funciona en **modo demostración** con horarios de ejemplo.

## Pantalla del dueño

Abrir `https://<dominio>/#dueno` y entrar con el correo y la contraseña del dueño.

- **Reservas de la página:** cada reserva con su estado (Pendiente, Confirmada, Vencida, Cancelada) y botones Confirmar, Pagó, Cancelar y WhatsApp para avisar al cliente. Un punto rojo en el día indica reservas pendientes.
- **Por teléfono o en persona:** con + y − se marca cuántas canchas quedan ocupadas en cada turno.
- Abajo se cambia el número de WhatsApp donde llegan las reservas.

## Probar en local

Abrir `index.html` en el navegador, o servir la carpeta: `npx serve .`

## Publicar

Vercel → Add New → Project → importar este repositorio (sin configuración extra). Cada cambio en `main` se publica solo.

## Pendiente de confirmar con el dueño

- Ubicación real de cada cancha (`canchas` en `js/config.js`)
- Imagen del QR de cobro (`img/qr.png` y `qr: 'img/qr.png'`)
- Horario, precios y reglas (cancelar hasta las 12:00; la cancha se libera a los 15 min sin pago ni llegada)

## Bot de WhatsApp (API de Meta)

`supabase/functions/whatsapp/index.ts` es una Edge Function de Supabase que atiende el número de WhatsApp del bot:

1. El cliente manda desde la página su reserva al número del bot (el mensaje trae el código `#r=XXXXXX`).
2. El bot le responde «Recibimos tu reserva…» y le escribe al dueño con botones **Confirmar · Ya pagó · Cancelar**.
3. El dueño toca un botón; el bot actualiza la reserva y le avisa al cliente.
4. Si el cliente manda una foto o PDF (comprobante del QR), se le reenvía al dueño con el botón **Ya pagó**.
5. Si el dueño escribe cualquier cosa («hola»), el bot le manda las reservas pendientes.

Puesta en marcha: correr `supabase/bot.sql`; crear la función `whatsapp` en Supabase (Edge Functions, sin verificación JWT) con los secrets `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `VERIFY_TOKEN`, `DUENO_WA`, `PAGINA_URL` (y opcional `APP_SECRET`); en Meta → WhatsApp → Configuración, poner como webhook `https://<proyecto>.supabase.co/functions/v1/whatsapp` y suscribir el campo `messages`. Finalmente, en `#dueno` (o en la tabla `config`) poner como teléfono el número del bot.

Límite de Meta: el bot puede escribirle al dueño con botones solo si el dueño le escribió en las últimas 24 horas; si no, Meta exige una plantilla aprobada. Para la prueba, el dueño le manda «hola» al bot una vez al día.
