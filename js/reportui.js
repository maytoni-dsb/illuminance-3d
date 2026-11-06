// Stage 3 of the page (stage 7 of development): the report tree, the preview and the PDF.
// Gathers the results of every room (the page computes missing ones), renders the 3D illustrations
// in a hidden view at 300 dpi, builds the document (report.js) into the preview frame and prints it.
// User-facing strings are Russian.

import { buildReport, nodeId, ILL } from './report.js';
import { createRoom, autoStep } from './geometry.js';
import { luminaireGrid } from './photometry.js';
import { luminance, exposure } from './tonemap.js';
import { isolineSet } from './isolines.js';
import { LEVELS } from './colorscale.js';
import { levelStatus } from './workplane.js';
import { normSource } from './norms.js';
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
import { formatNumber } from './ui.js';

const NB = ' ';
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** Name of a plane: Г-0,0, Г-0,8, Г-1,2 … */
export const planeName = (z) => `Г-${formatNumber(z, 2).includes(',') ? formatNumber(z, 2) : `${formatNumber(z, 2)},0`}`;
const n2 = (x) => formatNumber(x, 3);
const zKey = (z) => z.toFixed(3);

/**
 * Rows of the summary tables of a room.
 * @param {object} v — form values; @param {object|null} file — the parsed photometric file
 */
export function summaryRows(v, file, norm = null, zc = null) {
  const t = file?.table ?? null;
  const roomRows = [
    ['Длина × ширина × высота', `${n2(v.L)}${NB}×${NB}${n2(v.W)}${NB}×${NB}${n2(v.H)}${NB}м`],
    ['Отражение: потолок / стены / пол', `${formatNumber(v.rhoC, 2)} / ${formatNumber(v.rhoW, 2)} / ${formatNumber(v.rhoF, 2)}`],
    ['Норма', esc(normSource(norm))],
    ['Освещенность Ē', `${formatNumber(v.En, 0)}${NB}лк ${planeName(v.hwp).replace('-', '\u2011')}`],
    ['Равномерность U<sub>0</sub>', v.U0n != null ? `≥${NB}${formatNumber(v.U0n, 2)}` : 'не нормируется'],
    ['Коэффициент эксплуатации MF', formatNumber(v.mf, 2)],
  ];
  const dash = '—';
  const mm = (x) => String(Math.round(x * 1000));
  let size = dash;
  if (t?.luminaire?.length > 0) {
    const q = t.luminaire;
    size = (q.round ? `⌀${mm(q.length)}` : `${mm(q.length)}${NB}×${NB}${mm(q.width)}`) + (q.height > 0 ? `${NB}×${NB}${mm(q.height)}` : '') + `${NB}мм`;
  }
  const set = t?.lampSets?.[file?.set ?? 0];
  const cri = set?.cri ?? t?.cri ?? null;
  const n = v.nx * v.ny;
  const lumRows = [
    ['Производитель', t?.manufacturer?.trim() ? esc(t.manufacturer.trim()) : dash],
    ['Артикул', t ? esc((t.catalog || t.name || '').trim()) || dash : 'косинусная КСС, без файла'],
    ['Размеры', size],
    ['Световой поток', `${formatNumber(v.flux, 0)}${NB}лм`],
    ['Цветовая температура', t && v.cct ? `${formatNumber(v.cct, 0)}${NB}K` : dash],
    ['Мощность', t && v.power ? `${formatNumber(v.power, 1)}${NB}Вт` : dash],
    ['CRI', cri ? formatNumber(cri, 0) : dash],
    ['Количество', `${v.nx}${NB}×${NB}${v.ny}${NB}=${NB}${n}${NB}шт.`],
    ['Высота установки', `${n2(v.hm)}${NB}м`],
    ['Фотометрический центр', zc != null ? `на высоте ${n2(zc)}${NB}м` : dash],
    ['Поворот', `${formatNumber(v.psi, 1)}°`],
  ];
  return { roomRows, lumRows };
}

/**
 * Lamp of a luminaire for a replaceable lamp (the lamp set names a lamp article «LED / 7190» or a
 * base such as GU10, E27); '' for built-in LEDs.
 */
export function lampKit(t, set = 0) {
  const type = t?.lampSets?.[set]?.type?.trim() ?? '';
  return /\/\s*\S|\b(E27|E14|E40|GU10|GU5[.,]3|GX53|GX70|G9|G4|R7s|G13|G5|2G11)\b/i.test(type) ? type : '';
}

/** The luminaire of a room for the list of luminaires. */
export function lumOf(v, file) {
  const t = file?.table ?? null;
  return {
    maker: t?.manufacturer?.trim() || '', article: t ? (t.catalog || t.name || '').trim() || 'Светильник' : 'Без файла (косинусная КСС)',
    flux: v.flux, power: t ? v.power : null, cct: t ? v.cct : null, count: v.nx * v.ny, kit: lampKit(t, file?.set ?? 0),
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
    id: rd.id, name: rd.name?.trim() || 'Без названия', key: rd.key, L: v.L, W: v.W, H: v.H, xs, ys,
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
        setBusy(list.length > 1 ? `Расчет: ${list[k].name || 'помещение'} (${k + 1} из ${list.length})…` : 'Расчет…');
        const rd = await o.roomData(list[k]);
        if (my !== token) return;
        const room = prepareRoom(rd);
        setBusy('Иллюстрации…');
        try { room.images = await illustrate(rd); } catch (e) { console.error(e); room.images = null; }
        if (my !== token) return;
        out.push(room);
      }
    } catch (e) {
      console.error(e);
      if (my === token) setBusy(`Не удалось подготовить отчет: ${e.message}`, true);
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
    const all = (kind, label) => `<li><div class="rn"><input type="checkbox" data-all="${kind}" aria-label="${label} во всех помещениях"><span class="rl">${label}</span></div></li>`;
    const allGroup = rooms.length > 1 ? `<li><div class="rn room"><span class="rl">Во всех помещениях</span></div><ul>${
      all('summary', 'Сводная информация') + all('results', 'Результаты') + (rooms.some((r) => r.images) ? all('ill', 'Иллюстрации') : '')}</ul></li>` : '';
    o.tree.innerHTML = item(nodeId.title, 'Титульный лист') + item(nodeId.toc, 'Оглавление') + item(nodeId.lumlist, 'Перечень светильников') +
      item(nodeId.restable, 'Сводная таблица результатов') + allGroup + rooms.map((r) =>
      item(nodeId.room(r.id), esc(r.name), {
        cls: 'room',
        children: item(nodeId.summary(r.id), 'Сводная информация') +
          item(nodeId.results(r.id), 'Результаты', { children: r.planes.map((p) => item(nodeId.plane(r.id, p.key), `${p.name}${p.normative ? '' : ' · для справки'}`)).join('') }) +
          (r.images ? item(nodeId.ill(r.id), 'Иллюстрации') : ''),
      })).join('');
  }
  function treePages() {
    for (const s of o.tree.querySelectorAll('small[data-page]')) {
      const n = pageOf(s.dataset.page) ?? tocPage(s.dataset.page);
      s.textContent = n ? `с. ${n}` : '';
    }
    for (const box of o.tree.querySelectorAll('input[data-all]')) {
      const ids = sectionIds(box.dataset.all);
      const on = ids.filter((x) => !off.has(x)).length;
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

  /** Node ids of one kind of section in every room. */
  const sectionIds = (kind) => rooms.filter((r) => kind !== 'ill' || r.images).map((r) => nodeId[kind](r.id));
  o.tree.addEventListener('change', (e) => {
    const kind = e.target.dataset.all;
    if (kind) {
      for (const id of sectionIds(kind)) if (e.target.checked) off.delete(id); else off.add(id);
      for (const id of sectionIds(kind)) { const b = o.tree.querySelector(`input[data-node="${id}"]`); if (b) b.checked = e.target.checked; }
      renderDoc();
      return;
    }
    const n = e.target.dataset.node;
    if (!n) return;
    if (e.target.checked) off.delete(n); else off.add(n);
    renderDoc();
  });
  o.tree.addEventListener('click', (e) => {
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
