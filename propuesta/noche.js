/* Propuesta v2: marca los turnos de noche, avisa dónde se encienden las luces
   y cuenta en la portada cuántos horarios quedan libres. Solo decora lo que ya dibuja app.js. */
(() => {
  const slots = document.getElementById('slots');
  const hero = document.getElementById('hoy');
  const FOCO = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="7" rx="1"/><path d="M9.7 3v7M14.3 3v7M5 6.5h14"/><path d="M12 10v11M8.5 21h7"/></svg>';
  let busy = false;
  function decorar(){
    if (busy) return; busy = true;
    const sport = (document.querySelector('.sp[aria-checked="true"] b')?.textContent.trim() || 'Fútbol 6').replace(/ /g, '\u00a0');
    let primeraNoche = null;
    slots.querySelectorAll('.slot').forEach(b => {
      const h = parseInt(b.querySelector('.t')?.textContent, 10);
      const noche = h >= 19;
      b.classList.toggle('noche', noche);
      if (noche && !primeraNoche) primeraNoche = b;
    });
    slots.querySelectorAll('.luces').forEach(n => n.remove());
    if (primeraNoche){
      const n = document.createElement('p'); n.className = 'luces';
      n.innerHTML = FOCO + (sport.startsWith('Wally')
        ? '<span>Desde las 19:00 se juega <b>con luces</b>.</span>'
        : '<span>Desde las 19:00 se juega <b>con luces</b>: la hora cuesta Bs 150.</span>');
      slots.insertBefore(n, primeraNoche);
    }
    const libres = slots.querySelectorAll('.slot:not(:disabled)').length;
    const dia = (document.getElementById('dateTag')?.textContent.trim() || '');
    const cuando = /hoy/i.test(dia) ? 'Hoy' : /mañana/i.test(dia) ? 'Mañana' : (document.getElementById('dateTxt')?.textContent.trim().replace(/,.*$/, '') || 'Ese día');
    if (hero) hero.innerHTML = libres
      ? `${cuando} quedan <b>${libres} ${libres === 1 ? 'horario libre' : 'horarios libres'}</b> de ${sport.toLowerCase()}.`
      : `${cuando} ya no quedan horarios de ${sport.toLowerCase()}. Prueba otro día.`;
    busy = false;
  }
  const propio = n => n.nodeType === 1 && n.classList.contains('luces');
  new MutationObserver(recs => {
    // no reaccionar a los avisos que inserta este mismo script
    if (recs.every(r => r.type === 'childList' && [...r.addedNodes, ...r.removedNodes].every(propio))) return;
    decorar();
  }).observe(slots, {childList:true, subtree:true, attributes:true, attributeFilter:['disabled']});
  new MutationObserver(decorar).observe(document.getElementById('dateTxt'), {childList:true, characterData:true, subtree:true});
  decorar();
})();
