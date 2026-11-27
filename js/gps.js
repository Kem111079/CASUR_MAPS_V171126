/* CASUR Maps · GPS, detección de lote, visita/recorrido unificados, lista del día, pantalla encendida y mapas sin señal. */
'use strict';
const PERFILES = {
  preciso: {txt: 'Punto fijo', radio: 25, autoAcc: 10, empate: 8, estables: 2, rapido: 2.5},
  campo: {txt: 'Caminando', radio: 50, autoAcc: 22, empate: 12, estables: 3, rapido: 4.0},
  vehiculo: {txt: 'Vehículo', radio: 75, autoAcc: 30, empate: 18, estables: 3, rapido: 5.5}
};
const FIJADO_KEY = 'casur_maps_fijado_v2', LISTA_KEY = 'casur_maps_lista_v2', LISTA_FECHA_KEY = 'casur_maps_lista_fecha_v2', AVISO_UBIC_KEY = 'casur_maps_aviso_ubicacion_v1';
/* bloqueado: el navegador negó la ubicación · inicioT: cuándo se pidió el GPS · utilT: última lectura útil (±40 m)
   fueraN / salio / descartado: salida del lote que abrió el GPS y tarjeta que el usuario cerró a mano. */
const GPS = {watch: null, fix: null, siguiendo: true, lote: '', autoSel: '', cands: [], fijado: leerLS(FIJADO_KEY, ''), marcador: null, circulo: null, rumbo: null, candKey: '', candN: 0, estado: 'apagado', detalle: '',
  bloqueado: false, inicioT: 0, utilT: 0, fueraN: 0, salio: '', descartado: ''};
/* Límites de una lectura válida para la visita: más rápido o más impreciso que esto es un salto del GPS. */
const VEL_MAX = 120 / 3.6, ACC_MAX = 40;
let tileErrores = 0, capaRuta = null, rutaLinea = null;

function gpsIcono() {
  const h = Number.isFinite(GPS.rumbo) ? GPS.rumbo : null;
  // El icono vive dentro del mapa girado: su giro es el rumbo real y la pantalla lo muestra relativo al mapa.
  return L.divIcon({className: 'gps-ico', html: `<div class="gps-flecha${h === null ? ' sin-rumbo' : ''}" style="transform:rotate(${h || 0}deg)"><span></span></div>`, iconSize: [36, 36], iconAnchor: [18, 18]});
}
function gpsBoton() {
  if (GPS.watch === null) return iniciarGps();
  if (GPS.fix) { GPS.siguiendo = true; panorama = null; pintarPanorama(); map.setView([GPS.fix.lat, GPS.fix.lng], Math.max(map.getZoom(), 17)); GPS.centro = {lat: GPS.fix.lat, lng: GPS.fix.lng}; orientar(true); pintarGpsBtn(); }
}
/* Rumbo arriba: con seguimiento activo el mapa gira para que el sentido de avance quede hacia arriba. */
/* Giro del mapa (rumbo arriba). El mapa solo gira con avance real y sostenido, usando el rumbo del tramo
   recorrido y no el de cada lectura, que a baja velocidad es ruidoso. La flecha azul sí muestra el rumbo al instante. */
const GIRO = {
  suave: {vMin: 1.7, base: 13, banda: 12, cada: 2000, accMax: 20, dur: '1s', centrar: 4},
  normal: {vMin: 0.8, base: 5, banda: 5, cada: 900, accMax: 35, dur: '.6s', centrar: 0}
};
const giroCfg = () => VUELO.on ? GIRO_VUELO : GIRO[S.giro] || GIRO.suave;
function aplicarGiroCss() { $('map').style.setProperty('--giro-dur', giroCfg().dur); }
function orientar(forzar = false) {
  if (S.giro === 'sin' || GPS.watch === null) { girarMapa(0); return; }
  if (!GPS.siguiendo || !Number.isFinite(GPS.curso)) return;
  const G = giroCfg(), ahora = Date.now(), dif = Math.abs((((-GPS.curso) - mapRot + 540) % 360) - 180);
  if (!forzar && (GPS.movN < 2 || dif < G.banda || ahora - (GPS.giroT || 0) < G.cada)) return;
  GPS.giroT = ahora; girarMapa(-GPS.curso);
}
function rumboEntre(a, b) {
  const r = Math.PI / 180, y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r), x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}
function alternarOrientacion() {
  if (S.giro === 'sin') S.giro = S.giroPrev || 'suave'; else { S.giroPrev = S.giro; S.giro = 'sin'; }
  S.orientacion = S.giro === 'sin' ? 'norte' : 'rumbo'; guardarAjustes(); aplicarGiroCss(); orientar(true); pintarBrujula();
  toast(S.orientacion === 'rumbo' ? 'Rumbo arriba: el mapa gira según su avance.' : 'Norte arriba: el mapa no gira.');
}
function pintarBrujula() {
  const b = $('btnBrujula'); if (!b) return;
  b.classList.toggle('rumbo', S.orientacion === 'rumbo');
  b.querySelector('svg').style.transform = `rotate(${mapRot.toFixed(1)}deg)`;
  b.setAttribute('aria-label', S.orientacion === 'rumbo' ? 'Rumbo arriba activo. Tocar para norte arriba' : 'Norte arriba activo. Tocar para rumbo arriba');
}
function iniciarGps(seguir = true, auto = false) {
  if (!navigator.geolocation) { toast('Este navegador no tiene GPS.', {tipo: 'mal'}); return; }
  if (GPS.watch !== null) return;
  GPS.siguiendo = seguir; GPS.estado = 'buscando'; GPS.detalle = 'Buscando señal GPS…'; GPS.inicioT = Date.now(); pintarGpsChip(); pintarGpsBtn();
  GPS.watch = navigator.geolocation.watchPosition(alPosicion, e => {
    GPS.estado = 'error'; GPS.detalle = e.code === 1 ? 'Permiso de ubicación denegado' : 'GPS sin señal'; pintarGpsChip();
    if (e.code === 1) { GPS.bloqueado = true; const sinVisita = descartarVisitaNueva(); detenerGps(); ubicacionBloqueada(auto, sinVisita); }
  }, {enableHighAccuracy: true, maximumAge: 1000, timeout: 20000});
  revisarGpsVisita(); if (VISITA) pintarProgreso(); // el chip de la visita deja de decir «GPS apagado»
}
function detenerGps() {
  if (GPS.watch !== null) navigator.geolocation.clearWatch(GPS.watch);
  GPS.watch = null; GPS.fix = null; GPS.ancla = null; GPS.curso = null; GPS.movN = 0; GPS.centro = null; GPS.lote = ''; GPS.cands = []; GPS.estado = 'apagado'; GPS.fueraN = 0;
  if (GPS.marcador) { GPS.marcador.remove(); GPS.circulo.remove(); GPS.marcador = GPS.circulo = null; }
  girarMapa(0); pintarGpsChip(); pintarGpsBtn(); revisarGpsVisita();
}
/* «Detener GPS» desde la hoja del GPS: con una visita en curso, pide confirmar porque la visita deja de grabar. */
async function pedirDetenerGps() {
  if (VISITA && !await preguntar('¿Detener el GPS?', 'La visita en curso dejará de grabar la ruta, la distancia y los lotes hasta que vuelva a activar el GPS.', 'Detener GPS', 'Seguir grabando')) return;
  detenerGps();
}
async function permisoUbicacion() {
  try { return (await navigator.permissions.query({name: 'geolocation'})).state; } catch (_) { return ''; }
}

/* ── Ubicación bloqueada por el navegador ──
   Al tocar GPS o al iniciar una visita se abren los pasos para activarla. Al abrir la app (GPS automático) se avisa
   una sola vez; después, el botón GPS queda tachado y al tocarlo se ven los mismos pasos. */
let _visitaNueva = '', _reintento = false;
/* Una visita recién iniciada que nunca tuvo GPS no se guarda: sin ubicación no hay ruta ni lotes visitados. */
function descartarVisitaNueva() {
  if (!VISITA || VISITA.id !== _visitaNueva || VISITA.pts.length) return false;
  VISITA = null; _visitaNueva = ''; kvSet('visita_activa', null); soltarPantalla(); dibujarRuta(null); pintarProgreso();
  if (document.body.dataset.tab === 'visita') renderVisita();
  return true;
}
function ubicacionBloqueada(auto, sinVisita = false) {
  let motivo = '';
  if (sinVisita) motivo = 'La visita no se inició: hace falta la ubicación para grabar la ruta y los lotes visitados.';
  else if (_reintento) motivo = 'La ubicación sigue bloqueada. Revise los pasos y vuelva a intentarlo.';
  _reintento = false; pintarGpsBtn();
  if (!auto || motivo) { abrirAyudaUbicacion(motivo); return; }
  if (leerLS(AVISO_UBIC_KEY, false)) return;
  escribirLS(AVISO_UBIC_KEY, true);
  toast('Ubicación bloqueada: el GPS y las visitas no funcionan.', {tipo: 'mal', fijo: true, clave: 'ubicacion', accion: 'Cómo activarla', alAccion: () => abrirAyudaUbicacion()});
}
function abrirAyudaUbicacion(motivo = '') {
  quitarAviso('ubicacion');
  abrirHoja('Activar la ubicación', `
    ${motivo ? `<div class="nota est-mal">${esc(motivo)}</div>` : ''}
    <p class="pie">El navegador no le da la ubicación a CASUR Maps. Actívela así y luego toque <b>Reintentar</b>.</p>
    <h4>Android (Chrome)</h4>
    <ol class="pasos">
      <li>Toque el icono a la izquierda de la dirección (candado o ajustes) › <b>Permisos</b> › <b>Ubicación</b> › <b>Permitir</b>.</li>
      <li>Si abre CASUR Maps desde el icono instalado: en Chrome, <b>⋮</b> › <b>Configuración</b> › <b>Configuración de sitios</b> › <b>Ubicación</b>, y quite CASUR Maps de «Bloqueados».</li>
      <li>Revise que la ubicación del teléfono esté encendida en el panel de accesos rápidos.</li>
    </ol>
    <h4>iPhone (Safari)</h4>
    <ol class="pasos">
      <li><b>Ajustes</b> › <b>Privacidad y seguridad</b> › <b>Localización</b>: encendida, y <b>Sitios web de Safari</b> en «Al usar la app».</li>
      <li>En Safari, toque <b>aA</b> junto a la dirección › <b>Configuración del sitio web</b> › <b>Ubicación</b> › <b>Permitir</b>.</li>
    </ol>
    <div class="acciones"><button type="button" class="btn pri" onclick="cerrarHoja();reintentarUbicacion()">${ico('pin')} Reintentar</button><button type="button" class="btn ter" onclick="cerrarHoja()">Ahora no</button></div>`);
}
function reintentarUbicacion() { _reintento = true; quitarAviso('ubicacion'); if (GPS.watch === null) iniciarGps(); }
function quitarAviso(clave) { const box = $('toasts'), t = box && [...box.children].find(x => x.dataset.clave === clave); if (t) t.remove(); }
// Si el usuario permite la ubicación desde los ajustes del navegador, el GPS vuelve solo (con visita en curso o GPS automático).
try {
  navigator.permissions.query({name: 'geolocation'}).then(p => {
    p.addEventListener('change', () => {
      if (p.state !== 'granted' || !GPS.bloqueado) return;
      GPS.bloqueado = false; quitarAviso('ubicacion'); pintarGpsBtn();
      if (GPS.watch === null && (VISITA || S.gpsAuto)) iniciarGps(true, true);
    });
  }).catch(() => {});
} catch (_) {}
function alPosicion(pos) {
  const c = pos.coords, lat = c.latitude, lng = c.longitude, acc = Math.round(c.accuracy || 0), t = pos.timestamp || Date.now(), prev = GPS.fix;
  let v = Number.isFinite(c.speed) && c.speed !== null ? c.speed : null;
  // Sin velocidad del equipo se estima con la lectura anterior, solo si ambas son precisas; un salto no se muestra como velocidad.
  if (v === null && prev && acc <= ACC_MAX && prev.acc <= ACC_MAX) v = haversineM(prev.lng, prev.lat, lng, lat) / Math.max((t - prev.t) / 1000, 0.5);
  const vCruda = v !== null && v <= VEL_MAX_VUELO ? v : null; // para detectar un vuelo aunque en tierra se descarte como salto
  if (v !== null && v > (VUELO.on ? VEL_MAX_VUELO : VEL_MAX)) v = null;
  if (acc <= ACC_MAX) GPS.utilT = Date.now();
  GPS.bloqueado = false;
  let h = Number.isFinite(c.heading) && c.heading !== null && c.heading >= 0 ? c.heading : null;
  if (h === null && prev && haversineM(prev.lng, prev.lat, lng, lat) >= 3) {
    const r = Math.PI / 180, y = Math.sin((lng - prev.lng) * r) * Math.cos(lat * r), x = Math.cos(prev.lat * r) * Math.sin(lat * r) - Math.sin(prev.lat * r) * Math.cos(lat * r) * Math.cos((lng - prev.lng) * r);
    h = (Math.atan2(y, x) / r + 360) % 360;
  }
  if (h !== null) { const d = Number.isFinite(GPS.rumbo) ? ((h - GPS.rumbo + 540) % 360) - 180 : 0; GPS.rumbo = Number.isFinite(GPS.rumbo) ? (Math.abs(d) < 3 ? GPS.rumbo : (GPS.rumbo + d * .3 + 360) % 360) : h; }
  const primera = !GPS.fix, G = giroCfg(), aqui = {lat, lng};
  GPS.fix = {lat, lng, acc, v, t, reloj: Date.now()};
  // Rumbo estable para el mapa: se recalcula cada vez que se avanza la distancia base con buena precisión.
  GPS.movN = v !== null && v >= G.vMin ? (GPS.movN || 0) + 1 : 0;
  if (acc <= G.accMax) {
    if (!GPS.ancla) GPS.ancla = aqui;
    else if (haversineM(GPS.ancla.lng, GPS.ancla.lat, lng, lat) >= G.base) { GPS.curso = rumboEntre(GPS.ancla, aqui); GPS.ancla = aqui; }
  }
  if (!GPS.marcador) {
    GPS.circulo = L.circle([lat, lng], {radius: acc, color: '#0a66ff', weight: 1, fillOpacity: .08, interactive: false}).addTo(map);
    GPS.marcador = L.marker([lat, lng], {icon: gpsIcono(), interactive: false, zIndexOffset: 1000}).addTo(map);
  } else { GPS.marcador.setLatLng([lat, lng]); GPS.marcador.setIcon(gpsIcono()); GPS.circulo.setLatLng([lat, lng]); GPS.circulo.setRadius(acc); }
  // Solo la primera lectura acerca el mapa; después se respeta el zoom elegido (por ejemplo, la vista de alrededores).
  // El mapa se recentra solo al avanzar unos metros, con desplazamiento suave: quieto, no tiembla con el ruido del GPS.
  vueloLectura(c, vCruda);
  if (VUELO.on) { if (GPS.siguiendo) vueloSeguir(lat, lng, v, primera); orientar(); vueloLote(lng, lat); pintarVueloHud(); pintarGpsChip(); pintarGpsBtn(); return; }
  if (GPS.siguiendo) {
    if (primera) { map.setView([lat, lng], Math.max(map.getZoom(), 17)); GPS.centro = aqui; }
    else if (!GPS.centro || haversineM(GPS.centro.lng, GPS.centro.lat, lng, lat) >= G.centrar) { map.panTo([lat, lng], {animate: true, duration: .9, easeLinearity: .6}); GPS.centro = aqui; }
  }
  orientar();
  const cands = detectarLote();
  revisarSalidaLote(cands);
  visitaPunto(cands);
  if (typeof revisarDestino === 'function') revisarDestino(); // el lote elegido a mano en la Bitácora caduca al entrar a otro lote
  pintarGpsChip(); pintarGpsBtn(); revisarGpsVisita();
}

/* Devuelve los lotes cercanos (uno por código). Confirma el lote solo con precisión suficiente y lecturas estables. */
function detectarLote() {
  const P = PERFILES[S.gpsPerfil] || PERFILES.vehiculo, {lat, lng, acc, v} = GPS.fix;
  const porLote = new Map();
  cercanos(lng, lat, Math.max(P.radio, Math.min(120, acc + P.empate))).forEach(c => { const x = porLote.get(c.cod); if (!x || c.d < x.d) porLote.set(c.cod, c); });
  const cands = [...porLote.values()].sort((a, b) => a.d - b.d), dentro = cands.filter(c => c.inside), rapido = v !== null && v > P.rapido;
  GPS.cands = cands.slice(0, 6);
  if (dentro.length === 1) {
    const c = dentro[0], otros = cands.filter(o => o.cod !== c.cod && o.d <= Math.max(P.empate, Math.min(45, acc + 3)));
    if (acc <= P.autoAcc && !rapido && !otros.length) {
      if (c.cod === GPS.candKey) GPS.candN++; else { GPS.candKey = c.cod; GPS.candN = 1; }
      if (GPS.candN >= P.estables) { GPS.estado = 'dentro'; GPS.detalle = `En lote ${c.cod}`; confirmarLoteGps(c); }
      else { GPS.estado = 'confirmando'; GPS.detalle = `Confirmando ${c.cod}…`; }
    } else { GPS.candKey = ''; GPS.candN = 0; GPS.estado = 'probable'; GPS.detalle = `Probable ${c.cod}` + (rapido ? ' · en movimiento' : otros.length ? ' · borde' : ''); }
  } else {
    GPS.candKey = ''; GPS.candN = 0;
    if (dentro.length > 1 || cands.length > 1 && cands[1].d <= cands[0].d + P.empate) { GPS.estado = 'varios'; GPS.detalle = `${Math.min(cands.length, 6)} lotes cerca · elija`; }
    else if (cands.length) { GPS.estado = 'cerca'; GPS.detalle = `A ${Math.round(cands[0].d)} m de ${cands[0].cod}`; }
    else { GPS.estado = 'fuera'; GPS.detalle = 'Fuera de lotes'; }
  }
  return cands;
}
function confirmarLoteGps(c) {
  if (GPS.lote !== c.cod) { GPS.lote = c.cod; if (GPS.descartado !== c.cod) GPS.descartado = ''; vibrar(70); }
  if (GPS.fijado && GPS.fijado !== c.cod) { GPS.detalle = `Fijado ${GPS.fijado} · GPS en ${c.cod}`; return; }
  // No pisa una selección manual: solo actualiza la tarjeta si está vacía o si la puso el GPS.
  // Si el usuario cerró la tarjeta de este lote, no se vuelve a abrir hasta que entre a otro.
  if ((!selCod || selCod === GPS.autoSel) && selCod !== c.cod && GPS.descartado !== c.cod && document.body.dataset.tab === 'mapa' && !medir.modo && !$('hoja').classList.contains('abierta')) {
    GPS.autoSel = c.cod; GPS.salio = ''; seleccionarLote(c.cod, {gps: true, feat: c.f, full: false});
  }
}
/* Salida del lote: tras 3 lecturas precisas fuera del lote del GPS, ese lote deja de ser «el lote donde está».
   Si la tarjeta la abrió el GPS, se cierra; si el usuario la amplió para leerla (o está en otra pantalla), se queda
   con el aviso «Ya no está en este lote». Una selección manual o un lote fijado no se tocan. */
function revisarSalidaLote(cands) {
  const cod = GPS.lote || GPS.autoSel;
  if (!cod || GPS.fix.acc > ACC_MAX) return;
  if (cands.some(c => c.inside && c.cod === cod)) {
    GPS.fueraN = 0;
    if (GPS.salio === cod) { GPS.salio = ''; if (selCod === cod) renderCard(); }
    return;
  }
  if (++GPS.fueraN < 3 || GPS.estado === 'confirmando') return; // entrando a otro lote: esa tarjeta reemplazará a esta
  GPS.fueraN = 0; GPS.descartado = '';
  if (GPS.lote === cod) GPS.lote = '';
  if (!selCod || selCod !== GPS.autoSel || selCod !== cod) { if (selCod !== GPS.autoSel) GPS.autoSel = ''; return; }
  if (GPS.fijado === cod || GPS.salio === cod) return;
  if (cardFull || document.body.dataset.tab !== 'mapa' || medir.modo || $('hoja').classList.contains('abierta')) { GPS.salio = cod; renderCard(); return; }
  cerrarCard(); GPS.autoSel = ''; GPS.descartado = '';
}
function fijarLote(cod) {
  GPS.fijado = GPS.fijado === cod ? '' : cod; escribirLS(FIJADO_KEY, GPS.fijado);
  toast(GPS.fijado ? `Lote ${cod} fijado: el GPS no cambiará la tarjeta.` : 'Lote liberado.'); renderCard(); pintarGpsChip();
}
function pintarGpsBtn() {
  const b = $('btnGps'); if (!b) return;
  const bloq = GPS.watch === null && GPS.bloqueado;
  b.className = 'fab ' + (GPS.watch === null ? 'apagado' : GPS.siguiendo ? 'siguiendo' : 'activo') + (bloq ? ' bloqueado' : '');
  b.setAttribute('aria-label', bloq ? 'Ubicación bloqueada. Tocar para ver cómo activarla' : GPS.watch === null ? 'Activar GPS' : 'Centrar en mi posición');
}
function pintarGpsChip() {
  const el = $('chipGps'); if (!el) return;
  if (GPS.estado === 'apagado') { el.hidden = true; return; }
  el.hidden = false;
  const cls = {dentro: 'bien', confirmando: 'medio', probable: 'medio', varios: 'medio', cerca: 'neutro', fuera: 'neutro', error: 'mal', buscando: 'neutro'}[GPS.estado] || 'neutro';
  el.className = 'chip-gps est-' + cls;
  el.innerHTML = `<b>${esc(GPS.detalle)}</b>` + (GPS.fix ? `<small>±${GPS.fix.acc} m${GPS.fix.v !== null && GPS.fix.v > .8 ? ' · ' + (GPS.fix.v * 3.6).toFixed(0) + ' km/h' : ''}</small>` : '');
}
function abrirGps() {
  const f = GPS.fix, P = PERFILES[S.gpsPerfil] || PERFILES.vehiculo;
  const lista = GPS.cands.length ? GPS.cands.map(c => `<button type="button" onclick="cerrarHoja();GPS.autoSel='${esc(c.cod)}';seleccionarLote('${esc(c.cod)}',{gps:true})"><b>${esc(c.cod)}</b><span>${esc((LOTES[c.cod] || {}).hac || '')}</span><i class="chip ${c.inside ? 'est-bien' : 'est-neutro'}">${c.inside ? 'dentro' : Math.round(c.d) + ' m'}</i></button>`).join('') : '<p class="vacio">Sin lotes en el radio de búsqueda.</p>';
  abrirHoja('GPS', `
    <div class="cifras c4">${cifra('Precisión', f ? '±' + f.acc + ' m' : '—')}${cifra('Velocidad', f && f.v !== null ? (f.v * 3.6).toFixed(0) + ' km/h' : '—')}${cifra('Rumbo', Number.isFinite(GPS.rumbo) ? Math.round(GPS.rumbo) + '°' : '—')}${cifra('Perfil', P.txt)}</div>
    ${f && f.acc > 30 ? '<div class="nota est-medio">Precisión baja: elija el lote de la lista o fíjelo desde la tarjeta.</div>' : ''}
    <h4>Lotes cercanos</h4><div class="lista-lotes">${lista}</div>
    <div class="acciones"><button type="button" class="btn ter" onclick="cerrarHoja();pedirDetenerGps()">${ico('stop')} Detener GPS</button>${GPS.fijado ? `<button type="button" class="btn sec" onclick="fijarLote(GPS.fijado);cerrarHoja()">${ico('unlock')} Liberar ${esc(GPS.fijado)}</button>` : ''}</div>`);
}

/* ── Visita de campo (une "visita" y "recorrido"): ruta, distancia y lotes realmente pisados ── */
let VISITA = null, VISITAS = [];
async function cargarVisitas() {
  VISITAS = await kvGet('visitas', null);
  if (!VISITAS) { // migra una sola vez las visitas guardadas por versiones anteriores
    VISITAS = leerLS('casur_maps_visitas_v10', []).map(v => ({id: v.id, inicio: v.start, fin: v.end, dist: v.distance_m || 0,
      pts: (v.points || []).map(p => ({t: p.t, lat: p.lat, lng: p.lng, acc: p.acc, cod: p.codlote || ''})),
      lotes: Object.fromEntries(Object.keys(v.lots || {}).map(c => [c, {seg: 0, cerca: 0, visitado: true}]))}));
    await kvSet('visitas', VISITAS);
  }
  VISITA = await kvGet('visita_activa', null);
  pintarProgreso();
  // La visita guardada se reanuda con el GPS encendido (iniciar() lo activa aunque el GPS automático esté apagado).
  if (VISITA) { dibujarRuta(VISITA); pedirPantalla(); toast('Visita en curso: se sigue grabando.', {accion: 'Ver', alAccion: () => mostrarTab('visita')}); }
}
/* La visita exige GPS: con la ubicación bloqueada no se crea y se muestran los pasos para activarla. */
async function iniciarVisita() {
  if (VISITA) return;
  if (!navigator.geolocation) { toast('Este navegador no tiene GPS: no se puede grabar la visita.', {tipo: 'mal'}); return; }
  if (await permisoUbicacion() === 'denied') { GPS.bloqueado = true; pintarGpsBtn(); abrirAyudaUbicacion('Para iniciar la visita hace falta la ubicación: con ella se graban la ruta y los lotes visitados.'); return; }
  if (VISITA) return;
  const reinicio = listaNuevoDia();
  VISITA = {id: 'VIS-' + Date.now(), inicio: new Date().toISOString(), fin: null, pts: [], lotes: {}, dist: 0, tecnico: S.tecnico || ''};
  _visitaNueva = VISITA.id; _salto = null; _guardadoT = Date.now();
  // Con el GPS ya encendido y una lectura reciente y precisa, esa lectura es el primer punto de la visita
  // (quieto, algunos equipos no vuelven a enviar lecturas) y la cuenta de 30 s sin señal empieza ahora.
  if (GPS.watch !== null) { GPS.inicioT = Date.now(); const f = GPS.fix; if (f && Date.now() - (f.reloj || 0) < 10000 && f.acc <= ACC_MAX) { GPS.utilT = Date.now(); visitaPunto(GPS.cands); } }
  kvSet('visita_activa', VISITA); iniciarGps(); pedirPantalla(); dibujarRuta(VISITA); renderVisita(); pintarProgreso(); confirmar('Visita iniciada');
  if (reinicio) toast(`Lista del día reiniciada: ${LISTA.length} lote${LISTA.length === 1 ? '' : 's'} por visitar.`);
}
/* Finalizar pide confirmar con el resumen; después queda unos segundos «Deshacer» para seguir grabando la misma visita. */
async function pedirFinalizarVisita() {
  if (!VISITA) return;
  const v = VISITA, total = LISTA.length, hechos = LISTA.filter(x => x.hecho).length, n = lotesVisitados(v).length;
  const res = `${total ? `${hechos} de ${total} lotes de la lista` : `${n} lote${n === 1 ? '' : 's'} visitado${n === 1 ? '' : 's'}`} · ${fmtDur(Date.now() - new Date(v.inicio))} · ${fmtDist(v.dist)}.`;
  if (!await preguntar('¿Finalizar la visita?', res + ' Se dejará de grabar la ruta.', 'Finalizar', 'Seguir grabando')) return;
  if (VISITA === v) finalizarVisita();
}
async function finalizarVisita() {
  if (!VISITA) return;
  VISITA.fin = new Date().toISOString(); VISITA.plan = LISTA.map(x => ({cod: x.cod, hecho: !!x.hecho})); VISITAS.push(VISITA);
  await kvSet('visitas', VISITAS); await kvSet('visita_activa', null);
  const v = VISITA; VISITA = null; _visitaNueva = ''; pintarProgreso(); revisarGpsVisita(); soltarPantalla(); dibujarRuta(null); renderVisita(); if (selCod) renderCard();
  cierreVisita(v);
  toast('Visita finalizada.', {tipo: 'bien', accion: 'Deshacer', ms: 8000, alAccion: () => reanudarVisita(v.id)});
}
async function reanudarVisita(id) {
  const v = VISITAS.find(x => x.id === id); if (VISITA || !v) return;
  VISITAS = VISITAS.filter(x => x !== v); v.fin = null; delete v.plan; VISITA = v; _salto = null; _guardadoT = Date.now();
  await kvSet('visitas', VISITAS); await kvSet('visita_activa', VISITA);
  if ($('hoja').classList.contains('abierta') && $('hojaTitulo').textContent === 'Visita finalizada') cerrarHoja();
  iniciarGps(); pedirPantalla(); dibujarRuta(VISITA); pintarProgreso(); revisarGpsVisita(); if (document.body.dataset.tab === 'visita') renderVisita(); if (selCod) renderCard();
  toast('Visita reanudada: se sigue grabando.', {tipo: 'bien'});
}
const lotesVisitados = v => Object.keys(v.lotes || {}).filter(c => v.lotes[c].visitado);
/* Filtro de saltos: una lectura con precisión peor de 40 m, o que implique más de 120 km/h desde el último punto,
   no suma distancia, ni tiempo en lotes, ni entra en la ruta. Si 3 lecturas seguidas coinciden en la nueva posición
   (el punto malo era el anterior, o se recuperó la señal lejos), la ruta sigue desde ahí con un corte, sin sumar el tramo. */
let _salto = null, _guardadoT = 0;
const velEntre = (a, b) => haversineM(a.lng, a.lat, b.lng, b.lat) / Math.max((b.ms - a.ms) / 1000, 1);
function visitaPunto(cands) {
  if (!VISITA) return;
  const f = GPS.fix, ult = VISITA.pts[VISITA.pts.length - 1], dt = ult ? (f.t - ult.ms) / 1000 : 3;
  if (ult && dt < 3) return;
  if (f.acc > ACC_MAX) { VISITA.descartados = (VISITA.descartados || 0) + 1; return; }
  const aqui = {lat: f.lat, lng: f.lng, ms: f.t};
  let corte = false;
  if (ult) {
    if (velEntre(ult, aqui) > VEL_MAX) {
      _salto = _salto && velEntre(_salto, aqui) <= VEL_MAX ? Object.assign(aqui, {n: _salto.n + 1}) : Object.assign(aqui, {n: 1});
      VISITA.saltos = (VISITA.saltos || 0) + 1;
      if (_salto.n < 3) return;
      corte = true; _salto = null;
    } else {
      _salto = null;
      const d = haversineM(ult.lng, ult.lat, f.lng, f.lat); if (d >= 2) VISITA.dist += d;
    }
  }
  if (VISITA.id === _visitaNueva) _visitaNueva = '';
  const c0 = cands[0], cod = c0 && c0.inside ? c0.cod : '';
  VISITA.pts.push(Object.assign({t: new Date(f.t).toISOString(), ms: f.t, lat: +f.lat.toFixed(6), lng: +f.lng.toFixed(6), acc: f.acc, cod}, corte ? {corte: true} : {}));
  // Un lote cuenta como visitado si se estuvo dentro al menos 8 s, o a menos de 15 m durante 20 s. Pasar por el camino no cuenta.
  const paso = Math.min(dt, 15);
  cands.filter(c => c.inside || c.d <= 15).slice(0, 3).forEach(c => {
    const l = VISITA.lotes[c.cod] || (VISITA.lotes[c.cod] = {seg: 0, cerca: 0, visitado: false});
    if (c.inside) l.seg += paso; else l.cerca += paso;
    if (!l.visitado && (l.seg >= 8 || l.cerca >= 20)) { l.visitado = true; l.hora = new Date().toISOString(); listaMarcar(c.cod, true); }
  });
  if (rutaLinea) { const segs = rutaLinea.getLatLngs(); if (corte && segs[segs.length - 1].length) { segs.push([L.latLng(f.lat, f.lng)]); rutaLinea.setLatLngs(segs); } else rutaLinea.addLatLng([f.lat, f.lng], segs[segs.length - 1]); }
  // Se guarda al menos cada 10 s: una recarga o un cierre de la app pierde como mucho los últimos segundos.
  if (Date.now() - _guardadoT >= 10000) { _guardadoT = Date.now(); kvSet('visita_activa', VISITA); }
  pintarProgreso();
  if (document.body.dataset.tab === 'visita') renderVisita();
}
function dibujarRuta(v) {
  if (!capaRuta) capaRuta = L.layerGroup().addTo(map);
  capaRuta.clearLayers(); rutaLinea = null;
  if (!v) return;
  rutaLinea = L.polyline(segmentosRuta(v.pts), {color: '#0a66ff', weight: 4, opacity: .85, interactive: false}).addTo(capaRuta);
}
/* Tramos de la ruta: un punto con «corte» (tras un salto descartado) empieza un tramo nuevo, sin unir el salto. */
function segmentosRuta(pts) {
  const segs = [[]];
  (pts || []).forEach(p => { if (p.corte && segs[segs.length - 1].length) segs.push([]); segs[segs.length - 1].push([p.lat, p.lng]); });
  return segs;
}
function verRuta(v) { mostrarTab('mapa'); dibujarRuta(v); if (v && v.pts.length > 1) soltarSeguimiento();
  if (v && v.pts.length > 1) map.fitBounds(L.latLngBounds(v.pts.map(p => [p.lat, p.lng])), margenes(90, 40)); }

/* Progreso de la visita sobre el mapa: lotes de la lista ya visitados y tiempo transcurrido. */
function pintarProgreso() {
  const el = $('chipVisita'); if (!el) return;
  if (!VISITA) { el.hidden = true; el.classList.remove('sin-gps'); return; }
  const total = LISTA.length, hechos = LISTA.filter(x => x.hecho).length, n = lotesVisitados(VISITA).length, e = estadoGpsVisita(), sin = gpsVisitaMal(e) ? e : '';
  el.hidden = false; el.classList.toggle('sin-gps', !!sin);
  el.setAttribute('aria-label', sin ? 'Visita en curso sin GPS. Tocar para reactivar el GPS' : 'Visita en curso. Tocar para ver la visita');
  if (sin) { el.innerHTML = `<b>${ico('alert')} Visita en curso sin GPS</b><small>${sin === 'apagado' ? 'GPS apagado' : 'Sin señal precisa'} · no se graba · Tocar para reactivar</small>`; return; }
  el.innerHTML = `<b><span class="rec" aria-hidden="true"></span>Grabando · ${total ? `${hechos} de ${total} lotes` : `${n} lote${n === 1 ? '' : 's'}`}</b><small>${fmtDur(Date.now() - new Date(VISITA.inicio))} · ${fmtDist(VISITA.dist)}</small>${total ? `<i><u style="width:${Math.round(hechos / total * 100)}%"></u></i>` : ''}`;
}
setInterval(() => { if (typeof VISITA !== 'undefined' && VISITA) pintarProgreso(); }, 30000);
function chipVisitaToque() { if (gpsVisitaMal(estadoGpsVisita())) reactivarGpsVisita(); else mostrarTab('visita'); }

/* ── Visita sin GPS ──
   'apagado': el GPS se detuvo o el permiso se negó · 'senal': 30 s sin lecturas útiles (±40 m) ·
   'buscando': recién (re)activado, aún sin lectura útil · '': graba bien.
   Con 'apagado' o 'senal' el chip de la visita queda en rojo y un aviso fijo ofrece «Reactivar».
   Antes de declarar 'senal' se pide una lectura (sondeo): un equipo quieto, sobre todo una tableta o un portátil con
   ubicación por Wi-Fi, no envía lecturas si la posición no cambia. Si la lectura llega con ±40 m o mejor, no se avisa. */
let _sinGps = '', _avisoRojo = false, _sondeo = null; // _sondeo: {ref: inicio del silencio sondeado, fallo}
function estadoGpsVisita() {
  if (!VISITA) return '';
  if (GPS.watch === null) return 'apagado';
  const util = GPS.utilT || 0, ref = Math.max(util, GPS.inicioT || 0), buscando = util < (GPS.inicioT || 0) ? 'buscando' : '';
  if (Date.now() - ref > 30000) {
    if (!_sondeo || _sondeo.ref !== ref) sondearGps(ref);
    return _sondeo.fallo ? 'senal' : buscando;
  }
  return buscando;
}
function sondearGps(ref) {
  const s = _sondeo = {ref, fallo: false}, falla = () => { if (_sondeo === s) { s.fallo = true; revisarGpsVisita(); } };
  try {
    navigator.geolocation.getCurrentPosition(pos => {
      if (_sondeo !== s || GPS.watch === null) return;
      alPosicion(pos); // lectura válida: se procesa como cualquier otra (punto de la visita incluido)
      if (Math.round(pos.coords.accuracy || 0) > ACC_MAX) falla();
    }, falla, {enableHighAccuracy: true, maximumAge: 0, timeout: 10000});
  } catch (_) { falla(); }
}
const gpsVisitaMal = e => e === 'apagado' || e === 'senal';
function revisarGpsVisita() {
  const e = estadoGpsVisita(); if (e === _sinGps) return;
  const antes = _sinGps; _sinGps = e; pintarProgreso();
  if (gpsVisitaMal(e) !== gpsVisitaMal(antes) && document.body.dataset.tab === 'visita') renderVisita();
  if (gpsVisitaMal(e)) {
    _avisoRojo = true; vibrar(250);
    toast(e === 'apagado' ? 'Visita sin GPS: no se graba la ruta.' : 'Visita sin señal GPS: no se graba la ruta.', {tipo: 'mal', fijo: true, clave: 'visitaGps', accion: 'Reactivar', alAccion: reactivarGpsVisita});
    return;
  }
  if (gpsVisitaMal(antes) || !VISITA) quitarAviso('visitaGps');
  if (!e && _avisoRojo) { _avisoRojo = false; if (VISITA) toast('GPS recuperado: la visita sigue grabando.', {tipo: 'bien'}); }
  if (!VISITA) _avisoRojo = false;
}
function reactivarGpsVisita() {
  if (GPS.watch !== null) { navigator.geolocation.clearWatch(GPS.watch); GPS.watch = null; }
  quitarAviso('visitaGps'); iniciarGps(true, false); revisarGpsVisita();
}
setInterval(revisarGpsVisita, 5000);

/* ── Lista de trabajo del día ── */
/* La lista guarda el día en que se armó (fecha local). Al día siguiente la pestaña Visita ofrece pasar los pendientes,
   reutilizarla o vaciarla; si se inicia una visita otro día, los lotes marcados como hechos vuelven a pendientes. */
const diaClave = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
let LISTA = leerLS(LISTA_KEY, []), LISTA_FECHA = leerLS(LISTA_FECHA_KEY, '');
if (LISTA.length && !LISTA_FECHA) { LISTA_FECHA = diaClave(); escribirLS(LISTA_FECHA_KEY, LISTA_FECHA); } // listas de versiones anteriores
const listaTiene = cod => LISTA.some(x => x.cod === cod);
const listaVieja = () => LISTA.length > 0 && !!LISTA_FECHA && LISTA_FECHA < diaClave();
function listaGuardar() {
  if (!LISTA.length) LISTA_FECHA = ''; else if (!LISTA_FECHA) LISTA_FECHA = diaClave();
  escribirLS(LISTA_FECHA_KEY, LISTA_FECHA); escribirLS(LISTA_KEY, LISTA); pintarLista(); pintarProgreso(); if (document.body.dataset.tab === 'visita') { const q = $('planQ') ? $('planQ').value : ''; renderVisita(); if (q) { $('planQ').value = q; planBuscar(q); } } if (selCod) renderCard(); }
function listaToggle(cod) { if (listaTiene(cod)) LISTA = LISTA.filter(x => x.cod !== cod); else LISTA.push({cod, hecho: false}); listaGuardar(); toast(listaTiene(cod) ? `Lote ${cod} agregado a la lista del día.` : `Lote ${cod} quitado de la lista.`); }
function listaMarcar(cod, hecho) { const x = LISTA.find(i => i.cod === cod); if (x && x.hecho !== hecho) { x.hecho = hecho; listaGuardar(); if (hecho) toast(`Lote ${cod} visitado.`, {tipo: 'bien'}); } }
function listaVaciar() {
  if (!LISTA.length) return;
  const antes = LISTA.map(x => Object.assign({}, x)), fecha = LISTA_FECHA;
  LISTA = []; listaGuardar();
  toast(`Lista vaciada (${antes.length} lote${antes.length === 1 ? '' : 's'}).`, {accion: 'Deshacer', ms: 7000, alAccion: () => { if (LISTA.length) return; LISTA = antes; LISTA_FECHA = fecha; listaGuardar(); toast('Lista recuperada.', {tipo: 'bien'}); }});
}
/* Lista de otro día: «pendientes» deja solo lo no hecho; «toda» la reutiliza con todo por visitar. */
function listaUsarHoy(modo) {
  if (modo === 'pendientes') LISTA = LISTA.filter(x => !x.hecho);
  LISTA.forEach(x => { x.hecho = false; }); LISTA_FECHA = LISTA.length ? diaClave() : '';
  listaGuardar(); toast(LISTA.length ? `Lista de hoy: ${LISTA.length} lote${LISTA.length === 1 ? '' : 's'} por visitar.` : 'Lista vacía.', {tipo: 'bien'});
}
/* Al iniciar una visita otro día, los hechos se reinician. Devuelve true si cambió algo. */
function listaNuevoDia() {
  if (!listaVieja()) return false;
  LISTA.forEach(x => { x.hecho = false; }); LISTA_FECHA = diaClave(); listaGuardar(); return true;
}
function listaFechaTxt() {
  const d = new Date(LISTA_FECHA + 'T12:00:00'), dias = Math.round((new Date(diaClave() + 'T12:00:00') - d) / 86400000);
  return dias === 1 ? 'de ayer' : 'del ' + d.toLocaleDateString('es-NI', {weekday: 'long', day: 'numeric', month: 'short'});
}
function pintarLista() {
  if (!capaLista) return;
  capaLista.clearLayers();
  LISTA.forEach((x, i) => { const c = centroideLote(LOTES[x.cod]); if (c) L.marker(c, {icon: L.divIcon({className: 'pin-lista' + (x.hecho ? ' hecho' : ''), html: `<span>${x.hecho ? ico('check') : i + 1}</span>`, iconSize: [30, 30], iconAnchor: [15, 15]}), zIndexOffset: 500}).on('click', () => seleccionarLote(x.cod)).addTo(capaLista); });
}

/* ── Pantalla encendida durante la visita ── */
let _wake = null;
async function pedirPantalla() { if (!S.pantalla || !(VISITA || VUELO.on) || !('wakeLock' in navigator) || _wake) return; try { _wake = await navigator.wakeLock.request('screen'); _wake.addEventListener('release', () => { _wake = null; }); } catch (_) {} }
function soltarPantalla() { if (_wake) { _wake.release().catch(() => {}); _wake = null; } }
// Al volver a primer plano el GPS tarda unos segundos en dar lecturas: se da ese margen antes de avisar «sin señal».
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { if (GPS.watch !== null) GPS.inicioT = Date.now(); pedirPantalla(); } else if (VISITA) kvSet('visita_activa', VISITA); });

/* ── Conectividad y mapas sin señal ── */
/* Dos estados distintos: «Sin internet» (el teléfono no tiene conexión; los lotes y registros siguen funcionando con lo guardado)
   y «Mapa de fondo no disponible» (hay conexión, pero los cuadros de Calles o Satélite no cargan). Un cuadro que carga reinicia la cuenta. */
function actualizarRed() {
  const el = $('chipRed'); if (!el) return;
  const txt = !navigator.onLine ? 'Sin internet' : tileErrores > 8 ? 'Mapa de fondo no disponible' : '';
  el.hidden = !txt; if (txt && el.textContent !== txt) el.textContent = txt;
}
window.addEventListener('online', () => { tileErrores = 0; actualizarRed(); });
window.addEventListener('offline', actualizarRed);
async function guardarZonaOffline() {
  cerrarHoja();
  const capa = baseLayers[S.base];
  if (!capa || !capa._url) { toast('Elija "Calles" o "Satélite" para guardar el mapa base.'); return; }
  if (!navigator.serviceWorker || !navigator.serviceWorker.controller) { toast('Instale o recargue la app una vez con señal para poder guardar mapas.', {tipo: 'mal'}); return; }
  const b = map.getBounds(), z0 = Math.round(map.getZoom()), zMax = Math.min(z0 + 2, capa.options.maxNativeZoom || 18), urls = [];
  const tx = (lng, z) => Math.floor((lng + 180) / 360 * 2 ** z), ty = (lat, z) => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z);
  for (let z = z0; z <= zMax; z++) for (let x = tx(b.getWest(), z); x <= tx(b.getEast(), z); x++) for (let y = ty(b.getNorth(), z); y <= ty(b.getSouth(), z); y++)
    urls.push(L.Util.template(capa._url, {s: capa._getSubdomain({x, y}), x, y, z, r: ''}));
  if (urls.length > 700) { toast(`Zona muy amplia (${urls.length} cuadros). Acérquese más y repita.`, {tipo: 'mal'}); return; }
  const aviso = toast(`Guardando mapa: 0 / ${urls.length}`, {fijo: true}); let ok = 0, i = 0;
  const trabajador = async () => { while (i < urls.length) { const u = urls[i++]; try { const r = await fetch(u, {mode: 'cors'}); if (r.ok) ok++; } catch (_) {} if (aviso) aviso.firstChild.textContent = `Guardando mapa: ${ok} / ${urls.length}`; } };
  await Promise.all(Array.from({length: 6}, trabajador));
  aviso && aviso.remove();
  toast(`Zona guardada: ${ok} de ${urls.length} cuadros hasta zoom ${zMax}.`, {tipo: ok ? 'bien' : 'mal'});
}


/* ── Modo vuelo (helicóptero) ──
   Altura aproximada sobre el punto de despegue (altitud GPS menos la de referencia tomada en tierra), velocidad y rumbo;
   el lote que está debajo sin confirmación ni tarjetas; mapa que se aleja según la velocidad y deja ver lo que viene. */
const VEL_MAX_VUELO = 350 / 3.6;
const GIRO_VUELO = {vMin: 5, base: 40, banda: 6, cada: 1200, accMax: 30, dur: '1s', centrar: 0};
const VUELO = {on: false, base: null, alts: [], alt: null, altAcc: null, lote: '', rapidoT: 0, sugerido: false, zoomT: 0};
/* Cada lectura: guarda la altitud de referencia mientras está en tierra (quieto o lento) y sugiere el modo al detectar vuelo. */
function vueloLectura(c, v) {
  const alt = Number.isFinite(c.altitude) && c.altitude !== null ? c.altitude : null;
  VUELO.alt = alt; VUELO.altAcc = Number.isFinite(c.altitudeAccuracy) ? c.altitudeAccuracy : null;
  if (alt !== null && !VUELO.on && (v === null || v < 3) && (c.accuracy || 99) <= 30) { VUELO.alts.push(alt); if (VUELO.alts.length > 15) VUELO.alts.shift(); VUELO.base = mediana(VUELO.alts); }
  if (VUELO.on || VUELO.sugerido) return;
  const sube = alt !== null && VUELO.base !== null && alt - VUELO.base > 60;
  if (v !== null && v > 22 && (sube || v > 33)) { if (!VUELO.rapidoT) VUELO.rapidoT = Date.now(); else if (Date.now() - VUELO.rapidoT > 15000) { VUELO.sugerido = true; toast('Va a más de 80 km/h. ¿Está en vuelo?', {accion: 'Modo vuelo', ms: 12000, alAccion: () => activarVuelo(true)}); } }
  else VUELO.rapidoT = 0;
}
const mediana = a => { const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
function alturaVuelo() { return VUELO.alt === null ? null : VUELO.base !== null ? VUELO.alt - VUELO.base : null; }
function activarVuelo(on) {
  VUELO.on = on; document.body.classList.toggle('vuelo', on); cerrarHoja();
  if (on) {
    mostrarTab('mapa'); if (selCod) cerrarCard(); if (typeof quitarModoFinca === 'function') quitarModoFinca();
    if (VUELO.base === null && VUELO.alt !== null) VUELO.base = VUELO.alt; // sin referencia previa: se toma la altitud actual
    if (GPS.watch === null) iniciarGps(true); else { GPS.siguiendo = true; }
    GPS.ancla = null; VUELO.zoomT = 0; VUELO.lote = ''; aplicarGiroCss(); pedirPantalla(); leyPlegar(true);
    toast('Modo vuelo activo. Altura aproximada (GPS), sobre el punto de despegue.', {tipo: 'bien', ms: 5000});
  } else { soltarPantalla(); pedirPantalla(); aplicarGiroCss(); GPS.ancla = null; toast('Modo vuelo desactivado.'); }
  pintarVueloHud(); etiquetasDebounce();
}
/* Zoom según la velocidad y la altura; el punto propio queda en el tercio inferior para ver lo que viene adelante. */
function zoomVuelo(v) {
  const kmh = v === null ? null : v * 3.6, h = alturaVuelo();
  let z = kmh === null ? map.getZoom() : kmh < 40 ? 16 : kmh < 90 ? 15 : kmh < 150 ? 14.5 : 14;
  if (h !== null && h > 400) z -= 0.5;
  return Math.max(12, Math.min(17, z));
}
function vueloSeguir(lat, lng, v, primera) {
  let z = map.getZoom(); const zt = zoomVuelo(v);
  if (primera || (Math.abs(zt - z) >= 0.5 && Date.now() - VUELO.zoomT > 8000)) { z = zt; VUELO.zoomT = Date.now(); }
  const curso = Number.isFinite(GPS.curso) ? GPS.curso : Number.isFinite(GPS.rumbo) ? GPS.rumbo : null;
  let centro = L.latLng(lat, lng);
  if (curso !== null && v !== null && v > 5) {
    const H = $('vistaMapa').clientHeight, adelante = H * 0.25, r = curso * Math.PI / 180, P = map.project(centro, z);
    centro = map.unproject(L.point(P.x + Math.sin(r) * adelante, P.y - Math.cos(r) * adelante), z);
  }
  map.setView(centro, z, {animate: true, duration: .9, easeLinearity: .6});
}
/* Lote que está debajo (dentro del polígono); si no, el más cercano a menos de 150 m. */
function vueloLote(lng, lat) {
  const c = cercanos(lng, lat, 150), dentro = c.find(x => x.inside);
  VUELO.lote = dentro ? dentro.cod : ''; VUELO.cerca = !dentro && c.length ? c.sort((a, b) => a.d - b.d)[0] : null;
}
const CARDINAL = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
function pintarVueloHud() {
  let el = $('vueloHud');
  if (!VUELO.on) { if (el) el.hidden = true; return; }
  if (!el) { el = document.createElement('div'); el.id = 'vueloHud'; el.className = 'vuelo-hud'; el.setAttribute('role', 'status'); $('vistaMapa').appendChild(el); }
  el.hidden = false;
  const f = GPS.fix, v = f && f.v !== null ? f.v * 3.6 : null, h = alturaVuelo(), rumbo = Number.isFinite(GPS.rumbo) ? GPS.rumbo : Number.isFinite(GPS.curso) ? GPS.curso : null;
  const l = VUELO.lote ? LOTES[VUELO.lote] : null, sem = l ? semaforoLote(l) : null;
  const dato = (b, s) => `<div><b>${b}</b><small>${s}</small></div>`;
  el.innerHTML = `<div class="vh-cab"><span>${ico('heli')} Modo vuelo</span><button type="button" onclick="activarVuelo(false)">Salir</button></div>
    <div class="vh-datos">${dato(h !== null ? nf0.format(h) + ' m' : VUELO.alt !== null ? nf0.format(VUELO.alt) + ' m' : '—', h !== null ? 'altura aprox.' : VUELO.alt !== null ? 'sobre el mar' : 'altura sin dato')}${dato(v !== null ? nf0.format(v) : '—', 'km/h')}${dato(rumbo !== null ? nf0.format(rumbo) + '° ' + CARDINAL[Math.round(rumbo / 45) % 8] : '—', 'rumbo')}</div>
    <div class="vh-lote est-${sem ? sem.cls : 'neutro'}">${l ? `<i></i><b>${esc(l.cod)}</b><span>${esc(l.hac)}${l.tchEst > 0 && esMolienda(l) ? ` · ${nfTch.format(l.tchEst)} t/ha` : l.clas ? ' · ' + esc(rotulo(l.clas)) : ''}${l.nc ? ' · ' + esc(ncCorto(l)) : ''}</span>`
      : VUELO.cerca ? `<span>Fuera de lotes · ${esc(VUELO.cerca.cod)} a ${nf0.format(VUELO.cerca.d)} m</span>` : `<span>${f ? 'Fuera de lotes' : 'Buscando señal GPS…'}</span>`}</div>`;
}
/* Antes de despegar: guarda el mapa base de toda la zona de lotes (vista general hasta acercamiento medio) para tenerlo sin señal. */
async function prepararVuelo() {
  cerrarHoja();
  const capa = baseLayers[S.base];
  if (!capa || !capa._url) { toast('Elija "Calles" o "Satélite" como mapa base para guardarlo.'); return; }
  if (!navigator.serviceWorker || !navigator.serviceWorker.controller) { toast('Instale o recargue la app una vez con señal para poder guardar mapas.', {tipo: 'mal'}); return; }
  const b = capaLotes.getBounds().pad(0.08), tx = (lng, z) => Math.floor((lng + 180) / 360 * 2 ** z), ty = (lat, z) => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z);
  const urls = []; let zMax = 10;
  for (let z = 10; z <= Math.min(15, capa.options.maxNativeZoom || 18); z++) {
    const nivel = [];
    for (let x = tx(b.getWest(), z); x <= tx(b.getEast(), z); x++) for (let y = ty(b.getNorth(), z); y <= ty(b.getSouth(), z); y++) nivel.push(L.Util.template(capa._url, {s: capa._getSubdomain({x, y}), x, y, z, r: ''}));
    if (urls.length + nivel.length > 2200) break;
    urls.push(...nivel); zMax = z;
  }
  const aviso = toast(`Preparando vuelo: 0 / ${urls.length}`, {fijo: true}); let ok = 0, i = 0;
  const trabajador = async () => { while (i < urls.length) { const u = urls[i++]; try { const r = await fetch(u, {mode: 'cors'}); if (r.ok) ok++; } catch (_) {} if (aviso && i % 10 === 0) aviso.firstChild.textContent = `Preparando vuelo: ${ok} / ${urls.length}`; } };
  await Promise.all(Array.from({length: 6}, trabajador));
  aviso && aviso.remove();
  toast(ok ? `Mapa guardado para el vuelo: ${ok} cuadros hasta acercamiento ${zMax}. Los lotes ya están en el teléfono.` : 'No se pudo guardar el mapa (¿sin señal?).', {tipo: ok ? 'bien' : 'mal', ms: 7000});
}
