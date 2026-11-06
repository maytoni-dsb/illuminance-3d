// The report (stage 7): a self-contained HTML document of A4 pages, previewed in the page and
// printed to PDF by the browser. Pure module: builds the markup from prepared data; no DOM.
//
// Pages are laid out here, not by the browser, so every page number is known when the table of
// contents is written: the title page, the contents, then for every room the summary (one page),
// the results (one page per work plane) and the illustrations (one page). Plans are vector SVG drawn
// to a drafting scale (reportsvg.js); 3D images come as data URLs rendered at 300 dpi.
// User-facing text is Russian; typography: «quotes», em dashes, no-break spaces after short words
// and between numbers and units, hyphenation by the browser (lang="ru").

import { roomPlanSvg, isolinePlanSvg, colorScaleSvg, planScale, planBox } from './reportsvg.js';

/** Page geometry, mm: A4 and the text frame. */
export const PAGE = Object.freeze({ w: 210, h: 297, left: 25, right: 18, top: 24, bottom: 24 });
export const FRAME = Object.freeze({ w: PAGE.w - PAGE.left - PAGE.right, h: PAGE.h - PAGE.top - PAGE.bottom });
/** Illustrations: size on the page, mm, and pixels at 300 dpi. */
export const ILL = Object.freeze({ w: FRAME.w, h: 90, px: Math.round(FRAME.w / 25.4 * 300), py: Math.round(90 / 25.4 * 300) });

const NB = ' ', THIN = ' ';
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Typesetting of user text: escaped; straight quotes → «»; a spaced hyphen → em dash with a no-break
 * space before it; no-break spaces after one- and two-letter words and between a number and a unit.
 */
export function typo(s) {
  let t = esc(String(s ?? '').trim());
  t = t.replace(/(^|[\s(\[—–-])&quot;/g, '$1«').replace(/&quot;/g, '»');
  t = t.replace(/\s+[-–—]\s+/g, `${NB}— `);
  t = t.replace(/(?<=^|[\s«(])([А-Яа-яЁёA-Za-z]{1,2})\s+/g, `$1${NB}`);
  t = t.replace(/(\d)\s+(лк|лм|м|мм|см|Вт|К|шт\.?|%|°)(?=[\s.,;:)]|$)/g, `$1${NB}$2`);
  return t;
}

/** Number for the report: decimal comma, thin space between thousands, `digits` decimals at most. */
export function num(x, digits = 0) {
  if (!Number.isFinite(x)) return '—';
  const v = Number(x.toFixed(digits));
  const [i, f] = String(Math.abs(v)).split('.');
  const int = i.length > 4 ? i.replace(/\B(?=(\d{3})+(?!\d))/g, THIN) : i;
  return `${v < 0 ? '−' : ''}${int}${f ? `,${f}` : ''}`;
}
/** Illuminance as on the plans: whole lux from 10 lx, one decimal below. */
export const lux = (v) => num(v, v >= 10 ? 0 : 1);

const MAYTONI = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 106 22" fill="currentColor" role="img" aria-label="Maytoni"><polygon points="45.3,6.1 41.3,12.8 37.3,6.1 34.1,6.1 39.8,15.9 39.8,21.8 42.8,21.8 42.8,15.9 48.5,6.1"/><rect x="102.5" y="6.1" width="2.9" height="15.7"/><polygon points="94.7,6.1 94.7,17 86.7,6.1 84,6.1 84,21.8 86.7,21.8 86.7,10.8 94.7,21.8 97.4,21.8 97.4,6.1"/><polygon points="11.3,8 11.3,12.8 7.7,17.9 2.7,10.8 2.7,21.8 0,21.8 0,6.1 2.7,6.1 7.7,13.2"/><rect x="12.7" y="6.1" width="2.7" height="15.7"/><polygon points="62.7,6.1 50,6.1 50,8.6 54.9,8.6 54.9,21.8 57.9,21.8 57.9,8.6 62.7,8.6"/><path d="M72.4,5.8c-4.5,0-8.1,3.6-8.1,8.1s3.6,8.1,8.1,8.1s8.1-3.6,8.1-8.1S76.8,5.8,72.4,5.8z M72.4,19.3c-2.9,0-5.1-2.4-5.1-5.3c0-3,2.2-5.3,5.1-5.3s5.1,2.4,5.1,5.3S75.2,19.3,72.4,19.3z"/><path d="M31.3,21.7h2.9L27.9,6.1h-3.1l-6.3,15.7h2.9l1.3-3.3h7.1L31.3,21.7z M23.8,15.9l2.5-6.1l2.5,6.1H23.8z"/><circle cx="103.9" cy="2.3" r="2.1"/></svg>';

/** Node ids of the report tree (reportui.js) — also the anchors of the table of contents. */
export const nodeId = {
  title: 'title', toc: 'toc', lumlist: 'lumlist', room: (r) => `room:${r}`, summary: (r) => `room:${r}/summary`,
  results: (r) => `room:${r}/results`, plane: (r, k) => `room:${r}/results/${k}`, ill: (r) => `room:${r}/ill`,
};

/**
 * Builds the report.
 * @param {object} d
 *   info: project fields (project.js INFO_FIELDS); date: Date;
 *   rooms: [{ id, name, L, W, H, xs, ys, psi, shape, roomRows: [label, value][], lumRows: [label, value][],
 *             planes: [{ key, z, name, normative, sets, gost, stats: { avg, min, max, u0, minMax } (with MF),
 *                        mf, norm: { En, status: 'low'|'ok'|'high', u0Low } | null }],
 *             images: { real, falseColor } | null }]
 *   include: (nodeId) => boolean — the report tree's check boxes
 * @returns {{ html: string, pages: { node: string, n: number }[], toc: object[] }}
 */
export function buildReport(d) {
  const inc = d.include ?? (() => true);
  const project = d.info.name?.trim() || '';
  // ---- the page plan: what goes on every page ----
  const plan = [];
  if (inc(nodeId.title)) plan.push({ kind: 'title', node: nodeId.title });
  const roomsIn = [];
  for (const r of d.rooms) {
    if (!inc(nodeId.room(r.id))) continue;
    const secs = [];
    if (inc(nodeId.summary(r.id))) secs.push({ kind: 'summary', node: nodeId.summary(r.id), title: 'Сводная информация' });
    const planes = inc(nodeId.results(r.id)) ? r.planes.filter((p) => inc(nodeId.plane(r.id, p.key))) : [];
    if (planes.length) secs.push({ kind: 'results', node: nodeId.results(r.id), title: 'Результаты', planes });
    if (r.images && inc(nodeId.ill(r.id))) secs.push({ kind: 'ill', node: nodeId.ill(r.id), title: 'Иллюстрации' });
    if (secs.length) roomsIn.push({ r, secs });
  }
  // contents: rooms and their sections; a page holds about 30 lines
  const tocLines = roomsIn.reduce((a, x) => a + 1 + x.secs.length, 0) + (inc(nodeId.lumlist) ? 1 : 0);
  const tocPages = inc(nodeId.toc) && roomsIn.length ? Math.max(1, Math.ceil(tocLines / 30)) : 0;
  for (let k = 0; k < tocPages; k++) plan.push({ kind: 'toc', node: nodeId.toc, part: k });
  // list of luminaires of all rooms in the report: one line per type, 22 lines a page
  const types = lumTypes(roomsIn.map((x) => x.r));
  const lumPages = inc(nodeId.lumlist) && types.length ? Math.ceil(types.length / 22) : 0;
  for (let k = 0; k < lumPages; k++) plan.push({ kind: 'lumlist', node: nodeId.lumlist, part: k });
  for (const { r, secs } of roomsIn) {
    let first = true;
    for (const s of secs) {
      if (s.kind === 'results') {
        for (let k = 0; k < s.planes.length; k += 2) {
          const two = s.planes.slice(k, k + 2);
          plan.push({ kind: 'planes', node: k ? nodeId.plane(r.id, two[0].key) : s.node, planes: two, r, head: first && k === 0, sec: k === 0 ? s : null,
            pnodes: two.map((x) => nodeId.plane(r.id, x.key)) });
        }
      } else plan.push({ kind: s.kind, node: s.node, r, head: first, sec: s });
      first = false;
    }
  }
  plan.forEach((p, k) => { p.n = k + 1; });
  const pageOf = (node) => plan.find((p) => p.node === node || p.pnodes?.includes(node))?.n ?? null;
  const toc = roomsIn.map(({ r, secs }) => ({ node: nodeId.room(r.id), title: r.name, page: pageOf(secs[0].node), secs: secs.map((s) => ({ node: s.node, title: s.title, page: pageOf(s.node) })) }));
  if (lumPages) toc.unshift({ node: nodeId.lumlist, title: 'Перечень светильников', page: pageOf(nodeId.lumlist), secs: [] });

  // ---- pages ----
  const date = (d.date ?? new Date()).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const head = (mid) => `<div class="rh"><span class="rhp">${typo(project)}</span><span class="rhm">${typo(mid)}</span><span class="rhl">${MAYTONI}</span></div>`;
  const foot = (n) => `<div class="folio">${n}</div>`;
  const roomHead = (r) => `<div class="roomhead"><div class="kick">Помещение</div><h1>${typo(r.name)}</h1></div>`;
  const kv = (rows) => `<table class="kv"><tbody>${rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</tbody></table>`;

  const pages = plan.map((p) => {
    const id = `pg-${p.n}`;
    if (p.kind === 'title') {
      const meta = [
        ['Заказчик', typo(d.info.customer)],
        ['Исполнитель', [typo(d.info.author), esc(d.info.phone), esc(d.info.email)].filter(Boolean).join('<br>')],
        ['Дата', esc(date)],
      ].filter(([, v]) => v);
      return `<section class="page title" id="${id}" data-node="${p.node}">
        <div class="logo">${MAYTONI}</div>
        <div class="tblock"><div class="kick">Светотехнический расчет</div>
          <h1 class="pname">${typo(d.info.name?.trim() || 'Проект без названия')}</h1>
          ${d.info.description?.trim() ? `<p class="pdesc">${typo(d.info.description).replace(/\n+/g, '<br>')}</p>` : ''}</div>
        <dl class="tmeta">${meta.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
        <div class="tfoot">Расчет выполнен в${NB}несертифицированном программном обеспечении и${NB}носит демонстрационный характер. MAYTONI не${NB}несет ответственности за${NB}расхождения между результатами этого расчета, фактической освещенностью и${NB}результатами расчетов в${NB}сертифицированном программном обеспечении.</div>
      </section>`;
    }
    if (p.kind === 'toc') {
      let line = 0;
      const lo = p.part * 30, hi = lo + 30;
      let body = '';
      for (const t of toc) {
        const rows = [`<li class="tr room"><a href="#pg-${t.page}"><span class="tt">${typo(t.title)}</span><span class="td"></span><span class="tp">${t.page}</span></a></li>`,
          ...t.secs.map((s) => `<li class="tr sec"><a href="#pg-${s.page}"><span class="tt">${s.title}</span><span class="td"></span><span class="tp">${s.page}</span></a></li>`)];
        const take = rows.filter(() => { const k = line++; return k >= lo && k < hi; });
        if (take.length) body += `<ol class="toc">${take.join('')}</ol>`;
      }
      return `<section class="page" id="${id}" data-node="${p.node}">${head(p.part ? 'Содержание' : '')}<div class="frame">
        ${p.part === 0 ? '<h2 class="toch">Содержание</h2>' : ''}${body}</div>${foot(p.n)}</section>`;
    }
    if (p.kind === 'lumlist') {
      const part = types.slice(p.part * 22, p.part * 22 + 22);
      const totalN = types.reduce((a, t) => a + t.count, 0), totalP = types.reduce((a, t) => a + (t.power ? t.power * t.count : 0), 0);
      const rows = part.map((t, k) => `<tr><td class="c">${p.part * 22 + k + 1}</td><td><b>${typo(t.article)}</b>${t.maker ? `<br><span>${typo(t.maker)}</span>` : ''}</td>
        <td class="n">${t.flux ? num(t.flux) : '—'}</td><td class="n">${t.power ? num(t.power, 1) : '—'}</td><td class="n">${t.cct ? num(t.cct) : '—'}</td>
        <td>${t.rooms.map((x) => `${typo(x.name)}${NB}— ${x.count}`).join('<br>')}</td><td class="n"><b>${t.count}</b></td></tr>`).join('');
      const last = p.part === lumPages - 1;
      return `<section class="page" id="${id}" data-node="${p.node}">${head(p.part ? 'Перечень светильников' : '')}<div class="frame">
        ${p.part === 0 ? '<h2 class="toch">Перечень светильников</h2>' : ''}
        <table class="lum"><thead><tr><th class="c">Поз.</th><th>Светильник</th><th class="n">Φ, лм</th><th class="n">P, Вт</th><th class="n">T<sub>ц</sub>, K</th><th>Помещения</th><th class="n">Кол-во, шт.</th></tr></thead>
        <tbody>${rows}</tbody>${last ? `<tfoot><tr><td></td><td colspan="5">Всего${totalP ? `; установленная мощность ${num(totalP, totalP < 100 ? 1 : 0)}${NB}Вт` : ''}</td><td class="n"><b>${totalN}</b></td></tr></tfoot>` : ''}</table>
      </div>${foot(p.n)}</section>`;
    }
    const r = p.r;
    const top = p.head ? roomHead(r) : '';
    const h2 = (s) => (s ? `<h2>${s.title}</h2>` : '');
    const mid = p.head ? '' : r.name;
    if (p.kind === 'summary') {
      const n = planScale(r.L, r.W, FRAME.w - 17, 82 - 17);
      return `<section class="page" id="${id}" data-node="${p.node}">${head(mid)}<div class="frame">${top}${h2(p.sec)}
        <figure class="fig plan">${roomPlanSvg({ ...r, n })}<figcaption>План помещения со${NB}светильниками, размеры в${NB}миллиметрах</figcaption></figure>
        <div class="cols"><div><h3>Помещение</h3>${kv(r.roomRows)}
            ${r.polar ? `<figure class="fig polarfig">${r.polar}<figcaption>КСС, кд/клм: C0–C180 — сплошная, C90–C270 — пунктир</figcaption></figure>` : ''}</div>
          <div><h3>Светильник</h3>${kv(r.lumRows)}</div></div>
      </div>${foot(p.n)}</section>`;
    }
    if (p.kind === 'planes') {
      // two planes a page: each gets half of the frame below the headings
      const avail = FRAME.h - (p.head ? 22 : 0) - (p.sec ? 14 : 0);
      const block = avail / 2;
      const blocks = p.planes.map((pl, k) => {
        const n = planScale(r.L, r.W, FRAME.w - 11, block - 9 - 24 - 10 - 11);
        const st = pl.stats;
        return `<div class="plblock" data-node="${p.pnodes[k]}">
          <h3 class="plh">${pl.name}<span>${pl.normative ? 'нормируемая поверхность' : 'для справки'}${pl.z > 0 ? `, высота ${num(pl.z, 2)}${NB}м` : ', пол'}</span></h3>
          <figure class="fig plan">${isolinePlanSvg({ ...r, n, sets: pl.sets, gost: pl.gost }, `p${p.n}-${k}`)}</figure>
          <table class="res"><thead><tr><th>Ē, лк</th><th>E<sub>min</sub>, лк</th><th>E<sub>max</sub>, лк</th><th>U<sub>0</sub>${NB}=${NB}E<sub>min</sub>${NB}/${NB}Ē</th><th>U<sub>d</sub>${NB}=${NB}E<sub>min</sub>${NB}/${NB}E<sub>max</sub></th></tr></thead>
            <tbody><tr><td>${lux(st.avg)}${pl.norm ? `${MARK[pl.norm.status]}${NB}(${num(pl.norm.En)})` : ''}</td><td>${lux(st.min)}</td><td>${lux(st.max)}</td>
              <td>${num(st.u0, 2)}${u0Mark(pl)}</td><td>${num(st.minMax, 2)}</td></tr></tbody></table></div>`;
      }).join('');
      return `<section class="page" id="${id}" data-node="${p.node}">${head(mid)}<div class="frame">${top}${h2(p.sec)}${blocks}</div>${foot(p.n)}</section>`;
    }
    // illustrations
    const small = p.head;
    const w = small ? 146 : ILL.w, h = w * ILL.h / ILL.w;
    return `<section class="page" id="${id}" data-node="${p.node}">${head(mid)}<div class="frame">${top}${h2(p.sec)}
      <figure class="fig ill"><img src="${r.images.real}" style="width:${w}mm;height:${h.toFixed(2)}mm" alt=""><figcaption>Визуализация светораспределения</figcaption></figure>
      <figure class="fig ill"><img src="${r.images.falseColor}" style="width:${w}mm;height:${h.toFixed(2)}mm" alt=""><figcaption>Распределение освещенности в${NB}фиктивных цветах</figcaption></figure>
      <figure class="fig scale">${colorScaleSvg(w)}<figcaption>Шкала фиктивных цветов, лк: у${NB}каждой отметки — нижняя граница ступени</figcaption></figure>
    </div>${foot(p.n)}</section>`;
  });

  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(project)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600&display=swap">
<style>${CSS}</style></head><body>${pages.join('\n')}
<script>${FIT}</script></body></html>`.replace(/ё/g, 'е').replace(/Ё/g, 'Е'); // «е» throughout the report
  return { html, pages: plan.map((p) => ({ node: p.node, pnodes: p.pnodes ?? [], n: p.n })), toc };
}

/**
 * Types of luminaires of the rooms: one entry per manufacturer, article, flux, power and colour
 * temperature, with the count per room.
 */
export function lumTypes(rooms) {
  const map = new Map();
  for (const r of rooms) {
    const l = r.lum;
    if (!l) continue;
    const key = [l.maker, l.article, l.flux, l.power, l.cct].join('|');
    if (!map.has(key)) map.set(key, { ...l, count: 0, rooms: [] });
    const t = map.get(key);
    t.count += l.count;
    t.rooms.push({ name: r.name, count: l.count });
  }
  return [...map.values()];
}

/** Status marks of the results table: within the norm, below it, above the next step / no norm. */
const MARK = {
  ok: `${NB}<svg class="mk" viewBox="0 0 14 14"><path d="M2.5 7.4 5.6 10.4 11.5 3.8" fill="none" stroke="#1d874d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  low: `${NB}<svg class="mk" viewBox="0 0 14 14"><path d="M3.5 3.5 10.5 10.5M10.5 3.5 3.5 10.5" fill="none" stroke="#eb3d00" stroke-width="2" stroke-linecap="round"/></svg>`,
  high: `${NB}<svg class="mk" viewBox="0 0 14 14"><path d="M7 1.6 13 12.2H1z" fill="#e8a400"/><path d="M7 5.4v3.2" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/><circle cx="7" cy="10.4" r=".85" fill="#fff"/></svg>`,
};
/** U₀ of a normative plane: against the norm when it is set, else a warning below 0,3. */
function u0Mark(pl) {
  if (!pl.norm) return '';
  const u = pl.stats.u0, U = pl.norm.U0n;
  if (U != null) return `${MARK[u < U - 1e-9 ? 'low' : 'ok']}${NB}(${num(U, 2)})`;
  return u < 0.3 - 1e-9 ? MARK.high : '';
}

function plural(n, one, few, many) {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
}

/** The verdict under the normative plane. */
function normText(norm, st) {
  const parts = [];
  if (norm.status === 'low') parts.push(`Ē${NB}=${NB}${lux(st.avg)}${NB}лк ниже нормы E<sub>н</sub>${NB}=${NB}${num(norm.En)}${NB}лк.`);
  else if (norm.status === 'high') parts.push(`Норма E<sub>н</sub>${NB}=${NB}${num(norm.En)}${NB}лк выполнена; Ē выше следующей ступени шкалы освещённостей.`);
  else parts.push(`Норма E<sub>н</sub>${NB}=${NB}${num(norm.En)}${NB}лк выполнена.`);
  if (norm.u0Low) parts.push(`Равномерность U<sub>0</sub>${NB}=${NB}${num(st.u0, 2)} меньше нормы ${num(norm.U0n, 2)}.`);
  else if (norm.U0n != null) parts.push(`Равномерность U<sub>0</sub>${NB}=${NB}${num(st.u0, 2)} не меньше нормы ${num(norm.U0n, 2)}.`);
  return parts.join(' ');
}

/** Screen preview: pages on a grey desk, scaled to the frame width; print: pages as they are. */
const FIT = `(function(){var W=210*96/25.4;function fit(){var z=Math.min(1,Math.max(.3,(innerWidth-48)/W));document.body.style.zoom=z;}addEventListener('resize',fit);fit();})();`;

const CSS = `
@page{size:A4;margin:0}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;color:#141414;font-family:Jost,"Helvetica Neue",Arial,sans-serif;
  font-size:9.5pt;line-height:1.45;font-kerning:normal;font-feature-settings:"kern","liga";hyphens:manual;-webkit-hyphens:manual;overflow-wrap:normal;text-rendering:optimizeLegibility}
.page{position:relative;width:210mm;height:297mm;overflow:hidden;background:#fff;break-after:page;page-break-after:always}
.page:last-child{break-after:auto;page-break-after:auto}
@media screen{body{background:#dcdcdc;padding:24px 0}.page{margin:0 auto 24px;box-shadow:0 1px 3px rgba(0,0,0,.12),0 8px 28px rgba(0,0,0,.10)}}
@media print{body{zoom:1!important;background:none;padding:0}.page{margin:0;box-shadow:none}}
.frame{position:absolute;left:${PAGE.left}mm;right:${PAGE.right}mm;top:${PAGE.top}mm;bottom:${PAGE.bottom}mm}
.rh{position:absolute;left:${PAGE.left}mm;right:${PAGE.right}mm;top:8mm;height:10mm;display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:6mm;align-items:end;
  font-size:7pt;letter-spacing:.06em;text-transform:uppercase;color:#7a7a7a;font-weight:500}
.rh .rhp{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow:hidden;line-height:1.3;max-width:62mm}
.rh .rhm{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:62mm;text-align:center;color:#141414}
.rh .rhl{justify-self:end;width:22mm;color:#141414;display:block;line-height:0;padding-bottom:.35mm}
.rh .rhl svg{display:block;width:100%;height:auto}
.folio{position:absolute;right:${PAGE.right}mm;bottom:11mm;font-size:8pt;color:#141414;font-variant-numeric:tabular-nums;font-weight:500}
.kick{font-size:7.5pt;letter-spacing:.14em;text-transform:uppercase;color:#7a7a7a;font-weight:500}
h1,h2,h3{font-weight:600;margin:0;hyphens:manual;-webkit-hyphens:manual}
.roomhead{margin:0 0 9mm}
.roomhead h1{font-size:22pt;line-height:1.12;letter-spacing:-.01em;margin:2.2mm 0 1.6mm}
h2{font-size:13pt;line-height:1.2;margin:0 0 6mm;padding-bottom:2.2mm;border-bottom:.5pt solid #141414}
h3{font-size:9.5pt;line-height:1.3;margin:0 0 2.5mm}
h3.plh{font-size:11pt;margin:0 0 4mm;display:flex;align-items:baseline;gap:3mm}
h3.plh span{font-size:8.5pt;font-weight:400;color:#6b6b6b}
.fig{margin:0 0 6mm;display:flex;flex-direction:column;align-items:center}
.fig svg,.fig img{display:block}
.fig figcaption{font-size:7.5pt;line-height:1.4;color:#6b6b6b;margin-top:2.2mm;max-width:135mm;text-align:center}
.fig.ill{margin-bottom:9mm}
.fig.polarfig{margin:5mm 0 0}
.fig.polarfig figcaption{max-width:70mm}
.plblock{margin-bottom:7mm}
.plblock .fig{margin-bottom:3mm}
.res{table-layout:fixed}
.res .mk{width:2.6mm;height:2.6mm;vertical-align:-.2mm}
.fig.ill img{object-fit:cover;background:#fff}
.fig.scale{margin:2mm 0 0}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:9mm;margin-top:2mm}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
.kv th,.kv td{font-size:8.5pt;padding:1.25mm 0;border-bottom:.35pt solid #cfcfcf;vertical-align:baseline;text-align:left}
.kv tr:first-child th,.kv tr:first-child td{border-top:.5pt solid #141414}
.kv th{font-weight:400;color:#555;padding-right:3mm;width:52%}
.kv td{font-weight:500}
.res{margin-top:1mm}
.res th{font-size:7.5pt;font-weight:500;color:#555;text-align:center;padding:0 1mm 1.6mm;border-bottom:.5pt solid #141414}
.res td{font-size:9pt;font-weight:500;text-align:center;padding:1.8mm 1mm;border-bottom:.35pt solid #cfcfcf;white-space:nowrap}
.verdict{font-size:8.5pt;margin:3mm 0 0;padding-left:3.2mm;border-left:1.2pt solid #1d874d;max-width:140mm}
.verdict.bad{border-left-color:#eb3d00}
sub{font-size:.72em;line-height:0;vertical-align:-.25em}
/* title page */
.title .logo{position:absolute;right:${PAGE.right}mm;top:14mm;width:34mm;color:#141414}
.title .logo svg{display:block;width:100%;height:auto}
.title .tblock{position:absolute;left:${PAGE.left}mm;right:30mm;top:96mm}
.title .pname{font-size:32pt;line-height:1.06;letter-spacing:-.018em;margin:5mm 0 7mm;font-weight:600}
.title .pdesc{font-size:11pt;line-height:1.5;color:#333;margin:0;max-width:128mm}
.title .tmeta{position:absolute;left:${PAGE.left}mm;right:${PAGE.right}mm;bottom:44mm;margin:0;display:grid;
  grid-template-columns:repeat(3,1fr);gap:6mm;border-top:.5pt solid #141414;padding-top:4mm}
.title .tmeta dt{font-size:7pt;letter-spacing:.12em;text-transform:uppercase;color:#7a7a7a;margin:0 0 1.6mm;font-weight:500}
.title .tmeta dd{margin:0;font-size:9pt;line-height:1.45}
.title .tfoot{position:absolute;left:${PAGE.left}mm;right:60mm;bottom:20mm;font-size:7pt;line-height:1.45;color:#7a7a7a}
/* list of luminaires */
.lum th{font-size:7.5pt;font-weight:500;color:#555;text-align:left;padding:0 3mm 1.6mm 0;border-bottom:.5pt solid #141414;vertical-align:bottom}
.lum td{font-size:8.5pt;padding:2mm 3mm 2mm 0;border-bottom:.35pt solid #cfcfcf;vertical-align:top;line-height:1.35}
.lum td span{color:#6b6b6b;font-size:7.5pt}
.lum .n{text-align:right;white-space:nowrap}
.lum .c{width:9mm;color:#6b6b6b}
.lum tfoot td{border-bottom:0;border-top:.5pt solid #141414;font-weight:500}
.lum th:last-child,.lum td:last-child{padding-right:0}
/* contents */
.toch{border:0;padding:0;font-size:22pt;letter-spacing:-.01em;margin:0 0 12mm}
.toc{list-style:none;margin:0 0 5.5mm;padding:0}
.toc a{display:flex;align-items:baseline;color:inherit;text-decoration:none}
.toc .tr{line-height:1.3;margin:0 0 1.9mm}
.toc .room{font-weight:600;font-size:10.5pt;margin-bottom:2.6mm}
.toc .sec{padding-left:7mm;font-size:9.5pt}
.toc .tt{flex:none;max-width:120mm}
.toc .td{flex:1;min-width:6mm;margin:0 2mm;overflow:hidden;white-space:nowrap;color:#9a9a9a;font-weight:400}
.toc .td::before{content:"${'. '.repeat(160)}";letter-spacing:.08em}
.toc .tp{flex:none;min-width:7mm;text-align:right;font-variant-numeric:tabular-nums}
`;
