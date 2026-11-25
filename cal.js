// Casa Canela · selector de fechas con calendario (rango o un solo día)
import { addD, pd, MES } from './engine.js';
const MESL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre'];
const DL = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const wd = f => (pd(f).getUTCDay() + 6) % 7;
const lbl = f => { const d = pd(f); return d.getUTCDate() + ' ' + MES[d.getUTCMonth()]; };
const lblY = f => lbl(f) + ' ' + f.slice(0, 4);
const ym = f => f.slice(0, 7);
const nextM = m => addD(m + '-28', 7).slice(0, 7);
const prevM = m => addD(m + '-01', -1).slice(0, 7);
let OPEN = null;
document.addEventListener('pointerdown', e => { if (OPEN && !OPEN.root.contains(e.target)) OPEN.close(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && OPEN) { const b = OPEN.btn; OPEN.close(); b.focus(); } });

/**
 * mount: elemento contenedor
 * opts: { single, value:[a,b] | a, onChange(value), presets: () => [[nombre, a, b]], mark: f => {cls, title} , min, max, label }
 */
export function calendario(mount, opts) {
  const st = { v: opts.single ? [opts.value, opts.value] : opts.value.slice(), tmp: null, m: null, hover: null };
  mount.classList.add('cal');
  mount.innerHTML = `${opts.label ? `<span class="cal-lab">${opts.label}</span>` : ''}<button type="button" class="cal-btn" aria-haspopup="dialog" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span class="cal-txt"></span></button><div class="cal-pop" role="dialog" aria-label="Elegir fechas" hidden></div>`;
  const btn = mount.querySelector('.cal-btn'), pop = mount.querySelector('.cal-pop'), txt = mount.querySelector('.cal-txt');
  const api = {
    root: mount, btn,
    get value() { return opts.single ? st.v[0] : st.v.slice(); },
    set(v, silent) { st.v = opts.single ? [v, v] : v.slice(); paintBtn(); if (!silent) opts.onChange(api.value); },
    close() { pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); st.tmp = null; if (OPEN === api) OPEN = null; },
    open() { if (OPEN && OPEN !== api) OPEN.close(); OPEN = api; st.m = ym(st.v[0]); pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); render(); },
    refresh() { paintBtn(); if (!pop.hidden) render(); },
  };
  function paintBtn() {
    const [a, b] = st.v;
    txt.textContent = opts.single ? `${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][wd(a)]} ${lblY(a)}` : a === b ? lblY(a) : (a.slice(0, 4) === b.slice(0, 4) ? lbl(a) : lblY(a)) + ' – ' + lblY(b);
  }
  function month(m) {
    const f0 = m + '-01'; let h = `<div class="cal-m"><div class="cal-mt">${MESL[+m.slice(5) - 1]} ${m.slice(0, 4)}</div><div class="cal-g">` + DL.map(d => `<span class="cal-dw">${d}</span>`).join('');
    for (let i = 0; i < wd(f0); i++) h += '<span></span>';
    const [a, b] = st.tmp ? [st.tmp, st.hover && st.hover > st.tmp ? st.hover : st.tmp] : st.v;
    for (let f = f0; ym(f) === m; f = addD(f, 1)) {
      const mk = opts.mark ? opts.mark(f) : null, dis = (opts.min && f < opts.min) || (opts.max && f > opts.max);
      const cls = ['cal-d', f >= a && f <= b ? 'in' : '', f === a ? 'ini' : '', f === b ? 'fin' : '', mk && mk.cls ? mk.cls : ''].join(' ');
      h += `<button type="button" class="${cls}" data-f="${f}" ${dis ? 'disabled' : ''} ${mk && mk.title ? `title="${mk.title.replace(/"/g, '&quot;')}"` : ''} aria-label="${lblY(f)}${mk && mk.title ? ', ' + mk.title.replace(/"/g, '&quot;') : ''}" aria-pressed="${f >= a && f <= b}">${pd(f).getUTCDate()}</button>`;
    }
    return h + '</div></div>';
  }
  function render() {
    const pre = opts.presets ? opts.presets() : [];
    pop.innerHTML = `${pre.length ? `<div class="cal-pre">${pre.map((p, i) => `<button type="button" data-pi="${i}" class="${p[1] === st.v[0] && p[2] === st.v[1] ? 'on' : ''}">${p[0]}</button>`).join('')}</div>` : ''}
      <div class="cal-body"><div class="cal-nav"><button type="button" data-nav="-1" aria-label="Mes anterior">‹</button><span class="note">${opts.single ? 'Elige un día' : st.tmp ? 'Ahora elige el día final' : 'Elige el día inicial y luego el final'}</span><button type="button" data-nav="1" aria-label="Mes siguiente">›</button></div>
      <div class="cal-ms">${month(st.m)}${opts.single ? '' : month(nextM(st.m))}</div>
      ${opts.legend ? `<div class="cal-leg">${opts.legend}</div>` : ''}</div>`;
    pop.querySelectorAll('[data-pi]').forEach(b => b.onclick = () => { const p = pre[+b.dataset.pi]; api.close(); api.set(opts.single ? p[1] : [p[1], p[2]]); });
    pop.querySelectorAll('[data-nav]').forEach(b => b.onclick = () => { st.m = +b.dataset.nav > 0 ? nextM(st.m) : prevM(st.m); render(); });
    pop.querySelectorAll('[data-f]').forEach(b => {
      b.onclick = () => {
        const f = b.dataset.f;
        if (opts.single) { api.close(); api.set(f); return; }
        if (!st.tmp) { st.tmp = f; st.hover = f; render(); pop.querySelector(`[data-f="${f}"]`)?.focus(); return; }
        const r = f < st.tmp ? [f, st.tmp] : [st.tmp, f]; api.close(); api.set(r);
      };
      b.onmouseenter = () => { if (st.tmp) { st.hover = b.dataset.f; pop.querySelectorAll('[data-f]').forEach(x => { const f = x.dataset.f, lo = st.hover < st.tmp ? st.hover : st.tmp, hi = st.hover < st.tmp ? st.tmp : st.hover; x.classList.toggle('in', f >= lo && f <= hi); }); } };
    });
  }
  btn.onclick = () => pop.hidden ? api.open() : api.close();
  paintBtn();
  return api;
}
