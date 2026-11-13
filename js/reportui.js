// Stage 3 of the page (stage 7 of development): the report tree, the preview and the PDF.
// Gathers the results of every room (the page computes missing ones), renders the 3D illustrations
// in a hidden view at 300 dpi, builds the document (report.js) into the preview frame and prints it.
// User-facing strings come from the dictionaries (rui.*, rep.*).

import { buildReport, nodeId, ILL } from './report.js';
import { createRoom, autoStep } from './geometry.js';
import { luminaireGrid } from './photometry.js';
import { luminance, exposure } from './tonemap.js';
import { isolineSet } from './isolines.js';
import { LEVELS } from './colorscale.js';
import { levelStatus } from './workplane.js';
import { NORM_SETS } from './norms.js';
import { lidcCurves } from './photui.js';
import { polarSvg, polarLegend, niceStep } from './reportsvg.js';
import { createPhotometry } from './photometry.js';

const POLAR_R = 52;

/** The polar diagram of a room's luminaire with its legend: rings in a round step, cd/klm. */
export function polarOf(phot) {
  const peak = lidcCurves(phot, POLAR_R).max;
  const step = niceStep(peak / 4), outer = Math.ceil(peak / step - 1e-9) * step;
  return { svg: polarSvg(lidcCurves(phot, POLAR_R * peak / outer), POLAR_R, outer, step), legend: polarLegend(peak), peak };
}
import { t, formatNumber, planeName } from './i18n.js';

const NB = '\u00a0';
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export { planeName };
const n2 = (x) => formatNumber(x, 3);
const zKey = (z) => z.toFixed(3);

/**
 * Rows of the summary tables of a room.
 * @param {object} v — form values; @param {object|null} file — the parsed photometric file
 */
export function summaryRows(v, file, norm = null, zc = null) {
  const tb = file?.table ?? null;
  const m = t('unit.m');
  const roomRows = [
    [t('rui.size'), `${n2(v.L)}${NB}×${NB}${n2(v.W)}${NB}×${NB}${n2(v.H)}${NB}${m}`],
    [t('rui.refl'), `${formatNumber(v.rhoC, 2)} / ${formatNumber(v.rhoW, 2)} / ${formatNumber(v.rhoF, 2)}`],
    [t('rui.mf'), formatNumber(v.mf, 2)],
  ];
  // the norm: the document as the label, the row of its table as the value; the names of the
  // document and of the room stay in the language of the document (stage 8)
  const set = NORM_SETS.find((x) => x.id === norm?.set);
  const src = set ? [t(`norms.${set.id}.doc`), t(`norms.${set.id}.row`, { ref: esc(norm.ref) })] : null;
  const normRows = [
    src ? [src[0], `${src[1]}${norm.name ? `: ${esc(norm.name)}` : ''}`] : [t('rui.norm'), t('norms.user')],
    [t('rui.En'), `${formatNumber(v.En, 0)}${NB}${t('unit.lx')} ${planeName(v.hwp).replace('-', '\u2011')}`],
    [t('rui.U0'), v.U0n != null ? `≥${NB}${formatNumber(v.U0n, 2)}` : t('rui.U0none')],
  ];
  const dash = '—';
  const mm = (x) => String(Math.round(x * 1000));
  let size = dash;
  if (tb?.luminaire?.length > 0) {
    const q = tb.luminaire;
    size = (q.round ? `⌀${mm(q.length)}` : `${mm(q.length)}${NB}×${NB}${mm(q.width)}`) + (q.height > 0 ? `${NB}×${NB}${mm(q.height)}` : '') + `${NB}${t('unit.mm')}`;
  }
  const ls = tb?.lampSets?.[file?.set ?? 0];
  const cri = ls?.cri ?? tb?.cri ?? null;
  const n = v.nx * v.ny;
  const lumRows = [
    [t('rui.maker'), tb?.manufacturer?.trim() ? esc(tb.manufacturer.trim()) : dash],
    [t('rui.article'), tb ? esc((tb.catalog || tb.name || '').trim()) || dash : t('rui.noFile')],
    [t('rui.count'), `${v.nx}${NB}×${NB}${v.ny}${NB}=${NB}${n}${NB}${t('unit.pcsDot')}`],
    [t('rui.flux'), `${formatNumber(v.flux, 0)}${NB}${t('unit.lm')}`],
    [t('rui.cct'), tb && v.cct ? `${formatNumber(v.cct, 0)}${NB}K` : dash],
    [t('rui.power'), tb && v.power ? `${formatNumber(v.power, 1)}${NB}${t('unit.W')}` : dash],
    ['CRI', cri ? formatNumber(cri, 0) : dash],
    [t('rui.dims'), size],
    [t('rui.hm'), `${n2(v.hm)}${NB}${m}`],
    [t('rui.centre'), zc != null ? t('rui.at', { z: `${n2(zc)}${NB}${m}` }) : dash],
  ];
  return { roomRows, normRows, lumRows };
}

/**
 * Lamp of a luminaire for a replaceable lamp (the lamp set names a lamp article «LED / 7190» or a
 * base such as GU10, E27); '' for built-in LEDs.
 */
export function lampKit(tb, set = 0) {
  const type = tb?.lampSets?.[set]?.type?.trim() ?? '';
  return /\/\s*\S|\b(E27|E14|E40|GU10|GU5[.,]3|GX53|GX70|G9|G4|R7s|G13|G5|2G11)\b/i.test(type) ? type : '';
}

/** The luminaire of a room for the list of luminaires. */
export function lumOf(v, file) {
  const tb = file?.table ?? null;
  return {
    maker: tb?.manufacturer?.trim() || '', article: tb ? (tb.catalog || tb.name || '').trim() || t('rui.lum') : t('rui.noFileLum'),
    flux: v.flux, power: tb ? v.power : null, cct: tb ? v.cct : null, count: v.nx * v.ny, kit: lampKit(tb, file?.set ?? 0),
  };
}

/**
 * Prepares one room for the report: plans of the planes (values with MF, isolines), tables.
 * @param {{ id, name, values, file, params, key, result }} rd — page.roomData()
 */
export function prepareRoom(rd) {
  const v = rd.values, res = rd.result, mf = v.mf;
  const xs = Array.from({ length: v.nx }, (_, i) => (i + 0.5) * v.L / v.nx);
  const ys = Array.from({ length: v.ny }, (_, j) => (j + 0.5) * v.W / v.ny);
  const planes = res.planes.map((pl) => {
    const f = pl.field;
    const values = Float64Array.from(f.E, (x) => mf * x);
    const sets = isolineSet(values, f.grid.ax, f.grid.ay, f.grid.dx, f.grid.dy, LEVELS.slice(1));
    const gost = { ...f.gost, values: Float64Array.from(f.gost.E, (x) => mf * x) };
    const s = pl.stats;
    const stats = { avg: mf * s.avg, min: mf * s.min, max: mf * s.max, u0: s.u0, minMax: s.minMax };
    return {
      key: zKey(pl.z), z: pl.z, name: planeName(pl.z), normative: !!pl.normative, sets, gost, stats, mf,
      norm: pl.normative ? { En: v.En, U0n: v.U0n ?? null, status: levelStatus(stats.avg, v.En), u0Low: v.U0n != null && stats.u0 < v.U0n - 1e-9 } : null,
    };
  });
  return {
    id: rd.id, name: rd.name?.trim() || t('app.untitled'), key: rd.key, L: v.L, W: v.W, H: v.H, xs, ys,
    psi: rd.params.psi, shape: rd.file?.shape ?? null, planes, lum: lumOf(v, rd.file), ...summaryRows(v, rd.file, rd.norm, v.H - rd.params.hc), images: null,
    polar: polarOf(rd.file?.phot ?? createPhotometry({ type: 'cosine', flux: v.flux })),
  };
}

/**
 * @param {{ tree: HTMLElement, iframe: HTMLIFrameElement, busy: HTMLElement, pdf: HTMLButtonElement,
 *           project: () => object, roomData: (room) => Promise<object> }} o
 * @returns {{ open: () => Promise<void>, leave: () => void, invalidate: (what: string) => void }}
 */
export function initReport(o) {
  const off = new Set();            // nodes switched off in the tree
  const images = new Map();         // result key + MF → { real, falseColor }
  let rooms = null, built = null, isOpen = false, token = 0, snap = null;

  function setBusy(text, err = false) {
    o.busy.hidden = !text; o.busy.textContent = text || ''; o.busy.classList.toggle('err', err);
  }

  /** A hidden 3D view for the illustrations, in the light theme. */
  async function snapView() {
    if (snap) return snap;
    const { createView } = await import('./view3d.js');
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:-20000px;top:0;width:640px;height:360px;pointer-events:none;' +
      '--view-edge:#7a7a78;--ink:#000;--ink2:#2e2e2e';
    host.setAttribute('aria-hidden', 'true');
    document.body.appendChild(host);
    snap = createView(host, { insets: () => ({ top: 0, bottom: 0, side: 0 }) });
    return snap;
  }

  /** 3D images of a room: luminance (the realistic view) and false colours, 300 dpi. */
  async function illustrate(rd) {
    const key = `${rd.key}|${rd.values.mf}`;
    if (images.has(key)) return images.get(key);
    const v = rd.values, res = rd.result, mf = v.mf;
    const room = createRoom({ L: v.L, W: v.W, H: v.H, h: autoStep(v.L, v.W, v.H) });
    if (room.N !== res.N) return null;
    const E = new Float64Array(res.N);
    for (let g = 0; g < res.N; g++) E[g] = mf * (res.Edir[g] + res.Eind[g]);
    const L = luminance(room, E, res.rho ?? rd.params.rho);
    const ex = exposure(room, L);
    const view = await snapView();
    view.setRoom(room);
    view.setLuminaires(luminaireGrid({ L: v.L, W: v.W, H: v.H, nx: v.nx, ny: v.ny, hc: rd.params.hc, psi: rd.params.psi }), rd.file?.shape ?? null);
    view.setValues(E);
    view.setLuminance(L, ex.m);
    const out = {
      real: view.snapshot(ILL.px, ILL.py, { mode: 'real', type: 'image/jpeg', quality: 0.93 }),
      falseColor: view.snapshot(ILL.px, ILL.py, { mode: 'false', type: 'image/png' }),
    };
    images.set(key, out);
    return out;
  }

  /** Results of every room (computed when missing), plans, tables and images. */
  async function refresh() {
    const my = ++token;
    o.pdf.disabled = true;
    const list = o.project().rooms;
    const out = [];
    try {
      for (let k = 0; k < list.length; k++) {
        setBusy(list.length > 1 ? t('rui.busyRoom', { name: list[k].name || t('rui.aRoom'), k: k + 1, n: list.length }) : t('app.busy'));
        const rd = await o.roomData(list[k]);
        if (my !== token) return;
        const room = prepareRoom(rd);
        setBusy(t('rui.busyIll'));
        try { room.images = await illustrate(rd); } catch (e) { console.error(e); room.images = null; }
        if (my !== token) return;
        out.push(room);
      }
    } catch (e) {
      console.error(e);
      if (my === token) setBusy(t('rui.failed', { msg: e.message }), true);
      return;
    }
    rooms = out;
    renderTree();
    await renderDoc();
    if (my !== token) return;
    setBusy('');
    o.pdf.disabled = false;
  }

  const pageOf = (node) => built?.pages.find((p) => p.node === node || p.pnodes?.includes(node))?.n ?? null;
  const tocPage = (node) => built?.toc.find((t) => t.node === node)?.page ?? null;

  function renderTree() {
    const item = (node, label, { cls = '', sub = '', children = '' } = {}) => {
      const on = !off.has(node);
      return `<li><div class="rn ${cls}${on ? '' : ' off'}"><input type="checkbox" data-node="${node}" aria-label="${esc(label)}"${on ? ' checked' : ''}>` +
        `<button type="button" data-go="${node}">${label}</button><small data-page="${node}"></small></div>${children ? `<ul>${children}</ul>` : ''}</li>`;
    };
    // a section in every room at once (illustrations off everywhere, say)
    const all = (kind, label, children = '') => `<li><div class="rn"><input type="checkbox" data-all="${kind}" aria-label="${esc(t('rui.inAll', { what: label }))}"><span class="rl">${label}</span></div>${children ? `<ul>${children}</ul>` : ''}</li>`;
    const hasRef = rooms.some((r) => r.planes.some((q) => !q.normative));
    const allGroup = rooms.length > 1 ? `<li><div class="rn room"><button type="button" class="tg" data-toggle="all" aria-expanded="${allOpen}" aria-label="${t('rui.allRooms')}"></button><span class="rl">${t('rui.allRooms')}</span></div><ul id="rtall"${allOpen ? '' : ' hidden'}>${
      all('summary', t('rep.summary')) +
      all('results', t('rep.results'), hasRef ? all('normonly', t('rui.normOnly')) : '') +
      (rooms.some((r) => r.images) ? all('ill', t('rep.ill')) : '')}</ul></li>` : '';
    o.tree.innerHTML = item(nodeId.title, t('rui.title')) + item(nodeId.toc, t('rui.toc')) + item(nodeId.lumlist, t('rep.lumlist')) +
      item(nodeId.restable, t('rep.restable')) + allGroup + rooms.map((r) =>
      item(nodeId.room(r.id), esc(r.name), {
        cls: 'room',
        children: item(nodeId.summary(r.id), t('rep.summary')) +
          item(nodeId.results(r.id), t('rep.results'), { children: r.planes.map((p) => item(nodeId.plane(r.id, p.key), `${p.name}${p.normative ? '' : ` · ${t('rep.reference')}`}`)).join('') }) +
          (r.images ? item(nodeId.ill(r.id), t('rep.ill')) : ''),
      })).join('');
  }
  function treePages() {
    for (const s of o.tree.querySelectorAll('small[data-page]')) {
      const n = pageOf(s.dataset.page) ?? tocPage(s.dataset.page);
      s.textContent = n ? t('rui.page', { n }) : '';
    }
    for (const box of o.tree.querySelectorAll('input[data-all]')) {
      const ids = sectionIds(box.dataset.all);
      let on = ids.filter((x) => !off.has(x)).length;
      if (box.dataset.all === 'normonly') on = ids.length - on; // checked when the reference planes are off
      box.checked = on === ids.length; box.indeterminate = on > 0 && on < ids.length;
    }
    for (const rn of o.tree.querySelectorAll('.rn')) {
      // a section of a room that is off is off too
      const node = rn.querySelector('input')?.dataset.node;
      if (!node) continue;
      const parentsOff = [...off].some((x) => node !== x && node.startsWith(`${x}/`));
      rn.classList.toggle('off', off.has(node) || parentsOff);
    }
  }

  async function renderDoc() {
    const p = o.project();
    built = buildReport({ info: p.info, date: new Date(), rooms, include: (id) => !off.has(id) });
    const win = o.iframe.contentWindow;
    const y = win?.scrollY ?? 0;
    await new Promise((resolve) => {
      o.iframe.onload = () => { resolve(); };
      o.iframe.srcdoc = built.html;
    });
    try { o.iframe.contentWindow.scrollTo(0, y); } catch (e) { /* not ready */ }
    treePages();
  }

  /** Node ids of one kind of section in every room; 'normonly' — the reference (non-normative) planes, off when checked. */
  const sectionIds = (kind) => (kind === 'normonly'
    ? rooms.flatMap((r) => r.planes.filter((q) => !q.normative).map((q) => nodeId.plane(r.id, q.key)))
    : rooms.filter((r) => kind !== 'ill' || r.images).map((r) => nodeId[kind](r.id)));
  let allOpen = false; // the group "In all rooms" is collapsed at first
  o.tree.addEventListener('change', (e) => {
    const kind = e.target.dataset.all;
    if (kind) {
      // "only normative": checked switches the reference planes off
      const on = kind === 'normonly' ? !e.target.checked : e.target.checked;
      for (const id of sectionIds(kind)) if (on) off.delete(id); else off.add(id);
      for (const id of sectionIds(kind)) { const b = o.tree.querySelector(`input[data-node="${id}"]`); if (b) b.checked = on; }
      renderDoc();
      return;
    }
    const n = e.target.dataset.node;
    if (!n) return;
    if (e.target.checked) off.delete(n); else off.add(n);
    renderDoc();
  });
  o.tree.addEventListener('click', (e) => {
    const t = e.target.closest('button[data-toggle]');
    if (t) {
      allOpen = !allOpen;
      t.setAttribute('aria-expanded', String(allOpen));
      o.tree.querySelector('#rtall').hidden = !allOpen;
      return;
    }
    const b = e.target.closest('button[data-go]');
    if (!b) return;
    const n = pageOf(b.dataset.go) ?? tocPage(b.dataset.go);
    const el = n && o.iframe.contentDocument?.getElementById(`pg-${n}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  o.pdf.addEventListener('click', async () => {
    const w = o.iframe.contentWindow;
    if (!w) return;
    try { await o.iframe.contentDocument.fonts.ready; } catch (e) { /* no font loading API */ }
    w.focus();
    w.print();
  });

  return {
    async open() { isOpen = true; await refresh(); },
    leave() { isOpen = false; token++; setBusy(''); },
    invalidate(what) { if (what !== 'info') rooms = null; },
    /** For the tests: the last built document. */
    built: () => built,
  };
}
