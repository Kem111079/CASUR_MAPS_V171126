/* CASUR Maps · GPS, detección de lote, visita/recorrido unificados, lista del día, pantalla encendida y mapas sin señal. */
'use strict';
const PERFILES = {
  preciso: {txt: 'Punto fijo', radio: 25, autoAcc: 10, empate: 8, estables: 2, rapido: 2.5},
  campo: {txt: 'Caminando', radio: 50, autoAcc: 22, empate: 12, estables: 3, rapido: 4.0},
  vehiculo: {txt: 'Vehículo', radio: 75, autoAcc: 30, empate: 18, estables: 3, rapido: 5.5}
};
const FIJADO_KEY = 'casur_maps_fijado_v2', LISTA_KEY = 'casur_maps_lista_v2';
const GPS = {watch: null, fix: null, siguiendo: true, lote: '', autoSel: '', cands: [], fijado: leerLS(FIJADO_KEY, ''), marcador: null, circulo: null, rumbo: null, candKey: '', candN: 0, estado: 'apagado', detalle: ''};
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
const giroCfg = () => GIRO[S.giro] || GIRO.suave;
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
  GPS.siguiendo = seguir; GPS.estado = 'buscando'; GPS.detalle = 'Buscando señal GPS…'; pintarGpsChip(); pintarGpsBtn();
  GPS.watch = navigator.geolocation.watchPosition(alPosicion, e => {
    GPS.estado = 'error'; GPS.detalle = e.code === 1 ? 'Permiso de ubicación denegado' : 'GPS sin señal'; pintarGpsChip();
    if (e.code === 1) { detenerGps(); if (!auto) toast('Permita la ubicación en el navegador para usar el GPS.', {tipo: 'mal'}); }
  }, {enableHighAccuracy: true, maximumAge: 1000, timeout: 20000});
}
function detenerGps() {
  if (GPS.watch !== null) navigator.geolocation.clearWatch(GPS.watch);
  GPS.watch = null; GPS.fix = null; GPS.ancla = null; GPS.curso = null; GPS.movN = 0; GPS.centro = null; GPS.lote = ''; GPS.cands = []; GPS.estado = 'apagado';
  if (GPS.marcador) { GPS.marcador.remove(); GPS.circulo.remove(); GPS.marcador = GPS.circulo = null; }
  girarMapa(0); pintarGpsChip(); pintarGpsBtn();
}
function alPosicion(pos) {
  const c = pos.coords, lat = c.latitude, lng = c.longitude, acc = Math.round(c.accuracy || 0), t = pos.timestamp || Date.now(), prev = GPS.fix;
  let v = Number.isFinite(c.speed) && c.speed !== null ? c.speed : null;
  if (v === null && prev) v = haversineM(prev.lng, prev.lat, lng, lat) / Math.max((t - prev.t) / 1000, 0.5);
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
  if (GPS.siguiendo) {
    if (primera) { map.setView([lat, lng], Math.max(map.getZoom(), 17)); GPS.centro = aqui; }
    else if (!GPS.centro || haversineM(GPS.centro.lng, GPS.centro.lat, lng, lat) >= G.centrar) { map.panTo([lat, lng], {animate: true, duration: .9, easeLinearity: .6}); GPS.centro = aqui; }
  }
  orientar();
  const cands = detectarLote();
  visitaPunto(cands);
  pintarGpsChip(); pintarGpsBtn();
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
  if (GPS.lote !== c.cod) { GPS.lote = c.cod; vibrar(70); }
  if (GPS.fijado && GPS.fijado !== c.cod) { GPS.detalle = `Fijado ${GPS.fijado} · GPS en ${c.cod}`; return; }
  // No pisa una selección manual: solo actualiza la tarjeta si está vacía o si la puso el GPS.
  if ((!selCod || selCod === GPS.autoSel) && selCod !== c.cod && document.body.dataset.tab === 'mapa' && !medir.modo && !$('hoja').classList.contains('abierta')) {
    GPS.autoSel = c.cod; seleccionarLote(c.cod, {gps: true, feat: c.f, full: false});
  }
}
function fijarLote(cod) {
  GPS.fijado = GPS.fijado === cod ? '' : cod; escribirLS(FIJADO_KEY, GPS.fijado);
  toast(GPS.fijado ? `Lote ${cod} fijado: el GPS no cambiará la tarjeta.` : 'Lote liberado.'); renderCard(); pintarGpsChip();
}
function pintarGpsBtn() {
  const b = $('btnGps'); if (!b) return;
  b.className = 'fab ' + (GPS.watch === null ? 'apagado' : GPS.siguiendo ? 'siguiendo' : 'activo');
  b.setAttribute('aria-label', GPS.watch === null ? 'Activar GPS' : 'Centrar en mi posición');
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
    <div class="acciones"><button type="button" class="btn ter" onclick="cerrarHoja();detenerGps()">${ico('stop')} Detener GPS</button>${GPS.fijado ? `<button type="button" class="btn sec" onclick="fijarLote(GPS.fijado);cerrarHoja()">${ico('unlock')} Liberar ${esc(GPS.fijado)}</button>` : ''}</div>`);
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
  if (VISITA) { dibujarRuta(VISITA); pedirPantalla(); toast('Hay una visita en curso.', {accion: 'Ver', alAccion: () => mostrarTab('visita')}); }
}
function iniciarVisita() {
  if (VISITA) return;
  VISITA = {id: 'VIS-' + Date.now(), inicio: new Date().toISOString(), fin: null, pts: [], lotes: {}, dist: 0, tecnico: S.tecnico || ''};
  kvSet('visita_activa', VISITA); iniciarGps(); pedirPantalla(); dibujarRuta(VISITA); renderVisita(); pintarProgreso(); confirmar('Visita iniciada');
}
async function finalizarVisita() {
  if (!VISITA) return;
  VISITA.fin = new Date().toISOString(); VISITAS.push(VISITA);
  await kvSet('visitas', VISITAS); await kvSet('visita_activa', null);
  const v = VISITA; VISITA = null; pintarProgreso(); soltarPantalla(); dibujarRuta(null); renderVisita(); if (selCod) renderCard();
  cierreVisita(v);
}
const lotesVisitados = v => Object.keys(v.lotes || {}).filter(c => v.lotes[c].visitado);
function visitaPunto(cands) {
  if (!VISITA) return;
  const f = GPS.fix, ult = VISITA.pts[VISITA.pts.length - 1], dt = ult ? (f.t - ult.ms) / 1000 : 3;
  if (ult && dt < 3) return;
  const c0 = cands[0], cod = c0 && c0.inside ? c0.cod : '';
  if (ult && f.acc <= 40) { const d = haversineM(ult.lng, ult.lat, f.lng, f.lat); if (d >= 2) VISITA.dist += d; }
  VISITA.pts.push({t: new Date(f.t).toISOString(), ms: f.t, lat: +f.lat.toFixed(6), lng: +f.lng.toFixed(6), acc: f.acc, cod});
  // Un lote cuenta como visitado si se estuvo dentro al menos 8 s, o a menos de 15 m durante 20 s. Pasar por el camino no cuenta.
  const paso = Math.min(dt, 15);
  cands.filter(c => c.inside || c.d <= 15).slice(0, 3).forEach(c => {
    const l = VISITA.lotes[c.cod] || (VISITA.lotes[c.cod] = {seg: 0, cerca: 0, visitado: false});
    if (c.inside) l.seg += paso; else l.cerca += paso;
    if (!l.visitado && (l.seg >= 8 || l.cerca >= 20)) { l.visitado = true; l.hora = new Date().toISOString(); listaMarcar(c.cod, true); }
  });
  if (rutaLinea) rutaLinea.addLatLng([f.lat, f.lng]);
  if (VISITA.pts.length % 5 === 0) kvSet('visita_activa', VISITA);
  pintarProgreso();
  if (document.body.dataset.tab === 'visita') renderVisita();
}
function dibujarRuta(v) {
  if (!capaRuta) capaRuta = L.layerGroup().addTo(map);
  capaRuta.clearLayers(); rutaLinea = null;
  if (!v) return;
  rutaLinea = L.polyline(v.pts.map(p => [p.lat, p.lng]), {color: '#0a66ff', weight: 4, opacity: .85, interactive: false}).addTo(capaRuta);
}
function verRuta(v) { mostrarTab('mapa'); dibujarRuta(v); if (v && v.pts.length > 1) soltarSeguimiento();
  if (v && v.pts.length > 1) map.fitBounds(L.latLngBounds(v.pts.map(p => [p.lat, p.lng])), margenes(90, 40)); }

/* Progreso de la visita sobre el mapa: lotes de la lista ya visitados y tiempo transcurrido. */
function pintarProgreso() {
  const el = $('chipVisita'); if (!el) return;
  if (!VISITA) { el.hidden = true; return; }
  const total = LISTA.length, hechos = LISTA.filter(x => x.hecho).length, n = lotesVisitados(VISITA).length;
  el.hidden = false;
  el.innerHTML = `<b>${ico('route')} Visita · ${total ? `${hechos} de ${total} lotes` : `${n} lote${n === 1 ? '' : 's'}`}</b><small>${fmtDur(Date.now() - new Date(VISITA.inicio))} · ${fmtDist(VISITA.dist)}</small>${total ? `<i><u style="width:${Math.round(hechos / total * 100)}%"></u></i>` : ''}`;
}
setInterval(() => { if (typeof VISITA !== 'undefined' && VISITA) pintarProgreso(); }, 30000);

/* ── Lista de trabajo del día ── */
let LISTA = leerLS(LISTA_KEY, []);
const listaTiene = cod => LISTA.some(x => x.cod === cod);
function listaGuardar() { escribirLS(LISTA_KEY, LISTA); pintarLista(); pintarProgreso(); if (document.body.dataset.tab === 'visita') { const q = $('planQ') ? $('planQ').value : ''; renderVisita(); if (q) { $('planQ').value = q; planBuscar(q); } } if (selCod) renderCard(); }
function listaToggle(cod) { if (listaTiene(cod)) LISTA = LISTA.filter(x => x.cod !== cod); else LISTA.push({cod, hecho: false}); listaGuardar(); toast(listaTiene(cod) ? `Lote ${cod} agregado a la lista del día.` : `Lote ${cod} quitado de la lista.`); }
function listaMarcar(cod, hecho) { const x = LISTA.find(i => i.cod === cod); if (x && x.hecho !== hecho) { x.hecho = hecho; listaGuardar(); if (hecho) toast(`Lote ${cod} visitado.`, {tipo: 'bien'}); } }
function listaVaciar() { LISTA = []; listaGuardar(); }
function pintarLista() {
  if (!capaLista) return;
  capaLista.clearLayers();
  LISTA.forEach((x, i) => { const c = centroideLote(LOTES[x.cod]); if (c) L.marker(c, {icon: L.divIcon({className: 'pin-lista' + (x.hecho ? ' hecho' : ''), html: `<span>${x.hecho ? ico('check') : i + 1}</span>`, iconSize: [30, 30], iconAnchor: [15, 15]}), zIndexOffset: 500}).on('click', () => seleccionarLote(x.cod)).addTo(capaLista); });
}

/* ── Pantalla encendida durante la visita ── */
let _wake = null;
async function pedirPantalla() { if (!S.pantalla || !VISITA || !('wakeLock' in navigator) || _wake) return; try { _wake = await navigator.wakeLock.request('screen'); _wake.addEventListener('release', () => { _wake = null; }); } catch (_) {} }
function soltarPantalla() { if (_wake) { _wake.release().catch(() => {}); _wake = null; } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pedirPantalla(); else if (VISITA) kvSet('visita_activa', VISITA); });

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
