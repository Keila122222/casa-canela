import { createEngine, buildDataset, DIAS, DCORTO, MES, PLU, pd, wdOf, addD, fmtD, fmtLargo } from './engine.js';
import { EXTRA } from './demo-semana.js';

const API = 'https://jcbgjwnlvsruntcpgbac.supabase.co/functions/v1/casa-canela';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = (n, d = 0) => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d });
const N = (n, d = 0) => n.toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d });
const P = (n, d = 1) => (n * 100).toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %';
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 3000); };
const store = { get: k => { try { return localStorage.getItem(k) } catch { return null } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch { } } };
const fcCol = f => f <= 0.28 ? 'var(--ok)' : f <= 0.33 ? 'var(--warn)' : 'var(--bad)';
const MESL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
const hoyLima = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
const lunesDe = f => addD(f, -wdOf(f));
const rango = s => `${fmtD(s)} al ${fmtD(addD(s, 6))}`;
const uKg = i => i.um === 'ml' ? 'l' : 'kg';

let TOKEN = store.get('cc_token'), USER = null, RAW = null, E = null;
const ST = { day: 0, stock: {}, semP: null, semO: null, semC: null, semH: 'all', pm: 'sem', mes: null, aj: 0, inv: null };

async function api(path, opt = {}) {
  const r = await fetch(API + path, { ...opt, headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}), ...(opt.headers || {}) } });
  const b = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/login') { logout(true); throw new Error('Sesión vencida'); }
  if (!r.ok) throw new Error(b.error || 'Error ' + r.status);
  return b;
}

const VIEWS = [
  ['resumen', 'Resumen', ['admin']], ['ventas', 'Ventas', ['admin']], ['proyeccion', 'Proyección', ['admin']],
  ['produccion', 'Producción', ['admin', 'obrador']], ['inventario', 'Inventario', ['admin', 'compras']], ['compras', 'Compras', ['admin', 'compras']],
  ['costos', 'Costos', ['admin']], ['recetario', 'Recetario', ['admin', 'obrador', 'compras']], ['automatizaciones', 'Automatizaciones', ['admin']], ['marca', 'Marca', ['admin']]];
const allowed = () => VIEWS.filter(v => v[2].includes(USER.rol));
const ROL = { admin: 'Administración', obrador: 'Obrador', compras: 'Compras' };

// ---------- datos
async function loadData(msg = 'Cargando datos…') {
  $('#loading').textContent = msg; $('#loading').hidden = false;
  try {
    RAW = await api('/datos'); USER = RAW.usuario;
    const rows = { ...RAW, ventas: RAW.ventas.map(v => ({ fecha: v[0], local: v[1], canal: v[2], producto_id: v[3], unidades: v[4] })) };
    E = createEngine(buildDataset(rows));
    ST.stock = Object.fromEntries(E.IN.map(i => [i.id, i.stock]));
    setup();
  } finally { $('#loading').hidden = true; }
}
// semanas: históricas (Ventas) y de trabajo (2 pasadas + 4 futuras)
const nextMonday = () => addD(lunesDe(E.last()), 7);
const semanasTrabajo = () => [-14, -7, 0, 7, 14, 21].map(k => addD(nextMonday(), k));
const semanasHist = () => { const F = E.D.fechas, out = []; for (let s = lunesDe(F[0]) < F[0] ? addD(lunesDe(F[0]), 7) : F[0]; addD(s, 6) <= E.last(); s = addD(s, 7)) out.push(s); return out; };
const pjCache = new Map();
function projWeek(start) {
  const key = start + '|' + E.D.metodo + '|' + E.D.atipicos.map(a => a.activo !== false ? 1 : 0).join('');
  if (pjCache.has(key)) return pjCache.get(key);
  const idx = E.D.fechas.indexOf(start); const P = E.project([...Array(7)].map((_, i) => addD(start, i)), idx >= 0 ? idx : E.n());
  P.pasada = idx >= 0; pjCache.set(key, P); return P;
}
const recalc = () => pjCache.clear();
const semLabel = s => { const nm = nextMonday(); return (s === nm ? 'Próxima: ' : s < nm ? 'Pasada: ' : '') + rango(s); };

function setup() {
  $('#login').hidden = true; $('#app').hidden = false;
  $('#u-name').innerHTML = `<b>${esc(USER.nombre)}</b> · ${ROL[USER.rol]}`;
  $('#corte').textContent = E.n() ? 'Ventas hasta: ' + fmtD(E.last()) : 'Sin ventas cargadas';
  $('#nav').innerHTML = allowed().map((v, i) => `<a href="#${v[0]}" data-v="${v[0]}"><i>${i + 1}</i>${v[1]}</a>`).join('');
  const keep = (s, html) => { const v = $(s).value; $(s).innerHTML = html; if (v && [...$(s).options].some(o => o.value === v)) $(s).value = v; };
  const lOpts = '<option value="all">Todos</option>' + E.L.map((l, i) => `<option value="${i}">${esc(l)}</option>`).join('');
  const cOpts = '<option value="all">Todos</option>' + E.C.map((c, i) => `<option value="${i}">${esc(c)}</option>`).join('');
  ['#h-local', '#p-local'].forEach(s => keep(s, lOpts)); ['#h-canal', '#p-canal'].forEach(s => keep(s, cOpts));
  $('#a-local').innerHTML = '<option>Todos</option>' + E.L.map(l => `<option>${esc(l)}</option>`).join('');
  $('#a-fecha').min = E.D.fechas[0]; $('#a-fecha').max = E.last();
  keep('#h-prod', '<option value="all">Todos</option>' + E.PR.map((p, i) => `<option value="${i}">${esc(p.nombre)}</option>`).join(''));
  const sh = semanasHist(); keep('#h-sem', '<option value="all">Últimas 12 semanas</option>' + sh.slice().reverse().map(s => `<option value="${s}">Semana del ${rango(s)}</option>`).join(''));
  const sw = semanasTrabajo(); const opts = sw.map(s => `<option value="${s}">${semLabel(s)}</option>`).join('');
  ['#p-sem', '#o-sem', '#c-sem'].forEach(s => { keep(s, opts); if (!ST.init || !sw.includes($(s).value)) $(s).value = nextMonday(); }); ST.init = true;
  const m0 = E.last().slice(0, 7); const meses = [m0, addD(m0 + '-28', 7).slice(0, 7), addD(addD(m0 + '-28', 7).slice(0, 7) + '-28', 7).slice(0, 7)];
  keep('#p-mes', meses.map(m => `<option value="${m}">${MESL[+m.slice(5) - 1]} ${m.slice(0, 4)}</option>`).join(''));
  $('#o-seg').value = String(E.D.colchon); $('#o-seg').disabled = USER.rol !== 'admin';
  $('#p-met').value = E.D.metodo; $('#i-fecha').value = hoyLima();
  recalc(); show();
}

// ---------- gráficos
function drawBars(svg, weeks) {
  const draw = () => {
    const Wd = svg.clientWidth, Ht = svg.clientHeight; if (!Wd) return; const m = { l: 58, r: 10, t: 26, b: 38 };
    const mx = Math.max(...weeks.map(w => w.a + w.b)) * 1.12 || 1; const iw = Wd - m.l - m.r, ih = Ht - m.t - m.b, bw = iw / weeks.length;
    const y = v => m.t + ih - v / mx * ih; let s = '';
    const step = mx > 60000 ? 20000 : 10000; for (let v = 0; v <= mx; v += step) s += `<line x1="${m.l}" x2="${Wd - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--mute)">${Wd < 520 ? (v / 1000) + 'k' : N(v)}</text>`;
    weeks.forEach((w, i) => {
      const x = m.l + i * bw + bw * 0.14, ww = bw * 0.72, pj = w.proj, t = w.a + w.b;
      s += `<rect x="${x}" y="${y(w.a)}" width="${ww}" height="${ih - (y(w.a) - m.t)}" fill="${pj ? 'var(--miel)' : 'var(--cacao)'}" rx="2"><title>${esc(w.lab)} · Barranco ${S(w.a)}</title></rect>`;
      s += `<rect x="${x}" y="${y(t)}" width="${ww}" height="${y(w.a) - y(t)}" fill="${pj ? 'var(--miel)' : 'var(--canela)'}" opacity="${pj ? 0.6 : 1}" rx="2"><title>${esc(w.lab)} · San Isidro ${S(w.b)}</title></rect>`;
      if (Wd >= 600 || i % 2 === 0 || pj) s += `<text x="${x + ww / 2}" y="${y(t) - 6}" text-anchor="middle" font-size="${Wd < 700 ? 9.5 : 11}" font-weight="700" fill="var(--ink)">${(t / 1000).toFixed(1)}k</text>`;
      if (Wd >= 520 || i % 2 === 0) s += `<text x="${x + ww / 2}" y="${Ht - m.b + 16}" text-anchor="middle" font-size="11" fill="${pj ? 'var(--miel)' : 'var(--mute)'}" font-weight="${pj ? 700 : 400}">${w.lab}</text>`;
    });
    svg.innerHTML = s;
  };
  svg._draw = draw; draw(); if (!svg._ro) { svg._ro = new ResizeObserver(() => svg._draw()); svg._ro.observe(svg); }
}
function drawLine(svg, pts) {
  const draw = () => {
    const Wd = svg.clientWidth, Ht = svg.clientHeight; if (!Wd || pts.length < 2) return; const m = { l: 58, r: 12, t: 12, b: 34 };
    const raw = Math.max(...pts.map(p => p.v)) * 1.08 || 1; const mag = 10 ** Math.floor(Math.log10(raw / 4)); const stp = [1, 2, 2.5, 5, 10].map(x => x * mag).find(x => raw / x <= 5); const mx = Math.ceil(raw / stp) * stp;
    const iw = Wd - m.l - m.r, ih = Ht - m.t - m.b; const x = i => m.l + i * iw / (pts.length - 1), y = v => m.t + ih - v / mx * ih; let s = '';
    for (let t = 0; t <= Math.round(mx / stp); t++) { const v = stp * t; s += `<line x1="${m.l}" x2="${Wd - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--mute)">${N(v)}</text>`; }
    const short = pts.length <= 14; const every = Wd < 520 ? 4 : Wd < 800 ? 2 : 1; let wi = 0;
    pts.forEach((p, i) => { if (short || (wdOf(p.f) === 0 && (wi++ % every === 0))) s += `<text x="${x(i)}" y="${Ht - m.b + 16}" text-anchor="middle" font-size="11" fill="var(--mute)">${short ? DCORTO[wdOf(p.f)] + ' ' + pd(p.f).getUTCDate() : fmtD(p.f)}</text>`; });
    s += `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p.v).toFixed(1)).join('')}" fill="none" stroke="var(--canela)" stroke-width="2"/>`;
    pts.forEach((p, i) => { if (p.at || short) s += `<circle cx="${x(i)}" cy="${y(p.v)}" r="${p.at ? 5 : 3.5}" fill="${p.at ? 'var(--bad)' : 'var(--canela)'}"><title>${esc(fmtLargo(p.f) + ' · ' + N(p.v) + (p.at ? ' · ' + p.at : ''))}</title></circle>`; });
    svg.innerHTML = s;
  };
  svg._draw = draw; draw(); if (!svg._ro) { svg._ro = new ResizeObserver(() => svg._draw()); svg._ro.observe(svg); }
}
function drawDays(svg, days) { // barras diarias real vs proyectado
  const draw = () => {
    const Wd = svg.clientWidth, Ht = svg.clientHeight; if (!Wd) return; const m = { l: 52, r: 8, t: 12, b: 30 };
    const mx = Math.max(...days.map(d => d.v)) * 1.1 || 1; const iw = Wd - m.l - m.r, ih = Ht - m.t - m.b, bw = iw / days.length; const y = v => m.t + ih - v / mx * ih; let s = '';
    const stp = mx > 8000 ? 2000 : 1000; for (let v = 0; v <= mx; v += stp) s += `<line x1="${m.l}" x2="${Wd - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10.5" fill="var(--mute)">${(v / 1000) + 'k'}</text>`;
    days.forEach((d, i) => { const x = m.l + i * bw + bw * 0.12, w = bw * 0.76; s += `<rect x="${x}" y="${y(d.v)}" width="${w}" height="${ih - (y(d.v) - m.t)}" fill="${d.real ? 'var(--cacao)' : 'var(--miel)'}" rx="2"><title>${esc(fmtLargo(d.f) + ' · ' + S(d.v) + (d.real ? ' real' : ' proyectado'))}</title></rect>`;
      if (pd(d.f).getUTCDate() % (Wd < 600 ? 5 : 2) === 1) s += `<text x="${x + w / 2}" y="${Ht - m.b + 15}" text-anchor="middle" font-size="10.5" fill="var(--mute)">${pd(d.f).getUTCDate()}</text>`; });
    svg.innerHTML = s;
  };
  svg._draw = draw; draw(); if (!svg._ro) { svg._ro = new ResizeObserver(() => svg._draw()); svg._ro.observe(svg); }
}
const selL = v => v === 'all' ? E.allL : [+v], selC = v => v === 'all' ? E.allC : [+v];
const days7 = [0, 1, 2, 3, 4, 5, 6];
const weekSales = (P, ls = E.allL, cs = E.allC) => days7.reduce((s, d) => s + E.salesDay(P, d, ls, cs), 0);
const compraDe = P => E.purchases(E.needs(P, days7, E.D.colchon), ST.stock);
const kpiHTML = arr => arr.map(k => `<div class="card kpi" style="margin:0"><div class="lab">${k[0]}</div><div class="num" ${k[3] ? `style="font-size:${k[3]}"` : ''}>${k[1]}</div>${k[2] ? `<div class="sub">${k[2]}</div>` : ''}</div>`).join('');
const prodReal = () => RAW.produccion_real || [];

// ---------- alertas con plan de acción
function alertas(PJ) {
  const out = []; const plan = (rows) => `<table><tr><th>Qué hacer</th><th>Responsable</th><th>Plazo</th></tr>${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td style="white-space:nowrap">${r[2]}</td></tr>`).join('')}</table>`;
  // stock crítico (2 días)
  const cov = +(RAW.config.dias_cobertura || 2); const P2 = E.project([...Array(cov)].map((_, i) => addD(hoyLima(), i + 1)));
  const need2 = E.needs(P2, P2.dates.map((_, i) => i)); const crit = E.IN.filter(i => i.presCant > 0 && need2[i.id] > ST.stock[i.id]);
  if (crit.length) out.push(['bad', `Stock crítico: ${crit.length} insumos no alcanzan para los próximos ${cov} días`, `Entre ellos ${crit.slice(0, 4).map(i => esc(i.nombre)).join(', ')}${crit.length > 4 ? '…' : ''}. Sin ellos no se puede cumplir la orden de producción.`,
    plan([['Hacer pedido urgente de esos insumos (ver Compras)', 'Encargado de compras', 'Hoy'], ['Si el proveedor no llega, priorizar productos de mayor venta (rol de canela, croissants)', 'Jefe de obrador', 'Mañana temprano'], ['Hacer conteo físico y subir el inventario para confirmar el stock real', 'Compras', 'Esta semana']])]);
  // food cost alto
  E.PR.forEach((p, i) => { if (E.FC[i] > 0.33) { const pr = Math.ceil(E.PC[i] / 0.28 * 1.18 * 2) / 2; out.push(['bad', `Food cost alto: ${esc(p.nombre)} (${P(E.FC[i])})`, `Cuesta ${S(E.PC[i], 2)} y se vende a ${S(p.precio, 2)}. La meta de la casa es 28 % o menos.`,
    plan([[`Revisar gramaje real vs. receta con el barista (${Object.entries(p.bases).length ? 'receta base' : Object.entries(p.dir).filter(([x]) => E.INS[x].precioKg > 0).map(([x, q]) => q + ' ' + E.INS[x].um + ' de ' + E.INS[x].nombre.toLowerCase()).join(', ')})`, 'Jefe de barra', 'Esta semana'], [`Evaluar nuevo precio de ${S(pr, 2)}: el food cost bajaría a ${P(E.PC[i] / (pr / 1.18))}`, 'Gerencia', 'Próximo cambio de carta'], ['Pedir cotización a otro proveedor del insumo más caro', 'Compras', '15 días']])]); } });
  // cumplimiento y sobrante de la última semana registrada
  const pr = prodReal(); if (pr.length) {
    const ult = pr.reduce((a, r) => r.fecha > a ? r.fecha : a, pr[0].fecha); const s0 = lunesDe(ult); const sem = pr.filter(r => r.fecha >= s0 && r.fecha <= addD(s0, 6));
    const pl = sem.reduce((a, r) => a + r.planificado, 0), pdc = sem.reduce((a, r) => a + r.producido, 0);
    const bajo = E.PR.map((p, i) => { const rr = sem.filter(r => r.producto_id === p.id); const a = rr.reduce((x, r) => x + r.planificado, 0), b = rr.reduce((x, r) => x + r.producido, 0); return { p, c: a ? b / a : 1 } }).filter(o => o.c < 0.95).sort((a, b) => a.c - b.c);
    if (pl && pdc / pl < 0.98) out.push(['warn', `Cumplimiento de producción: ${P(pdc / pl)} (semana del ${rango(s0)})`, `Se produjo menos de lo ordenado en ${bajo.map(o => esc(o.p.nombre) + ' (' + P(o.c, 0) + ')').join(', ')}. Cada unidad no producida es una venta que se puede perder.`,
      plan([['Revisar con el jefe de obrador por qué no se completó (personal, insumos, equipo)', 'Administración', 'Lunes'], ['Si faltó insumo, revisar la alerta de stock crítico y el día de pedido', 'Compras', 'Esta semana'], ['Registrar la causa en la nota del registro de producción', 'Jefe de obrador', 'Cada día']])]);
    const sob = E.PR.map((p, i) => { const s = sem.filter(r => r.producto_id === p.id).reduce((a, r) => a + r.sobrante, 0); return { p, s, v: s * E.PC[i] } }).sort((a, b) => b.v - a.v);
    const tv = sob.reduce((a, o) => a + o.v, 0); if (tv > 0) out.push(['warn', `Sobrante al cierre: ${S(tv)} a costo en la semana`, `Lo que más sobró: ${sob.slice(0, 3).map(o => esc(o.p.nombre) + ' (' + N(o.s) + ' und, ' + S(o.v) + ')').join(', ')}.`,
      plan([[`Bajar el stock de seguridad de ${esc(sob[0].p.nombre)} o producirlo en dos tandas (mañana y tarde)`, 'Jefe de obrador', 'Próxima semana'], ['Vender el sobrante de tortas al día siguiente si su vida útil lo permite; lo de 1 día, ofrecerlo en combo al cierre', 'Encargado de local', 'Desde hoy'], ['Revisar si coincide con días atípicos no marcados', 'Administración', 'Esta semana']])]);
  }
  // día fuerte
  const peak = days7.map(d => ({ d, s: E.salesDay(PJ, d) })).sort((a, b) => b.s - a.s)[0];
  out.push(['warn', `Día más fuerte: ${fmtLargo(PJ.dates[peak.d])} con ${S(peak.s)}`, 'Es el día de mayor carga para el obrador y los locales.',
    plan([[`Reforzar el turno del obrador el ${fmtLargo(addD(PJ.dates[peak.d], -1))}, que es cuando se prepara`, 'Jefe de obrador', 'Al armar horarios'], ['Confirmar que los insumos lleguen al menos un día antes', 'Compras', 'Pedido del domingo'], ['Poner una persona extra en salón en Barranco (fin de semana)', 'Encargado de local', 'Esa semana']])]);
  // tendencias
  const tr = E.trends(); if (tr.length) {
    const up = tr[0], dn = tr[tr.length - 1];
    out.push(['ok', `Crece más: ${esc(up.p.nombre)} (${up.g >= 0 ? '+' : ''}${P(up.g)} en unidades)`, 'Comparación de las últimas 4 semanas contra las 4 anteriores. La proyección ya lo sube sola.',
      plan([['Asegurar los insumos de su receta para que no falte', 'Compras', 'Pedido del domingo'], ['Darle lugar visible en vitrina y redes', 'Marketing', 'Esta semana'], ['Evaluar si soporta un ajuste de precio', 'Gerencia', 'Fin de mes']])]);
    if (dn.g < 0) out.push(['bad', `Cae más: ${esc(dn.p.nombre)} (${P(dn.g)} en unidades)`, 'La proyección ya baja su producción, pero hay que decidir qué hacer con el producto.',
      plan([['Probar una promoción o combo por 2 semanas y medir', 'Marketing', '2 semanas'], ['Revisar receta, presentación o temporada (en verano baja lo caliente)', 'Jefe de barra', 'Esta semana'], ['Si sigue cayendo 4 semanas seguidas, evaluar sacarlo de la carta', 'Gerencia', 'Fin de mes']])]);
  }
  return out;
}

// ---------- Resumen
function rResumen() {
  const PJ = projWeek(nextMonday());
  const n = E.n(), nw = Math.floor(n / 7), k0 = n - nw * 7, weeks = [];
  for (let w = Math.max(0, nw - 12); w < nw; w++) { const s = k0 + w * 7; let a = 0, b = 0; for (let k = s; k < s + 7; k++) { a += E.realDay(k, [0]); b += E.realDay(k, [1]); } weeks.push({ a, b, lab: fmtD(E.D.fechas[s]) }); }
  const pa = weekSales(PJ, [0]), pb = weekSales(PJ, [1]); weeks.push({ a: pa, b: pb, lab: fmtD(PJ.dates[0]), proj: true });
  const last4 = weeks.slice(-5, -1).reduce((s, w) => s + w.a + w.b, 0) / 4, proj = pa + pb, dv = proj / last4 - 1;
  let units = 0; days7.forEach(d => E.production(PJ, d).prods.forEach(o => units += o.porc));
  const fc = E.fcOf(PJ), cp = compraDe(PJ);
  $('#r-title').textContent = 'Próxima semana: ' + rango(PJ.dates[0]);
  $('#r-sub').textContent = 'Calculado con las ventas hasta el ' + fmtLargo(E.last()) + '. Se actualiza solo cada noche cuando Make carga las ventas.';
  $('#r-kpis').innerHTML = kpiHTML([
    ['Venta proyectada', S(proj), `<span class="${dv >= 0 ? 'up' : 'dn'}">${dv >= 0 ? '+' : ''}${P(dv)}</span> vs. promedio de las últimas 4 semanas`],
    ['Unidades a producir', N(units), 'en el obrador, con ' + P(E.D.colchon, 0) + ' de stock de seguridad'],
    ['Compra estimada', S(cp.total), 'insumos de la semana, ya descontado el stock'],
    ['Food cost teórico', P(fc.fc), 'sobre la venta proyectada sin IGV']]);
  drawBars($('#r-chart svg'), weeks);
  $('#r-alerts').innerHTML = alertas(PJ).map(a => `<div class="al ${a[0]}"><h4>${a[1]}</h4><p>${a[2]}</p>${a[3]}</div>`).join('');
  const bt = E.backtest();
  $('#r-acc').innerHTML = bt ? `<h3>¿Qué tan bien proyectó la última semana (${rango(bt.dias[0].f)})?</h3><p class="note">Lo que el sistema habría proyectado con las ventas anteriores a esa semana, frente a lo que realmente se vendió.</p>
    <div class="grid g4" style="margin:10px 0">${[['Venta proyectada', S(bt.ps)], ['Venta real', S(bt.rs)], ['Diferencia en S/', (bt.dif >= 0 ? '+' : '') + P(bt.dif)], ['Precisión por producto', P(bt.precision)]].map(k => `<div class="kpi"><div class="lab">${k[0]}</div><div class="num" style="font-size:24px">${k[1]}</div></div>`).join('')}</div>
    <div class="scroll"><table><tr><th>Día</th><th class="n">Proyectado</th><th class="n">Real</th><th class="n">Diferencia</th></tr>${bt.dias.map(x => { const p = x.proj.reduce((s, u, pi) => s + u * E.PR[pi].precio, 0), r = x.real.reduce((s, u, pi) => s + u * E.PR[pi].precio, 0); return `<tr><td>${DCORTO[wdOf(x.f)]} ${fmtD(x.f)}</td><td class="n">${S(p)}</td><td class="n">${S(r)}</td><td class="n">${r ? P(p / r - 1) : '—'}</td></tr>` }).join('')}</table></div>
    <p class="note">Precisión por producto = 1 − (suma de errores absolutos en unidades ÷ unidades reales).</p>` : '<p class="note">Hace falta más historia para medir la precisión.</p>';
  const tops = E.PR.map((p, pi) => ({ p, u: days7.reduce((s, d) => s + E.uDay(PJ, d, pi), 0) })).map(o => ({ ...o, s: o.u * o.p.precio })).sort((a, b) => b.s - a.s).slice(0, 7);
  $('#r-top').innerHTML = '<tr><th>Producto</th><th class="n">Unidades</th><th class="n">Venta</th></tr>' + tops.map(o => `<tr><td>${esc(o.p.nombre)}</td><td class="n">${N(o.u)}</td><td class="n">${S(o.s)}</td></tr>`).join('');
}

// ---------- Ventas
function rVentas() {
  const ls = selL($('#h-local').value), cs = selC($('#h-canal').value), pr = $('#h-prod').value, med = $('#h-med').value, F = E.D.fechas, sem = $('#h-sem').value;
  const idx = sem === 'all' ? F.map((_, k) => k).slice(-84) : [...Array(7)].map((_, i) => F.indexOf(addD(sem, i))).filter(k => k >= 0);
  const pts = idx.map(k => { const f = F[k], at = E.D.atipicos.filter(a => a.activo !== false && a.fecha === f && ls.some(l => a.local === E.L[l] || a.local === 'Todos')); return { f, v: E.realDay(k, ls, cs, pr, med), at: at.map(a => a.local + ': ' + a.motivo).join('; ') } });
  const tot = pts.reduce((a, p) => a + p.v, 0), unid = idx.reduce((a, k) => a + E.realDay(k, ls, cs, pr, 'u'), 0), venta = idx.reduce((a, k) => a + E.realDay(k, ls, cs, pr, 's'), 0);
  const best = pts.slice().sort((a, b) => b.v - a.v)[0];
  $('#h-sub').textContent = sem === 'all' ? `Del ${fmtD(F[idx[0]])} al ${fmtD(F[idx[idx.length - 1]])}. Elige una semana para ver el detalle por producto.` : `Semana del ${rango(sem)}.`;
  $('#h-kpis').innerHTML = kpiHTML([['Venta', S(venta)], ['Unidades', N(unid)], ['Precio promedio por unidad', S(unid ? venta / unid : 0, 2)], ['Mejor día', fmtLargo(best.f), med === 'u' ? N(best.v) + ' und' : S(best.v), '20px']]);
  $('#h-ctitle').textContent = (med === 'u' ? 'Unidades vendidas por día' : 'Venta diaria (S/)');
  drawLine($('#h-chart svg'), pts);
  if (sem === 'all') {
    const n = F.length, nw = Math.floor(n / 7), k00 = n - nw * 7; let mx = 0; const M = [];
    for (let w = Math.max(0, nw - 12); w < nw; w++) { const r = []; for (let d = 0; d < 7; d++) { const k = k00 + w * 7 + d; r.push({ k, v: E.realDay(k, ls, cs, pr, med) }); mx = Math.max(mx, r[d].v); } M.push(r); }
    $('#h-ttitle').textContent = 'Semana por día: el patrón que usa la proyección'; $('#h-tnote').textContent = 'Cada fila es una semana. Leyendo una columna de arriba abajo se ven los mismos días de la semana, que son los que el sistema promedia. Más oscuro = más venta; el borde rojo marca un día atípico.';
    $('#h-heat').innerHTML = '<tr><th>Semana</th>' + DCORTO.map(d => `<th class="n">${d}</th>`).join('') + '<th class="n">Total</th></tr>' + M.map(r => `<tr><td style="white-space:nowrap">${rango(F[r[0].k])}</td>` + r.map(c => { const at = ls.some(l => E.isAtip(F[c.k], l)); return `<td class="n" style="background:color-mix(in srgb,var(--canela) ${Math.round(c.v / (mx || 1) * 55)}%,transparent);${at ? 'outline:2px solid var(--bad);outline-offset:-2px' : ''}" title="${at ? 'Día atípico' : ''}">${N(c.v)}</td>` }).join('') + `<td class="n"><b>${N(r.reduce((a, c) => a + c.v, 0))}</b></td></tr>`).join('');
  } else {
    $('#h-ttitle').textContent = 'Detalle por producto'; $('#h-tnote').textContent = med === 'u' ? 'Unidades vendidas por día.' : 'Venta en soles por día.';
    let cat = '', rows = '<tr><th>Producto</th>' + idx.map(k => `<th class="n">${DCORTO[wdOf(F[k])]} ${pd(F[k]).getUTCDate()}</th>`).join('') + '<th class="n">Semana</th></tr>'; const T = idx.map(() => 0); let TT = 0;
    E.PR.forEach((p, pi) => { if (pr !== 'all' && +pr !== pi) return; if (p.cat !== cat) { cat = p.cat; rows += `<tr class="grp"><td colspan="${idx.length + 2}">${esc(cat)}</td></tr>`; }
      const v = idx.map(k => E.realDay(k, ls, cs, pi, med)); const s = v.reduce((a, b) => a + b, 0); v.forEach((x, i) => T[i] += x); TT += s;
      rows += `<tr><td>${esc(p.nombre)}</td>${v.map(x => `<td class="n">${N(x)}</td>`).join('')}<td class="n"><b>${N(s)}</b></td></tr>`; });
    rows += `<tr class="tot"><td>Total</td>${T.map(x => `<td class="n">${N(x)}</td>`).join('')}<td class="n">${N(TT)}</td></tr>`; $('#h-heat').innerHTML = rows;
  }
  const admin = USER.rol === 'admin';
  $('#h-atip').innerHTML = '<tr><th>Fecha</th><th>Local</th><th>Motivo</th><th class="n">Venta ese día</th><th>¿Se excluye?</th></tr>' + E.D.atipicos.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).map(a => { const k = F.indexOf(a.fecha); const lsA = a.local === 'Todos' ? E.allL : [E.L.indexOf(a.local)]; return `<tr><td style="white-space:nowrap">${fmtLargo(a.fecha)}</td><td>${esc(a.local)}</td><td>${esc(a.motivo)}</td><td class="n">${k >= 0 ? S(E.realDay(k, lsA)) : '—'}</td><td><label class="sw2" title="Excluir del promedio"><input type="checkbox" data-at="${a.id}" ${a.activo !== false ? 'checked' : ''} ${admin ? '' : 'disabled'}><span></span></label> <span class="note">${a.activo !== false ? 'Excluido' : 'Incluido'}</span></td></tr>` }).join('');
  const lc = (RAW.bitacora || []).find(b => b.accion.startsWith('Carga de ventas'));
  $('#h-lastload').innerHTML = lc ? `Última carga: <b>${esc(lc.fecha)}</b> · ${esc(lc.accion.replace('Carga de ventas ', ''))} · ${lc.detalle ? N(lc.detalle.filas) + ' filas, ' + fmtD(lc.detalle.desde) + ' al ' + fmtD(lc.detalle.hasta) : ''}` : 'Aún no hay cargas registradas.';
}

// ---------- Proyección
function monthDays(m) { const out = []; for (let f = m + '-01'; f.slice(0, 7) === m; f = addD(f, 1)) out.push(f); return out; }
function rProy() {
  const mes = ST.pm === 'mes'; $('#p-semw').hidden = mes; $('#p-mesw').hidden = !mes; $('#p-ajw').hidden = !mes; $('#p-chartc').hidden = !mes;
  $$('#p-mode .tab').forEach(t => t.classList.toggle('on', t.dataset.pm === ST.pm));
  const ls = selL($('#p-local').value), cs = selC($('#p-canal').value);
  if (!mes) return rProySem(ls, cs);
  const m = $('#p-mes').value, days = monthDays(m), aj = +$('#p-aj').value, last = E.last();
  const fut = days.filter(f => f > last); const PJ = fut.length ? E.project(fut) : null;
  const unitsDay = (f, pi) => { const k = E.D.fechas.indexOf(f); if (k >= 0) return { u: ls.reduce((a, l) => a + cs.reduce((b, c) => b + E.D.ventas[k][l][c][pi], 0), 0), real: true }; if (f < E.D.fechas[0]) return { u: 0, real: true }; const d = fut.indexOf(f); return { u: Math.ceil(ls.reduce((a, l) => a + E.uLoc(PJ, d, l, cs, pi), 0) * (1 + aj) - 1e-9), real: false }; };
  const weeks = []; days.forEach(f => { const s = lunesDe(f); let w = weeks.find(x => x.s === s); if (!w) weeks.push(w = { s, days: [] }); w.days.push(f); });
  let cat = '', rows = `<tr><th>Producto</th>${weeks.map(w => { const a = w.days[0], z = w.days[w.days.length - 1]; return `<th class="n">${a === z ? fmtD(a) : pd(a).getUTCDate() + '–' + fmtD(z)}</th>`; }).join('')}<th class="n">Mes</th><th class="n">Venta S/</th></tr>`;
  const T = weeks.map(() => 0); let TU = 0, TS = 0, realS = 0, projS = 0; const dayS = days.map(f => ({ f, v: 0, real: f <= last }));
  E.PR.forEach((p, pi) => {
    if (p.cat !== cat) { cat = p.cat; rows += `<tr class="grp"><td colspan="${weeks.length + 3}">${esc(cat)}</td></tr>`; }
    const v = weeks.map(w => w.days.reduce((a, f) => a + unitsDay(f, pi).u, 0)); days.forEach((f, i) => { const x = unitsDay(f, pi); dayS[i].v += x.u * p.precio; if (x.real) realS += x.u * p.precio; else projS += x.u * p.precio; });
    const s = v.reduce((a, b) => a + b, 0); v.forEach((x, i) => T[i] += x); TU += s; TS += s * p.precio;
    rows += `<tr><td>${esc(p.nombre)}</td>${v.map((x, i) => `<td class="n ${weeks[i].days.every(f => f <= last) ? 'past' : ''}">${N(x)}</td>`).join('')}<td class="n"><b>${N(s)}</b></td><td class="n">${S(s * p.precio)}</td></tr>`;
  });
  rows += `<tr class="tot"><td>Total</td>${T.map(x => `<td class="n">${N(x)}</td>`).join('')}<td class="n">${N(TU)}</td><td class="n">${S(TS)}</td></tr>`;
  $('#p-table').innerHTML = rows; $('#p-exp').innerHTML = '';
  const nm = MESL[+m.slice(5) - 1];
  $('#p-sub').textContent = `${nm[0].toUpperCase() + nm.slice(1)} ${m.slice(0, 4)}: los días con venta cargada son reales y el resto se proyecta con el patrón de los últimos 4 días iguales${aj ? `, más un ajuste de temporada de ${aj > 0 ? '+' : ''}${P(aj, 0)}` : ''}.`;
  $('#p-tnote').textContent = 'Unidades por semana del mes. Las columnas sombreadas ya son venta real.';
  const pm = addD(m + '-01', -1).slice(0, 7); const pmDays = monthDays(pm).map(f => E.D.fechas.indexOf(f)); const pmFull = pmDays.every(k => k >= 0);
  const pmS = pmFull ? pmDays.reduce((a, k) => a + E.realDay(k, ls, cs), 0) : null;
  $('#p-kpis').innerHTML = kpiHTML([['Venta real a la fecha', S(realS), realS ? 'hasta el ' + fmtD(last < days[days.length - 1] ? last : days[days.length - 1]) : 'el mes aún no empieza'], ['Proyectado resto del mes', S(projS), fut.length + ' días por vender'], ['Cierre estimado del mes', S(realS + projS), pmS ? `${(realS + projS) / pmS - 1 >= 0 ? '+' : ''}${P((realS + projS) / pmS - 1)} vs. ${MESL[+pm.slice(5) - 1]}` : ''], ['Unidades del mes', N(TU), 'todas las categorías']]);
  $('#p-ctitle').textContent = 'Venta por día del mes (S/)'; drawDays($('#p-chart svg'), dayS);
}
function rProySem(ls, cs) {
  const s = $('#p-sem').value, PJ = projWeek(s), H = PJ.dates;
  $('#p-sub').textContent = `Semana del ${rango(s)}. Para cada día se toman los 4 mismos días más recientes ${E.D.metodo === 'w' ? 'con pesos 40/30/20/10 (más peso a la semana más reciente)' : 'con el mismo peso'}. Los ceros cuentan y los días atípicos se saltan.` + (PJ.pasada ? ' Es una semana pasada: se muestra lo que el sistema proyectó antes de que ocurriera.' : '');
  $('#p-tnote').textContent = 'Unidades proyectadas por día. Toca un número para ver de dónde sale.';
  const tot = Array(8).fill(0); let totS = 0, cat = '';
  let rows = '<tr><th>Producto</th>' + H.map(f => `<th class="n">${DCORTO[wdOf(f)]} ${pd(f).getUTCDate()}</th>`).join('') + '<th class="n">Semana</th><th class="n">Venta S/</th></tr>';
  E.PR.forEach((p, pi) => {
    if (p.cat !== cat) { cat = p.cat; rows += `<tr class="grp"><td colspan="10">${esc(cat)}</td></tr>`; }
    const v = H.map((_, d) => ls.reduce((a, l) => a + E.uLoc(PJ, d, l, cs, pi), 0)), sm = v.reduce((a, b) => a + b, 0);
    v.forEach((x, d) => tot[d] += x); tot[7] += sm; totS += sm * p.precio;
    rows += `<tr class="click" data-p="${pi}"><td>${esc(p.nombre)}</td>${v.map((x, d) => `<td class="n" data-day="${d}">${N(x)}</td>`).join('')}<td class="n"><b>${N(sm)}</b></td><td class="n">${S(sm * p.precio)}</td></tr>`;
  });
  rows += `<tr class="tot"><td>Total</td>${tot.map(x => `<td class="n">${N(x)}</td>`).join('')}<td class="n">${S(totS)}</td></tr>`;
  $('#p-table').innerHTML = rows; $('#p-exp').innerHTML = '';
  const fc = E.fcOf(PJ);
  $('#p-kpis').innerHTML = kpiHTML([['Venta proyectada', S(totS)], ['Unidades', N(tot[7])], ['Food cost teórico', P(fc.fc)], ['Día más fuerte', (() => { const b = days7.map(d => ({ d, s: E.salesDay(PJ, d, ls, cs) })).sort((a, b) => b.s - a.s)[0]; return fmtLargo(H[b.d]) })(), '', '20px']]);
}
function explainProd(pi, d = 0) {
  const ls = selL($('#p-local').value), cs = selC($('#p-canal').value), p = E.PR[pi], PJ = projWeek($('#p-sem').value), f = PJ.dates[d];
  const blocks = ls.map(l => {
    const vals = PJ.EXPL[f + '|' + l].map(e => ({ ...e, u: cs.reduce((a, c) => a + E.D.ventas[e.k][l][c][pi], 0) })), r = vals.reduce((a, v) => a + v.u * v.w, 0);
    return `<h3 style="margin:8px 0 6px">${esc(E.L[l])}</h3><table><tr><th>Fecha usada</th><th class="n">Vendido</th><th class="n">Peso</th><th class="n">Aporte</th></tr>${vals.map(v => `<tr><td>${fmtLargo(E.D.fechas[v.k])}</td><td class="n">${N(v.u)}</td><td class="n">${P(v.w, 0)}</td><td class="n">${N(v.u * v.w, 2)}</td></tr>`).join('')}<tr class="tot"><td>Resultado</td><td></td><td></td><td class="n">${N(r, 2)} → ${N(Math.ceil(r - 1e-9))} und</td></tr></table>`;
  }).join('');
  const sk = E.D.atipicos.filter(a => a.activo !== false && wdOf(a.fecha) === wdOf(f) && ls.some(l => a.local === E.L[l] || a.local === 'Todos'));
  $('#p-exp').innerHTML = `<div class="explain"><h3>${esc(p.nombre)} · ${fmtLargo(f)}</h3><p class="note" style="margin:4px 0 0">Se redondea hacia arriba por local. ${sk.length ? 'Se saltaron días atípicos: ' + sk.map(a => fmtD(a.fecha) + ' (' + esc(a.local) + ')').join(', ') + '.' : ''}</p>${blocks}</div>`;
  $('#p-exp').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------- Producción
function rProd() {
  const s = $('#o-sem').value, PJ = projWeek(s), H = PJ.dates;
  $('#o-tabs').innerHTML = H.map((f, d) => `<button class="tab ${ST.day === d ? 'on' : ''}" data-d="${d}">${DCORTO[wdOf(f)]} ${pd(f).getUTCDate()}</button>`).join('') + `<button class="tab ${ST.day === 7 ? 'on' : ''}" data-d="7">Semana completa</button>`;
  let prods, bases;
  if (ST.day < 7) ({ prods, bases } = E.production(PJ, ST.day));
  else { bases = {}; const acc = {}; days7.forEach(d => { const r = E.production(PJ, d); r.prods.forEach(o => { const a = acc[o.pi] || (acc[o.pi] = { ...o, proj: 0, per: E.L.map(() => 0), need: 0, ent: 0, porc: 0 }); a.proj += o.proj; o.per.forEach((x, l) => a.per[l] += x); a.need += o.need; a.ent += o.ent; a.porc += o.porc; }); Object.entries(r.bases).forEach(([b, g]) => bases[b] = (bases[b] || 0) + g); }); prods = Object.values(acc); }
  const when = ST.day < 7 ? `para la venta del ${fmtLargo(H[ST.day])} · preparar el ${fmtLargo(addD(H[ST.day], -1))}` : `semana del ${rango(H[0])}`;
  $('#o-t1').textContent = 'Productos terminados — ' + when; $('#o-t2').textContent = 'Recetas base a preparar — ' + when;
  $('#o-prod').innerHTML = '<thead><tr><th>Producto</th><th class="n">Proyectado</th><th class="n">Con stock de seguridad</th><th class="n">A producir</th>' + E.L.map(l => `<th class="n">Despacho ${esc(l)}</th>`).join('') + '</tr></thead><tbody>' + prods.map(o => `<tr><td>${esc(o.p.nombre)}</td><td class="n">${N(o.proj)}</td><td class="n">${N(o.need)}</td><td class="n"><b>${o.p.porc > 1 ? N(o.ent) + ' ' + esc(o.ent === 1 ? o.p.uprod : PLU[o.p.uprod]) + ' (' + N(o.porc) + ' porc.)' : N(o.porc) + ' und'}</b></td>${o.per.map(x => `<td class="n">${N(x)}</td>`).join('')}</tr>`).join('') + '</tbody>';
  const bl = Object.entries(bases).sort((a, b) => E.BAS[a[0]].area.localeCompare(E.BAS[b[0]].area) || a[0].localeCompare(b[0]));
  $('#o-base').innerHTML = '<tr><th>Receta base</th><th>Área</th><th class="n">Cantidad</th><th class="n">Tandas*</th><th class="n">Vida útil</th></tr>' + bl.map(([b, g]) => `<tr class="click" data-b="${b}" data-g="${g}"><td>${esc(E.BAS[b].nombre)}</td><td><span class="pill">${esc(E.BAS[b].area)}</span></td><td class="n"><b>${N(Math.ceil(g / 10) * 10 / 1000, 2)} kg</b></td><td class="n">${N(g / E.baseYield(E.BAS[b]), 2)}</td><td class="n">${E.BAS[b].vida} ${E.BAS[b].vida === 1 ? 'día' : 'días'}</td></tr>`).join('') + `<tr><td colspan="5" class="note">*Una tanda es la receta estándar del recetario.</td></tr>`;
  $('#o-exp').innerHTML = '';
  // KPIs de la semana y registro real
  const pr = prodReal().filter(r => r.fecha >= H[0] && r.fecha <= H[6]);
  const pl = pr.reduce((a, r) => a + r.planificado, 0), pdc = pr.reduce((a, r) => a + r.producido, 0), sbv = pr.reduce((a, r) => a + r.sobrante * (E.PC[E.PRI[r.producto_id]] || 0), 0), fotos = pr.filter(r => r.foto_url).length;
  let wk = 0; days7.forEach(d => E.production(PJ, d).prods.forEach(o => wk += o.porc));
  $('#o-kpis').innerHTML = kpiHTML([['A producir en la semana', N(wk), 'unidades y porciones'], ['Cumplimiento registrado', pl ? P(pdc / pl) : '—', pl ? `${N(pdc)} de ${N(pl)}` : 'sin registros aún'], ['Sobrante al cierre (a costo)', pl ? S(sbv) : '—', 'producido que no se vendió'], ['Registros con foto', N(fotos), `de ${N(pr.length)} registros`]]);
  const regOk = ST.day < 7 && (USER.rol === 'admin' || USER.rol === 'obrador');
  $('#o-regc').hidden = ST.day === 7;
  if (ST.day < 7) {
    const f = H[ST.day]; $('#o-t3').textContent = 'Registro de producción real — ' + fmtLargo(f);
    $('#o-reg').innerHTML = '<tr><th>Producto</th><th class="n">Planificado</th><th class="n">Producido</th><th class="n">Sobrante al cierre</th><th>Foto</th><th>Estado</th><th></th></tr>' + prods.map(o => {
      const r = prodReal().find(x => x.fecha === f && x.producto_id === o.p.id); const c = r ? r.producido / (r.planificado || 1) : null;
      return `<tr data-reg="${o.p.id}" data-plan="${o.porc}"><td>${esc(o.p.nombre)}</td><td class="n">${N(o.porc)}</td><td class="n"><input class="xs" type="number" min="0" data-f="producido" value="${r ? r.producido : ''}" placeholder="${o.porc}" ${regOk ? '' : 'disabled'} aria-label="Producido de ${esc(o.p.nombre)}"></td><td class="n"><input class="xs" type="number" min="0" data-f="sobrante" value="${r ? r.sobrante : ''}" placeholder="0" ${regOk ? '' : 'disabled'} aria-label="Sobrante de ${esc(o.p.nombre)}"></td>
        <td>${r && r.foto_url ? `<a href="${esc(r.foto_url)}" target="_blank" rel="noopener"><img class="thumb" src="${esc(r.foto_url)}" alt="Foto de ${esc(o.p.nombre)}"></a>` : ''}${regOk ? `<label class="btn ghost" style="min-height:36px;padding:5px 10px;font-size:13px;display:inline-flex;align-items:center;margin-top:4px">${r && r.foto_url ? 'Cambiar' : 'Subir foto'}<input type="file" accept="image/*" capture="environment" data-foto hidden></label>` : ''}</td>
        <td>${r ? `<span class="badge ${c >= 0.98 ? 'ok-b' : 'warn-b'}">${c >= 0.98 ? 'Completo' : 'Incompleto ' + P(c, 0)}</span><div class="note">${esc(r.usuario || '')} · ${esc(r.actualizado || '')}</div>` : '<span class="badge">Pendiente</span>'}</td>
        <td>${regOk ? '<button class="ghost" data-save style="min-height:36px;padding:5px 12px">Guardar</button>' : ''}</td></tr>`;
    }).join('');
  }
}
function explainBase(b, g) {
  const B = E.BAS[b], f = g / E.baseYield(B);
  $('#o-exp').innerHTML = `<div class="explain"><h3>${esc(B.nombre)} — ${N(Math.ceil(g / 10) * 10 / 1000, 2)} kg (${N(f, 2)} tandas)</h3><table><tr><th>Insumo</th><th class="n">Cantidad</th></tr>${Object.entries(B.ing).map(([i, q]) => `<tr><td>${esc(E.INS[i].nombre)}</td><td class="n">${N(q * f, 0)} ${E.INS[i].um}</td></tr>`).join('')}</table><p class="note">Merma de proceso considerada: ${B.merma} %.</p></div>`;
}
async function fileToB64(file, max = 1280) {
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) { const b = await file.arrayBuffer(); let s = ''; new Uint8Array(b).forEach(c => s += String.fromCharCode(c)); return { base64: btoa(s), tipo: file.type || 'image/jpeg' }; }
  const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); const url = c.toDataURL('image/jpeg', 0.82); return { base64: url.split(',')[1], tipo: 'image/jpeg' };
}
async function guardarReg(tr, foto) {
  const f = projWeek($('#o-sem').value).dates[ST.day], pid = tr.dataset.reg;
  const prod = tr.querySelector('[data-f=producido]'), sob = tr.querySelector('[data-f=sobrante]');
  const body = { fecha: f, producto_id: pid, planificado: +tr.dataset.plan, producido: prod.value === '' ? +tr.dataset.plan : +prod.value, sobrante: +sob.value || 0 };
  if (foto) body.foto = await fileToB64(foto);
  toast(foto ? 'Subiendo foto…' : 'Guardando…');
  try {
    const r = await api('/produccion-real', { method: 'POST', body: JSON.stringify(body) });
    const list = RAW.produccion_real; const ex = list.find(x => x.fecha === f && x.producto_id === pid);
    const now = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
    const rec = { fecha: f, producto_id: pid, planificado: body.planificado, producido: body.producido, sobrante: body.sobrante, foto_url: r.foto_url || ex?.foto_url || null, usuario: USER.nombre, actualizado: now };
    if (ex) Object.assign(ex, rec); else list.push(rec);
    rProd(); toast('Producción registrada');
  } catch (x) { toast(x.message); }
}

// ---------- Inventario
let XLSX_P = null;
const loadXLSX = () => XLSX_P || (XLSX_P = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = () => res(window.XLSX); s.onerror = () => rej(new Error('No se pudo cargar el lector de Excel')); document.head.appendChild(s); }));
function rInv() {
  const inv = RAW.inventarios || [], u = inv[0];
  const valor = E.IN.reduce((a, i) => a + (ST.stock[i.id] || 0) * i.precioKg / 1000, 0);
  $('#i-kpis').innerHTML = kpiHTML([['Último conteo', u ? fmtLargo(u.fecha) : '—', u ? 'por ' + esc(u.usuario) : 'sin conteos', '20px'], ['Insumos contados', u ? N(u.items) : '—'], ['Diferencia del último conteo', u ? S(+u.diferencia_valor, 2) : '—', 'contado − sistema, a costo'], ['Valor del stock actual', S(valor)]]);
  $('#i-hist').innerHTML = '<tr><th>Fecha del conteo</th><th>Registrado</th><th>Usuario</th><th class="n">Insumos</th><th class="n">Diferencia a costo</th></tr>' + inv.map(x => `<tr><td>${fmtLargo(x.fecha)}</td><td>${esc(x.creado)}</td><td>${esc(x.usuario)}</td><td class="n">${N(x.items)}</td><td class="n ${+x.diferencia_valor < 0 ? 'diff-neg' : +x.diferencia_valor > 0 ? 'diff-pos' : ''}">${S(+x.diferencia_valor, 2)}</td></tr>`).join('');
  if (!ST.inv) $('#i-prev').innerHTML = '';
}
async function plantillaInv() {
  try {
    const X = await loadXLSX();
    const rows = [['Código', 'Insumo', 'Categoría', 'Proveedor', 'Unidad', 'Stock en sistema', 'Stock contado']];
    E.IN.filter(i => i.presCant > 0).forEach(i => rows.push([i.id, i.nombre, i.cat, i.prov, uKg(i), +((ST.stock[i.id] || 0) / 1000).toFixed(2), null]));
    const ws = X.utils.aoa_to_sheet(rows); ws['!cols'] = [{ wch: 10 }, { wch: 32 }, { wch: 18 }, { wch: 24 }, { wch: 8 }, { wch: 16 }, { wch: 16 }];
    const ins = X.utils.aoa_to_sheet([['Instrucciones'], ['1. Cuenta cada insumo en el obrador y anota la cantidad en la columna G (Stock contado), en kg o litros según la columna E.'], ['2. Usa punto o coma para decimales. Deja vacío lo que no contaste: no se cambia.'], ['3. No cambies los códigos de la columna A.'], ['4. Guarda y súbelo en Inventario > Subir plantilla llena.']]);
    ins['!cols'] = [{ wch: 110 }];
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Conteo'); X.utils.book_append_sheet(wb, ins, 'Instrucciones');
    X.writeFile(wb, `Casa Canela - Inventario ${$('#i-fecha').value || hoyLima()}.xlsx`); toast('Plantilla descargada');
  } catch (x) { toast(x.message); }
}
async function leerInv(file) {
  try {
    const X = await loadXLSX(); const wb = X.read(await file.arrayBuffer()); const ws = wb.Sheets['Conteo'] || wb.Sheets[wb.SheetNames[0]];
    const rows = X.utils.sheet_to_json(ws, { header: 1, defval: '' }); const items = [];
    rows.slice(1).forEach(r => { const id = String(r[0] || '').trim(); let v = r[6]; if (typeof v === 'string') v = v.replace(',', '.').trim(); if (!id || v === '' || v == null || isNaN(+v)) return; const i = E.INS[id]; if (!i) return; items.push({ i, contado: +v * 1000 }); });
    if (!items.length) { toast('La plantilla no tiene cantidades en la columna Stock contado'); return; }
    ST.inv = items;
    const dif = items.reduce((a, x) => a + (x.contado - (ST.stock[x.i.id] || 0)) * x.i.precioKg / 1000, 0);
    $('#i-prev').innerHTML = `<div class="explain"><h3>Revisa antes de confirmar: ${items.length} insumos contados</h3><p class="note">Diferencia total a costo: <b class="${dif < 0 ? 'diff-neg' : 'diff-pos'}">${S(dif, 2)}</b>. Una diferencia negativa grande puede ser merma no registrada, consumo fuera de receta o un error de conteo.</p>
      <div class="scroll"><table><tr><th>Insumo</th><th class="n">Sistema</th><th class="n">Contado</th><th class="n">Diferencia</th><th class="n">A costo</th></tr>${items.map(x => { const s = ST.stock[x.i.id] || 0, d = x.contado - s, v = d * x.i.precioKg / 1000; return `<tr><td>${esc(x.i.nombre)}</td><td class="n">${N(s / 1000, 2)} ${uKg(x.i)}</td><td class="n">${N(x.contado / 1000, 2)} ${uKg(x.i)}</td><td class="n ${d < 0 ? 'diff-neg' : d > 0 ? 'diff-pos' : ''}">${d > 0 ? '+' : ''}${N(d / 1000, 2)}</td><td class="n">${S(v, 2)}</td></tr>` }).join('')}</table></div>
      <div class="controls" style="margin-top:12px"><button id="i-ok">Confirmar y actualizar stock</button><button class="ghost" id="i-cancel">Cancelar</button></div></div>`;
  } catch (x) { toast('No se pudo leer el archivo: ' + x.message); }
}
async function confirmarInv() {
  try {
    const r = await api('/inventario', { method: 'POST', body: JSON.stringify({ fecha: $('#i-fecha').value, items: ST.inv.map(x => ({ insumo_id: x.i.id, contado: x.contado })) }) });
    ST.inv = null; await loadData('Actualizando stock…'); toast(`Inventario guardado: ${r.items} insumos actualizados`);
  } catch (x) { toast(x.message); }
}

// ---------- Compras
function rCompras() {
  const s = $('#c-sem').value, PJ = projWeek(s), cp = compraDe(PJ), venta = weekSales(PJ), u = (RAW.inventarios || [])[0];
  $('#c-sub').textContent = `Insumos para producir la semana del ${rango(s)} y preparar las bebidas en barra, con ${P(E.D.colchon, 0)} de stock de seguridad.`;
  $('#c-note').innerHTML = `El stock sale del último inventario${u ? ` (<b>${fmtLargo(u.fecha)}</b>)` : ''}; también puedes corregirlo aquí. Se pide en la presentación del proveedor, redondeando hacia arriba. Los pedidos salen solos por correo los domingos.`;
  let rows = '<tr><th>Insumo</th><th class="n">Requerido</th><th class="n">Stock actual</th><th class="n">Faltante</th><th>Presentación</th><th class="n">Pedir</th><th class="n">Costo</th></tr>';
  cp.grupos.forEach(g => { rows += `<tr class="grp"><td colspan="6">${esc(g.proveedor)}</td><td class="n">${S(g.total, 2)}</td></tr>` + g.items.map(x => `<tr><td>${esc(x.i.nombre)}</td><td class="n">${N(x.need / 1000, 2)} ${uKg(x.i)}</td><td class="n"><input class="sm" type="number" min="0" step="0.1" data-st="${x.i.id}" value="${+(x.stock / 1000).toFixed(2)}" aria-label="Stock de ${esc(x.i.nombre)} en ${uKg(x.i)}"></td><td class="n">${N(x.falt / 1000, 2)} ${uKg(x.i)}</td><td>${esc(x.i.pres)}</td><td class="n"><b>${x.packs}</b></td><td class="n">${S(x.costo, 2)}</td></tr>`).join(''); });
  rows += `<tr class="tot"><td colspan="6">Total de la compra</td><td class="n">${S(cp.total, 2)}</td></tr>`;
  $('#c-table').innerHTML = rows;
  $('#c-kpis').innerHTML = kpiHTML([['Compra total', S(cp.total)], ['Insumos a pedir', N(cp.items)], ['Proveedores', N(cp.grupos.filter(g => g.total > 0).length)], ['Compra / venta sin IGV', P(cp.total / (venta / 1.18))]]);
}

// ---------- Costos
function rCostos() {
  const fc = E.fcOf(projWeek(nextMonday())), ord = E.PR.map((p, i) => i).sort((a, b) => E.FC[b] - E.FC[a]);
  $('#k-kpis').innerHTML = kpiHTML([['Food cost teórico próxima semana', P(fc.fc)], ['Costo de la semana proyectada', S(fc.costo)], ['Producto con FC más alto', esc(E.PR[ord[0]].nombre) + ' · ' + P(E.FC[ord[0]]), '', '18px'], ['Producto con FC más bajo', esc(E.PR[ord[ord.length - 1]].nombre) + ' · ' + P(E.FC[ord[ord.length - 1]]), '', '18px']]);
  $('#k-table').innerHTML = '<tr><th>Producto</th><th>Categoría</th><th class="n">Precio</th><th class="n">Sin IGV</th><th class="n">Costo</th><th class="n">Margen</th><th class="n">Food cost</th><th></th></tr>' + ord.map(i => `<tr class="click" data-k="${i}"><td>${esc(E.PR[i].nombre)}</td><td>${esc(E.PR[i].cat)}</td><td class="n">${S(E.PR[i].precio, 2)}</td><td class="n">${S(E.NET[i], 2)}</td><td class="n">${S(E.PC[i], 2)}</td><td class="n">${S(E.NET[i] - E.PC[i], 2)}</td><td class="n" style="color:${fcCol(E.FC[i])};font-weight:700">${P(E.FC[i])}</td><td style="width:18%"><div class="bar"><span style="width:${Math.min(100, E.FC[i] / 0.45 * 100)}%;background:${fcCol(E.FC[i])}"></span></div></td></tr>`).join('');
  $('#k-bases').innerHTML = '<tr><th>Receta base</th><th class="n">Costo tanda</th><th class="n">Rendimiento</th><th class="n">Costo por kg</th></tr>' + E.BA.map(b => `<tr><td>${esc(b.nombre)}</td><td class="n">${S(E.baseCost(b), 2)}</td><td class="n">${N(E.baseYield(b) / 1000, 2)} kg</td><td class="n">${S(E.costG[b.id] * 1000, 2)}</td></tr>`).join('');
}
function explainCost(i) {
  const p = E.PR[i], rows = [...Object.entries(p.bases).map(([b, g]) => [E.BAS[b].nombre + ' (receta base)', g + ' g', g * E.costG[b]]), ...Object.entries(p.dir).filter(([x]) => E.INS[x].precioKg > 0).map(([x, q]) => [E.INS[x].nombre, q + ' ' + E.INS[x].um, q * E.INS[x].precioKg / 1000])];
  $('#k-exp').innerHTML = `<div class="explain"><h3>${esc(p.nombre)}</h3><table><tr><th>Componente</th><th class="n">Cantidad</th><th class="n">Costo</th></tr>${rows.map(r => `<tr><td>${esc(r[0])}</td><td class="n">${esc(r[1])}</td><td class="n">${S(r[2], 2)}</td></tr>`).join('')}<tr class="tot"><td>Costo unitario</td><td></td><td class="n">${S(E.PC[i], 2)}</td></tr></table></div>`;
}

// ---------- Recetario
function rRecetario() {
  const showCost = USER.rol === 'admin';
  if (!$('#rc-sel').options.length) $('#rc-sel').innerHTML = '<optgroup label="Productos">' + E.PR.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('') + '</optgroup><optgroup label="Recetas base">' + E.BA.map(b => `<option value="${b.id}">${esc(b.nombre)}</option>`).join('') + '</optgroup>';
  const id = $('#rc-sel').value; let h = '';
  if (E.PRI[id] !== undefined) {
    const i = E.PRI[id], p = E.PR[i];
    h = `<div class="card"><h2>${esc(p.nombre)}</h2><p class="note">${esc(p.cat)} · se prepara en ${p.lugar === 'Obrador' ? 'el obrador central' : 'la barra de cada local'} · ${p.porc > 1 ? '1 ' + esc(p.uprod) + ' = ' + p.porc + ' porciones' : 'por unidad'}${showCost ? ' · precio ' + S(p.precio, 2) : ''}</p>
    <table><tr><th>Componente</th><th>Tipo</th><th class="n">Por unidad vendida</th>${showCost ? '<th class="n">Costo</th>' : ''}</tr>${Object.entries(p.bases).map(([b, g]) => `<tr><td><a href="#recetario" data-go="${b}" style="color:var(--canela)">${esc(E.BAS[b].nombre)}</a></td><td>Receta base</td><td class="n">${g} g</td>${showCost ? `<td class="n">${S(g * E.costG[b], 2)}</td>` : ''}</tr>`).join('')}${Object.entries(p.dir).filter(([x]) => E.INS[x].precioKg > 0).map(([x, q]) => `<tr><td>${esc(E.INS[x].nombre)}</td><td>Insumo directo</td><td class="n">${q} ${E.INS[x].um}</td>${showCost ? `<td class="n">${S(q * E.INS[x].precioKg / 1000, 2)}</td>` : ''}</tr>`).join('')}${showCost ? `<tr class="tot"><td>Costo</td><td></td><td></td><td class="n">${S(E.PC[i], 2)}</td></tr>` : ''}</table></div>`;
  } else {
    const b = E.BAS[id], y = E.baseYield(b), tot = Object.values(b.ing).reduce((a, q) => a + q, 0), used = E.PR.filter(p => p.bases[id]);
    h = `<div class="card"><h2>${esc(b.nombre)}</h2><p class="note">${esc(b.area)} · rinde ${N(y / 1000, 2)} kg por tanda (${N(tot / 1000, 2)} kg de masa cruda, ${b.merma} % de merma) · vida útil ${b.vida} ${b.vida === 1 ? 'día' : 'días'} · se usa en: ${used.map(p => esc(p.nombre)).join(', ')}</p>
    <table><tr><th>Insumo</th><th class="n">Cantidad por tanda</th>${showCost ? '<th class="n">Precio</th><th class="n">Costo</th>' : ''}</tr>${Object.entries(b.ing).map(([x, q]) => `<tr><td>${esc(E.INS[x].nombre)}</td><td class="n">${N(q)} ${E.INS[x].um}</td>${showCost ? `<td class="n">${E.INS[x].precioKg ? S(E.INS[x].precioKg, 2) + ' / ' + uKg(E.INS[x]) : '—'}</td><td class="n">${S(q * E.INS[x].precioKg / 1000, 2)}</td>` : ''}</tr>`).join('')}${showCost ? `<tr class="tot"><td>Costo por tanda</td><td></td><td></td><td class="n">${S(E.baseCost(b), 2)}</td></tr>` : ''}</table></div>`;
  }
  $('#rc-body').innerHTML = h;
}

// ---------- Automatizaciones
const ESC = [
  ['Cargar ventas', 'Todos los días, 11:30 p. m.', 'Lee la hoja «Casa Canela – Ventas por cargar» de Google Sheets y la sube a la base de datos.', 'carga de ventas'],
  ['Orden de producción', 'Todos los días, 6:00 p. m.', 'Envía al obrador la orden de producción del día siguiente.', 'orden de producción'],
  ['Alerta de stock crítico', 'Todos los días, 6:00 p. m.', 'Si algún insumo no alcanza para los próximos días, avisa con la lista y cuánto falta.', 'stock crítico'],
  ['Pedidos a proveedores', 'Domingos, 6:00 p. m.', 'Envía a cada proveedor su pedido de la semana que empieza.', 'pedidos'],
  ['Reporte semanal', 'Domingos, 6:00 p. m.', 'Venta proyectada, precisión, cumplimiento de producción, sobrante, food cost y alertas.', 'reporte']];
function rAuto() {
  const bit = RAW.bitacora || [], lastRun = n => bit.find(b => b.usuario === 'Make' && b.accion.toLowerCase().includes(n));
  $('#m-esc').innerHTML = '<tr><th>Automatización</th><th>Cuándo</th><th>Qué hace</th><th>Última ejecución</th></tr>' + ESC.map(e => { const r = lastRun(e[3]); return `<tr><td><b>${e[0]}</b></td><td>${e[1]}</td><td>${e[2]}</td><td>${r ? `<span class="badge ok-b">${esc(r.fecha)}</span>` : '<span class="badge warn-b">Aún no se ejecuta</span>'}</td></tr>` }).join('');
  $('#cf-obr').value = RAW.config.correo_obrador || ''; $('#cf-due').value = RAW.config.correo_dueno || ''; $('#cf-cob').value = RAW.config.dias_cobertura || '2';
  $('#cf-prov').innerHTML = '<tr><th>Proveedor</th><th>Correo</th><th>Día</th></tr>' + (RAW.proveedores || []).map(p => `<tr><td>${esc(p.nombre)}</td><td><input type="text" data-pe="${esc(p.nombre)}" value="${esc(p.email || '')}"></td><td><select data-pd="${esc(p.nombre)}">${['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'].map(d => `<option ${d === p.dia_pedido ? 'selected' : ''}>${d}</option>`).join('')}</select></td></tr>`).join('');
  $('#m-url').textContent = API;
  $('#m-bit').innerHTML = '<tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr>' + bit.map(b => `<tr><td style="white-space:nowrap">${esc(b.fecha)}</td><td>${esc(b.usuario)}</td><td>${esc(b.accion)}</td><td class="note">${b.detalle ? esc(JSON.stringify(b.detalle)).slice(0, 140) : ''}</td></tr>`).join('');
}
function rMarca() {
  const pal = [['Cacao', '#3B2418', 'Fondo de marca, textos y barra lateral'], ['Canela', '#A8552B', 'Color principal de acento y botones'], ['Miel', '#D69A3A', 'Destacados y proyección'], ['Miga', '#F5EBDD', 'Fondo claro y textos sobre cacao'], ['Arcilla', '#E3C3A3', 'Fondos secundarios y tablas'], ['Cardamomo', '#5F6B45', 'Indicadores en verde (estado correcto)']];
  $('#m-pal').innerHTML = pal.map(c => `<div class="sw"><div style="background:${c[1]}"></div><div><b>${c[0]}</b> · ${c[1]}<br><span class="note">${c[2]}</span></div></div>`).join('');
}

const R = { resumen: rResumen, ventas: rVentas, proyeccion: rProy, produccion: rProd, inventario: rInv, compras: rCompras, costos: rCostos, recetario: rRecetario, automatizaciones: rAuto, marca: rMarca };
function show() {
  if (!E) return;
  const ok = allowed().map(v => v[0]); const v = (location.hash || '').slice(1); const k = ok.includes(v) ? v : ok[0];
  $$('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + k)); $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.v === k));
  ['#up-demo', '#up-reset', '#a-add', '#up-tpl'].forEach(s => $(s).disabled = USER.rol !== 'admin');
  R[k]();
}

// ---------- eventos
addEventListener('hashchange', () => { show(); scrollTo(0, 0); });
['#h-local', '#h-canal', '#h-prod', '#h-med', '#h-sem'].forEach(s => $(s).addEventListener('change', rVentas));
['#p-local', '#p-canal', '#p-sem', '#p-mes', '#p-aj'].forEach(s => $(s).addEventListener('change', rProy));
$('#o-sem').addEventListener('change', () => { ST.day = 0; rProd(); });
$('#c-sem').addEventListener('change', rCompras);
$('#rc-sel').addEventListener('change', rRecetario);
$('#p-met').addEventListener('change', async e => { E.D.metodo = e.target.value; recalc(); rProy(); if (USER.rol === 'admin') { try { await api('/config', { method: 'POST', body: JSON.stringify({ metodo: E.D.metodo }) }); toast('Método guardado'); } catch (x) { toast(x.message); } } });
$('#o-seg').addEventListener('change', async e => { E.D.colchon = +e.target.value; rProd(); try { await api('/config', { method: 'POST', body: JSON.stringify({ colchon: E.D.colchon }) }); toast('Stock de seguridad guardado: también lo usa Make'); } catch (x) { toast(x.message); } });
document.addEventListener('click', e => {
  const t = e.target.closest('[data-p],[data-b],[data-k],[data-d],[data-go],[data-prev],[data-pm],[data-save]'); if (!t) return;
  if (t.dataset.go) { e.preventDefault(); $('#rc-sel').value = t.dataset.go; rRecetario(); return; }
  if (t.dataset.prev) { preview(t.dataset.prev); return; }
  if (t.dataset.pm) { ST.pm = t.dataset.pm; rProy(); return; }
  if (t.dataset.save !== undefined) { guardarReg(t.closest('tr')); return; }
  if (t.dataset.d !== undefined) { ST.day = +t.dataset.d; rProd(); }
  else if (t.dataset.p !== undefined) { const td = e.target.closest('[data-day]'); explainProd(+t.dataset.p, td ? +td.dataset.day : 0); }
  else if (t.dataset.b) explainBase(t.dataset.b, +t.dataset.g);
  else if (t.dataset.k !== undefined) explainCost(+t.dataset.k);
});
const stockTimers = {};
document.addEventListener('change', async e => {
  if (e.target.dataset.at !== undefined) {
    const id = +e.target.dataset.at, a = E.D.atipicos.find(x => x.id === id); a.activo = e.target.checked; recalc(); rVentas();
    try { await api('/atipicos', { method: 'PATCH', body: JSON.stringify({ id, activo: a.activo }) }); toast('Guardado. La proyección se recalculó.'); } catch (x) { toast(x.message); }
  }
  if (e.target.dataset.st) {
    const id = e.target.dataset.st, v = Math.max(0, +e.target.value * 1000 || 0); ST.stock[id] = v; rCompras();
    clearTimeout(stockTimers[id]); stockTimers[id] = setTimeout(async () => { try { await api('/stock', { method: 'POST', body: JSON.stringify({ insumo_id: id, stock: v }) }); toast('Stock guardado'); } catch (x) { toast(x.message); } }, 500);
  }
  if (e.target.dataset.foto !== undefined && e.target.files[0]) guardarReg(e.target.closest('tr'), e.target.files[0]);
});
$('#a-add').addEventListener('click', async () => {
  const f = $('#a-fecha').value, l = $('#a-local').value, m = $('#a-mot').value.trim() || 'Día atípico';
  if (!f || !E.D.fechas.includes(f)) { toast('Elige una fecha dentro del histórico de ventas'); return; }
  try { await api('/atipicos', { method: 'POST', body: JSON.stringify({ fecha: f, local: l, motivo: m }) }); $('#a-mot').value = ''; await loadData('Recalculando…'); toast('Día atípico agregado'); } catch (x) { toast(x.message); }
});
async function subir(body, label) {
  $('#up-msg').textContent = 'Subiendo…';
  try { const r = await api('/ventas', { method: 'POST', body: JSON.stringify(body) }); await loadData('Recalculando…'); $('#up-msg').textContent = `${label}: ${r.filas} filas en ${r.dias} días (${r.desde ? fmtD(r.desde) : ''} al ${r.hasta ? fmtD(r.hasta) : ''})${r.errores ? ', ' + r.errores + ' filas con error omitidas' : ''}.`; toast('Ventas cargadas: todo se recalculó'); }
  catch (x) { $('#up-msg').textContent = 'Error: ' + x.message; }
}
function descargar(nombre, texto, tipo) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([texto], { type: tipo })); a.download = nombre; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
$('#up-tpl').addEventListener('click', () => {
  const f = addD(E.last(), 1); const lines = ['fecha,local,canal,producto_id,producto,unidades'];
  E.L.forEach(l => E.C.forEach(c => E.PR.forEach(p => lines.push(`${f},${l},${c},${p.id},${p.nombre},`))));
  descargar(`Casa Canela - plantilla ventas ${f}.csv`, '﻿' + lines.join('\n'), 'text/csv;charset=utf-8'); toast('Plantilla descargada');
});
$('#up-file').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; f.text().then(t => subir({ csv: t, origen: 'App (CSV)' }, f.name)); e.target.value = ''; });
$('#up-demo').addEventListener('click', () => {
  const rows = []; EXTRA.dias.forEach((day, d) => day.forEach((loc, l) => loc.forEach((row, c) => row.forEach((u, p) => { if (u) rows.push({ fecha: addD(EXTRA.inicio, d), local: E.L[l], canal: E.C[c], producto_id: EXTRA.productos[p], unidades: u }); }))));
  subir({ rows, origen: 'Semana de ejemplo' }, 'Semana de ejemplo');
});
$('#up-reset').addEventListener('click', async () => {
  const b = $('#up-reset'); if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Toca otra vez para borrar ventas posteriores al 15 nov'; setTimeout(() => { b.dataset.confirm = ''; b.textContent = 'Volver al 15 nov'; }, 4000); return; }
  b.dataset.confirm = ''; b.textContent = 'Volver al 15 nov';
  try { const r = await api('/demo/reset', { method: 'POST' }); await loadData('Recalculando…'); $('#up-msg').textContent = `Demo restablecida: se borraron ${r.borradas} filas posteriores al 15 nov.`; } catch (x) { toast(x.message); }
});
$('#i-tpl').addEventListener('click', plantillaInv);
$('#i-file').addEventListener('change', e => { const f = e.target.files[0]; if (f) leerInv(f); e.target.value = ''; });
document.addEventListener('click', e => { if (e.target.id === 'i-ok') confirmarInv(); if (e.target.id === 'i-cancel') { ST.inv = null; $('#i-prev').innerHTML = ''; } });
$('#cf-save').addEventListener('click', async () => {
  const proveedores = $$('[data-pe]').map(i => ({ nombre: i.dataset.pe, email: i.value.trim(), dia_pedido: $(`[data-pd="${CSS.escape(i.dataset.pe)}"]`).value }));
  const b = { correo_obrador: $('#cf-obr').value.trim(), correo_dueno: $('#cf-due').value.trim(), dias_cobertura: $('#cf-cob').value, proveedores };
  try { await api('/config', { method: 'POST', body: JSON.stringify(b) }); Object.assign(RAW.config, { correo_obrador: b.correo_obrador, correo_dueno: b.correo_dueno, dias_cobertura: b.dias_cobertura }); toast('Configuración guardada'); } catch (x) { toast(x.message); }
});
async function preview(tipo) {
  $('#m-prev').innerHTML = '<p class="note">Generando…</p>';
  try {
    const r = await api('/vista-previa?tipo=' + tipo);
    const items = tipo === 'pedidos' ? r.pedidos : [r];
    $('#m-prev').innerHTML = (tipo === 'pedidos' ? `<p class="note">${r.proveedores} correos · total estimado ${S(r.total, 2)}. Se muestra el primero.</p>` : '') + (tipo === 'alertas' && !r.hay ? '<p class="note">Hoy no hay insumos en stock crítico: Make no envía correo.</p>' : '') + `<p style="margin:0 0 6px"><b>Para:</b> ${esc(items[0]?.para || '')} · <b>Asunto:</b> ${esc(items[0]?.asunto || '')}</p><iframe class="prev" sandbox="" title="Vista previa del correo"></iframe>`;
    $('#m-prev iframe').srcdoc = items[0]?.html || '<p>Sin contenido</p>';
  } catch (x) { $('#m-prev').innerHTML = `<p class="note">Error: ${esc(x.message)}</p>`; }
}
$('#m-key').addEventListener('click', async () => { try { const r = await api('/integraciones'); $('#m-keyv').textContent = r.api_key; $('#m-keyv').hidden = false; } catch (x) { toast(x.message); } });
$('#o-print').addEventListener('click', () => print());
async function copy(txt) { try { await navigator.clipboard.writeText(txt); toast('Copiado'); } catch { toast('No se pudo copiar'); } }
$('#o-copy').addEventListener('click', () => { const rows = [...$('#o-prod').rows, ...$('#o-base').rows].map(r => [...r.cells].map(c => c.textContent.trim()).join('\t')); copy('CASA CANELA — ' + $('#o-t1').textContent + '\n' + rows.join('\n')); });
$('#c-copy').addEventListener('click', () => { const cp = compraDe(projWeek($('#c-sem').value)); copy(cp.grupos.map(g => { const l = g.items.filter(x => x.packs > 0).map(x => `- ${x.packs} × ${x.i.pres} de ${x.i.nombre}`); return l.length ? `PEDIDO ${g.proveedor.toUpperCase()} — Casa Canela\n${l.join('\n')}` : '' }).filter(Boolean).join('\n\n')); });

// ---------- sesión
function logout(expired) {
  if (TOKEN && !expired) fetch(API + '/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN } }).catch(() => { });
  TOKEN = null; store.set('cc_token', null); E = null; $('#app').hidden = true; $('#login').hidden = false;
  if (expired) $('#l-err').textContent = 'Tu sesión venció. Vuelve a ingresar.';
}
$('#logout').addEventListener('click', () => logout(false));
$('#login-f').addEventListener('submit', async e => {
  e.preventDefault(); $('#l-err').textContent = ''; const btn = $('#login-f button'); btn.disabled = true; btn.textContent = 'Ingresando…';
  try { const r = await api('/login', { method: 'POST', body: JSON.stringify({ usuario: $('#l-u').value, clave: $('#l-p').value }) }); TOKEN = r.token; store.set('cc_token', TOKEN); $('#l-p').value = ''; location.hash = ''; await loadData(); }
  catch (x) { $('#l-err').textContent = x.message; }
  finally { btn.disabled = false; btn.textContent = 'Ingresar'; }
});
if (TOKEN) loadData().catch(() => logout(true)); else $('#login').hidden = false;
