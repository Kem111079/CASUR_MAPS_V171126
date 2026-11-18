/* CASUR Maps · núcleo: utilidades, ajustes, almacenamiento local y carga de datos con caché. */
'use strict';
const APP_VERSION = 'V181126';
const DATA_FILES = {
  geo: './data/poligonos_casur.geojson',
  metricas: './data/metricas_lote.json',
  resumen: './data/aforo_resumen.json',
  cortes: './data/cortes_zafra.json',
  meta: './data/metadata.json'
};
const HIST_URL = './data/produccion_historica_lote.json';
const DATA_CACHE = 'casur-data-v1';

let DATA = null, META = {}, RESUMEN = {}, LOTES = {}, FINCAS = {}, HIST = null;

const $ = id => document.getElementById(id);
const nf = new Intl.NumberFormat('es-NI', {maximumFractionDigits: 2});
const nf0 = new Intl.NumberFormat('es-NI', {maximumFractionDigits: 0});
const nf1 = new Intl.NumberFormat('es-NI', {maximumFractionDigits: 1});
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[m]));
const num = v => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const fmtN = (v, suf = '', f = nf) => num(v) === null ? '—' : f.format(Number(v)) + suf;
const codKey = v => String(v ?? '').trim().toUpperCase();
const sinTildes = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const hoyLocal = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };
function parseISO(s) {
  if (!s) return null;
  const p = String(s).slice(0, 10).split('-').map(Number);
  if (p.length < 3 || !p[0] || !p[1] || !p[2]) return null;
  const d = new Date(p[0], p[1] - 1, p[2]);
  return Number.isNaN(d.getTime()) ? null : d;
}
function fechaCorta(iso) { const d = parseISO(iso); return d ? d.toLocaleDateString('es-NI', {day: '2-digit', month: 'short', year: 'numeric'}) : '—'; }
function diasDesde(iso) { const d = parseISO(iso); return d ? Math.max(0, Math.round((hoyLocal() - d) / 86400000)) : null; }
function fmtDur(ms) { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h} h ${m} min` : (m ? `${m} min` : `${s} s`); }
function fmtDist(m) { return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`; }
function haversineM(lon1, lat1, lon2, lat2) {
  const R = 6371008.8, r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/* ── Avisos no bloqueantes (reemplazan a alert) ── */
function toast(msg, opts = {}) {
  const box = $('toasts'); if (!box) return;
  box.querySelectorAll('.toast:not(.fijo)').forEach(t => t.remove()); // un aviso a la vez: no tapar la pantalla
  const el = document.createElement('div');
  el.className = 'toast ' + (opts.tipo || '') + (opts.fijo ? ' fijo' : '');
  el.innerHTML = `<span>${esc(msg)}</span>` + (opts.accion ? `<button type="button">${esc(opts.accion)}</button>` : '');
  box.appendChild(el);
  const cerrar = () => el.remove();
  if (opts.accion) el.querySelector('button').addEventListener('click', () => { cerrar(); opts.alAccion && opts.alAccion(); });
  if (!opts.fijo) setTimeout(cerrar, opts.ms || (opts.accion ? 7000 : 3200));
  return el;
}
function vibrar(ms = 60) { if (S.vibrar && navigator.vibrate) { try { navigator.vibrate(ms); } catch (_) {} } }

/* ── Ajustes persistentes ── */
const AJUSTES_KEY = 'casur_maps_ajustes_v2';
const S = Object.assign({
  tecnico: '', gpsPerfil: 'vehiculo', tema: 'campo', pantalla: true, vibrar: true,
  colorear: 'ninguno', etiquetas: true, base: 'claro', selModo: 'lote', orientacion: 'rumbo', gpsAuto: true
}, leerLS(AJUSTES_KEY, {}));
function guardarAjustes() { escribirLS(AJUSTES_KEY, S); }
function leerLS(k, def) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? def; } catch (_) { return def; } }
function escribirLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast('Almacenamiento lleno: exporte y limpie la bitácora.', {tipo: 'mal'}); return false; } }
function aplicarTema() { document.documentElement.dataset.tema = S.tema || 'campo'; }

/* ── IndexedDB: clave/valor para visitas y recorrido (sin el límite de ~5 MB de localStorage) ── */
let _kvDb = null;
function kvDb() {
  if (_kvDb) return _kvDb;
  _kvDb = new Promise((res, rej) => {
    const r = indexedDB.open('casur_maps_v2', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  return _kvDb;
}
async function kvGet(k, def = null) {
  try { const db = await kvDb(); return await new Promise((res, rej) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result ?? def); q.onerror = () => rej(q.error); }); }
  catch (_) { return def; }
}
async function kvSet(k, v) {
  try { const db = await kvDb(); await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); return true; }
  catch (e) { console.warn('[CASUR] kvSet', e); return false; }
}

/* ── Fotos: misma base que versiones anteriores para conservar lo ya guardado en los teléfonos ── */
function fotoDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('casur_maps_fotos_v18', 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('photos')) r.result.createObjectStore('photos', {keyPath: 'id'}); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function fotoTx(modo, fn) {
  const db = await fotoDb();
  return new Promise((res, rej) => { const tx = db.transaction('photos', modo); const q = fn(tx.objectStore('photos')); tx.oncomplete = () => res(q && q.result); tx.onerror = () => rej(tx.error); });
}
const fotoPut = rec => fotoTx('readwrite', s => s.put(rec));
const fotoGet = id => fotoTx('readonly', s => s.get(id));
const fotoDel = id => fotoTx('readwrite', s => s.delete(id));
const fotoAll = () => fotoTx('readonly', s => s.getAll()).then(r => r || []);
/* Reduce la foto a 1600 px y JPEG 80 % (~300 KB) antes de guardarla. */
function comprimirFoto(file, max = 1600, q = 0.8) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('No se pudo leer la foto')); };
    img.src = url;
  });
}

/* ── Descargas y ZIP mínimo (sin compresión) para exportar bitácora con fotos ── */
function descargarBlob(nombre, blob) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = nombre; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 800);
}
const descargarTexto = (nombre, txt, mime = 'text/plain;charset=utf-8') => descargarBlob(nombre, new Blob([txt], {type: mime}));
const csvLinea = arr => arr.map(x => '"' + String(x ?? '').replace(/"/g, '""') + '"').join(',');
let _crcT = null;
function crc32(u8) {
  if (!_crcT) { _crcT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; _crcT[n] = c >>> 0; } }
  let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = _crcT[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function crearZip(archivos) { // [{nombre, datos: Uint8Array}]
  const enc = new TextEncoder(), partes = [], central = []; let off = 0;
  const u16 = v => new Uint8Array([v & 255, v >>> 8 & 255]), u32 = v => new Uint8Array([v & 255, v >>> 8 & 255, v >>> 16 & 255, v >>> 24 & 255]);
  const cat = arr => { const t = new Uint8Array(arr.reduce((s, a) => s + a.length, 0)); let o = 0; arr.forEach(a => { t.set(a, o); o += a.length; }); return t; };
  archivos.forEach(f => {
    const nom = enc.encode(f.nombre), crc = crc32(f.datos), n = f.datos.length;
    const comun = [u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(n), u32(n), u16(nom.length), u16(0)];
    const local = cat([u32(0x04034b50), ...comun, nom, f.datos]);
    central.push(cat([u32(0x02014b50), u16(20), ...comun, u16(0), u16(0), u16(0), u32(0), u32(off), nom]));
    partes.push(local); off += local.length;
  });
  const cd = cat(central);
  return new Blob([...partes, cd, cat([u32(0x06054b50), u16(0), u16(0), u16(archivos.length), u16(archivos.length), u32(cd.length), u32(off), u16(0)])], {type: 'application/zip'});
}
function dataUrlBytes(d) { const b = atob(String(d).split(',')[1] || ''); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }

/* ── Carga de datos: primero la copia local, la red solo cuando cambia la versión ── */
function setLoader(msg) { const el = $('loaderText'); if (el) el.textContent = msg; }
async function dataCache() { try { return await caches.open(DATA_CACHE); } catch (_) { return null; } }
async function fetchJson(url, timeoutMs = 60000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now(), {cache: 'no-store', signal: ctl.signal});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return {json: await r.clone().json(), resp: r};
  } finally { clearTimeout(t); }
}
async function leerCache(cache, url) { if (!cache) return null; try { const r = await cache.match(url); return r ? await r.json() : null; } catch (_) { return null; } }
async function descargarDatos(cache, meta) {
  const out = {meta};
  const claves = Object.keys(DATA_FILES).filter(k => k !== 'meta');
  const res = await Promise.all(claves.map(k => fetchJson(DATA_FILES[k], 90000).catch(e => { if (k === 'cortes') return null; throw new Error(DATA_FILES[k].split('/').pop() + ': ' + (e.name === 'AbortError' ? 'tiempo agotado' : e.message)); })));
  claves.forEach((k, i) => { out[k] = res[i] ? res[i].json : null; });
  if (cache) {
    await Promise.all(claves.map((k, i) => res[i] ? cache.put(DATA_FILES[k], res[i].resp) : null));
    await cache.put(DATA_FILES.meta, new Response(JSON.stringify(meta), {headers: {'Content-Type': 'application/json'}}));
  }
  return out;
}
async function cargarDatos() {
  const cache = await dataCache();
  const metaLocal = await leerCache(cache, DATA_FILES.meta);
  if (metaLocal) {
    const [geo, metricas, resumen, cortes] = await Promise.all(['geo', 'metricas', 'resumen', 'cortes'].map(k => leerCache(cache, DATA_FILES[k])));
    if (geo && metricas) {
      setTimeout(() => buscarActualizacion(cache, metaLocal), 2500);
      return {geo, metricas, resumen, cortes, meta: metaLocal, origen: 'local'};
    }
  }
  setLoader('Descargando datos por primera vez…');
  const meta = (await fetchJson(DATA_FILES.meta, 20000)).json;
  return Object.assign(await descargarDatos(cache, meta), {origen: 'red'});
}
async function buscarActualizacion(cache, metaLocal, manual = false) {
  if (!navigator.onLine) { if (manual) toast('Sin señal: se usan los datos guardados.'); return; }
  try {
    const meta = (await fetchJson(DATA_FILES.meta, 8000)).json;
    if (meta.generated_at === metaLocal.generated_at) { if (manual) toast('Los datos ya están al día.', {tipo: 'bien'}); return; }
    const aviso = toast('Descargando datos nuevos…', {fijo: true});
    await descargarDatos(cache, meta);
    aviso && aviso.remove();
    toast('Datos nuevos listos.', {accion: 'Aplicar', fijo: true, tipo: 'bien', alAccion: () => location.reload()});
  } catch (e) { if (manual) toast('No se pudo revisar: ' + (e.message || e), {tipo: 'mal'}); }
}
async function cargarHistorico() {
  if (HIST) return HIST;
  const cache = await dataCache();
  HIST = await leerCache(cache, HIST_URL);
  if (!HIST) {
    try { const r = await fetchJson(HIST_URL, 45000); HIST = r.json; if (cache) await cache.put(HIST_URL, r.resp); }
    catch (_) { HIST = null; throw new Error('Histórico no disponible sin señal'); }
  }
  return HIST;
}

/* ── Modelo por lote: une métricas, aforo y cortes de la zafra en curso ── */
function construirLotes(geo, metricas, cortes) {
  const M = (metricas || {}).lotes || {}, C = (cortes || {}).lotes || {}, zafraFeed = (cortes || {}).zafra || '26/27';
  LOTES = {}; FINCAS = {};
  const nuevo = (cod, m = {}) => {
    const c = C[cod];
    const l = {
      cod, hac: m.hacienda_productor || 'Sin dato', codFinca: m.cod_finca || '', zona: m.zona || '', variedad: m.variedad || '',
      riego: m.riego || '', tenencia: m.tenencia || '', destino: m.destino || '', clas: m.clasificacion || '', nc: m.nc || '',
      areaAforo: num(m.area_total_ha), areaShape: 0, nPoly: 0,
      tchAnt: num(m.tch_ultima_zafra), fCorte: m.fecha_ultimo_corte || '', zafra: m.ultima_zafra_label || '',
      fProg: m.fecha_cosecha_prog || '',
      tchEst: num(m.aforo_actTCH_2627), tonEst: num(m.aforo_toneladas_2627), tchOpt: num(m.aforo_tch_opt_2627), tonOpt: num(m.aforo_toneladas_opt_2627),
      conAforo: m.aforo_actTCH_2627 !== undefined, cosechado: false, feats: [], bbox: null
    };
    // Corte de la zafra en curso: manda sobre la fecha anterior y, si trae TCH real, sobre el TCH de la última zafra.
    if (c && c.fecha_corte && (!l.fCorte || c.fecha_corte > l.fCorte)) {
      l.fCorte = c.fecha_corte; l.cosechado = true; l.zafra = zafraFeed;
      if (num(c.tch) !== null) l.tchAnt = num(c.tch);
    }
    return (LOTES[cod] = l);
  };
  (geo.features || []).forEach((f, i) => {
    f._i = i;
    const p = f.properties || {}, cod = codKey(p.CodSuerte);
    if (!cod) return;
    const l = LOTES[cod] || nuevo(cod, M[cod]);
    l.feats.push(f); l.nPoly++; l.areaShape += Number(p.Area_Ha) || 0;
    const b = f.bbox || bboxDe(f); f.bbox = b; f._cod = cod;
    if (b) l.bbox = l.bbox ? [Math.min(l.bbox[0], b[0]), Math.min(l.bbox[1], b[1]), Math.max(l.bbox[2], b[2]), Math.max(l.bbox[3], b[3])] : b.slice();
  });
  Object.keys(M).forEach(cod => { if (!LOTES[cod]) nuevo(cod, M[cod]); });
  calcularSemanas();
  Object.values(LOTES).forEach(l => {
    l.area = l.areaAforo !== null && l.areaAforo > 0 ? l.areaAforo : l.areaShape;
    l.principal = l.feats.slice().sort((a, b) => (b.properties.Area_Ha || 0) - (a.properties.Area_Ha || 0))[0] || null;
    const f = FINCAS[l.hac] || (FINCAS[l.hac] = {nombre: l.hac, lotes: [], bbox: null});
    f.lotes.push(l.cod);
    if (l.bbox) f.bbox = f.bbox ? [Math.min(f.bbox[0], l.bbox[0]), Math.min(f.bbox[1], l.bbox[1]), Math.max(f.bbox[2], l.bbox[2]), Math.max(f.bbox[3], l.bbox[3])] : l.bbox.slice();
  });
}
function bboxDe(f) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const scan = c => { if (typeof c[0] === 'number') { if (c[0] < x0) x0 = c[0]; if (c[1] < y0) y0 = c[1]; if (c[0] > x1) x1 = c[0]; if (c[1] > y1) y1 = c[1]; } else c.forEach(scan); };
  if (f.geometry && f.geometry.coordinates) scan(f.geometry.coordinates);
  return x0 < Infinity ? [x0, y0, x1, y1] : null;
}
const edadMeses = l => { const d = diasDesde(l && l.fCorte); return d === null ? null : d / 30.4375; };
/* ── Cosecha programada ── */
const diasPara = iso => { const d = parseISO(iso); return d ? Math.round((d - hoyLocal()) / 86400000) : null; };
/* Semana calendario ISO (lunes a domingo) de una fecha: {clave: 'AAAA-SS', sem, lunes, domingo}. */
function semanaDe(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()), dia = (x.getDay() + 6) % 7, lunes = new Date(x); lunes.setDate(x.getDate() - dia);
  const jue = new Date(lunes); jue.setDate(lunes.getDate() + 3);
  const sem = 1 + Math.round(((jue - new Date(jue.getFullYear(), 0, 4)) / 86400000 - 3 + ((new Date(jue.getFullYear(), 0, 4).getDay() + 6) % 7)) / 7);
  const dom = new Date(lunes); dom.setDate(lunes.getDate() + 6);
  return {clave: jue.getFullYear() + '-' + String(sem).padStart(2, '0'), sem, lunes, domingo: dom};
}
const rangoSemana = w => `${w.lunes.getDate()}${w.lunes.getMonth() !== w.domingo.getMonth() ? ' ' + w.lunes.toLocaleDateString('es-NI', {month: 'short'}) : ''}–${w.domingo.getDate()} ${w.domingo.toLocaleDateString('es-NI', {month: 'short'})}`;
const corteVencido = l => !!l.fProg && !l.cosechado && diasPara(l.fProg) < 0;
/* Las dos próximas semanas calendario que tienen lotes programados (desde la semana en curso). */
let SEMANAS_PROX = [];
function calcularSemanas() {
  const actual = semanaDe(hoyLocal()).clave, mapa = new Map();
  Object.values(LOTES).forEach(l => { const d = parseISO(l.fProg); if (!d || l.cosechado) return; const w = semanaDe(d); l.semProg = w; if (w.clave >= actual && diasPara(l.fProg) >= 0) mapa.set(w.clave, w); });
  SEMANAS_PROX = [...mapa.values()].sort((a, b) => a.clave.localeCompare(b.clave)).slice(0, 2);
}
/* Clase de corte del lote: 0 vencida · 1 próxima semana · 2 semana siguiente · 3 más adelante · 4 cosechado · null sin fecha. */
function claseCorte(l) {
  if (l.cosechado) return 4;
  if (!l.fProg) return null;
  if (diasPara(l.fProg) < 0) return 0;
  const k = l.semProg ? l.semProg.clave : '';
  return SEMANAS_PROX[0] && k === SEMANAS_PROX[0].clave ? 1 : SEMANAS_PROX[1] && k === SEMANAS_PROX[1].clave ? 2 : 3;
}
const esMolienda = l => String(l.clas || '').toLowerCase() === 'molienda';

/* Semáforo agronómico. Mismos umbrales de versiones anteriores; se agregan estados informativos. */
function estadoLote(l) {
  if (!l) return {cls: 'neutro', txt: 'Sin dato'};
  if (l.cosechado) return {cls: 'info', txt: 'Cosechado ' + (l.zafra || ''), det: 'Corte ' + fechaCorta(l.fCorte)};
  if (l.conAforo && l.clas && !esMolienda(l)) return {cls: 'neutro', txt: l.clas, det: 'Fuera del área de molienda'};
  const edad = edadMeses(l);
  if (l.tchAnt === null && edad === null) return {cls: 'neutro', txt: 'Sin histórico', det: 'Sin TCH ni fecha de corte'};
  if (l.tchAnt !== null && l.tchAnt < 55) return {cls: 'mal', txt: 'Prioridad alta', det: 'TCH anterior bajo'};
  if (edad !== null && edad >= 12) return {cls: 'medio', txt: 'Edad alta', det: 'Validar programación de corte'};
  if (l.tchAnt !== null && l.tchAnt < 70) return {cls: 'medio', txt: 'Revisar', det: 'TCH anterior bajo el rango esperado'};
  return {cls: 'bien', txt: 'Normal', det: 'Sin alerta con los datos disponibles'};
}

/* ── Geometría ── */
function centroideFeat(f) {
  if (!f || !f.geometry) return null;
  let best = null, bestA = 0;
  const ring = r => {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const k = r[j][0] * r[i][1] - r[i][0] * r[j][1]; a += k; cx += (r[j][0] + r[i][0]) * k; cy += (r[j][1] + r[i][1]) * k; }
    a *= 0.5; if (Math.abs(a) < 1e-14) return;
    if (Math.abs(a) > bestA) { bestA = Math.abs(a); best = [cy / (6 * a), cx / (6 * a)]; }
  };
  const g = f.geometry;
  if (g.type === 'Polygon') ring(g.coordinates[0]); else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => ring(p[0]));
  if (best && contiene(f, best[1], best[0])) return best;
  const b = f.bbox; return best || (b ? [(b[1] + b[3]) / 2, (b[0] + b[2]) / 2] : null);
}
const centroideLote = l => l && l.principal ? centroideFeat(l.principal) : null;
function enAnillo(x, y, r) { let d = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-12) + xi)) d = !d; } return d; }
function enPoligono(x, y, c) { if (!c || !c.length || !enAnillo(x, y, c[0])) return false; for (let i = 1; i < c.length; i++) if (enAnillo(x, y, c[i])) return false; return true; }
function contiene(f, x, y) {
  const b = f.bbox; if (!b || x < b[0] || y < b[1] || x > b[2] || y > b[3]) return false;
  const g = f.geometry;
  return g.type === 'Polygon' ? enPoligono(x, y, g.coordinates) : g.type === 'MultiPolygon' ? g.coordinates.some(p => enPoligono(x, y, p)) : false;
}
function distSegM(px, py, ax, ay, bx, by) {
  const mx = 111320 * Math.cos(py * Math.PI / 180), my = 110574;
  const pX = px * mx, pY = py * my, aX = ax * mx, aY = ay * my, vx = bx * mx - aX, vy = by * my - aY, c = vx * vx + vy * vy;
  let t = c ? ((pX - aX) * vx + (pY - aY) * vy) / c : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(pX - (aX + t * vx), pY - (aY + t * vy));
}
function distFeatM(f, x, y) {
  let best = Infinity;
  const ring = r => { for (let i = 0; i < r.length - 1; i++) { const d = distSegM(x, y, r[i][0], r[i][1], r[i + 1][0], r[i + 1][1]); if (d < best) best = d; } };
  const g = f.geometry;
  if (g.type === 'Polygon') g.coordinates.forEach(ring); else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => p.forEach(ring));
  return best;
}
/* Polígonos dentro de un radio (m) del punto, ordenados por distancia; inside=true si el punto cae dentro. */
function cercanos(x, y, radioM) {
  const dLat = radioM / 110574, dLon = radioM / (111320 * Math.cos(y * Math.PI / 180)), out = [];
  for (const f of DATA.features) {
    const b = f.bbox; if (!b || b[0] > x + dLon || b[2] < x - dLon || b[1] > y + dLat || b[3] < y - dLat) continue;
    const inside = contiene(f, x, y), d = inside ? 0 : distFeatM(f, x, y);
    if (d <= radioM) out.push({f, cod: f._cod, d, inside});
  }
  return out.sort((a, b) => a.d - b.d);
}
