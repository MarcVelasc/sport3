// Sport 3 · Bot de WhatsApp (Supabase Edge Function «whatsapp»)
//
// 1. El cliente manda desde la página su reserva al número del bot (el mensaje trae el código, ej. #r=K7P2QX).
// 2. El bot le responde: «Recibimos tu reserva K7P2QX…».
// 3. El bot le escribe al WhatsApp del dueño con botones [Confirmar] [Ya pagó] [Cancelar].
// 4. El dueño toca un botón; el bot actualiza la reserva en la base y le avisa al cliente.
// 5. Si el dueño escribe cualquier cosa (ej. «hola»), el bot le manda las reservas pendientes.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   WHATSAPP_TOKEN     token de acceso de Meta
//   WHATSAPP_PHONE_ID  «Phone number ID» del número del bot
//   VERIFY_TOKEN       una palabra que inventas; la misma va en Meta → Webhook
//   DUENO_WA           WhatsApp del dueño con código de país, solo números (ej. 59157905773)
//   PAGINA_URL         enlace de la página (ej. https://sport3-4mkb.vercel.app)
//   APP_SECRET         (opcional) «App secret» de Meta, para comprobar que los avisos vienen de Meta
// SUPABASE_URL y la clave del servidor (SUPABASE_SECRET_KEYS o SUPABASE_SERVICE_ROLE_KEY) los pone Supabase solo.

import { createClient } from "npm:@supabase/supabase-js@2.118.0";

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const TOKEN = env("WHATSAPP_TOKEN");
const PHONE_ID = env("WHATSAPP_PHONE_ID");
const VERIFY = env("VERIFY_TOKEN");
const DUENO = env("DUENO_WA").replace(/\D/g, "");
const PAGINA = env("PAGINA_URL", "https://sport3-4mkb.vercel.app");
const APP_SECRET = env("APP_SECRET");
const GRAPH = `https://graph.facebook.com/${env("GRAPH_VERSION", "v23.0")}`;
const PEND_HORAS = 2; // igual que reserva_activa() en supabase/reservas-v2.sql

// Clave del servidor (la pone Supabase sola): primero las claves nuevas «secret», si no la legacy service_role
function claveServidor() {
  try {
    const keys = JSON.parse(env("SUPABASE_SECRET_KEYS", "{}")) as Record<string, string>;
    const k = keys["default"] ?? Object.values(keys)[0];
    if (k) return k;
  } catch { /* sin claves nuevas */ }
  return env("SUPABASE_SERVICE_ROLE_KEY");
}
const db = createClient(env("SUPABASE_URL"), claveServidor());

/* ---------- textos ---------- */
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const SPORT: Record<string, string> = { futbol: "Fútbol 6", wally: "Wally" };
const CANCHA = ["Cancha A", "Cancha B", "Cancha C"];
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
function fecha(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const f = new Date(Date.UTC(y, m - 1, d));
  return `${DIAS[f.getUTCDay()]} ${d} de ${MESES[m - 1]}`;
}
type Reserva = {
  id: string; codigo: string; fecha: string; deporte: string; desde: number; hasta: number; cancha: number;
  nombre: string; celular: string; pago: string; total: number; cumple: boolean; estado: string; pagado: boolean;
  creada: string; wa_cliente: string | null;
};
const resumen = (r: Reserva) =>
  `${SPORT[r.deporte]}${r.cumple ? " (cumpleaños)" : ""}, ${fecha(r.fecha)}, de ${hh(r.desde)} a ${hh(r.hasta)}, ${CANCHA[r.cancha] ?? "Cancha " + (r.cancha + 1)}`;
const vencida = (r: Reserva) => r.estado === "pendiente" && Date.now() - new Date(r.creada).getTime() > PEND_HORAS * 3600_000;
const clienteWa = (r: Reserva) => r.wa_cliente || `591${r.celular}`;

/* ---------- enviar mensajes ---------- */
async function enviar(payload: Record<string, unknown>) {
  const res = await fetch(`${GRAPH}/${PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });
  if (!res.ok) console.error("WhatsApp API", res.status, await res.text());
  return res.ok;
}
const texto = (to: string, body: string) => enviar({ to, type: "text", text: { body, preview_url: false } });
function botones(to: string, body: string, opciones: [string, string][]) {
  return enviar({
    to, type: "interactive",
    interactive: { type: "button", body: { text: body }, action: { buttons: opciones.map(([id, title]) => ({ type: "reply", reply: { id, title } })) } },
  });
}
function avisoDueno(r: Reserva) {
  const body = [
    `Nueva reserva ${r.codigo}`,
    `${r.nombre} · ${r.celular}`,
    resumen(r),
    `Bs ${r.total} · ${r.pago === "qr" ? "paga por QR" : "paga en la cancha"}${r.pagado ? " · PAGADO" : ""}`,
  ].join("\n");
  const ops: [string, string][] = [["conf:" + r.codigo, "Confirmar"]];
  if (!r.pagado) ops.push(["pago:" + r.codigo, "Ya pagó"]);
  ops.push(["canc:" + r.codigo, "Cancelar"]);
  return botones(DUENO, body, ops);
}

/* ---------- lógica ---------- */
async function porCodigo(codigo: string) {
  const { data } = await db.from("reservas").select("*").eq("codigo", codigo).maybeSingle();
  return data as Reserva | null;
}

async function mensajeCliente(from: string, body: string) {
  const m = body.match(/#r=([A-Z0-9]{6})/i) || body.match(/c[oó]digo[^A-Z0-9]*([A-Z0-9]{6})/i);
  const r = m ? await porCodigo(m[1].toUpperCase()) : null;
  if (!r) {
    // Mensaje suelto: se lo pasamos al dueño y orientamos al cliente
    await texto(from, `Hola, gracias por escribir a Sport 3. Para reservar elige tu horario aquí: ${PAGINA}\nSi es otra consulta, el dueño te responde pronto.`);
    if (DUENO) await texto(DUENO, `Mensaje de +${from}:\n${body}`);
    return;
  }
  if (!r.wa_cliente) await db.from("reservas").update({ wa_cliente: from }).eq("id", r.id);
  r.wa_cliente = r.wa_cliente || from;
  if (r.estado === "confirmada") return texto(from, `Tu reserva ${r.codigo} ya está confirmada: ${resumen(r)}. ¡Te esperamos!`);
  if (r.estado === "cancelada") return texto(from, `La reserva ${r.codigo} está cancelada. Puedes hacer otra aquí: ${PAGINA}`);
  await texto(from, `Recibimos tu reserva ${r.codigo}: ${resumen(r)}.\nEl dueño te confirma en un momento por aquí.${r.pago === "qr" ? "\nPuedes enviar tu comprobante de pago en este chat." : ""}`);
  await avisoDueno(r);
}

// El cliente manda una foto o PDF (normalmente el comprobante del QR): se lo reenviamos al dueño
async function comprobante(from: string, msg: any) {
  const { data } = await db.from("reservas").select("*").eq("wa_cliente", from).neq("estado", "cancelada")
    .order("creada", { ascending: false }).limit(1);
  const r = (data?.[0] ?? null) as Reserva | null;
  const media = msg.image ?? msg.document;
  const caption = r ? `Comprobante de ${r.nombre} · reserva ${r.codigo} · Bs ${r.total}` : `Archivo de +${from}`;
  const ok = await enviar({ to: DUENO, type: msg.type, [msg.type]: { id: media?.id, caption } });
  if (!ok) await texto(DUENO, `${caption}. Te lo mandó al número del bot; ábrelo en Meta o pídele que te lo reenvíe.`);
  await texto(from, "Recibimos tu comprobante. El dueño lo revisa y te confirma por aquí.");
  if (r && !r.pagado) {
    const ops: [string, string][] = [["pago:" + r.codigo, "Ya pagó"]];
    if (r.estado === "pendiente") ops.unshift(["conf:" + r.codigo, "Confirmar"]);
    await botones(DUENO, `¿El pago de ${r.nombre} (${r.codigo}) está bien?`, ops);
  }
}

async function botonDueno(id: string) {
  const [accion, codigo] = id.split(":");
  const r = codigo ? await porCodigo(codigo) : null;
  if (!r) return texto(DUENO, "No encontré esa reserva.");
  if (r.estado === "cancelada") return texto(DUENO, `La reserva ${r.codigo} ya estaba cancelada.`);

  if (accion === "conf") {
    if (r.estado === "confirmada") return texto(DUENO, `La reserva ${r.codigo} ya estaba confirmada.`);
    if (vencida(r)) {
      // Pasaron las 2 horas: revisar que nadie haya tomado esa cancha mientras tanto
      const { data: otras } = await db.from("reservas").select("id,estado,creada")
        .eq("fecha", r.fecha).eq("deporte", r.deporte).eq("cancha", r.cancha)
        .lt("desde", r.hasta).gt("hasta", r.desde).neq("id", r.id).neq("estado", "cancelada");
      const choca = (otras ?? []).some((o) => o.estado === "confirmada" || Date.now() - new Date(o.creada).getTime() < PEND_HORAS * 3600_000);
      if (choca) return texto(DUENO, `No se puede confirmar ${r.codigo}: pasaron más de ${PEND_HORAS} horas y esa cancha ya la tomó otra reserva. Avísale a ${r.nombre} (${r.celular}).`);
    }
    await db.from("reservas").update({ estado: "confirmada" }).eq("id", r.id);
    await texto(clienteWa(r), `Hola ${r.nombre}, tu reserva en Sport 3 está confirmada: ${resumen(r)}. ¡Te esperamos!`);
    return texto(DUENO, `Listo. ${r.codigo} confirmada y ya le avisé a ${r.nombre}.`);
  }
  if (accion === "pago") {
    await db.from("reservas").update({ pagado: true }).eq("id", r.id);
    if (r.estado === "pendiente") {
      // Si todavía no la confirmó, vuelve a mostrar los botones
      return botones(DUENO, `${r.codigo} marcada como pagada. ¿La confirmas?`, [["conf:" + r.codigo, "Confirmar"], ["canc:" + r.codigo, "Cancelar"]]);
    }
    return texto(DUENO, `Listo. ${r.codigo} marcada como pagada.`);
  }
  if (accion === "canc") {
    await db.from("reservas").update({ estado: "cancelada" }).eq("id", r.id);
    await texto(clienteWa(r), `Hola ${r.nombre}, tu reserva en Sport 3 (${resumen(r)}) no se pudo confirmar. Puedes elegir otro horario aquí: ${PAGINA}`);
    return texto(DUENO, `Listo. ${r.codigo} cancelada; la cancha quedó libre y ya le avisé a ${r.nombre}.`);
  }
}

async function mensajeDueno(body: string) {
  // Cualquier texto del dueño: le mandamos las reservas pendientes (así también se abre la ventana de 24 h)
  const hoy = new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10); // hora de Bolivia
  const { data } = await db.from("reservas").select("*").eq("estado", "pendiente").gte("fecha", hoy).order("fecha").order("desde").limit(10);
  const pend = ((data ?? []) as Reserva[]).filter((r) => !vencida(r));
  if (!pend.length) return texto(DUENO, `Hola. No hay reservas pendientes. Las nuevas te llegan aquí con botones para confirmar.\nPágina: ${PAGINA}`);
  await texto(DUENO, `Tienes ${pend.length} reserva${pend.length > 1 ? "s" : ""} pendiente${pend.length > 1 ? "s" : ""}:`);
  for (const r of pend) await avisoDueno(r);
  void body;
}

/* ---------- seguridad: firma de Meta ---------- */
async function firmaValida(raw: string, header: string | null) {
  if (!APP_SECRET) return true;
  if (!header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(APP_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === header.slice(7);
}

/* ---------- servidor ---------- */
Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Meta verifica el webhook una vez con GET
  if (req.method === "GET") {
    if (url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === VERIFY && VERIFY) {
      return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
    }
    return new Response("Sport 3 bot", { status: 403 });
  }
  if (req.method !== "POST") return new Response("ok");

  const raw = await req.text();
  if (!(await firmaValida(raw, req.headers.get("x-hub-signature-256")))) return new Response("firma inválida", { status: 401 });

  let payload: any;
  try { payload = JSON.parse(raw); } catch { return new Response("ok"); }

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        // Meta a veces reintenta: procesar cada mensaje una sola vez
        const { error: dup } = await db.from("wa_procesados").insert({ id: msg.id });
        if (dup) continue;
        try {
          const from = String(msg.from);
          const esDueno = DUENO && from === DUENO;
          const id = msg.interactive?.button_reply?.id ?? msg.button?.payload;
          const body = msg.text?.body ?? msg.button?.text ?? "";
          if (esDueno && id) await botonDueno(id);
          else if (esDueno) await mensajeDueno(body);
          else if (msg.type === "text") await mensajeCliente(from, body);
          else if (msg.type === "image" || msg.type === "document") await comprobante(from, msg);
          else await texto(from, `Hola, soy el asistente de Sport 3. Para reservar entra aquí: ${PAGINA}`);
        } catch (e) {
          console.error("error procesando", msg.id, e);
        }
      }
    }
  }
  return new Response("ok");
});
