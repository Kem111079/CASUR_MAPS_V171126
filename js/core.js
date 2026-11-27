/* CASUR Maps · núcleo: utilidades, ajustes, almacenamiento local y carga de datos con caché. */
'use strict';
const APP_VERSION = 'V181126J';
const DATA_FILES = {
  geo: './data/poligonos_casur.geojson',
  metricas: './data/metricas_lote.json',
  resumen: './data/aforo_resumen.json',
  cortes: './data/cortes_zafra.json',
  renov: './data/renovacion.json',
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

/* ── Iconos de línea propios (mismo trazo en todos los teléfonos; reemplazan a los emojis) ── */
const ICONOS = {
  plus: '<path d="M12 5v14M5 12h14"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
  chevUp: '<path d="M6 15l6-6 6 6"/>', chevDown: '<path d="M6 9l6 6 6-6"/>', chevLeft: '<path d="M15 6l-6 6 6 6"/>', chevRight: '<path d="M9 6l6 6-6 6"/>',
  nav: '<path d="M20.5 3.5 3.5 10.6l7 2.9 2.9 7z"/>', pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>', alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17.2v.3"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>', starFill: '<path fill="currentColor" d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>',
  listPlus: '<path d="M4 7h10M4 12h10M4 17h6M17 14v6M14 17h6"/>', lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', unlock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.6-1.7"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>', copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  zoomIn: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.3-4.3M11 8.5v5M8.5 11h5"/>', search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.3-4.3"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>', camera: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.2"/>', mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>', trash: '<path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13"/>', rotate: '<path d="M5 9a8 8 0 1 1-1 5M5 4v5h5"/>',
  home: '<path d="M4 11l8-7 8 7M6 10v10h12V10"/>', lot: '<rect x="5" y="5" width="14" height="14" rx="2"/>', clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  file: '<path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5"/>', route: '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>', play: '<path d="M8 5l11 7-11 7z"/>', ruler: '<path d="M4 16L16 4l4 4L8 20zM8 12l2 2M11 9l2 2M14 6l2 2"/>',
  hexagon: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/>', map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"/>', download: '<path d="M12 4v11M8 11l4 4 4-4M5 20h14"/>',
  swap: '<path d="M4 8h14M15 5l3 3-3 3M20 16H6M9 13l-3 3 3 3"/>', layers: '<path d="M12 3 2 8.5 12 14l10-5.5L12 3z"/><path d="m2 13 10 5.5L22 13"/>', undo: '<path d="M9 7 4 12l5 5M4 12h10a5 5 0 0 1 0 10h-2"/>',
  board: '<rect x="4" y="4" width="7" height="9" rx="1.5"/><rect x="13" y="4" width="7" height="5" rx="1.5"/><rect x="13" y="11" width="7" height="9" rx="1.5"/><rect x="4" y="15" width="7" height="5" rx="1.5"/>',
  leaf: '<path d="M5 19c0-9 5-14 14-14 0 9-5 14-14 14zM5 19l8-8"/>', bug: '<ellipse cx="12" cy="14" rx="4" ry="5"/><path d="M12 9V7M9 5l1.5 2.5M15 5l-1.5 2.5M8 12H4M20 12h-4M8 16l-3 2M16 16l3 2"/>',
  droplet: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
  sparse: '<path d="M4 20V9M9 20v-5M20 20V7"/><path stroke-dasharray="1.5 3" d="M14.5 20v-9"/>', barrier: '<path d="M4 9h16v5H4zM7 14v6M17 14v6M8 9l-3 5M13 9l-3 5M18 9l-3 5"/>',
  truck: '<path d="M3 7h10v9H3zM13 10h4l3 3v3h-7z"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>', eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  sprout: '<path d="M12 21v-9M12 12c0-4-3-6-7-6 0 4 3 6 7 6zM12 14c0-3 2.5-5 6-5 0 3-2.5 5-6 5z"/>', flask: '<path d="M10 3h4M10.5 3v6L5 19a1.5 1.5 0 0 0 1.3 2h11.4A1.5 1.5 0 0 0 19 19L13.5 9V3M8 15h8"/>',
  dots: '<circle cx="6" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="18" cy="12" r="1.4"/>'
};
const ico = n => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONOS[n] || ICONOS.lot}</svg>`;
const ICONO_CAT = {Seguimiento: 'eye', Siembra: 'sprout', Madurante: 'flask', Maleza: 'leaf', Plaga: 'bug', 'Sequía': 'sun', 'Despoblación': 'sparse', Riego: 'droplet', Acceso: 'barrier', Cosecha: 'truck', Otro: 'dots'};

const urlLlegar = (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${Number(lat).toFixed(6)},${Number(lng).toFixed(6)}&travelmode=driving`;
/* Enlace "Llegar" para las listas donde se elige a qué lote ir. */
function llegarHtml(cod, lat, lng) {
  if (lat === undefined || lat === '' || lat === null) { const c = centroideLote(LOTES[cod]); if (!c) return ''; lat = c[0]; lng = c[1]; }
  return `<a class="llegar" href="${urlLlegar(lat, lng)}" target="_blank" rel="noopener" aria-label="Cómo llegar al lote ${esc(cod)}">${ico('nav')}</a>`;
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
  colorear: 'ninguno', etiquetas: true, base: 'claro', selModo: 'lote', orientacion: 'rumbo', gpsAuto: true, verRegistros: true, letra: 'normal', tableroAbrir: false, giro: 'suave', etqNc: true
}, leerLS(AJUSTES_KEY, {}));
if (!('giro' in leerLS(AJUSTES_KEY, {})) && S.orientacion === 'norte') S.giro = 'sin'; // quien ya usaba norte arriba lo conserva
S.orientacion = S.giro === 'sin' ? 'norte' : 'rumbo';
function guardarAjustes() { escribirLS(AJUSTES_KEY, S); }
function leerLS(k, def) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? def; } catch (_) { return def; } }
function escribirLS(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { toast('Almacenamiento lleno: exporte y limpie la bitácora.', {tipo: 'mal'}); return false; } }
/* Tema "auto": alto contraste de día y oscuro de noche (19:00 a 05:30), por hora y no por el ajuste del teléfono,
   para que la app nunca quede oscura bajo el sol. */
function temaEfectivo() {
  if (S.tema !== 'auto') return S.tema || 'campo';
  const d = new Date(), h = d.getHours() + d.getMinutes() / 60;
  return h >= 19 || h < 5.5 ? 'oscuro' : 'campo';
}
function aplicarTema() { const e = document.documentElement; e.dataset.tema = temaEfectivo(); e.dataset.letra = S.letra || 'normal'; }
setInterval(() => { if (S.tema === 'auto' && document.documentElement.dataset.tema !== temaEfectivo()) { aplicarTema(); if (typeof capaLotes !== 'undefined' && capaLotes) { capaLotes.setStyle(estiloFeat); pintarSeleccion(); } } }, 60000);
/* Confirmación visual breve al guardar. */
function confirmar(txt) {
  const el = document.createElement('div'); el.className = 'confirma';
  el.innerHTML = `<div><svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="23"/><path d="M15 27l8 8 15-17"/></svg><b>${esc(txt)}</b></div>`;
  document.body.appendChild(el); setTimeout(() => el.classList.add('fuera'), 900); setTimeout(() => el.remove(), 1250);
}

/* Pregunta con dos botones dentro de la app (confirm() del navegador se ve ajeno y bloquea la página).
   Devuelve una promesa: true con «si», false con «no», el fondo, Escape o Atrás. El botón seguro queda enfocado. */
let _pregunta = null;
function preguntar(titulo, texto, si = 'Aceptar', no = 'Cancelar') {
  cerrarPregunta(false);
  return new Promise(res => {
    const el = document.createElement('div'); el.className = 'pregunta-fondo';
    el.innerHTML = `<div class="pregunta" role="alertdialog" aria-modal="true" aria-labelledby="pregTit"${texto ? ' aria-describedby="pregTxt"' : ''}><b id="pregTit">${esc(titulo)}</b>${texto ? `<p id="pregTxt">${esc(texto)}</p>` : ''}<div class="acciones"><button type="button" class="btn ter" data-r="0">${esc(no)}</button><button type="button" class="btn peligro" data-r="1">${esc(si)}</button></div></div>`;
    el.addEventListener('click', e => { const b = e.target.closest('button'); if (b) cerrarPregunta(b.dataset.r === '1'); else if (e.target === el) cerrarPregunta(false); });
    document.body.appendChild(el); _pregunta = {el, res};
    el.querySelector('[data-r="0"]').focus({preventScroll: true});
  });
}
function cerrarPregunta(v) { const p = _pregunta; if (!p) return false; _pregunta = null; p.el.remove(); p.res(v); return true; }

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
  const res = await Promise.all(claves.map(k => fetchJson(DATA_FILES[k], 90000).catch(e => { if (k === 'cortes' || k === 'renov') return null; throw new Error(DATA_FILES[k].split('/').pop() + ': ' + (e.name === 'AbortError' ? 'tiempo agotado' : e.message)); })));
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
    const [geo, metricas, resumen, cortes, renov] = await Promise.all(['geo', 'metricas', 'resumen', 'cortes', 'renov'].map(k => leerCache(cache, DATA_FILES[k])));
    if (geo && metricas) {
      // Si a la copia local le falta un archivo (por ejemplo, lo descargó una versión anterior de la app que aún no lo conocía), se completa.
      const faltan = Object.entries({resumen, cortes, renov}).filter(([, v]) => !v).map(([k]) => k);
      setTimeout(() => buscarActualizacion(cache, metaLocal, false, faltan), 2500);
      return {geo, metricas, resumen, cortes, renov, meta: metaLocal, origen: 'local'};
    }
  }
  setLoader('Descargando datos por primera vez…');
  const meta = (await fetchJson(DATA_FILES.meta, 20000)).json;
  return Object.assign(await descargarDatos(cache, meta), {origen: 'red'});
}
function datosListos() { // al abrir, los datos nuevos se aplican solos; si el usuario ya está trabajando, se le avisa
  if (typeof recargaSegura === 'function' && typeof ocupado === 'function' && Date.now() - _abiertaEn < 25000 && !ocupado() && recargaSegura()) return;
  toast('Datos nuevos listos.', {accion: 'Aplicar', fijo: true, tipo: 'bien', alAccion: () => location.reload()});
}
async function buscarActualizacion(cache, metaLocal, manual = false, faltan = []) {
  if (!navigator.onLine) { if (manual) toast('Sin señal: se usan los datos guardados.'); return; }
  try {
    const meta = (await fetchJson(DATA_FILES.meta, 8000)).json;
    if (meta.generated_at === metaLocal.generated_at && !manual) {
      if (!faltan.length || !cache) return;
      const res = await Promise.all(faltan.map(k => fetchJson(DATA_FILES[k], 30000).catch(() => null)));
      await Promise.all(faltan.map((k, i) => res[i] ? cache.put(DATA_FILES[k], res[i].resp) : null));
      if (res.some(Boolean)) datosListos();
      return;
    }
    const aviso = toast(manual ? 'Descargando los datos publicados…' : 'Descargando datos nuevos…', {fijo: true});
    await descargarDatos(cache, meta);
    aviso && aviso.remove();
    if (manual) location.reload(); else datosListos();
  } catch (e) { if (manual) toast('No se pudo descargar: ' + (e.message || e), {tipo: 'mal'}); }
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
function construirLotes(geo, metricas, cortes, renov) {
  const RV = (renov || {}).lotes || {};
  const M = (metricas || {}).lotes || {}, C = (cortes || {}).lotes || {}, zafraFeed = (cortes || {}).zafra || '26/27';
  LOTES = {}; FINCAS = {};
  const nuevo = (cod, m = {}) => {
    const c = C[cod], rv = RV[cod] || {};
    const l = {
      cod, hac: m.hacienda_productor || 'Sin dato', codFinca: m.cod_finca || '', zona: m.zona || '', variedad: m.variedad || '',
      riego: m.riego || '', tenencia: m.tenencia || '', destino: m.destino || '', clas: m.clasificacion || '', nc: m.nc || '',
      areaAforo: num(m.area_total_ha), areaShape: 0, nPoly: 0,
      tchAnt: num(m.tch_ultima_zafra), fCorte: m.fecha_ultimo_corte || '', zafra: m.ultima_zafra_label || '',
      fProg: m.fecha_cosecha_prog || '', grCorte: rv.gr_corte || '', renovar: typeof rv.renovar === 'boolean' ? rv.renovar : null, histProm: num(rv.hist_prom), histMax: num(rv.hist_max), histN: rv.hist_n || 0,
      tchEst: num(m.aforo_actTCH_2627), tonEst: num(m.aforo_toneladas_2627), tchOpt: num(m.aforo_tch_opt_2627), tonOpt: num(m.aforo_toneladas_opt_2627),
      conAforo: m.aforo_actTCH_2627 !== undefined, cosechado: false, feats: [], bbox: null
    };
    // El grupo de corte es más reciente que el NC del cronológico: si no coinciden, manda el grupo.
    if (l.grCorte) { const g = /^planta/i.test(l.nc) ? 'Planta' : Number(l.nc) > 5 ? 'Mayor a 5' : l.nc ? 'Corte ' + l.nc : ''; if (g !== l.grCorte) l.nc = l.grCorte === 'Planta' ? 'Planta' : l.grCorte === 'Mayor a 5' ? '>5' : l.grCorte.replace('Corte ', ''); }
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
  calcularSemanas(); calcularRenovacion();
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
/* Número de corte en forma corta para etiquetas: 'C6', o 'PL' si es plantía. Viene del cronológico; no se calcula. */
const ncCorto = l => !l || !l.nc ? '' : /^planta/i.test(l.nc) ? 'PL' : 'C' + l.nc;
const ncLargo = l => !l || !l.nc ? '' : /^planta/i.test(l.nc) ? 'plantía' : 'corte ' + l.nc;
/* ── Renovación: qué esperar ──
   Referencia realista: lo que rinden hoy las plantillas de molienda de la misma zona (TCH estimado, ponderado por área).
   Techo: el máximo histórico del propio lote. Ambos deltas se miden contra el TCH estimado del lote. */
let PLANT_ZONA = {};
function calcularRenovacion() {
  const acc = {};
  Object.values(LOTES).forEach(l => { if (l.grCorte === 'Planta' && esMolienda(l) && l.tchEst > 0 && l.areaAforo > 0) { const z = acc[l.zona] || (acc[l.zona] = [0, 0]); z[0] += l.tchEst * l.areaAforo; z[1] += l.areaAforo; } });
  PLANT_ZONA = Object.fromEntries(Object.entries(acc).map(([z, v]) => [z, v[0] / v[1]]));
}
const deltaEsperado = l => l && l.renovar && PLANT_ZONA[l.zona] !== undefined && l.tchEst !== null ? PLANT_ZONA[l.zona] - l.tchEst : null;
const deltaTecho = l => l && l.histMax !== null && l.tchEst !== null ? l.histMax - l.tchEst : null;
function resumenRenovacion() {
  const grupos = {};
  Object.values(LOTES).filter(l => l.renovar).forEach(l => {
    const a = l.areaAforo || 0, g = grupos[l.zona || 'Sin zona'] || (grupos[l.zona || 'Sin zona'] = {zona: l.zona || 'Sin zona', lotes: [], area: 0, est: 0, prom: 0, aProm: 0, max: 0, aMax: 0});
    g.lotes.push(l); g.area += a; g.est += (l.tchEst || 0) * a;
    if (l.histProm !== null) { g.prom += l.histProm * a; g.aProm += a; }
    if (l.histMax !== null) { g.max += l.histMax * a; g.aMax += a; }
  });
  const filas = Object.values(grupos).map(g => {
    const est = g.area ? g.est / g.area : 0, plant = PLANT_ZONA[g.zona] ?? null, max = g.aMax ? g.max / g.aMax : null;
    return {zona: g.zona, lotes: g.lotes, n: g.lotes.length, area: g.area, est, prom: g.aProm ? g.prom / g.aProm : null, plant, max,
      dEsp: plant === null ? null : plant - est, dTecho: max === null ? null : max - est,
      tonEsp: plant === null ? 0 : (plant - est) * g.area, tonTecho: max === null ? 0 : g.max - g.est * g.aMax / (g.area || 1)};
  }).sort((a, b) => a.zona.localeCompare(b.zona, 'es', {numeric: true}));
  const area = filas.reduce((s, f) => s + f.area, 0), est = area ? filas.reduce((s, f) => s + f.est * f.area, 0) / area : 0;
  const tonEsp = filas.reduce((s, f) => s + f.tonEsp, 0), tonTecho = filas.reduce((s, f) => s + f.tonTecho, 0);
  return {filas, n: filas.reduce((s, f) => s + f.n, 0), area, est, tonEsp, tonTecho, dEsp: area ? tonEsp / area : 0, dTecho: area ? tonTecho / area : 0};
}
const esMolienda = l => String(l.clas || '').toLowerCase() === 'molienda';
/* Rótulos para mostrar: corrige tildes y mayúsculas de valores que vienen así de la fuente (no cambia los datos). */
const ROTULOS = {Aspersion: 'Aspersión', 'Mini-Aspersion': 'Miniaspersión', Investigacion: 'Investigación', 'Sin Caña': 'Sin caña',
  VARIEDADES: 'Varias / sin definir', PLATANO: 'Plátano', 'Baja Prod': 'Baja producción'};
const rotulo = v => ROTULOS[v] ?? v;

/* Semáforo agronómico. Mismos umbrales de versiones anteriores; se agregan estados informativos. */
function estadoLote(l) {
  if (!l) return {cls: 'neutro', txt: 'Sin dato'};
  if (l.cosechado) return {cls: 'info', txt: 'Cosechado ' + (l.zafra || ''), det: 'Corte ' + fechaCorta(l.fCorte)};
  if (l.conAforo && l.clas && !esMolienda(l)) return {cls: 'neutro', txt: rotulo(l.clas), det: 'Fuera del área de molienda'};
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
