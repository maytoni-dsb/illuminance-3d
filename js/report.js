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
  title: 'title', toc: 'toc', room: (r) => `room:${r}`, summary: (r) => `room:${r}/summary`,
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
  const project = d.info.name?.trim() || 'Светотехнический расчёт';
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
  const tocLines = roomsIn.reduce((a, x) => a + 1 + x.secs.length, 0);
  const tocPages = inc(nodeId.toc) && roomsIn.length ? Math.max(1, Math.ceil(tocLines / 30)) : 0;
  for (let k = 0; k < tocPages; k++) plan.push({ kind: 'toc', node: nodeId.toc, part: k });
  for (const { r, secs } of roomsIn) {
    let first = true;
    for (const s of secs) {
      if (s.kind === 'results') {
        s.planes.forEach((p, k) => plan.push({ kind: 'plane', node: k ? nodeId.plane(r.id, p.key) : s.node, plane: p, r, head: first, sec: k === 0 ? s : null, pnode: nodeId.plane(r.id, p.key) }));
      } else plan.push({ kind: s.kind, node: s.node, r, head: first, sec: s });
      first = false;
    }
  }
  plan.forEach((p, k) => { p.n = k + 1; });
  const pageOf = (node) => plan.find((p) => p.node === node || p.pnode === node)?.n ?? null;
  const toc = roomsIn.map(({ r, secs }) => ({ node: nodeId.room(r.id), title: r.name, page: pageOf(secs[0].node), secs: secs.map((s) => ({ node: s.node, title: s.title, page: pageOf(s.node) })) }));

  // ---- pages ----
  const date = (d.date ?? new Date()).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const head = (right) => `<div class="rh"><span>${typo(project)}</span><span>${typo(right)}</span></div>`;
  const foot = (n) => `<div class="folio">${n}</div>`;
  const roomHead = (r) => `<div class="roomhead"><div class="kick">Помещение</div><h1>${typo(r.name)}</h1>
    <div class="roomsub">${num(r.L, 2)}${NB}×${NB}${num(r.W, 2)}${NB}×${NB}${num(r.H, 2)}${NB}м · ${r.xs.length * r.ys.length}${NB}${plural(r.xs.length * r.ys.length, 'светильник', 'светильника', 'светильников')}</div></div>`;
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
        <div class="tblock"><div class="kick">Светотехнический расчёт</div>
          <h1 class="pname">${typo(d.info.name?.trim() || 'Проект без названия')}</h1>
          ${d.info.description?.trim() ? `<p class="pdesc">${typo(d.info.description).replace(/\n+/g, '<br>')}</p>` : ''}</div>
        <dl class="tmeta">${meta.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
        <div class="tfoot">Расчёт методом излучательности: прямая составляющая — по кривым силы света, отражённая — с учётом многократных отражений. Значения — с${NB}учётом коэффициента эксплуатации.</div>
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
      return `<section class="page" id="${id}" data-node="${p.node}">${head('Содержание')}<div class="frame">
        ${p.part === 0 ? '<h2 class="toch">Содержание</h2>' : ''}${body}</div>${foot(p.n)}</section>`;
    }
    const r = p.r;
    const top = p.head ? roomHead(r) : '';
    const h2 = (s) => (s ? `<h2>${s.title}</h2>` : '');
    if (p.kind === 'summary') {
      const maxH = 100;
      const n = planScale(r.L, r.W, FRAME.w - 17, maxH - 17);
      return `<section class="page" id="${id}" data-node="${p.node}">${head(r.name)}<div class="frame">${top}${h2(p.sec)}
        <figure class="fig plan">${roomPlanSvg({ ...r, n })}<figcaption>План помещения со светильниками. Размеры в${NB}миллиметрах. Масштаб${NB}1:${n}.</figcaption></figure>
        <div class="cols"><div><h3>Помещение</h3>${kv(r.roomRows)}</div><div><h3>Светильник</h3>${kv(r.lumRows)}</div></div>
      </div>${foot(p.n)}</section>`;
    }
    if (p.kind === 'plane') {
      const pl = p.plane;
      const used = (p.head ? 34 : 0) + (p.sec ? 13 : 0) + 12 + 12 + 30 + 14;
      const n = planScale(r.L, r.W, FRAME.w - 11, Math.min(170, FRAME.h - used) - 11);
      const st = pl.stats;
      const verdict = pl.norm ? normText(pl.norm, st) : '';
      return `<section class="page" id="${id}" data-node="${p.pnode}">${head(r.name)}<div class="frame">${top}${h2(p.sec)}
        <h3 class="plh">${pl.name}<span>${pl.normative ? 'нормируемая поверхность' : 'для справки'}${pl.z > 0 ? `, высота ${num(pl.z, 2)}${NB}м` : ', пол'}</span></h3>
        <figure class="fig plan">${isolinePlanSvg({ ...r, n, sets: pl.sets, gost: pl.gost }, `p${p.n}`)}
          <figcaption>Изолинии и значения освещённости в точках расчётной сетки (ГОСТ${NB}Р${NB}55710), лк, с${NB}учётом MF${NB}=${NB}${num(pl.mf, 2)}. Масштаб${NB}1:${n}.</figcaption></figure>
        <table class="res"><thead><tr><th>Ē, лк</th><th>E<sub>min</sub>, лк</th><th>E<sub>max</sub>, лк</th><th>E<sub>min</sub>${NB}/${NB}Ē</th><th>E<sub>min</sub>${NB}/${NB}E<sub>max</sub></th></tr></thead>
          <tbody><tr><td>${lux(st.avg)}</td><td>${lux(st.min)}</td><td>${lux(st.max)}</td><td>${num(st.u0, 2)}</td><td>${num(st.minMax, 2)}</td></tr></tbody></table>
        ${verdict ? `<p class="verdict ${pl.norm.status === 'low' || pl.norm.u0Low ? 'bad' : 'good'}">${verdict}</p>` : ''}
      </div>${foot(p.n)}</section>`;
    }
    // illustrations
    const small = p.head;
    const w = small ? 150 : ILL.w, h = w * ILL.h / ILL.w;
    return `<section class="page" id="${id}" data-node="${p.node}">${head(r.name)}<div class="frame">${top}${h2(p.sec)}
      <figure class="fig ill"><img src="${r.images.real}" style="width:${w}mm;height:${h.toFixed(2)}mm" alt=""><figcaption>Яркость поверхностей, исходный вид.</figcaption></figure>
      <figure class="fig ill"><img src="${r.images.falseColor}" style="width:${w}mm;height:${h.toFixed(2)}mm" alt=""><figcaption>Освещённость поверхностей в${NB}фиктивных цветах, лк, с${NB}учётом MF.</figcaption></figure>
      <figure class="fig scale">${colorScaleSvg(w)}<figcaption>Шкала фиктивных цветов: освещённость, лк; у${NB}каждого цвета — нижняя граница его ступени.</figcaption></figure>
    </div>${foot(p.n)}</section>`;
  });

  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>${esc(project)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap">
<style>${CSS}</style></head><body>${pages.join('\n')}
<script>${FIT}</script></body></html>`;
  return { html, pages: plan.map((p) => ({ node: p.node, pnode: p.pnode ?? null, n: p.n })), toc };
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
  if (norm.u0Low) parts.push(`Равномерность E<sub>min</sub>${NB}/${NB}Ē${NB}=${NB}${num(st.u0, 2)} меньше 0,3.`);
  return parts.join(' ');
}

/** Screen preview: pages on a grey desk, scaled to the frame width; print: pages as they are. */
const FIT = `(function(){var W=210*96/25.4;function fit(){var z=Math.min(1,Math.max(.3,(innerWidth-48)/W));document.body.style.zoom=z;}addEventListener('resize',fit);fit();})();`;

const CSS = `
@font-face{font-family:"Report Sans";font-weight:400;src:local("Suisse Intl"),local("Suisse Int'l"),local("SuisseIntl-Regular"),local("Suisse Int'l Regular"),url("fonts/SuisseIntl-Regular.woff2") format("woff2")}
@font-face{font-family:"Report Sans";font-weight:500;src:local("Suisse Intl Medium"),local("Suisse Int'l Medium"),local("SuisseIntl-Medium"),url("fonts/SuisseIntl-Medium.woff2") format("woff2")}
@font-face{font-family:"Report Sans";font-weight:600;src:local("Suisse Intl SemiBold"),local("Suisse Int'l SemiBold"),local("SuisseIntl-SemiBold"),url("fonts/SuisseIntl-SemiBold.woff2") format("woff2")}
@page{size:A4;margin:0}
*{box-sizing:border-box}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;color:#141414;font-family:"Report Sans","Suisse Intl","Suisse Int'l",Inter,"Helvetica Neue",Arial,sans-serif;
  font-size:9.5pt;line-height:1.45;font-kerning:normal;font-feature-settings:"kern","liga";hyphens:auto;-webkit-hyphens:auto;
  hyphenate-limit-chars:6 3 3;text-rendering:optimizeLegibility}
.page{position:relative;width:210mm;height:297mm;overflow:hidden;background:#fff;break-after:page;page-break-after:always}
.page:last-child{break-after:auto;page-break-after:auto}
@media screen{body{background:#dcdcdc;padding:24px 0}.page{margin:0 auto 24px;box-shadow:0 1px 3px rgba(0,0,0,.12),0 8px 28px rgba(0,0,0,.10)}}
@media print{body{zoom:1!important;background:none;padding:0}.page{margin:0;box-shadow:none}}
.frame{position:absolute;left:${PAGE.left}mm;right:${PAGE.right}mm;top:${PAGE.top}mm;bottom:${PAGE.bottom}mm}
.rh{position:absolute;left:${PAGE.left}mm;right:${PAGE.right}mm;top:11mm;display:flex;justify-content:space-between;gap:10mm;
  font-size:7pt;letter-spacing:.06em;text-transform:uppercase;color:#7a7a7a;font-weight:500}
.rh span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:48%}
.folio{position:absolute;right:${PAGE.right}mm;bottom:11mm;font-size:8pt;color:#141414;font-variant-numeric:tabular-nums;font-weight:500}
.kick{font-size:7.5pt;letter-spacing:.14em;text-transform:uppercase;color:#7a7a7a;font-weight:500}
h1,h2,h3{font-weight:600;margin:0;hyphens:manual;-webkit-hyphens:manual}
.roomhead{margin:0 0 9mm}
.roomhead h1{font-size:22pt;line-height:1.12;letter-spacing:-.01em;margin:2.2mm 0 1.6mm}
.roomsub{font-size:9pt;color:#555;font-variant-numeric:tabular-nums}
h2{font-size:13pt;line-height:1.2;margin:0 0 6mm;padding-bottom:2.2mm;border-bottom:.5pt solid #141414}
h3{font-size:9.5pt;line-height:1.3;margin:0 0 2.5mm}
h3.plh{font-size:11pt;margin:0 0 4mm;display:flex;align-items:baseline;gap:3mm}
h3.plh span{font-size:8.5pt;font-weight:400;color:#6b6b6b}
.fig{margin:0 0 6mm}
.fig svg,.fig img{display:block}
.fig figcaption{font-size:7.5pt;line-height:1.4;color:#6b6b6b;margin-top:2.2mm;max-width:135mm}
.fig.plan svg{margin-left:-2mm}
.fig.ill{margin-bottom:5mm}
.fig.ill img{object-fit:cover;background:#fff}
.fig.scale{margin:2mm 0 0}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:9mm;margin-top:2mm}
table{border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums}
.kv th,.kv td{font-size:8.5pt;padding:1.25mm 0;border-bottom:.35pt solid #cfcfcf;vertical-align:baseline;text-align:left}
.kv tr:first-child th,.kv tr:first-child td{border-top:.5pt solid #141414}
.kv th{font-weight:400;color:#555;padding-right:3mm;width:52%}
.kv td{font-weight:500}
.res{margin-top:1mm}
.res th{font-size:7.5pt;font-weight:500;color:#555;text-align:right;padding:0 0 1.6mm 4mm;border-bottom:.5pt solid #141414}
.res td{font-size:11pt;font-weight:500;text-align:right;padding:2mm 0 2mm 4mm;border-bottom:.35pt solid #cfcfcf}
.res th:first-child,.res td:first-child{text-align:left;padding-left:0}
.verdict{font-size:8.5pt;margin:3mm 0 0;padding-left:3.2mm;border-left:1.2pt solid #1d874d;max-width:140mm}
.verdict.bad{border-left-color:#eb3d00}
sub{font-size:.72em;line-height:0;vertical-align:-.25em}
/* title page */
.title .logo{position:absolute;left:${PAGE.left}mm;top:22mm;width:34mm;color:#141414}
.title .logo svg{display:block;width:100%;height:auto}
.title .tblock{position:absolute;left:${PAGE.left}mm;right:30mm;top:96mm}
.title .pname{font-size:32pt;line-height:1.06;letter-spacing:-.018em;margin:5mm 0 7mm;font-weight:600}
.title .pdesc{font-size:11pt;line-height:1.5;color:#333;margin:0;max-width:128mm}
.title .tmeta{position:absolute;left:${PAGE.left}mm;right:${PAGE.right}mm;bottom:44mm;margin:0;display:grid;
  grid-template-columns:repeat(3,1fr);gap:6mm;border-top:.5pt solid #141414;padding-top:4mm}
.title .tmeta dt{font-size:7pt;letter-spacing:.12em;text-transform:uppercase;color:#7a7a7a;margin:0 0 1.6mm;font-weight:500}
.title .tmeta dd{margin:0;font-size:9pt;line-height:1.45}
.title .tfoot{position:absolute;left:${PAGE.left}mm;right:60mm;bottom:20mm;font-size:7pt;line-height:1.45;color:#7a7a7a}
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
