(() => {
'use strict';
const $ = s => document.querySelector(s);
/* Datos del negocio: js/config.js */
const CFG = window.SPORT3 || {};
const HOURS = CFG.horas || [15,16,17,18,19,20,21];
const CANCHA_INFO = CFG.canchas;
const CANCHAS = CANCHA_INFO.futbol.length;
const QR_IMG = CFG.qr || '';
const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
const DIAS_C = ['dom','lun','mar','mié','jue','vie','sáb'];
const DIAS_N = ['domingo','lunes','martes','miercoles','jueves','viernes','sabado'];
const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const SPORT = {futbol:'Fútbol 6', wally:'Wally'};
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const EASE_OUT = 'cubic-bezier(0.23,1,0.32,1)';

/* ---------- dates ---------- */
const now = () => new Date();
const d0 = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const key = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const fromKey = k => { const [y,m,dd] = k.split('-').map(Number); return new Date(y, m-1, dd); };
const today = () => d0(now());
const monthEnd = () => { const t = today(); return new Date(t.getFullYear(), t.getMonth()+1, 0); };
const inWindow = d => d >= today() && d <= monthEnd();
const fmtLong = d => `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
const fmtShort = d => `${DIAS[d.getDay()]} ${d.getDate()}`;
const hh = h => `${String(h).padStart(2,'0')}:00`;
const sameDay = (a,b) => key(a) === key(b);
const onlyDigits = v => v.replace(/\D/g,'');
function cap1(s){ return s.replace(/^./, c => c.toUpperCase()); }

/* ---------- availability source ----------
   'loading' hasta que responde Supabase; 'live' = lo que marca el dueño; 'demo' = datos de ejemplo
   (solo si js/config.js no tiene las claves de Supabase). */
const SRC = { mode:'loading', db:null, canWrite:false, phone:'', occ:{}, res:[], mine:[] };
const PEND_MIN = 120; // minutos que una reserva pendiente aparta la cancha (igual que en supabase/reservas-v2.sql)
/* Canchas apartadas por reservas de la página en ese turno */
function reservedAt(dk, sport, h){
  return SRC.res.filter(r => r.fecha === dk && r.deporte === sport && r.desde <= h && r.hasta > h).map(r => r.cancha);
}
/* Las marcadas a mano por el dueño ocupan las primeras canchas sin reserva */
function manualAt(dk, sport, h){ return Math.min(CANCHAS, +(SRC.occ[dk]?.[sport]?.[h] || 0)); }
function hash(s){ let h = 2166136261; for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function exampleTaken(dk, sport, h){
  if (dk === key(today()) && ((sport === 'futbol' && h === 18) || (sport === 'wally' && h === 20))) return CANCHAS;
  const wd = fromKey(dk).getDay();
  const p = .24 + ([5,6,0].includes(wd) ? .22 : 0) + (h >= 19 ? .2 : 0) + (sport === 'futbol' ? .06 : 0);
  let n = 0; for (let i=0;i<CANCHAS;i++) if (hash(`${dk}|${sport}|${h}|${i}`) % 1000 < p*1000) n++;
  return n;
}
function courtTaken(dk, sport, h, i){
  if (SRC.mode === 'live'){
    const r = reservedAt(dk, sport, h); if (r.includes(i)) return true;
    const libres = [...Array(CANCHAS).keys()].filter(x => !r.includes(x));
    return libres.slice(0, manualAt(dk, sport, h)).includes(i);
  }
  if (dk === key(today()) && ((sport === 'futbol' && h === 18) || (sport === 'wally' && h === 20))) return true;
  const wd = fromKey(dk).getDay();
  const p = .24 + ([5,6,0].includes(wd) ? .22 : 0) + (h >= 19 ? .2 : 0) + (sport === 'futbol' ? .06 : 0);
  return hash(`${dk}|${sport}|${h}|${i}`) % 1000 < p*1000;
}
function freeCourts(d, sport, from, to){
  const out = [];
  for (let i=0;i<CANCHAS;i++){ let ok = true; for (let h=from; h<to; h++) if (courtTaken(key(d), sport, h, i)) { ok = false; break; } if (ok) out.push(i); }
  return out;
}
function takenCount(dk, sport, h){
  if (SRC.mode === 'live') return Math.min(CANCHAS, new Set(reservedAt(dk, sport, h)).size + manualAt(dk, sport, h));
  return exampleTaken(dk, sport, h);
}
function slotState(d, sport, h){
  if (SRC.mode === 'loading') return {s:'loading', free:0};
  const n = now();
  if (sameDay(d, n) && n.getHours() >= h) return {s:'past', free:0};
  const free = CANCHAS - takenCount(key(d), sport, h);
  if (free <= 0) return {s:'res', free:0};
  return {s:'free', free};
}
const price = (sport, h) => sport === 'wally' ? 60 : (h >= 19 ? 150 : 120);
const totalFor = (sport, from, to) => { let t = 0; for (let h=from; h<to; h++) t += price(sport, h); return t; };

/* ---------- state ---------- */
const S = { sport:'futbol', date: today(), sel:null, court:null, step:1, cur:null };
if (now().getHours() >= 21) { const t = new Date(today()); t.setDate(t.getDate()+1); if (inWindow(t)) S.date = t; }

/* ---------- motion ---------- */
function enter(el, {x=0, y=0, dur=240, delay=0} = {}){
  if (!el || !el.animate) return;
  const from = reduce.matches ? {opacity:0} : {opacity:0, transform:`translate(${x}px,${y}px)`};
  const to = reduce.matches ? {opacity:1} : {opacity:1, transform:'translate(0,0)'};
  el.animate([from, to], {duration: reduce.matches ? 160 : dur, easing: EASE_OUT, delay, fill:'backwards'});
}
// softened swap: starts at half opacity so fast toggles never flash empty
function swap(el){
  if (!el.animate) return;
  el.animate(reduce.matches ? [{opacity:.5},{opacity:1}] : [{opacity:.5, filter:'blur(2px)', transform:'translateY(3px)'},{opacity:1, filter:'blur(0)', transform:'translateY(0)'}], {duration:200, easing:EASE_OUT});
}
function segSet(seg, idx){
  seg.dataset.v = idx;
  seg.querySelectorAll('button').forEach((b,i) => { b.setAttribute('aria-checked', i === idx); b.tabIndex = i === idx ? 0 : -1; });
}

/* ---------- step 1: sport ---------- */
const sportSeg = $('#sport');
sportSeg.addEventListener('click', e => { const b = e.target.closest('button[data-sport]'); if (b) setSport(b.dataset.sport); });
sportSeg.addEventListener('keydown', e => {
  if (!['ArrowLeft','ArrowRight'].includes(e.key)) return;
  e.preventDefault(); setSport(S.sport === 'futbol' ? 'wally' : 'futbol'); $('#sp-'+S.sport).focus();
});
function setSport(sp, {silent=false} = {}){
  if (sp === S.sport && !silent) return;
  S.sport = sp; segSet(sportSeg, sp === 'wally' ? 1 : 0);
  keepSelIfValid(); renderSlots(true); renderSum();
}

/* ---------- step 1: slots ---------- */
const slotsEl = $('#slots');
function keepSelIfValid(){
  if (!S.sel || SRC.mode === 'loading') return;
  for (let i=S.sel[0]; i<=S.sel[1]; i++){ const st = slotState(S.date, S.sport, HOURS[i]).s; if (st === 'res' || st === 'past') { S.sel = null; return; } }
}
const CK = '<span class="ck"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5 10 17.5 19 7"/></svg></span>';
function renderSlots(animate){
  $('#slotsCap').textContent = `${SPORT[S.sport]} · ${fmtShort(S.date)}`;
  slotsEl.innerHTML = '';
  const past = HOURS.filter(h => slotState(S.date, S.sport, h).s === 'past');
  if (past.length){
    const n = document.createElement('p'); n.className = 'past-note';
    n.textContent = past.length === HOURS.length ? 'Por hoy ya no quedan horarios. Elige otra fecha.' : `Los horarios antes de las ${hh(past[past.length-1] + 1)} ya pasaron.`;
    slotsEl.appendChild(n);
  }
  HOURS.forEach((h, i) => {
    const st = slotState(S.date, S.sport, h);
    if (st.s === 'past') return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'slot ' + st.s; b.dataset.i = i;
    const on = !!(S.sel && i >= S.sel[0] && i <= S.sel[1]);
    b.setAttribute('aria-pressed', on);
    const lbl = st.s === 'loading' ? 'Cargando' : st.s === 'past' ? 'Ya pasó' : st.s === 'res' ? 'Reservada' : on ? 'Elegido' : 'Disponible';
    b.innerHTML = `<span class="t">${hh(h)} <i>a ${hh(h+1)}</i></span><span class="p">Bs ${price(S.sport,h)}</span><span class="st">${on ? CK : ''}${lbl}</span>`;
    b.setAttribute('aria-label', `${hh(h)} a ${hh(h+1)}, Bs ${price(S.sport,h)}, ${lbl}`);
    if (['past','res','loading'].includes(st.s)) b.disabled = true;
    slotsEl.appendChild(b);
  });
  if (animate) swap(slotsEl);
}
slotsEl.addEventListener('click', e => {
  const b = e.target.closest('.slot'); if (!b || b.disabled) return;
  const i = +b.dataset.i, sel = S.sel;
  if (!sel) S.sel = [i,i];
  else if (i === sel[1] + 1) S.sel = [sel[0], i];
  else if (i === sel[0] - 1) S.sel = [i, sel[1]];
  else if (i === sel[0] && i === sel[1]) S.sel = null;
  else if (i === sel[1]) S.sel = [sel[0], i-1];
  else if (i === sel[0]) S.sel = [i+1, sel[1]];
  else S.sel = [i,i];
  renderSlots(false); renderSum();
  slotsEl.querySelector(`[data-i="${i}"]`)?.focus();
});

/* ---------- step 1: date ---------- */
const dateBtn = $('#dateBtn'), cal = $('#cal');
function renderDate(){
  const t = today(), tm = new Date(t); tm.setDate(tm.getDate()+1);
  $('#dateTag').textContent = sameDay(S.date, t) ? 'Hoy' : sameDay(S.date, tm) ? 'Mañana' : DIAS[S.date.getDay()];
  $('#dateTxt').textContent = cap1(fmtLong(S.date));
}
function renderCal(){
  const t = today(), end = monthEnd();
  const first = new Date(t.getFullYear(), t.getMonth(), 1);
  const off = (first.getDay() + 6) % 7;
  let h = `<div class="cal-h"><b>${MESES[t.getMonth()]} ${t.getFullYear()}</b><small>Hasta el ${end.getDate()} de ${MESES[t.getMonth()]}</small></div><div class="cal-g">`;
  ['lu','ma','mi','ju','vi','sá','do'].forEach(d => h += `<div class="dow" aria-hidden="true">${d}</div>`);
  for (let i=0;i<off;i++) h += '<div></div>';
  for (let dd=1; dd<=end.getDate(); dd++){
    const d = new Date(t.getFullYear(), t.getMonth(), dd), ok = inWindow(d);
    h += `<button type="button" class="day${sameDay(d,t)?' today':''}" data-k="${key(d)}" ${ok?'':'disabled'} aria-selected="${sameDay(d,S.date)}" aria-label="${fmtLong(d)}${ok?'':', no disponible'}">${dd}</button>`;
  }
  cal.innerHTML = h + '</div>';
}
function openCal(){ renderCal(); cal.setAttribute('data-open',''); dateBtn.setAttribute('aria-expanded','true'); requestAnimationFrame(() => cal.querySelector('[aria-selected="true"]')?.focus()); }
function closeCal(focus){ if (!cal.hasAttribute('data-open')) return; cal.removeAttribute('data-open'); dateBtn.setAttribute('aria-expanded','false'); if (focus) dateBtn.focus(); }
dateBtn.addEventListener('click', () => cal.hasAttribute('data-open') ? closeCal() : openCal());
cal.addEventListener('click', e => { const b = e.target.closest('.day'); if (!b || b.disabled) return; setDate(fromKey(b.dataset.k)); closeCal(true); });
cal.addEventListener('keydown', e => {
  const map = {ArrowLeft:-1, ArrowRight:1, ArrowUp:-7, ArrowDown:7};
  if (e.key === 'Escape') { e.preventDefault(); closeCal(true); return; }
  if (!(e.key in map)) return;
  e.preventDefault();
  const days = [...cal.querySelectorAll('.day:not(:disabled)')];
  const i = days.indexOf(document.activeElement);
  days[Math.max(0, Math.min(days.length-1, (i<0?0:i) + map[e.key]))]?.focus();
});
document.addEventListener('pointerdown', e => { if (!e.target.closest('.datewrap')) closeCal(); });
function setDate(d){ if (sameDay(d, S.date)) return; S.date = d; keepSelIfValid(); renderDate(); renderSlots(true); renderSum(); }

/* ---------- step 1: summary ---------- */
function selInfo(){
  if (!S.sel) return null;
  const from = HOURS[S.sel[0]], to = HOURS[S.sel[1]] + 1, total = totalFor(S.sport, from, to);
  return {from, to, hours: to - from, total};
}
function renderCourts(){
  const s = selInfo(), blk = $('#courtBlock');
  if (!s){ blk.hidden = true; S.court = null; return; }
  const free = freeCourts(S.date, S.sport, s.from, s.to);
  if (S.court !== null && !free.includes(S.court)) S.court = null;
  if (S.court === null && free.length === 1) S.court = free[0];
  blk.hidden = false;
  $('#courts').innerHTML = CANCHA_INFO[S.sport].map((c, i) => {
    const ok = free.includes(i), on = S.court === i;
    return `<button type="button" class="court${on ? ' on' : ''}" role="radio" aria-checked="${on}" data-c="${i}" ${ok ? '' : 'disabled'}>
      <span class="cn">${c.n}</span><span class="cd">${c.d}</span><span class="cs">${ok ? (on ? 'Elegida' : 'Disponible') : 'Ocupada'}</span></button>`;
  }).join('');
}
$('#courts').addEventListener('click', e => { const b = e.target.closest('.court'); if (!b || b.disabled) return; S.court = +b.dataset.c; renderSum(); });
function renderSum(){
  renderCourts();
  const s = selInfo(), ready = !!s && S.court !== null;
  $('#btnContinue').disabled = !ready;
  $('#sum').innerHTML = s
    ? `<div class="what"><b>${hh(s.from)} a ${hh(s.to)}</b><small>${SPORT[S.sport]} · ${S.court !== null ? CANCHA_INFO[S.sport][S.court].n : 'elige una cancha'} · ${fmtShort(S.date)}</small></div><div class="price"><b>Bs ${s.total}</b></div>`
    : `<div class="what"><b>Elige un horario disponible</b><small>${SPORT[S.sport]} · ${S.sport==='wally'?'Bs 60 la hora':'desde Bs 120 la hora'}</small></div>`;
}
$('#btnContinue').addEventListener('click', () => go(2));
if ('ResizeObserver' in window) new ResizeObserver(([e]) => document.documentElement.style.setProperty('--dockh', Math.ceil(e.target.getBoundingClientRect().height) + 'px')).observe(document.querySelector('.dock'));

/* ---------- navigation ---------- */
const ORDER = {1:1, 2:2, 3:3, 4:4, owner:5};
function go(n){
  const prev = S.step; if (n === prev) return;
  if (n === 1 && prev === 4) S.sel = null;
  ['step1','step2','step3','step4','owner'].forEach(id => $('#'+id).hidden = true);
  const el = n === 'owner' ? $('#owner') : $('#step'+n);
  el.hidden = false; S.step = n;
  if (n === 1) { keepSelIfValid(); renderSlots(false); renderSum(); }
  if (n === 2) renderRecap();
  if (n === 4) setTimeout(drawMap, 30);
  if (n === 'owner') { renderOwner(false); $('#oPhone').value = SRC.phone; }
  closeCal();
  window.scrollTo({top:0, behavior:'instant'});
  enter(el, {x: ORDER[n] > ORDER[prev] ? 16 : -16, dur: 260});
  $('#intro').hidden = n !== 1;
  const h = n === 1 ? $('#t1') : el.querySelector('h2'); if (h){ h.tabIndex = -1; h.focus({preventScroll:true}); }
}
document.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) go(+b.dataset.go); });
$('#home').addEventListener('click', e => { e.preventDefault(); go(1); });

/* ---------- step 2 ---------- */
function renderRecap(){
  const s = selInfo(); if (!s || S.court === null) return go(1);
  const horas = s.to - s.from;
  $('#recap2').innerHTML = `<dt>Deporte</dt><dd>${SPORT[S.sport]}</dd>`
    + `<dt>Cancha</dt><dd>${CANCHA_INFO[S.sport][S.court].n}<small>${CANCHA_INFO[S.sport][S.court].d}</small></dd>`
    + `<dt>Día</dt><dd>${fmtLong(S.date).replace(/^./, c => c.toUpperCase())}</dd>`
    + `<dt>Horario</dt><dd>${hh(s.from)} a ${hh(s.to)}<small>${horas === 1 ? '1 hora' : horas + ' horas'}</small></dd>`
    + `<dt>Total</dt><dd class="tot">Bs ${s.total}</dd>`;
  $('#err2').hidden = true;
}
document.querySelectorAll('input[name="pago"]').forEach(r => r.addEventListener('change', () => { $('#warnCancha').hidden = document.querySelector('input[name="pago"]:checked')?.value !== 'cancha'; }));
$('#celular').addEventListener('input', e => { e.target.value = onlyDigits(e.target.value).slice(0,8); });
let sending = false;
$('#form2').addEventListener('submit', async e => {
  e.preventDefault();
  if (sending) return;
  const err = $('#err2'), s = selInfo(); if (!s) return go(1);
  const nombre = $('#nombre').value.trim(), cel = onlyDigits($('#celular').value);
  const fail = (msg, el) => { err.textContent = msg; err.hidden = false; enter(err, {y:-4, dur:200}); el?.focus(); };
  if (nombre.length < 2) return fail('Escribe tu nombre para la reserva.', $('#nombre'));
  if (!/^[67]\d{7}$/.test(cel)) return fail('El celular debe tener 8 dígitos y empezar con 6 o 7.', $('#celular'));
  const pago = document.querySelector('input[name="pago"]:checked')?.value;
  if (!pago) return fail('Elige cómo vas a pagar.', document.querySelector('input[name="pago"]'));
  if ($('#cumple').checked && s.hours < 3) return fail(`Para cumpleaños se reservan mínimo 3 horas seguidas. Vuelve a Horarios y elige 3 horas, por ejemplo de ${hh(Math.min(19, s.from))} a ${hh(Math.min(19, s.from)+3)}.`);
  for (let h=s.from; h<s.to; h++){
    if (slotState(S.date, S.sport, h).s === 'res'){ toast('Ese horario se acaba de ocupar. Elige otro.'); S.sel = null; go(1); return; }
  }
  if (!freeCourts(S.date, S.sport, s.from, s.to).includes(S.court)){ toast('Esa cancha se acaba de ocupar. Elige otra.'); go(1); return; }
  S.cur = {nombre, cel, sport:S.sport, date:key(S.date), from:s.from, to:s.to, total:s.total, cumple:$('#cumple').checked, court:S.court, pago, saved:false};
  if (SRC.mode === 'live' && SRC.db){
    const btn = $('#form2 button[type="submit"]'), label = btn.innerHTML;
    sending = true; btn.disabled = true; btn.textContent = 'Guardando tu reserva…';
    let res = null;
    try {
      const { data, error } = await SRC.db.rpc('reservar', {
        p_fecha:S.cur.date, p_deporte:S.cur.sport, p_desde:S.cur.from, p_hasta:S.cur.to, p_cancha:S.cur.court,
        p_nombre:nombre, p_celular:cel, p_pago:pago, p_total:S.cur.total, p_cumple:S.cur.cumple });
      if (error) throw error; res = data;
    } catch { res = null; }
    sending = false; btn.disabled = false; btn.innerHTML = label;
    if (res === 'ocupada'){ toast('Esa cancha se acaba de ocupar. Elige otra.'); S.court = null; await loadAll().catch(() => {}); go(1); return; }
    if (res === 'invalida') return fail('No pudimos guardar la reserva. Revisa tus datos; si ya tienes reservas pendientes, espera a que el dueño las confirme.');
    if (typeof res === 'string' && res.startsWith('ok')){ S.cur.saved = true; S.cur.codigo = res.split(':')[1] || ''; loadAll().catch(() => {}); }
    else toast('No pudimos apartar la cancha. Envía igual la reserva por WhatsApp.');
  }
  renderSend();
  go(3);
});

/* ---------- step 3 ---------- */
function ownerMessage(r){
  const d = fromKey(r.date);
  return [
    `Nueva reserva Sport 3`,
    `Deporte: ${SPORT[r.sport]}${r.cumple ? ' (cumpleaños)' : ''}`,
    `Fecha: ${fmtLong(d)}`,
    `Cancha: ${CANCHA_INFO[r.sport][r.court].n} (${CANCHA_INFO[r.sport][r.court].d})`,
    `Horario: ${hh(r.from)} a ${hh(r.to)} (${r.to - r.from} h)`,
    `Nombre: ${r.nombre}`,
    `Celular: ${r.cel}`,
    `Total: Bs ${r.total}`,
    r.pago === 'qr' ? `Pago: QR (envío el comprobante en este chat)` : `Pago: en la cancha`,
    ...(r.codigo ? ['', `Para Sport 3, confirmar aquí: ${location.href.split('#')[0]}#r=${r.codigo}`] : [])
  ].join('\n');
}
// WhatsApp del dueño: el guardado en Supabase o, si no hay, el de js/config.js
const DUENO_TEL = CFG.telefono || '';
function waLink(text){
  // 8 dígitos = celular de Bolivia (+591); más largo = número con código de país (ej. el número de prueba de Meta, +1 555…)
  const tel = String(SRC.phone || DUENO_TEL).replace(/\D/g, '');
  const base = `https://wa.me/${tel.length > 8 ? tel : '591' + tel}`;
  return `${base}?text=${encodeURIComponent(text)}`;
}
function detailRows(r){
  const d = fromKey(r.date);
  return `
    <dt>Deporte</dt><dd>${SPORT[r.sport]}${r.cumple?' · cumpleaños':''}</dd>
    <dt>Fecha</dt><dd>${fmtLong(d)}</dd>
    <dt>Cancha</dt><dd>${CANCHA_INFO[r.sport][r.court].n}</dd>
    <dt>Horario</dt><dd>${hh(r.from)} a ${hh(r.to)}</dd>
    <dt>A nombre de</dt><dd>${esc(r.nombre)}</dd>`;
}
function renderSend(){
  $('#holdNote').hidden = !S.cur?.saved;
  const r = S.cur; if (!r) return;
  $('#dl3').innerHTML = detailRows(r);
  $('#total3').textContent = `Bs ${r.total}`;
  const qr = r.pago === 'qr';
  $('#payLbl3').textContent = qr ? 'Paga ahora con QR' : 'A pagar en la cancha';
  $('#payNote3').textContent = qr ? 'Escanea o guarda el QR, paga y envía la captura del comprobante en el chat de WhatsApp.' : 'Si tu equipo no llega dentro de los 15 minutos desde la hora reservada, la cancha se libera para otros clientes.';
  $('#qrbox').hidden = !qr; if (qr) drawQR();
  const msg = ownerMessage(r);
  $('#msgPreview').textContent = msg;
  $('#btnWa').href = waLink(msg);
}
$('#btnWa').addEventListener('click', () => {
  if (!S.cur) return;
  S.last = {...S.cur};
  renderDone(S.cur);
  setTimeout(() => {
    go(4);
    const p = $('#tickPath');
    if (p.animate && !reduce.matches){
      const L = p.getTotalLength(); p.style.strokeDasharray = L;
      p.animate([{strokeDashoffset:L},{strokeDashoffset:0}], {duration:420, delay:120, easing:EASE_OUT, fill:'backwards'});
    }
  }, 250);
});


const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function renderDone(r){
  $('#dl4').innerHTML = detailRows(r) + `<dt>${r.pago === 'qr' ? 'Pago' : 'A pagar en la cancha'}</dt><dd class="hi">${r.pago === 'qr' ? 'Por QR' : 'Bs ' + r.total}</dd>`;
  $('#warn4').hidden = r.pago === 'qr'; $('#warn4').textContent = 'Si tu equipo no llega dentro de los 15 minutos desde la hora reservada, la cancha se libera para otros clientes.';
  $('#btnWa2').href = waLink(ownerMessage(r));
  const ymd = r.date.replace(/-/g,'');
  const q = new URLSearchParams({action:'TEMPLATE', text:`Sport 3 · ${SPORT[r.sport]}`, dates:`${ymd}T${String(r.from).padStart(2,'0')}0000/${ymd}T${String(r.to).padStart(2,'0')}0000`, ctz:'America/La_Paz', details:`${CANCHA_INFO[r.sport][r.court].n}. Total: Bs ${r.total}${r.pago === 'qr' ? ' (pago por QR)' : ' (pago en la cancha)'}.`, location:'Sport 3, Miraflores, Tarija'});
  $('#gcal').href = 'https://calendar.google.com/calendar/render?' + q.toString();
}


const O = { sport:'futbol', date: S.date };
const oSport = $('#oSport');
oSport.addEventListener('click', e => { const b = e.target.closest('button[data-sport]'); if (!b || b.dataset.sport === O.sport) return; O.sport = b.dataset.sport; segSet(oSport, O.sport === 'wally' ? 1 : 0); renderOwner(true); });
$('#oDays').addEventListener('click', e => { const b = e.target.closest('.dchip'); if (!b) return; O.date = fromKey(b.dataset.k); renderOwner(true); });
function renderOwner(animate){
  $('#owner').classList.toggle('focus', !!O.focus);
  $('#oFocus').hidden = !(O.focus && SRC.canWrite);
  $('#oPanel').hidden = !SRC.canWrite || !!O.focus;
  $('#oLogin').hidden = SRC.canWrite;
  if (O.focus && SRC.canWrite) renderFocus();
  // day chips: today → end of month
  const days = $('#oDays'); days.innerHTML = '';
  for (let d = new Date(today()); d <= monthEnd(); d.setDate(d.getDate()+1)){
    const b = document.createElement('button'); b.type = 'button'; b.className = 'dchip'; b.dataset.k = key(d);
    b.setAttribute('aria-pressed', sameDay(d, O.date)); b.setAttribute('aria-label', fmtLong(d));
    const pend = SRC.mine.some(r => r.fecha === key(d) && resState(r) === 'pendiente');
    b.innerHTML = `<small>${sameDay(d,today()) ? 'hoy' : DIAS_C[d.getDay()]}</small><b>${d.getDate()}</b>${pend ? '<i class="pdot" aria-label="con reservas pendientes"></i>' : ''}`;
    days.appendChild(b);
  }
  if (!inWindow(O.date)) O.date = today();
  const list = $('#oList'), dk = key(O.date); list.innerHTML = '';
  HOURS.forEach(h => {
    const web = new Set(reservedAt(dk, O.sport, h)).size, man = manualAt(dk, O.sport, h), n = Math.min(CANCHAS, web + man);
    const row = document.createElement('div'); row.className = 'orow' + (n >= CANCHAS ? ' full' : '');
    row.innerHTML = `<span class="t">${hh(h)} <i>– ${hh(h+1)}</i></span>
      <div class="stp"><button type="button" data-h="${h}" data-d="-1" ${man<=0?'disabled':''} aria-label="Una cancha menos a las ${hh(h)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg></button>
      <output><b>${n}</b> de ${CANCHAS}${web ? `<small>${web} por la página</small>` : ''}</output>
      <button type="button" data-h="${h}" data-d="1" ${n>=CANCHAS?'disabled':''} aria-label="Una cancha más a las ${hh(h)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div>`;
    list.appendChild(row);
  });
  renderResList();
  if (animate) swap(list);
}
function resState(r){
  if (r.estado === 'pendiente' && Date.now() - new Date(r.creada).getTime() > PEND_MIN*60000) return 'vencida';
  return r.estado;
}
function renderResList(){
  const box = $('#oRes'), dk = key(O.date);
  const rows = SRC.mine.filter(r => r.fecha === dk).sort((a,b) => a.desde - b.desde || a.creada.localeCompare(b.creada));
  if (!rows.length){ box.innerHTML = `<p class="empty">No hay reservas de la página para ${sameDay(O.date, today()) ? 'hoy' : fmtLong(O.date)}.</p>`; return; }
  const BADGE = {pendiente:['pend','Pendiente'], confirmada:['ok','Confirmada'], cancelada:['off','Cancelada'], vencida:['bad','Vencida']};
  box.innerHTML = rows.map(r => {
    const st = resState(r), [cls, txt] = BADGE[st], cancha = CANCHA_INFO[r.deporte][r.cancha]?.n || `Cancha ${r.cancha+1}`;
    const off = st === 'cancelada' || st === 'vencida';
    const aviso = avisoCliente(r);
    return `<article class="rcard${off ? ' off' : ''}" data-id="${r.id}">
      <div class="rtop"><div><div class="rname">${esc(r.nombre)}</div>
        <div class="rmeta">${hh(r.desde)} a ${hh(r.hasta)} · ${SPORT[r.deporte]} · ${esc(cancha)}<br>Bs ${r.total} · ${r.pago === 'qr' ? 'Paga por QR' : 'Paga en la cancha'}${r.cumple ? ' · Cumpleaños' : ''}<br>Cel. ${r.celular}</div></div>
        <div class="rbadges"><span class="badge ${cls}">${txt}</span>${r.pagado ? '<span class="badge ok">Pagado</span>' : ''}</div></div>
      <div class="ract">
        ${st === 'pendiente' || st === 'vencida' ? '<button type="button" class="go" data-act="confirmar">Confirmar</button>' : ''}
        ${!r.pagado && st !== 'cancelada' ? '<button type="button" data-act="pago">Pagó</button>' : ''}
        ${st !== 'cancelada' ? '<button type="button" data-act="cancelar">Cancelar</button>' : ''}
        <a class="wa" href="https://wa.me/591${r.celular}?text=${encodeURIComponent(aviso)}" target="_blank" rel="noopener">WhatsApp</a>
      </div></article>`;
  }).join('');
}
$('#oRes').addEventListener('click', async e => {
  const b = e.target.closest('button[data-act]'); if (!b || !SRC.db) return;
  const id = b.closest('.rcard').dataset.id, r = SRC.mine.find(x => x.id === id); if (!r) return;
  const act = b.dataset.act;
  if (act === 'cancelar' && !confirmCancel(b)) return;
  const patch = act === 'confirmar' ? {estado:'confirmada'} : act === 'pago' ? {pagado:true} : {estado:'cancelada'};
  b.disabled = true;
  const { error } = await SRC.db.from('reservas').update(patch).eq('id', id);
  if (error){ b.disabled = false; toast('No se pudo guardar. Revise su conexión.'); return; }
  Object.assign(r, patch); renderOwner(false);
  toast(act === 'confirmar' ? 'Reserva confirmada. Avísele por WhatsApp.' : act === 'pago' ? 'Marcada como pagada' : 'Reserva cancelada. La cancha quedó libre.');
  loadAll().catch(() => {});
});
/* Una sola reserva, abierta desde el enlace del mensaje de WhatsApp (#r=CODIGO) */
let focusLookup = '';
function avisoCliente(r){
  const cancha = CANCHA_INFO[r.deporte][r.cancha]?.n || `Cancha ${r.cancha+1}`;
  return `Hola ${r.nombre}, tu reserva en Sport 3 está confirmada: ${SPORT[r.deporte]}, ${fmtLong(fromKey(r.fecha))}, de ${hh(r.desde)} a ${hh(r.hasta)}, ${cancha}. ¡Te esperamos!`;
}
async function renderFocus(){
  const box = $('#oFocus'), code = O.focus;
  let r = SRC.mine.find(x => x.codigo === code);
  if (!r && SRC.db && focusLookup !== code){
    focusLookup = code;
    const { data } = await SRC.db.from('reservas').select('*').eq('codigo', code).limit(1);
    if (data && data[0]){ SRC.mine = SRC.mine.filter(x => x.id !== data[0].id).concat(data[0]); if (O.focus === code) renderFocus(); return; }
  }
  if (!r){ box.innerHTML = `<p class="note">${focusLookup === code ? `No se encontró la reserva ${esc(code)}.` : 'Buscando la reserva…'}</p><a class="fall" href="#dueno">Ver todas las reservas</a>`; return; }
  const st = resState(r), cancha = CANCHA_INFO[r.deporte][r.cancha] || {n:`Cancha ${r.cancha+1}`, d:''};
  const BADGE = {pendiente:['pend','Pendiente de confirmar'], confirmada:['ok','Confirmada'], cancelada:['off','Cancelada'], vencida:['bad','Vencida: la cancha se liberó']};
  const [cls, txt] = BADGE[st];
  box.innerHTML = `<div class="fcard" data-id="${r.id}">
      <div class="fbad"><span class="badge ${cls}">${txt}</span>${r.pagado ? '<span class="badge ok">Pagado</span>' : ''}</div>
      <div class="fname">${esc(r.nombre)}</div>
      <dl class="fdl">
        <dt>Día</dt><dd>${cap1(fmtLong(fromKey(r.fecha)))}</dd>
        <dt>Hora</dt><dd>${hh(r.desde)} a ${hh(r.hasta)}</dd>
        <dt>Cancha</dt><dd>${SPORT[r.deporte]} · ${esc(cancha.n)}</dd>
        <dt>Pago</dt><dd>Bs ${r.total} · ${r.pago === 'qr' ? 'por QR' : 'en la cancha'}</dd>
        <dt>Celular</dt><dd>${r.celular}</dd>
      </dl>
      <div class="facts">
        ${st === 'pendiente' || st === 'vencida' ? '<button type="button" class="primary fbig" data-act="confirmar">Confirmar reserva</button>' : ''}
        ${st === 'confirmada' ? `<a class="primary wa fbig" href="https://wa.me/591${r.celular}?text=${encodeURIComponent(avisoCliente(r))}" target="_blank" rel="noopener">Avisar al cliente por WhatsApp</a>` : ''}
        ${!r.pagado && st !== 'cancelada' ? '<button type="button" class="btn2 fbig" data-act="pago">Ya pagó</button>' : ''}
        ${st !== 'cancelada' ? '<button type="button" class="btn2 fbig fno" data-act="cancelar">Cancelar reserva</button>' : ''}
      </div>
    </div>
    <a class="fall" href="#dueno">Ver todas las reservas</a>`;
}
$('#oFocus').addEventListener('click', async e => {
  const b = e.target.closest('button[data-act]'); if (!b || !SRC.db) return;
  const id = b.closest('.fcard').dataset.id, r = SRC.mine.find(x => x.id === id); if (!r) return;
  const act = b.dataset.act;
  if (act === 'cancelar' && !confirmCancel(b)) return;
  const patch = act === 'confirmar' ? {estado:'confirmada'} : act === 'pago' ? {pagado:true} : {estado:'cancelada'};
  b.disabled = true;
  const { error } = await SRC.db.from('reservas').update(patch).eq('id', id);
  if (error){ b.disabled = false; toast('No se pudo guardar. Revise su conexión.'); return; }
  Object.assign(r, patch); renderFocus();
  toast(act === 'confirmar' ? 'Confirmada. Ahora avísele al cliente.' : act === 'pago' ? 'Marcada como pagada' : 'Reserva cancelada. La cancha quedó libre.');
  loadAll().catch(() => {});
});
/* Cancelar pide un segundo toque (sin ventanas emergentes) */
function confirmCancel(b){
  if (b.dataset.sure) return true;
  const label = b.textContent; b.dataset.sure = '1'; b.textContent = '¿Seguro? Toque otra vez';
  setTimeout(() => { if (b.isConnected){ delete b.dataset.sure; b.textContent = label; } }, 3500);
  return false;
}
$('#oList').addEventListener('click', e => {
  const b = e.target.closest('button[data-h]'); if (!b || b.disabled) return;
  const dk = key(O.date), h = +b.dataset.h;
  const day = SRC.occ[dk] = structuredClone(SRC.occ[dk] || {futbol:{}, wally:{}});
  day[O.sport] = day[O.sport] || {};
  const tope = CANCHAS - new Set(reservedAt(dk, O.sport, h)).size;
  day[O.sport][h] = Math.max(0, Math.min(tope, (+day[O.sport][h] || 0) + +b.dataset.d));
  renderOwner(false);
  $(`#oList button[data-h="${h}"][data-d="${b.dataset.d}"]`)?.focus();
  writeDay(dk);
});
// one write at a time per day document; later clicks fold into the next write
const writing = {}, dirty = {};
async function writeDay(dk){
  if (!SRC.db) return;
  if (writing[dk]) { dirty[dk] = true; return; }
  writing[dk] = true; $('#oSaved').textContent = 'Guardando…';
  try {
    do { dirty[dk] = false; await saveDay(dk, structuredClone(SRC.occ[dk])); } while (dirty[dk]);
    $('#oSaved').textContent = 'Guardado. Los clientes ya lo ven.';
  } catch (err) {
    $('#oSaved').textContent = /permission|policy|JWT|401|403/i.test(String(err?.message || err?.code)) ? 'Su sesión venció. Vuelva a entrar.' : 'No se pudo guardar. Revise su conexión e inténtelo de nuevo.';
  } finally { writing[dk] = false; }
}
$('#oPhone').addEventListener('input', e => { e.target.value = onlyDigits(e.target.value).slice(0,15); });
$('#oPhoneForm').addEventListener('submit', async e => {
  e.preventDefault();
  const v = onlyDigits($('#oPhone').value);
  if (!/^(\d{8}|\d{10,15})$/.test(v)) { toast('Escriba 8 dígitos, o el número completo con código de país.'); return; }
  if (!SRC.db) return;
  const prev = SRC.phone; SRC.phone = v;
  try { const { error } = await SRC.db.from('config').upsert({clave:'telefono', valor:v}); if (error) throw error; toast('Número guardado'); }
  catch { SRC.phone = prev; toast('No se pudo guardar el número.'); }
});
function ownerFromHash(){
  const m = location.hash.match(/^#r=([A-Za-z0-9]{4,12})$/);
  O.focus = m ? m[1].toUpperCase() : null;
  if (!(m || location.hash === '#dueno') || !SRC.db) return;
  if (S.step !== 'owner') go('owner'); else renderOwner(false);
}
window.addEventListener('hashchange', ownerFromHash);

/* ---------- connect the shared store ---------- */
function refreshAll(){
  if (S.step === 1){ keepSelIfValid(); renderSlots(false); renderSum(); }
  if (S.step === 3) renderSend();
  if (S.step === 'owner' && !Object.values(writing).some(Boolean)) renderOwner(false);
  $('#band').textContent = SRC.mode === 'live' ? 'Los horarios ocupados los marca el dueño de Sport 3.' : 'Versión de demostración · los horarios ocupados son de ejemplo';
}
function toDemo(){ if (SRC.mode !== 'loading') return; SRC.mode = 'demo'; refreshAll(); }
/* Supabase: tabla ocupados (fecha, deporte, hora, canchas) y tabla config (clave, valor) */
function rowsToOcc(rows){
  const occ = {};
  rows.forEach(r => { const d = occ[r.fecha] = occ[r.fecha] || {futbol:{}, wally:{}}; (d[r.deporte] = d[r.deporte] || {})[r.hora] = r.canchas; });
  return occ;
}
async function saveDay(dk, day){
  const rows = [];
  ['futbol','wally'].forEach(sp => HOURS.forEach(h => rows.push({fecha:dk, deporte:sp, hora:h, canchas:+(day?.[sp]?.[h] || 0)})));
  const { error } = await SRC.db.from('ocupados').upsert(rows, {onConflict:'fecha,deporte,hora'});
  if (error) throw error;
}
async function loadAll(){
  const db = SRC.db;
  const desde = key(today()), hasta = key(monthEnd());
  const [o, c, rs, mine] = await Promise.all([
    db.from('ocupados').select('fecha,deporte,hora,canchas').gte('fecha', desde).lte('fecha', hasta),
    db.from('config').select('clave,valor'),
    db.rpc('ocupacion', {p_desde:desde, p_hasta:hasta}),
    SRC.canWrite ? db.from('reservas').select('*').gte('fecha', desde).lte('fecha', hasta) : Promise.resolve({data:[]})
  ]);
  if (o.error) throw o.error;
  SRC.res = rs.error ? [] : (rs.data || []);
  SRC.mine = mine.error ? [] : (mine.data || []);
  const occ = rowsToOcc(o.data || []);
  Object.keys(writing).forEach(k => { if (writing[k] && SRC.occ[k]) occ[k] = SRC.occ[k]; });
  SRC.occ = occ; SRC.mode = 'live';
  const tel = (c.data || []).find(r => r.clave === 'telefono');
  SRC.phone = tel ? String(tel.valor || '') : '';
  const f = $('#oPhone'); if (document.activeElement !== f) f.value = SRC.phone;
  refreshAll();
}
let reloadT;
function reloadSoon(){ clearTimeout(reloadT); reloadT = setTimeout(() => loadAll().catch(() => {}), 250); }
function setSession(session){
  const before = SRC.canWrite;
  SRC.canWrite = !!session;
  if (!SRC.canWrite) SRC.mine = [];
  if (SRC.canWrite !== before) reloadSoon();
  $('#oLogin').hidden = SRC.canWrite;
  $('#oPanel').hidden = !SRC.canWrite || !!O.focus;
  $('#oUser').textContent = session?.user?.email || '';
  if (S.step === 'owner') renderOwner(false);
}
async function connect(){
  const url = CFG.supabaseUrl, k = CFG.supabaseKey;
  if (!url || !k || !window.supabase) { toDemo(); return; }
  const db = SRC.db = window.supabase.createClient(url, k);
  try { await loadAll(); }
  catch { SRC.mode = 'live'; SRC.occ = {}; refreshAll(); toast('No se pudieron cargar los horarios. Inténtelo de nuevo en un momento.'); }
  db.channel('sport3')
    .on('postgres_changes', {event:'*', schema:'public', table:'ocupados'}, reloadSoon)
    .on('postgres_changes', {event:'*', schema:'public', table:'config'}, reloadSoon)
    .on('postgres_changes', {event:'*', schema:'public', table:'reservas'}, reloadSoon)
    .subscribe();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) reloadSoon(); });
  // Los clientes no reciben avisos de reservas ajenas: se refresca cada 30 s
  setInterval(() => { if (!document.hidden) reloadSoon(); }, 30000);
  const { data } = await db.auth.getSession();
  setSession(data.session);
  db.auth.onAuthStateChange((_e, session) => setSession(session));
  ownerFromHash();
}
$('#oLogin').addEventListener('submit', async e => {
  e.preventDefault();
  if (!SRC.db) return;
  const email = $('#oEmail').value.trim(), password = $('#oPass').value;
  if (!email || !password) { $('#oLoginMsg').textContent = 'Escriba su correo y contraseña.'; return; }
  $('#oLoginMsg').textContent = 'Entrando…';
  const { error } = await SRC.db.auth.signInWithPassword({email, password});
  $('#oLoginMsg').textContent = error ? 'Correo o contraseña incorrectos.' : '';
  if (!error) $('#oPass').value = '';
});
$('#oLogout').addEventListener('click', async () => { if (SRC.db) await SRC.db.auth.signOut(); });

/* ---------- toast ---------- */
let toastT;
function toast(msg){ const t = $('#toast'); t.textContent = msg; t.setAttribute('data-show',''); clearTimeout(toastT); toastT = setTimeout(() => t.removeAttribute('data-show'), 2400); }

/* ---------- chatbot ---------- */
const chat = $('#chat'), fab = $('#fab'), msgs = $('#msgs'), chatIn = $('#chatIn');
let chatStarted = false;
function toggleChat(open){
  open = open ?? !chat.hasAttribute('data-open');
  chat.toggleAttribute('data-open', open);
  fab.setAttribute('aria-expanded', open);
  fab.setAttribute('aria-label', open ? 'Cerrar el asistente' : 'Abrir el asistente');
  if (open){
    if (!chatStarted){ chatStarted = true; bot('¡Hola! Soy el asistente de Sport 3. Los precios, el horario de atención y la ubicación los tiene arriba en la página; aquí le ayudo con sus dudas sobre la reserva.', {chips: MAIN_CHIPS, instant:true}); }
    setTimeout(() => chatIn.focus({preventScroll:true}), 60);
  }
}
fab.addEventListener('click', () => toggleChat());
document.addEventListener('keydown', e => { if (e.key === 'Escape' && chat.hasAttribute('data-open')) { toggleChat(false); fab.focus(); } });
chatIn.addEventListener('input', () => $('#chatSend').disabled = !chatIn.value.trim());
$('#chatForm').addEventListener('submit', e => {
  e.preventDefault(); const v = chatIn.value.trim(); if (!v) return;
  chatIn.value = ''; $('#chatSend').disabled = true; userSay(v);
});
msgs.addEventListener('click', e => {
  const c = e.target.closest('button.chip'); if (!c) return;
  if (c.dataset.book){ const [sp, dk, h, n] = c.dataset.book.split('|'); bookFromChat(sp, dk, +h, +n); return; }
  userSay(c.dataset.q || c.textContent);
});
const MAIN_CHIPS = ['¿Cómo pago?','¿Quedó confirmada mi reserva?','Cambiar mi horario','Cancelar mi reserva','Mi horario está lleno','Cumpleaños','Torneos'];
function addMsg(cls, html){
  const m = document.createElement('div'); m.className = 'm ' + cls; m.innerHTML = html; msgs.appendChild(m);
  enter(m, {y:6, dur:200}); msgs.scrollTop = msgs.scrollHeight; return m;
}
function addChips(list){
  const w = document.createElement('div'); w.className = 'acts';
  list.forEach(c => {
    let b;
    if (c.href){ b = document.createElement('a'); b.href = c.href; b.target = '_blank'; b.rel = 'noopener'; }
    else { b = document.createElement('button'); b.type = 'button'; }
    b.className = 'chip' + (c.solid ? ' solid' : '') + (c.wa ? ' wa' : '');
    if (typeof c === 'string'){ b.textContent = c; } else { b.textContent = c.label; if (c.book) b.dataset.book = c.book; if (c.q) b.dataset.q = c.q; }
    w.appendChild(b);
  });
  msgs.appendChild(w); enter(w, {y:6, dur:200, delay:60}); msgs.scrollTop = msgs.scrollHeight;
}
function userSay(text){ addMsg('me', esc(text)); setTimeout(() => answer(text), 120); }
function bot(html, {chips, instant} = {}){
  if (instant){ addMsg('bot', html); if (chips) addChips(chips); return; }
  const t = document.createElement('div'); t.className = 'm bot typing'; t.innerHTML = '<i></i><i></i><i></i>'; msgs.appendChild(t); msgs.scrollTop = msgs.scrollHeight;
  setTimeout(() => { t.remove(); addMsg('bot', html); if (chips) addChips(chips); }, 280 + Math.min(320, html.length * 1.5));
}
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[¿?¡!.,;]/g,' ').replace(/\s+/g,' ').trim();
const has = (t, ...ws) => ws.some(w => new RegExp('\\b' + w).test(t));
function parseSport(t){ if (has(t,'wally','voley','voli','volei','vole')) return 'wally'; if (has(t,'futbol','fut','fulbito','fubito','soccer')) return 'futbol'; return null; }
function parseHour(t){
  const m = t.match(/\b(?:a las|las|a la|desde las|tipo|como a las)\s*(\d{1,2})(?::(\d{2}))?/) || t.match(/\b(\d{1,2}):(\d{2})\b/) || t.match(/\b(\d{1,2})\s*(?:pm|hrs|horas|de la noche|de la tarde)\b/);
  if (!m) return null; let h = +m[1]; if (h <= 11) h += 12; return h;
}
function parseDay(t){
  const base = today(), plus = n => { const d = new Date(base); d.setDate(d.getDate()+n); return d; };
  if (has(t,'pasado manana')) return plus(2);
  if (/\bmanana\b/.test(t) && !/\b(en|por|de) la manana\b/.test(t)) return plus(1);
  if (has(t,'hoy','esta noche','esta tarde','ahorita')) return plus(0);
  for (let i=0;i<7;i++){ if (new RegExp('\\b' + DIAS_N[i]).test(t)) return plus((i - base.getDay() + 7) % 7); }
  const m = t.match(/\b(?:el|dia)\s+(\d{1,2})\b(?!\s*:)/) || t.match(/\b(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/);
  if (m){ const mi = m[2] ? MESES.indexOf(m[2]) : base.getMonth(); return new Date(base.getFullYear(), mi, +m[1]); }
  return null;
}
const dayName = d => { if (sameDay(d, today())) return 'hoy'; const t = new Date(today()); t.setDate(t.getDate()+1); return sameDay(d,t) ? 'mañana' : `el ${fmtShort(d)}`; };
const listH = hs => hs.length === 1 ? hs[0] : hs.slice(0,-1).join(', ') + ' y ' + hs[hs.length-1];
const freeHours = (d, s) => HOURS.filter(x => ['free','low'].includes(slotState(d, s, x).s)).map(hh);

function availability(t){
  if (SRC.mode === 'loading') return bot('Estoy cargando los horarios. Pregúnteme de nuevo en un momento.');
  const sp = parseSport(t), h = parseHour(t), d = parseDay(t) || today(), end = monthEnd();
  if (d < today()) return bot('Esa fecha ya pasó. ¿Qué otro día le interesa?');
  if (!inWindow(d)) return bot(`En la web se puede reservar desde hoy hasta el ${end.getDate()} de ${MESES[end.getMonth()]}. ¿Le busco un horario dentro de esas fechas?`);
  if (h !== null && (h < 15 || h > 21)) return bot('Atendemos de 15:00 a 22:00; el último turno empieza a las 21:00. ¿Le busco otro horario?');
  const sports = sp ? [sp] : ['futbol','wally'], chips = [], lines = [];
  sports.forEach(s => {
    const name = SPORT[s].toLowerCase();
    if (h !== null){
      const st = slotState(d, s, h);
      if (st.s === 'free' || st.s === 'low'){
        const p = price(s,h);
        lines.push(`${cap1(dayName(d))} a las ${hh(h)} hay ${name} disponible. Son Bs ${p} la hora; puede pagar con QR al reservar o en la cancha.`);
        chips.push({label: sports.length > 1 ? `Reservar ${SPORT[s]} ${hh(h)}` : 'Reservar este horario', book:`${s}|${key(d)}|${h}|1`, solid:true});
      } else {
        const alt = freeHours(d, s);
        lines.push(st.s === 'past' ? `Ese turno de hoy ya empezó.${alt.length ? ` Para ${name} quedan libres: ${listH(alt)}.` : ''}` :
          `${cap1(dayName(d))} a las ${hh(h)} ${name} está todo reservado.${alt.length ? ` Quedan libres: ${listH(alt)}.` : ' Ese día ya no quedan horarios libres.'}`);
        if (alt.length) chips.push({label:`Ver ${SPORT[s]} ${dayName(d)}`, book:`${s}|${key(d)}|0|0`});
      }
    } else {
      const free = freeHours(d, s);
      lines.push(free.length ? `${cap1(dayName(d))} hay ${name} libre a las ${listH(free)}.` : `${cap1(dayName(d))} ya no queda ${name} libre.`);
      if (free.length) chips.push({label:`Ver ${SPORT[s]} ${dayName(d)}`, book:`${s}|${key(d)}|0|0`});
    }
  });
  bot(lines.map(esc).join('<br><br>'), {chips: chips.length ? chips : null});
}
function bookFromChat(sp, dk, h, n){
  toggleChat(false);
  if (S.step !== 1) go(1);
  setSport(sp, {silent:true});
  S.date = fromKey(dk); renderDate();
  S.sel = n ? [HOURS.indexOf(h), HOURS.indexOf(h)] : null;
  keepSelIfValid(); renderSlots(true); renderSum();
  slotsEl.scrollIntoView({behavior: reduce.matches ? 'auto' : 'smooth', block:'center'});
  toast(n ? 'Horario elegido. Ahora elige la cancha.' : 'Estos son los horarios de ese día.');
}
function ownerChip(label, text){ return {label, href: waLink(text), wa:true}; }

// Topics come from the Sport 3 report: what customers struggle with (confirmation, changes, full slots, payment).
// Prices, opening hours and location are already on the page, so they are answered briefly, not offered as buttons.
function lastLine(){
  const r = S.last; if (!r) return '';
  return `Su última reserva enviada desde aquí: <b>${SPORT[r.sport].toLowerCase()}, ${fmtShort(fromKey(r.date))}, de ${hh(r.from)} a ${hh(r.to)}</b>.`;
}
function ownerAboutLast(intro){
  const r = S.last;
  return ownerChip('Escribir al dueño', r ? `${intro} Es la de ${SPORT[r.sport]}, ${fmtLong(fromKey(r.date))}, de ${hh(r.from)} a ${hh(r.to)}, a nombre de ${r.nombre}.` : intro);
}
function alternatives(){
  if (SRC.mode === 'loading') return bot('Estoy cargando los horarios. Pregúnteme de nuevo en un momento.');
  const s = S.sport, want = S.sel ? HOURS[S.sel[0]] : null, out = [];
  for (let i=0; i<7 && out.length < 5; i++){
    const d = new Date(S.date); d.setDate(d.getDate()+i); if (!inWindow(d)) break;
    let hs = HOURS.filter(x => ['free','low'].includes(slotState(d, s, x).s));
    if (want !== null) hs.sort((a,b) => Math.abs(a-want) - Math.abs(b-want));
    hs.slice(0, i === 0 ? 3 : 2).forEach(h => out.length < 5 && out.push({label:`${cap1(dayName(d))} ${hh(h)}`, book:`${s}|${key(d)}|${h}|1`}));
  }
  if (!out.length) return bot(`No encontré horarios libres de ${SPORT[s].toLowerCase()} en los próximos días dentro de este mes. Puede probar con ${s === 'futbol' ? 'wally' : 'fútbol 6'} o escribirle al dueño.`, {chips:[ownerChip('Escribir al dueño','Hola, busco un horario en Sport 3 y la web muestra todo ocupado.')]});
  bot(`Estos son los horarios de ${SPORT[s].toLowerCase()} libres más cercanos${want !== null ? ` a las ${hh(want)}` : ''}. Toque uno y queda elegido en el formulario.`, {chips: out});
}

const R = {
  precios: 'Cada hora muestra su precio en la lista de Horarios. Fútbol 6: Bs 120 hasta las 19:00 y Bs 150 desde las 19:00. Wally: Bs 60 la hora. Si su reserva cruza las 19:00, cada hora se cobra con su tarifa.',
  como: 'Elija el deporte, la fecha, una hora disponible y la cancha, y toque <b>Reservar esta cancha</b>. En el resumen deje su nombre y celular, elija cómo pagar y toque <b>Confirmar reserva</b>: su cancha queda apartada 2 horas y se abre WhatsApp con su reserva ya escrita. El dueño se la confirma por ese chat.',
  pago: 'Puede pagar de dos formas: <b>con QR al reservar</b> (envía la captura del comprobante en el chat de WhatsApp) o <b>al llegar</b>, en efectivo o QR, pensado para quien prefiere pagar en efectivo. En los dos casos la reserva queda firme cuando el dueño la confirma. Si paga al llegar y su equipo no llega dentro de los 15 minutos desde la hora reservada, la cancha se libera para otros clientes.',
  confirma: 'Al tocar <b>Confirmar reserva</b>, su cancha queda <b>apartada 2 horas</b> mientras el dueño la revisa. Queda <b>confirmada</b> cuando el dueño la confirma: le llega el aviso por WhatsApp, en el mismo chat donde envió la reserva. Si en 2 horas no se confirma, la cancha se libera.<br><br>Si no recibe respuesta, revise que el mensaje se haya enviado; si no, vuelva a enviarlo desde la pantalla final.',
  cambio: 'Para cambiar el horario, escríbale al dueño por WhatsApp, en el mismo chat donde envió la reserva, hasta las 12:00 del día del partido. Si hay espacio, se lo cambia; si pasa a la noche, se cobra con la tarifa de noche.',
  cancelar: 'Para cancelar, avísele al dueño por WhatsApp, en el mismo chat donde envió la reserva, hasta las 12:00 del día del partido. Así la cancha queda libre para otro equipo. Después de las 12:00 la reserva sigue en pie.',
  cumple: 'Para cumpleaños reservamos mínimo 3 horas seguidas, con los mismos precios. Como cerramos a las 22:00, el último inicio posible es a las 19:00. Fútbol de 19:00 a 22:00: Bs 450; wally 3 horas: Bs 180. Al reservar, marque <b>Es para un cumpleaños</b>.',
  clima: 'Si llueve se juega igual: las canchas de wally son techadas y las de fútbol no. Si hay granizo o tormenta, el dueño cancela la reserva y le avisa por WhatsApp.',
  tarde: 'Hay 15 minutos de tolerancia desde la hora reservada. Si eligió pagar al llegar y su equipo no llega en ese tiempo, la cancha se libera para otros clientes. Si ya pagó por QR, la cancha lo espera. El horario termina a la hora reservada.',
  ubic: 'Estamos en el barrio Miraflores, en Tarija. Al terminar su reserva le mostramos el mapa y el botón Cómo llegar.',
  horario: 'Atendemos todos los días de 15:00 a 22:00, en turnos de una hora; en la web se reserva hasta fin de mes. Las tardes de 15:00 a 18:00 y las noches de 19:00 a 22:00 se llenan rápido, sobre todo los fines de semana.',
  canchas: 'Tenemos 3 canchas de fútbol 6 de césped sintético, sin techo, para equipos de 5 o 6 jugadores, y 3 canchas de wally techadas, para equipos de hasta 5. Al reservar elige la cancha que prefiera.',
  servicios: 'No tengo ese dato confirmado. Para no darle información equivocada, pregúntele directamente al dueño.',
  bebidas: 'Las bebidas y otras consultas se atienden directamente en el complejo.',
  extra: 'La hora adicional se pide en la cancha, si la hora siguiente está libre. Ahí le indican el precio.',
  fijas: 'No hay reservas fijas: los equipos que juegan cada semana reservan aquí como cualquier cliente, para que nadie bloquee un horario que quizá no use.',
  redes: 'Encuentre a Sport 3 en Instagram como <b>@sport3_bo</b> y en Facebook como <b>sport3tarija</b>.',
  resena: '¡Gracias por jugar con nosotros! Su opinión en Google Maps ayuda a otros equipos a encontrarnos.',
  gracias: '¡Con gusto! Lo esperamos en Sport 3.',
  hola: '¡Hola! ¿En qué le puedo ayudar con su reserva?',
  fallback: 'No tengo esa información. Puede escribirle al dueño por WhatsApp, o elegir una de estas dudas frecuentes.'
};

function answer(raw){
  const t = norm(raw);
  if (has(t,'torneo','campeonato','liga')) return bot('¡Qué bueno! Los torneos los coordina directamente el dueño. Escríbale por WhatsApp y él le responde.', {chips:[ownerChip('Escribir al dueño', 'Hola, quiero organizar un torneo en Sport 3.')]});
  if (has(t,'varias canchas','dos canchas','las tres','tres canchas','2 canchas','3 canchas','todas las canchas')) return bot('Las reservas de varias canchas a la vez las coordina el dueño. Escríbale por WhatsApp.', {chips:[ownerChip('Escribir al dueño', 'Hola, quiero reservar varias canchas a la vez en Sport 3.')]});
  if (has(t,'descuento','rebaja','promo','precio especial','mas barato')) return bot('Los precios especiales los ve directamente el dueño. Escríbale por WhatsApp.', {chips:[ownerChip('Escribir al dueño', 'Hola, quería consultar por un precio especial en Sport 3.')]});
  if (has(t,'cancel','anular','no puedo ir','no vamos','no podemos ir')) return bot([R.cancelar, lastLine()].filter(Boolean).join('<br><br>'), {chips:[ownerAboutLast('Hola, quiero cancelar mi reserva en Sport 3.')]});
  if (has(t,'cambiar','cambio','reprogram','mover mi','pasar mi')) return bot([R.cambio, lastLine()].filter(Boolean).join('<br><br>'), {chips:[ownerAboutLast('Hola, quiero cambiar el horario de mi reserva en Sport 3.')]});
  if (has(t,'confirm','quedo','registr','llego mi','recibio','estado','respuesta','no me respond','no responde','firme','seguro')) return bot([R.confirma, lastLine()].filter(Boolean).join('<br><br>'), {chips: S.last ? [ownerAboutLast('Hola, quería confirmar mi reserva en Sport 3.')] : null});
  if (has(t,'lleno','esta lleno','no hay','otra opcion','otras opciones','alternativ','todo ocupado','todo reservado')) return alternatives();
  if (has(t,'pago','pagar','qr','efectivo','tarjeta','transferencia','anticipo','adelanto','comprobante')) return bot(R.pago);
  const wantsAvail = has(t,'libre','disponib','hay cancha','hay espacio','hay lugar','ocupad','puedo reservar','quiero reservar','reservar para','quiero la cancha','quiero cancha','hay turno','hay horario');
  const hasWhen = parseHour(t) !== null || parseDay(t) !== null;
  if (has(t,'cumple')) return bot(R.cumple, {chips:[{label:'Ver horarios libres', q:'que horarios hay libres hoy'}]});
  if (wantsAvail || (hasWhen && (parseSport(t) || has(t,'hay','cancha')))) return availability(t);
  if (has(t,'vestuario','ducha','bano','parqueo','estacionamiento','parking','pelota','pechera','iluminacion','seguridad','wifi','kiosko','kiosco')) return bot(R.servicios, {chips:[ownerChip('Preguntar al dueño', 'Hola, tengo una consulta sobre las instalaciones de Sport 3.')]});
  if (has(t,'jugadores','personas','cuantos juegan','equipo de')) return bot(R.canchas);
  if (has(t,'precio','cuanto','costo','cuesta','tarifa','vale','cobran')) return bot(R.precios);
  if (has(t,'lluvia','llueve','granizo','tormenta','clima')) return bot(R.clima);
  if (has(t,'tarde','retras','tolerancia')) return bot(R.tarde);
  if (has(t,'instagram','facebook','redes','tiktok')) return bot(R.redes, {chips:[{label:'Instagram', href:'https://www.instagram.com/sport3_bo/'}, {label:'Facebook', href:'https://www.facebook.com/sport3tarija'}]});
  if (has(t,'resena','opinion','calific','estrellas','comentario')) return bot(R.resena, {chips:[{label:'Dejar una reseña', href:`https://search.google.com/local/writereview?placeid=${MAP.place}`, solid:true}]});
  if (has(t,'como reserv','reservo','reservar','reserva')) return bot(R.como);
  if (has(t,'ubic','direccion','donde','como llego','mapa')) return bot(R.ubic, {chips:[{label:'Cómo llegar', href: MAP.dir, solid:true}]});
  if (has(t,'horario','abren','atienden','cierran','hasta que hora','a que hora')) return bot(R.horario);
  if (has(t,'cancha','cesped','techad','sintetic')) return bot(R.canchas);
  if (has(t,'bebida','gaseosa','agua','cerveza','comida','venden')) return bot(R.bebidas);
  if (has(t,'hora extra','hora adicional','mas tiempo','extender')) return bot(R.extra);
  if (has(t,'cada semana','fija','semanal','todos los')) return bot(R.fijas);
  if (has(t,'gracias','genial','perfecto','ok')) return bot(R.gracias);
  if (has(t,'hola','buenas','buen dia','buenos')) return bot(R.hola, {chips: MAIN_CHIPS});
  bot(R.fallback, {chips: [ownerChip('Escribir al dueño', 'Hola, tengo una consulta sobre Sport 3.'), ...MAIN_CHIPS]});
}

/* ---------- map ----------
   On the real site this shows Google's interactive map. Where embedding is blocked (this preview),
   the page keeps a drawn map with the pin and the Google Maps links. */
const MAP = {
  lat:-21.5482768, lng:-64.7324257, place:'ChIJJSby6u5HBpQRX_ms7SW84RM',
  get open(){ return `https://www.google.com/maps/search/?api=1&query=Sport3%20Tarija&query_place_id=${this.place}`; },
  get dir(){ return `https://www.google.com/maps/dir/?api=1&destination=${this.lat},${this.lng}&destination_place_id=${this.place}`; },
  get embed(){ return `https://www.google.com/maps?q=${this.lat},${this.lng}&z=16&hl=es&output=embed`; }
};
function drawQR(){
  if (QR_IMG){ const im = $('#qrImg'); im.src = QR_IMG; im.hidden = false; $('#qrCanvas').hidden = true; return; }
  const c = $('#qrCanvas'), x = c.getContext('2d'); let seed = 11; const rnd = () => (seed = (seed*16807) % 2147483647) / 2147483647;
  x.fillStyle = '#fff'; x.fillRect(0,0,29,29); x.fillStyle = '#1F1A15';
  for (let i=0;i<29;i++) for (let j=0;j<29;j++) if (rnd() > .5) x.fillRect(i,j,1,1);
  [[1,1],[21,1],[1,21]].forEach(([a,b]) => { x.fillStyle='#1F1A15'; x.fillRect(a,b,7,7); x.fillStyle='#fff'; x.fillRect(a+1,b+1,5,5); x.fillStyle='#1F1A15'; x.fillRect(a+2,b+2,3,3); });
}
function drawMap(){
  const c = $('#mapCanvas'), box = $('#map'); if (!c || !box.clientWidth) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1), W = box.clientWidth, H = box.clientHeight;
  c.width = W*dpr; c.height = H*dpr; const x = c.getContext('2d'); x.scale(dpr, dpr);
  x.fillStyle = '#EEE6D7'; x.fillRect(0,0,W,H);
  let seed = 7; const rnd = () => (seed = (seed*16807) % 2147483647) / 2147483647;
  x.save(); x.translate(W/2, H*.42); x.rotate(-0.21); x.translate(-W/2, -H*.42);
  // blocks
  for (let gx=-W; gx<W*2; gx+=58) for (let gy=-H; gy<H*2; gy+=46){
    x.fillStyle = rnd() < .12 ? '#D5E6C8' : (rnd() < .5 ? '#F6F0E6' : '#F2EADC');
    x.beginPath(); x.roundRect(gx+5, gy+5, 48, 36, 4); x.fill();
  }
  x.restore();
  // avenues
  x.lineCap = 'round';
  const road = (pts, w, col) => { x.strokeStyle = col; x.lineWidth = w; x.beginPath(); pts.forEach(([a,b],i) => i ? x.lineTo(a,b) : x.moveTo(a,b)); x.stroke(); };
  road([[-20,H*.78],[W*.45,H*.52],[W+20,H*.3]], 14, '#FFFFFF');
  road([[-20,H*.78],[W*.45,H*.52],[W+20,H*.3]], 8, '#F7D9AE');
  road([[W*.18,-20],[W*.3,H+20]], 9, '#FFFFFF');
  road([[W*.74,-20],[W*.66,H+20]], 9, '#FFFFFF');
  // the complex: a green field next to the pin
  x.save(); x.translate(W/2, H*.42+8); x.rotate(-0.21);
  x.fillStyle = '#8CC57A'; x.beginPath(); x.roundRect(-34,-4,68,40,6); x.fill();
  x.strokeStyle = 'rgba(255,255,255,.85)'; x.lineWidth = 1.5; x.strokeRect(-30,0,60,32); x.beginPath(); x.moveTo(0,0); x.lineTo(0,32); x.stroke();
  x.restore();
}
function initMap(){
  $('#mapOpen').href = MAP.open; $('#mapGo').href = MAP.dir;
  drawMap(); window.addEventListener('resize', drawMap);
  const box = $('#map');
  const f = document.createElement('iframe');
  f.title = 'Mapa de Sport 3 en Google Maps'; f.loading = 'lazy'; f.referrerPolicy = 'no-referrer-when-downgrade';
  let blocked = false;
  document.addEventListener('securitypolicyviolation', e => {
    if (/google/.test(e.blockedURI || '') || e.violatedDirective?.startsWith('frame-src') || e.violatedDirective?.startsWith('child-src')) { blocked = true; f.remove(); box.classList.remove('live'); }
  });
  f.addEventListener('load', () => { if (!blocked) setTimeout(() => { if (!blocked && f.isConnected){ f.classList.add('ready'); box.classList.add('live'); $('#mapOpen').hidden = true; } }, 400); });
  f.src = MAP.embed;
  box.insertBefore(f, $('#mapOpen'));
}


/* Formularios: se envían por script para que funcionen también en visores que bloquean el envío nativo (vista previa, apps) */
document.addEventListener('click', e => {
  const b = e.target.closest('button[type="submit"]'); if (!b || !b.form) return;
  e.preventDefault(); b.form.dispatchEvent(new Event('submit', {cancelable:true, bubbles:true}));
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing) return;
  const t = e.target; if (!(t instanceof HTMLInputElement) || !t.form || ['checkbox','radio','button','submit'].includes(t.type)) return;
  e.preventDefault(); t.form.dispatchEvent(new Event('submit', {cancelable:true, bubbles:true}));
});
/* ---------- boot ---------- */
renderDate(); renderSlots(false); renderSum();
initMap();
connect();
setInterval(() => { if (S.step === 1 && !document.hidden && SRC.mode !== 'loading') { keepSelIfValid(); renderSlots(false); renderSum(); } }, 60000);
})();
