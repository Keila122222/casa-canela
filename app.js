import { createEngine, buildDataset, DIAS, DCORTO, PLU, pd, wdOf, addD, fmtD, fmtLargo } from './engine.js';
import { EXTRA } from './demo-semana.js';

const API = 'https://jcbgjwnlvsruntcpgbac.supabase.co/functions/v1/casa-canela';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = (n, d = 0) => 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d });
const N = (n, d = 0) => n.toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d });
const P = (n, d = 1) => (n * 100).toLocaleString('es-PE', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %';
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 2800); };
const store = { get: k => { try { return localStorage.getItem(k) } catch { return null } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v) } catch { } } };
const fcCol = f => f <= 0.28 ? 'var(--ok)' : f <= 0.33 ? 'var(--warn)' : 'var(--bad)';

let TOKEN = store.get('cc_token'), USER = null, RAW = null, E = null, PJ = null;
const ST = { day: 0, stock: {} };

async function api(path, opt = {}) {
  const r = await fetch(API + path, { ...opt, headers: { 'Content-Type': 'application/json', ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}), ...(opt.headers || {}) } });
  const b = await r.json().catch(() => ({}));
  if (r.status === 401 && path !== '/login') { logout(true); throw new Error('Sesión vencida'); }
  if (!r.ok) throw new Error(b.error || 'Error ' + r.status);
  return b;
}

// ---------- vistas por rol
const VIEWS = [
  ['resumen', 'Resumen', ['admin']], ['ventas', 'Ventas', ['admin']], ['proyeccion', 'Proyección', ['admin']],
  ['produccion', 'Producción', ['admin', 'obrador']], ['compras', 'Compras', ['admin', 'compras']], ['costos', 'Costos', ['admin']],
  ['recetario', 'Recetario', ['admin', 'obrador', 'compras']], ['automatizaciones', 'Automatizaciones', ['admin']], ['marca', 'Marca', ['admin']]];
const allowed = () => VIEWS.filter(v => v[2].includes(USER.rol));
const ROL = { admin: 'Administración', obrador: 'Obrador', compras: 'Compras' };

// ---------- carga de datos
async function loadData(msg = 'Cargando datos…') {
  $('#loading').textContent = msg; $('#loading').hidden = false;
  try {
    RAW = await api('/datos');
    USER = RAW.usuario;
    const rows = { ...RAW, ventas: RAW.ventas.map(v => ({ fecha: v[0], local: v[1], canal: v[2], producto_id: v[3], unidades: v[4] })) };
    const D = buildDataset(rows);
    E = createEngine(D);
    ST.stock = Object.fromEntries(E.IN.map(i => [i.id, i.stock]));
    PJ = E.project(E.nextDates());
    setup();
  } finally { $('#loading').hidden = true; }
}
function recalc() { PJ = E.project(E.nextDates()); }

function setup() {
  $('#login').hidden = true; $('#app').hidden = false;
  $('#u-name').innerHTML = `<b>${esc(USER.nombre)}</b> · ${ROL[USER.rol]}`;
  $('#corte').textContent = E.n() ? 'Ventas hasta: ' + fmtD(E.last()) : 'Sin ventas cargadas';
  $('#nav').innerHTML = allowed().map((v, i) => `<a href="#${v[0]}" data-v="${v[0]}"><i>${i + 1}</i>${v[1]}</a>`).join('');
  const lOpts = '<option value="all">Todos</option>' + E.L.map((l, i) => `<option value="${i}">${esc(l)}</option>`).join('');
  const cOpts = '<option value="all">Todos</option>' + E.C.map((c, i) => `<option value="${i}">${esc(c)}</option>`).join('');
  ['#h-local', '#p-local'].forEach(s => { const v = $(s).value; $(s).innerHTML = lOpts; if (v) $(s).value = v; });
  ['#h-canal', '#p-canal'].forEach(s => { const v = $(s).value; $(s).innerHTML = cOpts; if (v) $(s).value = v; });
  $('#a-local').innerHTML = '<option>Todos</option>' + E.L.map(l => `<option>${esc(l)}</option>`).join('');
  const hp = $('#h-prod').value; $('#h-prod').innerHTML = '<option value="all">Todos</option>' + E.PR.map((p, i) => `<option value="${i}">${esc(p.nombre)}</option>`).join(''); if (hp) $('#h-prod').value = hp;
  $('#o-seg').value = String(E.D.colchon); $('#o-seg').disabled = USER.rol !== 'admin';
  $('#p-met').value = E.D.metodo;
  show();
}

// ---------- gráficos
function drawBars(svg, weeks) {
  const draw = () => {
    const Wd = svg.clientWidth, Ht = svg.clientHeight; if (!Wd) return; const m = { l: 58, r: 10, t: 16, b: 38 };
    const mx = Math.max(...weeks.map(w => w.a + w.b)) * 1.1 || 1; const iw = Wd - m.l - m.r, ih = Ht - m.t - m.b, bw = iw / weeks.length;
    const y = v => m.t + ih - v / mx * ih; let s = '';
    const step = mx > 60000 ? 20000 : 10000; for (let v = 0; v <= mx; v += step) s += `<line x1="${m.l}" x2="${Wd - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="var(--mute)">${Wd < 520 ? (v / 1000) + 'k' : N(v)}</text>`;
    weeks.forEach((w, i) => {
      const x = m.l + i * bw + bw * 0.15, ww = bw * 0.7, pj = w.proj;
      s += `<rect x="${x}" y="${y(w.a)}" width="${ww}" height="${ih - (y(w.a) - m.t)}" fill="${pj ? 'var(--miel)' : 'var(--cacao)'}" rx="2"/>`;
      s += `<rect x="${x}" y="${y(w.a + w.b)}" width="${ww}" height="${y(w.a) - y(w.a + w.b)}" fill="${pj ? 'var(--miel)' : 'var(--canela)'}" opacity="${pj ? 0.6 : 1}" rx="2"/>`;
      if (Wd >= 520 || i % 2 === 0) s += `<text x="${x + ww / 2}" y="${Ht - m.b + 16}" text-anchor="middle" font-size="11" fill="var(--mute)">${w.lab}</text>`;
      if (pj) s += `<text x="${x + ww / 2}" y="${y(w.a + w.b) - 6}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--ink)">${Wd < 520 ? 'Proy.' : 'Proyectada'}</text>`;
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
    const every = Wd < 520 ? 4 : Wd < 800 ? 2 : 1; let wi = 0;
    pts.forEach((p, i) => { if (wdOf(p.f) === 0 && (wi++ % every === 0)) s += `<text x="${x(i)}" y="${Ht - m.b + 16}" text-anchor="middle" font-size="11" fill="var(--mute)">${fmtD(p.f)}</text>`; });
    s += `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p.v).toFixed(1)).join('')}" fill="none" stroke="var(--canela)" stroke-width="2"/>`;
    pts.forEach((p, i) => { if (p.at) s += `<circle cx="${x(i)}" cy="${y(p.v)}" r="5" fill="var(--bad)"><title>${esc(fmtD(p.f) + ' · ' + p.at)}</title></circle>`; });
    svg.innerHTML = s;
  };
  svg._draw = draw; draw(); if (!svg._ro) { svg._ro = new ResizeObserver(() => svg._draw()); svg._ro.observe(svg); }
}
const selL = v => v === 'all' ? E.allL : [+v], selC = v => v === 'all' ? E.allC : [+v];
const days7 = [0, 1, 2, 3, 4, 5, 6];
const weekSales = (ls = E.allL) => days7.reduce((s, d) => s + E.salesDay(PJ, d, ls), 0);
function compra() { return E.purchases(E.needs(PJ, days7, E.D.colchon), ST.stock); }

// ---------- Resumen
function rResumen() {
  const n = E.n(), nw = Math.floor(n / 7), k0 = n - nw * 7, weeks = [];
  for (let w = Math.max(0, nw - 12); w < nw; w++) { const s = k0 + w * 7; let a = 0, b = 0; for (let k = s; k < s + 7; k++) { a += E.realDay(k, [0]); b += E.realDay(k, [1]); } weeks.push({ a, b, lab: fmtD(E.D.fechas[s]) }); }
  const pa = weekSales([0]), pb = weekSales([1]); weeks.push({ a: pa, b: pb, lab: fmtD(PJ.dates[0]), proj: true });
  const last4 = weeks.slice(-5, -1).reduce((s, w) => s + w.a + w.b, 0) / 4, proj = pa + pb, dv = proj / last4 - 1;
  let units = 0; days7.forEach(d => E.production(PJ, d).prods.forEach(o => units += o.porc));
  const fc = E.fcOf(PJ), cp = compra();
  $('#r-title').textContent = 'Semana del ' + fmtD(PJ.dates[0]) + ' al ' + fmtD(PJ.dates[6]);
  $('#r-sub').textContent = 'Proyección calculada con ventas hasta el ' + fmtLargo(E.last()) + '. Se recalcula cada vez que se cargan ventas.';
  $('#r-kpis').innerHTML = [
    ['Venta proyectada', S(proj), `<span class="${dv >= 0 ? 'up' : 'dn'}">${dv >= 0 ? '+' : ''}${P(dv)}</span> vs. promedio de las últimas 4 semanas`],
    ['Unidades a producir', N(units), 'porciones y unidades en el obrador, con ' + P(E.D.colchon, 0) + ' de colchón'],
    ['Compra estimada', S(cp.total), 'insumos de la semana, ya descontado el stock'],
    ['Food cost teórico', P(fc.fc), 'sobre la venta proyectada sin IGV']
  ].map(k => `<div class="card kpi" style="margin:0"><div class="lab">${k[0]}</div><div class="num">${k[1]}</div><div class="sub">${k[2]}</div></div>`).join('');
  drawBars($('#r-chart svg'), weeks);
  const bt = E.backtest();
  $('#r-acc').innerHTML = bt ? `<h3>¿Qué tan bien proyectó la última semana cargada (${fmtD(bt.dias[0].f)} al ${fmtD(bt.dias[6].f)})?</h3><p class="note">Lo que el sistema habría proyectado con las ventas anteriores a esa semana, frente a lo que realmente se vendió.</p>
    <div class="grid g4" style="margin:10px 0">${[['Venta proyectada', S(bt.ps)], ['Venta real', S(bt.rs)], ['Diferencia en S/', (bt.dif >= 0 ? '+' : '') + P(bt.dif)], ['Precisión por producto', P(bt.precision)]].map(k => `<div class="kpi"><div class="lab">${k[0]}</div><div class="num" style="font-size:24px">${k[1]}</div></div>`).join('')}</div>
    <div class="scroll"><table><tr><th>Día</th><th class="n">Proyectado</th><th class="n">Real</th><th class="n">Diferencia</th></tr>${bt.dias.map(x => { const p = x.proj.reduce((s, u, pi) => s + u * E.PR[pi].precio, 0), r = x.real.reduce((s, u, pi) => s + u * E.PR[pi].precio, 0); return `<tr><td>${DCORTO[wdOf(x.f)]} ${fmtD(x.f)}</td><td class="n">${S(p)}</td><td class="n">${S(r)}</td><td class="n">${r ? P(p / r - 1) : '—'}</td></tr>` }).join('')}</table></div>
    <p class="note">Precisión por producto = 1 − (suma de errores absolutos en unidades ÷ unidades reales).</p>` : '<p class="note">Hace falta más historia para medir la precisión.</p>';
  const tops = E.PR.map((p, pi) => ({ p, u: days7.reduce((s, d) => s + E.uDay(PJ, d, pi), 0) })).map(o => ({ ...o, s: o.u * o.p.precio })).sort((a, b) => b.s - a.s).slice(0, 7);
  $('#r-top').innerHTML = '<tr><th>Producto</th><th class="n">Unidades</th><th class="n">Venta</th></tr>' + tops.map(o => `<tr><td>${esc(o.p.nombre)}</td><td class="n">${N(o.u)}</td><td class="n">${S(o.s)}</td></tr>`).join('');
  const al = [], hi = E.PR.map((p, i) => ({ p, f: E.FC[i] })).filter(o => o.f > 0.33);
  if (hi.length) al.push(['bad', `Food cost alto: ${hi.map(o => esc(o.p.nombre) + ' (' + P(o.f) + ')').join(', ')}. Revisar precio o receta.`]);
  const peak = days7.map(d => ({ d, s: E.salesDay(PJ, d) })).sort((a, b) => b.s - a.s)[0];
  al.push(['warn', `Día más fuerte: ${fmtLargo(PJ.dates[peak.d])} con ${S(peak.s)}. Reforzar personal en el obrador el día anterior.`]);
  const tr = E.trends(); if (tr.length) { al.push(['ok', `Crece más: ${esc(tr[0].p.nombre)} (${tr[0].g >= 0 ? '+' : ''}${P(tr[0].g)} en unidades, últimas 4 semanas vs. las 4 anteriores).`]); const z = tr[tr.length - 1]; al.push(['bad', `Cae más: ${esc(z.p.nombre)} (${P(z.g)}). Evaluar si sigue en la carta.`]); }
  al.push(['warn', `${E.D.atipicos.filter(a => a.activo !== false).length} días atípicos excluidos del cálculo.`]);
  $('#r-alerts').innerHTML = al.map(a => `<p style="margin:0 0 10px"><i class="dot" style="background:var(--${a[0]})"></i>${a[1]}</p>`).join('');
}

// ---------- Ventas
function rVentas() {
  const ls = selL($('#h-local').value), cs = selC($('#h-canal').value), pr = $('#h-prod').value, med = $('#h-med').value, F = E.D.fechas;
  const pts = F.map((f, k) => { const at = E.D.atipicos.filter(a => a.activo !== false && a.fecha === f && ls.some(l => a.local === E.L[l] || a.local === 'Todos')); return { f, v: E.realDay(k, ls, cs, pr, med), at: at.map(a => a.local + ': ' + a.motivo).join('; ') } });
  $('#h-ctitle').textContent = (med === 'u' ? 'Unidades vendidas' : 'Venta diaria (S/)') + ' — ' + fmtD(F[0]) + ' al ' + fmtD(F[F.length - 1]);
  drawLine($('#h-chart svg'), pts);
  const n = F.length, nw = Math.floor(n / 7), k00 = n - nw * 7; let mx = 0; const M = [];
  for (let w = 0; w < nw; w++) { const r = []; for (let d = 0; d < 7; d++) { const k = k00 + w * 7 + d; r.push({ k, v: E.realDay(k, ls, cs, pr, med) }); mx = Math.max(mx, r[d].v); } M.push(r); }
  $('#h-heat').innerHTML = '<tr><th>Semana</th>' + DCORTO.map(d => `<th class="n">${d}</th>`).join('') + '<th class="n">Total</th></tr>' + M.map(r => `<tr><td>${fmtD(F[r[0].k])}</td>` + r.map(c => { const at = ls.some(l => E.isAtip(F[c.k], l)); return `<td class="n" style="background:color-mix(in srgb,var(--canela) ${Math.round(c.v / (mx || 1) * 55)}%,transparent);${at ? 'outline:2px solid var(--bad);outline-offset:-2px' : ''}" title="${at ? 'Día atípico' : ''}">${N(c.v)}</td>` }).join('') + `<td class="n"><b>${N(r.reduce((a, c) => a + c.v, 0))}</b></td></tr>`).join('');
  $('#h-atip').innerHTML = E.D.atipicos.map(a => `<label class="chip" style="margin-bottom:6px"><input type="checkbox" data-at="${a.id}" ${a.activo !== false ? 'checked' : ''} style="width:20px;height:20px"> <b>${fmtD(a.fecha)}</b> · ${esc(a.local)} · ${esc(a.motivo)}</label>`).join('');
}

// ---------- Proyección
function rProy() {
  const ls = selL($('#p-local').value), cs = selC($('#p-canal').value), H = PJ.dates;
  $('#p-sub').textContent = 'Semana del ' + fmtD(H[0]) + ' al ' + fmtD(H[6]) + '. Para cada día se toman los 4 mismos días más recientes ' + (E.D.metodo === 'w' ? 'con pesos 40/30/20/10 (más peso a la semana más reciente)' : 'con el mismo peso') + '. Los ceros cuentan y los días atípicos se saltan.';
  const tot = Array(8).fill(0); let totS = 0, cat = '';
  let rows = '<tr><th>Producto</th>' + H.map(f => `<th class="n">${DCORTO[wdOf(f)]} ${pd(f).getUTCDate()}</th>`).join('') + '<th class="n">Semana</th><th class="n">Venta S/</th></tr>';
  E.PR.forEach((p, pi) => {
    if (p.cat !== cat) { cat = p.cat; rows += `<tr class="grp"><td colspan="10">${esc(cat)}</td></tr>`; }
    const v = H.map((_, d) => ls.reduce((a, l) => a + E.uLoc(PJ, d, l, cs, pi), 0)), s = v.reduce((a, b) => a + b, 0);
    v.forEach((x, d) => tot[d] += x); tot[7] += s; totS += s * p.precio;
    rows += `<tr class="click" data-p="${pi}"><td>${esc(p.nombre)}</td>${v.map((x, d) => `<td class="n" data-day="${d}">${N(x)}</td>`).join('')}<td class="n"><b>${N(s)}</b></td><td class="n">${S(s * p.precio)}</td></tr>`;
  });
  rows += `<tr class="tot"><td>Total</td>${tot.map(x => `<td class="n">${N(x)}</td>`).join('')}<td class="n">${S(totS)}</td></tr>`;
  $('#p-table').innerHTML = rows; $('#p-exp').innerHTML = '';
}
function explainProd(pi, d = 0) {
  const ls = selL($('#p-local').value), cs = selC($('#p-canal').value), p = E.PR[pi], f = PJ.dates[d];
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
  const H = PJ.dates;
  $('#o-tabs').innerHTML = H.map((f, d) => `<button class="tab ${ST.day === d ? 'on' : ''}" data-d="${d}">${DCORTO[wdOf(f)]} ${pd(f).getUTCDate()}</button>`).join('') + `<button class="tab ${ST.day === 7 ? 'on' : ''}" data-d="7">Semana completa</button>`;
  let prods, bases;
  if (ST.day < 7) ({ prods, bases } = E.production(PJ, ST.day));
  else { bases = {}; const acc = {}; days7.forEach(d => { const r = E.production(PJ, d); r.prods.forEach(o => { const a = acc[o.pi] || (acc[o.pi] = { ...o, proj: 0, per: E.L.map(() => 0), need: 0, ent: 0, porc: 0 }); a.proj += o.proj; o.per.forEach((x, l) => a.per[l] += x); a.need += o.need; a.ent += o.ent; a.porc += o.porc; }); Object.entries(r.bases).forEach(([b, g]) => bases[b] = (bases[b] || 0) + g); }); prods = Object.values(acc); }
  const when = ST.day < 7 ? `para la venta del ${fmtLargo(H[ST.day])} · preparar el ${fmtLargo(addD(H[ST.day], -1))}` : `semana del ${fmtD(H[0])} al ${fmtD(H[6])}`;
  $('#o-t1').textContent = 'Productos terminados — ' + when; $('#o-t2').textContent = 'Recetas base a preparar — ' + when;
  $('#o-prod').innerHTML = '<thead><tr><th>Producto</th><th class="n">Proyectado</th><th class="n">Con colchón</th><th class="n">A producir</th>' + E.L.map(l => `<th class="n">Despacho ${esc(l)}</th>`).join('') + '</tr></thead><tbody>' + prods.map(o => `<tr><td>${esc(o.p.nombre)}</td><td class="n">${N(o.proj)}</td><td class="n">${N(o.need)}</td><td class="n"><b>${o.p.porc > 1 ? N(o.ent) + ' ' + esc(o.ent === 1 ? o.p.uprod : PLU[o.p.uprod]) + ' (' + N(o.porc) + ' porc.)' : N(o.porc) + ' und'}</b></td>${o.per.map(x => `<td class="n">${N(x)}</td>`).join('')}</tr>`).join('') + '</tbody>';
  const bl = Object.entries(bases).sort((a, b) => E.BAS[a[0]].area.localeCompare(E.BAS[b[0]].area) || a[0].localeCompare(b[0]));
  $('#o-base').innerHTML = '<tr><th>Receta base</th><th>Área</th><th class="n">Cantidad</th><th class="n">Tandas*</th><th class="n">Vida útil</th></tr>' + bl.map(([b, g]) => `<tr class="click" data-b="${b}" data-g="${g}"><td>${esc(E.BAS[b].nombre)}</td><td><span class="pill">${esc(E.BAS[b].area)}</span></td><td class="n"><b>${N(Math.ceil(g / 10) * 10 / 1000, 2)} kg</b></td><td class="n">${N(g / E.baseYield(E.BAS[b]), 2)}</td><td class="n">${E.BAS[b].vida} ${E.BAS[b].vida === 1 ? 'día' : 'días'}</td></tr>`).join('') + `<tr><td colspan="5" class="note">*Una tanda es la receta estándar del recetario.</td></tr>`;
  $('#o-exp').innerHTML = '';
}
function explainBase(b, g) {
  const B = E.BAS[b], f = g / E.baseYield(B);
  $('#o-exp').innerHTML = `<div class="explain"><h3>${esc(B.nombre)} — ${N(Math.ceil(g / 10) * 10 / 1000, 2)} kg (${N(f, 2)} tandas)</h3><table><tr><th>Insumo</th><th class="n">Cantidad</th></tr>${Object.entries(B.ing).map(([i, q]) => `<tr><td>${esc(E.INS[i].nombre)}</td><td class="n">${N(q * f, 0)} ${E.INS[i].um}</td></tr>`).join('')}</table><p class="note">Merma de proceso considerada: ${B.merma} %.</p></div>`;
}

// ---------- Compras
function rCompras() {
  const cp = compra(), venta = weekSales();
  $('#c-sub').textContent = 'Insumos para producir la semana del ' + fmtD(PJ.dates[0]) + ' al ' + fmtD(PJ.dates[6]) + ' en el obrador y preparar las bebidas en barra, con ' + P(E.D.colchon, 0) + ' de colchón.';
  let rows = '<tr><th>Insumo</th><th class="n">Requerido</th><th class="n">Stock actual</th><th class="n">Faltante</th><th>Presentación</th><th class="n">Pedir</th><th class="n">Costo</th></tr>';
  cp.grupos.forEach(g => {
    rows += `<tr class="grp"><td colspan="6">${esc(g.proveedor)}</td><td class="n">${S(g.total, 2)}</td></tr>` + g.items.map(x => {
      const u = x.i.um === 'ml' ? 'l' : 'kg';
      return `<tr><td>${esc(x.i.nombre)}</td><td class="n">${N(x.need / 1000, 2)} ${u}</td><td class="n"><input class="sm" type="number" min="0" step="0.1" data-st="${x.i.id}" value="${+(x.stock / 1000).toFixed(2)}" aria-label="Stock de ${esc(x.i.nombre)} en ${u}"></td><td class="n">${N(x.falt / 1000, 2)} ${u}</td><td>${esc(x.i.pres)}</td><td class="n"><b>${x.packs}</b></td><td class="n">${S(x.costo, 2)}</td></tr>`;
    }).join('');
  });
  rows += `<tr class="tot"><td colspan="6">Total de la compra</td><td class="n">${S(cp.total, 2)}</td></tr>`;
  $('#c-table').innerHTML = rows;
  $('#c-kpis').innerHTML = [['Compra total', S(cp.total)], ['Insumos a pedir', N(cp.items)], ['Proveedores', N(cp.grupos.filter(g => g.total > 0).length)], ['Compra / venta sin IGV', P(cp.total / (venta / 1.18))]].map(k => `<div class="card kpi" style="margin:0"><div class="lab">${k[0]}</div><div class="num">${k[1]}</div></div>`).join('');
}

// ---------- Costos
function rCostos() {
  const fc = E.fcOf(PJ), ord = E.PR.map((p, i) => i).sort((a, b) => E.FC[b] - E.FC[a]);
  $('#k-kpis').innerHTML = [['Food cost teórico de la semana', P(fc.fc)], ['Costo de la semana proyectada', S(fc.costo)], ['Producto con FC más alto', esc(E.PR[ord[0]].nombre) + ' · ' + P(E.FC[ord[0]])], ['Producto con FC más bajo', esc(E.PR[ord[ord.length - 1]].nombre) + ' · ' + P(E.FC[ord[ord.length - 1]])]].map(k => `<div class="card kpi" style="margin:0"><div class="lab">${k[0]}</div><div class="num" style="font-size:${k[1].length > 14 ? '18px' : ''};white-space:normal">${k[1]}</div></div>`).join('');
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
    <table><tr><th>Insumo</th><th class="n">Cantidad por tanda</th>${showCost ? '<th class="n">Precio</th><th class="n">Costo</th>' : ''}</tr>${Object.entries(b.ing).map(([x, q]) => `<tr><td>${esc(E.INS[x].nombre)}</td><td class="n">${N(q)} ${E.INS[x].um}</td>${showCost ? `<td class="n">${E.INS[x].precioKg ? S(E.INS[x].precioKg, 2) + ' / ' + (E.INS[x].um === 'ml' ? 'l' : 'kg') : '—'}</td><td class="n">${S(q * E.INS[x].precioKg / 1000, 2)}</td>` : ''}</tr>`).join('')}${showCost ? `<tr class="tot"><td>Costo por tanda</td><td></td><td></td><td class="n">${S(E.baseCost(b), 2)}</td></tr>` : ''}</table></div>`;
  }
  $('#rc-body').innerHTML = h;
}

// ---------- Automatizaciones
const ESC = [
  ['Cargar ventas', 'Todos los días, 11:30 p. m.', 'Lee la hoja «Casa Canela – Ventas por cargar» de Google Sheets y la sube a la base de datos.'],
  ['Orden de producción', 'Todos los días, 6:00 p. m.', 'Envía al obrador la orden de producción del día siguiente.'],
  ['Pedidos a proveedores', 'Domingos, 6:00 p. m.', 'Envía a cada proveedor su pedido de la semana que empieza.'],
  ['Reporte semanal', 'Domingos, 6:00 p. m.', 'Envía al dueño venta proyectada, precisión, food cost y alertas.']];
function rAuto() {
  const bit = RAW.bitacora || [], lastRun = n => bit.find(b => b.usuario === 'Make' && b.accion.toLowerCase().includes(n));
  const keys = ['carga de ventas', 'orden de producción', 'pedidos', 'reporte'];
  $('#m-esc').innerHTML = '<tr><th>Escenario</th><th>Cuándo</th><th>Qué hace</th><th>Última ejecución</th></tr>' + ESC.map((e, i) => { const r = lastRun(keys[i]); return `<tr><td><b>${e[0]}</b></td><td>${e[1]}</td><td>${e[2]}</td><td>${r ? `<span class="badge ok-b">${esc(r.fecha)}</span>` : '<span class="badge warn-b">Aún no se ejecuta</span>'}</td></tr>` }).join('');
  $('#cf-obr').value = RAW.config.correo_obrador || ''; $('#cf-due').value = RAW.config.correo_dueno || '';
  $('#cf-prov').innerHTML = '<tr><th>Proveedor</th><th>Correo</th><th>Día</th></tr>' + (RAW.proveedores || []).map(p => `<tr><td>${esc(p.nombre)}</td><td><input type="text" data-pe="${esc(p.nombre)}" value="${esc(p.email || '')}"></td><td><select data-pd="${esc(p.nombre)}">${['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'].map(d => `<option ${d === p.dia_pedido ? 'selected' : ''}>${d}</option>`).join('')}</select></td></tr>`).join('');
  $('#m-url').textContent = API;
  $('#m-bit').innerHTML = '<tr><th>Fecha</th><th>Usuario</th><th>Acción</th><th>Detalle</th></tr>' + bit.map(b => `<tr><td style="white-space:nowrap">${esc(b.fecha)}</td><td>${esc(b.usuario)}</td><td>${esc(b.accion)}</td><td class="note">${b.detalle ? esc(JSON.stringify(b.detalle)).slice(0, 140) : ''}</td></tr>`).join('');
}
function rMarca() {
  const pal = [['Cacao', '#3B2418', 'Fondo de marca, textos y barra lateral'], ['Canela', '#A8552B', 'Color principal de acento y botones'], ['Miel', '#D69A3A', 'Destacados y proyección'], ['Miga', '#F5EBDD', 'Fondo claro y textos sobre cacao'], ['Arcilla', '#E3C3A3', 'Fondos secundarios y tablas'], ['Cardamomo', '#5F6B45', 'Indicadores en verde (estado correcto)']];
  $('#m-pal').innerHTML = pal.map(c => `<div class="sw"><div style="background:${c[1]}"></div><div><b>${c[0]}</b> · ${c[1]}<br><span class="note">${c[2]}</span></div></div>`).join('');
}

const R = { resumen: rResumen, ventas: rVentas, proyeccion: rProy, produccion: rProd, compras: rCompras, costos: rCostos, recetario: rRecetario, automatizaciones: rAuto, marca: rMarca };
function show() {
  if (!E) return;
  const ok = allowed().map(v => v[0]); const v = (location.hash || '').slice(1); const k = ok.includes(v) ? v : ok[0];
  $$('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + k)); $$('#nav a').forEach(a => a.classList.toggle('on', a.dataset.v === k));
  ['#up-demo', '#up-reset', '#a-add'].forEach(s => $(s).disabled = USER.rol !== 'admin');
  R[k]();
}

// ---------- eventos
addEventListener('hashchange', () => { show(); scrollTo(0, 0); });
['#h-local', '#h-canal', '#h-prod', '#h-med'].forEach(s => $(s).addEventListener('change', rVentas));
['#p-local', '#p-canal'].forEach(s => $(s).addEventListener('change', rProy));
$('#rc-sel').addEventListener('change', rRecetario);
$('#p-met').addEventListener('change', async e => { E.D.metodo = e.target.value; recalc(); rProy(); if (USER.rol === 'admin') { try { await api('/config', { method: 'POST', body: JSON.stringify({ metodo: E.D.metodo }) }); toast('Método guardado'); } catch (x) { toast(x.message); } } });
$('#o-seg').addEventListener('change', async e => { E.D.colchon = +e.target.value; rProd(); try { await api('/config', { method: 'POST', body: JSON.stringify({ colchon: E.D.colchon }) }); toast('Colchón guardado: también lo usará Make'); } catch (x) { toast(x.message); } });
document.addEventListener('click', e => {
  const t = e.target.closest('[data-p],[data-b],[data-k],[data-d],[data-go],[data-prev]'); if (!t) return;
  if (t.dataset.go) { e.preventDefault(); $('#rc-sel').value = t.dataset.go; rRecetario(); return; }
  if (t.dataset.prev) { preview(t.dataset.prev); return; }
  if (t.dataset.d !== undefined) { ST.day = +t.dataset.d; rProd(); }
  else if (t.dataset.p !== undefined) { const td = e.target.closest('[data-day]'); explainProd(+t.dataset.p, td ? +td.dataset.day : 0); }
  else if (t.dataset.b) explainBase(t.dataset.b, +t.dataset.g);
  else if (t.dataset.k !== undefined) explainCost(+t.dataset.k);
});
const stockTimers = {};
document.addEventListener('change', async e => {
  if (e.target.dataset.at !== undefined) {
    const id = +e.target.dataset.at, a = E.D.atipicos.find(x => x.id === id); a.activo = e.target.checked; recalc(); rVentas();
    try { await api('/atipicos', { method: 'PATCH', body: JSON.stringify({ id, activo: a.activo }) }); toast('Proyección recalculada y guardada'); } catch (x) { toast(x.message); }
  }
  if (e.target.dataset.st) {
    const id = e.target.dataset.st, v = Math.max(0, +e.target.value * 1000 || 0); ST.stock[id] = v; rCompras();
    clearTimeout(stockTimers[id]); stockTimers[id] = setTimeout(async () => { try { await api('/stock', { method: 'POST', body: JSON.stringify({ insumo_id: id, stock: v }) }); toast('Stock guardado'); } catch (x) { toast(x.message); } }, 500);
  }
});
$('#a-add').addEventListener('click', async () => {
  const f = $('#a-fecha').value, l = $('#a-local').value, m = $('#a-mot').value.trim() || 'Día atípico';
  if (!f || !E.D.fechas.includes(f)) { toast('Elige una fecha dentro del histórico'); return; }
  try { await api('/atipicos', { method: 'POST', body: JSON.stringify({ fecha: f, local: l, motivo: m }) }); await loadData('Recalculando…'); toast('Día atípico agregado'); } catch (x) { toast(x.message); }
});
async function subir(body, label) {
  $('#up-msg').textContent = 'Subiendo…';
  try { const r = await api('/ventas', { method: 'POST', body: JSON.stringify(body) }); await loadData('Recalculando…'); $('#up-msg').textContent = `${label}: ${r.filas} filas en ${r.dias} días (${r.desde ? fmtD(r.desde) : ''} al ${r.hasta ? fmtD(r.hasta) : ''})${r.errores ? ', ' + r.errores + ' filas con error omitidas' : ''}.`; toast('Ventas cargadas: todo se recalculó'); }
  catch (x) { $('#up-msg').textContent = 'Error: ' + x.message; }
}
$('#up-file').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; f.text().then(t => subir({ csv: t, origen: 'App (CSV)' }, f.name)); e.target.value = ''; });
$('#up-demo').addEventListener('click', () => {
  const rows = []; EXTRA.dias.forEach((day, d) => day.forEach((loc, l) => loc.forEach((row, c) => row.forEach((u, p) => { if (u) rows.push({ fecha: addD(EXTRA.inicio, d), local: E.L[l], canal: E.C[c], producto_id: EXTRA.productos[p], unidades: u }); }))));
  subir({ rows, origen: 'Semana de ejemplo' }, 'Semana de ejemplo');
});
$('#up-reset').addEventListener('click', async () => {
  if ($('#up-reset').dataset.confirm !== '1') { $('#up-reset').dataset.confirm = '1'; $('#up-reset').textContent = 'Toca otra vez para borrar ventas posteriores al 15 nov'; setTimeout(() => { $('#up-reset').dataset.confirm = ''; $('#up-reset').textContent = 'Restablecer demo'; }, 4000); return; }
  $('#up-reset').dataset.confirm = ''; $('#up-reset').textContent = 'Restablecer demo';
  try { const r = await api('/demo/reset', { method: 'POST' }); await loadData('Recalculando…'); $('#up-msg').textContent = `Demo restablecida: se borraron ${r.borradas} filas posteriores al 15 nov.`; } catch (x) { toast(x.message); }
});
$('#cf-save').addEventListener('click', async () => {
  const proveedores = $$('[data-pe]').map(i => ({ nombre: i.dataset.pe, email: i.value.trim(), dia_pedido: $(`[data-pd="${CSS.escape(i.dataset.pe)}"]`).value }));
  try { await api('/config', { method: 'POST', body: JSON.stringify({ correo_obrador: $('#cf-obr').value.trim(), correo_dueno: $('#cf-due').value.trim(), proveedores }) }); toast('Configuración guardada'); RAW.config.correo_obrador = $('#cf-obr').value.trim(); RAW.config.correo_dueno = $('#cf-due').value.trim(); } catch (x) { toast(x.message); }
});
async function preview(tipo) {
  $('#m-prev').innerHTML = '<p class="note">Generando…</p>';
  try {
    const r = await api('/vista-previa?tipo=' + tipo);
    const items = tipo === 'pedidos' ? r.pedidos : [r];
    $('#m-prev').innerHTML = (tipo === 'pedidos' ? `<p class="note">${r.proveedores} correos · total estimado ${S(r.total, 2)}. Se muestra el primero.</p>` : '') + `<p style="margin:0 0 6px"><b>Para:</b> ${esc(items[0]?.para || '')} · <b>Asunto:</b> ${esc(items[0]?.asunto || '')}</p><iframe class="prev" sandbox="" title="Vista previa del correo"></iframe>`;
    $('#m-prev iframe').srcdoc = items[0]?.html || '<p>Sin contenido</p>';
  } catch (x) { $('#m-prev').innerHTML = `<p class="note">Error: ${esc(x.message)}</p>`; }
}
$('#m-key').addEventListener('click', async () => { try { const r = await api('/integraciones'); $('#m-keyv').textContent = r.api_key; $('#m-keyv').hidden = false; } catch (x) { toast(x.message); } });
$('#o-print').addEventListener('click', () => print());
async function copy(txt) { try { await navigator.clipboard.writeText(txt); toast('Copiado'); } catch { toast('No se pudo copiar'); } }
$('#o-copy').addEventListener('click', () => { const rows = [...$('#o-prod').rows, ...$('#o-base').rows].map(r => [...r.cells].map(c => c.textContent.trim()).join('\t')); copy('CASA CANELA — ' + $('#o-t1').textContent + '\n' + rows.join('\n')); });
$('#c-copy').addEventListener('click', () => { const cp = compra(); copy(cp.grupos.map(g => { const l = g.items.filter(x => x.packs > 0).map(x => `- ${x.packs} × ${x.i.pres} de ${x.i.nombre}`); return l.length ? `PEDIDO ${g.proveedor.toUpperCase()} — Casa Canela\n${l.join('\n')}` : '' }).filter(Boolean).join('\n\n')); });

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
