import { createEngine, buildDataset, DIAS, DCORTO, MES, PLU, pd, wdOf, addD, fmtD, fmtLargo } from './engine.js';
import { EXTRA } from './demo-semana.js';
import { calendario } from './cal.js';

const API = 'https://jcbgjwnlvsruntcpgbac.supabase.co/functions/v1/casa-canela';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = (n, d = 0) => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d });
const N = (n, d = 0) => n.toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d });
const P = (n, d = 1) => (n * 100).toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d }) + '\u00a0%';
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 3000); };
const store = { get: k => { try { return localStorage.getItem(k) } catch { return null } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch { } } };
const fcCol = f => f <= 0.28 ? 'var(--ok)' : f <= 0.33 ? 'var(--warn)' : 'var(--bad)';
const MESL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
const hoyLima = () => new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);
const lunesDe = f => addD(f, -wdOf(f));
const rango = s => `${fmtD(s)} al ${fmtD(addD(s, 6))}`;
const uKg = i => i.um === 'ml' ? 'l' : 'kg';

let TOKEN = store.get('cc_token'), USER = null, RAW = null, E = null;
const ST = { day: 0, stock: {}, inv: null, fotos: {}, cal: {} };

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
  ['costos', 'Costos', ['admin']], ['indicadores', 'Indicadores', ['admin']], ['recetario', 'Recetario', ['admin', 'obrador', 'compras']], ['automatizaciones', 'Automatizaciones', ['admin']], ['marca', 'Marca', ['admin']]];
const allowed = () => VIEWS.filter(v => v[2].includes(USER.rol));
const ROL = { admin: 'Administración', obrador: 'Obrador', compras: 'Compras' };

// ---------- datos
async function loadData(msg = 'Cargando datos…') {
  $('#loading').textContent = msg; $('#loading').hidden = false;
  try {
    RAW = await api('/datos'); USER = RAW.usuario;
    const rows = { ...RAW, ventas: RAW.ventas.map(v => ({ fecha: v[0], local: v[1], canal: v[2], producto_id: v[3], unidades: v[4] })) };
    E = createEngine(buildDataset(rows));
    ST.stock = E.stockEfectivo(Object.fromEntries(E.IN.map(i => [i.id, i.stock])), RAW.config.stock_al, RAW.produccion_real || []);
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
// proyección de un rango cualquiera: los días ya cargados se proyectan con la historia anterior a ellos
function projRange(a, b) {
  const dates = []; for (let f = a; f <= b; f = addD(f, 1)) dates.push(f);
  const key = 'R' + a + b + '|' + E.D.metodo + '|' + E.D.atipicos.map(x => x.activo !== false ? 1 : 0).join('');
  if (pjCache.has(key)) return pjCache.get(key);
  const idx = E.D.fechas.indexOf(a); const P = E.project(dates, idx >= 0 ? idx : E.n()); pjCache.set(key, P); return P;
}
const diasDe = P => P.dates.map((_, i) => i);
const marcaDia = f => { const ev = E.D.eventos.filter(e => e.activo !== false && e.fecha === f); const cls = [E.D.fechas.includes(f) ? 'real' : f > E.last() ? 'fut' : '', ev.length ? 'cev' : '', f === hoyLima() ? 'hoy' : ''].join(' ');
  return { cls, title: ev.map(e => e.nombre + ' ' + fxt(e.factor) + (e.local !== 'Todos' ? ' en ' + e.local : '')).join('; ') }; };
const LEYENDA = '<span><b>Negrita</b>: con venta cargada</span><span>Gris: días por proyectar</span><span>● dorado: evento del calendario</span>';
function setupCalendarios() {
  const last = E.last(), nm = nextMonday(), lw = addD(lunesDe(last), last === addD(lunesDe(last), 6) ? 0 : -7);
  const mes0 = last.slice(0, 7) + '-01', finMes = m => addD(addD(m.slice(0, 7) + '-28', 7).slice(0, 7) + '-01', -1), mes1 = addD(finMes(mes0), 1);
  const base = { mark: marcaDia, legend: LEYENDA };
  const mk = (id, o) => { if (ST.cal[id]) { ST.cal[id].refresh(); return; } ST.cal[id] = calendario($('#' + id), { ...base, ...o }); };
  mk('h-rng', { label: 'Fechas', value: [addD(last, -83), last], max: last, min: E.D.fechas[0], onChange: rVentas,
    presets: () => [['Última semana', lw, addD(lw, 6)], ['Últimas 4 semanas', addD(lw, -21), addD(lw, 6)], ['Últimas 12 semanas', addD(last, -83), last], ['Este mes', mes0, last], ['Mes anterior', addD(mes0, -1).slice(0, 7) + '-01', addD(mes0, -1)]] });
  mk('p-rng', { label: 'Fechas a proyectar', value: [nm, addD(nm, 6)], onChange: () => { $('#p-exp').innerHTML = ''; rProy(); },
    presets: () => [['Próxima semana', nm, addD(nm, 6)], ['Próximas 2 semanas', nm, addD(nm, 13)], ['Resto del mes', addD(last, 1), finMes(last)], ['Mes completo', mes0, finMes(mes0)], ['Próximo mes', mes1, finMes(mes1)], ['Última semana (cómo proyectó)', lw, addD(lw, 6)]] });
  mk('o-dia', { label: 'Día de venta', single: true, value: addD(hoyLima(), 1), onChange: f => { ST.day = wdOf(f); rProd(); },
    presets: () => [['Mañana', addD(hoyLima(), 1)], ['Hoy', hoyLima()], ['Próximo lunes', nm], ['Último día con venta', last]] });
  mk('c-rng', { label: 'Comprar para', value: [nm, addD(nm, 6)], onChange: rCompras,
    presets: () => [['Próxima semana', nm, addD(nm, 6)], ['Próximas 2 semanas', nm, addD(nm, 13)], ['Lo que queda de esta semana', addD(hoyLima(), 1), addD(nm, -1)]] });
  const xs = prodReal().map(r => r.fecha).sort(); const xw = xs.length ? lunesDe(xs[xs.length - 1]) : lw;
  mk('x-rng', { label: 'Periodo', value: [xw, addD(xw, 6)], onChange: rInd,
    presets: () => [['Última semana con registros', xw, addD(xw, 6)], ['Últimas 2 semanas', addD(xw, -7), addD(xw, 6)], ['Este mes', hoyLima().slice(0, 7) + '-01', hoyLima()]] });
  if (!ST.day0) { ST.day = wdOf(ST.cal['o-dia'].value); ST.day0 = true; }
}
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
  setupCalendarios();
  $('#o-seg').value = String(E.D.colchon); $('#o-seg').disabled = USER.rol !== 'admin';
  $('#p-met').value = E.D.metodo; $('#i-fecha').value = hoyLima();
  $('#e-local').innerHTML = '<option>Todos</option>' + E.L.map(l => `<option>${esc(l)}</option>`).join('');
  $('#e-cat').innerHTML = '<option value="">Todas</option>' + CATS().map(c => `<option>${esc(c)}</option>`).join('');
  $('#e-fecha').min = addD(E.last(), 1); if (!$('#e-fecha').value) $('#e-fecha').value = addD(E.last(), 7);
  keep('#o-hprod', E.PR.filter(p => p.lugar === 'Obrador').map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join(''));
  const per = fcPeriodos(); keep('#f-per', per.length ? per.map((x, i) => `<option value="${i}">${fmtD(addD(x.a.fecha, 1))} al ${fmtD(x.b.fecha)}</option>`).join('') : '<option value="">Sin dos conteos aún</option>');
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
    days.forEach((d, i) => { const x = m.l + i * bw + bw * 0.12, w = bw * 0.76; s += `<rect x="${x}" y="${y(d.v)}" width="${w}" height="${ih - (y(d.v) - m.t)}" fill="${d.real ? 'var(--c-real)' : 'var(--c-proj)'}" rx="2"><title>${esc(fmtLargo(d.f) + ' · ' + S(d.v) + (d.real ? ' real' : ' proyectado'))}</title></rect>`;
      if (pd(d.f).getUTCDate() % (Wd < 600 ? 5 : 2) === 1) s += `<text x="${x + w / 2}" y="${Ht - m.b + 15}" text-anchor="middle" font-size="10.5" fill="var(--mute)">${pd(d.f).getUTCDate()}</text>`; });
    svg.innerHTML = s;
  };
  svg._draw = draw; draw(); if (!svg._ro) { svg._ro = new ResizeObserver(() => svg._draw()); svg._ro.observe(svg); }
}
const selL = v => v === 'all' ? E.allL : [+v], selC = v => v === 'all' ? E.allC : [+v];
const days7 = [0, 1, 2, 3, 4, 5, 6];
const weekSales = (P, ls = E.allL, cs = E.allC) => days7.reduce((s, d) => s + E.salesDay(P, d, ls, cs), 0);
const compraDe = P => E.purchases(E.needs(P, P.dates.map((_, i) => i), E.D.colchon), ST.stock);
const kpiHTML = arr => arr.map(k => `<div class="card kpi" style="margin:0"><div class="lab">${k[0]}</div><div class="num" ${k[3] ? `style="font-size:${k[3]}"` : ''}>${k[1]}</div>${k[2] ? `<div class="sub">${k[2]}</div>` : ''}</div>`).join('');
const prodReal = () => RAW.produccion_real || [];
const peds = () => RAW.pedidos || [];
const nomU = u => ((RAW.usuarios || []).find(x => x.usuario === u) || {}).nombre || u || '';
const CATS = () => [...new Set(E.PR.map(p => p.cat))];
const pct = v => Math.round(v * 100) + '\u00a0%';
const fxt = f => (f >= 1 ? '+' : '−') + Math.round(Math.abs(f - 1) * 100) + ' %';

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
  // pedidos de la próxima semana sin aprobar
  const nm = nextMonday(), cpN = compraDe(projWeek(nm)), ap = new Set(peds().filter(x => x.semana === nm).map(x => x.proveedor));
  const pend = cpN.grupos.filter(g => g.items.some(x => x.packs > 0) && !ap.has(g.proveedor));
  if (pend.length) out.unshift(['warn', `Pedidos por aprobar: ${pend.length} proveedores para la semana del ${rango(nm)}`, `Total sugerido ${S(pend.reduce((a, g) => a + g.total, 0))}. No salen al proveedor hasta que alguien los apruebe.`,
    plan([['Revisar cantidades y aprobar en Compras (un clic por proveedor o todos juntos)', 'Encargado de compras', 'Antes del lunes'], ['Si un proveedor no puede entregar, anular su pedido y aprobar con otro', 'Compras', 'Mismo día']])]);
  // eventos próximos
  const evs = E.D.eventos.filter(e => e.activo !== false && e.fecha > E.last() && e.fecha <= addD(E.last(), 21));
  if (evs.length) out.push(['ok', `Eventos en las próximas 3 semanas: ${evs.map(e => esc(e.nombre) + ' (' + fmtD(e.fecha) + ', ' + fxt(e.factor) + ')').join('; ')}`, 'La proyección, la orden de producción y las compras ya incluyen el efecto.',
    plan([['Confirmar que el efecto estimado tiene sentido (Proyección › Calendario)', 'Gerencia', 'Una semana antes'], ['Ajustar turnos del obrador y de salón para esos días', 'Jefe de obrador y locales', 'Al armar horarios'], ['Comprar con anticipación los insumos de los productos de temporada', 'Compras', 'Pedido de la semana anterior']])]);
  // food cost real vs teórico del último periodo
  const per = fcPeriodos(); if (per.length) { const r = fcReal(per[0]); const g = r.fcR - r.fcT;
    if (g > 0.015) out.push([g > 0.03 ? 'bad' : 'warn', `Food cost real ${P(r.fcR)} vs. teórico ${P(r.fcT)} (${fmtD(addD(per[0].a.fecha, 1))} al ${fmtD(per[0].b.fecha)})`, `Se gastaron ${S(r.vR - r.vT)} más de lo que indican las recetas: ${S(r.sob)} es sobrante registrado y ${S(Math.max(0, r.vR - r.vT - r.sob))} no tiene explicación. Mayor diferencia: ${r.rows.slice(0, 3).map(x => esc(x.i.nombre)).join(', ')}.`,
      plan([['Producir en tandas y ajustar el stock de seguridad de lo que más sobra', 'Jefe de obrador', 'Próxima semana'], [`Pesar las porciones de ${esc(r.rows[0].i.nombre.toLowerCase())} contra la receta durante 3 días`, 'Jefe de obrador', 'Esta semana'], ['Revisar recepción y almacenamiento (vencidos, mermas, consumo de personal)', 'Compras', 'Esta semana']])]); }
  return out;
}

// ---------- Resumen
function semanasChart() {
  const sh = semanasHist().slice(-10);
  const ws = sh.map(s0 => { let real = 0; for (let i = 0; i < 7; i++) { const k = E.D.fechas.indexOf(addD(s0, i)); if (k >= 0) real += E.realDay(k); } return { s: s0, real, proj: weekSales(projWeek(s0)) }; });
  const nm = nextMonday(); ws.push({ s: nm, real: null, proj: weekSales(projWeek(nm)), next: true }); return ws;
}
function drawAcierto(fig, ws) {
  const svg = fig.querySelector('svg'), tip = fig.querySelector('.tip');
  const draw = () => {
    const Wd = svg.clientWidth, Ht = svg.clientHeight; if (!Wd) return; const m = { l: 52, r: 8, t: 30, b: 34 };
    const raw = Math.max(...ws.map(w => Math.max(w.real || 0, w.proj))) * 1.08; const stp = raw > 80000 ? 20000 : 10000; const mx = Math.ceil(raw / stp) * stp;
    const iw = Wd - m.l - m.r, ih = Ht - m.t - m.b, bw = iw / ws.length, y = v => m.t + ih - v / mx * ih; let s = '<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--c-proj)"/><rect width="2.2" height="6" fill="rgba(255,255,255,.45)"/></pattern></defs>';
    for (let v = 0; v <= mx; v += stp) s += `<line x1="${m.l}" x2="${Wd - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="${v ? 1 : 1.5}"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--mute)">${v / 1000}k</text>`;
    const bar = (x, w, v, fill) => { const t = y(v), h = m.t + ih - t, r = Math.min(4, h); return `<path d="M${x},${m.t + ih} V${t + r} Q${x},${t} ${x + r},${t} H${x + w - r} Q${x + w},${t} ${x + w},${t + r} V${m.t + ih} Z" fill="${fill}"/>`; };
    ws.forEach((w, i) => {
      const x = m.l + i * bw + bw * 0.18, ww = bw * 0.64;
      if (w.next) { s += bar(x, ww, w.proj, 'url(#hatch)'); s += `<text x="${x + ww / 2}" y="${y(w.proj) - 8}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--ink)">${(w.proj / 1000).toFixed(1)}k</text>`; }
      else { s += bar(x, ww, w.real, 'var(--c-real)'); s += `<line x1="${x - 4}" x2="${x + ww + 4}" y1="${y(w.proj)}" y2="${y(w.proj)}" stroke="var(--ink)" stroke-width="2" stroke-linecap="round"/>`;
        if (i === ws.length - 2) s += `<text x="${x + ww / 2}" y="${Math.min(y(w.real), y(w.proj)) - 8}" text-anchor="middle" font-size="12" font-weight="700" fill="var(--ink)">${(w.real / 1000).toFixed(1)}k</text>`; }
      if (Wd >= 560 || i % 2 === ws.length % 2 || w.next) s += `<text x="${x + ww / 2}" y="${Ht - m.b + 17}" text-anchor="middle" font-size="11" fill="var(--mute)" font-weight="${w.next ? 700 : 400}">${w.next ? 'Próx. ' : ''}${fmtD(w.s)}</text>`;
      s += `<rect x="${m.l + i * bw}" y="${m.t}" width="${bw}" height="${ih}" fill="transparent" data-wi="${i}"/>`;
    });
    svg.innerHTML = s;
    svg.querySelectorAll('[data-wi]').forEach(r => {
      const show = () => { const w = ws[+r.dataset.wi], i = +r.dataset.wi; const d = w.real ? w.proj / w.real - 1 : 0;
        tip.innerHTML = w.next ? `<b>Semana del ${rango(w.s)}</b><div class="r"><span>Proyección</span><b>${S(w.proj)}</b></div><div class="r"><span>vs. promedio 4 semanas</span><span>${(() => { const a = ws.slice(-5, -1).reduce((x, z) => x + z.real, 0) / 4; return (w.proj / a - 1 >= 0 ? '+' : '') + P(w.proj / a - 1); })()}</span></div>`
          : `<b>Semana del ${rango(w.s)}</b><div class="r"><span>Venta real</span><b>${S(w.real)}</b></div><div class="r"><span>Proyectado antes</span><span>${S(w.proj)}</span></div><div class="r"><span>Error</span><span>${d >= 0 ? '+' : ''}${P(d)}</span></div>`;
        tip.hidden = false; const bx = m.l + (i + 0.5) * bw; tip.style.left = Math.max(4, Math.min(Wd - tip.offsetWidth - 4, bx - tip.offsetWidth / 2)) + 'px'; tip.style.top = '4px'; r.setAttribute('fill', 'color-mix(in srgb,var(--ink) 6%,transparent)'); };
      r.addEventListener('pointerenter', show); r.addEventListener('pointerleave', () => { tip.hidden = true; r.setAttribute('fill', 'transparent'); });
    });
  };
  svg._draw = draw; draw(); if (!svg._ro) { svg._ro = new ResizeObserver(() => svg._draw()); svg._ro.observe(svg); }
}
function paraHoy() {
  const hoy = hoyLima(), man = addD(hoy, 1), hora = +new Date(Date.now() - 5 * 3600e3).toISOString().slice(11, 13), it = [];
  const bit = RAW.bitacora || [];
  const Pm = E.project([man]); let um = 0; E.production(Pm, 0).prods.forEach(o => um += o.porc);
  const env = bit.find(b => b.usuario === 'Make' && b.accion === 'Orden de producción' && b.detalle && b.detalle.fecha === man);
  it.push([env ? 'ok' : hora >= 18 ? 'bad' : 'warn', `Orden de producción de mañana: ${N(um)} unidades`, env ? `Make la envió al obrador (${env.fecha.slice(11)}).` : hora >= 18 ? 'Ya pasó la hora de envío y no salió: revisa Make.' : 'Make la envía hoy a las 6 p. m. Revísala antes.', '#produccion']);
  const reg = prodReal().filter(r => r.fecha === hoy), np = E.PR.filter(p => p.lugar === 'Obrador').length;
  it.push([reg.length >= np ? 'ok' : reg.length ? 'warn' : 'bad', `Registro de producción de hoy: ${reg.length} de ${np}`, reg.length >= np ? 'Completo, con ' + reg.filter(r => r.foto_url).length + ' fotos.' : 'El obrador debe anotar lo producido y tomar las fotos.', '#produccion']);
  const lag = Math.round((Date.parse(hoy) - Date.parse(E.last())) / 864e5);
  it.push([lag <= 1 ? 'ok' : lag <= 3 ? 'warn' : 'bad', `Ventas cargadas hasta el ${fmtD(E.last())}`, lag <= 1 ? 'Al día.' : `${lag} días de atraso: la proyección usa historia vieja. Revisa la carga de Make o sube el CSV.`, '#ventas']);
  const nm = nextMonday(), cpN = compraDe(projWeek(nm)), ap = new Set(peds().filter(x => x.semana === nm).map(x => x.proveedor));
  const pend = cpN.grupos.filter(g => g.items.some(x => x.packs > 0) && !ap.has(g.proveedor));
  it.push([pend.length ? 'warn' : 'ok', pend.length ? `${pend.length} pedidos por aprobar (${S(pend.reduce((a, g) => a + g.total, 0))})` : 'Pedidos de la próxima semana aprobados', pend.length ? `Para la semana del ${rango(nm)}. Un clic en Compras y Make los envía.` : 'Make se encarga de enviarlos.', '#compras']);
  const xr = peds().filter(x => x.estado === 'enviado' || (x.estado === 'aprobado' && x.semana <= hoy));
  if (xr.length) it.push(['warn', `${xr.length} pedidos por recibir`, 'Al llegar la mercadería, márcalos como recibidos: el stock se suma solo.', '#compras']);
  const cov = +(RAW.config.dias_cobertura || 2), P2 = E.project([...Array(cov)].map((_, i) => addD(hoy, i + 1))), nd = E.needs(P2, diasDe(P2));
  const crit = E.IN.filter(i => i.presCant > 0 && nd[i.id] > (ST.stock[i.id] || 0));
  it.push([crit.length ? 'bad' : 'ok', crit.length ? `${crit.length} insumos no alcanzan para ${cov} días` : 'Stock suficiente para los próximos días', crit.length ? crit.slice(0, 3).map(i => i.nombre).join(', ') + (crit.length > 3 ? '…' : '') : 'Según lo vendido y lo recibido desde el último conteo.', '#compras']);
  const sa = RAW.config.stock_al, dc = sa ? Math.round((Date.parse(hoy) - Date.parse(sa)) / 864e5) : 99;
  it.push([dc <= 7 ? 'ok' : 'warn', sa ? `Último conteo de inventario: ${fmtD(sa)}` : 'Sin conteo de inventario', dc <= 7 ? 'Dentro de la semana.' : `Hace ${dc} días. Contar cada semana mantiene el stock y el food cost real al día.`, '#inventario']);
  const ev = E.D.eventos.filter(e => e.activo !== false && e.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
  if (ev) it.push(['ok', `Próximo evento: ${ev.nombre}`, `${fmtLargo(ev.fecha)} · ${fxt(ev.factor)}${ev.categoria ? ' en ' + ev.categoria : ''}${ev.local !== 'Todos' ? ' (' + ev.local + ')' : ''}. Ya está en la proyección.`, '#proyeccion']);
  const ord = { bad: 0, warn: 1, ok: 2 }; it.sort((a, b) => ord[a[0]] - ord[b[0]]);
  $('#r-hoyd').textContent = `${fmtLargo(hoy)[0].toUpperCase() + fmtLargo(hoy).slice(1)} · primero lo urgente. Toca una tarjeta para ir a resolverlo.`;
  $('#r-hoy').innerHTML = it.map(x => `<a href="${x[3]}" class="${x[0]}"><span class="ic" aria-hidden="true">${x[0] === 'ok' ? '✓' : '!'}</span><span><b>${esc(x[1])}</b><small>${esc(x[2])}</small></span><span class="sr">${x[0] === 'ok' ? 'En orden' : x[0] === 'warn' ? 'Atención' : 'Urgente'}</span></a>`).join('');
}
function plata() {
  const rows = []; const pr = prodReal(); if (pr.length) {
    const ult = pr.reduce((a, r) => r.fecha > a ? r.fecha : a, pr[0].fecha), s0 = lunesDe(ult), sem = pr.filter(r => r.fecha >= s0 && r.fecha <= addD(s0, 6));
    E.PR.forEach((p, i) => { const sb = sem.filter(r => r.producto_id === p.id).reduce((a, r) => a + r.sobrante, 0); if (sb) rows.push([`Sobrante de ${p.nombre}`, sb * E.PC[i], `${N(sb)} und sin vender`, 'Producir en tandas o bajar su stock de seguridad', '#produccion']); });
  }
  const per = fcPeriodos(); if (per.length) { const r = fcReal(per[0]); const ne = r.vR - r.vT - r.sob; if (ne > 0) rows.push(['Merma sin explicar en almacén', ne, `entre conteos del ${fmtD(per[0].a.fecha)} y ${fmtD(per[0].b.fecha)}`, 'Revisar ' + r.rows.slice(0, 2).map(x => x.i.nombre.toLowerCase()).join(' y '), '#costos']); }
  const PJ = projWeek(nextMonday()); E.PR.forEach((p, i) => { if (E.FC[i] > 0.28) { const u = days7.reduce((a, d) => a + E.uDay(PJ, d, i), 0); const v = u * (E.PC[i] - 0.28 * E.NET[i]); if (v > 0) rows.push([`Food cost alto en ${p.nombre}`, v, `${P(E.FC[i])} vs. meta 28 %`, `Precio de ${S(Math.ceil(E.PC[i] / 0.28 * 1.18 * 2) / 2, 2)} o ajustar receta`, '#costos']); } });
  rows.sort((a, b) => b[1] - a[1]); const top = rows.slice(0, 7), tot = rows.reduce((a, r) => a + r[1], 0);
  $('#r-plata-n').innerHTML = `Lo que se pierde en una semana y dónde mirar primero. Suma: <b>${S(tot)}</b> por semana, unos ${S(tot * 52 / 12)} al mes.`;
  $('#r-plata').innerHTML = '<tr><th>Dónde</th><th class="n">S/ por semana</th><th>Qué hacer</th></tr>' + top.map(r => `<tr><td><a href="${r[4]}" style="color:var(--ink)">${esc(r[0])}</a><div class="note">${esc(r[2])}</div></td><td class="n"><b>${S(r[1])}</b></td><td class="note">${esc(r[3])}</td></tr>`).join('');
}
function rResumen() {
  const PJ = projWeek(nextMonday());
  const ws = semanasChart(), past = ws.filter(w => !w.next), errs = past.map(w => Math.abs(w.proj / w.real - 1)), mae = errs.reduce((a, b) => a + b, 0) / errs.length;
  const nx = ws[ws.length - 1], last4 = past.slice(-4).reduce((a, w) => a + w.real, 0) / 4, dv = nx.proj / last4 - 1;
  let units = 0; days7.forEach(d => E.production(PJ, d).prods.forEach(o => units += o.porc));
  const fc = E.fcOf(PJ), cp = compraDe(PJ);
  $('#r-title').textContent = 'Próxima semana: ' + rango(PJ.dates[0]);
  $('#r-sub').textContent = 'Calculado con las ventas hasta el ' + fmtLargo(E.last()) + '. Se actualiza solo cada noche cuando Make carga las ventas.';
  $('#r-kpis').innerHTML = kpiHTML([
    ['Venta proyectada', S(nx.proj), `<span class="${dv >= 0 ? 'up' : 'dn'}">${dv >= 0 ? '+' : ''}${P(dv)}</span> vs. promedio de las últimas 4 semanas`],
    ['Unidades a producir', N(units), 'en el obrador, con ' + P(E.D.colchon, 0) + ' de stock de seguridad'],
    ['Compra estimada', S(cp.total), 'insumos de la semana, ya descontado el stock'],
    ['Food cost teórico', P(fc.fc), 'sobre la venta proyectada sin IGV']]);
  $('#r-lead').innerHTML = `En las últimas ${past.length} semanas el sistema falló en promedio <b>${P(mae)}</b> en la venta semanal (su peor semana: ${P(Math.max(...errs))}). La raya negra es lo que proyectó antes de que pasara cada semana. Para la semana del ${rango(nx.s)} espera <b>${S(nx.proj)}</b>.`;
  drawAcierto($('#r-chart'), ws);
  $('#r-ctab').innerHTML = '<tr><th>Semana</th><th class="n">Real</th><th class="n">Proyectado antes</th><th class="n">Error</th></tr>' + ws.map(w => `<tr><td>${w.next ? '<b>Próxima</b> · ' : ''}${rango(w.s)}</td><td class="n">${w.real == null ? '—' : S(w.real)}</td><td class="n">${S(w.proj)}</td><td class="n">${w.real == null ? '—' : (w.proj / w.real - 1 >= 0 ? '+' : '') + P(w.proj / w.real - 1)}</td></tr>`).join('');
  paraHoy(); plata();
  $('#r-alerts').innerHTML = alertas(PJ).map(a => `<div class="al ${a[0]}"><h4>${a[1]}</h4><p>${a[2]}</p>${a[3]}</div>`).join('');
  const bt = E.backtest();
  $('#r-acc').innerHTML = bt ? `<h3>Detalle por día de la última semana (${rango(bt.dias[0].f)})</h3><p class="note">Lo que el sistema habría proyectado con las ventas anteriores a esa semana, frente a lo que realmente se vendió.</p>
    <div class="grid g4" style="margin:10px 0">${[['Venta proyectada', S(bt.ps)], ['Venta real', S(bt.rs)], ['Diferencia en S/', (bt.dif >= 0 ? '+' : '') + P(bt.dif)], ['Precisión por producto', P(bt.precision)]].map(k => `<div class="kpi"><div class="lab">${k[0]}</div><div class="num" style="font-size:24px">${k[1]}</div></div>`).join('')}</div>
    <div class="scroll"><table><tr><th>Día</th><th class="n">Proyectado</th><th class="n">Real</th><th class="n">Diferencia</th></tr>${bt.dias.map(x => { const p = x.proj.reduce((s, u, pi) => s + u * E.PR[pi].precio, 0), r = x.real.reduce((s, u, pi) => s + u * E.PR[pi].precio, 0); return `<tr><td>${DCORTO[wdOf(x.f)]} ${fmtD(x.f)}</td><td class="n">${S(p)}</td><td class="n">${S(r)}</td><td class="n">${r ? P(p / r - 1) : '—'}</td></tr>` }).join('')}</table></div>
    <p class="note">Precisión por producto = 1 − (suma de errores absolutos en unidades ÷ unidades reales).</p>` : '';
  const tops = E.PR.map((p, pi) => ({ p, u: days7.reduce((s, d) => s + E.uDay(PJ, d, pi), 0) })).map(o => ({ ...o, s: o.u * o.p.precio })).sort((a, b) => b.s - a.s).slice(0, 7);
  $('#r-top').innerHTML = '<tr><th>Producto</th><th class="n">Unidades</th><th class="n">Venta</th></tr>' + tops.map(o => `<tr><td>${esc(o.p.nombre)}</td><td class="n">${N(o.u)}</td><td class="n">${S(o.s)}</td></tr>`).join('');
}

// ---------- Ventas
function rVentas() {
  const ls = selL($('#h-local').value), cs = selC($('#h-canal').value), pr = $('#h-prod').value, med = $('#h-med').value, F = E.D.fechas;
  const [ra, rb] = ST.cal['h-rng'].value; const idx = F.map((f, k) => f >= ra && f <= rb ? k : -1).filter(k => k >= 0);
  if (!idx.length) { $('#h-sub').textContent = 'No hay ventas cargadas en esas fechas.'; $('#h-kpis').innerHTML = ''; $('#h-heat').innerHTML = ''; $('#h-chart svg').innerHTML = ''; return; }
  const sem = idx.length > 31 ? 'all' : 'det';
  const pts = idx.map(k => { const f = F[k], at = E.D.atipicos.filter(a => a.activo !== false && a.fecha === f && ls.some(l => a.local === E.L[l] || a.local === 'Todos')); return { f, v: E.realDay(k, ls, cs, pr, med), at: at.map(a => a.local + ': ' + a.motivo).join('; ') } });
  const tot = pts.reduce((a, p) => a + p.v, 0), unid = idx.reduce((a, k) => a + E.realDay(k, ls, cs, pr, 'u'), 0), venta = idx.reduce((a, k) => a + E.realDay(k, ls, cs, pr, 's'), 0);
  const best = pts.slice().sort((a, b) => b.v - a.v)[0];
  $('#h-sub').textContent = `Del ${fmtLargo(F[idx[0]])} al ${fmtLargo(F[idx[idx.length - 1]])} (${idx.length} días con venta). ` + (sem === 'all' ? 'Elige 31 días o menos para ver el detalle por producto y día.' : 'Detalle por producto y día abajo.');
  $('#h-kpis').innerHTML = kpiHTML([['Venta', S(venta)], ['Unidades', N(unid)], ['Precio promedio por unidad', S(unid ? venta / unid : 0, 2)], ['Mejor día', fmtLargo(best.f), med === 'u' ? N(best.v) + ' und' : S(best.v), '20px']]);
  $('#h-ctitle').textContent = (med === 'u' ? 'Unidades vendidas por día' : 'Venta diaria (S/)');
  drawLine($('#h-chart svg'), pts);
  if (sem === 'all') {
    let mx = 0; const M = [];
    for (let w = lunesDe(F[idx[0]]); w <= F[idx[idx.length - 1]]; w = addD(w, 7)) { const r = []; for (let d = 0; d < 7; d++) { const f = addD(w, d), k = f >= ra && f <= rb ? F.indexOf(f) : -1; const v = k >= 0 ? E.realDay(k, ls, cs, pr, med) : null; r.push({ k, f, v }); if (v != null) mx = Math.max(mx, v); } M.push(r); }
    $('#h-ttitle').textContent = 'Semana por día: el patrón que usa la proyección'; $('#h-tnote').textContent = 'Cada fila es una semana. Leyendo una columna de arriba abajo se ven los mismos días de la semana, que son los que el sistema promedia. Más oscuro = más venta; el borde rojo marca un día atípico.';
    $('#h-heat').innerHTML = '<tr><th>Semana</th>' + DCORTO.map(d => `<th class="n">${d}</th>`).join('') + '<th class="n">Total</th></tr>' + M.map(r => `<tr><td style="white-space:nowrap">${rango(r[0].f)}</td>` + r.map(c => { if (c.v == null) return '<td class="n note">·</td>'; const at = ls.some(l => E.isAtip(c.f, l)); return `<td class="n" style="background:color-mix(in srgb,var(--canela) ${Math.round(c.v / (mx || 1) * 55)}%,transparent);${at ? 'outline:2px solid var(--bad);outline-offset:-2px' : ''}" title="${at ? 'Día atípico' : ''}">${N(c.v)}</td>` }).join('') + `<td class="n"><b>${N(r.reduce((a, c) => a + (c.v || 0), 0))}</b></td></tr>`).join('');
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
function rEventos() {
  const admin = USER.rol === 'admin'; $('#e-form').hidden = !admin;
  const ev = E.D.eventos.slice().sort((a, b) => a.fecha.localeCompare(b.fecha));
  $('#e-table').innerHTML = '<tr><th>Fecha</th><th>Evento</th><th>Local</th><th>Categoría</th><th class="n">Efecto</th><th class="n">Venta proyectada ese día</th><th>Activo</th></tr>' + ev.map(e => {
    let v = '—'; if (e.fecha > E.last()) { const P1 = E.project([e.fecha]); v = S(E.salesDay(P1, 0)); } else { const k = E.D.fechas.indexOf(e.fecha); if (k >= 0) v = S(E.realDay(k)) + ' real'; }
    return `<tr><td style="white-space:nowrap">${fmtLargo(e.fecha)}</td><td>${esc(e.nombre)}</td><td>${esc(e.local)}</td><td>${esc(e.categoria || 'Todas')}</td><td class="n">${admin ? `<select class="xs" data-evf="${e.id}" aria-label="Efecto de ${esc(e.nombre)}">${[0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 1.1, 1.15, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2].concat([e.factor]).filter((x, i, a) => a.indexOf(x) === i).sort((a, b) => a - b).map(x => `<option value="${x}" ${x === e.factor ? 'selected' : ''}>${fxt(x)}</option>`).join('')}</select>` : fxt(e.factor)}</td><td class="n">${v}</td><td><label class="sw2"><input type="checkbox" data-eva="${e.id}" ${e.activo !== false ? 'checked' : ''} ${admin ? '' : 'disabled'}><span></span></label></td></tr>`;
  }).join('');
}
function rProy() {
  rEventos();
  const ls = selL($('#p-local').value), cs = selC($('#p-canal').value), aj = +$('#p-aj').value, last = E.last();
  const [a, b] = ST.cal['p-rng'].value, days = []; for (let f = a; f <= b; f = addD(f, 1)) days.push(f);
  const fut = days.filter(f => f > last), PJ = fut.length ? E.project(fut) : null; ST.pPJ = PJ;
  const unitsDay = (f, pi) => { const k = E.D.fechas.indexOf(f); if (k >= 0) return { u: ls.reduce((x, l) => x + cs.reduce((y, c) => y + E.D.ventas[k][l][c][pi], 0), 0), real: true }; if (f < E.D.fechas[0]) return { u: 0, real: true }; const d = fut.indexOf(f); return { u: Math.ceil(ls.reduce((x, l) => x + E.uLoc(PJ, d, l, cs, pi), 0) * (1 + aj) - 1e-9), real: false }; };
  const porDia = days.length <= 14;
  const cols = porDia ? days.map(f => ({ days: [f], lab: `${DCORTO[wdOf(f)]} ${pd(f).getUTCDate()}`, f })) : (() => { const ws = []; days.forEach(f => { const s0 = lunesDe(f); let w = ws.find(x => x.s === s0); if (!w) ws.push(w = { s: s0, days: [] }); w.days.push(f); }); return ws.map(w => ({ days: w.days, lab: w.days.length === 1 ? fmtD(w.days[0]) : pd(w.days[0]).getUTCDate() + '–' + fmtD(w.days[w.days.length - 1]) })); })();
  const evC = cols.map(c => E.D.eventos.filter(e => e.activo !== false && c.days.includes(e.fecha) && (e.local === 'Todos' || ls.some(l => E.L[l] === e.local))));
  let cat = '', rows = `<tr><th>Producto</th>${cols.map((c, i) => `<th class="n ${evC[i].length ? 'evd' : ''} ${c.days.every(f => f <= last) ? 'past' : ''}">${c.lab}${evC[i].length ? `<span class="ev" title="${esc(evC[i].map(e => e.nombre + ' ' + fxt(e.factor) + (e.categoria ? ' en ' + e.categoria : '') + ' · ' + e.local).join('; '))}">${esc(evC[i][0].nombre.replace(/^Feriado: /, ''))}</span>` : ''}</th>`).join('')}<th class="n">Total</th><th class="n">Venta S/</th></tr>`;
  const T = cols.map(() => 0); let TU = 0, TS = 0, realS = 0, projS = 0; const dayS = days.map(f => ({ f, v: 0, real: f <= last }));
  E.PR.forEach((p, pi) => {
    if (p.cat !== cat) { cat = p.cat; rows += `<tr class="grp"><td colspan="${cols.length + 3}">${esc(cat)}</td></tr>`; }
    const v = cols.map(c => c.days.reduce((x, f) => x + unitsDay(f, pi).u, 0)); days.forEach((f, i) => { const x = unitsDay(f, pi); dayS[i].v += x.u * p.precio; if (x.real) realS += x.u * p.precio; else projS += x.u * p.precio; });
    const sm = v.reduce((x, y) => x + y, 0); v.forEach((x, i) => T[i] += x); TU += sm; TS += sm * p.precio;
    rows += `<tr class="${porDia ? 'click' : ''}" data-p="${pi}"><td>${esc(p.nombre)}</td>${v.map((x, i) => `<td class="n ${cols[i].days.every(f => f <= last) ? 'past' : ''}" ${porDia ? `data-f="${cols[i].f}"` : ''}>${N(x)}</td>`).join('')}<td class="n"><b>${N(sm)}</b></td><td class="n">${S(sm * p.precio)}</td></tr>`;
  });
  rows += `<tr class="tot"><td>Total</td>${T.map(x => `<td class="n">${N(x)}</td>`).join('')}<td class="n">${N(TU)}</td><td class="n">${S(TS)}</td></tr>`;
  $('#p-table').innerHTML = rows;
  const nReal = days.filter(f => f <= last && f >= E.D.fechas[0]).length;
  $('#p-sub').textContent = `Del ${fmtLargo(a)} al ${fmtLargo(b)}. ` + (nReal ? `${nReal} días ya tienen venta real (sombreados) y ${fut.length} se proyectan` : `${fut.length} días proyectados`) + ` con los 4 mismos días anteriores ${E.D.metodo === 'w' ? '(pesos 40/30/20/10)' : '(mismo peso)'}, sin días atípicos y con los eventos del calendario${aj ? `, más un ajuste de ${aj > 0 ? '+' : ''}${P(aj, 0)}` : ''}.`;
  $('#p-tnote').textContent = porDia ? 'Unidades por día. Toca un número proyectado para ver de dónde sale.' : 'Unidades por semana. Elige 14 días o menos para ver cada día y su explicación.';
  const len = days.length, pa = addD(a, -len), pdays = [...Array(len)].map((_, i) => E.D.fechas.indexOf(addD(pa, i))); const pFull = pdays.every(k => k >= 0);
  const pS = pFull ? pdays.reduce((x, k) => x + E.realDay(k, ls, cs), 0) : null;
  $('#p-kpis').innerHTML = kpiHTML([['Venta real en el periodo', S(realS), nReal ? nReal + ' días cargados' : 'aún no hay días vendidos'], ['Proyectado', S(projS), fut.length + ' días por vender'], ['Total estimado', S(realS + projS), pS ? `${(realS + projS) / pS - 1 >= 0 ? '+' : ''}${P((realS + projS) / pS - 1)} vs. los ${len} días anteriores` : ''], ['Unidades', N(TU), 'todas las categorías']]);
  $('#p-ctitle').textContent = 'Venta por día (S/)'; drawDays($('#p-chart svg'), dayS);
}
function explainProd(pi, f) {
  const ls = selL($('#p-local').value), cs = selC($('#p-canal').value), p = E.PR[pi], PJ = ST.pPJ;
  if (!f || f <= E.last() || !PJ || !PJ.EXPL[f + '|0']) { $('#p-exp').innerHTML = `<div class="explain"><h3>${esc(p.nombre)}${f ? ' · ' + fmtLargo(f) : ''}</h3><p class="note">Ese día ya tiene venta real cargada; no es proyección.</p></div>`; return; }
  const blocks = ls.map(l => {
    const vals = PJ.EXPL[f + '|' + l].map(e => ({ ...e, u: cs.reduce((a, c) => a + E.D.ventas[e.k][l][c][pi], 0) })), r = vals.reduce((a, v) => a + v.u * v.w, 0), ev = E.evF(f, l, pi);
    return `<h3 style="margin:8px 0 6px">${esc(E.L[l])}</h3><table><tr><th>Fecha usada</th><th class="n">Vendido</th><th class="n">Peso</th><th class="n">Aporte</th></tr>${vals.map(v => `<tr><td>${fmtLargo(E.D.fechas[v.k])}</td><td class="n">${N(v.u)}</td><td class="n">${P(v.w, 0)}</td><td class="n">${N(v.u * v.w, 2)}</td></tr>`).join('')}${ev !== 1 ? `<tr><td colspan="3">Evento del calendario (${fxt(ev)})</td><td class="n">× ${N(ev, 2)}</td></tr>` : ''}<tr class="tot"><td>Resultado</td><td></td><td></td><td class="n">${N(r * ev, 2)} → ${N(Math.ceil(r * ev - 1e-9))} und</td></tr></table>`;
  }).join('');
  const sk = E.D.atipicos.filter(a => a.activo !== false && wdOf(a.fecha) === wdOf(f) && ls.some(l => a.local === E.L[l] || a.local === 'Todos'));
  $('#p-exp').innerHTML = `<div class="explain"><h3>${esc(p.nombre)} · ${fmtLargo(f)}</h3><p class="note" style="margin:4px 0 0">Se redondea hacia arriba por local. ${sk.length ? 'Se saltaron días atípicos: ' + sk.map(a => fmtD(a.fecha) + ' (' + esc(a.local) + ')').join(', ') + '.' : ''}</p>${blocks}</div>`;
  $('#p-exp').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------- Producción
function rProd() {
  const s = lunesDe(ST.cal['o-dia'].value), PJ = projWeek(s), H = PJ.dates;
  $('#o-tabs').innerHTML = H.map((f, d) => `<button class="tab ${ST.day === d ? 'on' : ''}" data-d="${d}">${DCORTO[wdOf(f)]} ${pd(f).getUTCDate()}</button>`).join('') + `<button class="tab ${ST.day === 7 ? 'on' : ''}" data-d="7">Semana completa</button>`;
  let prods, bases;
  if (ST.day < 7) ({ prods, bases } = E.production(PJ, ST.day));
  else { bases = {}; const acc = {}; days7.forEach(d => { const r = E.production(PJ, d); r.prods.forEach(o => { const a = acc[o.pi] || (acc[o.pi] = { ...o, proj: 0, per: E.L.map(() => 0), need: 0, ent: 0, porc: 0 }); a.proj += o.proj; o.per.forEach((x, l) => a.per[l] += x); a.need += o.need; a.ent += o.ent; a.porc += o.porc; }); Object.entries(r.bases).forEach(([b, g]) => bases[b] = (bases[b] || 0) + g); }); prods = Object.values(acc); }
  const when = ST.day < 7 ? `para la venta del ${fmtLargo(H[ST.day])} · preparar el ${fmtLargo(addD(H[ST.day], -1))}` : `semana del ${rango(H[0])}`;
  $('#o-t1').textContent = 'Productos terminados — ' + when; $('#o-t2').textContent = 'Recetas base a preparar — ' + when;
  $('#o-prod').innerHTML = '<thead><tr><th>Producto</th><th class="n">Proyectado</th><th class="n">Con stock de seguridad</th><th class="n">A producir</th>' + E.L.map(l => `<th class="n">Despacho ${esc(l)}</th>`).join('') + '</tr></thead><tbody>' + prods.map(o => `<tr><td data-l="Producto"><b>${esc(o.p.nombre)}</b></td><td class="n" data-l="Proyectado">${N(o.proj)}</td><td class="n" data-l="Con seguridad">${N(o.need)}</td><td class="n" data-l="A producir"><b>${o.p.porc > 1 ? N(o.ent) + ' ' + esc(o.ent === 1 ? o.p.uprod : PLU[o.p.uprod]) + ' (' + N(o.porc) + ' porc.)' : N(o.porc) + ' und'}</b></td>${o.per.map((x, l) => `<td class="n" data-l="Despacho ${esc(E.L[l])}">${N(x)}</td>`).join('')}</tr>`).join('') + '</tbody>';
  const bl = Object.entries(bases).sort((a, b) => E.BAS[a[0]].area.localeCompare(E.BAS[b[0]].area) || a[0].localeCompare(b[0]));
  $('#o-base').innerHTML = '<tr><th>Receta base</th><th>Área</th><th class="n">Cantidad</th><th class="n">Tandas*</th><th class="n">Vida útil</th></tr>' + bl.map(([b, g]) => `<tr class="click" data-b="${b}" data-g="${g}"><td>${esc(E.BAS[b].nombre)}</td><td><span class="pill">${esc(E.BAS[b].area)}</span></td><td class="n"><b>${N(Math.ceil(g / 10) * 10 / 1000, 2)} kg</b></td><td class="n">${N(g / E.baseYield(E.BAS[b]), 2)}</td><td class="n">${E.BAS[b].vida} ${E.BAS[b].vida === 1 ? 'día' : 'días'}</td></tr>`).join('') + `<tr><td colspan="5" class="note">*Una tanda es la receta estándar del recetario.</td></tr>`;
  $('#o-exp').innerHTML = '';
  $('#o-tdc').hidden = ST.day === 7 || !E.TD.length;
  if (ST.day < 7 && E.TD.length) {
    const f = H[ST.day]; $('#o-t4').textContent = 'Tandas del día — ' + fmtLargo(f) + (wdOf(f) >= 5 ? ' (patrón de fin de semana)' : ' (patrón de lunes a viernes)');
    const T = E.TD; let tot = T.map(() => 0);
    $('#o-td').innerHTML = `<tr><th>Producto</th>${T.map(t => `<th class="n">${esc(t.nombre)}<br><span class="note" style="font-weight:400">hornear ${esc(t.hornear)}</span></th>`).join('')}</tr>` + prods.map(o => {
      const r = E.tandas(o, f); if (o.p.porc === 1) r.tot.forEach((x, i) => tot[i] += x);
      return `<tr class="click" data-hp="${o.p.id}" title="${E.L.map((l, li) => l + ': ' + r.porL[li].join(' / ')).join(' · ')}"><td>${esc(o.p.nombre)}</td>${r.tot.map((x, i) => `<td class="n">${o.p.porc > 1 ? (i === 0 ? '<b>' + N(o.ent) + ' ' + esc(o.ent === 1 ? o.p.uprod : PLU[o.p.uprod]) + '</b>' : '—') : x ? '<b>' + N(x) + '</b>' : '—'}</td>`).join('')}</tr>`;
    }).join('') + `<tr class="tot"><td>Unidades por tanda</td>${tot.map(x => `<td class="n">${N(x)}</td>`).join('')}</tr>`;
    rHoras(f);
  }
  // KPIs de la semana y registro real
  const pr = prodReal().filter(r => r.fecha >= H[0] && r.fecha <= H[6]);
  const pl = pr.reduce((a, r) => a + r.planificado, 0), pdc = pr.reduce((a, r) => a + r.producido, 0), sbv = pr.reduce((a, r) => a + r.sobrante * (E.PC[E.PRI[r.producto_id]] || 0), 0), fotos = pr.filter(r => r.foto_url).length;
  let wk = 0; days7.forEach(d => E.production(PJ, d).prods.forEach(o => wk += o.porc));
  $('#o-kpis').innerHTML = kpiHTML([['A producir en la semana', N(wk), 'unidades y porciones'], ['Cumplimiento registrado', pl ? P(pdc / pl) : '—', pl ? `${N(pdc)} de ${N(pl)}` : 'sin registros aún'], ['Sobrante al cierre (a costo)', pl ? S(sbv) : '—', 'producido que no se vendió'], ['Registros con foto', N(fotos), `de ${N(pr.length)} registros`]]);
  const regOk = ST.day < 7 && (USER.rol === 'admin' || USER.rol === 'obrador');
  $('#o-regc').hidden = ST.day === 7;
  if (ST.day < 7) {
    const f = H[ST.day]; $('#o-t3').textContent = 'Registro de producción real — ' + fmtLargo(f);
    ST.fotos = {}; $('#o-saveall').disabled = $('#o-saveall2').disabled = !regOk; $$('.save-all').forEach(b => b.classList.remove('dirty')); $('#o-pend').textContent = regOk ? '' : 'Solo el obrador o administración pueden registrar.';
    $('#o-reg').innerHTML = '<thead><tr><th>Producto</th><th class="n">Planificado</th><th class="n">Producido</th><th class="n">Sobrante al cierre</th><th>Foto</th><th>Estado</th></tr></thead><tbody>' + prods.map(o => {
      const r = prodReal().find(x => x.fecha === f && x.producto_id === o.p.id); const c = r ? r.producido / (r.planificado || 1) : null;
      return `<tr data-reg="${o.p.id}" data-plan="${o.porc}"><td data-l="Producto"><b>${esc(o.p.nombre)}</b></td><td class="n" data-l="Planificado">${N(o.porc)}</td><td class="n" data-l="Producido"><input class="xs" type="number" min="0" data-f="producido" value="${r ? r.producido : ''}" placeholder="${o.porc}" ${regOk ? '' : 'disabled'} aria-label="Producido de ${esc(o.p.nombre)}"></td><td class="n" data-l="Sobrante"><input class="xs" type="number" min="0" data-f="sobrante" value="${r ? r.sobrante : ''}" placeholder="0" ${regOk ? '' : 'disabled'} aria-label="Sobrante de ${esc(o.p.nombre)}"></td>
        <td data-l="Foto">${r && r.foto_url ? `<a href="${esc(r.foto_url)}" target="_blank" rel="noopener"><img class="thumb" src="${esc(r.foto_url)}" alt="Foto de ${esc(o.p.nombre)}"></a>` : ''}<span data-fprev></span>${regOk ? `<label class="btn ghost" style="min-height:36px;padding:5px 10px;font-size:13px;display:inline-flex;align-items:center;margin-top:4px">${r && r.foto_url ? 'Cambiar foto' : 'Tomar foto'}<input type="file" accept="image/*" capture="environment" data-foto hidden></label>` : ''}</td>
        <td data-l="Estado">${r ? `<span class="badge ${c >= 0.98 ? 'ok-b' : 'warn-b'}">${c >= 0.98 ? 'Completo' : 'Incompleto ' + P(c, 0)}</span><div class="note">${esc(r.usuario || '')} · ${esc(r.actualizado || '')}</div>` : '<span class="badge">Pendiente</span>'}</td>
</tr>`;
    }).join('') + '</tbody>';
  }
}
function rHoras(f) {
  const pid = $('#o-hprod').value || 'P02', td = wdOf(f) >= 5 ? 'fs' : 'lv', cur = (E.D.curva[pid] || {}), hs = [...Array(14)].map((_, i) => 7 + i);
  const ser = E.L.map(l => hs.map(h => ((cur[l] || {})[td] || {})[h] || 0));
  const p = E.PR[E.PRI[pid]]; const sh = E.L.map((_, l) => E.shares(pid, l, f));
  $('#o-hnote').textContent = `Promedio de unidades vendidas por hora (${td === 'fs' ? 'sábados y domingos' : 'lunes a viernes'}, últimas 4 semanas). ` + E.L.map((l, li) => `${l}: ${sh[li].map((x, i) => E.TD[i].nombre.toLowerCase() + ' ' + pct(x)).join(', ')}`).join(' · ') + (p.porc > 1 ? '. Este producto se hornea entero en la primera tanda.' : '.');
  const svg = $('#o-hchart svg');
  const draw = () => {
    const Wd = svg.clientWidth, Ht = svg.clientHeight; if (!Wd) return; const m = { l: 34, r: 6, t: 18, b: 26 };
    const mx = Math.max(1, ...ser.flat()) * 1.15, iw = Wd - m.l - m.r, ih = Ht - m.t - m.b, bw = iw / hs.length, y = v => m.t + ih - v / mx * ih; let s = '';
    E.TD.forEach((t, i) => { const x0 = m.l + (t.desde - 7) * bw, x1 = m.l + (t.hasta - 7 + 1) * bw; s += `<rect x="${x0}" y="${m.t - 14}" width="${x1 - x0}" height="${ih + 14}" fill="${i % 2 ? 'var(--arcilla)' : 'transparent'}" opacity=".55"/><text x="${(x0 + x1) / 2}" y="${m.t - 4}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--mute)">${esc(t.nombre)}</text>`; });
    const stp = mx > 20 ? 5 : mx > 8 ? 2 : 1; for (let v = 0; v <= mx; v += stp) s += `<line x1="${m.l}" x2="${Wd - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${m.l - 5}" y="${y(v) + 4}" text-anchor="end" font-size="10.5" fill="var(--mute)">${v}</text>`;
    hs.forEach((h, i) => { ser.forEach((v, li) => { const w = bw * 0.36, x = m.l + i * bw + bw * 0.12 + li * w; s += `<rect x="${x}" y="${y(v[i])}" width="${w}" height="${ih - (y(v[i]) - m.t)}" fill="${li ? 'var(--canela)' : 'var(--cacao)'}" rx="1.5"><title>${esc(E.L[li])} · ${h}:00 · ${N(v[i], 1)} und</title></rect>`; });
      if (Wd > 420 || i % 2 === 0) s += `<text x="${m.l + i * bw + bw / 2}" y="${Ht - 8}" text-anchor="middle" font-size="10.5" fill="var(--mute)">${h}h</text>`; });
    svg.innerHTML = s;
  };
  svg._draw = draw; draw(); if (!svg._ro) { svg._ro = new ResizeObserver(() => svg._draw()); svg._ro.observe(svg); }
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
function marcarPend() {
  const n = $$('#o-reg tr.dirty').length, nf = Object.keys(ST.fotos).length;
  $('#o-pend').textContent = n ? `${n} productos con cambios${nf ? ', ' + nf + ' fotos' : ''} sin guardar.` : '';
  $$('.save-all').forEach(b => b.classList.toggle('dirty', n > 0));
}
async function guardarTodo() {
  const f = projWeek(lunesDe(ST.cal['o-dia'].value)).dates[ST.day]; const trs = $$('#o-reg tr[data-reg]'); if (!trs.length) return;
  const regs = trs.map(tr => { const pid = tr.dataset.reg, prod = tr.querySelector('[data-f=producido]'), sob = tr.querySelector('[data-f=sobrante]'), ex = prodReal().find(x => x.fecha === f && x.producto_id === pid);
    return { producto_id: pid, planificado: +tr.dataset.plan, producido: prod.value === '' ? (ex ? ex.producido : +tr.dataset.plan) : +prod.value, sobrante: sob.value === '' ? (ex ? ex.sobrante : 0) : +sob.value }; });
  const conFoto = regs.filter(r => ST.fotos[r.producto_id]), sin = regs.filter(r => !ST.fotos[r.producto_id]);
  const lotes = [sin]; for (let i = 0; i < conFoto.length; i += 3) lotes.push(conFoto.slice(i, i + 3));
  $$('.save-all').forEach(b => { b.disabled = true; b.textContent = 'Guardando…'; });
  try {
    let hechos = 0;
    for (const lote of lotes) { if (!lote.length) continue;
      for (const r of lote) if (ST.fotos[r.producto_id]) r.foto = await fileToB64(ST.fotos[r.producto_id]);
      const res = await api('/produccion-real', { method: 'POST', body: JSON.stringify({ fecha: f, registros: lote }) });
      const now = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
      lote.forEach(r => { const list = RAW.produccion_real, ex = list.find(x => x.fecha === f && x.producto_id === r.producto_id);
        const rec = { fecha: f, producto_id: r.producto_id, planificado: r.planificado, producido: r.producido, sobrante: r.sobrante, foto_url: (res.fotos || {})[r.producto_id] || ex?.foto_url || null, usuario: USER.usuario || USER.nombre, actualizado: now };
        if (ex) Object.assign(ex, rec); else list.push(rec); });
      hechos += lote.length; $$('.save-all').forEach(b => b.textContent = `Guardando… ${hechos}/${regs.length}`);
    }
    ST.fotos = {}; rProd(); toast(`Producción guardada: ${regs.length} productos${conFoto.length ? ', ' + conFoto.length + ' fotos' : ''}`);
  } catch (x) { toast(x.message); }
  finally { $$('.save-all').forEach(b => { b.disabled = false; b.textContent = 'Guardar todo'; }); }
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
  const [s, s1] = ST.cal['c-rng'].value, PJ = projRange(s, s1), cp = compraDe(PJ), venta = diasDe(PJ).reduce((a, d) => a + E.salesDay(PJ, d), 0), u = (RAW.inventarios || [])[0];
  $('#c-sub').textContent = `Insumos para producir del ${fmtLargo(s)} al ${fmtLargo(s1)} (${PJ.dates.length} días) y preparar las bebidas en barra, con ${P(E.D.colchon, 0)} de stock de seguridad. Ya descuenta lo vendido desde el último conteo.`;
  $('#c-note').innerHTML = `Detalle del pedido sugerido. El stock sale del último inventario${u ? ` (<b>${fmtLargo(u.fecha)}</b>)` : ''} más lo recibido después; también puedes corregirlo aquí. Se pide en la presentación del proveedor, redondeando hacia arriba.`;
  const can = USER.rol === 'admin' || USER.rol === 'compras', ps = peds().filter(x => x.semana === s);
  const EST = { aprobado: ['info-b', 'Aprobado'], enviado: ['warn-b', 'Enviado al proveedor'], recibido: ['ok-b', 'Recibido'] };
  const filas = cp.grupos.filter(g => g.items.some(x => x.packs > 0) || ps.some(x => x.proveedor === g.proveedor)).map(g => ({ g, pe: ps.find(x => x.proveedor === g.proveedor) }));
  ps.filter(x => !filas.some(f => f.pe === x)).forEach(pe => filas.push({ g: null, pe }));
  $('#c-ped').innerHTML = '<tr><th>Proveedor</th><th class="n">Ítems</th><th class="n">Total</th><th>Estado</th><th>Seguimiento</th><th></th></tr>' + filas.map(({ g, pe }) => {
    const nItems = pe ? pe.items.length : g.items.filter(x => x.packs > 0).length, tot = pe ? +pe.total : g.total, prov = pe ? pe.proveedor : g.proveedor;
    const st = pe ? `<span class="badge ${EST[pe.estado][0]}">${EST[pe.estado][1]}</span>` : '<span class="badge">Sugerido, por aprobar</span>';
    const seg = pe ? [`Aprobó ${esc(nomU(pe.aprobado_por))} · ${esc(pe.aprobado_en || '')}`, pe.enviado_en ? 'Enviado ' + esc(pe.enviado_en) : '', pe.fecha_recepcion ? `Recibió ${esc(nomU(pe.recibido_por))} el ${fmtD(pe.fecha_recepcion)}` : ''].filter(Boolean).join('<br>') : '';
    const btn = !can ? '' : !pe ? `<button class="btn-sm" data-apr="${esc(prov)}">Aprobar</button>` : pe.estado === 'recibido' ? '' : `${pe.estado === 'aprobado' ? `<button class="ghost btn-sm" data-pan="${pe.id}">Anular</button> ` : ''}<button class="btn-sm" data-prc="${pe.id}">Recibido</button>`;
    const diff = pe && g && pe.estado === 'aprobado' && Math.abs(+pe.total - g.total) > 1 ? `<div class="note">El sugerido cambió a ${S(g.total, 2)}. <a href="#compras" data-apr="${esc(prov)}" style="color:var(--canela)">Volver a aprobar</a></div>` : '';
    return `<tr><td>${esc(prov)}</td><td class="n">${N(nItems)}</td><td class="n">${S(tot, 2)}</td><td>${st}${diff}</td><td class="note">${seg}</td><td style="white-space:nowrap">${btn}</td></tr>`;
  }).join('') + (filas.length ? '' : '<tr><td colspan="6" class="note">No hay nada que pedir esa semana.</td></tr>');
  $('#c-all').disabled = !can || !filas.some(f => !f.pe);
  let rows = '<tr><th>Insumo</th><th class="n">Requerido</th><th class="n">Stock actual</th><th class="n">Faltante</th><th>Presentación</th><th class="n">Pedir</th><th class="n">Costo</th></tr>';
  cp.grupos.forEach(g => { rows += `<tr class="grp"><td colspan="6">${esc(g.proveedor)}</td><td class="n">${S(g.total, 2)}</td></tr>` + g.items.map(x => `<tr><td>${esc(x.i.nombre)}</td><td class="n">${N(x.need / 1000, 2)} ${uKg(x.i)}</td><td class="n"><input class="sm" type="number" min="0" step="0.1" data-st="${x.i.id}" value="${+(x.stock / 1000).toFixed(2)}" aria-label="Stock de ${esc(x.i.nombre)} en ${uKg(x.i)}"></td><td class="n">${N(x.falt / 1000, 2)} ${uKg(x.i)}</td><td>${esc(x.i.pres)}</td><td class="n"><b>${x.packs}</b></td><td class="n">${S(x.costo, 2)}</td></tr>`).join(''); });
  rows += `<tr class="tot"><td colspan="6">Total de la compra</td><td class="n">${S(cp.total, 2)}</td></tr>`;
  $('#c-table').innerHTML = rows;
  $('#c-kpis').innerHTML = kpiHTML([['Compra total', S(cp.total)], ['Insumos a pedir', N(cp.items)], ['Proveedores', N(cp.grupos.filter(g => g.total > 0).length)], ['Compra / venta sin IGV', P(cp.total / (venta / 1.18))]]);
}

async function aprobar(provs) {
  const [s, s1] = ST.cal['c-rng'].value, cp = compraDe(projRange(s, s1)); let n = 0;
  try {
    for (const prov of provs) { const g = cp.grupos.find(x => x.proveedor === prov); if (!g) continue;
      const items = g.items.filter(x => x.packs > 0).map(x => ({ insumo_id: x.i.id, nombre: x.i.nombre, presentacion: x.i.pres, packs: x.packs, cantidad: x.packs * x.i.presCant, costo: Math.round(x.costo * 100) / 100 }));
      await api('/pedidos', { method: 'POST', body: JSON.stringify({ semana: s, proveedor: prov, items }) }); n++; }
    await loadData('Actualizando…'); toast(n === 1 ? 'Pedido aprobado: Make lo envía hoy a las 6 p. m.' : `${n} pedidos aprobados: Make los envía hoy a las 6 p. m.`);
  } catch (x) { toast(x.message); }
}
async function accionPedido(id, accion) {
  try { await api('/pedidos', { method: 'PATCH', body: JSON.stringify({ id, accion, fecha: hoyLima() }) }); await loadData('Actualizando…'); toast(accion === 'recibir' ? 'Recepción registrada: el stock se actualizó' : 'Pedido anulado'); } catch (x) { toast(x.message); }
}

// ---------- Food cost real vs teórico
function fcPeriodos() {
  const inv = (RAW.inventarios || []).filter(x => x.det && x.det.length).slice().sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id - b.id);
  const out = []; for (let i = 1; i < inv.length; i++) if (inv[i].fecha > inv[i - 1].fecha) out.push({ a: inv[i - 1], b: inv[i] });
  return out.reverse();
}
function fcReal(per) {
  const ini = Object.fromEntries(per.a.det.map(d => [d[0], +d[2]])), fin = Object.fromEntries(per.b.det.map(d => [d[0], +d[2]])), sis = Object.fromEntries(per.b.det.map(d => [d[0], +d[1]]));
  const f0 = addD(per.a.fecha, 1), f1 = per.b.fecha, comp = {};
  peds().filter(x => x.estado === 'recibido' && x.fecha_recepcion > per.a.fecha && x.fecha_recepcion <= f1).forEach(x => x.items.forEach(it => comp[it.insumo_id] = (comp[it.insumo_id] || 0) + +it.cantidad));
  const uv = E.unidadesVendidas(f0, f1), teo = E.consumo(uv), neto = uv.reduce((a, u, pi) => a + u * E.NET[pi], 0);
  const sob = prodReal().filter(r => r.fecha >= f0 && r.fecha <= f1).reduce((a, r) => a + r.sobrante * (E.PC[E.PRI[r.producto_id]] || 0), 0);
  const rows = E.IN.filter(i => i.precioKg > 0 && (ini[i.id] !== undefined || fin[i.id] !== undefined)).map(i => {
    const a = ini[i.id] || 0, c = comp[i.id] || 0, z = fin[i.id] || 0, real = a + c - z, t = teo[i.id] || 0, k = i.precioKg / 1000;
    return { i, a, c, z, real, t, d: real - t, vR: real * k, vT: t * k, vD: (real - t) * k, inv: ((sis[i.id] ?? z) - z) * k };
  }).sort((x, y) => y.vD - x.vD);
  const vR = rows.reduce((a, r) => a + r.vR, 0), vT = rows.reduce((a, r) => a + r.vT, 0), vC = rows.reduce((a, r) => a + r.c * r.i.precioKg / 1000, 0);
  return { rows, vR, vT, vC, neto, sob, fcR: neto ? vR / neto : 0, fcT: neto ? vT / neto : 0, f0, f1 };
}
function rFcReal() {
  const per = fcPeriodos(), x = per[+$('#f-per').value || 0];
  if (!x) { $('#f-sub').textContent = 'Hacen falta al menos dos conteos de inventario para calcularlo.'; $('#f-kpis').innerHTML = ''; $('#f-table').innerHTML = ''; $('#f-exp').innerHTML = ''; return; }
  const r = fcReal(x), gap = r.vR - r.vT, noExp = gap - r.sob;
  $('#f-sub').textContent = `Del ${fmtLargo(r.f0)} al ${fmtLargo(r.f1)}: entre el conteo del ${fmtD(x.a.fecha)} (${nomU(x.a.usuario)}) y el del ${fmtD(x.b.fecha)} (${nomU(x.b.usuario)}). Venta sin IGV ${S(r.neto)}; compras recibidas ${S(r.vC)}.`;
  $('#f-kpis').innerHTML = kpiHTML([['Food cost teórico', P(r.fcT), S(r.vT) + ' según recetas'], ['Food cost real', `<span style="color:${fcCol(r.fcR)}">${P(r.fcR)}</span>`, S(r.vR) + ' consumidos de verdad'], ['Brecha', (gap >= 0 ? '+' : '') + S(gap), `${(r.fcR - r.fcT) >= 0 ? '+' : ''}${N((r.fcR - r.fcT) * 100, 1)} puntos de food cost`], ['De dónde sale la brecha', S(r.sob) + ' sobrante', S(Math.max(0, noExp)) + ' sin explicar (merma, porciones, pérdidas)', '20px']]);
  $('#f-table').innerHTML = '<tr><th>Insumo</th><th class="n">Inicial</th><th class="n">Compras</th><th class="n">Final</th><th class="n">Consumo real</th><th class="n">Según recetas</th><th class="n">Diferencia</th><th class="n">Diferencia S/</th></tr>' + r.rows.filter(z => z.real || z.t).map(z => { const u = uKg(z.i), q = v => N(v / 1000, 2); return `<tr><td>${esc(z.i.nombre)}</td><td class="n">${q(z.a)}</td><td class="n">${q(z.c)}</td><td class="n">${q(z.z)}</td><td class="n">${q(z.real)} ${u}</td><td class="n">${q(z.t)} ${u}</td><td class="n ${z.d > 0 ? 'diff-neg' : 'diff-pos'}">${z.d > 0 ? '+' : ''}${q(z.d)} (${z.t ? (z.d / z.t * 100 >= 0 ? '+' : '') + N(z.d / z.t * 100, 0) + ' %' : '—'})</td><td class="n"><b>${S(z.vD, 2)}</b></td></tr>`; }).join('') + `<tr class="tot"><td>Total</td><td></td><td class="n">${S(r.vC)}</td><td></td><td class="n">${S(r.vR)}</td><td class="n">${S(r.vT)}</td><td></td><td class="n">${S(gap)}</td></tr>`;
  const top = r.rows.slice(0, 3);
  $('#f-exp').innerHTML = `<div class="alerts" style="margin-bottom:12px"><div class="al ${r.fcR - r.fcT > 0.03 ? 'bad' : 'warn'}"><h4>Plan de acción</h4><p>Lo que más explica la brecha: ${top.map(z => `${esc(z.i.nombre)} (${S(z.vD)})`).join(', ')}.</p><table><tr><th>Qué hacer</th><th>Responsable</th><th>Plazo</th></tr>
    <tr><td>Bajar el sobrante: producir en tandas y revisar el stock de seguridad de los productos que más sobran (${S(r.sob)} en el periodo)</td><td>Jefe de obrador</td><td>Próxima semana</td></tr>
    <tr><td>Pesar ${esc(top[0].i.nombre.toLowerCase())} en cada receta durante 3 días y comparar contra el recetario</td><td>Jefe de obrador</td><td>Esta semana</td></tr>
    <tr><td>Revisar recepción, rotación y vencimientos en almacén; registrar mermas al momento</td><td>Compras</td><td>Esta semana</td></tr>
    <tr><td>Repetir el conteo de los 5 insumos con más diferencia para descartar error de conteo</td><td>Compras</td><td>Próximo conteo</td></tr></table></div></div>`;
}

// ---------- Indicadores por persona
const semaf = (ok, warn) => ok ? 'ok-b' : warn ? 'warn-b' : 'bad-b';
function rInd() {
  const [w, w1] = ST.cal['x-rng'].value;
  const pr = prodReal().filter(r => r.fecha >= w && r.fecha <= w1);
  const us = [...new Set(pr.map(r => r.usuario))];
  const obr = us.map(u => { const rr = pr.filter(r => r.usuario === u || nomU(r.usuario) === u); const pl = rr.reduce((a, r) => a + r.planificado, 0), pdc = rr.reduce((a, r) => a + r.producido, 0), sb = rr.reduce((a, r) => a + r.sobrante, 0), sv = rr.reduce((a, r) => a + r.sobrante * (E.PC[E.PRI[r.producto_id]] || 0), 0), fo = rr.filter(r => r.foto_url).length, at = rr.filter(r => (r.actualizado || '') <= r.fecha + ' 10:00').length;
    return { u, n: rr.length, c: pl ? pdc / pl : 0, sp: pdc ? sb / pdc : 0, sv, fp: rr.length ? fo / rr.length : 0, tp: rr.length ? at / rr.length : 0 }; }).sort((a, b) => nomU(a.u).localeCompare(nomU(b.u)));
  $('#x-obr').innerHTML = '<tr><th>Persona</th><th class="n">Registros</th><th class="n">Cumplimiento</th><th class="n">Sobrante</th><th class="n">Sobrante a costo</th><th class="n">Con foto</th><th class="n">A tiempo</th></tr>' + (obr.length ? obr.map(o => `<tr><td><b>${esc(nomU(o.u))}</b></td><td class="n">${N(o.n)}</td><td class="n"><span class="badge ${semaf(o.c >= 0.98, o.c >= 0.95)}">${P(o.c)}</span></td><td class="n"><span class="badge ${semaf(o.sp <= 0.05, o.sp <= 0.08)}">${P(o.sp)}</span></td><td class="n">${S(o.sv)}</td><td class="n"><span class="badge ${semaf(o.fp >= 0.99, o.fp >= 0.85)}">${pct(o.fp)}</span></td><td class="n"><span class="badge ${semaf(o.tp >= 0.95, o.tp >= 0.8)}">${pct(o.tp)}</span></td></tr>`).join('') : '<tr><td colspan="7" class="note">Sin registros de producción esa semana.</td></tr>');
  const ps = peds(), inv = (RAW.inventarios || []);
  const cu = (RAW.usuarios || []).filter(x => x.rol === 'compras').map(x => x.usuario);
  ps.forEach(p => [p.aprobado_por, p.recibido_por].forEach(u => { if (u && !cu.includes(u) && (RAW.usuarios || []).some(x => x.usuario === u && x.rol !== 'obrador')) cu.push(u); }));
  const com = cu.map(u => {
    const ap = ps.filter(p => p.aprobado_por === u && p.semana >= w && p.semana <= w1), apT = ap.filter(p => (p.aprobado_en || '') < p.semana + ' 00:00').length;
    const rc = ps.filter(p => p.recibido_por === u && p.fecha_recepcion >= w && p.fecha_recepcion <= w1);
    const cs = inv.filter(i => i.usuario === u && i.fecha >= addD(w, -1) && i.fecha <= w1 && i.det);
    const ex = cs.map(i => { let d = 0, t = 0; i.det.forEach(x => { const k = (E.INS[x[0]] || { precioKg: 0 }).precioKg / 1000; d += Math.abs(x[2] - x[1]) * k; t += x[1] * k; }); return t ? 1 - d / t : 1; });
    return { u, ap: ap.length, apT, rc: rc.length, cs: cs.length, ex: ex.length ? ex.reduce((a, b) => a + b, 0) / ex.length : null, csF: cs.map(i => fmtD(i.fecha)).join(', ') };
  }).filter(o => o.ap || o.rc || o.cs);
  $('#x-com').innerHTML = '<tr><th>Persona</th><th class="n">Pedidos aprobados</th><th class="n">A tiempo</th><th class="n">Recepciones registradas</th><th class="n">Conteos</th><th class="n">Exactitud del conteo</th></tr>' + (com.length ? com.map(o => `<tr><td><b>${esc(nomU(o.u))}</b></td><td class="n">${N(o.ap)}</td><td class="n">${o.ap ? `<span class="badge ${semaf(o.apT === o.ap, o.apT >= o.ap * 0.8)}">${o.apT} de ${o.ap}</span>` : '—'}</td><td class="n">${N(o.rc)}</td><td class="n">${o.cs ? N(o.cs) + ' <span class="note">(' + o.csF + ')</span>' : '—'}</td><td class="n">${o.ex == null ? '—' : `<span class="badge ${semaf(o.ex >= 0.97, o.ex >= 0.94)}">${P(o.ex)}</span>`}</td></tr>`).join('') : '<tr><td colspan="6" class="note">Sin movimientos de compras esa semana.</td></tr>');
  const tot = pr.reduce((a, r) => a + r.planificado, 0), tp = pr.reduce((a, r) => a + r.producido, 0);
  $('#x-kpis').innerHTML = kpiHTML([['Personas con registros', N(obr.length + com.length)], ['Cumplimiento del obrador', tot ? P(tp / tot) : '—'], ['Sobrante de la semana', S(obr.reduce((a, o) => a + o.sv, 0))], ['Pedidos aprobados', N(ps.filter(p => p.semana >= w && p.semana <= w1).length)]]);
  const plans = [];
  obr.forEach(o => {
    if (o.tp < 0.95) plans.push(['warn', `${esc(nomU(o.u))}: registra tarde (${pct(o.tp)} a tiempo)`, 'Si el registro llega después de abrir, no se puede corregir la producción del día.', [['Registrar apenas sale cada tanda, desde el celular', esc(nomU(o.u)), 'Desde mañana'], ['Revisar juntos los días que se registró tarde', 'Jefe de obrador', 'Esta semana']]]);
    if (o.fp < 0.99) plans.push(['warn', `${esc(nomU(o.u))}: faltan fotos (${pct(o.fp)} con foto)`, 'La foto es la evidencia de calidad y cantidad.', [['Subir foto en cada registro; el botón abre la cámara del celular', esc(nomU(o.u)), 'Desde mañana']]]);
    if (o.sp > 0.05) plans.push(['bad', `${esc(nomU(o.u))}: sobrante alto (${P(o.sp)}, ${S(o.sv)})`, 'Lo producido que no se vende es costo perdido.', [['Pasar a producción por tandas en los productos que más sobran', 'Jefe de obrador', 'Próxima semana'], ['Revisar si el stock de seguridad está muy alto', 'Administración', 'Esta semana']]]);
    if (o.c < 0.98) plans.push(['warn', `${esc(nomU(o.u))}: cumplimiento ${P(o.c)}`, 'Se produjo menos de lo ordenado.', [['Anotar en la nota del registro la causa (insumo, personal, equipo)', esc(nomU(o.u)), 'Cada día']]]);
  });
  com.forEach(o => { if (o.ex != null && o.ex < 0.97) plans.push([o.ex < 0.94 ? 'bad' : 'warn', `${esc(nomU(o.u))}: exactitud del conteo ${P(o.ex)}`, 'La diferencia entre lo contado y lo que el sistema esperaba es merma no registrada o error de conteo.', [['Recontar los 5 insumos con más diferencia', esc(nomU(o.u)), 'Mañana'], ['Registrar mermas y vencidos al momento', 'Compras y obrador', 'Desde hoy']]]); if (o.ap && o.apT < o.ap) plans.push(['warn', `${esc(nomU(o.u))}: pedidos aprobados tarde`, 'Si el pedido sale tarde, el insumo puede no llegar para la producción del lunes.', [['Aprobar los pedidos el domingo con el correo del reporte', esc(nomU(o.u)), 'Cada domingo']]]); });
  if (!plans.length) plans.push(['ok', 'Todos en meta esta semana', 'Reconocerlo en la reunión del lunes.', [['Compartir los indicadores con el equipo', 'Administración', 'Lunes']]]);
  $('#x-plan').innerHTML = plans.map(a => `<div class="al ${a[0]}"><h4>${a[1]}</h4><p>${a[2]}</p><table><tr><th>Qué hacer</th><th>Responsable</th><th>Plazo</th></tr>${a[3].map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</table></div>`).join('');
}

// ---------- Costos
function rCostos() {
  rFcReal();
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
  ['Pedidos a proveedores', 'Todos los días, 6:00 p. m.', 'Envía a cada proveedor el pedido que se aprobó en Compras y lo marca como enviado. Si nada se aprobó, no envía nada.', 'pedido'],
  ['Reporte semanal', 'Domingos, 6:00 p. m.', 'Venta proyectada, precisión, cumplimiento de producción, sobrante, food cost, alertas y botón para aprobar los pedidos de la semana.', 'reporte'],
  ['Horas y eventos', 'Con cada carga de ventas', 'Reparte la venta del día por hora si el POS no la manda, y marca como atípico el día de un evento que ya pasó.', 'carga de ventas']];
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

function confirmarSalida() { const b = $('#o-pend'); if (b.dataset.w === '1') { b.dataset.w = ''; return true; } b.dataset.w = '1'; b.textContent = 'Tienes cambios sin guardar. Toca Guardar todo, o vuelve a tocar el día para descartarlos.'; setTimeout(() => b.dataset.w = '', 5000); return false; }
const R = { resumen: rResumen, ventas: rVentas, proyeccion: rProy, produccion: rProd, inventario: rInv, compras: rCompras, costos: rCostos, indicadores: rInd, recetario: rRecetario, automatizaciones: rAuto, marca: rMarca };
function show() {
  if (!E) return;
  const ok = allowed().map(v => v[0]); const v = (location.hash || '').slice(1); const k = ok.includes(v) ? v : ok[0];
  $$('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + k)); $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.v === k));
  ['#up-demo', '#up-reset', '#a-add', '#up-tpl'].forEach(s => $(s).disabled = USER.rol !== 'admin');
  R[k]();
}

// ---------- eventos
addEventListener('hashchange', () => { show(); scrollTo(0, 0); });
['#h-local', '#h-canal', '#h-prod', '#h-med'].forEach(s => $(s).addEventListener('change', rVentas));
['#p-local', '#p-canal', '#p-aj'].forEach(s => $(s).addEventListener('change', rProy));
$('#o-saveall').addEventListener('click', guardarTodo); $('#o-saveall2').addEventListener('click', guardarTodo);
document.addEventListener('input', e => { const tr = e.target.closest('#o-reg tr[data-reg]'); if (tr) { tr.classList.add('dirty'); marcarPend(); } });

$('#f-per').addEventListener('change', rFcReal);

$('#o-hprod').addEventListener('change', () => { if (ST.day < 7) rHoras(projWeek(lunesDe(ST.cal['o-dia'].value)).dates[ST.day]); });
$('#c-all').addEventListener('click', () => { const [s, s1] = ST.cal['c-rng'].value, ap = new Set(peds().filter(x => x.semana === s).map(x => x.proveedor)); aprobar(compraDe(projRange(s, s1)).grupos.filter(g => g.items.some(x => x.packs > 0) && !ap.has(g.proveedor)).map(g => g.proveedor)); });
$('#e-add').addEventListener('click', async () => {
  const b = { fecha: $('#e-fecha').value, nombre: $('#e-nom').value.trim(), local: $('#e-local').value, categoria: $('#e-cat').value || null, factor: +$('#e-fac').value };
  if (!b.fecha || !b.nombre) { toast('Pon la fecha y el nombre del evento'); return; }
  try { await api('/eventos', { method: 'POST', body: JSON.stringify(b) }); $('#e-nom').value = ''; await loadData('Recalculando…'); toast('Evento agregado: la proyección ya lo considera'); } catch (x) { toast(x.message); }
});
$('#rc-sel').addEventListener('change', rRecetario);
$('#p-met').addEventListener('change', async e => { E.D.metodo = e.target.value; recalc(); rProy(); if (USER.rol === 'admin') { try { await api('/config', { method: 'POST', body: JSON.stringify({ metodo: E.D.metodo }) }); toast('Método guardado'); } catch (x) { toast(x.message); } } });
$('#o-seg').addEventListener('change', async e => { E.D.colchon = +e.target.value; rProd(); try { await api('/config', { method: 'POST', body: JSON.stringify({ colchon: E.D.colchon }) }); toast('Stock de seguridad guardado: también lo usa Make'); } catch (x) { toast(x.message); } });
document.addEventListener('click', e => {
  const t = e.target.closest('[data-p],[data-b],[data-k],[data-d],[data-go],[data-prev],[data-apr],[data-pan],[data-prc],[data-hp]'); if (!t) return;
  if (t.dataset.apr) { e.preventDefault(); aprobar([t.dataset.apr]); return; }
  if (t.dataset.pan) { accionPedido(+t.dataset.pan, 'anular'); return; }
  if (t.dataset.prc) { accionPedido(+t.dataset.prc, 'recibir'); return; }
  if (t.dataset.hp) { $('#o-hprod').value = t.dataset.hp; rHoras(projWeek(lunesDe(ST.cal['o-dia'].value)).dates[ST.day]); $('#o-hchart').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); return; }
  if (t.dataset.go) { e.preventDefault(); $('#rc-sel').value = t.dataset.go; rRecetario(); return; }
  if (t.dataset.prev) { preview(t.dataset.prev); return; }

  if (t.dataset.d !== undefined) { if ($$('#o-reg tr.dirty').length && !confirmarSalida()) return; ST.day = +t.dataset.d; if (ST.day < 7) ST.cal['o-dia'].set(addD(lunesDe(ST.cal['o-dia'].value), ST.day), true); rProd(); }
  else if (t.dataset.p !== undefined) { const td = e.target.closest('[data-f]'); if (td) explainProd(+t.dataset.p, td.dataset.f); }
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
    const id = e.target.dataset.st, v = Math.max(0, +e.target.value * 1000 || 0), old = ST.stock[id] || 0; ST.stock[id] = v; rCompras();
    clearTimeout(stockTimers[id]); stockTimers[id] = setTimeout(async () => { try { await api('/stock', { method: 'POST', body: JSON.stringify({ insumo_id: id, ajuste: v - old }) }); toast('Stock guardado'); } catch (x) { toast(x.message); } }, 500);
  }
  if (e.target.dataset.foto !== undefined && e.target.files[0]) { const tr = e.target.closest('tr'), f0 = e.target.files[0]; ST.fotos[tr.dataset.reg] = f0; tr.classList.add('dirty');
    tr.querySelector("[data-fprev]").innerHTML = `<img class="thumb" src="${URL.createObjectURL(f0)}" alt="Foto nueva, falta guardar"><span class="badge warn-b">Foto lista</span>`; marcarPend(); }
  if (e.target.dataset.evf || e.target.dataset.eva) {
    const id = +(e.target.dataset.evf || e.target.dataset.eva), ev = E.D.eventos.find(x => x.id === id), body = { id };
    if (e.target.dataset.evf) body.factor = +e.target.value; else body.activo = e.target.checked;
    try { await api('/eventos', { method: 'PATCH', body: JSON.stringify(body) }); await loadData('Recalculando…'); toast('Evento actualizado: la proyección se recalculó'); } catch (x) { toast(x.message); }
  }
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
    if (tipo === 'pedidos' && !r.pedidos.length) { $('#m-prev').innerHTML = `<p class="note">${esc(r.nota || 'No hay pedidos aprobados pendientes.')} Aprueba uno en Compras para ver el correo.</p>`; return; }
    $('#m-prev').innerHTML = (tipo === 'pedidos' ? `<p class="note">${r.proveedores} correos · total ${S(r.total, 2)}. Se muestra el primero.</p>` : '') + (tipo === 'alertas' && !r.hay ? '<p class="note">Hoy no hay insumos en stock crítico: Make no envía correo.</p>' : '') + `<p style="margin:0 0 6px"><b>Para:</b> ${esc(items[0]?.para || '')} · <b>Asunto:</b> ${esc(items[0]?.asunto || '')}</p><iframe class="prev" sandbox="" title="Vista previa del correo"></iframe>`;
    $('#m-prev iframe').srcdoc = items[0]?.html || '<p>Sin contenido</p>';
  } catch (x) { $('#m-prev').innerHTML = `<p class="note">Error: ${esc(x.message)}</p>`; }
}
$('#m-key').addEventListener('click', async () => { try { const r = await api('/integraciones'); $('#m-keyv').textContent = r.api_key; $('#m-keyv').hidden = false; } catch (x) { toast(x.message); } });
$('#o-print').addEventListener('click', () => print());
async function copy(txt) { try { await navigator.clipboard.writeText(txt); toast('Copiado'); } catch { toast('No se pudo copiar'); } }
$('#o-copy').addEventListener('click', () => { const rows = [...$('#o-prod').rows, ...$('#o-base').rows].map(r => [...r.cells].map(c => c.textContent.trim()).join('\t')); copy('CASA CANELA — ' + $('#o-t1').textContent + '\n' + rows.join('\n')); });
$('#c-copy').addEventListener('click', () => { const cp = compraDe(projRange(...ST.cal['c-rng'].value)); copy(cp.grupos.map(g => { const l = g.items.filter(x => x.packs > 0).map(x => `- ${x.packs} × ${x.i.pres} de ${x.i.nombre}`); return l.length ? `PEDIDO ${g.proveedor.toUpperCase()} — Casa Canela\n${l.join('\n')}` : '' }).filter(Boolean).join('\n\n')); });

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
// ---------- app instalable
let DEFER = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); DEFER = e; $('#install').hidden = false; });
$('#install').addEventListener('click', async () => { if (!DEFER) return; DEFER.prompt(); await DEFER.userChoice; DEFER = null; $('#install').hidden = true; });
addEventListener('appinstalled', () => { $('#install').hidden = true; toast('App instalada'); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => { });
if (TOKEN) loadData().catch(() => logout(true)); else $('#login').hidden = false;
