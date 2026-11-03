/* Datos del negocio y de la base de datos.
   Es el único archivo que hay que tocar para cambiar horario, canchas, QR o claves. */
window.SPORT3 = {
  /* Supabase · Project Settings → API. Solo la URL y la clave publishable (sb_publishable_…).
     NUNCA poner aquí la clave secret (sb_secret_…) ni la service_role.
     Si quedan vacías, la página funciona en modo demostración con horarios de ejemplo. */
  supabaseUrl: 'https://eqrobfzvkmtlsuapxajv.supabase.co',
  supabaseKey: 'sb_publishable_dtreP_da977x-c5ElRPp7g_i4_2nRXH',

  /* WhatsApp del dueño (8 dígitos, sin +591). Se usa si no hay otro guardado en la pantalla del dueño. */
  telefono: '57905773',

  /* Turnos: hora de inicio de cada uno (el último, 21 → termina a las 22:00) */
  horas: [15, 16, 17, 18, 19, 20, 21],

  /* Nombre y ubicación de cada cancha (CONFIRMAR CON EL DUEÑO) */
  canchas: {
    futbol: [{n: 'Cancha A', d: 'Junto a la entrada'}, {n: 'Cancha B', d: 'Al centro'}, {n: 'Cancha C', d: 'Al fondo'}],
    wally:  [{n: 'Cancha A', d: 'Junto a la entrada'}, {n: 'Cancha B', d: 'Al centro'}, {n: 'Cancha C', d: 'Al fondo'}]
  },

  /* QR de cobro del dueño: ruta de la imagen, por ejemplo 'img/qr.png'. Vacío = QR de ejemplo. */
  qr: ''
};
