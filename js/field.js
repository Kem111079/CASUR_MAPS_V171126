/* CASUR Maps · registros de campo (bitácora + hallazgo compartible), pestañas Visita / Bitácora / Más, reportes y arranque. */
'use strict';
const OBS_KEY = 'casur_maps_observaciones_v6'; // misma clave de versiones anteriores: conserva lo ya registrado
const CATEGORIAS = ['Seguimiento', 'Siembra', 'Madurante', 'Maleza', 'Plaga', 'Sequía', 'Despoblación', 'Riego', 'Acceso', 'Cosecha', 'Otro'];
const obsTodas = () => leerLS(OBS_KEY, []);
const obsGuardar = arr => escribirLS(OBS_KEY, arr);
/* Un registro de severidad media o alta queda pendiente hasta marcarlo resuelto. */
const esPendiente = o => !o.resuelto && (o.severidad === 'Media' || o.severidad === 'Alta');
const obsDeLote = cod => obsTodas().filter(o => codKey(o.codlote) === cod).reverse();
const fechaHora = iso => new Date(iso).toLocaleString('es-NI', {day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'});
function obsFilaHtml(o) {
  const pend = esPendiente(o);
  return `<div class="obs sev-${esc(String(o.severidad || '').toLowerCase())}${o.resuelto ? ' resuelta' : ''}"><div class="obs-cab"><b>${esc(o.categoria)} · ${esc(o.severidad)}</b><small>${esc(fechaHora(o.fecha_hora))}${o.photo_id ? ' · ' + ico('camera') : ''}</small></div>
    <p>${esc(o.nota || 'Sin nota')}</p>${o.resuelto ? `<p class="pie">${ico('check')} Resuelto el ${esc(fechaHora(o.resuelto))}</p>` : ''}
    <div class="obs-acc">${pend ? `<button type="button" class="ok" onclick="obsResolver('${esc(o.id)}',true)">${ico('check')} Resuelto</button>` : o.resuelto ? `<button type="button" onclick="obsResolver('${esc(o.id)}',false)">${ico('rotate')} Reabrir</button>` : ''}<button type="button" onclick="abrirRegistro('${esc(o.codlote)}','${esc(o.id)}')">${ico('edit')} Editar</button>${o.pos_fuente === 'gps' ? `<button type="button" onclick="compartirRegistro('${esc(o.id)}')">${ico('share')} Compartir</button>` : ''}<button type="button" onclick="obsBorrar('${esc(o.id)}')">${ico('trash')}</button></div></div>`;
}
function obsResolver(id, resuelto) {
  const arr = obsTodas(), o = arr.find(x => x.id === id); if (!o) return;
  if (resuelto) o.resuelto = new Date().toISOString(); else delete o.resuelto;
  obsGuardar(arr); refrescarVistas();
  if (resuelto) toast('Marcado como resuelto.', {tipo: 'bien', accion: 'Deshacer', alAccion: () => obsResolver(id, false)});
}
function pintarInsignia() {
  const n = obsTodas().filter(esPendiente).length, el = $('insigniaBit'); if (!el) return;
  el.hidden = !n; el.textContent = n > 99 ? '99+' : n;
}

/* ── Elegir lote sin pasar por el mapa: propone el del GPS, el seleccionado y los recientes; permite buscar ── */
let _alElegir = null;
function elegirLote(titulo, alElegir) {
  _alElegir = alElegir;
  const vistos = new Set(), sug = [];
  const add = (cod, motivo) => { if (cod && LOTES[cod] && !vistos.has(cod)) { vistos.add(cod); sug.push({cod, motivo}); } };
  GPS.cands.slice(0, 3).forEach(c => add(c.cod, c.inside ? 'Usted está aquí' : `a ${Math.round(c.d)} m`));
  add(selCod, 'seleccionado en el mapa'); LISTA.filter(x => !x.hecho).slice(0, 4).forEach(x => add(x.cod, 'lista del día')); recientes().slice(0, 5).forEach(c => add(c, 'reciente'));
  const fila = x => `<button type="button" data-cod="${esc(x.cod)}"><b>${esc(x.cod)}</b><span>${esc(LOTES[x.cod].hac)}${x.motivo ? ' · ' + esc(x.motivo) : ''}</span></button>`;
  abrirHoja(titulo, `<label class="campo">Buscar lote<input id="elegirQ" type="search" placeholder="Código o productor" autocomplete="off" autocapitalize="characters"></label>
    <div id="elegirRes" class="lista-lotes">${sug.map(fila).join('') || '<p class="vacio">Escriba el código del lote o el nombre del productor.</p>'}</div>`, 'alta');
  $('elegirQ').addEventListener('input', e => {
    const t = sinTildes(e.target.value).trim();
    const r = t ? indice.filter(it => it.tipo === 'lote' && (it.cod.startsWith(t) || it.n.includes(t))).sort((a, b) => (b.cod.startsWith(t) - a.cod.startsWith(t)) || a.cod.length - b.cod.length || a.cod.localeCompare(b.cod, 'es', {numeric: true})).slice(0, 12).map(it => ({cod: it.cod})) : sug;
    $('elegirRes').innerHTML = r.map(fila).join('') || '<p class="vacio">Sin coincidencias.</p>';
  });
  $('elegirRes').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const f = _alElegir; _alElegir = null; cerrarHoja(); f && f(b.dataset.cod); });
}
/* Lote al que va un registro hecho desde la Bitácora: el elegido a mano, el del GPS (si está dentro) o el seleccionado. */
let destinoManual = '';
function loteDestino() {
  if (destinoManual && LOTES[destinoManual]) return {cod: destinoManual, por: 'elegido'};
  const c = GPS.cands[0];
  if (GPS.lote) return {cod: GPS.lote, por: 'GPS'};
  if (c && c.inside) return {cod: c.cod, por: 'GPS'};
  if (selCod) return {cod: selCod, por: 'seleccionado en el mapa'};
  return null;
}
function nuevoRegistro() { const d = loteDestino(); if (d) abrirRegistro(d.cod); else elegirLote('¿En qué lote?', cod => { destinoManual = cod; abrirRegistro(cod); }); }
/* Registro rápido: un toque guarda categoría, lote, hora y posición. Nota y foto quedan para después. */
function registroRapido(cat) {
  const d = loteDestino();
  if (!d) { elegirLote('¿En qué lote? · ' + cat, cod => { destinoManual = cod; registroRapido(cat); }); return; }
  const g = gpsParaRegistro(d.cod);
  if (!g.ok) { if (g.activar) iniciarGps(false); toast(g.txt, {tipo: 'mal', ms: 6000}); return; }
  const l = LOTES[d.cod], pos = g.pos, arr = obsTodas(), ahora = new Date().toISOString();
  const o = {id: 'OBS-' + Date.now(), fecha_hora: ahora, codlote: d.cod, hacienda_productor: l.hac, tablon: selFeat && selFeat._cod === d.cod ? selFeat.properties.Tablon || '' : '',
    categoria: cat, severidad: 'Media', nota: '', lat: pos.lat, lng: pos.lng, precision_m: pos.acc, pos_fuente: pos.fuente, usuario: S.tecnico || 'CASUR Maps', photo_id: '', photo_name: '', photo_id2: ''};
  arr.push(o); if (!obsGuardar(arr)) return;
  vibrar(40); refrescarVistas();
  confirmar(`${cat} · lote ${d.cod}`);
  toast(`${cat} registrado en lote ${d.cod}.`, {tipo: 'bien', accion: 'Nota / foto', ms: 8000, alAccion: () => abrirRegistro(d.cod, o.id)});
}

/* ── Formulario único de registro (antes: "observación" y "hallazgo" por separado) ── */
let reg = null, _dictado = null;
async function abrirRegistro(cod, id = '') {
  cod = codKey(cod); const l = LOTES[cod]; if (!l) { toast('Seleccione primero un lote.'); return; }
  const o = id ? obsTodas().find(x => x.id === id) : null;
  reg = {cod, id, fotos: [null, null], ids: o ? [o.photo_id || '', o.photo_id2 || ''] : ['', ''], sev: o ? o.severidad : 'Media'};
  abrirHoja((o ? 'Editar registro · ' : 'Registrar en ') + 'lote ' + cod, `
    <p class="pie">${esc(l.hac)}${selFeat && selFeat._cod === cod && selFeat.properties.Tablon ? ' · tablón ' + esc(selFeat.properties.Tablon) : ''}</p>
    ${o ? `<div class="nota est-neutro">${o.pos_fuente === 'gps' ? ico('pin') + ' Se conserva la posición GPS original del registro.' : 'Registro anterior sin posición GPS: se puede editar, pero no compartir como hallazgo.'}</div>` : '<div id="regGps" class="nota est-neutro">Comprobando GPS…</div>'}
    <label class="campo">Categoría<select id="regCat">${CATEGORIAS.map(c => `<option ${o && o.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
    <div class="campo">Severidad<div class="segmento" id="regSev">${['Baja', 'Media', 'Alta'].map(s => `<button type="button" data-v="${s}" class="${reg.sev === s ? 'activo' : ''}">${s}</button>`).join('')}</div></div>
    <label class="campo">Nota<textarea id="regNota" rows="3" placeholder="Qué se observó…">${esc(o ? o.nota : '')}</textarea></label>
    <button type="button" class="btn ter ancho" id="regVoz">${ico('mic')} Dictar nota</button>
    <div class="fotos">${[0, 1].map(i => `<label class="foto" id="regFotoL${i}"><input type="file" accept="image/*" capture="environment" data-i="${i}"><span>${ico('camera')} Foto ${i + 1}</span></label>`).join('')}</div>
    <label class="campo">Técnico<input id="regTec" type="text" value="${esc((o && o.usuario && o.usuario !== 'CASUR Maps' ? o.usuario : '') || S.tecnico)}" placeholder="Su nombre (se guarda para la próxima vez)"></label>
    <p class="pie">En severidad alta la foto es obligatoria.</p>
    <div class="acciones"><button type="button" class="btn pri reg-guardar" onclick="guardarRegistro(false)">Guardar</button>${!o || o.pos_fuente === 'gps' ? '<button type="button" class="btn sec reg-guardar" onclick="guardarRegistro(true)">Guardar y compartir</button>' : ''}</div>`, 'alta');
  if (!o) { if (GPS.watch === null) iniciarGps(false); vigilarGpsRegistro(); }
  $('regSev').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; reg.sev = b.dataset.v; $('regSev').querySelectorAll('button').forEach(x => x.classList.toggle('activo', x === b)); });
  $('hojaBody').querySelectorAll('.foto input').forEach(inp => inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0], i = Number(inp.dataset.i); if (!f) return;
    try { reg.fotos[i] = await comprimirFoto(f); pintarFotoReg(i, reg.fotos[i]); } catch (e) { toast(e.message, {tipo: 'mal'}); }
  }));
  $('regVoz').addEventListener('click', alternarDictado);
  if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) $('regVoz').innerHTML = ico('mic') + ' Use el micrófono del teclado para dictar';
  for (let i = 0; i < 2; i++) if (reg.ids[i]) { const r = await fotoGet(reg.ids[i]).catch(() => null); if (r && reg && reg.id === id) pintarFotoReg(i, r.data_url); }
}
function pintarFotoReg(i, url) { const l = $('regFotoL' + i); if (l) { l.style.backgroundImage = `url(${url})`; l.classList.add('con-foto'); l.querySelector('span').innerHTML = ico('rotate') + ' Cambiar'; } }
function alternarDictado() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition, b = $('regVoz');
  if (!SR) { $('regNota').focus(); return; }
  if (_dictado) { detenerDictado(); return; }
  const base = $('regNota').value.trim();
  _dictado = new SR(); _dictado.lang = 'es-NI'; _dictado.interimResults = true; _dictado.continuous = true;
  _dictado.onresult = e => { let t = ''; for (const r of e.results) t += r[0].transcript; const n = $('regNota'); if (n) n.value = (base ? base + ' ' : '') + t.trim(); };
  _dictado.onerror = e => { toast(e.error === 'network' ? 'El dictado necesita señal.' : 'No se pudo usar el micrófono.', {tipo: 'mal'}); detenerDictado(); };
  _dictado.onend = () => { _dictado = null; if (b) b.innerHTML = ico('mic') + ' Dictar nota'; };
  try { _dictado.start(); b.innerHTML = ico('stop') + ' Detener dictado'; } catch (_) { _dictado = null; }
}
function detenerDictado() { if (_dictado) { try { _dictado.stop(); } catch (_) {} _dictado = null; } }
/* Un hallazgo solo se registra georreferenciado: GPS con precisión de 30 m o mejor y el técnico dentro del lote
   o a menos de 50 m. Así la coordenada guardada es donde realmente se hizo el registro. */
const REG_ACC_MAX = 30, REG_DIST_MAX = 50;
function gpsParaRegistro(cod) {
  const l = LOTES[cod], f = GPS.fix;
  if (!l || !l.feats.length) return {ok: false, txt: 'Este lote no tiene polígono en el mapa; no se puede georreferenciar.'};
  if (GPS.watch === null || !f) return {ok: false, activar: true, txt: 'Active el GPS: el hallazgo debe quedar georreferenciado.'};
  if (Date.now() - (f.reloj || 0) > 30000) return {ok: false, txt: 'Esperando una lectura reciente del GPS…'};
  if (f.acc > REG_ACC_MAX) return {ok: false, txt: `Precisión ±${f.acc} m. Espere a tener ±${REG_ACC_MAX} m o mejor (cielo despejado, sin moverse).`};
  let d = Infinity;
  for (const ft of l.feats) { if (contiene(ft, f.lng, f.lat)) { d = 0; break; } d = Math.min(d, distFeatM(ft, f.lng, f.lat)); }
  if (d > REG_DIST_MAX) return {ok: false, txt: `Usted está a ${fmtDist(d)} del lote ${cod}. Debe estar dentro o a menos de ${REG_DIST_MAX} m.`};
  return {ok: true, txt: `GPS ±${f.acc} m · ${d === 0 ? 'dentro del lote' : 'a ' + Math.round(d) + ' m del lote'}`, pos: {lat: +f.lat.toFixed(6), lng: +f.lng.toFixed(6), acc: f.acc, fuente: 'gps'}};
}
let _regGpsT = null;
function vigilarGpsRegistro() {
  clearInterval(_regGpsT);
  const tic = () => {
    const el = $('regGps'); if (!el || !reg || reg.id) { clearInterval(_regGpsT); return; }
    const g = gpsParaRegistro(reg.cod);
    el.className = 'nota ' + (g.ok ? 'est-bien' : 'est-mal'); el.innerHTML = ico(g.ok ? 'pin' : 'alert') + ' ' + esc(g.txt);
    document.querySelectorAll('.reg-guardar').forEach(b => { b.disabled = !g.ok; });
  };
  tic(); _regGpsT = setInterval(tic, 1000);
}
async function guardarRegistro(compartir) {
  if (!reg) return;
  detenerDictado();
  const arr = obsTodas(), prev = reg.id ? arr.find(x => x.id === reg.id) : null, l = LOTES[reg.cod], ahora = new Date().toISOString();
  S.tecnico = $('regTec').value.trim(); guardarAjustes();
  const ids = reg.ids.slice();
  if (reg.sev === 'Alta' && !reg.fotos[0] && !reg.fotos[1] && !ids[0] && !ids[1]) { toast('Severidad alta: agregue al menos una foto como evidencia.', {tipo: 'mal', ms: 5000}); return; }
  let pos;
  if (prev) pos = {lat: prev.lat, lng: prev.lng, acc: prev.precision_m, fuente: prev.pos_fuente || ''};
  else { const g = gpsParaRegistro(reg.cod); if (!g.ok) { toast(g.txt, {tipo: 'mal', ms: 6000}); return; } pos = g.pos; }
  for (let i = 0; i < 2; i++) if (reg.fotos[i]) {
    ids[i] = ids[i] || `FOTO-${Date.now()}-${i}`;
    try { await fotoPut({id: ids[i], codlote: reg.cod, created_at: ahora, lat: pos.lat, lng: pos.lng, precision_m: pos.acc, mime: 'image/jpeg', file_name: `${reg.cod}_${ids[i]}.jpg`, data_url: reg.fotos[i]}); }
    catch (e) { ids[i] = ''; toast('No se pudo guardar la foto.', {tipo: 'mal'}); }
  }
  const o = Object.assign(prev || {id: 'OBS-' + Date.now(), fecha_hora: ahora, codlote: reg.cod}, {
    hacienda_productor: l.hac, tablon: prev ? prev.tablon : (selFeat && selFeat._cod === reg.cod ? selFeat.properties.Tablon || '' : ''),
    categoria: $('regCat').value, severidad: reg.sev, nota: $('regNota').value.trim(),
    lat: pos.lat, lng: pos.lng, precision_m: pos.acc, pos_fuente: pos.fuente, usuario: S.tecnico || 'CASUR Maps',
    photo_id: ids[0], photo_name: ids[0] ? `${reg.cod}_${ids[0]}.jpg` : '', photo_id2: ids[1]
  });
  if (!prev) arr.push(o);
  if (!obsGuardar(arr)) return;
  const id = o.id; reg = null; clearInterval(_regGpsT); cerrarHoja(); refrescarVistas(); confirmar('Hallazgo guardado');
  if (compartir) compartirRegistro(id);
}
function obsBorrar(id) {
  const arr = obsTodas(), i = arr.findIndex(x => x.id === id); if (i < 0) return;
  const [o] = arr.splice(i, 1); obsGuardar(arr); refrescarVistas();
  toast('Registro borrado.', {accion: 'Deshacer', alAccion: () => { const a = obsTodas(); a.splice(Math.min(i, a.length), 0, o); obsGuardar(a); refrescarVistas(); }});
}
function refrescarVistas() { pintarInsignia(); pintarRegistros(); if (selCod) renderCard(); const t = document.body.dataset.tab; if (t === 'bitacora') renderBitacora(); if (t === 'visita') renderVisita(); }

/* ── Tarjeta de hallazgo como imagen para WhatsApp ── */
function rr(ctx, x, y, w, h, r, fill, stroke) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); } }
function textoEnLineas(ctx, txt, maxW) { const out = []; String(txt || '').split('\n').forEach(par => { let ln = ''; par.split(/\s+/).forEach(w => { const t = ln ? ln + ' ' + w : w; if (ctx.measureText(t).width > maxW && ln) { out.push(ln); ln = w; } else ln = t; }); out.push(ln); }); return out; }
const cargarImg = url => new Promise(res => { if (!url) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
async function imagenRegistro(o) {
  const l = LOTES[codKey(o.codlote)] || {cod: o.codlote, hac: o.hacienda_productor || ''}, edad = edadMeses(l);
  const fotos = (await Promise.all([o.photo_id, o.photo_id2].filter(Boolean).map(id => fotoGet(id).then(r => cargarImg(r && r.data_url)).catch(() => null)))).filter(Boolean);
  const W = 1200, c = document.createElement('canvas'), ctx = c.getContext('2d');
  ctx.font = '600 30px Arial'; const lineas = textoEnLineas(ctx, o.nota || 'Sin nota.', W - 200).slice(0, 12);
  // Cada foto se muestra completa (sin recortar ni deformar), centrada en su espacio.
  const cajaW = fotos.length === 2 ? (W - 180) / 2 : W - 160, cajaMaxH = fotos.length === 2 ? 560 : 820;
  const tam = fotos.map(img => { const k = Math.min(cajaW / img.width, cajaMaxH / img.height); return {w: img.width * k, h: img.height * k}; });
  const altoFotos = tam.length ? Math.max(...tam.map(t => t.h)) : 0;
  const hNota = 90 + lineas.length * 42, hFoto = fotos.length ? altoFotos + 30 : 0, H = 640 + hNota + hFoto + 110;
  c.width = W; c.height = H; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f4f7f5'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#0b7f3a'); g.addColorStop(1, '#005baa'); rr(ctx, 40, 40, W - 80, 150, 26, g);
  ctx.fillStyle = '#fff'; ctx.font = '900 54px Arial'; ctx.fillText('CASUR Maps', 80, 112); ctx.font = '600 28px Arial'; ctx.fillText('Registro de campo · Negocios de Caña', 80, 158);
  rr(ctx, 40, 215, W - 80, H - 255, 26, '#fff', '#dbe5dd');
  ctx.fillStyle = '#0f172a'; ctx.font = '900 56px Arial'; ctx.fillText('Lote ' + l.cod, 80, 300);
  ctx.fillStyle = '#334155'; ctx.font = '700 34px Arial'; ctx.fillText(String(l.hac || '').slice(0, 52), 80, 350);
  ctx.font = '600 26px Arial'; ctx.fillStyle = '#64748b'; ctx.fillText([o.tablon ? 'Tablón ' + o.tablon : '', l.variedad, fmtN(l.area, ' ha')].filter(x => x && x !== '—').join(' · '), 80, 392);
  const sev = {Alta: '#b91c1c', Media: '#b45309', Baja: '#0b7f3a'}[o.severidad] || '#334155';
  [['CATEGORÍA', o.categoria, '#0f172a'], ['SEVERIDAD', o.severidad, sev], ['TÉCNICO', (o.usuario && o.usuario !== 'CASUR Maps' ? o.usuario : 'No indicado').slice(0, 20), '#0f172a']].forEach((b, i) => {
    const x = 80 + i * 352; rr(ctx, x, 420, 336, 92, 18, '#f8fafc', '#e2e8f0'); ctx.fillStyle = '#64748b'; ctx.font = '800 20px Arial'; ctx.fillText(b[0], x + 20, 452); ctx.fillStyle = b[2]; ctx.font = '900 30px Arial'; ctx.fillText(b[1], x + 20, 492);
  });
  [['TCH ANTERIOR', fmtN(l.tchAnt, ' t/ha', nf1)], ['ESTIMADO 26/27', l.tchEst > 0 ? nf1.format(l.tchEst) + ' t/ha' : '—'], ['EDAD', edad === null ? '—' : nf1.format(edad) + ' meses']].forEach((b, i) => {
    const x = 80 + i * 352; rr(ctx, x, 528, 336, 92, 18, ['#fff6d8', '#e8f6ee', '#e9f0fb'][i], '#e2e8f0'); ctx.fillStyle = '#64748b'; ctx.font = '800 20px Arial'; ctx.fillText(b[0], x + 20, 560); ctx.fillStyle = '#0f172a'; ctx.font = '900 30px Arial'; ctx.fillText(b[1], x + 20, 600);
  });
  let y = 640; rr(ctx, 80, y, W - 160, hNota - 16, 20, '#f8fafc', '#dbe5dd');
  ctx.fillStyle = '#0b7f3a'; ctx.font = '900 28px Arial'; ctx.fillText('Hallazgo', 104, y + 44);
  ctx.fillStyle = '#0f172a'; ctx.font = '600 30px Arial'; lineas.forEach((ln, i) => ctx.fillText(ln, 104, y + 90 + i * 42));
  y += hNota;
  if (fotos.length) {
    fotos.forEach((img, i) => { const t = tam[i], x = 80 + i * (cajaW + 20) + (cajaW - t.w) / 2, yy = y + (altoFotos - t.h) / 2; ctx.save(); rr(ctx, x, yy, t.w, t.h, 16, '#eee'); ctx.clip(); ctx.drawImage(img, x, yy, t.w, t.h); ctx.restore(); });
    y += hFoto;
  }
  ctx.fillStyle = '#64748b'; ctx.font = '600 24px Arial';
  ctx.fillText(`${new Date(o.fecha_hora).toLocaleString('es-NI')}  ·  ${o.lat !== '' ? Number(o.lat).toFixed(6) + ', ' + Number(o.lng).toFixed(6) : 'sin coordenadas'}${o.pos_fuente === 'gps' ? ' · registrado en sitio, GPS ±' + o.precision_m + ' m' : ''}`, 80, y + 44);
  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.9));
}
/* Se comparte solo la imagen del hallazgo, sin texto ni enlaces. */
async function compartirRegistro(id) {
  const o = obsTodas().find(x => x.id === id); if (!o) return;
  if (o.pos_fuente !== 'gps') { toast('Este registro no tiene posición GPS: no se puede compartir como hallazgo.', {tipo: 'mal'}); return; }
  const blob = await imagenRegistro(o).catch(() => null);
  if (!blob) { toast('No se pudo generar la imagen.', {tipo: 'mal'}); return; }
  await compartirImagen(blob, `hallazgo_lote_${o.codlote}_${o.fecha_hora.slice(0, 10)}.jpg`);
}
async function compartirImagen(blob, nombre) {
  const file = new File([blob], nombre, {type: 'image/jpeg'});
  if (navigator.canShare && navigator.canShare({files: [file]})) { try { await navigator.share({files: [file]}); return; } catch (e) { if (e.name === 'AbortError') return; } }
  descargarBlob(nombre, blob); toast('Imagen descargada: adjúntela en WhatsApp.', {tipo: 'bien'});
}

/* ── Hallazgos pendientes como puntos en el mapa, en la coordenada donde se registraron ── */
let capaReg = null;
function pintarRegistros() {
  if (!map) return;
  if (!capaReg) capaReg = L.layerGroup().addTo(map);
  capaReg.clearLayers();
  if (!S.verRegistros) return;
  obsTodas().filter(esPendiente).forEach(o => {
    let ll = o.lat !== '' && Number.isFinite(Number(o.lat)) ? [Number(o.lat), Number(o.lng)] : centroideLote(LOTES[codKey(o.codlote)]);
    if (!ll) return;
    L.marker(ll, {icon: L.divIcon({className: 'pin-reg sev-' + String(o.severidad).toLowerCase(), html: '<span>!</span>', iconSize: [26, 26], iconAnchor: [13, 13]}), zIndexOffset: 700})
      .on('click', () => seleccionarLote(o.codlote, {full: true})).addTo(capaReg);
  });
}

/* ── Historial del lote: visitas en las que realmente se estuvo en él ── */
function visitasDeLote(cod) {
  return [...VISITAS, ...(VISITA ? [VISITA] : [])].filter(v => v.lotes && v.lotes[cod] && v.lotes[cod].visitado).sort((a, b) => new Date(b.inicio) - new Date(a.inicio));
}
function historialHtml(cod) {
  const vs = visitasDeLote(cod), todas = obsTodas().filter(o => codKey(o.codlote) === cod);
  if (!vs.length) return '<h4>Historial de visitas</h4><p class="vacio">Sin visitas registradas en este teléfono.</p>';
  const hace = Math.round((hoyLocal() - parseISO(vs[0].inicio.slice(0, 10))) / 86400000);
  return `<h4>Historial de visitas</h4><div class="nota ${hace > 30 ? 'est-medio' : 'est-neutro'}">Última visita ${hace === 0 ? 'hoy' : hace === 1 ? 'ayer' : 'hace ' + hace + ' días'} · ${vs.length} visita(s) en total</div>` +
    vs.slice(0, 4).map(v => { const a = new Date(v.inicio).getTime(), b = new Date(v.fin || Date.now()).getTime(), n = todas.filter(o => { const t = new Date(o.fecha_hora).getTime(); return t >= a && t <= b; }).length;
      return `<div class="hist-fila"><b>${esc(new Date(v.inicio).toLocaleDateString('es-NI', {day: '2-digit', month: 'short', year: 'numeric'}))}</b><span>${n ? n + ' hallazgo(s)' : 'sin hallazgos'}${v.tecnico ? ' · ' + esc(v.tecnico) : ''}${v.fin ? '' : ' · en curso'}</span></div>`; }).join('');
}

/* ── Fotos del lote por fecha y comparación entre dos fechas ── */
let cmp = null;
async function fotosDeLote(cod) { return (await fotoAll().catch(() => [])).filter(r => codKey(r.codlote) === cod && r.data_url).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))); }
async function pintarFotosLote(cod) {
  const fotos = await fotosDeLote(cod), box = $('fotosLote'); if (!box || selCod !== cod) return;
  if (!fotos.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<h4>Fotos del lote (${fotos.length})</h4><div class="tira">${fotos.slice(-12).map(f => `<button type="button" onclick="compararFotos('${esc(cod)}','${esc(f.id)}')"><img src="${f.data_url}" alt=""><span>${esc(new Date(f.created_at).toLocaleDateString('es-NI', {day: '2-digit', month: 'short'}))}</span></button>`).join('')}</div>
    ${fotos.length > 1 ? `<button type="button" class="btn sec ancho" onclick="compararFotos('${esc(cod)}')">${ico('swap')} Comparar dos fechas</button>` : ''}`;
}
async function compararFotos(cod, id = '') {
  const lista = await fotosDeLote(cod); if (!lista.length) return;
  const i = id ? Math.max(0, lista.findIndex(f => f.id === id)) : lista.length - 1;
  cmp = {cod, lista, a: lista.length > 1 ? (id ? (i === 0 ? 1 : 0) : 0) : 0, b: i};
  if (cmp.a > cmp.b) [cmp.a, cmp.b] = [cmp.b, cmp.a];
  abrirHoja('Fotos · lote ' + cod, '<div id="cmpBox"></div>', 'alta'); pintarComparacion();
}
function pintarComparacion() {
  const box = $('cmpBox'); if (!box || !cmp) return;
  const obs = obsTodas(), panel = (k, rot) => { const f = cmp.lista[cmp[k]], o = obs.find(x => x.photo_id === f.id || x.photo_id2 === f.id);
    return `<div class="cmp-panel"><div class="cmp-cab"><button type="button" onclick="cmpMover('${k}',-1)" ${cmp[k] === 0 ? 'disabled' : ''} aria-label="Foto anterior">${ico('chevLeft')}</button><span><b>${rot}</b> · ${esc(new Date(f.created_at).toLocaleDateString('es-NI', {day: '2-digit', month: 'short', year: 'numeric'}))}<small>${o ? esc(o.categoria) + ' · ' + esc(o.severidad) : ''} · ${cmp[k] + 1} de ${cmp.lista.length}</small></span><button type="button" onclick="cmpMover('${k}',1)" ${cmp[k] === cmp.lista.length - 1 ? 'disabled' : ''} aria-label="Foto siguiente">${ico('chevRight')}</button></div><img src="${f.data_url}" alt="Foto del lote"></div>`; };
  const dias = Math.round((new Date(cmp.lista[cmp.b].created_at) - new Date(cmp.lista[cmp.a].created_at)) / 86400000);
  box.innerHTML = cmp.lista.length > 1 ? `<p class="pie">${Math.abs(dias)} día(s) entre las dos fotos. Use las flechas para cambiar cada una.</p><div class="cmp">${panel('a', 'Antes')}${panel('b', 'Después')}</div>` : `<div class="cmp">${panel('b', 'Foto')}</div>`;
}
function cmpMover(k, d) { cmp[k] = Math.max(0, Math.min(cmp.lista.length - 1, cmp[k] + d)); pintarComparacion(); }

/* ── Cierre de visita: resumen en pantalla e imagen para enviar por WhatsApp ── */
function datosVisita(v) {
  const ini = new Date(v.inicio).getTime(), fin = new Date(v.fin || Date.now()).getTime(), cods = lotesVisitados(v);
  const obs = obsTodas().filter(o => { const t = new Date(o.fecha_hora).getTime(); return t >= ini && t <= fin; });
  return {ini, fin, cods, obs, pend: obs.filter(esPendiente), alta: obs.filter(o => o.severidad === 'Alta')};
}
function cierreVisita(v) {
  const d = datosVisita(v);
  abrirHoja('Visita finalizada', `
    <div class="cifras c4">${cifra('Duración', fmtDur(d.fin - d.ini))}${cifra('Distancia', fmtDist(v.dist || 0))}${cifra('Lotes', d.cods.length)}${cifra('Hallazgos', d.obs.length, d.alta.length ? 'c-alerta' : '')}</div>
    ${d.cods.length ? `<p class="pie">Lotes visitados: ${d.cods.map(esc).join(' · ')}</p>` : '<p class="vacio">No se registró ningún lote visitado (hay que estar dentro del lote).</p>'}
    ${d.pend.length ? `<h4>Pendientes abiertos (${d.pend.length})</h4>${d.pend.slice(0, 6).map(o => `<div class="hist-fila"><b>Lote ${esc(o.codlote)}</b><span>${esc(o.categoria)} · ${esc(o.severidad)}${o.nota ? ' · ' + esc(o.nota.slice(0, 60)) : ''}</span></div>`).join('')}` : '<div class="nota est-bien">Sin pendientes abiertos en esta visita.</div>'}
    <button type="button" class="btn pri ancho grande" onclick="compartirVisita('${esc(v.id)}')">${ico('share')} Enviar resumen por WhatsApp</button>
    <div class="acciones"><button type="button" class="btn sec" onclick="reporteVisita(visitaPorId('${esc(v.id)}'))">${ico('file')} Reporte completo</button><button type="button" class="btn ter" onclick="cerrarHoja()">Cerrar</button></div>`, 'alta');
}
async function compartirVisita(id) { const v = visitaPorId(id); if (!v) return; const blob = await imagenVisita(v); if (blob) compartirImagen(blob, `visita_${v.inicio.slice(0, 10)}.jpg`); }
function imagenVisita(v) {
  const d = datosVisita(v), W = 1200, filas = d.cods.slice(0, 14), pend = d.pend.slice(0, 8);
  const feats = d.cods.flatMap(c => (LOTES[c] || {feats: []}).feats), pts = v.pts || [];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const ext = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  pts.forEach(p => ext(p.lng, p.lat)); feats.forEach(f => { ext(f.bbox[0], f.bbox[1]); ext(f.bbox[2], f.bbox[3]); });
  const hayMapa = x0 < Infinity, k = hayMapa ? Math.cos((y0 + y1) / 2 * Math.PI / 180) : 1, mw = Math.max((x1 - x0) * k, 1e-5), mh = Math.max(y1 - y0, 1e-5);
  const esc2 = hayMapa ? Math.min((W - 200) / mw, 520 / mh) : 0, hMapa = hayMapa ? mh * esc2 + 60 : 0;
  const H = 470 + hMapa + (filas.length ? 70 + filas.length * 46 : 0) + (pend.length ? 80 + pend.length * 46 : 60) + 90;
  const c = document.createElement('canvas'), ctx = c.getContext('2d'); c.width = W; c.height = H;
  ctx.fillStyle = '#f4f7f5'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#0b7f3a'); g.addColorStop(1, '#005baa'); rr(ctx, 40, 40, W - 80, 150, 26, g);
  ctx.fillStyle = '#fff'; ctx.font = '900 54px Arial'; ctx.fillText('CASUR Maps', 80, 112); ctx.font = '600 28px Arial'; ctx.fillText('Resumen de visita de campo', 80, 158);
  rr(ctx, 40, 215, W - 80, H - 255, 26, '#fff', '#dbe5dd');
  ctx.fillStyle = '#0f172a'; ctx.font = '900 44px Arial'; ctx.fillText(new Date(v.inicio).toLocaleDateString('es-NI', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'}), 80, 290);
  ctx.fillStyle = '#64748b'; ctx.font = '600 28px Arial'; ctx.fillText(`${new Date(v.inicio).toLocaleTimeString('es-NI', {hour: '2-digit', minute: '2-digit'})} a ${new Date(d.fin).toLocaleTimeString('es-NI', {hour: '2-digit', minute: '2-digit'})}${v.tecnico || S.tecnico ? ' · ' + (v.tecnico || S.tecnico) : ''}`, 80, 332);
  [['DURACIÓN', fmtDur(d.fin - d.ini)], ['DISTANCIA', fmtDist(v.dist || 0)], ['LOTES', String(d.cods.length)], ['HALLAZGOS', `${d.obs.length}${d.alta.length ? ' (' + d.alta.length + ' altos)' : ''}`]].forEach((b, i) => {
    const x = 80 + i * 262; rr(ctx, x, 360, 248, 92, 18, '#f8fafc', '#e2e8f0'); ctx.fillStyle = '#64748b'; ctx.font = '800 20px Arial'; ctx.fillText(b[0], x + 18, 392); ctx.fillStyle = i === 3 && d.alta.length ? '#b91c1c' : '#0f172a'; ctx.font = '900 30px Arial'; ctx.fillText(b[1], x + 18, 432);
  });
  let y = 480;
  if (hayMapa) {
    const ox = 100 + ((W - 200) - mw * esc2) / 2, X = x => ox + (x - x0) * k * esc2, Y = yy => y + 20 + (y1 - yy) * esc2;
    feats.forEach(f => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).forEach(p => { ctx.beginPath(); p.forEach(r => { r.forEach((q, i) => i ? ctx.lineTo(X(q[0]), Y(q[1])) : ctx.moveTo(X(q[0]), Y(q[1]))); ctx.closePath(); }); ctx.fillStyle = '#e8f6ee'; ctx.fill('evenodd'); ctx.strokeStyle = '#0b7f3a'; ctx.lineWidth = 2; ctx.stroke(); }));
    if (pts.length > 1) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(X(p.lng), Y(p.lat)) : ctx.moveTo(X(p.lng), Y(p.lat))); ctx.strokeStyle = '#0a66ff'; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.stroke(); }
    d.pend.forEach(o => { if (o.lat === '') return; ctx.beginPath(); ctx.arc(X(Number(o.lng)), Y(Number(o.lat)), 11, 0, 7); ctx.fillStyle = o.severidad === 'Alta' ? '#d7191c' : '#d9a521'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke(); });
    ctx.font = '800 20px Arial'; ctx.textAlign = 'center'; ctx.fillStyle = '#0b3a66';
    d.cods.forEach(cd => { const ce = centroideLote(LOTES[cd]); if (ce) ctx.fillText(cd, X(ce[1]), Y(ce[0]) + 7); }); ctx.textAlign = 'left';
    y += hMapa;
  }
  if (filas.length) {
    ctx.fillStyle = '#0b7f3a'; ctx.font = '900 28px Arial'; ctx.fillText(`Lotes visitados (${d.cods.length})`, 80, y + 40); y += 70;
    filas.forEach(cd => { const l = LOTES[cd] || {}, n = d.obs.filter(o => codKey(o.codlote) === cd).length; ctx.fillStyle = '#0f172a'; ctx.font = '800 28px Arial'; ctx.fillText(cd, 80, y + 26); ctx.font = '500 26px Arial'; ctx.fillStyle = '#334155'; ctx.fillText(String(l.hac || '').slice(0, 34), 230, y + 26); ctx.fillStyle = n ? '#b45309' : '#64748b'; ctx.textAlign = 'right'; ctx.fillText(n ? n + ' hallazgo(s)' : 'sin hallazgos', W - 80, y + 26); ctx.textAlign = 'left'; y += 46; });
  }
  ctx.fillStyle = '#0b7f3a'; ctx.font = '900 28px Arial'; ctx.fillText(pend.length ? `Pendientes abiertos (${d.pend.length})` : 'Sin pendientes abiertos', 80, y + 46); y += 80;
  pend.forEach(o => { ctx.fillStyle = o.severidad === 'Alta' ? '#b91c1c' : '#b45309'; ctx.font = '800 26px Arial'; ctx.fillText(`Lote ${o.codlote} · ${o.categoria} · ${o.severidad}`, 80, y + 6); ctx.fillStyle = '#334155'; ctx.font = '500 24px Arial'; ctx.textAlign = 'right'; ctx.fillText(String(o.nota || '').slice(0, 38), W - 80, y + 6); ctx.textAlign = 'left'; y += 46; });
  ctx.fillStyle = '#64748b'; ctx.font = '600 22px Arial'; ctx.fillText('Generado por CASUR Maps · ' + new Date().toLocaleString('es-NI'), 80, H - 60);
  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.9));
}

/* ── Pestañas ── */
function mostrarTab(t) {
  if (document.body.dataset.tab === t) return;
  document.body.dataset.tab = t;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('activo', b.dataset.tab === t));
  if (t === 'visita') renderVisita(); else if (t === 'bitacora') renderBitacora(); else if (t === 'mas') renderMas(); else setTimeout(() => map && map.invalidateSize(), 50);
}
/* Gesto sobre un registro: deslizar a la derecha lo resuelve, a la izquierda lo borra (ambos con deshacer). */
function activarDeslizar(cont) {
  cont.querySelectorAll('.desliza').forEach(el => {
    let x0 = 0, y0 = 0, dx = 0, activo = false, id = null;
    el.addEventListener('pointerdown', e => { if (e.target.closest('button,a')) return; x0 = e.clientX; y0 = e.clientY; dx = 0; activo = false; id = e.pointerId; });
    el.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return; dx = e.clientX - x0;
      if (!activo && Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(e.clientY - y0) * 1.4) { activo = true; try { el.setPointerCapture(id); } catch (_) {} }
      if (activo) { el.style.transition = 'none'; el.style.transform = `translateX(${dx}px)`; el.dataset.gesto = dx > 0 ? 'resolver' : 'borrar'; el.style.opacity = String(Math.max(.35, 1 - Math.abs(dx) / 320)); }
    });
    const fin = () => {
      if (id === null) return; id = null; el.style.transition = '';
      const o = obsTodas().find(x => x.id === el.dataset.id);
      if (activo && Math.abs(dx) > 96 && o) { el.style.transform = `translateX(${dx > 0 ? 110 : -110}%)`; el.style.opacity = '0'; setTimeout(() => { if (dx > 0) { if (esPendiente(o)) obsResolver(o.id, true); else refrescarVistas(); } else obsBorrar(o.id); }, 160); }
      else { el.style.transform = ''; el.style.opacity = ''; delete el.dataset.gesto; }
      activo = false;
    };
    el.addEventListener('pointerup', fin); el.addEventListener('pointercancel', fin);
  });
}
let bitFiltro = 'pendientes';
function renderBitacora() {
  const todas = obsTodas().slice().reverse(), pend = todas.filter(esPendiente), d = loteDestino();
  if (bitFiltro === 'pendientes' && !pend.length && todas.length) bitFiltro = 'todos';
  const lista = bitFiltro === 'pendientes' ? pend : bitFiltro === 'resueltos' ? todas.filter(o => o.resuelto) : todas;
  const semana = todas.filter(o => Date.now() - new Date(o.fecha_hora) < 7 * 86400000).length;
  $('tabBitacora').innerHTML = `<header><h2>Bitácora</h2></header>
    <div class="destino ${d ? '' : 'sin'}"><span>${d ? `Se guardará en <b>lote ${esc(d.cod)}</b> · ${esc(LOTES[d.cod].hac)} <small>(${esc(d.por)})</small>` : 'Sin lote: active el GPS dentro de un lote o elija uno.'}</span><button type="button" onclick="elegirLote('Elegir lote', c => { destinoManual = c; renderBitacora(); })">${d ? 'Cambiar' : 'Elegir lote'}</button>${destinoManual ? '<button type="button" onclick="destinoManual=\'\';renderBitacora()" aria-label="Volver al lote del GPS">' + ico('x') + '</button>' : ''}</div>
    <p class="pie">Todo hallazgo se guarda con GPS: debe estar en el lote, con precisión de ${REG_ACC_MAX} m o mejor.</p>
    <h3>Registro rápido · un toque</h3>
    <div class="rapidos">${['Maleza', 'Plaga', 'Riego', 'Sequía', 'Despoblación', 'Acceso', 'Cosecha', 'Seguimiento'].map(c => `<button type="button" onclick="registroRapido('${c}')">${ico(ICONO_CAT[c])}${c}</button>`).join('')}</div>
    <h3>Registros</h3>
    <div class="cifras c3">${cifra('Pendientes', pend.length, pend.length ? 'c-alerta' : '')}${cifra('Últimos 7 días', semana)}${cifra('Total', todas.length)}</div>
    <div class="segmento filtro">${[['pendientes', 'Pendientes'], ['todos', 'Todos'], ['resueltos', 'Resueltos']].map(f => `<button type="button" class="${bitFiltro === f[0] ? 'activo' : ''}" onclick="bitFiltro='${f[0]}';renderBitacora()">${f[1]}</button>`).join('')}</div>
    ${lista.length ? lista.map(o => `<div class="bloque desliza" data-id="${esc(o.id)}"><div class="fila-ir plana"><button type="button" class="obs-lote-btn" onclick="seleccionarLote('${esc(o.codlote)}',{zoom:true})">Lote ${esc(o.codlote)} · ${esc(o.hacienda_productor || '')} ›</button>${llegarHtml(o.codlote, o.lat, o.lng)}</div>${obsFilaHtml(o)}</div>`).join('')
      : `<p class="vacio">${todas.length ? (bitFiltro === 'pendientes' ? 'Sin pendientes: todo lo de severidad media o alta está resuelto.' : 'Nada en este filtro.') : 'Aún no hay registros. Use un botón de registro rápido o "Nuevo hallazgo".'}</p>`}
    ${todas.length ? `<h3>Respaldo</h3><p class="pie">Los registros viven solo en este teléfono. Exporte para respaldarlos.</p><div class="acciones"><button type="button" class="btn sec" onclick="exportarZip()">${ico('download')} ZIP con fotos</button><button type="button" class="btn ter" onclick="exportarCsv()">CSV</button></div>
      <button type="button" class="btn peligro ancho" onclick="vaciarBitacora()">Borrar toda la bitácora y sus fotos</button>` : ''}
    <div class="barra-accion"><button type="button" class="btn pri grande" onclick="nuevoRegistro()">${ico('plus')} Nuevo hallazgo</button></div>`;
  if (lista.length) $('tabBitacora').querySelector('.segmento.filtro').insertAdjacentHTML('afterend', '<p class="pie">Deslice un registro a la derecha para resolverlo o a la izquierda para borrarlo.</p>');
  activarDeslizar($('tabBitacora'));
}
const CSV_OBS = ['id', 'fecha_hora', 'codlote', 'hacienda_productor', 'tablon', 'categoria', 'severidad', 'nota', 'lat', 'lng', 'precision_m', 'pos_fuente', 'usuario', 'photo_name', 'photo_id2', 'estado', 'resuelto'];
function csvBitacora() { return '﻿' + [CSV_OBS.join(','), ...obsTodas().map(o => csvLinea(CSV_OBS.map(h => h === 'estado' ? (o.resuelto ? 'Resuelto' : esPendiente(o) ? 'Pendiente' : 'Informativo') : o[h])))].join('\n'); }
function exportarCsv() { if (!obsTodas().length) { toast('No hay registros para exportar.'); return; } descargarTexto(`bitacora_casur_${new Date().toISOString().slice(0, 10)}.csv`, csvBitacora(), 'text/csv;charset=utf-8'); }
async function exportarZip() {
  if (!obsTodas().length) { toast('No hay registros para exportar.'); return; }
  const archivos = [{nombre: 'bitacora.csv', datos: new TextEncoder().encode(csvBitacora())}];
  (await fotoAll().catch(() => [])).forEach(r => { if (r.data_url) archivos.push({nombre: 'fotos/' + (r.file_name && r.file_name.includes(r.id) ? r.file_name : `${r.codlote || 'lote'}_${r.id}.jpg`), datos: dataUrlBytes(r.data_url)}); });
  descargarBlob(`bitacora_casur_${new Date().toISOString().slice(0, 10)}.zip`, crearZip(archivos));
  toast(`ZIP generado: ${obsTodas().length} registros y ${archivos.length - 1} foto(s).`, {tipo: 'bien'});
}
async function vaciarBitacora() {
  if (!confirm('¿Borrar TODOS los registros y fotos de este teléfono? Exporte antes si los necesita.')) return;
  obsGuardar([]); try { await fotoTx('readwrite', s => s.clear()); } catch (_) {} renderBitacora(); toast('Bitácora vacía.');
}

let _visT = null;
function renderVisita() {
  const v = VISITA, el = $('tabVisita'); clearInterval(_visT);
  const lista = LISTA.length ? `<div class="lista-lotes">${LISTA.map((x, i) => `<div class="fila-lista ${x.hecho ? 'hecho' : ''}"><button type="button" class="chk" onclick="listaMarcar('${esc(x.cod)}',${!x.hecho})">${x.hecho ? ico('check') : i + 1}</button><button type="button" class="ir" onclick="seleccionarLote('${esc(x.cod)}',{zoom:true})"><b>${esc(x.cod)}</b><span>${esc((LOTES[x.cod] || {}).hac || '')}</span></button>${llegarHtml(x.cod)}<button type="button" class="quitar" onclick="listaToggle('${esc(x.cod)}')" aria-label="Quitar">${ico('x')}</button></div>`).join('')}</div><button type="button" class="btn ter ancho" onclick="listaVaciar()">Vaciar lista</button>`
    : '<p class="vacio">Agregue lotes desde su tarjeta con "Lista del día". Aparecen numerados en el mapa y se marcan solos al visitarlos.</p>';
  const previas = VISITAS.slice(-10).reverse().map(x => `<div class="bloque"><b>${esc(new Date(x.inicio).toLocaleString('es-NI', {dateStyle: 'medium', timeStyle: 'short'}))}</b><p>${fmtDur(new Date(x.fin || x.inicio) - new Date(x.inicio))} · ${fmtDist(x.dist || 0)} · ${lotesVisitados(x).length} lote(s)</p>
      <div class="obs-acc"><button type="button" onclick="reporteVisita(visitaPorId('${x.id}'))">${ico('file')} Reporte</button><button type="button" onclick="verRuta(visitaPorId('${x.id}'))">${ico('map')} Ruta</button><button type="button" onclick="csvVisita(visitaPorId('${x.id}'))">CSV</button><button type="button" onclick="borrarVisita('${x.id}')">${ico('trash')}</button></div></div>`).join('');
  el.innerHTML = `<header><h2>Visita de campo</h2><p>Registra ruta, distancia y los lotes en los que realmente estuvo.</p></header>
    ${v ? `<div class="cifras c4 grande">${cifra('Tiempo', `<em id="visTiempo">${fmtDur(Date.now() - new Date(v.inicio))}</em>`)}${cifra('Distancia', fmtDist(v.dist))}${cifra('Lotes', lotesVisitados(v).length)}${cifra('GPS', GPS.fix ? '±' + GPS.fix.acc + ' m' : '—')}</div>
      ${lotesVisitados(v).length ? `<p class="pie">Visitados: ${lotesVisitados(v).map(esc).join(' · ')}</p>` : ''}
      <div class="acciones"><button type="button" class="btn sec" onclick="verRuta(VISITA)">${ico('map')} Ver ruta</button></div>`
      : '<p class="vacio">Sin visita en curso. Use el botón de abajo para iniciar.</p>'}
    <h3>Lista del día</h3>
    <label class="campo">Planificar: agregar finca o lote<input id="planQ" type="search" placeholder="Nombre de finca, productor o código de lote" autocomplete="off" autocapitalize="characters"></label>
    <div id="planRes" class="lista-lotes"></div>
    ${lista}
    <h3>Visitas anteriores</h3>${previas || '<p class="vacio">Sin visitas guardadas.</p>'}
    <div class="barra-accion">${v ? `<button type="button" class="btn peligro grande" onclick="finalizarVisita()">${ico('stop')} Finalizar visita</button>` : `<button type="button" class="btn pri grande" onclick="iniciarVisita()">${ico('play')} Iniciar visita</button>`}</div>`;
  $('planQ').addEventListener('input', e => planBuscar(e.target.value));
  $('planRes').addEventListener('click', planClick);
  if (v) _visT = setInterval(() => { const t = $('visTiempo'); if (t && VISITA) t.textContent = fmtDur(Date.now() - new Date(VISITA.inicio)); else clearInterval(_visT); }, 1000);
}
/* Planificación de la lista del día: por finca (todos, solo prioridad alta o con corte próximo) o lote a lote. */
const planGrupos = f => { const ls = f.lotes.map(c => LOTES[c]).filter(l => l.nPoly); return {todos: ls, alta: ls.filter(l => estadoLote(l).cls === 'mal'), corte: ls.filter(l => { const c = claseCorte(l); return c !== null && c <= 2; })}; };
function planBuscar(q) {
  const t = sinTildes(q).trim(), res = $('planRes'); if (!res) return;
  if (!t) { res.innerHTML = ''; return; }
  const fincas = Object.values(FINCAS).filter(f => sinTildes(f.nombre).includes(t)).sort((a, b) => b.lotes.length - a.lotes.length).slice(0, 4);
  const lotes = Object.values(LOTES).filter(l => l.nPoly && l.cod.startsWith(t)).sort((a, b) => a.cod.length - b.cod.length || a.cod.localeCompare(b.cod, 'es', {numeric: true})).slice(0, 6);
  res.innerHTML = fincas.map(f => { const g = planGrupos(f); return `<div class="plan-finca"><b>${ico('home')} ${esc(f.nombre)}</b><div class="obs-acc"><button type="button" data-finca="${esc(f.nombre)}" data-g="todos">${ico('plus')} Todos (${g.todos.length})</button>${g.alta.length ? `<button type="button" data-finca="${esc(f.nombre)}" data-g="alta">${ico('plus')} Prioridad alta (${g.alta.length})</button>` : ''}${g.corte.length ? `<button type="button" data-finca="${esc(f.nombre)}" data-g="corte">${ico('plus')} Corte próximo (${g.corte.length})</button>` : ''}</div></div>`; }).join('') +
    lotes.map(l => `<button type="button" data-lote="${esc(l.cod)}"><b>${esc(l.cod)}</b><span>${esc(l.hac)} · ${fmtN(l.area, ' ha', nf1)}</span><i class="chip ${listaTiene(l.cod) ? 'est-bien' : 'est-neutro'}">${listaTiene(l.cod) ? ico('check') + ' en lista' : ico('plus') + ' agregar'}</i></button>`).join('') || '<p class="vacio">Sin coincidencias.</p>';
}
function planClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  let cods = [];
  if (b.dataset.lote) cods = [b.dataset.lote]; else if (b.dataset.finca) cods = planGrupos(FINCAS[b.dataset.finca])[b.dataset.g].map(l => l.cod);
  const nuevos = cods.filter(c => !listaTiene(c));
  if (!nuevos.length) { toast('Ya estaban en la lista.'); return; }
  nuevos.forEach(c => LISTA.push({cod: c, hecho: false}));
  listaGuardar(); toast(`${nuevos.length} lote(s) agregados a la lista del día.`, {tipo: 'bien'});
}
const visitaPorId = id => VISITAS.find(x => x.id === id);
async function borrarVisita(id) { if (!confirm('¿Borrar esta visita?')) return; VISITAS = VISITAS.filter(x => x.id !== id); await kvSet('visitas', VISITAS); renderVisita(); }
function csvVisita(v) { if (!v) return; descargarTexto(`visita_${v.id}.csv`, '﻿' + ['t,lat,lng,precision_m,codlote', ...v.pts.map(p => csvLinea([p.t, p.lat, p.lng, p.acc, p.cod]))].join('\n'), 'text/csv;charset=utf-8'); }

/* Reporte imprimible (PDF desde el navegador) con mapa de la ruta, lotes y registros con fotos. */
function svgRuta(v) {
  const cods = lotesVisitados(v), feats = cods.flatMap(c => (LOTES[c] || {feats: []}).feats), pts = v.pts;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const ext = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  pts.forEach(p => ext(p.lng, p.lat)); feats.forEach(f => { ext(f.bbox[0], f.bbox[1]); ext(f.bbox[2], f.bbox[3]); });
  if (x0 === Infinity) return '';
  const k = Math.cos((y0 + y1) / 2 * Math.PI / 180), W = 900, pad = 20, w = Math.max((x1 - x0) * k, 1e-5), h = Math.max(y1 - y0, 1e-5), s = Math.min((W - 2 * pad) / w, 520 / h), H = h * s + 2 * pad;
  const X = x => (pad + (x - x0) * k * s).toFixed(1), Y = y => (pad + (y1 - y) * s).toFixed(1);
  const polys = feats.map(f => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map(p => `<path d="${p.map(r => 'M' + r.map(c => X(c[0]) + ' ' + Y(c[1])).join('L') + 'Z').join('')}" fill="#e8f6ee" stroke="#0b7f3a" stroke-width="1.2" fill-rule="evenodd"/>`).join('')).join('');
  const etq = cods.map(c => { const ce = centroideLote(LOTES[c]); return ce ? `<text x="${X(ce[1])}" y="${Y(ce[0])}" font-size="13" font-weight="700" text-anchor="middle" fill="#0b3a66">${esc(c)}</text>` : ''; }).join('');
  const ruta = pts.length > 1 ? `<polyline points="${pts.map(p => X(p.lng) + ',' + Y(p.lat)).join(' ')}" fill="none" stroke="#0a66ff" stroke-width="3" stroke-linejoin="round"/><circle cx="${X(pts[0].lng)}" cy="${Y(pts[0].lat)}" r="6" fill="#0b7f3a"/><circle cx="${X(pts[pts.length - 1].lng)}" cy="${Y(pts[pts.length - 1].lat)}" r="6" fill="#b91c1c"/>` : '';
  return `<svg viewBox="0 0 ${W} ${H.toFixed(0)}" style="width:100%;border:1px solid #dbe5dd;border-radius:12px;background:#fbfdfc">${polys}${ruta}${etq}</svg><p class="s">● verde: inicio · ● rojo: fin · línea azul: recorrido</p>`;
}
async function reporteVisita(v) {
  if (!v) { toast('No hay visita para reportar.'); return; }
  const ini = new Date(v.inicio).getTime(), fin = new Date(v.fin || Date.now()).getTime(), cods = lotesVisitados(v);
  const obs = obsTodas().filter(o => { const t = new Date(o.fecha_hora).getTime(); return t >= ini && t <= fin; });
  const fotos = {}; for (const o of obs) for (const id of [o.photo_id, o.photo_id2]) if (id) { const r = await fotoGet(id).catch(() => null); if (r) fotos[id] = r.data_url; }
  const filasL = cods.map(c => { const l = LOTES[c] || {}, s = estadoLote(LOTES[c]); return `<tr><td><b>${esc(c)}</b></td><td>${esc(l.hac || '—')}</td><td>${esc(l.variedad || '—')}</td><td>${fmtN(l.area, '', nf1)}</td><td>${fmtN(l.tchAnt, '', nf1)}</td><td>${l.tchEst > 0 ? nf1.format(l.tchEst) : '—'}</td><td>${esc(s.txt)}</td><td>${obs.filter(o => codKey(o.codlote) === c).length}</td></tr>`; }).join('');
  const bloquesO = obs.map(o => `<div class="o"><b>Lote ${esc(o.codlote)} · ${esc(o.categoria)} · ${esc(o.severidad)}</b> <span class="s">${esc(new Date(o.fecha_hora).toLocaleString('es-NI'))}${o.lat !== '' ? ' · ' + Number(o.lat).toFixed(5) + ', ' + Number(o.lng).toFixed(5) : ''}</span><p>${esc(o.nota || 'Sin nota')}</p>${[o.photo_id, o.photo_id2].filter(id => fotos[id]).map(id => `<img src="${fotos[id]}">`).join('')}</div>`).join('');
  const alta = obs.filter(o => o.severidad === 'Alta');
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reporte de visita ${esc(v.id)}</title><style>
    @page{size:letter;margin:12mm}body{font-family:Segoe UI,Roboto,Arial,sans-serif;color:#17212b;margin:0 auto;max-width:980px;padding:16px}h1{margin:0;font-size:24px}h2{font-size:17px;margin:20px 0 8px;color:#0b6031}
    .cab{border-bottom:4px solid #0b7f3a;padding-bottom:10px}.s{color:#64748b;font-size:12px}.k{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0}.k div{border:1px solid #dbe5dd;border-radius:10px;padding:10px}.k span{display:block;font-size:11px;color:#64748b;text-transform:uppercase;font-weight:700}.k b{font-size:20px}
    table{width:100%;border-collapse:collapse;font-size:12px}th{background:#0b7f3a;color:#fff;text-align:left;padding:6px}td{border-bottom:1px solid #e5e7eb;padding:6px}.o{border:1px solid #dbe5dd;border-radius:10px;padding:10px;margin-bottom:8px;break-inside:avoid}.o p{margin:6px 0}.o img{max-width:48%;max-height:260px;border-radius:8px;margin:4px 1% 0 0}
    button{padding:10px 16px;font-size:15px;border-radius:10px;border:0;background:#0b7f3a;color:#fff;font-weight:700}@media print{button{display:none}}</style></head><body>
    <div class="cab"><h1>Reporte de visita de campo</h1><div class="s">CASUR · Departamento de Negocios de Caña${v.tecnico || S.tecnico ? ' · Técnico: ' + esc(v.tecnico || S.tecnico) : ''} · generado ${esc(new Date().toLocaleString('es-NI'))}</div></div>
    <p><button onclick="print()">Imprimir / guardar PDF</button></p>
    <div class="k"><div><span>Inicio</span><b>${esc(new Date(v.inicio).toLocaleString('es-NI', {dateStyle: 'short', timeStyle: 'short'}))}</b></div><div><span>Duración</span><b>${fmtDur(fin - ini)}</b></div><div><span>Distancia</span><b>${fmtDist(v.dist || 0)}</b></div><div><span>Lotes / registros</span><b>${cods.length} / ${obs.length}</b></div></div>
    <p>${cods.length ? `Se visitaron ${cods.length} lote(s) y se dejaron ${obs.length} registro(s).` : 'No se registraron lotes visitados.'} ${alta.length ? `<b>${alta.length} de severidad alta</b>: ${alta.map(o => 'lote ' + esc(o.codlote) + ' (' + esc(o.categoria) + ')').join(', ')}.` : ''}</p>
    <h2>Recorrido</h2>${svgRuta(v) || '<p class="s">Sin puntos GPS.</p>'}
    <h2>Lotes visitados</h2><table><thead><tr><th>Lote</th><th>Hacienda / productor</th><th>Variedad</th><th>ha</th><th>TCH ant.</th><th>Estimado</th><th>Estado</th><th>Reg.</th></tr></thead><tbody>${filasL || '<tr><td colspan="8">Sin lotes.</td></tr>'}</tbody></table>
    <h2>Registros</h2>${bloquesO || '<p class="s">Sin registros durante la visita.</p>'}</body></html>`;
  const blob = new Blob([html], {type: 'text/html;charset=utf-8'}), w = window.open(URL.createObjectURL(blob), '_blank');
  if (!w) descargarBlob(`reporte_visita_${v.id}.html`, blob);
}

/* ── Pestaña Más: resumen de aforo, ajustes, datos e instalación ── */
let aforoGrupo = 'hacienda', instalarEvt = null;
function renderMas() {
  const g = (RESUMEN.resumen || {}).global || {}, filas = ((RESUMEN.resumen || {})[aforoGrupo] || []);
  const sel = (id, ops, val) => `<select id="${id}">${ops.map(o => `<option value="${o[0]}" ${o[0] === val ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>`;
  $('tabMas').innerHTML = `<div class="marca"><img src="./assets/logo_casur.png" alt="CASUR"><div><b>CASUR Maps</b><span>Departamento de Negocios de Caña</span></div></div>
    <button type="button" class="btn sec ancho" onclick="abrirTablero(true)">${ico('board')} Tablero de hoy</button>
    <header><h2>Resumen aforo 26/27</h2></header>
    <div class="cifras c4">${cifra('Área molienda', nf0.format(g.area_ha || 0) + ' ha')}${cifra('Toneladas', nf0.format(g.toneladas || 0))}${cifra('TCH pond.', fmtN(g.tch_ponderado, '', nf), 'c-est')}${cifra('TCH optimista', fmtN(g.tch_opt_ponderado, '', nf))}</div>
    <label class="campo">Buscar finca o lote<input id="aforoQ" type="search" placeholder="Nombre de finca, productor o código de lote" autocomplete="off" autocapitalize="characters" enterkeyhint="search"></label>
    <div id="aforoRes" class="lista-lotes"></div>
    <label class="campo">Agrupar por${sel('aforoGrupo', [['hacienda', 'Hacienda / productor'], ['zona', 'Zona'], ['finca', 'Finca y tenencia']], aforoGrupo)}</label>
    <div class="tabla"><table><thead><tr><th>Grupo</th><th>ha mol.</th><th>Ton.</th><th>TCH</th><th>Optim.</th></tr></thead><tbody id="aforoFilas">${filasAforo(filas)}</tbody></table></div>
    <h3>Ajustes</h3>
    <label class="campo">Técnico<input id="ajTec" type="text" value="${esc(S.tecnico)}" placeholder="Su nombre"></label>
    <label class="campo">Uso del GPS${sel('ajGps', [['vehiculo', 'En vehículo (recomendado)'], ['campo', 'Caminando'], ['preciso', 'Punto fijo, máxima precisión']], S.gpsPerfil)}</label>
    <label class="campo">Pantalla${sel('ajTema', [['campo', 'Campo · alto contraste para sol'], ['auto', 'Automático · oscuro de 7 p. m. a 5:30 a. m.'], ['claro', 'Claro suave'], ['oscuro', 'Oscuro · madrugada']], S.tema)}</label>
    <label class="campo">Tamaño de letra${sel('ajLetra', [['normal', 'Normal'], ['grande', 'Grande'], ['muygrande', 'Muy grande']], S.letra || 'normal')}</label>
    <label class="interruptor"><input type="checkbox" id="ajTab" ${S.tablero ? 'checked' : ''}><span>Mostrar el tablero del día al abrir</span></label>
 <label class="campo">Orientación del mapa con GPS${sel('ajOri', [['rumbo', 'Rumbo arriba · el mapa gira con su avance'], ['norte', 'Norte arriba · el mapa no gira']], S.orientacion)}</label>
    <label class="interruptor"><input type="checkbox" id="ajAuto" ${S.gpsAuto ? 'checked' : ''}><span>Activar el GPS al abrir la app</span></label>
    <label class="interruptor"><input type="checkbox" id="ajPant" ${S.pantalla ? 'checked' : ''}><span>Mantener la pantalla encendida durante la visita</span></label>
    <label class="interruptor"><input type="checkbox" id="ajVib" ${S.vibrar ? 'checked' : ''}><span>Vibrar al entrar a un lote</span></label>
    <h3>Datos</h3>
    <div class="kvs"><div><span>Datos al</span><b>${fechaCorta(META.datos_al || META.generated_at)}</b></div><div><span>Cortes de zafra al</span><b>${META.cortes_al ? fechaCorta(META.cortes_al) : 'Sin cargar'}</b></div><div><span>Shape</span><b>${esc(META.fuente_shape || '—')}</b></div><div><span>Aforo</span><b>${esc(META.fuente_aforo_version || META.fuente_aforo || '—')}</b></div><div><span>Polígonos / lotes</span><b>${nf0.format(META.poligonos || 0)} / ${nf0.format(META.codlotes_shape || 0)}</b></div><div><span>Versión de la app</span><b>${APP_VERSION}</b></div><div><span>Espacio usado</span><b id="espacio">…</b></div></div>
    ${META.cortes_al ? '' : '<div class="nota est-medio">Sin cortes de la zafra en curso: la edad y el TCH anterior vienen de la zafra 25/26.</div>'}
    <div class="acciones"><button type="button" class="btn sec" onclick="revisarDatos()">${ico('rotate')} Buscar datos nuevos</button><button type="button" class="btn ter" onclick="borrarMapas()">Borrar mapas guardados</button></div>
    ${instalarEvt ? '<div class="acciones"><button type="button" class="btn pri" onclick="instalarApp()">' + ico('download') + ' Instalar app</button></div>' : ''}`;
  $('aforoGrupo').addEventListener('change', e => { aforoGrupo = e.target.value; renderMas(); });
  $('aforoQ').addEventListener('input', e => buscarAforo(e.target.value));
  $('aforoRes').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.finca) abrirFinca(b.dataset.finca); else seleccionarLote(b.dataset.lote, {zoom: true}); });
  $('tabMas').querySelector('tbody').addEventListener('click', e => { const tr = e.target.closest('tr[data-finca]'); if (tr) abrirFinca(tr.dataset.finca); });
  $('ajTec').addEventListener('change', e => { S.tecnico = e.target.value.trim(); guardarAjustes(); });
  $('ajGps').addEventListener('change', e => { S.gpsPerfil = e.target.value; guardarAjustes(); });
  $('ajTema').addEventListener('change', e => { S.tema = e.target.value; guardarAjustes(); aplicarTema(); capaLotes.setStyle(estiloFeat); pintarSeleccion(); });
  $('ajLetra').addEventListener('change', e => { S.letra = e.target.value; guardarAjustes(); aplicarTema(); });
  $('ajTab').addEventListener('change', e => { S.tablero = e.target.checked; guardarAjustes(); });
  $('ajOri').addEventListener('change', e => { S.orientacion = e.target.value; guardarAjustes(); orientar(); pintarBrujula(); });
  $('ajAuto').addEventListener('change', e => { S.gpsAuto = e.target.checked; guardarAjustes(); });
  $('ajPant').addEventListener('change', e => { S.pantalla = e.target.checked; guardarAjustes(); S.pantalla ? pedirPantalla() : soltarPantalla(); });
  $('ajVib').addEventListener('change', e => { S.vibrar = e.target.checked; guardarAjustes(); vibrar(); });
  if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(e => { const el = $('espacio'); if (el) el.textContent = nf0.format((e.usage || 0) / 1048576) + ' MB'; }).catch(() => {});
}
function filasAforo(filas) {
  return filas.map(x => `<tr ${aforoGrupo === 'hacienda' ? `data-finca="${esc(x.key)}"` : ''}><td>${esc(x.key)}</td><td>${nf0.format(x.area_ha)}</td><td>${nf0.format(x.toneladas)}</td><td><b>${x.area_ha ? nf1.format(x.tch_ponderado) : '—'}</b></td><td>${x.area_ha ? nf1.format(x.tch_opt_ponderado) : '—'}</td></tr>`).join('') || '<tr><td colspan="5">Sin coincidencias en esta agrupación.</td></tr>';
}
/* Búsqueda dentro del resumen: fincas/productores con sus totales y lotes con su aforo. También filtra la tabla. */
function buscarAforo(q) {
  const t = sinTildes(q).trim(), res = $('aforoRes'), todas = (RESUMEN.resumen || {})[aforoGrupo] || [];
  $('aforoFilas').innerHTML = filasAforo(t ? todas.filter(x => sinTildes(x.key).includes(t)) : todas);
  if (!t) { res.innerHTML = ''; return; }
  const fincas = ((RESUMEN.resumen || {}).hacienda || []).filter(x => sinTildes(x.key).includes(t)).slice(0, 6);
  const lotes = Object.values(LOTES).filter(l => l.cod.startsWith(t)).sort((a, b) => a.cod.length - b.cod.length || a.cod.localeCompare(b.cod, 'es', {numeric: true})).slice(0, 8);
  res.innerHTML = fincas.map(x => `<button type="button" data-finca="${esc(x.key)}"><b>${ico('home')}</b><span><strong>${esc(x.key)}</strong><br>${nf0.format(x.area_ha)} ha mol. · ${nf0.format(x.toneladas)} t · TCH ${x.area_ha ? nf1.format(x.tch_ponderado) : '—'} · optim. ${x.area_ha ? nf1.format(x.tch_opt_ponderado) : '—'}</span></button>`).join('') +
    lotes.map(l => `<button type="button" data-lote="${esc(l.cod)}"><b>${esc(l.cod)}</b><span>${esc(l.hac)}<br>${fmtN(l.area, ' ha', nf1)} · ${l.conAforo ? `${esc(l.clas || '')} · est. ${l.tchEst > 0 ? nf1.format(l.tchEst) : '—'} · optim. ${l.tchOpt > 0 ? nf1.format(l.tchOpt) : '—'} · ${l.tonEst > 0 ? nf0.format(l.tonEst) + ' t' : '— t'}` : 'sin aforo 26/27'}</span></button>`).join('') ||
    '<p class="vacio">Sin coincidencias. Pruebe con el código del lote o parte del nombre.</p>';
}
async function revisarDatos() { buscarActualizacion(await dataCache(), META, true); }
async function borrarMapas() { try { await caches.delete('casur-tiles-v1'); toast('Mapas base guardados borrados.'); renderMas(); } catch (_) {} }
async function instalarApp() { if (!instalarEvt) return; instalarEvt.prompt(); await instalarEvt.userChoice.catch(() => null); instalarEvt = null; if (document.body.dataset.tab === 'mas') renderMas(); }
const appInstalada = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let _avisoInst = false;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); instalarEvt = e; avisarInstalacion(); });
window.addEventListener('appinstalled', () => { instalarEvt = null; toast('CASUR Maps quedó instalada.', {tipo: 'bien'}); });
/* Al abrir sin estar instalada: invita a instalar. En iPhone no hay instalación directa y se indican los pasos. */
function avisarInstalacion() {
  if (_avisoInst || appInstalada() || !$('loader').hidden) return;
  if (instalarEvt) { _avisoInst = true; toast('Instale CASUR Maps en este teléfono para abrirla sin señal.', {accion: 'Instalar', ms: 15000, alAccion: instalarApp}); }
  else if (/iphone|ipad|ipod/i.test(navigator.userAgent)) { _avisoInst = true; toast('Para instalar: toque Compartir y luego "Agregar a inicio".', {ms: 12000}); }
}

/* ── Tablero del día: lo que hay que atender hoy, en una sola pantalla ── */
function abrirTablero(forzar) {
  const pend = obsTodas().filter(esPendiente), altas = pend.filter(o => o.severidad === 'Alta');
  const porVisitar = LISTA.filter(x => !x.hecho), venc = Object.values(LOTES).filter(corteVencido);
  const w = SEMANAS_PROX[0], sem = w ? Object.values(LOTES).filter(l => claseCorte(l) === 1) : [];
  const hoyCorte = Object.values(LOTES).filter(l => l.fProg && !l.cosechado && diasPara(l.fProg) === 0);
  if (!forzar && (!pend.length && !porVisitar.length && !venc.length && !sem.length && !VISITA)) return;
  if (!forzar && $('hoja').classList.contains('abierta')) return;
  const tarj = (icono, n, rot, cls, accion) => `<button type="button" class="tb ${cls}" onclick="${accion}">${ico(icono)}<b>${n}</b><span>${rot}</span></button>`;
  abrirHoja(new Date().toLocaleDateString('es-NI', {weekday: 'long', day: 'numeric', month: 'long'}).replace(/^./, c => c.toUpperCase()), `
    <div class="tablero">
      ${tarj('alert', pend.length, pend.length === 1 ? 'hallazgo pendiente' : 'hallazgos pendientes', altas.length ? 'mal' : pend.length ? 'medio' : '', "cerrarHoja();bitFiltro='pendientes';mostrarTab('bitacora')")}
      ${tarj('listPlus', porVisitar.length, 'lotes por visitar', porVisitar.length ? 'info' : '', "cerrarHoja();mostrarTab('visita')")}
      ${tarj('calendar', sem.length, w ? `cortes sem. ${w.sem} (${rangoSemana(w)})` : 'cortes próximos', sem.length ? 'info' : '', "cerrarHoja();mostrarTab('mapa');setColorear('semana')")}
      ${tarj('clock', venc.length, 'fechas de corte vencidas', venc.length ? 'mal' : '', "cerrarHoja();mostrarTab('mapa');setColorear('semana')")}
    </div>
    ${altas.length ? `<h4>Severidad alta</h4>${altas.slice(0, 3).map(o => `<div class="hist-fila"><b>Lote ${esc(o.codlote)}</b><span>${esc(o.categoria)}${o.nota ? ' · ' + esc(o.nota.slice(0, 50)) : ''}</span></div>`).join('')}` : ''}
    ${hoyCorte.length ? `<div class="nota est-medio">${ico('calendar')} Hoy se cortan ${hoyCorte.length} lote(s): ${hoyCorte.slice(0, 8).map(l => esc(l.cod)).join(' · ')}</div>` : ''}
    ${venc.length ? `<div class="nota est-mal">${ico('alert')} ${venc.length} lote(s) con fecha de corte vencida. Actualice el programa o cargue los cortes.</div>` : ''}
    <div class="acciones">${VISITA ? `<button type="button" class="btn sec" onclick="cerrarHoja();mostrarTab('visita')">${ico('route')} Visita en curso</button>` : `<button type="button" class="btn pri" onclick="cerrarHoja();iniciarVisita()">${ico('play')} Iniciar visita</button>`}<button type="button" class="btn ter" onclick="cerrarHoja()">Ir al mapa</button></div>`);
}

/* ── Arranque ── */
async function iniciar() {
  aplicarTema(); document.body.dataset.tab = 'mapa';
  try {
    setLoader('Abriendo datos…');
    const d = await cargarDatos();
    DATA = d.geo; META = d.meta || {}; RESUMEN = d.resumen || {};
    construirLotes(d.geo, d.metricas, d.cortes); construirIndice();
    initMap(); bindBusqueda();
    $('btnGps').addEventListener('click', gpsBoton); $('btnBrujula').addEventListener('click', alternarOrientacion); pintarBrujula(); $('btnCapas').addEventListener('click', abrirCapas); $('chipGps').addEventListener('click', abrirGps);
    $('hojaX').addEventListener('click', cerrarHoja); $('hojaFondo').addEventListener('click', cerrarHoja);
    $('nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) mostrarTab(b.dataset.tab); });
    $('medirDeshacer').addEventListener('click', medirDeshacer); $('medirFin').addEventListener('click', medirCerrar);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { cerrarHoja(); cerrarSugerencias(); } });
    pintarGpsBtn(); pintarLista(); actualizarRed(); pintarInsignia(); pintarRegistros();
    $('btnPanorama').addEventListener('click', alternarPanorama);
    $('loader').hidden = true; map.invalidateSize();
    await cargarVisitas();
    const lote = new URLSearchParams(location.search).get('lote'), conEnlace = lote && LOTES[codKey(lote)];
    if (conEnlace) seleccionarLote(lote, {zoom: true});
    // GPS automático al abrir, con seguimiento. Si se abrió con un enlace a un lote, no se mueve el mapa de ese lote.
    if (S.gpsAuto) iniciarGps(!conEnlace, true);
    registrarSW();
    setTimeout(avisarInstalacion, 1500);
    if (S.tablero && !conEnlace) setTimeout(() => abrirTablero(false), 700);
    if (navigator.onLine) setTimeout(() => cargarHistorico().catch(() => {}), 6000); // deja el histórico listo para usarlo sin señal
  } catch (e) {
    console.error(e);
    setLoader('No se pudieron abrir los datos: ' + (e.message || e) + '. Conéctese una vez a internet y vuelva a abrir.');
  }
}
function registrarSW() {
  if (!('serviceWorker' in navigator) || !(location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) return;
  const habia = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./service-worker.js').catch(e => console.warn('SW', e));
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (habia) toast('Nueva versión de la app lista.', {accion: 'Recargar', fijo: true, alAccion: () => location.reload()}); });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar, {once: true}); else iniciar();
