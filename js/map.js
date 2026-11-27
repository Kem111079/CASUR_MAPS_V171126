/* CASUR Maps · mapa, capas temáticas, etiquetas, búsqueda, tarjeta del lote, resumen de finca y medición. */
'use strict';
let map, capaLotes, capaVelo, capaSel, capaEtiquetas, capaLista, capaMedir, baseLayers = {}, baseActiva = null;
let selCod = '', selFeat = null, cardFull = false, _histPedido = false;
/* Vista de la selección actual (lote o tablón). No se guarda: solo un toque sobre el mapa toma la preferencia
   «Al tocar el mapa, seleccionar» (S.selModo); buscar o abrir desde una lista siempre muestra el lote completo. */
let selVista = 'lote', selToque = false;
const VISTA_KEY = 'casur_maps_vista_v2', FAV_KEY = 'casur_maps_favoritos_v2', REC_KEY = 'casur_maps_recientes_v2';

/* ── Hoja modal genérica ── */
function abrirHoja(titulo, html, clase = '') {
  $('hojaTitulo').textContent = titulo; $('hojaBody').innerHTML = html;
  $('hoja').className = 'hoja abierta ' + clase; $('hojaFondo').classList.add('abierta'); histPedir();
}
function cerrarHoja() {
  $('hoja').classList.remove('abierta'); $('hojaFondo').classList.remove('abierta');
  if (typeof soltarRegistro === 'function') soltarRegistro(); else if (typeof detenerDictado === 'function') detenerDictado();
  histPedir();
}

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
  nivelEstilo = nivelZoom(map.getZoom() || 0);
  capaLotes = L.geoJSON(DATA, {
    style: estiloFeat,
    onEachFeature: (f, layer) => {
      f._layer = layer;
      layer.on('click', e => {
        if (medir.modo) { L.DomEvent.stopPropagation(e); medirPunto(e.latlng); return; }
        if (e.originalEvent) e.originalEvent._lote = true; // el mismo toque llega luego al mapa: que no cierre lo que acaba de abrir
        seleccionarLote(f._cod, {feat: f, toque: true});
      });
      layer.on('contextmenu', e => { L.DomEvent.stop(e); if (!medir.modo) menuLote(f); }); // toque largo
    }
  }).addTo(map);
  // Velo: al seleccionar un lote, el resto del mapa baja de intensidad (una sola figura; no se restilan 8,000 polígonos).
  capaSel = L.geoJSON(null, {interactive: false, style: estiloSel}).addTo(map);
  capaEtiquetas = L.layerGroup().addTo(map);
  capaLista = L.layerGroup().addTo(map);
  capaMedir = L.layerGroup().addTo(map);
  map.on('click', e => { if (medir.modo) medirPunto(e.latlng); else if (!(e.originalEvent && e.originalEvent._lote)) toqueVacio(); });
  map.on('dblclick', () => clearTimeout(_vacioT)); // el doble toque es para acercar, no para cerrar la tarjeta
  map.on('moveend zoomend', () => { etiquetasDebounce(); guardarVista(); });
  map.on('zoomend', () => { const n = nivelZoom(map.getZoom()); if (n !== nivelEstilo) { nivelEstilo = n; restilar(); } });
  map.on('zoomend', () => { if (panorama && map.getZoom() > 15.5) { panorama = null; pintarPanorama(); } });
  map.on('dragstart', () => { if (typeof GPS !== 'undefined') { GPS.siguiendo = false; pintarGpsBtn(); } });
  // La leyenda se pliega con el primer arrastre o zoom del usuario; fitBounds, setView y el GPS no disparan estos eventos.
  map.on('dragstart dblclick', leyPorUsuario);
  const cont = map.getContainer();
  cont.addEventListener('wheel', leyPorUsuario, {passive: true});
  cont.addEventListener('touchstart', e => { if (e.touches.length > 1) leyPorUsuario(); }, {passive: true});
  cont.addEventListener('keydown', e => { if (['+', '-', '=', '_', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) leyPorUsuario(); });
  $('leyenda').addEventListener('pointerdown', () => { if (!leyPlegada) leyArmar(); }); // usar la leyenda reinicia los 30 s
  const v = leerLS(VISTA_KEY, null);
  if (v && Number.isFinite(v.lat)) map.setView([v.lat, v.lng], v.z); else map.fitBounds(capaLotes.getBounds(), margenes(20, 20, 10));
  // Se agrega con la vista ya definida y antes de cualquier selección, para quedar bajo el resaltado y sobre los lotes.
  capaVelo = L.rectangle([[5, -95], [18, -78]], {interactive: false, stroke: false, fillColor: '#ffffff', fillOpacity: 0}).addTo(map);
  actualizarEtiquetas(); pintarLeyenda(); leyArmar();
}
let _vistaT = null;
/* Tocar el mapa fuera de los lotes: la tarjeta completa se pliega a compacta; la compacta se cierra y se quita el velo.
   Espera un instante para no actuar si el toque era el primero de un doble toque. */
let _vacioT = 0;
function toqueVacio() {
  clearTimeout(_vacioT); if (!selCod) return;
  const cod = selCod;
  _vacioT = setTimeout(() => {
    if (selCod !== cod || medir.modo || document.body.dataset.tab !== 'mapa' || $('hoja').classList.contains('abierta')) return;
    if (cardFull) { cardFull = false; renderCard(); } else cerrarCard();
  }, 300);
}
function guardarVista() { clearTimeout(_vistaT); _vistaT = setTimeout(() => { const c = map.getCenter(); escribirLS(VISTA_KEY, {lat: c.lat, lng: c.lng, z: map.getZoom()}); }, 600); }
function setBase(nombre, repintar = true) {
  if (baseActiva) map.removeLayer(baseActiva);
  baseActiva = baseLayers[nombre]; baseActiva.addTo(map); S.base = nombre; guardarAjustes();
  document.body.dataset.base = nombre;
  if (repintar && capaLotes) { restilar(); actualizarEtiquetas(); }
}

/* ── Capas temáticas: una sola variable a la vez, rampa única y leyenda con hectáreas ── */
const GR_CORTE = ['Planta', 'Corte 2', 'Corte 3', 'Corte 4', 'Corte 5', 'Mayor a 5'];
const RAMPA = ['#0d0887', '#7e03a8', '#cc4778', '#f89540', '#f0f921'];
// Producción (t/ha): < 40 rojo · 40–55 morado · 55–70 mostaza · 70–85 verde · > 85 verde oscuro
const RAMPA_TCH = ['#d7191c', '#7e03a8', '#d4a017', '#3fa34d', '#14532d'];
/* Categóricas: paleta Okabe-Ito (segura para daltonismo) fijada por valor, para que un color no cambie cuando cambian las hectáreas.
   Los valores nuevos toman un color de reserva por orden de área; más allá de 8 colores van a «Otras».
   «Sin dato», «Sin aforo» y «VARIEDADES» son neutros: gris rayado y al final de la leyenda. */
const OI = {azul: '#0072B2', naranja: '#E69F00', verde: '#009E73', purpura: '#CC79A7', celeste: '#56B4E9', amarillo: '#F0E442', bermellon: '#D55E00'};
const CATS_RESERVA = ['#882255', '#44AA99', '#999933', '#332288', '#AA4499'];
const CATS_MAX = 8, COLOR_OTRAS = '#7b8794';
const CAT_COLORES = {
  zona: {'1-Sur': OI.azul, '2-Centro': OI.naranja, '3-Norte': OI.verde, '5-Productores': OI.purpura},
  riego: {Gravedad: OI.azul, Secano: OI.naranja, Goteo: OI.verde, Aspersion: OI.celeste, Ventana: OI.amarillo, Pivote: OI.purpura, 'Mini-Aspersion': '#882255'},
  variedad: {'CP 72-2086': OI.azul, 'NA 56-42': OI.naranja, 'B 82-333': OI.verde, 'RB 84-5210': OI.purpura, 'RB 86-7515': OI.celeste, 'CG02-163': OI.amarillo, 'MX 79-431': OI.bermellon},
  destino: {Molienda: OI.verde, Semilla: OI.celeste, 'Sin Caña': OI.amarillo, 'Baja rentabilidad': OI.bermellon, Investigacion: OI.purpura}
};
const CAT_NEUTROS = new Set(['', 'SIN DATO', 'SIN AFORO', 'VARIEDADES', 'SIN DEFINIR']);
const esNeutro = k => CAT_NEUTROS.has(sinTildes(k).trim());
const TEMAS = {
  ninguno: {t: 'Sin color'},
  tchEst: {t: 'TCH estimado 26/27', u: 't/ha', val: l => esMolienda(l) && l.tchEst > 0 ? l.tchEst : null, cortes: [40, 55, 70, 85], rampa: RAMPA_TCH},
  edad: {t: 'Edad desde el corte', u: 'meses', val: edadMeses, cortes: [3, 6, 9, 12]},
  zona: {t: 'Zona', cat: l => l.zona || 'Sin dato'},
  riego: {t: 'Tipo de riego', cat: l => l.riego || 'Sin dato'},
  variedad: {t: 'Variedad', cat: l => l.variedad || 'Sin dato'},
  destino: {t: 'Destino / clasificación', cat: l => l.conAforo ? (l.clas || 'Sin dato') : 'Sin aforo'},
  socas: {t: 'Plantillas y socas', clave: l => { const i = GR_CORTE.indexOf(l.grCorte); return i < 0 ? null : i; }, clases: () => [
    {txt: 'Plantilla', color: '#1a9850'}, {txt: 'Soca · corte 2', color: '#a6d96a'}, {txt: 'Soca · corte 3', color: '#fee08b'},
    {txt: 'Soca · corte 4', color: '#fdae61'}, {txt: 'Soca · corte 5', color: '#f46d43'}, {txt: 'Soca · más de 5', color: '#a50026'}]},
  renovacion: {t: 'Propuesta de renovación', clave: l => l.renovar === true ? 0 : l.renovar === false ? 1 : null, clases: () => [
    {txt: 'Renovar', color: '#d7191c'}, {txt: 'No renovar', color: '#74add1'}]},
  semana: {t: 'Semana de corte', sin: 'Sin fecha', clave: claseCorte, clases: () => [
    {txt: 'Fecha vencida', color: '#d7191c'},
    {txt: SEMANAS_PROX[0] ? `Sem. ${SEMANAS_PROX[0].sem} · ${rangoSemana(SEMANAS_PROX[0])}` : 'Próxima semana', color: '#ff8c00'},
    {txt: SEMANAS_PROX[1] ? `Sem. ${SEMANAS_PROX[1].sem} · ${rangoSemana(SEMANAS_PROX[1])}` : 'Semana siguiente', color: '#1f77b4'},
    {txt: 'Más adelante', color: '#cde8c4'},
    {txt: 'Cosechado', color: '#6b7280'}]}
};
if (!TEMAS[S.colorear]) S.colorear = 'ninguno'; // capas retiradas (TCH última zafra, brecha)
let temaColor = new Map(), temaLeyenda = [], temaClase = new Map(), temaFiltro = null;
function prepararTema() {
  temaColor = new Map(); temaLeyenda = []; temaClase = new Map();
  const T = TEMAS[S.colorear] || TEMAS.ninguno, lotes = Object.values(LOTES).filter(l => l.nPoly);
  if (T.cortes) {
    const c = T.cortes, rotulos = [`< ${c[0]}`, ...c.slice(0, -1).map((v, i) => `${v} – ${c[i + 1]}`), `> ${c[c.length - 1]}`];
    const ha = new Array(rotulos.length).fill(0), n = ha.slice(); let sin = 0, nSin = 0;
    const R = T.rampa || RAMPA;
    lotes.forEach(l => { const v = T.val(l); if (v === null || v === undefined) { sin += l.areaShape; nSin++; return; } let i = c.findIndex(x => v < x); if (i < 0) i = c.length; temaColor.set(l.cod, R[i]); temaClase.set(l.cod, rotulos[i]); ha[i] += l.areaShape; n[i]++; });
    temaLeyenda = rotulos.map((r, i) => ({color: R[i], txt: r, ha: ha[i], n: n[i]})).filter(x => x.n);
    if (sin > 0) temaLeyenda.push({color: null, txt: 'Sin dato', ha: sin, n: nSin});
  } else if (T.clases) {
    const defs = T.clases(), ha = defs.map(() => 0), n = defs.map(() => 0); let sin = 0, nSin = 0;
    lotes.forEach(l => { const i = T.clave(l); if (i === null) { sin += l.areaShape; nSin++; return; } temaColor.set(l.cod, defs[i].color); temaClase.set(l.cod, defs[i].txt); ha[i] += l.areaShape; n[i]++; });
    temaLeyenda = defs.map((d, i) => ({color: d.color, txt: d.txt, ha: ha[i], n: n[i]})).filter(x => x.n);
    if (sin > 0) temaLeyenda.push({color: null, txt: T.sin || 'Sin dato', ha: sin, n: nSin});
  } else if (T.cat) {
    const ha = {}, n = {}; lotes.forEach(l => { const k = T.cat(l); ha[k] = (ha[k] || 0) + l.areaShape; n[k] = (n[k] || 0) + 1; });
    const fijos = CAT_COLORES[S.colorear] || {}, reserva = CATS_RESERVA.slice(), col = {};
    const orden = Object.keys(ha).sort((a, b) => ha[b] - ha[a]), reales = orden.filter(k => !esNeutro(k)), neutros = orden.filter(esNeutro);
    let usados = reales.filter(k => fijos[k]).length;
    reales.forEach(k => { if (fijos[k]) col[k] = fijos[k]; else if (usados < CATS_MAX && reserva.length) { col[k] = reserva.shift(); usados++; } });
    reales.filter(k => col[k]).forEach(k => temaLeyenda.push({color: col[k], txt: k, ha: ha[k], n: n[k]}));
    const otras = reales.filter(k => !col[k]);
    if (otras.length) temaLeyenda.push({color: COLOR_OTRAS, txt: 'Otras', ha: otras.reduce((s, k) => s + ha[k], 0), n: otras.reduce((s, k) => s + n[k], 0)});
    neutros.forEach(k => temaLeyenda.push({color: null, txt: k, ha: ha[k], n: n[k]}));
    lotes.forEach(l => { const k = T.cat(l); if (esNeutro(k)) { temaClase.set(l.cod, k); return; } temaColor.set(l.cod, col[k] || COLOR_OTRAS); temaClase.set(l.cod, col[k] ? k : 'Otras'); });
  }
}
/* Estilo por nivel de zoom, para que la vista general se lea: 0 = z ≤ 11 (sin contorno oscuro: el borde toma el
   color del relleno, así cada lote se ve como una mancha limpia de su clase y no desaparece por ser pequeño),
   1 = z 12–14 (contorno fino 0.4 px al 50 %), 2 = z ≥ 15 (contorno completo). Solo se restila al cruzar un umbral. */
const nivelZoom = z => z < 12 ? 0 : z < 15 ? 1 : 2;
const estiloPlano = (col, op) => ({stroke: true, color: col, weight: 1, opacity: op, fillColor: col, fillOpacity: op});
let nivelEstilo = 2;
function estiloFeat(f) {
  const sat = S.base === 'satelite', oscuro = S.base === 'ninguno' && temaEfectivo() === 'oscuro', n = nivelEstilo;
  if (temaFiltro !== null && (temaClase.get(f._cod) || (TEMAS[S.colorear] || {}).sin || 'Sin dato') !== temaFiltro) {
    if (n === 0) return estiloPlano(sat || oscuro ? '#ffffff' : '#9aa3ad', sat || oscuro ? .12 : .2);
    return {stroke: true, color: sat || oscuro ? '#ffffff' : '#9aa3ad', weight: n === 1 ? .4 : .5, opacity: n === 1 ? .35 : .45, fillColor: '#9aa3ad', fillOpacity: .04};
  }
  if (S.colorear === 'ninguno') {
    if (n === 0) return estiloPlano(sat ? '#ffffff' : oscuro ? '#9cc3ea' : '#3d6b99', sat ? .5 : oscuro ? .45 : .55);
    if (n === 1) return {stroke: true, color: sat || oscuro ? '#ffffff' : '#0b3a66', weight: sat ? 1 : .6, opacity: sat ? .85 : .6, fillColor: sat ? '#ffffff' : '#3d6b99', fillOpacity: sat ? .08 : .2};
    return {stroke: true, color: sat || oscuro ? '#ffffff' : '#0b3a66', weight: sat ? 1.6 : 1, opacity: sat ? .95 : .8, fillColor: sat ? '#ffffff' : '#3d6b99', fillOpacity: sat ? .05 : .13};
  }
  const c = temaColor.get(f._cod);
  if (!c) {
    if (n === 0) return estiloPlano('#9aa3ad', .45);
    return {stroke: true, color: sat ? '#ffffff' : '#7b8794', weight: n === 1 ? .4 : .8, opacity: n === 1 ? .5 : .7, fillColor: '#9aa3ad', fillOpacity: n === 1 ? .2 : .12};
  }
  const filtrado = temaFiltro !== null; // la clase elegida se pinta más intensa sobre el resto atenuado
  if (n === 0) return estiloPlano(c, filtrado ? .95 : sat ? .8 : .85);
  if (sat) return {stroke: true, color: '#ffffff', weight: n === 1 ? .5 : .8, opacity: n === 1 ? .6 : .9, fillColor: c, fillOpacity: filtrado ? .8 : n === 1 ? .7 : .65};
  if (n === 1) return {stroke: true, color: oscuro ? '#e6edf3' : '#1c2733', weight: .4, opacity: oscuro ? .35 : .5, fillColor: c, fillOpacity: filtrado ? .85 : .72};
  return {stroke: true, color: '#1c2733', weight: .7, opacity: .9, fillColor: c, fillOpacity: .68};
}
/* Resaltado del lote seleccionado. Sin capa: contorno dorado y relleno amarillo suave.
   Con capa temática: solo contorno dorado grueso (con halo oscuro para que se vea sobre la mostaza) y el lote
   conserva el color de su clase, redibujado sobre el velo que atenúa el resto del mapa. */
function estiloSel(f) {
  if (f._tenue) return {color: '#ffd400', weight: 2, opacity: .9, dashArray: '6 6', fillOpacity: 0};
  if (S.colorear === 'ninguno') return {color: '#ffd400', weight: 4.5, opacity: 1, fillColor: '#ffd400', fillOpacity: .18};
  if (f._halo) return {color: '#1c2733', weight: 9, opacity: .5, fill: false};
  const e = estiloFeat(f);
  return {color: '#ffd400', weight: 5, opacity: 1, fillColor: e.fillColor, fillOpacity: e.fillOpacity};
}
function setColorear(modo) {
  S.colorear = modo; temaFiltro = null; guardarAjustes(); prepararTema(); restilar();
  leyPlegada = false; pintarLeyenda(); leyArmar(); actualizarEtiquetas();
}
/* Vuelve a pintar los lotes y el resaltado del lote seleccionado (cambio de capa, filtro o mapa base). */
function restilar() { capaLotes.setStyle(estiloFeat); if (capaSel) capaSel.setStyle(estiloSel); }
function filtrarClase(clase) { temaFiltro = clase; restilar(); pintarLeyenda(); leyArmar(); }

/* ── Leyenda: desplegada al cambiar de capa; se pliega sola a los 30 s sin uso o al primer arrastre o zoom
   del usuario (no con fitBounds ni con el GPS). Con un filtro de clase activo no se pliega sola.
   Plegada es una píldora con el nombre de la capa y una franja de colores; un toque la despliega. ── */
const LEY_MS = 30000;
let leyPlegada = false, _leyT = null, _leyCardCod = '';
const leyVisible = () => S.colorear !== 'ninguno' && temaLeyenda.length > 0;
function leyArmar() { clearTimeout(_leyT); _leyT = null; if (!leyPlegada && temaFiltro === null && leyVisible()) _leyT = setTimeout(() => leyPlegar(), LEY_MS); }
function leyPlegar(forzar = false) { clearTimeout(_leyT); _leyT = null; if (leyPlegada || (temaFiltro !== null && !forzar)) return; leyPlegada = true; pintarLeyenda(); }
function leyDesplegar() {
  leyPlegada = false; pintarLeyenda(); leyArmar();
  const cu = document.querySelector('#leyenda .ley-cuerpo'), b = cu && cu.querySelector('strong'); // con un lote abierto, mostrar la fila de su clase
  if (b) { const f = b.closest('button'), y = f.offsetTop - cu.offsetTop; if (y + f.offsetHeight > cu.clientHeight) cu.scrollTop = y - 8; }
}
function leyAlternar() { if (leyPlegada) leyDesplegar(); else leyPlegar(true); }
function leyPorUsuario() { if (!leyPlegada && leyVisible()) leyPlegar(); }
/* Con la tarjeta abierta la leyenda queda como píldora (al abrir o cambiar de lote); el usuario puede volver a desplegarla. */
function leyPorCard(vis) {
  if (vis && selCod !== _leyCardCod) { _leyCardCod = selCod; leyPlegada = true; clearTimeout(_leyT); _leyT = null; pintarLeyenda(); }
  else if (!vis && _leyCardCod) { _leyCardCod = ''; pintarLeyenda(); }
}
const pctTxt = p => p > 0 && p < 1 ? '< 1 %' : nf0.format(p) + ' %';
const lotesTxt = n => n === 1 ? '1 lote' : nf0.format(n) + ' lotes';
function pintarLeyenda() {
  const el = $('leyenda'); if (!el) return;
  if (!leyVisible()) { el.classList.add('oculta'); clearTimeout(_leyT); _leyT = null; return; }
  const T = TEMAS[S.colorear], total = temaLeyenda.reduce((s, x) => s + x.ha, 0) || 1;
  const filtro = temaFiltro !== null ? temaLeyenda.find(x => x.txt === temaFiltro) : null;
  const claseSel = selCod && LOTES[selCod] ? (temaClase.get(selCod) || T.sin || 'Sin dato') : null;
  const antes = el.classList.contains('plegada'), estabaOculta = el.classList.contains('oculta');
  el.className = 'leyenda' + (leyPlegada ? ' plegada' : '') + (filtro ? ' con-filtro' : '');
  el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Leyenda: ' + T.t);
  const muestra = c => `<span class="ley-color" style="${c ? 'background:' + c : ''}"></span>`;
  const franja = `<span class="ley-franja" aria-hidden="true">${temaLeyenda.filter(x => x.color).slice(0, 8).map(x => `<span style="background:${x.color}"></span>`).join('')}</span>`;
  const cab = leyPlegada && filtro
    ? `${muestra(filtro.color)}<span class="ley-pf"><small>${esc(T.t)}</small><b>Solo ${esc(rotulo(filtro.txt))} · ${nf0.format(filtro.ha)} ha</b></span>`
    : leyPlegada ? `${franja}<b>${esc(T.t)}</b>` : `<b>${esc(T.t)}</b>${T.u ? ` <small>${esc(T.u)}</small>` : ''}`;
  el.innerHTML = `<button type="button" class="ley-cab" aria-expanded="${!leyPlegada}" aria-controls="leyCuerpo" aria-label="${esc(T.t)}: ${leyPlegada ? 'mostrar' : 'ocultar'} leyenda${filtro ? ' (filtro: ' + esc(rotulo(filtro.txt)) + ')' : ''}">${cab}<i>${ico('chevDown')}</i></button>` +
    (leyPlegada && filtro ? `<button type="button" class="ley-quitar" aria-label="Quitar filtro y ver todos los lotes">${ico('x')}</button>` : '') +
    `<div class="ley-cuerpo" id="leyCuerpo">` +
    temaLeyenda.map(x => { const p = x.ha / total * 100, on = temaFiltro === x.txt; return `<button type="button" class="${on ? 'activo' : temaFiltro !== null ? 'apagado' : ''}${x.color ? '' : ' neutro'}" data-clase="${esc(x.txt)}" aria-pressed="${on}" style="--p:${Math.min(100, p).toFixed(1)}%${x.color ? ';--c:' + x.color : ''}">${muestra(x.color)}<span class="ley-txt"><b>${esc(rotulo(x.txt))}</b><small>${x.n ? lotesTxt(x.n) + ' · ' : ''}${nf0.format(x.ha)} ha${claseSel === x.txt ? ' · <strong>este lote</strong>' : ''}</small></span><em>${pctTxt(p)}</em></button>`; }).join('') +
    `<small class="ley-pista">${temaFiltro !== null ? 'Toque de nuevo para ver todo' : 'Toque una clase para resaltarla'}</small></div>`;
  el.querySelector('.ley-cab').onclick = leyAlternar;
  const q = el.querySelector('.ley-quitar'); if (q) q.onclick = () => filtrarClase(null);
  el.querySelector('.ley-cuerpo').onclick = e => { const b = e.target.closest('button[data-clase]'); if (!b) return; filtrarClase(temaFiltro === b.dataset.clase ? null : b.dataset.clase); };
  if (!estabaOculta && antes !== leyPlegada && el.animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    el.animate([{opacity: .3, transform: 'scale(.96)'}, {opacity: 1, transform: 'none'}], {duration: 250, easing: 'cubic-bezier(.2,.8,.2,1)'});
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
    for (const f of DATA.features) { if (!toca(f.bbox)) continue; const c = centroideFeat(f); if (!c) continue; const l = LOTES[f._cod]; const nc = S.etqNc ? ncCorto(l) : ''; if (poner(c, (l && l.nPoly > 1 ? `${f._cod} · ${f.properties.Tablon || ''}` : f._cod) + (nc ? ' · ' + nc : ''), 'etq-tab') && ++k > 260) break; }
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
  const nc = S.etqNc ? ncCorto(l) : '', base = l.cod + (nc ? ' · ' + nc : '');
  if (S.colorear !== 'semana') return base;
  const c = claseCorte(l); if (c === null || c > 2) return base;
  const d = parseISO(l.fProg);
  return `${base} · ${d.getDate()} ${d.toLocaleDateString('es-NI', {month: 'short'}).replace('.', '')}`;
}
/* Etiqueta de cosecha de la tarjeta: fecha programada, días que faltan y semana; alerta si la fecha ya pasó. */
/* Cosecha del lote para la tarjeta: texto de una línea y, si la fecha ya pasó, una alerta aparte. */
function corteInfo(l) {
  if (l.cosechado) return {txt: `${ico('check')} Cosechado el ${fechaCorta(l.fCorte)}`, alerta: ''};
  if (!l.fProg) return {txt: '', alerta: ''};
  const d = diasPara(l.fProg), w = l.semProg;
  if (d < 0) return {txt: '', alerta: `<div class="corte est-mal">${ico('alert')} Fecha de corte vencida: ${fechaCorta(l.fProg)} (hace ${-d} día${d === -1 ? '' : 's'}). Actualice el programa o cargue el corte.</div>`};
  return {txt: `<span class="${d <= 14 ? 'pronto' : ''}">${ico('calendar')} Corte ${fechaCorta(l.fProg)} · ${d === 0 ? '<b>hoy</b>' : `faltan <b>${d}</b> d`}${w ? ' · sem. ' + w.sem : ''}</span>`, alerta: ''};
}
/* Mini gráfico del TCH de las últimas zafras, dentro de la casilla "TCH anterior". */
function chispa(cod) {
  const it = HIST && HIST.lotes && HIST.lotes[cod]; if (!it) return '';
  const v = (it.historial || []).filter(r => Number(r.tch) > 0).sort((a, b) => a.zafra_code - b.zafra_code).slice(-8).map(r => Number(r.tch));
  if (v.length < 3) return '';
  const mn = Math.min(...v), mx = Math.max(...v), W = 76, H = 18, y = t => (H - 3 - (mx === mn ? .5 : (t - mn) / (mx - mn)) * (H - 6)).toFixed(1), x = i => (2 + i * (W - 4) / (v.length - 1)).toFixed(1);
  const sube = v[v.length - 1] >= v[0];
  return `<svg class="chispa ${sube ? 'sube' : 'baja'}" viewBox="0 0 ${W} ${H}" aria-label="TCH de las últimas ${v.length} zafras"><polyline points="${v.map((t, i) => x(i) + ',' + y(t)).join(' ')}"/><circle cx="${x(v.length - 1)}" cy="${y(v[v.length - 1])}" r="2.4"/></svg><small class="chispa-txt" title="Primera y última zafra del gráfico">${nf0.format(v[0])} → ${nf0.format(v[v.length - 1])}</small>`;
}

/* ── Búsqueda por código, productor o finca (sin tildes), con recientes y favoritos ── */
let indice = [];
function construirIndice() {
  indice = Object.values(LOTES).map(l => ({tipo: 'lote', cod: l.cod, txt: l.hac, n: l.cod + ' ' + sinTildes(l.hac), sinMapa: !l.nPoly}));
  Object.values(FINCAS).forEach(f => indice.push({tipo: 'finca', cod: f.nombre, txt: `${f.lotes.length} lotes`, n: sinTildes(f.nombre)}));
}
const favoritos = () => leerLS(FAV_KEY, []);
const recientes = () => leerLS(REC_KEY, []);
function favToggle(cod) { let f = favoritos(); f = f.includes(cod) ? f.filter(x => x !== cod) : [cod, ...f].slice(0, 40); escribirLS(FAV_KEY, f); if (selCod) renderCard(); toast(f.includes(cod) ? 'Agregado a favoritos' : 'Quitado de favoritos'); }
function sugerir(q) {
  const box = $('sugerencias'), t = sinTildes(q).trim();
  let items = [];
  if (!t) {
    const fav = favoritos(), rec = recientes().filter(c => !fav.includes(c));
    items = [...fav.map(c => ({c, ico: 'starFill'})), ...rec.map(c => ({c, ico: 'clock'}))].filter(x => LOTES[x.c]).slice(0, 10)
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
  box.innerHTML = items.map(it => `<div class="sug-fila"><button type="button" data-tipo="${it.tipo}" data-cod="${esc(it.cod)}"><i>${ico(it.tipo === 'finca' ? 'home' : (it.ico || 'lot'))}</i><span><b>${esc(it.cod)}</b><small>${esc(it.txt)}${it.sinMapa ? ' · sin polígono' : ''}</small></span></button>${it.tipo === 'lote' ? llegarHtml(it.cod) : ''}</div>`).join('');
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
  selCod = cod; selFeat = o.feat || l.principal; selToque = !!o.toque;
  selVista = o.modo || (o.toque ? S.selModo : 'lote');
  pintarSeleccion();
  if (!o.gps) { const r = [cod, ...recientes().filter(c => c !== cod)].slice(0, 10); escribirLS(REC_KEY, r); }
  if (o.full !== undefined) cardFull = o.full;
  if (o.zoom && l.bbox) soltarSeguimiento();
  if (o.zoom && l.bbox) map.fitBounds(boundsDe(porTablon() ? selFeat.bbox : l.bbox), Object.assign(margenes(90, 290), {maxZoom: 18}));
  if (!l.nPoly) toast('Este lote no tiene polígono en el shape.');
  mostrarTab('mapa'); renderCard();
  return true;
}
const porTablon = () => selVista === 'tablon' && !!selFeat && LOTES[selCod] && LOTES[selCod].nPoly > 1;
let _pulso = 0;
function pintarSeleccion() {
  capaSel.clearLayers(); const l = LOTES[selCod];
  const oscuro = S.base === 'satelite' || (S.base === 'ninguno' && temaEfectivo() === 'oscuro');
  capaVelo.setStyle({fillColor: oscuro ? '#000000' : '#ffffff', fillOpacity: l && l.nPoly ? (oscuro ? .38 : .42) : 0});
  if (!l) return;
  // Por tablón: se resalta el tablón y el resto del lote queda con contorno punteado.
  const tema = S.colorear !== 'ninguno';
  l.feats.forEach(f => {
    const tenue = porTablon() && f !== selFeat;
    if (tema && !tenue) capaSel.addData(Object.assign({}, f, {_tenue: false, _halo: true}));
    capaSel.addData(Object.assign({}, f, {_tenue: tenue, _halo: false}));
  });
  // Realce breve al seleccionar: sin capa, el relleno aparece intenso y baja en ~350 ms; con capa, solo el contorno se afina.
  const turno = ++_pulso, t0 = performance.now();
  const paso = t => { if (turno !== _pulso) return; const k = Math.min(1, (t - t0) / 350); capaSel.eachLayer(ly => { const ft = ly.feature; if (ft._tenue || ft._halo) return; ly.setStyle(tema ? {weight: 9 - 4 * k} : {fillOpacity: .55 - .37 * k}); }); if (k < 1) requestAnimationFrame(paso); };
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) requestAnimationFrame(paso);
}
/* Toque largo sobre un lote: menú rápido sin abrir la tarjeta completa. */
function menuLote(f) {
  const l = LOTES[f._cod]; if (!l) return; vibrar(30);
  const c = centroideFeat(f), st = estadoLote(l);
  abrirHoja(`Lote ${l.cod}`, `<p class="pie">${esc(l.hac)} · ${fmtN(l.area, ' ha')}${f.properties.Tablon ? ' · tablón ' + esc(f.properties.Tablon) : ''} · <span class="chip est-${st.cls}">${esc(st.txt)}</span></p>
    <div class="menu-rapido">
      <button type="button" onclick="cerrarHoja();seleccionarLote('${esc(l.cod)}',{feat:DATA.features[${f._i}],toque:true});abrirRegistro('${esc(l.cod)}')">${ico('plus')}<span>Registrar hallazgo</span></button>
      <button type="button" onclick="cerrarHoja();listaToggle('${esc(l.cod)}')">${ico(listaTiene(l.cod) ? 'check' : 'listPlus')}<span>${listaTiene(l.cod) ? 'Quitar de la lista' : 'Lista del día'}</span></button>
      ${c ? `<a href="${urlLlegar(c[0], c[1])}" target="_blank" rel="noopener" onclick="cerrarHoja()">${ico('nav')}<span>Llegar</span></a>` : ''}
      <button type="button" onclick="cerrarHoja();seleccionarLote('${esc(l.cod)}',{feat:DATA.features[${f._i}],toque:true,full:true})">${ico('file')}<span>Ver ficha</span></button>
      <button type="button" onclick="cerrarHoja();favToggle('${esc(l.cod)}')">${ico(favoritos().includes(l.cod) ? 'starFill' : 'star')}<span>Favorito</span></button>
      ${l.nPoly > 1 ? `<button type="button" onclick="cerrarHoja();seleccionarLote('${esc(l.cod)}',{feat:DATA.features[${f._i}],toque:true,modo:'tablon'})">${ico('lot')}<span>Ver tablón</span></button>` : ''}
    </div>`);
}
function setSelModo(modo) { S.selModo = modo; guardarAjustes(); if (selCod) verComo(modo); } // preferencia de Capas: rige los próximos toques en el mapa
function verComo(modo) { selVista = modo; pintarSeleccion(); renderCard(); } // botones Lote/Tablón de la tarjeta: solo esta selección
function seleccionarTablon(i) { const f = DATA.features[i]; if (f) seleccionarLote(f._cod, {feat: f, modo: 'tablon', zoom: true}); }
function cerrarCard() { clearTimeout(_vacioT); selCod = ''; selFeat = null; selToque = false; pintarSeleccion(); $('card').className = 'card oculta'; ajustarCard(); }
function ajustarCard() {
  const el = $('card'), vis = !el.classList.contains('oculta');
  document.body.classList.toggle('con-card', vis); document.body.classList.toggle('card-full', vis && cardFull); leyPorCard(vis);
  if (vis && !cardFull) document.body.style.setProperty('--card-h', Math.round(el.getBoundingClientRect().height) + 'px');
  histPedir();
}
function cifra(rot, val, cls = '', extra = '') { return `<div class="${cls}"><span>${rot}</span><b>${val}</b>${extra}</div>`; }
const signo = (v, f = nf1) => (v > 0 ? '+' : v < 0 ? '−' : '') + f.format(Math.abs(v));
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
  const tab = porTablon(), pt = selFeat ? selFeat.properties : {}, aT = Number(pt.Area_Ha) || 0, corte = corteInfo(l);
  if (!HIST && !_histPedido) { _histPedido = true; cargarHistorico().then(() => { if (selCod) renderCard(); }).catch(() => {}); }
  const tablones = l.feats.slice().sort((a, b) => String(a.properties.Tablon).localeCompare(String(b.properties.Tablon), 'es', {numeric: true}));
  el.className = 'card ' + (cardFull ? 'full' : 'peek');
  el.innerHTML = `
    <button type="button" class="card-asa" onclick="cardAlternar()" aria-label="Ampliar o reducir tarjeta"><i></i></button>
    <div class="card-top">
      <div class="card-id">
        <div class="card-cod">${tab ? 'Tablón ' + esc(pt.Tablon || '—') : 'Lote ' + esc(l.cod)} <small>${tab ? fmtN(pt.Area_Ha, ' ha') : fmtN(l.area, ' ha')}${l.nc ? ' · ' + esc(ncLargo(l)) : ''}</small></div>
        <div class="card-sub"><button type="button" class="card-finca" onclick="abrirFinca(LOTES[selCod].hac)">${tab ? 'Lote ' + esc(l.cod) + ' · ' : ''}${esc(l.hac)} ›</button></div>
      </div>
      ${selFeat && l.nPoly > 1 ? `<div class="mini-seg" role="group" aria-label="Ver lote o tablón"><button type="button" class="${tab ? '' : 'activo'}" aria-pressed="${!tab}" onclick="verComo('lote')">Lote</button><button type="button" class="${tab ? 'activo' : ''}" aria-pressed="${tab}" onclick="verComo('tablon')">Tablón</button></div>` : ''}
      <button type="button" class="card-x" onclick="cerrarCard()" aria-label="Cerrar">${ico('x')}</button>
    </div>
    <div class="fila-estado"><span class="chip est-${st.cls}">${esc(st.txt)}</span>${l.renovar ? '<span class="chip est-mal">Renovar</span>' : ''}${corte.txt ? `<span class="linea-estado">${corte.txt}</span>` : ''}</div>
    ${corte.alerta}
    <div class="cifras">
      ${cifra('TCH anterior', l.tchAnt > 0 ? nf1.format(l.tchAnt) : '—', '', chispa(l.cod))}${cifra('Estimado', estim, 'c-est')}${cifra('Optimista', l.tchOpt > 0 ? fmtN(l.tchOpt, '', nf1) : '—')}${cifra('Edad', edad === null ? '—' : nf1.format(edad) + ' m')}
    </div>
    <div class="acciones">
      <button type="button" class="btn pri" onclick="abrirRegistro(selCod)">${ico('plus')} Registrar hallazgo</button>
      <button type="button" class="btn ter" onclick="cardAlternar()">${cardFull ? 'Menos ' + ico('chevDown') : 'Más ' + ico('chevUp')}</button>
    </div>
    <div class="solo-full">
      ${st.det ? `<div class="nota est-${st.cls}">${esc(st.det)}</div>` : ''}
      <div class="kvs">
        ${tab ? kv('Tablón', pt.Tablon) + kv('Área del tablón', `${nf.format(aT)} ha · ${nf.format(aT / 0.704225)} mz`) + kv('Parte del lote', l.areaShape ? nf0.format(aT / l.areaShape * 100) + ' % de ' + nf.format(l.areaShape) + ' ha' : '') + kv('Centro del tablón', c ? `${c[0].toFixed(5)}, ${c[1].toFixed(5)}` : '') : selToque ? kv('Tablón tocado', pt.Tablon) : ''}
        ${kv('Tablones del lote', l.nPoly ? `${l.nPoly} · ${nf.format(l.areaShape)} ha en shape` : 'Sin polígono')}
        ${kv('Variedad', rotulo(l.variedad))}${kv('Zona', l.zona)}${kv('Riego', rotulo(l.riego))}${kv('Tenencia', l.tenencia)}
        ${kv('Clasificación', rotulo(l.clas) || (l.conAforo ? '' : 'Sin aforo 26/27'))}${kv('N.º de corte', l.nc)}
        ${kv('Grupo de corte', l.grCorte ? (l.grCorte === 'Planta' ? 'Plantilla' : 'Soca · ' + l.grCorte.toLowerCase()) : '')}${kv('Propuesta de renovación', l.renovar === true ? 'Sí, renovar' : l.renovar === false ? 'No' : '')}
        ${kv('Promedio histórico', l.histProm !== null ? `${nf1.format(l.histProm)} t/ha · ${l.histN} zafras` : '')}${kv('Máximo histórico', l.histMax !== null ? nf1.format(l.histMax) + ' t/ha' : '')}
        ${l.renovar && deltaEsperado(l) !== null ? kv('Al renovar, esperado', `${signo(deltaEsperado(l))} t/ha (plantillas de la zona: ${nf1.format(PLANT_ZONA[l.zona])})`) + kv('Al renovar, techo', deltaTecho(l) === null ? '' : `${signo(deltaTecho(l))} t/ha (su máximo)`) : ''}
        ${kv('Corte programado', l.fProg ? `${fechaCorta(l.fProg)}${l.semProg ? ' · semana ' + l.semProg.sem : ''}` : '')}${kv('Último corte', l.fCorte ? `${fechaCorta(l.fCorte)}${l.zafra ? ' · zafra ' + l.zafra : ''}` : '')}${kv('Días desde el corte', diasDesde(l.fCorte) === null ? '' : nf0.format(diasDesde(l.fCorte)))}
        ${kv('Toneladas estimadas', l.tonEst > 0 ? nf0.format(l.tonEst) + ' t' : '')}${kv('Toneladas optimistas', l.tonOpt > 0 ? nf0.format(l.tonOpt) + ' t' : '')}
        ${kv('Brecha vs. optimista', brecha === null ? '' : nf1.format(brecha) + ' t/ha')}
      </div>
      ${tab ? '<p class="pie">TCH, edad, variedad y aforo son datos del lote completo; el shape no los trae por tablón.</p>' : ''}
      ${tablones.length > 1 ? `<h4>Tablones del lote (${tablones.length})</h4><div class="tablones">${tablones.map(f => `<button type="button" class="${f === selFeat ? 'activo' : ''}" onclick="seleccionarTablon(${f._i})"><b>${esc(f.properties.Tablon || '—')}</b><span>${nf.format(f.properties.Area_Ha)} ha</span></button>`).join('')}</div>` : ''}
      <div class="mini-acc">
        ${llegar ? `<a href="${llegar}" target="_blank" rel="noopener">${ico('nav')} Llegar</a>` : ''}
        <button type="button" onclick="favToggle(selCod)">${ico(fav ? 'starFill' : 'star')} Favorito</button>
        <button type="button" onclick="listaToggle(selCod)">${enLista ? ico('check') + ' En lista del día' : ico('listPlus') + ' Lista del día'}</button>
        <button type="button" onclick="fijarLote(selCod)">${fijado ? ico('lock') + ' Lote fijado' : ico('unlock') + ' Fijar lote'}</button>
        <button type="button" onclick="compartirLote(selCod)">${ico('share')} Compartir</button>
        <button type="button" onclick="copiarCoords()">${ico('pin')} Copiar coord.</button>
        <button type="button" onclick="acercarLote()">${ico('zoomIn')} Acercar</button>
      </div>
      <button type="button" class="btn sec ancho" id="btnHist" onclick="alternarHistorico()">${ico('chart')} Histórico TCH</button>
      <div id="histBox" hidden></div>
      ${typeof historialHtml === 'function' ? historialHtml(l.cod) : ''}
      <div id="fotosLote"></div>
      <div class="obs-lote"><h4>Registros de este lote</h4>${obs.length ? obs.slice(0, 5).map(obsFilaHtml).join('') : '<p class="vacio">Sin registros en este teléfono.</p>'}</div>
      <p class="pie">Datos al ${fechaCorta(META.datos_al || META.generated_at)}${META.cortes_al ? ' · cortes al ' + fechaCorta(META.cortes_al) : ' · sin cortes de la zafra en curso'}</p>
    </div>`;
  ajustarCard(); if (cardFull) { el.scrollTop = 0; if (typeof pintarFotosLote === 'function') pintarFotosLote(l.cod); }
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
    <p class="pie">Área total ${nf0.format(areaTot)} ha · optimista ${area ? nf1.format(tonOpt / area) : '—'} t/ha · ${rojos.length} lote(s) en prioridad alta${ls.some(l => l.renovar) ? ` · ${ls.filter(l => l.renovar).length} a renovar (${nf0.format(ls.filter(l => l.renovar).reduce((s, l) => s + (l.area || 0), 0))} ha)` : ''}</p>
    <div class="acciones"><button type="button" class="btn sec" onclick="verFincaEnMapa('${esc(nombre).replace(/'/g, '&#39;')}')">${ico('zoomIn')} Ver en mapa</button></div>
    <div class="lista-lotes">${orden.map(l => { const s = estadoLote(l); return `<div class="fila-ir"><button type="button" onclick="cerrarHoja();seleccionarLote('${esc(l.cod)}',{zoom:true})"><b>${esc(l.cod)}</b><span>${fmtN(l.area, ' ha', nf1)} · ant. ${fmtN(l.tchAnt, '', nf0)} · est. ${l.tchEst > 0 ? nf0.format(l.tchEst) : '—'}</span><i class="chip est-${s.cls}">${esc(s.txt)}</i></button>${llegarHtml(l.cod)}</div>`; }).join('')}</div>`);
  if (zoom) verFincaEnMapa(nombre, false);
}
function verFincaEnMapa(nombre, cerrar = true) { const f = FINCAS[nombre]; if (cerrar) cerrarHoja(); mostrarTab('mapa'); if (f && f.bbox) { soltarSeguimiento(); map.fitBounds(boundsDe(f.bbox), margenes(90, 40)); } }

/* ── Hoja de capas y herramientas ──
   Elegir capa o mapa base aplica el cambio, cierra la hoja para ver el resultado y ofrece Deshacer durante 4 s.
   Los interruptores y «Al tocar el mapa» no la cierran: se suelen cambiar varios seguidos. */
const BASES_TXT = {claro: 'Calles', satelite: 'Satélite', ninguno: 'Sin mapa'};
function cerrarCapasPronto() { setTimeout(() => { if ($('opColor') && $('hoja').classList.contains('abierta')) cerrarHoja(); }, 200); }
function avisoCambio(txt, deshacer) { toast(txt, {accion: 'Deshacer', ms: 4000, alAccion: deshacer}); }
function abrirCapas() {
  const op = (grupo, val, txt, act) => `<label class="opcion"><input type="radio" name="${grupo}" value="${val}" ${act ? 'checked' : ''}><span>${txt}</span></label>`;
  abrirHoja('Capas y herramientas', `
    <h4>Mapa base</h4><div class="opciones" id="opBase">${op('base', 'claro', 'Calles', S.base === 'claro')}${op('base', 'satelite', 'Satélite', S.base === 'satelite')}${op('base', 'ninguno', 'Sin mapa', S.base === 'ninguno')}</div>
    <h4>Al tocar el mapa, seleccionar</h4><div class="opciones col" id="opSel">${op('sel', 'lote', 'Lote completo', S.selModo !== 'tablon')}${op('sel', 'tablon', 'Tablón', S.selModo === 'tablon')}</div>
    <h4>Colorear lotes por</h4><div class="opciones col" id="opColor">${Object.entries(TEMAS).map(([k, t]) => op('color', k, t.t, S.colorear === k)).join('')}</div>
    <label class="interruptor"><input type="checkbox" id="opEtq" ${S.etiquetas ? 'checked' : ''}><span>Mostrar etiquetas (finca · lote · tablón según acercamiento)</span></label>
    <label class="interruptor"><input type="checkbox" id="opNc" ${S.etqNc ? 'checked' : ''}><span>Número de corte en las etiquetas (C6 = corte 6 · PL = plantía)</span></label>
    <label class="interruptor"><input type="checkbox" id="opReg" ${S.verRegistros ? 'checked' : ''}><span>Mostrar en el mapa los hallazgos pendientes</span></label>
    <h4>Herramientas</h4>
    <div class="acciones"><button type="button" class="btn sec" onclick="cerrarHoja();medirIniciar('dist')">${ico('ruler')} Medir distancia</button><button type="button" class="btn sec" onclick="cerrarHoja();medirIniciar('area')">${ico('hexagon')} Medir área</button></div>
    <div class="acciones"><button type="button" class="btn ter" onclick="cerrarHoja();soltarSeguimiento();map.fitBounds(capaLotes.getBounds(),margenes(20,20,10))">${ico('map')} Ver todos los lotes</button><button type="button" class="btn ter" onclick="guardarZonaOffline()">${ico('download')} Guardar esta zona sin señal</button></div>`);
  $('opBase').addEventListener('change', e => { const prev = S.base, val = e.target.value; setBase(val); cerrarCapasPronto(); avisoCambio('Mapa base: ' + BASES_TXT[val], () => setBase(prev)); });
  $('opSel').addEventListener('change', e => setSelModo(e.target.value));
  $('opReg').addEventListener('change', e => { S.verRegistros = e.target.checked; guardarAjustes(); pintarRegistros(); });
  $('opColor').addEventListener('change', e => { const prev = S.colorear, val = e.target.value; setColorear(val); cerrarCapasPronto(); avisoCambio('Capa: ' + TEMAS[val].t, () => setColorear(prev)); });
  $('opEtq').addEventListener('change', e => { S.etiquetas = e.target.checked; guardarAjustes(); actualizarEtiquetas(); });
  $('opNc').addEventListener('change', e => { S.etqNc = e.target.checked; guardarAjustes(); actualizarEtiquetas(); });
}

/* ── Vista de alrededores: aleja lo justo para ver los lotes vecinos (~2 km) y vuelve con otro toque ── */
let panorama = null;
function alternarPanorama() {
  if (panorama) { const p = panorama; panorama = null; map.setView(GPS.siguiendo && GPS.fix ? [GPS.fix.lat, GPS.fix.lng] : p.c, p.z); pintarPanorama(); return; }
  const z = map.getZoom(), c = map.getCenter(), foco = GPS.siguiendo && GPS.fix ? [GPS.fix.lat, GPS.fix.lng] : (selCod && centroideLote(LOTES[selCod])) || c;
  if (z <= 14) { toast('Ya está en vista amplia.'); return; }
  panorama = {c, z}; map.setView(foco, Math.min(15, z - 2)); pintarPanorama();
}
function pintarPanorama() { const b = $('btnPanorama'); if (b) { b.classList.toggle('activo', !!panorama); b.setAttribute('aria-label', panorama ? 'Volver a la vista anterior' : 'Ver alrededores'); } }

/* ── Medición de distancia y área ── */
const medir = {modo: null, pts: []};
function medirIniciar(modo) { medir.modo = modo; medir.pts = []; cerrarCard(); medirPintar(); histPedir(); toast(modo === 'area' ? 'Toque el mapa para marcar el contorno.' : 'Toque el mapa para marcar puntos.'); }
function medirPunto(ll) { medir.pts.push(L.latLng(ll.lat, ll.lng)); medirPintar(); }
function medirDeshacer() { medir.pts.pop(); medirPintar(); }
function medirCerrar() { medir.modo = null; medir.pts = []; capaMedir.clearLayers(); $('medirBar').hidden = true; histPedir(); }
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
