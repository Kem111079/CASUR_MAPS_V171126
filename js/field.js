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
    <div class="obs-acc">${pend ? `<button type="button" class="ok" onclick="obsResolver('${esc(o.id)}',true)">${ico('check')} Resuelto</button>` : o.resuelto ? `<button type="button" onclick="obsReabrir('${esc(o.id)}')">${ico('rotate')} Reabrir</button>` : ''}<button type="button" onclick="abrirRegistro('${esc(o.codlote)}','${esc(o.id)}')">${ico('edit')} Editar</button>${conPosicion(o) ? `<button type="button" onclick="compartirRegistro('${esc(o.id)}')">${ico('share')} Compartir</button>` : ''}<button type="button" onclick="obsBorrar('${esc(o.id)}')">${ico('trash')}</button></div></div>`;
}
function obsResolver(id, resuelto) {
  const arr = obsTodas(), o = arr.find(x => x.id === id); if (!o) return;
  if (resuelto) o.resuelto = new Date().toISOString(); else delete o.resuelto;
  if (!obsGuardar(arr)) return; refrescarVistas();
  if (resuelto) toast('Marcado como resuelto.', {tipo: 'bien', accion: 'Deshacer', alAccion: () => obsResolver(id, false)});
}
/* Reabrir un resuelto: vuelve a pendientes; Deshacer le devuelve su fecha de resolución original. */
function obsReabrir(id) {
  const arr = obsTodas(), o = arr.find(x => x.id === id); if (!o || !o.resuelto) return;
  const antes = o.resuelto; delete o.resuelto; if (!obsGuardar(arr)) return; refrescarVistas();
  toast(esPendiente(o) ? 'Reabierto: vuelve a Pendientes.' : 'Registro reabierto.', {accion: 'Deshacer', alAccion: () => { const a = obsTodas(), x = a.find(y => y.id === id); if (x) { x.resuelto = antes; obsGuardar(a); refrescarVistas(); } }});
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
  abrirHoja(titulo, `<label class="campo">Buscar lote<input id="elegirQ" type="search" placeholder="Código del lote o nombre de la finca" autocomplete="off" autocapitalize="characters"></label>
    <div id="elegirRes" class="lista-lotes">${sug.map(fila).join('') || '<p class="vacio">Escriba el código del lote o el nombre de la finca.</p>'}</div>`, 'alta');
  $('elegirQ').addEventListener('input', e => {
    const t = sinTildes(e.target.value).trim();
    const r = t ? indice.filter(it => it.tipo === 'lote' && (it.cod.startsWith(t) || it.n.includes(t))).sort((a, b) => (b.cod.startsWith(t) - a.cod.startsWith(t)) || a.cod.length - b.cod.length || a.cod.localeCompare(b.cod, 'es', {numeric: true})).slice(0, 12).map(it => ({cod: it.cod})) : sug;
    $('elegirRes').innerHTML = r.map(fila).join('') || '<p class="vacio">Sin coincidencias.</p>';
  });
  $('elegirRes').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const f = _alElegir; _alElegir = null; cerrarHoja(); f && f(b.dataset.cod); });
}
/* Lote al que va un registro hecho desde la Bitácora: el elegido a mano, el lote donde está el GPS o el seleccionado.
   El elegido a mano caduca: a los 15 min sin usarlo o cuando el GPS confirma la entrada a otro lote. Así un lote
   elegido en el borde no se queda puesto y nadie guarda, sin verlo, en el lote vecino. */
const DESTINO_MAX_MS = 15 * 60000;
let destinoManual = null; // {cod, t: último uso, gps: lote del GPS al elegirlo, acepta: lote del GPS en el que el usuario confirmó guardar igual}
function elegirDestino(cod) { destinoManual = cod && LOTES[cod] ? {cod, t: Date.now(), gps: GPS.lote || '', acepta: ''} : null; }
function soltarDestino() { destinoManual = null; pintarDestino(); }
function revisarDestino() {
  const m = destinoManual; if (!m) return;
  const vencido = Date.now() - m.t > DESTINO_MAX_MS, otroLote = !!GPS.lote && GPS.lote !== m.gps;
  if (LOTES[m.cod] && !vencido && !otroLote) return;
  destinoManual = null;
  if (document.body.dataset.tab !== 'bitacora' || GPS.lote === m.cod) return; // si llegó al lote elegido, el destino no cambia
  toast(vencido ? `Pasaron 15 minutos: se liberó el lote ${m.cod} elegido a mano.` : `Entró al lote ${GPS.lote}: se dejó el lote ${m.cod} elegido a mano.`, {clave: 'destino', ms: 6000});
}
function loteDestino() {
  revisarDestino();
  if (destinoManual) return {cod: destinoManual.cod, por: 'elegido a mano'};
  // Primero el lote que contiene la lectura actual (la coordenada que se guardará); luego el confirmado por el GPS.
  const c = GPS.cands[0];
  if (c && c.inside) return {cod: c.cod, por: 'GPS'};
  if (GPS.lote) return {cod: GPS.lote, por: 'GPS'};
  if (selCod) return {cod: selCod, por: 'seleccionado en el mapa'};
  return null;
}
/* Lote en el que el GPS está DENTRO ahora (lectura reciente y precisa) cuando no es el lote de destino. */
function conflictoDestino(cod) {
  const f = GPS.fix; if (!f || GPS.watch === null || f.acc > REG_ACC_MAX || Date.now() - (f.reloj || 0) > 30000) return '';
  const dentro = GPS.cands.filter(c => c.inside).map(c => c.cod);
  return dentro.length && !dentro.includes(cod) ? dentro[0] : '';
}
function nuevoRegistro() { const d = loteDestino(); if (d) abrirRegistro(d.cod); else elegirLote('¿En qué lote?', cod => { elegirDestino(cod); pintarDestino(); abrirRegistro(cod); }); }

/* Severidad con la que nace un registro según su categoría: lo informativo (Baja) no suma pendientes. */
const SEV_CAT = {Maleza: 'Media', Plaga: 'Media', 'Sequía': 'Media', 'Despoblación': 'Media', Riego: 'Media', Otro: 'Media', Seguimiento: 'Baja', Acceso: 'Baja', Cosecha: 'Baja', Siembra: 'Baja', Madurante: 'Baja'};
const sevDe = cat => SEV_CAT[cat] || 'Media';
const RAPIDOS = ['Maleza', 'Plaga', 'Riego', 'Sequía', 'Despoblación', 'Acceso', 'Cosecha', 'Seguimiento'];
let rapSev = ''; // severidad elegida para el registro rápido ('' = la sugerida por la categoría); vuelve a la sugerida al salir de la Bitácora
/* Registro rápido: un toque guarda categoría, lote, hora y posición. Nota y foto quedan para después.
   Un segundo toque en el mismo botón en menos de 1.5 s, o la misma categoría en el mismo lote en menos de 10 s, no duplica.
   Un botón distinto sí se registra: son dos problemas distintos. */
const RAP_DOBLE_MS = 1500, RAP_IGUAL_MS = 10000;
let _rapUlt = null; // {t, cod, cat, id} del último registro rápido
function registroRapido(cat, opc = {}) {
  const ahoraMs = Date.now(), u = _rapUlt;
  if (!opc.forzar && u && u.cat === cat && ahoraMs - u.t < RAP_DOBLE_MS) return; // doble toque en el mismo botón
  const d = loteDestino();
  if (!d) { elegirLote('¿En qué lote? · ' + cat, cod => { elegirDestino(cod); pintarDestino(); registroRapido(cat, opc); }); return; }
  if (!opc.forzar && u && u.id && u.cod === d.cod && u.cat === cat && ahoraMs - u.t < RAP_IGUAL_MS) {
    toast(`${cat} ya se registró en el lote ${d.cod} hace ${Math.max(1, Math.round((ahoraMs - u.t) / 1000))} s: no se duplicó.`, {clave: 'rapido', accion: 'Registrar otro', ms: 6000, alAccion: () => registroRapido(cat, {...opc, forzar: true})});
    return;
  }
  const g = gpsParaRegistro(d.cod);
  if (!g.ok) {
    if (g.activar && GPS.bloqueado) { iniciarGps(false); pintarDestino(); return; } // se abre «Activar la ubicación», que lo explica
    if (g.activar) { iniciarGps(false); toast('Activando el GPS. Cuando el indicador se ponga verde, toque de nuevo.', {clave: 'rapido', ms: 6000}); }
    else toast(g.txt, {tipo: g.nivel === 'mal' ? 'mal' : '', clave: 'rapido', ms: 6000});
    pintarDestino(); return;
  }
  const otro = conflictoDestino(d.cod);
  // Antes de abrir una hoja se anota el toque: un segundo toque del mismo doble toque no repite nada.
  if (otro && !(destinoManual && destinoManual.acepta === otro)) { _rapUlt = {t: ahoraMs, cod: d.cod, cat, id: ''}; elegirEntreLotes(cat, otro, d.cod, g.d, () => registroRapido(cat, {...opc, forzar: true})); return; }
  const sev = opc.sev || rapSev || sevDe(cat);
  if (destinoManual) destinoManual.t = ahoraMs;
  if (sev === 'Alta') { _rapUlt = {t: ahoraMs, cod: d.cod, cat, id: ''}; abrirRegistro(d.cod, '', {cat, sev}); return; } // severidad alta exige foto: se completa en el formulario
  const l = LOTES[d.cod], pos = g.pos, arr = obsTodas(), ahora = new Date().toISOString();
  const o = {id: 'OBS-' + ahoraMs, fecha_hora: ahora, codlote: d.cod, hacienda_productor: l.hac, tablon: selFeat && selFeat._cod === d.cod ? selFeat.properties.Tablon || '' : '',
    categoria: cat, severidad: sev, nota: '', lat: pos.lat, lng: pos.lng, precision_m: pos.acc, pos_fuente: pos.fuente, usuario: S.tecnico || 'CASUR Maps', photo_id: '', photo_name: '', photo_id2: ''};
  arr.push(o); if (!obsGuardar(arr)) return;
  _rapUlt = {t: ahoraMs, cod: d.cod, cat, id: o.id};
  vibrar(40); refrescarVistas();
  confirmar(`${cat} · lote ${d.cod}`);
  toast(`${cat} · ${sev}${sev === 'Baja' ? ' (informativo)' : ''} en lote ${d.cod}.`, {tipo: 'bien', ms: 8000, accion: 'Deshacer', alAccion: () => deshacerRapido(o.id), accion2: 'Nota / foto', alAccion2: () => abrirRegistro(d.cod, o.id)});
}
function deshacerRapido(id) {
  const arr = obsTodas(), i = arr.findIndex(x => x.id === id); if (i < 0) return;
  const [o] = arr.splice(i, 1); if (!obsGuardar(arr)) return;
  if (_rapUlt && _rapUlt.id === id) _rapUlt = null;
  refrescarVistas(); toast(`Se deshizo: ${o.categoria} en lote ${o.codlote}.`);
}
/* El GPS está dentro de un lote distinto del elegido a mano: se pregunta, con el lote del GPS primero. Cerrar la hoja no guarda nada. */
/* Quita el aviso pasajero de un intento anterior (por ejemplo «está a 2.99 km») para que no se repita sobre la hoja nueva. */
function quitarAvisoRapido() { document.querySelectorAll('#toasts .toast:not(.fijo)').forEach(t => t.remove()); }
function elegirEntreLotes(cat, gpsCod, manCod, dist, seguir) {
  quitarAvisoRapido();
  const hac = c => esc((LOTES[c] || {}).hac || '');
  abrirHoja(`¿Dónde guardar ${cat}?`, `<div class="nota est-medio">${ico('alert')} El GPS lo ubica <b>dentro del lote ${esc(gpsCod)}</b>, pero el lote elegido a mano es el <b>${esc(manCod)}</b>.</div>
    <button type="button" class="btn pri ancho grande dos-lotes" data-cod="${esc(gpsCod)}">${ico('pin')} Lote ${esc(gpsCod)} · usted está aquí</button><p class="pie">${hac(gpsCod)}</p>
    <button type="button" class="btn sec ancho dos-lotes" data-cod="${esc(manCod)}">Lote ${esc(manCod)} · elegido a mano${Number.isFinite(dist) && dist > 0 ? ' (a ' + Math.round(dist) + ' m)' : ''}</button><p class="pie">${hac(manCod)}</p>`);
  $('hojaBody').querySelectorAll('.dos-lotes').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.cod === gpsCod) destinoManual = null; else if (destinoManual) destinoManual.acepta = gpsCod;
    cerrarHoja(); pintarDestino(); seguir();
  }));
}

/* ── Formulario único de registro (antes: "observación" y "hallazgo" por separado) ── */
let reg = null, _dictado = null;
/* pre: {cat, sev} para un registro nuevo que llega con categoría o severidad ya elegidas (registro rápido en Alta). */
const conPosicion = o => o && (o.pos_fuente === 'gps' || o.pos_fuente === 'vuelo');
async function abrirRegistro(cod, id = '', pre = null) {
  cod = codKey(cod); const l = LOTES[cod]; if (!l) { toast('Seleccione primero un lote.'); return; }
  const o = id ? obsTodas().find(x => x.id === id) : null;
  // Un hallazgo nuevo solo se guarda en sitio: si ya se sabe que no se podrá (lejos del lote, sin polígono o ubicación
  // bloqueada) se dice antes de dejar llenar el formulario. Si solo falta precisión o señal, se abre y se espera.
  if (!o) { const g = gpsParaRegistro(cod); if (!g.ok && g.nivel === 'mal') { if (g.activar) iniciarGps(false); toast(g.txt, {tipo: 'mal', clave: 'rapido', ms: 7000}); pintarDestino(); return; } }
  if (!o) { const t = document.querySelector('#toasts .toast[data-clave="rapido"]'); if (t) t.remove(); }
  reg = {cod, id, fotos: [null, null], ids: o ? [o.photo_id || '', o.photo_id2 || ''] : ['', ''], sev: o ? o.severidad : (pre && pre.sev) || 'Media', cat: o ? o.categoria || '' : (pre && pre.cat) || '', sevTocada: !!(o || (pre && pre.sev)), acepta: ''};
  const bor = _borrador && _borrador.cod === cod && _borrador.id === id ? _borrador : null;
  if (_borradorAviso) { _borradorAviso.remove(); _borradorAviso = null; }
  const cats = reg.cat && !CATEGORIAS.includes(reg.cat) ? [...CATEGORIAS, reg.cat] : CATEGORIAS;
  abrirHoja((o ? 'Editar registro · ' : 'Registrar en ') + 'lote ' + cod, `
    <p class="pie" id="regHac">${esc(l.hac)}${selFeat && selFeat._cod === cod && selFeat.properties.Tablon ? ' · tablón ' + esc(selFeat.properties.Tablon) : ''}</p>
    ${bor ? `<div id="regBorrador" class="nota est-neutro">${ico('rotate')} Se recuperó lo que había escrito sin guardar. <button type="button" class="enlace" onclick="descartarBorrador()">Empezar de nuevo</button></div>` : ''}
    ${o ? `<div class="nota est-neutro">${o.pos_fuente === 'vuelo' ? ico('heli') + ' Marca desde el aire: se conserva la posición del helicóptero.' : o.pos_fuente === 'gps' ? ico('pin') + ' Se conserva la posición GPS original del registro.' : 'Registro anterior sin posición GPS: se puede editar, pero no compartir como hallazgo.'}</div>` : '<div id="regGps" class="nota est-neutro">Comprobando GPS…</div>'}
    <div class="campo">Categoría${o ? '' : ' <small class="req">(elija una)</small>'}<div class="rapidos cats" id="regCat" role="radiogroup" aria-label="Categoría">${cats.map(c => `<button type="button" role="radio" data-v="${esc(c)}">${ico(ICONO_CAT[c] || 'dots')}${esc(c)}</button>`).join('')}</div><p id="regCatErr" class="campo-error" role="alert" hidden></p></div>
    <div class="campo">Severidad<div class="segmento" id="regSev">${['Baja', 'Media', 'Alta'].map(s => `<button type="button" data-v="${s}">${s}</button>`).join('')}</div><span id="regSevBaja" class="ayuda" hidden>Baja = informativo: no queda como pendiente.</span><span id="regSevNota" class="ayuda" hidden>${ico('camera')} Severidad alta: agregue al menos una foto.</span></div>
    <label class="campo">Nota<textarea id="regNota" rows="3" placeholder="Qué se observó…">${esc(o ? o.nota : '')}</textarea></label>
    <button type="button" class="btn ter ancho" id="regVoz">${ico('mic')} Dictar nota</button>
    <div class="fotos">${[0, 1].map(i => `<label class="foto" id="regFotoL${i}"><input type="file" accept="image/*" capture="environment" data-i="${i}"><span>${ico('camera')} Foto ${i + 1}</span></label>`).join('')}</div>
    <p id="regFotoErr" class="campo-error" role="alert" hidden></p>
    <label class="campo">Técnico<input id="regTec" type="text" value="${esc((o && o.usuario && o.usuario !== 'CASUR Maps' ? o.usuario : '') || S.tecnico)}" placeholder="Su nombre (se guarda para la próxima vez)"></label>
    <div class="acciones"><button type="button" class="btn pri reg-guardar" onclick="guardarRegistro(false)">Guardar</button>${!o || conPosicion(o) ? '<button type="button" class="btn sec reg-guardar" onclick="guardarRegistro(true)">Guardar y compartir</button>' : ''}</div>`, 'alta');
  reg.ini = {cat: reg.cat, sev: reg.sev, nota: $('regNota').value.trim()}; // para saber si hay cambios sin guardar
  if (bor) {
    $('regNota').value = bor.nota; if (bor.tec) $('regTec').value = bor.tec;
    reg.cat = bor.cat; reg.sev = bor.sev; reg.sevTocada = bor.sevTocada;
    reg.fotos = bor.fotos.slice(); reg.fotos.forEach((f, i) => { if (f) pintarFotoReg(i, f); });
  }
  pintarCatReg(); pintarSevReg();
  if (!o) { if (GPS.watch === null) iniciarGps(false); vigilarGpsRegistro(); }
  $('regCat').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !reg) return;
    reg.cat = b.dataset.v;
    if (!reg.sevTocada && !reg.id) reg.sev = sevDe(reg.cat); // mientras no se toque la severidad, sigue la sugerida para la categoría
    $('regCat').classList.remove('falta'); $('regCatErr').hidden = true; pintarCatReg(); pintarSevReg();
  });
  $('regSev').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; reg.sev = b.dataset.v; reg.sevTocada = true; pintarSevReg(); });
  $('hojaBody').querySelectorAll('.foto input').forEach(inp => inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0], i = Number(inp.dataset.i); if (!f) return;
    try { reg.fotos[i] = await comprimirFoto(f); pintarFotoReg(i, reg.fotos[i]); pintarRequisitoFoto(); } catch (e) { errorCampo('regFotoErr', e.message); }
  }));
  $('regVoz').addEventListener('click', alternarDictado);
  if (!(window.SpeechRecognition || window.webkitSpeechRecognition)) $('regVoz').innerHTML = ico('mic') + ' Use el micrófono del teclado para dictar';
  for (let i = 0; i < 2; i++) if (reg.ids[i] && !reg.fotos[i]) { const r = await fotoGet(reg.ids[i]).catch(() => null); if (r && reg && reg.id === id && !reg.fotos[i]) pintarFotoReg(i, r.data_url); }
}
function pintarCatReg() { const c = $('regCat'); if (!c || !reg) return; c.querySelectorAll('button').forEach(b => { const si = b.dataset.v === reg.cat; b.classList.toggle('activo', si); b.setAttribute('aria-checked', si); }); }
function pintarSevReg() {
  const s = $('regSev'); if (!s || !reg) return;
  s.querySelectorAll('button').forEach(b => b.classList.toggle('activo', b.dataset.v === reg.sev));
  $('regSevBaja').hidden = reg.sev !== 'Baja'; pintarRequisitoFoto();
}
/* El GPS está dentro de otro lote: el formulario pasa a ese lote sin perder lo escrito. */
function cambiarLoteReg(cod) {
  if (!reg || reg.id || !LOTES[cod]) return;
  reg.cod = cod; reg.acepta = ''; destinoManual = null;
  $('hojaTitulo').textContent = 'Registrar en lote ' + cod; const h = $('regHac'); if (h) h.textContent = LOTES[cod].hac;
  vigilarGpsRegistro(); pintarDestino();
}
/* Cambios sin guardar en el formulario abierto: nota, categoría, severidad o fotos nuevas. */
function registroSucio() {
  if (!reg || !reg.ini || !$('regNota')) return false;
  return reg.fotos.some(Boolean) || $('regNota').value.trim() !== reg.ini.nota || reg.cat !== reg.ini.cat || reg.sev !== reg.ini.sev;
}
/* Borrador en memoria (las fotos son pesadas para localStorage): se recupera al volver a abrir el registro de ese lote. */
let _borrador = null, _borradorAviso = null;
function guardarBorrador() {
  _borrador = {cod: reg.cod, id: reg.id, cat: reg.cat, sev: reg.sev, sevTocada: reg.sevTocada, nota: $('regNota').value, tec: $('regTec').value, fotos: reg.fotos.slice()};
  return _borrador;
}
function olvidarBorrador(r = reg) { if (_borrador && r && _borrador.cod === r.cod && _borrador.id === r.id) _borrador = null; }
function descartarBorrador() { const r = reg; olvidarBorrador(); if (r) abrirRegistro(r.cod, r.id); }
function soltarRegistro() { detenerDictado(); clearInterval(_regGpsT); reg = null; } // al cerrar la hoja, el formulario deja de estar en curso
function pintarFotoReg(i, url) { const l = $('regFotoL' + i); if (l) { l.style.backgroundImage = `url(${url})`; l.classList.add('con-foto'); l.querySelector('span').innerHTML = ico('rotate') + ' Cambiar'; } }
/* Errores del formulario en línea, junto al campo que hay que corregir (no en un aviso flotante que tape la cabecera). */
const regTieneFoto = () => !!reg && (reg.fotos.some(Boolean) || reg.ids.some(Boolean));
function pintarRequisitoFoto() {
  if (!reg || !$('regSevNota')) return;
  const falta = reg.sev === 'Alta' && !regTieneFoto();
  $('regSevNota').hidden = !falta;
  [0, 1].forEach(i => { const l = $('regFotoL' + i); if (l) { l.classList.toggle('requerida', falta); if (!falta) l.classList.remove('falta'); } });
  if (!falta && $('regFotoErr')) $('regFotoErr').hidden = true;
}
function errorCampo(id, txt, marcar) {
  const el = $(id); if (!el) { toast(txt, {tipo: 'mal', ms: 6000}); return; }
  el.innerHTML = ico('alert') + ' ' + esc(txt); el.hidden = false;
  (marcar || []).forEach(x => x && x.classList.add('falta'));
  vibrar(80); (marcar && marcar[0] || el).scrollIntoView({block: 'center', behavior: 'smooth'});
}
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
   o a menos de 50 m. Así la coordenada guardada es donde realmente se hizo el registro.
   nivel: 'bien' (se puede), 'espera' (falta señal o precisión: puede resolverse solo) o 'mal' (no se podrá aquí). */
const REG_ACC_MAX = 30, REG_DIST_MAX = 50;
function gpsParaRegistro(cod) {
  const l = LOTES[cod], f = GPS.fix;
  if (!l || !l.feats.length) return {ok: false, nivel: 'mal', txt: 'Este lote no tiene polígono en el mapa; no se puede georreferenciar.'};
  if (GPS.watch === null) return GPS.bloqueado ? {ok: false, nivel: 'mal', activar: true, txt: 'La ubicación está bloqueada en el teléfono: permítala para registrar.'}
    : {ok: false, nivel: 'espera', activar: true, txt: 'GPS apagado: actívelo, el hallazgo debe quedar georreferenciado.'};
  if (!f) return {ok: false, nivel: 'espera', txt: 'Buscando señal GPS…'};
  if (Date.now() - (f.reloj || 0) > 30000) return {ok: false, nivel: 'espera', txt: 'Esperando una lectura reciente del GPS…'};
  let d = Infinity;
  for (const ft of l.feats) { if (contiene(ft, f.lng, f.lat)) { d = 0; break; } d = Math.min(d, distFeatM(ft, f.lng, f.lat)); }
  const lejos = `Usted está a ${fmtDist(d)} del lote ${cod}. Acérquese: debe estar dentro o a menos de ${REG_DIST_MAX} m.`;
  if (d - f.acc > REG_DIST_MAX) return {ok: false, nivel: 'mal', d, txt: lejos}; // lejos aunque la lectura sea imprecisa
  if (f.acc > REG_ACC_MAX) return {ok: false, nivel: 'espera', d, txt: `Precisión ±${f.acc} m. Espere a tener ±${REG_ACC_MAX} m o mejor (cielo despejado, sin moverse).`};
  if (d > REG_DIST_MAX) return {ok: false, nivel: 'mal', d, txt: lejos};
  return {ok: true, nivel: 'bien', d, txt: `GPS ±${f.acc} m · ${d === 0 ? 'dentro del lote' : 'a ' + Math.round(d) + ' m del lote'}`, pos: {lat: +f.lat.toFixed(6), lng: +f.lng.toFixed(6), acc: f.acc, fuente: 'gps'}};
}
let _regGpsT = null;
function vigilarGpsRegistro() {
  clearInterval(_regGpsT);
  const tic = () => {
    const el = $('regGps'); if (!el || !reg || reg.id) { clearInterval(_regGpsT); return; }
    const g = gpsParaRegistro(reg.cod), otro = g.ok ? conflictoDestino(reg.cod) : '';
    const cls = 'nota ' + (otro ? 'est-medio' : g.ok ? 'est-bien' : g.nivel === 'mal' ? 'est-mal' : 'est-medio');
    const html = otro ? `${ico('alert')} ${esc(g.txt)}, pero el GPS lo ubica <b>dentro del lote ${esc(otro)}</b>. <button type="button" class="enlace" onclick="cambiarLoteReg('${esc(otro)}')">Registrar en ${esc(otro)}</button>`
      : ico(g.ok ? 'pin' : 'alert') + ' ' + esc(g.txt);
    if (el.className !== cls) el.className = cls;
    if (el.dataset.html !== html) { el.dataset.html = html; el.innerHTML = html; }
    if (!reg.guardando) document.querySelectorAll('.reg-guardar').forEach(b => { b.disabled = !g.ok; });
  };
  tic(); _regGpsT = setInterval(tic, 1000);
}
/* Mientras se guarda (fotos en IndexedDB), los botones quedan desactivados: un doble toque no guarda dos veces. */
function marcarGuardando(on) {
  document.querySelectorAll('.reg-guardar').forEach(b => {
    if (on) { b.dataset.txt = b.textContent; b.textContent = 'Guardando…'; b.disabled = true; }
    else { if (b.dataset.txt) b.textContent = b.dataset.txt; b.disabled = false; }
  });
}
async function guardarRegistro(compartir) {
  const r = reg; if (!r || r.guardando) return;
  detenerDictado();
  const arr0 = obsTodas(), prev = r.id ? arr0.find(x => x.id === r.id) : null, l = LOTES[r.cod];
  S.tecnico = $('regTec').value.trim(); guardarAjustes();
  const nota = $('regNota').value.trim();
  if (!r.cat) { errorCampo('regCatErr', 'Elija una categoría.', [$('regCat')]); return; }
  const ids = r.ids.slice();
  if (r.sev === 'Alta' && !r.fotos[0] && !r.fotos[1] && !ids[0] && !ids[1]) { errorCampo('regFotoErr', 'Falta la foto: en severidad alta tome al menos una para guardar.', [$('regFotoL0'), $('regFotoL1')]); return; }
  let pos;
  if (prev) pos = {lat: prev.lat, lng: prev.lng, acc: prev.precision_m, fuente: prev.pos_fuente || ''};
  else {
    const g = gpsParaRegistro(r.cod);
    if (!g.ok) { const el = $('regGps'); if (el) { el.className = 'nota ' + (g.nivel === 'mal' ? 'est-mal' : 'est-medio'); el.innerHTML = ico('alert') + ' ' + esc(g.txt); el.dataset.html = ''; vibrar(80); el.scrollIntoView({block: 'center', behavior: 'smooth'}); } else toast(g.txt, {tipo: 'mal', ms: 6000}); return; }
    const otro = conflictoDestino(r.cod);
    if (otro && r.acepta !== otro && !(destinoManual && destinoManual.cod === r.cod && destinoManual.acepta === otro)) {
      r.guardando = true; // mientras se pregunta, un segundo toque en Guardar no abre otra pregunta
      const si = await preguntar(`¿Guardar en el lote ${r.cod}?`, `El GPS lo ubica dentro del lote ${otro}, no en el ${r.cod}.`, `Guardar en ${r.cod}`, 'Revisar');
      r.guardando = false;
      if (!si || reg !== r) return;
      r.acepta = otro;
    }
    pos = g.pos;
  }
  r.guardando = true; marcarGuardando(true);
  const ahora = new Date().toISOString(), nuevas = [];
  for (let i = 0; i < 2; i++) if (r.fotos[i]) {
    if (!ids[i]) { ids[i] = `FOTO-${Date.now()}-${i}`; nuevas.push(ids[i]); }
    try { await fotoPut({id: ids[i], codlote: r.cod, created_at: ahora, lat: pos.lat, lng: pos.lng, precision_m: pos.acc, mime: 'image/jpeg', file_name: `${r.cod}_${ids[i]}.jpg`, data_url: r.fotos[i]}); }
    catch (e) { ids[i] = ''; toast('No se pudo guardar la foto.', {tipo: 'mal'}); }
  }
  const arr = obsTodas(), p2 = r.id ? arr.find(x => x.id === r.id) : null; // se relee: pudo cambiar mientras se guardaban las fotos
  const o = Object.assign(p2 || {id: 'OBS-' + Date.now(), fecha_hora: ahora, codlote: r.cod}, {
    hacienda_productor: l.hac, tablon: p2 ? p2.tablon : (selFeat && selFeat._cod === r.cod ? selFeat.properties.Tablon || '' : ''),
    categoria: r.cat, severidad: r.sev, nota,
    lat: pos.lat, lng: pos.lng, precision_m: pos.acc, pos_fuente: pos.fuente, usuario: S.tecnico || 'CASUR Maps',
    photo_id: ids[0], photo_name: ids[0] ? `${r.cod}_${ids[0]}.jpg` : '', photo_id2: ids[1]
  });
  if (!p2) arr.push(o);
  if (!obsGuardar(arr)) { nuevas.forEach(id => fotoDel(id).catch(() => {})); r.guardando = false; if (reg === r) marcarGuardando(false); return; }
  if (destinoManual && destinoManual.cod === r.cod) destinoManual.t = Date.now();
  const id = o.id; olvidarBorrador(r);
  if (reg === r) { reg = null; clearInterval(_regGpsT); cerrarHoja(); }
  refrescarVistas(); confirmar('Hallazgo guardado');
  if (compartir) compartirRegistro(id);
}
/* Borrar un registro borra también sus fotos, pero solo cuando vence el Deshacer (o al cerrar la app):
   mientras tanto Deshacer lo devuelve completo, con sus fotos.
   Las fotos por borrar también se anotan en el teléfono: si la app se cierra o se recarga durante el Deshacer
   (el borrado en IndexedDB no alcanza a terminar), se borran la próxima vez que abra. */
const BORRAR_MS = 10000, _fotosPorBorrar = new Map(); // id del registro → ids de sus fotos
const FOTOS_BORRAR_KEY = 'casur_maps_fotos_por_borrar_v1';
const fotosDeObs = o => [o.photo_id, o.photo_id2].filter(Boolean);
function anotarPorBorrar(id, fotos) { const m = leerLS(FOTOS_BORRAR_KEY, {}); if (fotos) m[id] = fotos; else delete m[id]; escribirLS(FOTOS_BORRAR_KEY, m); }
async function borrarFotosSueltas(ids) {
  const usadas = new Set(obsTodas().flatMap(fotosDeObs)); // nunca se borra una foto que otro registro use
  for (const id of ids) if (!usadas.has(id)) await fotoDel(id).catch(() => {});
  if (selCod) pintarFotosLote(selCod);
}
async function borrarFotosDe(id, fotos) { _fotosPorBorrar.delete(id); await borrarFotosSueltas(fotos); anotarPorBorrar(id, null); }
/* Al abrir: termina los borrados que quedaron pendientes (salvo que el registro haya vuelto). */
function borrarFotosPendientes() {
  const m = leerLS(FOTOS_BORRAR_KEY, {}), vivos = new Set(obsTodas().map(o => o.id));
  Object.entries(m).forEach(([id, fotos]) => { if (vivos.has(id) || !Array.isArray(fotos)) anotarPorBorrar(id, null); else borrarFotosDe(id, fotos); });
}
window.addEventListener('pagehide', () => { [..._fotosPorBorrar].forEach(([id, ids]) => borrarFotosDe(id, ids)); });
function obsBorrar(id) {
  const arr = obsTodas(), i = arr.findIndex(x => x.id === id); if (i < 0) return;
  const [o] = arr.splice(i, 1); if (!obsGuardar(arr)) return;
  if (_rapUlt && _rapUlt.id === id) _rapUlt = null;
  refrescarVistas();
  const fotos = fotosDeObs(o);
  if (fotos.length) {
    _fotosPorBorrar.set(o.id, fotos); anotarPorBorrar(o.id, fotos);
    setTimeout(() => { if (_fotosPorBorrar.has(o.id)) borrarFotosDe(o.id, fotos); }, BORRAR_MS + 500);
  }
  toast(fotos.length ? `Registro y ${fotos.length === 1 ? 'su foto borrados' : 'sus 2 fotos borrados'}.` : 'Registro borrado.', {accion: 'Deshacer', ms: BORRAR_MS, alAccion: () => {
    _fotosPorBorrar.delete(o.id); anotarPorBorrar(o.id, null);
    const a = obsTodas(); if (!a.some(x => x.id === o.id)) { a.splice(Math.min(i, a.length), 0, o); if (!obsGuardar(a)) return; }
    refrescarVistas(); toast(fotos.length ? 'Registro restaurado con sus fotos.' : 'Registro restaurado.', {tipo: 'bien'});
  }});
}
/* Tras cargar el histórico solo se repinta lo que depende de él: en el Resumen, la renovación y los resultados de la
   búsqueda (sin tocar el campo, lo escrito ni el foco). */
function refrescarTrasHistorico() {
  if (selCod && !$('card').classList.contains('oculta')) renderCard();
  if (document.body.dataset.tab === 'mas') { const q = $('aforoQ'); pintarRenovBox(); if (q && q.value.trim()) buscarAforo(q.value); }
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
  ctx.font = '600 26px Arial'; ctx.fillStyle = '#64748b'; ctx.fillText([o.tablon ? 'Tablón ' + o.tablon : '', l.variedad, fmtHaLote(l.area), ncLargo(l)].filter(x => x && x !== '—').join(' · '), 80, 392);
  const sev = {Alta: '#b91c1c', Media: '#b45309', Baja: '#0b7f3a'}[o.severidad] || '#334155';
  [['CATEGORÍA', o.categoria, '#0f172a'], ['SEVERIDAD', o.severidad, sev], ['TÉCNICO', (o.usuario && o.usuario !== 'CASUR Maps' ? o.usuario : 'No indicado').slice(0, 20), '#0f172a']].forEach((b, i) => {
    const x = 80 + i * 352; rr(ctx, x, 420, 336, 92, 18, '#f8fafc', '#e2e8f0'); ctx.fillStyle = '#64748b'; ctx.font = '800 20px Arial'; ctx.fillText(b[0], x + 20, 452); ctx.fillStyle = b[2]; ctx.font = '900 30px Arial'; ctx.fillText(b[1], x + 20, 492);
  });
  [['TCH ZAFRA ANTERIOR', l.tchAnt > 0 ? nfTch.format(l.tchAnt) + ' t/ha' : 'Sin dato'], ['TCH ESTIMADO 26/27', l.tchEst > 0 ? nfTch.format(l.tchEst) + ' t/ha' : l.cod && LOTES[l.cod] ? (m => m.txt === 'No aplica' ? 'No aplica' : m.txt)(motivoSinEstimado(l)) : 'Sin dato'], ['EDAD', edad === null ? 'Sin fecha de corte' : nfTch.format(edad) + ' meses']].forEach((b, i) => {
    const x = 80 + i * 352; rr(ctx, x, 528, 336, 92, 18, ['#fff6d8', '#e8f6ee', '#e9f0fb'][i], '#e2e8f0'); ctx.fillStyle = '#64748b'; ctx.font = '800 20px Arial'; ctx.fillText(b[0], x + 20, 560); ctx.fillStyle = '#0f172a'; ctx.font = '900 30px Arial'; ctx.fillText(b[1], x + 20, 600);
    // TCH estimado posiblemente provisional: se dice en palabras junto a la cifra (la imagen se comparte sola, sin texto).
    if (i === 1 && l.tchEst > 0 && estValidar(l)) { const w = ctx.measureText(b[1]).width; ctx.fillStyle = '#b45309'; ctx.font = '800 22px Arial'; ctx.fillText('a validar', x + 32 + w, 600); }
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
  ctx.fillText(`${new Date(o.fecha_hora).toLocaleString('es-NI')}  ·  ${o.lat !== '' ? Number(o.lat).toFixed(6) + ', ' + Number(o.lng).toFixed(6) : 'sin coordenadas'}${o.pos_fuente === 'gps' ? ' · registrado en sitio, GPS ±' + o.precision_m + ' m' : o.pos_fuente === 'vuelo' ? ' · desde el aire, GPS ±' + o.precision_m + ' m' : ''}`, 80, y + 44);
  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.9));
}
/* Se comparte solo la imagen del hallazgo, sin texto ni enlaces. */
async function compartirRegistro(id) {
  const o = obsTodas().find(x => x.id === id); if (!o) return;
  if (!conPosicion(o)) { toast('Este registro no tiene posición GPS: no se puede compartir como hallazgo.', {tipo: 'mal'}); return; }
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
/* Solo fotos de registros que existen (igual que el ZIP): una foto suelta de un registro borrado no aparece. */
async function fotosDeLote(cod) {
  const usadas = new Set(obsTodas().flatMap(fotosDeObs));
  return (await fotoAll().catch(() => [])).filter(r => usadas.has(r.id) && codKey(r.codlote) === cod && r.data_url).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}
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
    ${(() => { const pl = v.plan || [], t = pl.length; if (!t) return ''; const h = pl.filter(x => x.hecho).length, pc = Math.round(h / t * 100), falt = pl.filter(x => !x.hecho).map(x => x.cod);
      return `<div class="cumple ${pc >= 100 ? 'est-bien' : pc >= 60 ? 'est-medio' : 'est-mal'}"><div><b>${pc} %</b><span>Cumplimiento de la lista del día: ${h} de ${t} lotes</span></div><i><u style="width:${pc}%"></u></i>${falt.length ? `<small>Faltaron: ${falt.slice(0, 12).map(esc).join(' · ')}${falt.length > 12 ? ' …' : ''}</small>` : ''}</div>`; })()}
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
    if (pts.length > 1) { ctx.beginPath(); segmentosRuta(pts).forEach(s => s.forEach((q, i) => i ? ctx.lineTo(X(q[1]), Y(q[0])) : ctx.moveTo(X(q[1]), Y(q[0])))); ctx.strokeStyle = '#0a66ff'; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.stroke(); }
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
  if (t !== 'bitacora') rapSev = ''; // la severidad elegida para el registro rápido no se queda puesta al salir
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('activo', b.dataset.tab === t));
  if (t === 'visita') renderVisita(); else if (t === 'bitacora') renderBitacora(); else if (t === 'mas') renderMas(); else if (t === 'ajustes') renderAjustes(); else setTimeout(() => map && map.invalidateSize(), 50);
  ubicarAvisos(); histPedir();
}

/* ── Botón Atrás (Android y navegador) ──
   Cada cosa abierta que Atrás puede cerrar ocupa una entrada del historial, sobre una «guardia» que evita salir de golpe:
   hoja → pestaña distinta de Mapa → medición → tarjeta completa → tarjeta compacta → aviso «Toque Atrás otra vez para salir».
   En vez de apilar una entrada por cada apertura, se compara cuántas capas hay abiertas con cuántas entradas hay (history.state.casur)
   y se ajusta al final de la tarea: así las hojas encadenadas (cerrarHoja → abrirHoja) y las hojas sobre hojas no dejan entradas de más.
   Solo se agregan entradas tras un toque del usuario: Chrome salta en el botón Atrás las que una página agrega sola.
   Sin un toque reciente (por ejemplo, Atrás cerró un diálogo que no ocupaba entrada) se vuelve hacia adelante a las
   entradas propias que siguen en el historial (_histTope): Atrás no las borra mientras no se agregue otra. */
let _histTope = 0, _histListo = false, _histN = 0, _histMeta = null, _histT = 0, _histSeguro = 0, _guardia = true, _salirT = 0;
const histEstado = () => { const e = history.state; return e && Number.isInteger(e.casur) ? e.casur : 0; };
function capasAbiertas() {
  let n = 0;
  if ($('hoja').classList.contains('abierta')) n++;
  if (document.body.dataset.tab !== 'mapa') n++;
  if (typeof medir !== 'undefined' && medir.modo) n++;
  if (selCod && !$('card').classList.contains('oculta')) n += cardFull ? 2 : 1;
  return n;
}
function histPedir() { if (!_histT) _histT = setTimeout(() => { _histT = 0; histAjustar(); }, 0); }
function histAjustar() {
  if (!_histListo || _histMeta !== null) return;
  const capas = capasAbiertas(); if (capas) _guardia = true;
  const quiere = capas ? capas + 1 : (_guardia ? 1 : 0);
  if (quiere < _histN) { // sobran entradas (se cerró algo con la X, el fondo o un toque): se retroceden sin cerrar nada más
    _histMeta = quiere; history.go(quiere - _histN);
    clearTimeout(_histSeguro); _histSeguro = setTimeout(() => { if (_histMeta !== null) { _histMeta = null; _histN = histEstado(); histPedir(); } }, 1500);
    return;
  }
  if (quiere > _histN) {
    const ua = navigator.userActivation;
    if (ua && !ua.isActive) {
      const a = Math.min(quiere, _histTope); if (a > _histN) { _histMeta = a; history.go(a - _histN); clearTimeout(_histSeguro); _histSeguro = setTimeout(() => { if (_histMeta !== null) { _histMeta = null; _histN = histEstado(); } }, 1500); }
      return; // lo que falte se completa en el próximo toque
    }
    while (_histN < quiere) { _histN++; history.pushState({casur: _histN}, ''); }
    _histTope = _histN;
  }
}
function alPopstate() {
  const n = histEstado(); let antes = _histN; _histN = n;
  if (_histMeta !== null) { const meta = _histMeta; _histMeta = null; clearTimeout(_histSeguro); if (n >= meta) { histPedir(); return; } antes = meta; }
  if (n >= antes) { histPedir(); return; } // adelante (navegador de escritorio): se reajusta
  for (let k = antes - n; k > 0; k--) atrasUnaCapa();
  histPedir();
}
function atrasUnaCapa() {
  if ($('hoja').classList.contains('abierta')) { pedirCerrarHoja(true); return; }
  if (cerrarPregunta(false)) return;
  if (document.body.dataset.tab !== 'mapa') { mostrarTab('mapa'); return; }
  if (medir.modo) { medirCerrar(); return; }
  if (selCod && !$('card').classList.contains('oculta')) { if (cardFull) { cardFull = false; renderCard(); } else cerrarCard(true); return; }
  // Mapa limpio: se avisa; si vuelve a tocar Atrás en 2 s, el navegador sale (ya no queda guardia).
  _guardia = false; toast('Toque Atrás otra vez para salir.', {ms: 2000});
  clearTimeout(_salirT); _salirT = setTimeout(() => { _guardia = true; histPedir(); }, 2000); // vuelve la guardia (hacia adelante, sin necesitar un toque)
}
function iniciarHistorial() {
  _histListo = true; _histN = histEstado(); _histTope = _histN; // tras recargar, el historial puede conservar entradas de la sesión anterior: se retroceden
  window.addEventListener('popstate', alPopstate);
  const toque = () => { if (!_guardia) { _guardia = true; clearTimeout(_salirT); } histPedir(); };
  document.addEventListener('pointerup', toque, true); document.addEventListener('keydown', toque, true);
  histPedir();
}
/* Cerrar la hoja a pedido del usuario (X, fondo, Escape o Atrás). Si es un registro con cambios sin guardar:
   con la X, el fondo o Escape se pregunta; con Atrás se cierra sin preguntar y lo escrito queda como borrador. */
function pedirCerrarHoja(porAtras = false) {
  if (!$('hoja').classList.contains('abierta')) return;
  if (registroSucio()) {
    if (porAtras || _pregunta) {
      cerrarPregunta(false); const b = guardarBorrador(); cerrarHoja();
      _borradorAviso = toast('Lo escrito quedó como borrador.', {accion: 'Retomar', ms: 8000, alAccion: () => abrirRegistro(b.cod, b.id)});
      return;
    }
    preguntar('¿Descartar lo escrito?', 'La nota, las fotos y los cambios de este registro no se guardarán.', 'Descartar', 'Seguir editando')
      .then(si => { if (si && registroSucio()) { olvidarBorrador(); cerrarHoja(); } });
    return;
  }
  cerrarHoja();
}
/* Gesto sobre un registro: a la izquierda lo borra; a la derecha lo resuelve si está pendiente o lo reabre si está
   resuelto (todo con Deshacer). Detrás de la fila aparece lo que va a pasar y, al pasar el umbral, vibra. */
const DESLIZA_UMBRAL = 96;
function accionDerecha(o) { return !o ? '' : o.resuelto ? 'reabrir' : esPendiente(o) ? 'resolver' : ''; }
function activarDeslizar(cont) {
  cont.querySelectorAll('.desliza').forEach(el => {
    const caja = el.parentElement;
    let x0 = 0, y0 = 0, dx = 0, activo = false, id = null, listo = false;
    el.addEventListener('pointerdown', e => { if (e.target.closest('button,a')) return; x0 = e.clientX; y0 = e.clientY; dx = 0; activo = false; listo = false; id = e.pointerId; });
    el.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return; dx = e.clientX - x0;
      if (!activo && Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(e.clientY - y0) * 1.4) { activo = true; try { el.setPointerCapture(id); } catch (_) {} }
      if (!activo) return;
      const der = caja.dataset.der;
      if (dx > 0 && !der) dx = Math.min(dx, 40) * .5; // sin acción a la derecha (informativo): la fila apenas cede
      el.style.transition = 'none'; el.style.transform = `translateX(${dx}px)`;
      caja.dataset.gesto = dx > 0 ? der || 'nada' : 'borrar';
      const pasa = Math.abs(dx) > DESLIZA_UMBRAL && (dx < 0 || !!der);
      if (pasa !== listo) { listo = pasa; caja.classList.toggle('listo', pasa); if (pasa) vibrar(20); }
    });
    const fin = () => {
      if (id === null) return; id = null; el.style.transition = '';
      const o = obsTodas().find(x => x.id === el.dataset.id), der = accionDerecha(o);
      if (activo && listo && o && (dx < 0 || der)) {
        el.style.transform = `translateX(${dx > 0 ? 110 : -110}%)`; el.style.opacity = '0';
        setTimeout(() => { if (dx < 0) obsBorrar(o.id); else if (der === 'resolver') obsResolver(o.id, true); else obsReabrir(o.id); }, 160);
      } else { el.style.transform = ''; delete caja.dataset.gesto; caja.classList.remove('listo'); }
      activo = false; listo = false;
    };
    el.addEventListener('pointerup', fin); el.addEventListener('pointercancel', fin);
  });
}
const AYUDA_DESLIZA = {
  pendientes: 'Deslice un registro a la derecha para resolverlo o a la izquierda para borrarlo.',
  resueltos: 'Deslice un registro a la derecha para reabrirlo o a la izquierda para borrarlo.',
  todos: 'Deslice a la derecha para resolver un pendiente (o reabrir uno resuelto) y a la izquierda para borrar.'
};
function filaDeslizaHtml(o) {
  const der = accionDerecha(o);
  return `<div class="desliza-caja" data-der="${der}"><div class="desliza-fondo" aria-hidden="true"><span class="f-der">${der === 'reabrir' ? ico('rotate') + ' Reabrir' : der ? ico('check') + ' Resolver' : ''}</span><span class="f-izq">Borrar ${ico('trash')}</span></div>
    <div class="bloque desliza" data-id="${esc(o.id)}"><div class="fila-ir plana"><button type="button" class="obs-lote-btn" onclick="seleccionarLote('${esc(o.codlote)}',{zoom:true})">Lote ${esc(o.codlote)} · ${esc(o.hacienda_productor || '')} ›</button>${llegarHtml(o.codlote, o.lat, o.lng)}</div>${obsFilaHtml(o)}</div></div>`;
}
/* ── Destino del registro con semáforo: se ve ANTES de tocar si se puede registrar aquí y en qué lote ── */
function estadoDestino() {
  const d = loteDestino();
  if (!d) {
    if (GPS.watch === null) return {d, nivel: GPS.bloqueado ? 'mal' : 'espera', activar: true, txt: GPS.bloqueado ? 'La ubicación está bloqueada en el teléfono.' : 'GPS apagado: actívelo para registrar.'};
    if (!GPS.fix) return {d, nivel: 'espera', txt: 'Buscando señal GPS…'};
    if (GPS.fix.acc > REG_ACC_MAX) return {d, nivel: 'espera', txt: `Precisión ±${GPS.fix.acc} m. Espere a tener ±${REG_ACC_MAX} m o mejor.`};
    const c = GPS.cands[0];
    return {d, nivel: 'mal', txt: c ? `A ${fmtDist(c.d)} del lote ${c.cod}. Acérquese a un lote o elíjalo.` : 'Fuera de los lotes. Acérquese a un lote para registrar.'};
  }
  const g = gpsParaRegistro(d.cod), otro = g.ok ? conflictoDestino(d.cod) : '';
  if (otro) return {d, g, nivel: 'medio', txt: `GPS ±${GPS.fix.acc} m · usted está dentro del lote ${otro}, a ${Math.round(g.d)} m del ${d.cod}.`, otro};
  return {d, g, nivel: g.ok ? (d.por === 'elegido a mano' ? 'medio' : 'bien') : g.nivel, txt: g.txt, activar: g.activar};
}
const NIVEL_CLS = {bien: 'est-bien', medio: 'est-medio', espera: 'est-medio', mal: 'est-mal'};
let _destT = null, _destHtml = '';
function destinoHtml() {
  const e = estadoDestino(), d = e.d, man = !!destinoManual, ok = !!(e.g && e.g.ok);
  const resta = man ? Math.max(1, Math.ceil((DESTINO_MAX_MS - (Date.now() - destinoManual.t)) / 60000)) : 0;
  const titulo = d ? `${ok && !e.otro ? 'Se guardará en' : 'Destino:'} <b>lote ${esc(d.cod)}</b> · ${esc(LOTES[d.cod].hac)} <small>(${man ? `elegido a mano · vence en ${resta} min` : esc(d.por)})</small>` : '<b>Sin lote</b>';
  const acepta = !!(e.otro && destinoManual && destinoManual.acepta === e.otro);
  const ayuda = ok ? (acepta ? `Usted eligió guardar en el lote ${esc(d.cod)} aunque el GPS lo ubica en el ${esc(e.otro)}. Toque ✕ para volver al lote del GPS.`
    : e.otro ? `Toque un botón y la app le preguntará en cuál de los dos lotes guardar.` : man ? 'El lote elegido a mano se libera solo a los 15 min o al entrar a otro lote.' : `Todo hallazgo se guarda con la posición GPS de este momento.`)
    : e.nivel === 'mal' ? `Para registrar hay que estar en el lote (dentro o a menos de ${REG_DIST_MAX} m) con GPS de ±${REG_ACC_MAX} m o mejor.` : `Los botones funcionan en cuanto el indicador se ponga verde.`;
  return `<div class="destino ${NIVEL_CLS[e.nivel]}" data-nivel="${e.nivel}"><span><span class="dest-lote">${titulo}</span><span class="dest-gps"><i class="semaforo"></i>${esc(e.txt)}</span></span>
    <span class="dest-acc">${e.activar && !GPS.bloqueado ? `<button type="button" onclick="iniciarGps(false);pintarDestino()">${ico('pin')} Activar GPS</button>` : ''}<button type="button" onclick="elegirLote('Elegir lote', c => { elegirDestino(c); pintarDestino(); })">${d ? 'Cambiar' : 'Elegir lote'}</button>${man ? `<button type="button" onclick="soltarDestino()" aria-label="Quitar el lote elegido y volver al del GPS">${ico('x')}</button>` : ''}</span></div>
    <p class="pie">${ayuda}</p>`;
}
/* Pinta solo el destino y el estado de los botones rápidos (no toda la lista): se actualiza cada segundo sin estorbar. */
function pintarDestino() {
  const box = $('destinoBox'); if (!box) return;
  const html = destinoHtml();
  if (html !== _destHtml) { _destHtml = html; box.innerHTML = html; }
  const dest = box.querySelector('.destino'), nivel = dest ? dest.dataset.nivel : '', r = $('rapidos');
  if (r) r.classList.toggle('atenuado', nivel === 'mal' || nivel === 'espera');
}
function rapidosHtml() {
  return `<div class="titulo-fila"><h3>Registro rápido · un toque</h3></div>
    <div class="campo rap-sev">Severidad<div class="segmento c4" id="rapSev">${[['', 'Sugerida'], ['Baja', 'Baja'], ['Media', 'Media'], ['Alta', 'Alta']].map(s => `<button type="button" data-v="${s[0]}" class="${rapSev === s[0] ? 'activo' : ''}">${s[1]}</button>`).join('')}</div>
    <span class="ayuda">${rapSev === 'Alta' ? 'Alta pide foto: el botón abre el formulario para tomarla.' : rapSev ? `Todos los registros rápidos se guardarán como ${rapSev}.` : 'Cada categoría usa su severidad sugerida (la que aparece en el botón). Baja = informativo.'}</span></div>
    <div class="rapidos" id="rapidos">${RAPIDOS.map(c => { const s = rapSev || sevDe(c); return `<button type="button" onclick="registroRapido('${c}')">${ico(ICONO_CAT[c])}${c}<small class="sev-${s.toLowerCase()}">${s}</small></button>`; }).join('')}</div>`;
}
let bitFiltro = 'pendientes';
/* Filtros de la lista de la Bitácora: estado (arriba), severidad, categoría y texto (lote, finca o nota). */
let bitSev = '', bitCat = '', bitQ = '';
function bitFiltrar(todas) {
  const pend = todas.filter(esPendiente), q = sinTildes(bitQ.trim()).toUpperCase();
  let l = bitFiltro === 'pendientes' ? pend : bitFiltro === 'resueltos' ? todas.filter(o => o.resuelto) : todas;
  if (bitSev) l = l.filter(o => o.severidad === bitSev);
  if (bitCat) l = l.filter(o => o.categoria === bitCat);
  if (q) l = l.filter(o => sinTildes([o.codlote, (LOTES[o.codlote] || {}).hac, o.nota, o.categoria].join(' ')).toUpperCase().includes(q));
  return l;
}
function pintarBitLista() {
  const box = $('bitLista'); if (!box) return;
  const todas = obsTodas().slice().reverse(), lista = bitFiltrar(todas), filtrando = bitSev || bitCat || bitQ.trim();
  box.innerHTML = (filtrando ? `<p class="pie bit-cuenta"><b>${nf0.format(lista.length)}</b> de ${nf0.format(todas.length)} registros · <button type="button" class="enlace" onclick="bitSev='';bitCat='';bitQ='';renderBitacora()">Quitar filtros</button></p>` : '') +
    (lista.length ? `<p class="pie">${AYUDA_DESLIZA[bitFiltro]}</p>` + lista.map(filaDeslizaHtml).join('')
      : `<p class="vacio">${todas.length ? (bitFiltro === 'pendientes' && !filtrando ? 'Sin pendientes: todo lo de severidad media o alta está resuelto.' : 'Nada en este filtro.') : 'Aún no hay registros. Use un botón de registro rápido o "Nuevo hallazgo".'}</p>`);
  activarDeslizar(box);
}
function renderBitacora() {
  const todas = obsTodas().slice().reverse(), pend = todas.filter(esPendiente);
  if (bitFiltro === 'pendientes' && !pend.length && todas.length) bitFiltro = 'todos';
  const cats = [...new Set(todas.map(o => o.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const semana = todas.filter(o => Date.now() - new Date(o.fecha_hora) < 7 * 86400000).length;
  _destHtml = '';
  $('tabBitacora').innerHTML = `<header><h2>Bitácora</h2></header>
    <div id="destinoBox"></div>
    <div id="rapidosBox">${rapidosHtml()}</div>
    <h3>Registros</h3>
    <div class="cifras c3">${cifra('Pendientes', pend.length, pend.length ? 'c-alerta' : '')}${cifra('Últimos 7 días', semana)}${cifra('Total', todas.length)}</div>
    <div class="segmento filtro">${[['pendientes', 'Pendientes'], ['todos', 'Todos'], ['resueltos', 'Resueltos']].map(f => `<button type="button" class="${bitFiltro === f[0] ? 'activo' : ''}" onclick="bitFiltro='${f[0]}';renderBitacora()">${f[1]}</button>`).join('')}</div>
    ${todas.length > 1 ? `<div class="bit-filtros">
      <input id="bitQ" type="search" placeholder="Buscar lote, finca o nota" value="${esc(bitQ)}" autocomplete="off" enterkeyhint="search" aria-label="Buscar en la bitácora">
      <div class="chips-fil" role="group" aria-label="Severidad">${[['', 'Toda severidad'], ['Alta', 'Alta'], ['Media', 'Media'], ['Baja', 'Baja']].map(x => `<button type="button" class="${bitSev === x[0] ? 'activo' : ''}" aria-pressed="${bitSev === x[0]}" data-sev="${x[0]}">${x[1]}</button>`).join('')}</div>
      ${cats.length > 1 ? `<select id="bitCat" aria-label="Categoría"><option value="">Todas las categorías</option>${cats.map(c => `<option ${c === bitCat ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>` : ''}
    </div>` : ''}
    <div id="bitLista"></div>
    ${todas.length ? `<h3>Respaldo</h3><p class="pie">Los registros viven solo en este teléfono. Exporte para respaldarlos.</p><div class="acciones"><button type="button" class="btn sec" onclick="exportarZip()">${ico('download')} ZIP con fotos</button><button type="button" class="btn ter" onclick="exportarCsv()">CSV</button></div>
      <button type="button" class="btn peligro ancho" onclick="vaciarBitacora()">Borrar toda la bitácora y sus fotos</button>` : ''}
    <div class="barra-accion"><button type="button" class="btn pri grande" onclick="nuevoRegistro()">${ico('plus')} Nuevo hallazgo</button></div>`;
  $('rapidosBox').addEventListener('click', e => { const b = e.target.closest('#rapSev button'); if (!b) return; rapSev = b.dataset.v; $('rapidosBox').innerHTML = rapidosHtml(); pintarDestino(); });
  pintarDestino();
  clearInterval(_destT); _destT = setInterval(() => { if (document.body.dataset.tab === 'bitacora') pintarDestino(); else clearInterval(_destT); }, 1000);
  activarDeslizar($('tabBitacora')); pintarBitLista();
  const q = $('bitQ'); if (q) q.addEventListener('input', e => { bitQ = e.target.value; pintarBitLista(); });
  const ct = $('bitCat'); if (ct) ct.addEventListener('change', e => { bitCat = e.target.value; pintarBitLista(); });
  const fs = document.querySelector('#tabBitacora .chips-fil'); if (fs) fs.addEventListener('click', e => { const b = e.target.closest('button[data-sev]'); if (!b) return; bitSev = b.dataset.sev; fs.querySelectorAll('button').forEach(x => { x.classList.toggle('activo', x === b); x.setAttribute('aria-pressed', x === b); }); pintarBitLista(); });
}
/* ── Exportar: CSV para Excel con fecha y hora locales (no UTC) y columnas para gerencia; ZIP con el CSV y las fotos ── */
const dos = n => String(n).padStart(2, '0');
const fechaValida = iso => { const d = iso ? new Date(iso) : null; return d && !isNaN(d) ? d : null; };
const fechaLocalTxt = d => d ? `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}` : '';
const horaLocalTxt = d => d ? `${dos(d.getHours())}:${dos(d.getMinutes())}` : '';
const diaLocal = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/* Nombre de archivo de cada foto, el mismo en el CSV y dentro del ZIP. */
const nombresFotos = o => [o.photo_id ? o.photo_name || `${o.codlote}_${o.photo_id}.jpg` : '', o.photo_id2 ? `${o.codlote}_${o.photo_id2}.jpg` : ''];
const CSV_OBS = ['id', 'fecha', 'hora', 'codlote', 'finca', 'cod_finca', 'zona', 'tablon', 'categoria', 'severidad', 'estado', 'dias_abierto', 'fecha_resuelto', 'nota', 'tecnico',
  'lat', 'lng', 'precision_m', 'pos_fuente', 'url_mapa', 'foto1', 'foto2', 'fecha_hora_iso', 'resuelto_iso'];
function filaCsv(o) {
  const l = LOTES[codKey(o.codlote)] || {}, f = fechaValida(o.fecha_hora), r = fechaValida(o.resuelto), pend = esPendiente(o), fotos = nombresFotos(o);
  // Días abierto: de un pendiente, hasta hoy; de uno resuelto, hasta el día en que se resolvió. Lo informativo no se cuenta.
  const dias = f && (pend || r) ? Math.max(0, Math.round((diaLocal(r || new Date()) - diaLocal(f)) / 86400000)) : '';
  const conPos = o.lat !== '' && o.lat !== null && o.lat !== undefined && Number.isFinite(Number(o.lat));
  return {id: o.id, fecha: fechaLocalTxt(f), hora: horaLocalTxt(f), codlote: o.codlote, finca: o.hacienda_productor || l.hac || '', cod_finca: l.codFinca || '', zona: l.zona || '',
    tablon: o.tablon || '', categoria: o.categoria, severidad: o.severidad, estado: o.resuelto ? 'Resuelto' : pend ? 'Pendiente' : 'Informativo', dias_abierto: dias,
    fecha_resuelto: r ? `${fechaLocalTxt(r)} ${horaLocalTxt(r)}` : '', nota: o.nota || '', tecnico: o.usuario && o.usuario !== 'CASUR Maps' ? o.usuario : '',
    lat: conPos ? o.lat : '', lng: conPos ? o.lng : '', precision_m: o.precision_m ?? '', pos_fuente: o.pos_fuente || '', url_mapa: conPos ? `https://maps.google.com/?q=${o.lat},${o.lng}` : '',
    foto1: fotos[0], foto2: fotos[1], fecha_hora_iso: o.fecha_hora || '', resuelto_iso: o.resuelto || ''};
}
function csvBitacora() { return '﻿' + [CSV_OBS.join(','), ...obsTodas().map(o => { const f = filaCsv(o); return csvLinea(CSV_OBS.map(h => f[h])); })].join('\n'); }
/* bitacora_casur_[técnico_]AAAA-MM-DD con la fecha local: si varios técnicos exportan el mismo día, los archivos no se pisan. */
function nombreExport(ext) {
  const tec = String(S.tecnico || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30);
  return `bitacora_casur_${tec ? tec + '_' : ''}${fechaLocalTxt(new Date())}.${ext}`;
}
function exportarCsv() { if (!obsTodas().length) { toast('No hay registros para exportar.'); return; } descargarTexto(nombreExport('csv'), csvBitacora(), 'text/csv;charset=utf-8'); }
async function exportarZip() {
  const obs = obsTodas(); if (!obs.length) { toast('No hay registros para exportar.'); return; }
  const ahora = new Date(), archivos = [{nombre: 'bitacora.csv', datos: new TextEncoder().encode(csvBitacora()), fecha: ahora}];
  // Solo las fotos de los registros que existen, con el nombre que aparece en el CSV.
  const nombre = new Map(); obs.forEach(o => { const n = nombresFotos(o); if (o.photo_id) nombre.set(o.photo_id, n[0]); if (o.photo_id2) nombre.set(o.photo_id2, n[1]); });
  (await fotoAll().catch(() => [])).forEach(r => { const n = nombre.get(r.id); if (n && r.data_url) archivos.push({nombre: 'fotos/' + n, datos: dataUrlBytes(r.data_url), fecha: fechaValida(r.created_at) || ahora}); });
  descargarBlob(nombreExport('zip'), crearZip(archivos));
  toast(`ZIP generado: ${obs.length} registros y ${archivos.length - 1} foto(s).`, {tipo: 'bien'});
}
async function vaciarBitacora() {
  if (!await preguntar('¿Borrar toda la bitácora?', 'Se borran TODOS los registros y fotos de este teléfono. Exporte antes si los necesita.', 'Borrar todo', 'Cancelar')) return;
  obsGuardar([]); _fotosPorBorrar.clear(); _rapUlt = null; try { await fotoTx('readwrite', s => s.clear()); } catch (_) {} renderBitacora(); toast('Bitácora vacía.');
}

let _visT = null;
function renderVisita() {
  const v = VISITA, el = $('tabVisita'); clearInterval(_visT);
  const lista = LISTA.length ? `<div class="lista-lotes">${LISTA.map((x, i) => `<div class="fila-lista ${x.hecho ? 'hecho' : ''}"><button type="button" class="chk" onclick="listaMarcar('${esc(x.cod)}',${!x.hecho})">${x.hecho ? ico('check') : i + 1}</button><button type="button" class="ir" onclick="seleccionarLote('${esc(x.cod)}',{zoom:true})"><b>${esc(x.cod)}</b><span>${esc((LOTES[x.cod] || {}).hac || '')}</span></button>${llegarHtml(x.cod)}<button type="button" class="quitar" onclick="listaToggle('${esc(x.cod)}')" aria-label="Quitar">${ico('x')}</button></div>`).join('')}</div>`
    : '<p class="vacio">Agregue lotes desde su tarjeta con "Lista del día". Aparecen numerados en el mapa y se marcan solos al visitarlos.</p>';
  // Lista armada otro día: se ofrece pasar los pendientes, reutilizarla entera o vaciarla (con Deshacer).
  const lh = LISTA.filter(x => x.hecho).length, lp = LISTA.length - lh;
  const vieja = listaVieja() ? `<div class="nota est-info lista-vieja"><b>Lista ${esc(listaFechaTxt())}: ${lh} de ${LISTA.length} lote${LISTA.length === 1 ? '' : 's'} hecho${LISTA.length === 1 ? '' : 's'}.</b><span>¿Qué hacer con ella hoy?${v ? '' : ' Si inicia una visita sin elegir, toda la lista vuelve a quedar por visitar.'}</span><div class="acciones">${lh && lp ? `<button type="button" class="btn sec" onclick="listaUsarHoy('pendientes')">Pasar ${lp} pendiente${lp === 1 ? '' : 's'} a hoy</button>` : ''}<button type="button" class="btn sec" onclick="listaUsarHoy('toda')">${lh ? 'Reutilizar toda' : 'Usarla hoy'}</button><button type="button" class="btn ter" onclick="listaVaciar()">Vaciar</button></div></div>` : '';
  const sinGps = v && gpsVisitaMal(estadoGpsVisita()) ? `<div class="nota est-mal aviso-sin-gps"><b>${ico('alert')} Visita en curso sin GPS</b><span>No se está grabando la ruta, la distancia ni los lotes.</span><button type="button" class="btn pri" onclick="reactivarGpsVisita()">${ico('pin')} Reactivar GPS</button></div>` : '';
  const previas = VISITAS.slice(-10).reverse().map(x => `<div class="bloque"><b>${esc(new Date(x.inicio).toLocaleString('es-NI', {dateStyle: 'medium', timeStyle: 'short'}))}</b><p>${fmtDur(new Date(x.fin || x.inicio) - new Date(x.inicio))} · ${fmtDist(x.dist || 0)} · ${lotesVisitados(x).length} lote(s)</p>
      <div class="obs-acc"><button type="button" onclick="reporteVisita(visitaPorId('${x.id}'))">${ico('file')} Reporte</button><button type="button" onclick="verRuta(visitaPorId('${x.id}'))">${ico('map')} Ruta</button><button type="button" onclick="csvVisita(visitaPorId('${x.id}'))">CSV</button><button type="button" onclick="borrarVisita('${x.id}')">${ico('trash')}</button></div></div>`).join('');
  el.innerHTML = `<header><h2>Visita de campo</h2><p>Registra ruta, distancia y los lotes en los que realmente estuvo.</p></header>
    ${sinGps}${v ? `<div class="cifras c4 grande">${cifra('Tiempo', `<em id="visTiempo">${fmtDur(Date.now() - new Date(v.inicio))}</em>`)}${cifra('Distancia', fmtDist(v.dist))}${cifra('Lotes', lotesVisitados(v).length)}${cifra('GPS', GPS.fix && !sinGps ? '±' + GPS.fix.acc + ' m' : '—')}</div>
      ${lotesVisitados(v).length ? `<p class="pie">Visitados: ${lotesVisitados(v).map(esc).join(' · ')}</p>` : ''}
      <div class="acciones"><button type="button" class="btn sec" onclick="verRuta(VISITA)">${ico('map')} Ver ruta</button></div>`
      : '<p class="vacio">Sin visita en curso. Use el botón de abajo para iniciar.</p>'}
    <div class="titulo-fila"><h3>Lista del día</h3>${LISTA.length ? `<button type="button" class="btn-texto" onclick="listaVaciar()">${ico('trash')} Vaciar lista</button>` : ''}</div>
    ${vieja}
    <label class="campo">Planificar: agregar finca o lote<input id="planQ" type="search" placeholder="Nombre de la finca o código del lote" autocomplete="off" autocapitalize="characters"></label>
    <div id="planRes" class="lista-lotes"></div>
    ${lista}
    <h3>Visitas anteriores</h3>${previas || '<p class="vacio">Sin visitas guardadas.</p>'}
    ${typeof VUELOS !== 'undefined' && VUELOS.length ? `<h3>Vuelos</h3>${VUELOS.slice(-10).reverse().map(x => { const d = datosVuelo(x); return `<div class="bloque"><b>${ico('heli')} ${esc(new Date(x.inicio).toLocaleString('es-NI', {dateStyle: 'medium', timeStyle: 'short'}))}</b><p>${d.tierra ? 'En tierra · ' : ''}${fmtDur(d.dur)} · ${fmtDist(x.dist || 0)} · ${d.lotes.length} ${d.tierra ? 'recorridos' : 'sobrevolados'} · ${d.vista.length} a la vista · ${x.marcas.length} marca${x.marcas.length === 1 ? '' : 's'}</p>
      <div class="obs-acc"><button type="button" onclick="cierreVuelo(vueloPorId('${x.id}'))">${ico('file')} Resumen</button><button type="button" onclick="verRutaVuelo(vueloPorId('${x.id}'))">${ico('map')} Ruta</button><button type="button" onclick="borrarVuelo('${x.id}')">${ico('trash')}</button></div></div>`; }).join('')}` : ''}
    <div class="barra-accion">${v ? `<button type="button" class="btn peligro grande" onclick="pedirFinalizarVisita()">${ico('stop')} Finalizar visita</button>` : `<button type="button" class="btn pri grande" onclick="iniciarVisita()">${ico('play')} Iniciar visita</button>`}</div>`;
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
    lotes.map(l => `<button type="button" data-lote="${esc(l.cod)}"><b>${esc(l.cod)}</b><span>${esc(l.hac)} · ${fmtHaLote(l.area)}</span><i class="chip ${listaTiene(l.cod) ? 'est-bien' : 'est-neutro'}">${listaTiene(l.cod) ? ico('check') + ' en lista' : ico('plus') + ' agregar'}</i></button>`).join('') || '<p class="vacio">Sin coincidencias.</p>';
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
async function borrarVisita(id) { if (!await preguntar('¿Borrar esta visita?', '', 'Borrar', 'Cancelar')) return; VISITAS = VISITAS.filter(x => x.id !== id); await kvSet('visitas', VISITAS); renderVisita(); }
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
  const ruta = pts.length > 1 ? `${segmentosRuta(pts).filter(s => s.length > 1).map(s => `<polyline points="${s.map(q => X(q[1]) + ',' + Y(q[0])).join(' ')}" fill="none" stroke="#0a66ff" stroke-width="3" stroke-linejoin="round"/>`).join('')}<circle cx="${X(pts[0].lng)}" cy="${Y(pts[0].lat)}" r="6" fill="#0b7f3a"/><circle cx="${X(pts[pts.length - 1].lng)}" cy="${Y(pts[pts.length - 1].lat)}" r="6" fill="#b91c1c"/>` : '';
  return `<svg viewBox="0 0 ${W} ${H.toFixed(0)}" style="width:100%;border:1px solid #dbe5dd;border-radius:12px;background:#fbfdfc">${polys}${ruta}${etq}</svg><p class="s">● verde: inicio · ● rojo: fin · línea azul: recorrido</p>`;
}
async function reporteVisita(v) {
  if (!v) { toast('No hay visita para reportar.'); return; }
  const ini = new Date(v.inicio).getTime(), fin = new Date(v.fin || Date.now()).getTime(), cods = lotesVisitados(v);
  const obs = obsTodas().filter(o => { const t = new Date(o.fecha_hora).getTime(); return t >= ini && t <= fin; });
  const fotos = {}; for (const o of obs) for (const id of [o.photo_id, o.photo_id2]) if (id) { const r = await fotoGet(id).catch(() => null); if (r) fotos[id] = r.data_url; }
  const filasL = cods.map(c => { const l = LOTES[c] || {}, s = estadoLote(LOTES[c]); return `<tr><td><b>${esc(c)}</b></td><td>${esc(l.hac || '—')}</td><td>${esc(l.variedad || '—')}</td><td>${fmtN(l.area, '', nfHaLote)}</td><td>${l.tchAnt > 0 ? nfTch.format(l.tchAnt) : 'Sin dato'}</td><td>${l.tchEst > 0 ? nfTch.format(l.tchEst) + (estValidar(l) ? ' (a validar)' : '') : esSinCana(l) ? 'No aplica (sin caña)' : l.cod ? (m => m.txt === 'No aplica' ? 'No aplica (' + esc(m.det) + ')' : m.txt === 'Sin aforo' ? 'Sin aforo 26/27' : 'Sin estimado')(motivoSinEstimado(l)) : '—'}</td><td>${esc(s.txt)}</td><td>${obs.filter(o => codKey(o.codlote) === c).length}</td></tr>`; }).join('');
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
    <h2>Lotes visitados</h2><table><thead><tr><th>Lote</th><th>Finca</th><th>Variedad</th><th>ha</th><th title="TCH zafra anterior (t/ha)">TCH zafra anterior</th><th title="TCH estimado 26/27 (t/ha)">TCH estimado 26/27</th><th>Estado</th><th>Registros</th></tr></thead><tbody>${filasL || '<tr><td colspan="8">Sin lotes.</td></tr>'}</tbody></table>
    <h2>Registros</h2>${bloquesO || '<p class="s">Sin registros durante la visita.</p>'}</body></html>`;
  const blob = new Blob([html], {type: 'text/html;charset=utf-8'}), w = window.open(URL.createObjectURL(blob), '_blank');
  if (!w) descargarBlob(`reporte_visita_${v.id}.html`, blob);
}

/* ── Pestaña Más: resumen de aforo, ajustes, datos e instalación ── */
let aforoGrupo = 'hacienda', aforoTodas = false, instalarEvt = null;
const AFORO_TOP = 10; // filas del resumen a la vista (las de más toneladas); el resto con «Ver las N»
const AFORO_GRUPOS = [['hacienda', 'Finca'], ['zona', 'Zona'], ['finca', 'Finca y tenencia']];
/* Resumen por bloques (pestañas internas): Panorama · Zafra · Fincas · Renovación. Recuerda la última.
   En tableta horizontal, Panorama queda fijo a la izquierda y la pestaña elegida a la derecha. */
const MAS_VISTAS = [['panorama', 'Panorama'], ['zafra', 'Zafra'], ['fincas', 'Fincas'], ['renov', 'Renovación']];
let masVista = (() => { try { return localStorage.getItem('casur_mas_vista') || 'panorama'; } catch (_) { return 'panorama'; } })();
let aforoAbierta = false;
const masAncho = () => window.matchMedia('(min-width:1000px)').matches;
function verMas(v) { masVista = v; try { localStorage.setItem('casur_mas_vista', v); } catch (_) {} renderMas(); $('tabMas').scrollTop = 0; }
function aforoHtml() {
  const filas = ((RESUMEN.resumen || {})[aforoGrupo] || []);
  const sel = (id, ops, val) => `<select id="${id}">${ops.map(o => `<option value="${o[0]}" ${o[0] === val ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>`;
  return `<header><h2>Aforo 26/27 por ${aforoGrupo === 'zona' ? 'zona' : 'finca'}</h2><p>al ${fechaCorta(META.datos_al || META.generated_at)}</p></header>
    <label class="campo">Buscar finca o lote<input id="aforoQ" type="search" placeholder="Nombre de la finca o código del lote" autocomplete="off" autocapitalize="characters" enterkeyhint="search"></label>
    <div id="aforoRes" class="lista-lotes"></div>
    <details class="aforo-det"${aforoAbierta ? ' open' : ''}><summary>${ico('file')} Tabla del aforo <small>${nf0.format(filas.length)} ${aforoGrupo === 'hacienda' ? 'fincas' : 'filas'} · área, toneladas y TCH</small></summary>
    <label class="campo">Agrupar por${sel('aforoGrupo', AFORO_GRUPOS, aforoGrupo)}</label>
    <div class="tabla"><table><thead><tr><th>${(AFORO_GRUPOS.find(o => o[0] === aforoGrupo) || AFORO_GRUPOS[0])[1]}</th><th title="Área de molienda (ha)">Área (ha)</th><th title="Toneladas estimadas 26/27">Ton.</th><th title="TCH estimado 26/27 (t/ha)">TCH est.</th><th title="TCH optimista (t/ha)">TCH opt.</th></tr></thead><tbody id="aforoFilas">${filasAforo(aforoTodas ? filas : filas.slice(0, AFORO_TOP))}</tbody></table></div>
    ${filas.length > AFORO_TOP ? `<button type="button" class="btn ter ancho" id="aforoMas" aria-expanded="${aforoTodas}">${aforoTodas ? `${ico('chevUp')} Ver solo las ${AFORO_TOP} primeras` : `${ico('chevDown')} Ver las ${nf0.format(filas.length)} ${aforoGrupo === 'hacienda' ? 'fincas' : 'filas'}`}</button>` : ''}
    </details>`;
}
function renderMas() {
  const P = ejecutivoPartes(), ancho = masAncho();
  let v = MAS_VISTAS.some(x => x[0] === masVista) ? masVista : 'panorama';
  if (ancho && v === 'panorama') v = 'zafra'; // en tableta Panorama ya está fijo a la izquierda
  const tabs = MAS_VISTAS.filter(x => !(ancho && x[0] === 'panorama'));
  const cuerpo = v === 'panorama' ? P.panorama : v === 'zafra' ? P.zafra : v === 'fincas' ? P.ranking + aforoHtml() : '<div id="renovBox"></div>';
  $('tabMas').innerHTML = `<div class="marca"><img src="./assets/logo_casur.png" alt="CASUR"><div><b>CASUR Maps</b><span>Departamento de Negocios de Caña</span></div></div>
    <div class="mas-grid">${ancho ? `<div class="mas-c1">${P.panorama}</div>` : ''}<div class="mas-c2">
    <div class="mas-tabs" role="tablist" aria-label="Bloques del resumen">${tabs.map(x => `<button type="button" role="tab" aria-selected="${x[0] === v}" class="${x[0] === v ? 'activo' : ''}" onclick="verMas('${x[0]}')">${x[1]}</button>`).join('')}</div>
    <div class="mas-cuerpo" role="tabpanel">${cuerpo}</div></div></div>`;
  if (v === 'renov') pintarRenovBox();
  if (v === 'fincas') {
    const mas = $('aforoMas');
    if (mas) mas.addEventListener('click', () => { aforoTodas = !aforoTodas; const y = $('tabMas').scrollTop; renderMas(); $('tabMas').scrollTop = y; if (!aforoTodas) $('aforoMas').scrollIntoView({block: 'nearest'}); });
    $('aforoGrupo').addEventListener('change', e => { aforoGrupo = e.target.value; aforoTodas = false; const y = $('tabMas').scrollTop; renderMas(); $('tabMas').scrollTop = y; });
    $('aforoQ').addEventListener('input', e => buscarAforo(e.target.value));
    document.querySelector('#tabMas .aforo-det').addEventListener('toggle', e => { aforoAbierta = e.target.open; });
    $('aforoRes').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.finca) abrirFinca(b.dataset.finca); else seleccionarLote(b.dataset.lote, {zoom: true}); });
    $('tabMas').querySelector('tbody').addEventListener('click', e => { const tr = e.target.closest('tr[data-finca]'); if (tr) abrirFinca(tr.dataset.finca); });
  }
  // Filas que se tocan: también con teclado (Enter o espacio), como un botón. Se enlaza una sola vez (la pestaña se repinta).
  if (!$('tabMas').dataset.teclado) { $('tabMas').dataset.teclado = '1'; $('tabMas').addEventListener('keydown', e => { const tr = e.target.closest && e.target.closest('tr[role=button]'); if (!tr || (e.key !== 'Enter' && e.key !== ' ')) return; e.preventDefault(); tr.click(); });
    window.matchMedia('(min-width:1000px)').addEventListener('change', () => { if (document.body.dataset.tab === 'mas') renderMas(); }); }
}
/* Renovación del Resumen en su propio contenedor: se repinta sola cuando llega el histórico. */
function pintarRenovBox() {
  const box = $('renovBox'); if (!box) return;
  box.innerHTML = renovacionHtml();
  box.querySelectorAll('.renov-filas').forEach(tb => tb.addEventListener('click', e => { const f = e.target.closest('tr[data-zona]'); if (f) abrirRenovZona(f.dataset.zona); }));
}
/* ── Administración protegida con PIN (6 dígitos). Se guarda solo el hash; el desbloqueo dura 30 días en este equipo.
   Es una barrera de uso: la actualización real de datos exige además la cuenta de GitHub con permiso. ── */
const ADMIN_HASH = 'e51dfbf152aff24db7ef2869466d2df93515e2a0cad642d2786f436b0d150cf9', ADMIN_KEY = 'casur_admin_hasta', ADMIN_DIAS = 30;
let _adminAbrir = false, _pinFallos = 0, _pinEspera = 0;
function adminOk() { try { return Number(localStorage.getItem(ADMIN_KEY) || 0) > Date.now(); } catch (_) { return false; } }
async function hashPin(pin) {
  const txt = 'casur-maps-admin:' + pin;
  if (window.crypto && crypto.subtle) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt)); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join(''); }
  return '';
}
function pedirPinAdmin() {
  abrirHoja('Administración de datos', `<form id="pinForm" class="pin-form" autocomplete="off">
    <label class="campo">PIN de administrador<input id="pinAdm" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" enterkeyhint="go" aria-describedby="pinErr"></label>
    <p id="pinErr" class="campo-error" hidden></p>
    <button type="submit" class="btn pri ancho">${ico('unlock')} Desbloquear</button></form>`);
  const f = $('pinForm'), inp = $('pinAdm'), err = $('pinErr');
  setTimeout(() => inp.focus(), 250);
  const fallo = t => { err.hidden = false; err.textContent = t; inp.value = ''; inp.focus(); vibrar(120); };
  inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 6); err.hidden = true; if (inp.value.length === 6) f.requestSubmit(); });
  f.addEventListener('submit', async e => {
    e.preventDefault();
    if (Date.now() < _pinEspera) { fallo(`Demasiados intentos. Espere ${Math.ceil((_pinEspera - Date.now()) / 1000)} s.`); return; }
    if (inp.value.length !== 6) { fallo('El PIN tiene 6 dígitos.'); return; }
    const h = await hashPin(inp.value);
    if (h && h === ADMIN_HASH) {
      _pinFallos = 0; try { localStorage.setItem(ADMIN_KEY, String(Date.now() + ADMIN_DIAS * 86400000)); } catch (_) {}
      _adminAbrir = true; cerrarHoja(); renderAjustes(); toast('Administración desbloqueada en este equipo por 30 días.', {tipo: 'bien'});
      const d = document.querySelector('#tabAjustes .aj-admin'); if (d) d.scrollIntoView({block: 'start', behavior: 'smooth'});
    } else {
      _pinFallos++; if (_pinFallos >= 5) { _pinEspera = Date.now() + 5 * 60000; _pinFallos = 0; fallo('PIN incorrecto. Bloqueado 5 minutos.'); } else fallo(`PIN incorrecto (${_pinFallos} de 5).`);
    }
  });
}
function bloquearAdmin() { try { localStorage.removeItem(ADMIN_KEY); } catch (_) {} _adminAbrir = false; renderAjustes(); toast('Administración bloqueada.'); }

/* ── Pestaña Ajustes: preferencias del teléfono, datos y actualización ── */
function renderAjustes() {
  const sel = (id, ops, val) => `<select id="${id}">${ops.map(o => `<option value="${o[0]}" ${o[0] === val ? 'selected' : ''}>${o[1]}</option>`).join('')}</select>`;
  // Opciones cortas para que quepan con cualquier tamaño de letra; la explicación de la elegida va debajo.
  const AYUDAS = {
    ajGps: [['vehiculo', 'En vehículo', 'Recomendado. Para recorrer las fincas en vehículo.'], ['campo', 'Caminando', 'Para recorrer el lote a pie.'], ['preciso', 'Punto fijo', 'Máxima precisión, sin moverse del punto.']],
    ajTema: [['campo', 'Campo', 'Alto contraste, para leer a pleno sol.'], ['auto', 'Automático', 'Oscuro de 7 p. m. a 5:30 a. m.; Campo el resto del día.'], ['claro', 'Claro suave', 'Fondo claro con menos contraste.'], ['oscuro', 'Oscuro', 'Para la madrugada.']],
    ajGiro: [['suave', 'Suave (recomendado)', 'Gira poco, solo al avanzar.'], ['normal', 'Normal', 'Sigue cada cambio de rumbo.'], ['sin', 'Sin giro', 'El norte siempre arriba.']]
  };
  const ayuda = (id, val) => ((AYUDAS[id].find(o => o[0] === val) || AYUDAS[id][0])[2]);
  const selA = (id, val) => sel(id, AYUDAS[id], val) + `<small class="ayuda" id="${id}Ayuda">${ayuda(id, val)}</small>`;
  const meta = META || {}, fDatos = fechaCorta(meta.datos_al || meta.generated_at), vencidos = Object.values(LOTES).filter(corteVencido).length;
  $('tabAjustes').innerHTML = `<header><h2>Ajustes</h2></header>
    <section class="aj-tarjeta aj-estado" aria-labelledby="ajEstTit">
      <h3 id="ajEstTit">${ico('check')} Estado de la app</h3>
      <div class="aj-filas">
        <div><span>Datos del aforo</span><b>al ${fDatos}</b></div>
        <div><span>Fechas de corte</span><b>${vencidos ? `<em class="mal">${vencidos} vencida${vencidos === 1 ? '' : 's'}</em>` : 'al día'}</b></div>
        <div><span>Cortes de la zafra en curso</span><b>${meta.cortes_al ? 'al ' + fechaCorta(meta.cortes_al) : 'aún no cargados'}</b></div>
        <div><span>Versión de la app</span><b>${APP_VERSION}</b></div>
      </div>
      <div class="acciones"><button type="button" class="btn pri" onclick="actualizarApp()">${ico('download')} Buscar actualización</button><button type="button" class="btn ter" onclick="abrirNovedades()">${ico('star')} Novedades</button></div>
      ${instalarEvt ? '<div class="acciones"><button type="button" class="btn sec" onclick="instalarApp()">' + ico('download') + ' Instalar en este teléfono</button></div>' : ''}
    </section>
    <section class="aj-tarjeta" aria-labelledby="ajPerTit">
      <h3 id="ajPerTit">${ico('edit')} Mis preferencias</h3>
      <label class="campo">Su nombre (aparece en hallazgos y visitas)<input id="ajTec" type="text" value="${esc(S.tecnico)}" placeholder="Nombre y apellido"></label>
      <label class="campo">Tamaño de letra${sel('ajLetra', [['normal', 'Normal'], ['grande', 'Grande'], ['muygrande', 'Muy grande']], S.letra || 'normal')}</label>
      <label class="campo">Colores de pantalla${selA('ajTema', S.tema)}</label>
      <label class="interruptor"><input type="checkbox" id="ajTab" ${S.tableroAbrir ? 'checked' : ''}><span>Mostrar el tablero del día al abrir</span></label>
    </section>
    <section class="aj-tarjeta" aria-labelledby="ajGpsTit">
      <h3 id="ajGpsTit">${ico('pin')} Ubicación y recorridos</h3>
      <label class="campo">Cómo recorre el campo${selA('ajGps', S.gpsPerfil)}</label>
      <label class="campo">Giro del mapa al avanzar${selA('ajGiro', S.giro)}</label>
      <label class="interruptor"><input type="checkbox" id="ajAuto" ${S.gpsAuto ? 'checked' : ''}><span>Ubicarme al abrir la app</span></label>
      <label class="interruptor"><input type="checkbox" id="ajPant" ${S.pantalla ? 'checked' : ''}><span>Pantalla siempre encendida durante la visita</span></label>
      <label class="interruptor"><input type="checkbox" id="ajVib" ${S.vibrar ? 'checked' : ''}><span>Vibrar al entrar a un lote</span></label>
    </section>
    ${!adminOk() ? `<section class="aj-tarjeta aj-admin cerrada"><h3>${ico('lock')} Administración de datos</h3><p class="pie">Solo administrador.</p><button type="button" class="btn sec ancho" onclick="pedirPinAdmin()">${ico('unlock')} Desbloquear</button></section>` : `<details class="aj-tarjeta aj-admin"${_adminAbrir ? ' open' : ''}>
      <summary>${ico('lock')} Administración de datos <small>para quien actualiza la información</small></summary>
      <div class="nota est-neutro"><b>Para actualizar los datos:</b> descargue la plantilla de Excel, actualícela y súbala a la carpeta <b>fuentes</b> con el mismo nombre. En unos minutos todos los teléfonos reciben los datos nuevos.</div>
      <div class="acciones"><a class="btn sec" href="./fuentes/Plantilla_CASUR_Maps.xlsx" download>${ico('download')} Descargar plantilla</a><a class="btn ter" href="https://github.com/Kem111079/CASUR_MAPS_V171126/upload/main/fuentes" target="_blank" rel="noopener">${ico('share')} Subir plantilla</a></div>
      <div class="aj-filas">
        <div><span>Lotes en el mapa</span><b>${nf0.format(meta.codlotes_shape || Object.values(LOTES).filter(l => l.nPoly).length)} lotes · ${nf0.format(meta.poligonos || 0)} tablones</b></div>
        <div><span>Archivo del mapa</span><b>${esc(meta.fuente_shape || '—')}</b></div>
        <div><span>Archivo del aforo</span><b>${esc(meta.fuente_aforo_version || meta.fuente_aforo || '—')}</b></div>
        <div><span>Espacio usado en el teléfono</span><b id="espacio">…</b></div>
      </div>
      ${meta.cortes_al ? '' : '<p class="pie">Mientras no se carguen cortes de la zafra en curso, la edad y el TCH de la zafra anterior vienen de la zafra 25/26.</p>'}
      <div class="acciones"><button type="button" class="btn sec" onclick="revisarDatos()">${ico('rotate')} Volver a descargar los datos</button><button type="button" class="btn ter" onclick="borrarMapas()">Borrar mapas guardados</button></div>
      <div class="acciones"><button type="button" class="btn ter" onclick="bloquearAdmin()">${ico('lock')} Bloquear administración</button></div>
    </details>`}`;
  $('ajTec').addEventListener('change', e => { S.tecnico = e.target.value.trim(); guardarAjustes(); });
  $('ajGps').addEventListener('change', e => { S.gpsPerfil = e.target.value; guardarAjustes(); });
  $('ajTema').addEventListener('change', e => { S.tema = e.target.value; guardarAjustes(); aplicarTema(); capaLotes.setStyle(estiloFeat); pintarSeleccion(); });
  $('ajLetra').addEventListener('change', e => { S.letra = e.target.value; guardarAjustes(); aplicarTema(); if (selCod) renderCard(); pintarLeyenda(); }); // la tarjeta vuelve a medir su alto
  Object.keys(AYUDAS).forEach(id => $(id).addEventListener('change', e => { $(id + 'Ayuda').textContent = ayuda(id, e.target.value); }));
  $('ajTab').addEventListener('change', e => { S.tableroAbrir = e.target.checked; guardarAjustes(); });
  $('ajGiro').addEventListener('change', e => { S.giro = e.target.value; S.orientacion = S.giro === 'sin' ? 'norte' : 'rumbo'; guardarAjustes(); aplicarGiroCss(); orientar(true); pintarBrujula(); });
  $('ajAuto').addEventListener('change', e => { S.gpsAuto = e.target.checked; guardarAjustes(); });
  $('ajPant').addEventListener('change', e => { S.pantalla = e.target.checked; guardarAjustes(); S.pantalla ? pedirPantalla() : soltarPantalla(); });
  $('ajVib').addEventListener('change', e => { S.vibrar = e.target.checked; guardarAjustes(); vibrar(); });
  if (navigator.storage && navigator.storage.estimate) navigator.storage.estimate().then(e => { const el = $('espacio'); if (el) el.textContent = nf0.format((e.usage || 0) / 1048576) + ' MB'; }).catch(() => {});
}

/* ── Resumen de renovación: área por zona, TCH estimado, referencia y ganancias ── */
/* Aviso de los lotes con TCH estimado a validar: se cuentan en los totales y se dice cuánto aportan. */
function avisoValidar(v, enZona = false) {
  if (!v.n) return '';
  return `<div class="nota est-medio aviso-val">${ico('alert')}<span><b>${v.n} a validar</b> · ${signo(v.tonEsp, nfT)} t${v.dEspSin !== null ? ` · sin ellos ${signo(v.dEspSin)} t/ha` : ''}</span>${enZona ? '' : ` <button type="button" class="enlace" onclick="verLotesValidar()">Ver</button>`}</div>`;
}
function renovacionHtml() {
  const r = resumenRenovacion(); if (!r.n) return '';
  const d = v => v === null ? '—' : signo(v), t = v => v === null ? '—' : nfTch.format(v);
  // Dos tablas: qué se espera ganar y qué dice el histórico. Para que quepan sin deslizar de lado en teléfonos de
  // hasta 419 px, ahí se ocultan «Plantillas» (está en la hoja de cada zona) y «Lotes» (col-plant y col-n, ver styles.css).
  return `<h3>Renovación propuesta</h3>
    <div class="cifras c4">${cifra('Lotes', nf0.format(r.n))}${cifra('Hectáreas', nfHa.format(r.area))}${cifra('TCH estimado 26/27', nfTch.format(r.est))}${cifra('Ganancia esperada', conUnidad(signo(r.dEsp), ' t/ha'), 'c-est')}</div>
    ${avisoValidar(r.validar)}
    <h4>Δ vs plantillas</h4>
    <div class="tabla compacta"><table><thead><tr><th>Zona</th><th>ha</th><th title="TCH estimado 26/27 (t/ha)">TCH est.</th><th class="col-plant" title="TCH estimado de las plantillas de la zona (t/ha)">Plantillas</th><th title="Ganancia en t/ha">Δ t/ha</th><th title="Ganancia en toneladas">Δ ton.</th></tr></thead>
      <tbody class="renov-filas">${r.filas.map(f => { const nv = f.lotes.filter(estValidar).length; return `<tr data-zona="${esc(f.zona)}" tabindex="0" role="button"><td>${esc(f.zona)}${nv ? ` <small class="marca-validar" title="${nv} lote(s) con TCH estimado a validar">${nv} a validar</small>` : ''}</td><td>${nfHa.format(f.area)}</td><td>${nfTch.format(f.est)}</td><td class="col-plant">${t(f.plant)}</td><td><b>${d(f.dEsp)}</b></td><td>${f.plant === null ? '—' : signo(f.tonEsp, nfT)}</td></tr>`; }).join('')}
      <tr class="total"><td>Total</td><td>${nfHa.format(r.area)}</td><td>${nfTch.format(r.est)}</td><td class="col-plant"></td><td><b>${signo(r.dEsp)}</b></td><td>${signo(r.tonEsp, nfT)}</td></tr></tbody></table></div>
    <h4>Δ vs máx. histórico</h4>
    <div class="tabla compacta"><table><thead><tr><th>Zona</th><th class="col-n">Lotes</th><th title="Promedio histórico (t/ha)">Prom.</th><th title="Máximo histórico (t/ha)">Máximo</th><th title="Ganancia en t/ha">Δ t/ha</th><th title="Ganancia en toneladas">Δ ton.</th></tr></thead>
      <tbody class="renov-filas">${r.filas.map(f => `<tr data-zona="${esc(f.zona)}" tabindex="0" role="button"><td>${esc(f.zona)}</td><td class="col-n">${f.n}</td><td>${t(f.prom)}</td><td>${t(f.max)}</td><td><b>${d(f.dTecho)}</b></td><td>${f.max === null ? '—' : signo(f.tonTecho, nfT)}</td></tr>`).join('')}
      <tr class="total"><td>Total</td><td class="col-n">${r.n}</td><td></td><td></td><td><b>${signo(r.dTecho)}</b></td><td>${signo(r.tonTecho, nfT)}</td></tr></tbody></table></div>
    <button type="button" class="btn sec ancho" onclick="verRenovacionMapa()">${ico('map')} Ver lotes a renovar en el mapa</button>`;
}
/* Grupo de corte en palabras, con los mismos nombres de la capa Plantillas y socas. */
const grCorteTxt = g => !g ? 'sin grupo de corte' : g === 'Planta' ? 'plantilla' : g === 'Mayor a 5' ? 'soca, más de 5 cortes' : 'soca, ' + g.toLowerCase();
/* Fila de un lote a renovar (hoja de zona y lista de lotes a validar). */
function filaRenovHtml(l) {
  const de = deltaEsperado(l), val = estValidar(l), m = motivoSinEstimado(l);
  // Sin guiones sueltos: cuando falta una cifra se dice por qué.
  const est = l.tchEst > 0 ? `TCH estimado ${nfTch.format(l.tchEst)}` : m.txt === 'No aplica' ? `TCH estimado: no aplica (${esc(m.det)})` : m.txt === 'Sin aforo' ? 'sin aforo 26/27' : 'sin TCH estimado en el aforo';
  const hist = l.histProm !== null ? `promedio ${nfTch.format(l.histProm)}${l.histMax !== null ? ' · máximo ' + nfTch.format(l.histMax) : ''}` : 'sin histórico de TCH';
  return `<div class="fila-ir"><button type="button" onclick="cerrarHoja();seleccionarLote('${esc(l.cod)}',{zoom:true})"><b>${esc(l.cod)}</b><span>${esc(l.hac)} · ${fmtHaLote(l.areaAforo)} · ${esc(grCorteTxt(l.grCorte))}<br>${est}${val ? ' <em class="marca-validar">a validar</em>' : ''} · ${hist}</span><i class="chip ${de > 0 ? 'est-bien' : 'est-neutro'}">${de === null ? 'sin referencia' : signo(de) + ' t/ha'}</i></button>${llegarHtml(l.cod)}</div>`;
}
function verLotesValidar() {
  const v = resumenRenovacion().validar; if (!v.n) return;
  const orden = v.lotes.slice().sort((a, b) => (a.zona || '').localeCompare(b.zona || '', 'es', {numeric: true}) || a.cod.localeCompare(b.cod, 'es', {numeric: true}));
  abrirHoja('TCH estimado a validar', `<p class="pie">TCH est. ≤ ${EST_VALIDAR_MAX} con histórico > ${EST_VALIDAR_REF} t/ha</p>
    <div class="cifras c4">${cifra('Lotes', nf0.format(v.n))}${cifra('Área', conUnidad(nfHa.format(v.area), ' ha'))}${cifra('Aportan', conUnidad(signo(v.tonEsp, nfT), ' t'))}${v.dEspSin !== null ? cifra('Ganancia sin ellos', conUnidad(signo(v.dEspSin), ' t/ha'), 'c-est') : ''}</div>
    <div class="lista-lotes">${orden.map(filaRenovHtml).join('')}</div>`, 'alta');
}
function verRenovacionMapa() {
  mostrarTab('mapa'); cerrarCard(); soltarSeguimiento();
  setColorear('renovacion'); temaFiltro = 'Renovar'; capaLotes.setStyle(estiloFeat); pintarLeyenda();
  let bb = null; // encuadra todos los lotes a renovar
  Object.values(LOTES).forEach(l => { if (l.renovar && l.bbox) bb = bb ? [Math.min(bb[0], l.bbox[0]), Math.min(bb[1], l.bbox[1]), Math.max(bb[2], l.bbox[2]), Math.max(bb[3], l.bbox[3])] : l.bbox.slice(); });
  if (bb) map.fitBounds(boundsDe(bb), margenes(90, 40));
}
function abrirRenovZona(zona) {
  const r = resumenRenovacion(), f = r.filas.find(x => x.zona === zona); if (!f) return;
  const orden = f.lotes.slice().sort((a, b) => (deltaEsperado(b) ?? -1e9) * (b.areaAforo || 0) - (deltaEsperado(a) ?? -1e9) * (a.areaAforo || 0));
  const val = f.lotes.filter(estValidar), vArea = val.reduce((s, l) => s + (l.areaAforo || 0), 0), vTon = val.reduce((s, l) => s + (deltaEsperado(l) || 0) * (l.areaAforo || 0), 0);
  const vz = {n: val.length, area: vArea, tonEsp: vTon, dEspSin: f.plant !== null && f.area - vArea > 0 ? (f.tonEsp - vTon) / (f.area - vArea) : null};
  abrirHoja(`Renovación · ${zona}`, `
    <div class="cifras c4">${cifra('Lotes', nf0.format(f.n))}${cifra('Área', conUnidad(nfHa.format(f.area), ' ha'))}${cifra('TCH estimado 26/27', nfTch.format(f.est))}${f.dEsp === null ? cifraNd('Ganancia esperada', 'Sin dato', 'sin plantillas en la zona', 'c-est') : cifra('Ganancia esperada', conUnidad(signo(f.dEsp), ' t/ha'), 'c-est')}</div>
    ${avisoValidar(vz, true)}
    <p class="pie">Plantillas ${f.plant === null ? '—' : nfTch.format(f.plant)} · Máx. ${f.max === null ? '—' : nfTch.format(f.max)} t/ha</p>
    <div class="lista-lotes">${orden.map(filaRenovHtml).join('')}</div>`, 'alta');
}
function filasAforo(filas) {
  return filas.map(x => `<tr ${aforoGrupo === 'hacienda' ? `data-finca="${esc(x.key)}" tabindex="0" role="button"` : ''}><td>${esc(x.key)}</td><td>${nfHa.format(x.area_ha)}</td><td>${nfT.format(x.toneladas)}</td><td><b>${x.area_ha ? nfTch.format(x.tch_ponderado) : '<small title="Sin área de molienda">sin área</small>'}</b></td><td>${x.area_ha ? nfTch.format(x.tch_opt_ponderado) : '<small title="Sin área de molienda">sin área</small>'}</td></tr>`).join('') || '<tr><td colspan="5">Sin coincidencias en esta agrupación.</td></tr>';
}
/* Búsqueda dentro del resumen: fincas/productores con sus totales y lotes con su aforo. También filtra la tabla. */
function buscarAforo(q) {
  const t = sinTildes(q).trim(), res = $('aforoRes'), todas = (RESUMEN.resumen || {})[aforoGrupo] || [];
  $('aforoFilas').innerHTML = filasAforo(t ? todas.filter(x => sinTildes(x.key).includes(t)) : aforoTodas ? todas : todas.slice(0, AFORO_TOP));
  const mas = $('aforoMas'); if (mas) mas.hidden = !!t; // buscando, la tabla muestra todas las coincidencias
  if (!t) { res.innerHTML = ''; return; }
  const fincas = ((RESUMEN.resumen || {}).hacienda || []).filter(x => sinTildes(x.key).includes(t)).slice(0, 6);
  const lotes = Object.values(LOTES).filter(l => l.cod.startsWith(t)).sort((a, b) => a.cod.length - b.cod.length || a.cod.localeCompare(b.cod, 'es', {numeric: true})).slice(0, 8);
  res.innerHTML = fincas.map(x => `<button type="button" data-finca="${esc(x.key)}"><b>${ico('home')}</b><span><strong>${esc(x.key)}</strong><br>${nfHa.format(x.area_ha)} ha de molienda · ${nfT.format(x.toneladas)} t · ${x.area_ha ? `TCH estimado ${nfTch.format(x.tch_ponderado)} · TCH optimista ${nfTch.format(x.tch_opt_ponderado)}` : 'sin área de molienda'}</span></button>`).join('') +
    lotes.map(l => `<button type="button" data-lote="${esc(l.cod)}"><b>${esc(l.cod)}</b><span>${esc(l.hac)}<br>${resumenTchLote(l)}${l.conAforo && l.tchOpt > 0 ? ` · optimista ${nfTch.format(l.tchOpt)}` : ''}${l.tonEst > 0 ? ` · ${nfT.format(l.tonEst)} t` : ''}</span></button>`).join('') ||
    '<p class="vacio">Sin coincidencias. Pruebe con el código del lote o parte del nombre.</p>';
}
async function revisarDatos() { buscarActualizacion(await dataCache(), META, true); }
async function borrarMapas() { try { await caches.delete('casur-tiles-v1'); toast('Mapas base guardados borrados.'); renderAjustes(); } catch (_) {} }
async function instalarApp() { if (!instalarEvt) return; instalarEvt.prompt(); await instalarEvt.userChoice.catch(() => null); instalarEvt = null; if (document.body.dataset.tab === 'ajustes') renderAjustes(); }
const appInstalada = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let _avisoInst = false;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); instalarEvt = e; avisarInstalacion(); });
window.addEventListener('appinstalled', () => { instalarEvt = null; toast('CASUR Maps quedó instalada.', {tipo: 'bien'}); });
/* Al abrir sin estar instalada: invita a instalar. En iPhone no hay instalación directa y se indican los pasos. */
function avisarInstalacion() {
  if (_avisoInst || appInstalada() || !$('loader').hidden) return;
  /* No tapa una tarjeta, una hoja ni otro aviso (p. ej. «Capa: … Deshacer»): espera a que el usuario termine. */
  if (document.body.classList.contains('con-card') || $('hoja').classList.contains('abierta') || document.querySelector('#toasts .toast')) { setTimeout(avisarInstalacion, 6000); return; }
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
    construirLotes(d.geo, d.metricas, d.cortes, d.renov); construirIndice();
    initMap(); bindBusqueda();
    $('btnGps').addEventListener('click', gpsBoton); $('btnBrujula').addEventListener('click', alternarOrientacion); aplicarGiroCss(); pintarBrujula(); $('btnCapas').addEventListener('click', abrirCapas); $('chipGps').addEventListener('click', abrirGps);
    $('hojaX').addEventListener('click', () => pedirCerrarHoja()); $('hojaFondo').addEventListener('click', e => { if (!hojaRecien(e)) pedirCerrarHoja(); });
    $('hojaBody').addEventListener('click', e => { if (hojaRecien(e)) { e.stopPropagation(); e.preventDefault(); } }, true); // segundo toque de un doble toque
    $('nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) mostrarTab(b.dataset.tab); });
    $('medirDeshacer').addEventListener('click', medirDeshacer); $('medirFin').addEventListener('click', medirCerrar); $('medirCompartir').addEventListener('click', medirCompartir);
    document.addEventListener('keydown', e => { // Escape (tableta o escritorio): diálogo, sugerencias, hoja y luego la tarjeta
      if (e.key !== 'Escape') return;
      if (cerrarPregunta(false)) return;
      if ($('sugerencias').classList.contains('abierta')) { cerrarSugerencias(); return; }
      if ($('hoja').classList.contains('abierta')) { pedirCerrarHoja(); return; }
      if (document.body.dataset.tab === 'mapa' && selCod && !$('card').classList.contains('oculta')) { if (cardFull) { cardFull = false; renderCard(); } else cerrarCard(true); }
    });
    pintarGpsBtn(); pintarLista(); actualizarRed(); pintarInsignia(); pintarRegistros();
    $('btnPanorama').addEventListener('click', alternarPanorama);
    $('loader').hidden = true; map.invalidateSize();
    await cargarVisitas(); await cargarVuelos();
    const lote = new URLSearchParams(location.search).get('lote'), conEnlace = lote && LOTES[codKey(lote)];
    if (conEnlace) seleccionarLote(lote, {zoom: true});
    // Tras aplicar una actualización: vuelve a la pestaña (o al lote) donde estaba y confirma la versión.
    const tras = conEnlace ? null : avisoTrasActualizar(), quieto = conEnlace || (tras && tras.cod);
    let verVista = ''; try { verVista = localStorage.getItem('casur_ver_vista') || ''; localStorage.setItem('casur_ver_vista', APP_VERSION); } catch (_) {}
    if (verVista && verVista !== APP_VERSION) setTimeout(() => toast(`CASUR Maps se actualizó a ${APP_VERSION}.`, {tipo: 'bien', accion: 'Novedades', ms: 9000, alAccion: abrirNovedades}), tras ? 6500 : 1200);
    iniciarHistorial();
    // GPS automático al abrir, con seguimiento. Si se abrió con un enlace a un lote (o se volvió a uno), no se mueve el mapa de ese lote.
    // Con una visita en curso el GPS se reactiva siempre, aunque el GPS automático esté apagado en Ajustes.
    if (S.gpsAuto || VISITA) iniciarGps(!quieto, true);
    registrarSW();
    setTimeout(avisarInstalacion, 1500);
    // El tablero ya no se abre solo (salvo que se active en Ajustes); queda en Resumen > Tablero de hoy.
    if (S.tableroAbrir && !conEnlace && !tras) setTimeout(() => abrirTablero(false), 700);
    else if (!tras) { const venc = Object.values(LOTES).filter(corteVencido).length; if (venc) toast(`${venc} lote(s) con fecha de corte vencida. Actualice el programa o cargue los cortes.`, {tipo: 'mal', accion: 'Ver', ms: 12000, alAccion: () => { mostrarTab('mapa'); setColorear('semana'); }}); }
    // Histórico: desde la copia local (o la red la primera vez) completa los lotes a los que les falta el TCH de la
    // zafra anterior o el promedio histórico, y vuelve a pintar lo que esté a la vista con los estados ya corregidos.
    setTimeout(() => cargarHistorico().then(refrescarTrasHistorico).catch(() => {}), 1500);
    setTimeout(borrarFotosPendientes, 2500); // fotos de registros borrados justo antes de cerrar la app
  } catch (e) {
    console.error(e);
    setLoader('No se pudieron abrir los datos: ' + (e.message || e) + '. Conéctese una vez a internet y vuelva a abrir.');
  }
}
/* ── Actualización de la app ──
   La app abre desde su copia local. Cuando hay versión nueva:
   · si se detecta al abrir (primeros 20 s, antes del primer toque y sin lote abierto), se recarga sola;
   · si no, se avisa con «Actualización lista · Aplicar», para no interrumpir un registro, una visita ni el lote en pantalla;
   · tras recargar se vuelve a la misma pestaña (o lote) y se confirma la versión (avisoTrasActualizar en core.js);
   · se vuelve a revisar cada vez que la app regresa a primer plano, y hay un botón manual en Resumen. */
const _abiertaEn = Date.now();
let _swReg = null, _swRevisado = 0;
/* «Ocupado» = hay algo que una recarga borraría: hoja, registro, medición, otra pestaña, la tarjeta de un lote,
   texto en el buscador o cualquier toque del usuario desde que abrió. Entonces no se recarga sola: se ofrece «Aplicar». */
let _interactuo = false;
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { _interactuo = true; }, {once: true, capture: true, passive: true}));
function ocupado() {
  return _interactuo || $('hoja').classList.contains('abierta') || !!reg || !!medir.modo || document.body.dataset.tab !== 'mapa' ||
    !$('card').classList.contains('oculta') || !!$('q').value.trim();
}
function recargaSegura() { // evita ciclos: como mucho una recarga automática por minuto
  try { const u = Number(sessionStorage.getItem('casur_recarga') || 0); if (Date.now() - u < 60000) return false; sessionStorage.setItem('casur_recarga', String(Date.now())); } catch (_) {}
  recargarApp(); return true;
}
function registrarSW() {
  if (!('serviceWorker' in navigator) || !(location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) return;
  const habia = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./service-worker.js').then(r => { _swReg = r; }).catch(e => console.warn('SW', e));
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habia) return;
    if (Date.now() - _abiertaEn < 20000 && !ocupado() && recargaSegura()) return;
    avisoActualizacion();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !_swReg || !navigator.onLine || Date.now() - _swRevisado < 300000) return;
    _swRevisado = Date.now(); _swReg.update().catch(() => {});
  });
}
/* Botón manual: descarga la versión publicada aunque el teléfono tenga guardada una anterior. No toca registros, fotos ni visitas. */
async function actualizarApp() {
  if (!navigator.onLine) { toast('Sin señal: conéctese para buscar la versión nueva.', {tipo: 'mal'}); return; }
  const aviso = toast('Buscando la versión nueva…', {fijo: true});
  try {
    if (_swReg) await _swReg.update().catch(() => {});
    const claves = await caches.keys();
    await Promise.all(claves.filter(k => k.startsWith('casur-maps-shell-')).map(k => caches.delete(k)));
  } catch (_) {}
  aviso && aviso.remove();
  try { sessionStorage.setItem('casur_recarga', String(Date.now())); } catch (_) {}
  recargarApp();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar, {once: true}); else iniciar();

/* Novedades de la versión, en lenguaje sencillo (se muestran al actualizar y desde Ajustes). */
const NOVEDADES = [
  ['Modo vuelo', 'Para helicóptero: altura, velocidad, rumbo y el lote debajo; mapa que se adelanta al rumbo. Active «Preparar vuelo» antes de despegar. Graba el recorrido, marca lotes desde el aire y al aterrizar da el resumen.'],
  ['Leyenda más clara', '«Sin dato» se separa en «Fuera de molienda» (Semilla, Sin caña…) y la falta real de dato; los % suman 100 % sobre molienda.'],
  ['Resumen por bloques', 'Panorama, Zafra, Fincas y Renovación en pestañas: cada vista cabe en pantalla, sin tanto desplazamiento.'],
  ['Resumen ejecutivo', '«Cómo vamos»: toneladas, TCH frente a 25/26, avance de zafra por mes y ranking por zona y finca.'],
  ['Ver en el mapa', 'Lotes TCH < 40, corte de la próxima semana, lotes a renovar y fechas vencidas, con lista y CSV.'],
  ['Tarjeta del lote', 'Semáforo Bien / Atención / Crítico y franja con toneladas, cambio frente a 25/26 y días al corte.'],
  ['Capas más rápidas', 'Cambie de capa desde la leyenda; el botón ⇄ vuelve a la anterior.'],
  ['Finca en el mapa', 'Al ver una finca, sus lotes quedan resaltados con su resumen; la ✕ del aviso lo quita.'],
  ['Tableta', 'Barra lateral y Resumen a dos columnas en el iPad horizontal.'],
  ['Campo', 'Visita «Grabando», cumplimiento al cerrar, filtros en la Bitácora y medición para compartir.']];
function abrirNovedades() {
  abrirHoja(`Novedades · ${APP_VERSION}`, `<div class="novedades">${NOVEDADES.map(n => `<div><b>${esc(n[0])}</b><span>${esc(n[1])}</span></div>`).join('')}</div>
    <button type="button" class="btn pri ancho" onclick="cerrarHoja()">Entendido</button>`);
}
/* ── Resumen ejecutivo: cómo vamos frente a 25/26, avance de zafra, ranking y preguntas rápidas ── */
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const pond = (ls, f) => { let a = 0, s = 0; ls.forEach(l => { const v = f(l), ar = l.areaAforo || 0; if (v > 0 && ar > 0) { a += ar; s += v * ar; } }); return a ? s / a : null; };
function datosEjecutivo() {
  const mol = Object.values(LOTES).filter(l => esMolienda(l) && l.conAforo && l.tchEst > 0 && (l.areaAforo || 0) > 0);
  const area = mol.reduce((s, l) => s + l.areaAforo, 0), ton = mol.reduce((s, l) => s + (l.tonEst || l.tchEst * l.areaAforo), 0);
  const comp = mol.filter(l => l.tchPrev > 0), aC = comp.reduce((s, l) => s + l.areaAforo, 0);
  const est = pond(comp, l => l.tchEst), prev = pond(comp, l => l.tchPrev);
  // Avance: por mes de cosecha programada; cosechado = corte de la zafra en curso ya cargado.
  const hoy = hoyLocal(), meses = new Map(); let aCos = 0, tCosReal = 0, aCosReal = 0, aProgHoy = 0, sinFecha = 0;
  mol.forEach(l => {
    if (l.cosechado) { aCos += l.areaAforo; if (l.tchAnt > 0) { aCosReal += l.areaAforo; tCosReal += l.tchAnt * l.areaAforo; } }
    const d = parseISO(l.fProg); if (!d) { if (!l.cosechado) sinFecha += l.areaAforo; return; }
    if (d <= hoy) aProgHoy += l.areaAforo;
    const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), m = meses.get(k) || {k, mes: d.getMonth(), anio: d.getFullYear(), area: 0, ton: 0, cos: 0};
    m.area += l.areaAforo; m.ton += l.tonEst || 0; if (l.cosechado) m.cos += l.areaAforo; meses.set(k, m);
  });
  const prox = new Set(SEMANAS_PROX.map(w => w.clave)), lProx = mol.filter(l => !l.cosechado && l.semProg && prox.has(l.semProg.clave));
  const grupo = key => { const g = new Map(); mol.forEach(l => { const k = l[key] || 'Sin dato'; (g.get(k) || g.set(k, []).get(k)).push(l); });
    return [...g].map(([k, ls]) => ({k, n: ls.length, area: ls.reduce((s, l) => s + l.areaAforo, 0), ton: ls.reduce((s, l) => s + (l.tonEst || 0), 0), est: pond(ls, l => l.tchEst), prev: pond(ls.filter(l => l.tchPrev > 0), l => l.tchPrev), val: ls.filter(estValidar).length})); };
  return {mol, area, ton, tch: area ? ton / area : null, comp, aC, est, prev, aCos, aCosReal, tCosReal, aProgHoy, sinFecha,
    meses: [...meses.values()].sort((a, b) => a.k.localeCompare(b.k)), mesHoy: hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0'),
    lProx, aProx: lProx.reduce((s, l) => s + l.areaAforo, 0), tProx: lProx.reduce((s, l) => s + (l.tonEst || 0), 0),
    zonas: grupo('zona').filter(z => z.k !== 'Sin dato').sort((a, b) => b.est - a.est), fincas: grupo('hac').filter(f => f.area >= 30)};
}
const deltaHtml = (d, base, u = ' t/ha') => d === null || base === null ? '' : `<b class="delta ${d > 0.05 ? 'sube' : d < -0.05 ? 'baja' : ''}">${signo(d)}${u} (${signo(d / base * 100, nf0)} %)</b>`;
function ejecutivoPartes() {
  const e = datosEjecutivo(); if (!e.mol.length) return {panorama: '', zafra: '', ranking: ''};
  const g = (RESUMEN.resumen || {}).global || {};
  const d = e.est !== null && e.prev !== null ? e.est - e.prev : null, maxT = Math.max(e.est || 0, e.prev || 0, 1);
  const pctCos = e.area ? e.aCos / e.area * 100 : 0, pctProg = e.area ? e.aProgHoy / e.area * 100 : 0;
  const maxMes = Math.max(...e.meses.map(m => m.area), 1);
  const maxZ = Math.max(...e.zonas.map(z => Math.max(z.est || 0, z.prev || 0)), 1);
  const rankFila = (x, max, onclick) => `<button type="button" class="rank-fila" onclick="${onclick}"><span class="rank-nom">${esc(rotulo(x.k))}<small>${nf0.format(x.area)} ha · ${nfT.format(x.ton)} t${x.val ? ` · <span class="rank-val-aviso">${ico('alert')} ${x.val} a validar</span>` : ''}</small></span><span class="rank-barra"><i style="width:${(x.est / max * 100).toFixed(1)}%"></i>${x.prev ? `<s style="left:${(x.prev / max * 100).toFixed(1)}%" title="25/26: ${nfTch.format(x.prev)} t/ha"></s>` : ''}</span><span class="rank-val">${nfTch.format(x.est)}${x.prev ? `<small class="${x.est - x.prev > 0.05 ? 'sube' : x.est - x.prev < -0.05 ? 'baja' : ''}">${signo(x.est - x.prev)}</small>` : ''}</span></button>`;
  const fs = e.fincas.slice().sort((a, b) => b.est - a.est), maxF = Math.max(...fs.map(f => Math.max(f.est || 0, f.prev || 0)), 1);
  const fincaFila = f => rankFila(f, maxF, `abrirFinca('${esc(f.k).replace(/'/g, '&#39;')}')`);
  const todos = Object.values(LOTES).filter(l => l.nPoly), w0 = SEMANAS_PROX[0];
  const preg = [
    ['bajo40', ico('alert'), 'Lotes TCH < 40', todos.filter(l => esMolienda(l) && l.tchEst > 0 && l.tchEst < 40).length],
    ['prox', ico('calendar'), 'Corte de la próxima semana', w0 ? todos.filter(l => !l.cosechado && l.semProg && l.semProg.clave === w0.clave).length : 0],
    ['renov', ico('sprout'), 'Lotes a renovar', todos.filter(l => l.renovar === true).length],
    ['vencidos', ico('clock'), 'Lotes con fecha vencida de corte', todos.filter(corteVencido).length]];
  const kpi = `<div class="cifras c4 kpi-pan">${cifra('Toneladas estimadas', conUnidad(nfT.format(g.toneladas || e.ton), ' t'))}${cifra('TCH estimado 26/27', fmtTch(g.tch_ponderado || e.tch), 'c-est', d !== null ? `<small class="kpi-d ${d > 0.05 ? 'sube' : d < -0.05 ? 'baja' : ''}">${signo(d)} vs 25/26</small>` : '')}${cifra('Área molienda', conUnidad(nfHa.format(g.area_ha || e.area), ' ha'))}${cifra('Cosechado', nf0.format(pctCos) + ' %', '', `<small class="kpi-d">${nfHa.format(e.aCos)} ha</small>`)}</div>`;
  return {
    panorama: `<section class="ejec" aria-labelledby="ejecTit"><h2 id="ejecTit">Cómo vamos · zafra 26/27</h2>
    ${kpi}
    <h3>Ver en el mapa</h3>
    <div class="preguntas">${preg.map(p => `<button type="button" onclick="preguntaRapida('${p[0]}')">${p[1]}<span>${p[2]}</span><b class="cuenta${p[3] ? '' : ' cero'}">${nf0.format(p[3])}</b>${ico('chevRight')}</button>`).join('')}</div>
  </section>`,
    zafra: `<section class="ejec"><h2>Zafra 26/27</h2>
    <h3>Avance de cosecha</h3>
    <div class="avance" role="img" aria-label="Cosechado ${nf0.format(pctCos)} %; programado a hoy ${nf0.format(pctProg)} %"><i class="prog" style="width:${Math.min(100, pctProg).toFixed(1)}%"></i><i class="cos" style="width:${Math.min(100, pctCos).toFixed(1)}%"></i></div>
    <p class="avance-txt"><b>${nf0.format(pctCos)} % cosechado</b> (${nfHa.format(e.aCos)} de ${nfHa.format(e.area)} ha)${e.aProgHoy > e.aCos ? ` · programado a hoy: ${nf0.format(pctProg)} %` : ''}${e.aCosReal ? ` · TCH real cosechado ${nfTch.format(e.tCosReal / e.aCosReal)} t/ha` : ''}</p>
    ${e.meses.length ? `<div class="meses">${e.meses.map(m => `<div class="${m.k === e.mesHoy ? 'hoy' : m.k < e.mesHoy ? 'pasado' : ''}" title="${nfHa.format(m.area)} ha · ${nfT.format(m.ton)} t"><em>${nf0.format(m.area)}</em><span><i style="height:${(m.area / maxMes * 100).toFixed(1)}%"></i>${m.cos ? `<i class="cos" style="height:${(m.cos / maxMes * 100).toFixed(1)}%"></i>` : ''}</span><b>${MES_CORTO[m.mes]}</b></div>`).join('')}</div>
    ${e.sinFecha ? `<p class="pie">${nfHa.format(e.sinFecha)} ha sin fecha</p>` : ''}` : ''}
    ${SEMANAS_PROX.map((w, i) => { const ls = e.lProx.filter(l => l.semProg.clave === w.clave); return ls.length ? `<button type="button" class="btn sec ancho sem-btn" onclick="preguntaRapida('prox', ${i})">${ico('calendar')} <span>Sem. ${w.sem} · ${rangoSemana(w)}: <b>${nf0.format(ls.length)} lotes</b> · ${nfHa.format(ls.reduce((s, l) => s + l.areaAforo, 0))} ha · ${nfT.format(ls.reduce((s, l) => s + (l.tonEst || 0), 0))} t</span></button>` : ''; }).join('')}
    <button type="button" class="btn sec ancho" onclick="abrirTablero(true)">${ico('board')} Tablero de hoy</button>
  </section>`,
    ranking: `<section class="ejec"><h2>Zonas y fincas</h2><h3>TCH 26/27 vs 25/26</h3>
    ${d !== null ? `<div class="comp" role="img" aria-label="TCH 25/26 ${nfTch.format(e.prev)} t/ha; TCH estimado 26/27 ${nfTch.format(e.est)} t/ha">
      <div><span>Zafra 25/26</span><i style="width:${(e.prev / maxT * 100).toFixed(1)}%"></i><b>${nfTch.format(e.prev)}</b></div>
      <div class="est"><span>Estimado 26/27</span><i style="width:${(e.est / maxT * 100).toFixed(1)}%"></i><b>${nfTch.format(e.est)}</b></div></div>
` : ''}
    <h3 class="h-ley">TCH por zona <span><i></i>26/27 <s></s>25/26</span></h3>
    <div class="rank">${e.zonas.map(z => rankFila(z, maxZ, `verZonaMapa('${esc(z.k).replace(/'/g, '&#39;')}')`)).join('')}</div>
    <h3>Fincas: mayor y menor TCH <small>(≥ 30 ha)</small></h3>
    <div class="rank">${fs.slice(0, 5).map(fincaFila).join('')}</div>
    <div class="rank menor">${fs.slice(-5).reverse().map(fincaFila).join('')}</div>
  </section>`};
}
/* Pregunta rápida: pone la capa, filtra la clase, encuadra esos lotes en el mapa y ofrece la lista. */
function preguntaRapida(q, sem = 0) {
  const P = {bajo40: ['tchEst', '< 40', 'No hay lotes con TCH estimado bajo 40 t/ha.'], renov: ['renovacion', 'Renovar', 'No hay lotes propuestos para renovar.'],
    vencidos: ['semana', 'Fecha vencida', 'No hay cortes vencidos: todas las fechas programadas están al día.'], prox: ['semana', null, 'No hay cortes programados en las próximas semanas.']}[q]; if (!P) return;
  cerrarHoja(); mostrarTab('mapa'); setColorear(P[0]);
  if (q === 'prox') { const a = temaLeyenda.filter(x => /^Sem\./.test(x.txt))[sem]; filtrarClase(a ? a.txt : null); }
  else filtrarClase(temaLeyenda.some(x => x.txt === P[1]) ? P[1] : null);
  if (temaFiltro === null) { toast(P[2], {tipo: 'bien'}); return; }
  leyPlegar(true); encuadrarFiltro(); avisoFiltro();
}
function verZonaMapa(zona) { cerrarHoja(); mostrarTab('mapa'); setColorear('zona'); filtrarClase(temaLeyenda.some(x => x.txt === zona) ? zona : null); leyPlegar(true); encuadrarFiltro(); avisoFiltro(); }
/* ── Lotes de la clase filtrada en la leyenda: encuadrar, lista y CSV ── */
function lotesFiltro() {
  if (temaFiltro === null) return [];
  const T = TEMAS[S.colorear] || {}, sin = T.sin || 'Sin dato';
  return Object.values(LOTES).filter(l => l.nPoly && (temaClase.get(l.cod) || sin) === temaFiltro);
}
function encuadrarFiltro() {
  const ls = lotesFiltro().filter(l => l.bbox); if (!ls.length) return;
  const bb = ls.reduce((b, l) => [Math.min(b[0], l.bbox[0]), Math.min(b[1], l.bbox[1]), Math.max(b[2], l.bbox[2]), Math.max(b[3], l.bbox[3])], ls[0].bbox.slice());
  soltarSeguimiento(); if (selCod) cerrarCard(); map.fitBounds(boundsDe(bb), margenes(90, 60));
}
function avisoFiltro() {
  const ls = lotesFiltro(); if (!ls.length) return;
  toast(`${rotulo(temaFiltro)}: ${nf0.format(ls.length)} ${ls.length === 1 ? 'lote' : 'lotes'} · ${nfHa.format(ls.reduce((s, l) => s + (l.areaShape || 0), 0))} ha`, {accion: 'Ver lista', ms: 7000, alAccion: verListaFiltro});
}
function ordenFiltro(ls) {
  const T = TEMAS[S.colorear] || {};
  if (temaFiltro === FUERA) return ls.slice().sort((a, b) => String(a.clas).localeCompare(String(b.clas), 'es') || a.hac.localeCompare(b.hac, 'es') || a.cod.localeCompare(b.cod, 'es', {numeric: true}));
  return T.val ? ls.slice().sort((a, b) => (T.val(a) ?? 1e9) - (T.val(b) ?? 1e9)) : ls.slice().sort((a, b) => (a.fProg || '9').localeCompare(b.fProg || '9') || a.hac.localeCompare(b.hac, 'es') || a.cod.localeCompare(b.cod, 'es', {numeric: true}));
}
function verListaFiltro() {
  const T = TEMAS[S.colorear] || {}, ls = ordenFiltro(lotesFiltro()); if (!ls.length) return;
  document.querySelectorAll('#toasts .toast:not(.fijo)').forEach(t => t.remove());
  const area = ls.reduce((s, l) => s + (l.areaShape || 0), 0), ton = ls.reduce((s, l) => s + (l.tonEst || 0), 0), tch = pond(ls.filter(esMolienda), l => l.tchEst);
  const fila = temaLeyenda.find(x => x.txt === temaFiltro) || {}, gris = !fila.color;
  abrirHoja(`${rotulo(temaFiltro)}${T.u && T.cortes && !gris ? ' ' + T.u : ''} · ${T.t}`, `
    ${gris ? `<div class="cifras c2">${cifra('Lotes', nf0.format(ls.length))}${cifra('Área', conUnidad(nfHa.format(area), ' ha'))}</div>${fila.det ? `<p class="pie">${esc(fila.det)}</p>` : ''}`
      : `<div class="cifras c4">${cifra('Lotes', nf0.format(ls.length))}${cifra('Área', conUnidad(nfHa.format(area), ' ha'))}${cifra('Toneladas est.', conUnidad(nfT.format(ton), ' t'))}${tch ? cifra('TCH estimado 26/27', nfTch.format(tch), 'c-est') : cifraNd('TCH estimado 26/27', 'Sin dato', '', 'c-est')}</div>`}
    <div class="acciones"><button type="button" class="btn sec" onclick="cerrarHoja();encuadrarFiltro()">${ico('zoomIn')} Ver en el mapa</button><button type="button" class="btn ter" onclick="csvFiltro()">${ico('download')} Exportar CSV</button></div>
    <div class="lista-lotes">${ls.map(l => `<div class="fila-ir"><button type="button" onclick="cerrarHoja();seleccionarLote('${esc(l.cod)}',{zoom:true})"><b>${esc(l.cod)}</b><span>${esc(l.hac)} · ${resumenTchLote(l)}${l.fProg && !l.cosechado ? ' · corte ' + fechaCorta(l.fProg) : ''}</span></button>${llegarHtml(l.cod)}</div>`).join('')}</div>`);
}
function csvFiltro() {
  const ls = ordenFiltro(lotesFiltro()), T = TEMAS[S.colorear] || {};
  const filas = ls.map(l => csvLinea([l.cod, l.hac, l.zona, l.variedad, rotulo(l.clas), nfTch.format(l.area || 0), l.tchPrev ?? '', l.tchEst ?? '', l.tonEst ?? '', l.fProg, rotulo(temaFiltro)]));
  const nom = `lotes_${(T.t || 'capa').replace(/[^\wáéíóúñ]+/gi, '_')}_${String(temaFiltro).replace(/[^\w]+/g, '_')}_${(d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'))(hoyLocal())}.csv`.replace(/_+/g, '_');
  descargarTexto(nom, '﻿' + [csvLinea(['lote', 'finca', 'zona', 'variedad', 'clasificacion', 'area_ha', 'tch_25_26', 'tch_estimado_26_27', 'toneladas_estimadas', 'fecha_cosecha_prog', 'clase']), ...filas].join('\n'), 'text/csv;charset=utf-8');
  toast(`CSV con ${nf0.format(ls.length)} lotes.`, {tipo: 'bien'});
}
