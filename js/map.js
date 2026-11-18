/* CASUR Maps · mapa, capas temáticas, etiquetas, búsqueda, tarjeta del lote, resumen de finca y medición. */
'use strict';
let map, capaLotes, capaSel, capaEtiquetas, capaLista, capaMedir, baseLayers = {}, baseActiva = null;
let selCod = '', selFeat = null, cardFull = false;
const VISTA_KEY = 'casur_maps_vista_v2', FAV_KEY = 'casur_maps_favoritos_v2', REC_KEY = 'casur_maps_recientes_v2';

/* ── Hoja modal genérica ── */
function abrirHoja(titulo, html, clase = '') {
  $('hojaTitulo').textContent = titulo; $('hojaBody').innerHTML = html;
  $('hoja').className = 'hoja abierta ' + clase; $('hojaFondo').classList.add('abierta');
}
function cerrarHoja() { $('hoja').classList.remove('abierta'); $('hojaFondo').classList.remove('abierta'); if (typeof detenerDictado === 'function') detenerDictado(); }

/* ── Mapa ── */
/* ── Rumbo arriba ──
   El contenedor del mapa es un cuadrado del tamaño de la diagonal de la pantalla y se gira con CSS.
   Para que el dedo y el mapa coincidan, se corrige la conversión de toques y el arrastre con el ángulo actual. */
let mapRot = 0; // grados, sentido horario (CSS)
function ajustarLienzo() {
  const v = $('vistaMapa'), W = v.clientWidth, H = v.clientHeight, D = Math.ceil(Math.hypot(W, H)) + 2, m = $('map');
  m.style.width = m.style.height = D + 'px'; m.style.left = Math.round((W - D) / 2) + 'px'; m.style.top = Math.round((H - D) / 2) + 'px';
  if (map) map.invalidateSize({animate: false});
}
function margenes(arriba = 90, abajo = 40, lado = 30) { // relleno para encuadrar dentro de la parte visible del lienzo
  const v = $('vistaMapa'), D = $('map').offsetWidth, mx = (D - v.clientWidth) / 2, my = (D - v.clientHeight) / 2;
  if (mapRot % 360) { const g = Math.max(mx, my) + Math.max(arriba, abajo); return {padding: [g, g]}; }
  return {paddingTopLeft: [mx + lado, my + arriba], paddingBottomRight: [mx + lado, my + abajo]};
}
function girarMapa(grados) {
  const d = ((grados - mapRot + 540) % 360) - 180; // camino más corto
  if (Math.abs(d) < 0.5) return;
  mapRot += d;
  const m = $('map'); m.style.setProperty('--rot', mapRot.toFixed(1) + 'deg'); m.style.setProperty('--contra', (-mapRot).toFixed(1) + 'deg');
  pintarBrujula(); etiquetasDebounce();
}
L.Map.include({
  mouseEventToContainerPoint(e) {
    const r = this._container.getBoundingClientRect(), t = mapRot * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
    const x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2), sz = this.getSize();
    return L.point(c * x + s * y + sz.x / 2, -s * x + c * y + sz.y / 2);
  }
});
function initMap() {
  ajustarLienzo();
  map = L.map('map', {zoomControl: false, preferCanvas: true, attributionControl: false, maxZoom: 20});
  window.addEventListener('resize', ajustarLienzo);
  map.dragging._draggable.on('predrag', function () { // arrastre: convierte el movimiento del dedo al sistema girado
    const ps = this._parentScale || {x: 1, y: 1}, o = this._newPos.subtract(this._startPos), x = o.x * ps.x, y = o.y * ps.y, t = mapRot * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
    this._newPos = this._startPos.add(L.point(c * x + s * y, -s * x + c * y));
  });
  baseLayers = {
    claro: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom: 20, maxNativeZoom: 19, crossOrigin: true, attribution: '© OpenStreetMap'}),
    satelite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {maxZoom: 20, maxNativeZoom: 18, crossOrigin: true, attribution: '© Esri'}),
    ninguno: L.layerGroup()
  };
  Object.values(baseLayers).forEach(b => b.on && b.on('tileerror', () => { tileErrores++; actualizarRed(); }));
  setBase(S.base in baseLayers ? S.base : 'claro', false);
  prepararTema();
  capaLotes = L.geoJSON(DATA, {
    style: estiloFeat,
    onEachFeature: (f, layer) => { f._layer = layer; layer.on('click', e => { if (medir.modo) { L.DomEvent.stopPropagation(e); medirPunto(e.latlng); return; } seleccionarLote(f._cod, {feat: f}); }); }
  }).addTo(map);
  capaSel = L.geoJSON(null, {interactive: false, style: f => f._tenue ? {color: '#ffd400', weight: 2, opacity: .9, dashArray: '6 6', fillOpacity: 0} : {color: '#ffd400', weight: 4.5, opacity: 1, fillColor: '#ffd400', fillOpacity: .18}}).addTo(map);
  capaEtiquetas = L.layerGroup().addTo(map);
  capaLista = L.layerGroup().addTo(map);
  capaMedir = L.layerGroup().addTo(map);
  map.on('click', e => { if (medir.modo) medirPunto(e.latlng); });
  map.on('moveend zoomend', () => { etiquetasDebounce(); guardarVista(); });
  map.on('dragstart', () => { if (typeof GPS !== 'undefined') { GPS.siguiendo = false; pintarGpsBtn(); } });
  const v = leerLS(VISTA_KEY, null);
  if (v && Number.isFinite(v.lat)) map.setView([v.lat, v.lng], v.z); else map.fitBounds(capaLotes.getBounds(), margenes(20, 20, 10));
  actualizarEtiquetas(); pintarLeyenda();
}
let _vistaT = null;
function guardarVista() { clearTimeout(_vistaT); _vistaT = setTimeout(() => { const c = map.getCenter(); escribirLS(VISTA_KEY, {lat: c.lat, lng: c.lng, z: map.getZoom()}); }, 600); }
function setBase(nombre, repintar = true) {
  if (baseActiva) map.removeLayer(baseActiva);
  baseActiva = baseLayers[nombre]; baseActiva.addTo(map); S.base = nombre; guardarAjustes();
  document.body.dataset.base = nombre;
  if (repintar && capaLotes) { capaLotes.setStyle(estiloFeat); actualizarEtiquetas(); }
}

/* ── Capas temáticas: una sola variable a la vez, rampa única y leyenda con hectáreas ── */
const RAMPA = ['#0d0887', '#7e03a8', '#cc4778', '#f89540', '#f0f921'];
// Producción (t/ha): < 40 rojo · 40–55 morado · 55–70 mostaza · 70–85 verde · > 85 verde oscuro
const RAMPA_TCH = ['#d7191c', '#7e03a8', '#d4a017', '#3fa34d', '#14532d'];
const CATS = ['#1f77b4', '#ff7f0e', '#d62728', '#9467bd', '#17becf', '#8c564b', '#e377c2'];
const TEMAS = {
  ninguno: {t: 'Sin color'},
  tchEst: {t: 'TCH estimado 26/27', u: 't/ha', val: l => esMolienda(l) && l.tchEst > 0 ? l.tchEst : null, cortes: [40, 55, 70, 85], rampa: RAMPA_TCH},
  edad: {t: 'Edad desde el corte', u: 'meses', val: edadMeses, cortes: [3, 6, 9, 12]},
  zona: {t: 'Zona', cat: l => l.zona || 'Sin dato'},
  riego: {t: 'Tipo de riego', cat: l => l.riego || 'Sin dato'},
  variedad: {t: 'Variedad', cat: l => l.variedad || 'Sin dato'},
  destino: {t: 'Destino / clasificación', cat: l => l.conAforo ? (l.clas || 'Sin dato') : 'Sin aforo'},
  semana: {t: 'Semana de corte', clave: claseCorte, clases: () => [
    {txt: 'Fecha vencida', color: '#d7191c'},
    {txt: SEMANAS_PROX[0] ? `Sem. ${SEMANAS_PROX[0].sem} · ${rangoSemana(SEMANAS_PROX[0])}` : 'Próxima semana', color: '#ff8c00'},
    {txt: SEMANAS_PROX[1] ? `Sem. ${SEMANAS_PROX[1].sem} · ${rangoSemana(SEMANAS_PROX[1])}` : 'Semana siguiente', color: '#1f77b4'},
    {txt: 'Más adelante', color: '#cfd8df'},
    {txt: 'Cosechado', color: '#6b7280'}]}
};
if (!TEMAS[S.colorear]) S.colorear = 'ninguno'; // capas retiradas (TCH última zafra, brecha)
let temaColor = new Map(), temaLeyenda = [];
function prepararTema() {
  temaColor = new Map(); temaLeyenda = [];
  const T = TEMAS[S.colorear] || TEMAS.ninguno, lotes = Object.values(LOTES).filter(l => l.nPoly);
  if (T.cortes) {
    const c = T.cortes, rotulos = [`< ${c[0]}`, ...c.slice(0, -1).map((v, i) => `${v} – ${c[i + 1]}`), `> ${c[c.length - 1]}`];
    const ha = new Array(rotulos.length).fill(0); let sin = 0;
    const R = T.rampa || RAMPA;
    lotes.forEach(l => { const v = T.val(l); if (v === null || v === undefined) { sin += l.areaShape; return; } let i = c.findIndex(x => v < x); if (i < 0) i = c.length; temaColor.set(l.cod, R[i]); ha[i] += l.areaShape; });
    temaLeyenda = rotulos.map((r, i) => ({color: R[i], txt: r, ha: ha[i]})); if (sin > 0) temaLeyenda.push({color: null, txt: 'Sin dato', ha: sin});
  } else if (T.clases) {
    const defs = T.clases(), ha = defs.map(() => 0), n = defs.map(() => 0); let sin = 0;
    lotes.forEach(l => { const i = T.clave(l); if (i === null) { sin += l.areaShape; return; } temaColor.set(l.cod, defs[i].color); ha[i] += l.areaShape; n[i]++; });
    temaLeyenda = defs.map((d, i) => ({color: d.color, txt: d.txt, ha: ha[i], n: n[i]})).filter(x => x.n);
    if (sin > 0) temaLeyenda.push({color: null, txt: 'Sin fecha', ha: sin});
  } else if (T.cat) {
    const ha = {}; lotes.forEach(l => { const k = T.cat(l); ha[k] = (ha[k] || 0) + l.areaShape; });
    const orden = Object.keys(ha).sort((a, b) => ha[b] - ha[a]), top = orden.slice(0, CATS.length), col = {};
    top.forEach((k, i) => { col[k] = CATS[i]; temaLeyenda.push({color: CATS[i], txt: k, ha: ha[k]}); });
    const resto = orden.slice(CATS.length).reduce((s, k) => s + ha[k], 0); if (resto > 0) temaLeyenda.push({color: '#9aa3ad', txt: 'Otras', ha: resto});
    lotes.forEach(l => temaColor.set(l.cod, col[T.cat(l)] || '#9aa3ad'));
  }
}
function estiloFeat(f) {
  const sat = S.base === 'satelite', oscuro = S.base === 'ninguno' && S.tema === 'oscuro';
  if (S.colorear === 'ninguno') return {color: sat || oscuro ? '#ffffff' : '#0b3a66', weight: sat ? 1.6 : 1, opacity: sat ? .95 : .8, fillColor: sat ? '#ffffff' : '#3d6b99', fillOpacity: sat ? .05 : .13};
  const c = temaColor.get(f._cod);
  if (!c) return {color: sat ? '#ffffff' : '#7b8794', weight: .8, opacity: .7, fillColor: '#9aa3ad', fillOpacity: .12};
  return {color: sat ? '#ffffff' : '#1c2733', weight: sat ? 1.2 : .7, opacity: .9, fillColor: c, fillOpacity: sat ? .55 : .68};
}
function setColorear(modo) {
  S.colorear = modo; guardarAjustes(); prepararTema(); capaLotes.setStyle(estiloFeat); pintarLeyenda(); actualizarEtiquetas();
}
function pintarLeyenda() {
  const el = $('leyenda'); if (!el) return;
  if (S.colorear === 'ninguno' || !temaLeyenda.length) { el.classList.add('oculta'); return; }
  const T = TEMAS[S.colorear];
  el.classList.remove('oculta');
  el.innerHTML = `<button type="button" class="ley-cab" onclick="this.parentElement.classList.toggle('plegada')"><b>${esc(T.t)}</b>${T.u ? ` <small>${esc(T.u)}</small>` : ''}<i>▾</i></button><div class="ley-cuerpo">` +
    temaLeyenda.map(x => `<div><span class="ley-color" style="${x.color ? 'background:' + x.color : ''}"></span><span>${esc(x.txt)}</span><em>${x.n ? x.n + ' · ' : ''}${nf0.format(x.ha)} ha</em></div>`).join('') + '</div>';
}

/* ── Etiquetas por nivel de zoom: finca → lote → tablón ── */
let _etqT = null;
function etiquetasDebounce() { clearTimeout(_etqT); _etqT = setTimeout(actualizarEtiquetas, 140); }
function actualizarEtiquetas() {
  if (!capaEtiquetas) return;
  if (map._animatingZoom) { etiquetasDebounce(); return; } // durante la animación las posiciones aún no son las finales
  capaEtiquetas.clearLayers();
  if (!S.etiquetas) return;
  const z = map.getZoom(), b = map.getBounds().pad(0.05), w = b.getWest(), e = b.getEast(), s = b.getSouth(), n = b.getNorth();
  const toca = bb => bb && !(bb[0] > e || bb[2] < w || bb[1] > n || bb[3] < s);
  // Evita etiquetas encimadas: se colocan primero las más importantes y se descarta la que choque con una ya puesta.
  const cajas = [];
  const poner = (ll, txt, cls) => {
    const p = map.latLngToContainerPoint(ll), w = txt.length * (cls === 'etq-finca' ? 8.6 : 6.8) + 8, h = 20, c = [p.x - w / 2, p.y - h / 2, p.x + w / 2, p.y + h / 2];
    if (cajas.some(o => !(c[0] > o[2] || c[2] < o[0] || c[1] > o[3] || c[3] < o[1]))) return false;
    cajas.push(c);
    L.marker(ll, {interactive: false, keyboard: false, icon: L.divIcon({className: 'etq ' + cls, html: `<span>${esc(txt)}</span>`, iconSize: [0, 0]})}).addTo(capaEtiquetas);
    return true;
  };
  if (z >= 18) {
    let k = 0;
    for (const f of DATA.features) { if (!toca(f.bbox)) continue; const c = centroideFeat(f); if (!c) continue; const l = LOTES[f._cod]; if (poner(c, l && l.nPoly > 1 ? `${f._cod} · ${f.properties.Tablon || ''}` : f._cod, 'etq-tab') && ++k > 260) break; }
  } else if (z >= 15.5) {
    let k = 0;
    // Con la capa Semana de corte, los lotes con fecha próxima o vencida se etiquetan primero.
    const pri = l => { if (S.colorear !== 'semana') return 0; const c = claseCorte(l); return c !== null && c <= 2 ? 1 : 0; };
    const vis = Object.values(LOTES).filter(l => l.principal && toca(l.bbox)).sort((a, b) => pri(b) - pri(a) || b.areaShape - a.areaShape);
    for (const l of vis) { const c = centroideLote(l); if (c && b.contains(c) && poner(c, etqLote(l), 'etq-lote') && ++k > 320) break; }
  } else if (z >= 12.5) {
    const vis = Object.values(FINCAS).filter(f => toca(f.bbox)).sort((a, b) => b.lotes.length - a.lotes.length);
    for (const f of vis) poner([(f.bbox[1] + f.bbox[3]) / 2, (f.bbox[0] + f.bbox[2]) / 2], f.nombre, 'etq-finca');
  }
}

/* Con la capa Semana de corte, los lotes vencidos o de las dos próximas semanas llevan su fecha en la etiqueta. */
function etqLote(l) {
  if (S.colorear !== 'semana') return l.cod;
  const c = claseCorte(l); if (c === null || c > 2) return l.cod;
  const d = parseISO(l.fProg);
  return `${l.cod} · ${d.getDate()} ${d.toLocaleDateString('es-NI', {month: 'short'}).replace('.', '')}`;
}
/* Etiqueta de cosecha de la tarjeta: fecha programada, días que faltan y semana; alerta si la fecha ya pasó. */
function corteHtml(l) {
  if (l.cosechado) return `<div class="corte est-info">✔ Cosechado el ${fechaCorta(l.fCorte)}</div>`;
  if (!l.fProg) return '';
  const d = diasPara(l.fProg), w = l.semProg;
  if (d < 0) return `<div class="corte est-mal">⚠ Fecha de corte vencida: ${fechaCorta(l.fProg)} (hace ${-d} día${d === -1 ? '' : 's'}). Actualice el programa o cargue el corte.</div>`;
  return `<div class="corte ${d <= 14 ? 'est-medio' : 'est-neutro'}">🗓 Corte ${fechaCorta(l.fProg)} · ${d === 0 ? '<b>hoy</b>' : `faltan <b>${d}</b> día${d === 1 ? '' : 's'}`}${w ? ' · sem. ' + w.sem : ''}</div>`;
}

/* ── Búsqueda por código, productor o finca (sin tildes), con recientes y favoritos ── */
let indice = [];
function construirIndice() {
  indice = Object.values(LOTES).map(l => ({tipo: 'lote', cod: l.cod, txt: l.hac, n: l.cod + ' ' + sinTildes(l.hac), sinMapa: !l.nPoly}));
  Object.values(FINCAS).forEach(f => indice.push({tipo: 'finca', cod: f.nombre, txt: `${f.lotes.length} lotes`, n: sinTildes(f.nombre)}));
}
const favoritos = () => leerLS(FAV_KEY, []);
const recientes = () => leerLS(REC_KEY, []);
function favToggle(cod) { let f = favoritos(); f = f.includes(cod) ? f.filter(x => x !== cod) : [cod, ...f].slice(0, 40); escribirLS(FAV_KEY, f); renderCard(); toast(f.includes(cod) ? 'Agregado a favoritos' : 'Quitado de favoritos'); }
function sugerir(q) {
  const box = $('sugerencias'), t = sinTildes(q).trim();
  let items = [];
  if (!t) {
    const fav = favoritos(), rec = recientes().filter(c => !fav.includes(c));
    items = [...fav.map(c => ({c, ico: '★'})), ...rec.map(c => ({c, ico: '↺'}))].filter(x => LOTES[x.c]).slice(0, 10)
      .map(x => ({tipo: 'lote', cod: x.c, txt: LOTES[x.c].hac, ico: x.ico}));
    if (!items.length) { box.classList.remove('abierta'); return; }
  } else {
    const ini = [], cont = [];
    for (const it of indice) {
      if (it.tipo === 'lote' && it.cod.startsWith(t)) ini.push(it);
      else if (it.n.includes(t)) (it.tipo === 'finca' ? ini : cont).push(it);
      if (ini.length > 40) break;
    }
    ini.sort((a, b) => (a.tipo === 'finca' ? -1 : 0) - (b.tipo === 'finca' ? -1 : 0) || a.cod.length - b.cod.length || a.cod.localeCompare(b.cod, 'es', {numeric: true}));
    items = [...ini, ...cont].slice(0, 9);
    if (!items.length) { box.innerHTML = '<div class="sug-vacio">Sin coincidencias. Pruebe con el código o parte del nombre.</div>'; box.classList.add('abierta'); return; }
  }
  box.innerHTML = items.map(it => `<button type="button" data-tipo="${it.tipo}" data-cod="${esc(it.cod)}"><i>${it.tipo === 'finca' ? '🏡' : (it.ico || '▣')}</i><span><b>${esc(it.cod)}</b><small>${esc(it.txt)}${it.sinMapa ? ' · sin polígono' : ''}</small></span></button>`).join('');
  box.classList.add('abierta');
}
function cerrarSugerencias() { $('sugerencias').classList.remove('abierta'); }
function bindBusqueda() {
  const q = $('q');
  q.addEventListener('input', () => { $('btnClearQ').hidden = !q.value; sugerir(q.value); });
  q.addEventListener('focus', () => sugerir(q.value));
  q.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = $('sugerencias').querySelector('button'); if (b) b.click(); } });
  $('btnClearQ').addEventListener('click', () => { q.value = ''; $('btnClearQ').hidden = true; q.focus(); sugerir(''); });
  $('sugerencias').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    q.blur(); cerrarSugerencias(); q.value = ''; $('btnClearQ').hidden = true;
    if (b.dataset.tipo === 'finca') abrirFinca(b.dataset.cod, true); else seleccionarLote(b.dataset.cod, {zoom: true, full: false});
  });
  document.addEventListener('pointerdown', e => { if (!e.target.closest('#buscador')) cerrarSugerencias(); });
}

/* ── Selección y tarjeta ── */
/* Al llevar el mapa a un lote, finca o ruta se suelta el seguimiento; si no, la siguiente lectura del GPS lo devolvería. */
function soltarSeguimiento() { if (typeof GPS !== 'undefined' && GPS.siguiendo && GPS.watch !== null) { GPS.siguiendo = false; pintarGpsBtn(); } }
function boundsDe(bb) { return L.latLngBounds([bb[1], bb[0]], [bb[3], bb[2]]); }
function seleccionarLote(cod, o = {}) {
  cod = codKey(cod); const l = LOTES[cod];
  if (!l) { toast('No encontré el lote ' + cod, {tipo: 'mal'}); return false; }
  selCod = cod; selFeat = o.feat || l.principal;
  if (o.modo) { S.selModo = o.modo; guardarAjustes(); }
  pintarSeleccion();
  if (!o.gps) { const r = [cod, ...recientes().filter(c => c !== cod)].slice(0, 10); escribirLS(REC_KEY, r); }
  if (o.full !== undefined) cardFull = o.full;
  if (o.zoom && l.bbox) soltarSeguimiento();
  if (o.zoom && l.bbox) map.fitBounds(boundsDe(porTablon() ? selFeat.bbox : l.bbox), Object.assign(margenes(90, 290), {maxZoom: 18}));
  if (!l.nPoly) toast('Este lote no tiene polígono en el shape.');
  mostrarTab('mapa'); renderCard();
  return true;
}
const porTablon = () => S.selModo === 'tablon' && !!selFeat;
function pintarSeleccion() {
  capaSel.clearLayers(); const l = LOTES[selCod]; if (!l) return;
  // Por tablón: se resalta el tablón y el resto del lote queda con contorno punteado.
  l.feats.forEach(f => { if (!porTablon() || f === selFeat) capaSel.addData(Object.assign({}, f, {_tenue: false})); else capaSel.addData(Object.assign({}, f, {_tenue: true})); });
}
function setSelModo(modo) { S.selModo = modo; guardarAjustes(); pintarSeleccion(); renderCard(); }
function seleccionarTablon(i) { const f = DATA.features[i]; if (f) seleccionarLote(f._cod, {feat: f, modo: 'tablon', zoom: true}); }
function cerrarCard() { selCod = ''; selFeat = null; capaSel.clearLayers(); $('card').className = 'card oculta'; ajustarCard(); }
function ajustarCard() {
  const el = $('card'), vis = !el.classList.contains('oculta');
  document.body.classList.toggle('con-card', vis); document.body.classList.toggle('card-full', vis && cardFull);
  if (vis && !cardFull) document.body.style.setProperty('--card-h', el.offsetHeight + 'px');
}
function cifra(rot, val, cls = '') { return `<div class="${cls}"><span>${rot}</span><b>${val}</b></div>`; }
function kv(k, v) { return v === '' || v === null || v === undefined || v === '—' ? '' : `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`; }
function renderCard() {
  const el = $('card'), l = LOTES[selCod];
  if (!l) { el.className = 'card oculta'; ajustarCard(); return; }
  const st = estadoLote(l), edad = edadMeses(l), c = centroideFeat(selFeat) || centroideLote(l);
  const fav = favoritos().includes(l.cod), enLista = typeof listaTiene === 'function' && listaTiene(l.cod), fijado = typeof GPS !== 'undefined' && GPS.fijado === l.cod;
  const llegar = c ? `https://www.google.com/maps/dir/?api=1&destination=${c[0].toFixed(6)},${c[1].toFixed(6)}&travelmode=driving` : '';
  const brecha = l.tchOpt > 0 && l.tchEst > 0 ? l.tchOpt - l.tchEst : null;
  const estim = l.conAforo ? (esMolienda(l) || l.tchEst > 0 ? fmtN(l.tchEst, '', nf1) : '—') : '—';
  const obs = typeof obsDeLote === 'function' ? obsDeLote(l.cod) : [];
  const tab = porTablon(), pt = selFeat ? selFeat.properties : {}, aT = Number(pt.Area_Ha) || 0;
  const tablones = l.feats.slice().sort((a, b) => String(a.properties.Tablon).localeCompare(String(b.properties.Tablon), 'es', {numeric: true}));
  el.className = 'card ' + (cardFull ? 'full' : 'peek');
  el.innerHTML = `
    <button type="button" class="card-asa" onclick="cardAlternar()" aria-label="Ampliar o reducir tarjeta"><i></i></button>
    <div class="card-top">
      <div class="card-id">
        <div class="card-cod">${tab ? 'Tablón ' + esc(pt.Tablon || '—') : 'Lote ' + esc(l.cod)} <small>${tab ? fmtN(pt.Area_Ha, ' ha') : fmtN(l.area, ' ha')}</small></div>
        <button type="button" class="card-finca" onclick="abrirFinca(LOTES[selCod].hac)">${tab ? 'Lote ' + esc(l.cod) + ' · ' : ''}${esc(l.hac)} ›</button>
      </div>
      <span class="chip est-${st.cls}">${esc(st.txt)}</span>
      <button type="button" class="card-x" onclick="cerrarCard()" aria-label="Cerrar">✕</button>
    </div>
    ${selFeat ? `<div class="segmento sel-modo"><button type="button" class="${tab ? '' : 'activo'}" onclick="setSelModo('lote')">Ver lote</button><button type="button" class="${tab ? 'activo' : ''}" onclick="setSelModo('tablon')">Ver tablón</button></div>` : ''}
    <div class="cifras">
      ${cifra('TCH anterior', l.tchAnt > 0 ? nf1.format(l.tchAnt) : '—')}${cifra('Estimado', estim, 'c-est')}${cifra('Optimista', l.tchOpt > 0 ? fmtN(l.tchOpt, '', nf1) : '—')}${cifra('Edad', edad === null ? '—' : nf1.format(edad) + ' m')}
    </div>
    ${corteHtml(l)}
    <div class="acciones">
      ${llegar ? `<a class="btn pri" href="${llegar}" target="_blank" rel="noopener">➤ Llegar</a>` : '<button class="btn pri" disabled>➤ Llegar</button>'}
      <button type="button" class="btn sec" onclick="abrirRegistro(selCod)">＋ Registrar</button>
      <button type="button" class="btn ter" onclick="cardAlternar()">${cardFull ? 'Menos ▾' : 'Más ▴'}</button>
    </div>
    <div class="solo-full">
      ${st.det ? `<div class="nota est-${st.cls}">${esc(st.det)}</div>` : ''}
      <div class="kvs">
        ${tab ? kv('Tablón', pt.Tablon) + kv('Área del tablón', `${nf.format(aT)} ha · ${nf.format(aT / 0.704225)} mz`) + kv('Parte del lote', l.areaShape ? nf0.format(aT / l.areaShape * 100) + ' % de ' + nf.format(l.areaShape) + ' ha' : '') + kv('Centro del tablón', c ? `${c[0].toFixed(5)}, ${c[1].toFixed(5)}` : '') : kv('Tablón tocado', pt.Tablon)}
        ${kv('Tablones del lote', l.nPoly ? `${l.nPoly} · ${nf.format(l.areaShape)} ha en shape` : 'Sin polígono')}
        ${kv('Variedad', l.variedad)}${kv('Zona', l.zona)}${kv('Riego', l.riego)}${kv('Tenencia', l.tenencia)}
        ${kv('Clasificación', l.clas || (l.conAforo ? '' : 'Sin aforo 26/27'))}${kv('N.º de corte', l.nc)}
        ${kv('Corte programado', l.fProg ? `${fechaCorta(l.fProg)}${l.semProg ? ' · semana ' + l.semProg.sem : ''}` : '')}${kv('Último corte', l.fCorte ? `${fechaCorta(l.fCorte)}${l.zafra ? ' · zafra ' + l.zafra : ''}` : '')}${kv('Días desde el corte', diasDesde(l.fCorte) === null ? '' : nf0.format(diasDesde(l.fCorte)))}
        ${kv('Toneladas estimadas', l.tonEst > 0 ? nf0.format(l.tonEst) + ' t' : '')}${kv('Toneladas optimistas', l.tonOpt > 0 ? nf0.format(l.tonOpt) + ' t' : '')}
        ${kv('Brecha vs. optimista', brecha === null ? '' : nf1.format(brecha) + ' t/ha')}
      </div>
      ${tab ? '<p class="pie">TCH, edad, variedad y aforo son datos del lote completo; el shape no los trae por tablón.</p>' : ''}
      ${tablones.length > 1 ? `<h4>Tablones del lote (${tablones.length})</h4><div class="tablones">${tablones.map(f => `<button type="button" class="${f === selFeat ? 'activo' : ''}" onclick="seleccionarTablon(${f._i})"><b>${esc(f.properties.Tablon || '—')}</b><span>${nf.format(f.properties.Area_Ha)} ha</span></button>`).join('')}</div>` : ''}
      <div class="mini-acc">
        <button type="button" onclick="favToggle(selCod)">${fav ? '★ Favorito' : '☆ Favorito'}</button>
        <button type="button" onclick="listaToggle(selCod)">${enLista ? '✓ En lista del día' : '＋ Lista del día'}</button>
        <button type="button" onclick="fijarLote(selCod)">${fijado ? '🔒 Lote fijado' : '🔓 Fijar lote'}</button>
        <button type="button" onclick="compartirLote(selCod)">↗ Compartir</button>
        <button type="button" onclick="copiarCoords()">📍 Copiar coord.</button>
        <button type="button" onclick="acercarLote()">⌕ Acercar</button>
      </div>
      <button type="button" class="btn sec ancho" id="btnHist" onclick="alternarHistorico()">📈 Histórico TCH</button>
      <div id="histBox" hidden></div>
      <div class="obs-lote"><h4>Registros de este lote</h4>${obs.length ? obs.slice(0, 5).map(obsFilaHtml).join('') : '<p class="vacio">Sin registros en este teléfono.</p>'}</div>
      <p class="pie">Datos al ${fechaCorta(META.datos_al || META.generated_at)}${META.cortes_al ? ' · cortes al ' + fechaCorta(META.cortes_al) : ' · sin cortes de la zafra en curso'}</p>
    </div>`;
  ajustarCard(); if (cardFull) el.scrollTop = 0;
}
function cardAlternar() { cardFull = !cardFull; renderCard(); }
function acercarLote() { const l = LOTES[selCod]; if (l && l.bbox) { soltarSeguimiento(); cardFull = false; renderCard(); map.fitBounds(boundsDe(porTablon() ? selFeat.bbox : l.bbox), Object.assign(margenes(90, 290), {maxZoom: 19})); } }
function copiarTexto(txt, ok = 'Copiado') {
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(() => toast(ok, {tipo: 'bien'})).catch(() => prompt('Copie:', txt)); else prompt('Copie:', txt);
}
function copiarCoords() { const c = centroideFeat(selFeat) || centroideLote(LOTES[selCod]); if (c) copiarTexto(`${c[0].toFixed(6)},${c[1].toFixed(6)}`, 'Coordenadas copiadas'); }
function enlaceLote(cod) { return location.origin + location.pathname + '?lote=' + encodeURIComponent(cod); }
function compartirLote(cod) {
  const l = LOTES[cod], c = centroideLote(l); if (!l) return;
  const txt = `Lote ${l.cod} · ${l.hac}\n${fmtN(l.area, ' ha')}${l.variedad ? ' · ' + l.variedad : ''}\nAbrir en CASUR Maps: ${enlaceLote(cod)}` + (c ? `\nCómo llegar: https://www.google.com/maps/dir/?api=1&destination=${c[0].toFixed(6)},${c[1].toFixed(6)}` : '');
  if (navigator.share) navigator.share({title: 'Lote ' + l.cod, text: txt}).catch(() => {}); else window.open('https://wa.me/?text=' + encodeURIComponent(txt), '_blank');
}

/* ── Histórico TCH dentro de la tarjeta ── */
async function alternarHistorico() {
  const box = $('histBox'); if (!box) return;
  if (!box.hidden) { box.hidden = true; return; }
  box.hidden = false; box.innerHTML = '<p class="vacio">Cargando histórico…</p>';
  try { const h = await cargarHistorico(); box.innerHTML = histSvg(((h || {}).lotes || {})[selCod]); }
  catch (e) { box.innerHTML = `<p class="vacio">${esc(e.message)}. Se guardará la próxima vez que abra con señal.</p>`; }
  box.scrollIntoView({block: 'nearest', behavior: 'smooth'});
}
function histSvg(item) {
  const rows = (item && item.historial || []).filter(r => Number(r.tch) > 0).sort((a, b) => a.zafra_code - b.zafra_code).slice(-8);
  if (!rows.length) return '<p class="vacio">Sin histórico de TCH para este lote.</p>';
  const v = rows.map(r => Number(r.tch)), avg = v.reduce((a, b) => a + b, 0) / v.length, W = 640, H = 260, ml = 16, mr = 16, mt = 34, mb = 38;
  const max = Math.ceil((Math.max(...v, avg) + 10) / 10) * 10, pw = W - ml - mr, ph = H - mt - mb, bw = Math.min(46, pw / rows.length * .62);
  const x = i => ml + (i + .5) * pw / rows.length, y = t => mt + (max - t) * ph / max;
  const bars = rows.map((r, i) => `<rect x="${(x(i) - bw / 2).toFixed(1)}" y="${y(r.tch).toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - mb - y(r.tch)).toFixed(1)}" rx="5" class="${r.tch >= avg ? 'hb-ok' : (r.tch < 55 ? 'hb-mal' : 'hb-med')}"/><text x="${x(i).toFixed(1)}" y="${(y(r.tch) - 7).toFixed(1)}" class="hv">${nf0.format(r.tch)}</text><text x="${x(i).toFixed(1)}" y="${H - 14}" class="hz">${esc(r.zafra || '')}</text>`).join('');
  return `<svg class="hist" viewBox="0 0 ${W} ${H}" role="img" aria-label="TCH por zafra">${bars}<line x1="${ml}" x2="${W - mr}" y1="${y(avg).toFixed(1)}" y2="${y(avg).toFixed(1)}" class="hprom"/><text x="${W - mr}" y="${(y(avg) - 6).toFixed(1)}" class="hpt">Prom. ${nf1.format(avg)}</text></svg>`;
}

/* ── Resumen de finca / productor ── */
function abrirFinca(nombre, zoom = false) {
  const f = FINCAS[nombre]; if (!f) return;
  const ls = f.lotes.map(c => LOTES[c]), mol = ls.filter(l => l.conAforo && esMolienda(l));
  const area = mol.reduce((s, l) => s + (l.areaAforo || 0), 0), ton = mol.reduce((s, l) => s + (l.tonEst || 0), 0), tonOpt = mol.reduce((s, l) => s + (l.tonOpt || 0), 0);
  const areaTot = ls.reduce((s, l) => s + (l.area || 0), 0);
  const rojos = ls.filter(l => estadoLote(l).cls === 'mal');
  const orden = ls.slice().sort((a, b) => ({mal: 0, medio: 1}[estadoLote(a).cls] ?? 2) - ({mal: 0, medio: 1}[estadoLote(b).cls] ?? 2) || a.cod.localeCompare(b.cod, 'es', {numeric: true}));
  abrirHoja(nombre, `
    <div class="cifras c4">${cifra('Lotes', ls.length)}${cifra('Área molienda', nf0.format(area) + ' ha')}${cifra('Toneladas', nf0.format(ton))}${cifra('TCH pond.', area ? nf1.format(ton / area) : '—', 'c-est')}</div>
    <p class="pie">Área total ${nf0.format(areaTot)} ha · optimista ${area ? nf1.format(tonOpt / area) : '—'} t/ha · ${rojos.length} lote(s) en prioridad alta</p>
    <div class="acciones"><button type="button" class="btn sec" onclick="verFincaEnMapa('${esc(nombre).replace(/'/g, '&#39;')}')">⌕ Ver en mapa</button></div>
    <div class="lista-lotes">${orden.map(l => { const s = estadoLote(l); return `<button type="button" onclick="cerrarHoja();seleccionarLote('${esc(l.cod)}',{zoom:true})"><b>${esc(l.cod)}</b><span>${fmtN(l.area, ' ha', nf1)} · ant. ${fmtN(l.tchAnt, '', nf0)} · est. ${l.tchEst > 0 ? nf0.format(l.tchEst) : '—'}</span><i class="chip est-${s.cls}">${esc(s.txt)}</i></button>`; }).join('')}</div>`);
  if (zoom) verFincaEnMapa(nombre, false);
}
function verFincaEnMapa(nombre, cerrar = true) { const f = FINCAS[nombre]; if (cerrar) cerrarHoja(); mostrarTab('mapa'); if (f && f.bbox) { soltarSeguimiento(); map.fitBounds(boundsDe(f.bbox), margenes(90, 40)); } }

/* ── Hoja de capas y herramientas ── */
function abrirCapas() {
  const op = (grupo, val, txt, act) => `<label class="opcion"><input type="radio" name="${grupo}" value="${val}" ${act ? 'checked' : ''}><span>${txt}</span></label>`;
  abrirHoja('Capas y herramientas', `
    <h4>Mapa base</h4><div class="opciones" id="opBase">${op('base', 'claro', 'Calles', S.base === 'claro')}${op('base', 'satelite', 'Satélite', S.base === 'satelite')}${op('base', 'ninguno', 'Sin mapa', S.base === 'ninguno')}</div>
    <h4>Al tocar el mapa, seleccionar</h4><div class="opciones col" id="opSel">${op('sel', 'lote', 'Lote completo', S.selModo !== 'tablon')}${op('sel', 'tablon', 'Tablón', S.selModo === 'tablon')}</div>
    <h4>Colorear lotes por</h4><div class="opciones col" id="opColor">${Object.entries(TEMAS).map(([k, t]) => op('color', k, t.t, S.colorear === k)).join('')}</div>
    <label class="interruptor"><input type="checkbox" id="opEtq" ${S.etiquetas ? 'checked' : ''}><span>Mostrar etiquetas (finca · lote · tablón según acercamiento)</span></label>
    <h4>Herramientas</h4>
    <div class="acciones"><button type="button" class="btn sec" onclick="cerrarHoja();medirIniciar('dist')">📏 Medir distancia</button><button type="button" class="btn sec" onclick="cerrarHoja();medirIniciar('area')">⬡ Medir área</button></div>
    <div class="acciones"><button type="button" class="btn ter" onclick="cerrarHoja();soltarSeguimiento();map.fitBounds(capaLotes.getBounds(),margenes(20,20,10))">🗺 Ver todos los lotes</button><button type="button" class="btn ter" onclick="guardarZonaOffline()">⬇ Guardar esta zona sin señal</button></div>`);
  $('opBase').addEventListener('change', e => setBase(e.target.value));
  $('opSel').addEventListener('change', e => setSelModo(e.target.value));
  $('opColor').addEventListener('change', e => setColorear(e.target.value));
  $('opEtq').addEventListener('change', e => { S.etiquetas = e.target.checked; guardarAjustes(); actualizarEtiquetas(); });
}

/* ── Medición de distancia y área ── */
const medir = {modo: null, pts: []};
function medirIniciar(modo) { medir.modo = modo; medir.pts = []; cerrarCard(); medirPintar(); toast(modo === 'area' ? 'Toque el mapa para marcar el contorno.' : 'Toque el mapa para marcar puntos.'); }
function medirPunto(ll) { medir.pts.push(L.latLng(ll.lat, ll.lng)); medirPintar(); }
function medirDeshacer() { medir.pts.pop(); medirPintar(); }
function medirCerrar() { medir.modo = null; medir.pts = []; capaMedir.clearLayers(); $('medirBar').hidden = true; }
function areaM2(pts) {
  if (pts.length < 3) return 0;
  const lat0 = pts.reduce((s, p) => s + p.lat, 0) / pts.length * Math.PI / 180, my = 111132.92 - 559.82 * Math.cos(2 * lat0), mx = 111412.84 * Math.cos(lat0) - 93.5 * Math.cos(3 * lat0);
  let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += (a.lng * mx) * (b.lat * my) - (b.lng * mx) * (a.lat * my); }
  return Math.abs(s) / 2;
}
function medirPintar() {
  capaMedir.clearLayers(); const p = medir.pts, bar = $('medirBar'); bar.hidden = !medir.modo;
  if (!medir.modo) return;
  p.forEach(pt => L.circleMarker(pt, {radius: 6, color: '#fff', weight: 2.5, fillColor: '#e6007e', fillOpacity: 1, interactive: false}).addTo(capaMedir));
  if (p.length >= 2) { L.polyline(p, {color: '#fff', weight: 7, opacity: .85, interactive: false}).addTo(capaMedir); L.polyline(p, {color: '#e6007e', weight: 3.5, interactive: false}).addTo(capaMedir); }
  if (medir.modo === 'area' && p.length >= 3) L.polygon(p, {color: '#e6007e', weight: 3, fillColor: '#e6007e', fillOpacity: .18, interactive: false}).addTo(capaMedir);
  let d = 0; for (let i = 1; i < p.length; i++) d += haversineM(p[i - 1].lng, p[i - 1].lat, p[i].lng, p[i].lat);
  let txt;
  if (medir.modo === 'area') {
    if (p.length < 3) txt = `Marque al menos 3 puntos (${p.length})`;
    else { const m2 = areaM2(p), ha = m2 / 10000, per = d + haversineM(p[p.length - 1].lng, p[p.length - 1].lat, p[0].lng, p[0].lat); txt = `<b>${nf.format(ha)} ha</b> · ${nf.format(ha / 0.704225)} mz · perímetro ${fmtDist(per)}`; }
  } else txt = p.length < 2 ? `Marque al menos 2 puntos (${p.length})` : `<b>${fmtDist(d)}</b> · ${p.length} puntos`;
  $('medirTxt').innerHTML = txt;
}
