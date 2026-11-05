// Web Worker that runs the calculation (calc.js) off the main thread.
//
// Module version stamps inside a worker. Import maps do not apply in workers, so a static
// `import './calc.js'` here (and calc.js's own `import './kernel.js'`, …) would load unstamped URLs
// that the browser may serve from a stale cache — the very mix of old and new modules the stamps
// prevent on the page (spec, "Метки версий модулей"). Therefore this file has NO static imports:
//   1. the page creates the worker from its stamped URL (import.meta.resolve('./js/worker.js'))
//      and sends it the page's import map (absolute stamped URLs);
//   2. the worker fetches every module it needs from its stamped URL, rewrites the relative
//      specifiers `'./name.js'` to object URLs of the already loaded dependencies (depth first) and
//      imports the result. Every module is thus fetched by its stamped URL and evaluated once.
// Relative imports between js/ modules must have the form `from './name.js'` (checked by the tests).
//
// Protocol (page → worker): { type: 'init', imports } then { type: 'run', id, params } and
// { type: 'plan', id, z } (field of the plan of a plane for the last run).
// Worker → page: { type: 'ready' } | { type: 'result', id, result } | { type: 'plan', id, plan } |
// { type: 'error', id, message }.

/** Relative specifiers './name.js' imported by a module's source text (static imports and re-exports). */
export function moduleDeps(text) {
  const out = new Set();
  const re = /\b(?:import|export)\s+(?:[^'";]*?\sfrom\s+)?['"](\.\/[\w.-]+\.js)['"]/g;
  for (const m of text.matchAll(re)) out.add(m[1]);
  return [...out];
}

/** Replaces the relative specifiers of a module's source text: './name.js' → urlOf('./name.js'). */
export function rewriteImports(text, urlOf) {
  return text.replace(/(\b(?:import|export)\s+(?:[^'";]*?\sfrom\s+)?)(['"])(\.\/[\w.-]+\.js)\2/g,
    (all, head, q, spec) => `${head}${q}${urlOf(spec)}${q}`);
}

/**
 * Loads a module of js/ and its dependencies by their stamped URLs.
 * @param {string} spec — './name.js' (relative to js/)
 * @param {Record<string, string>} imports — import map: './js/name.js' → absolute stamped URL
 * @param {Map<string, Promise<string>>} cache — spec → object URL
 */
export function loadModule(spec, imports, cache) {
  if (cache.has(spec)) return cache.get(spec);
  const p = (async () => {
    const url = imports[`./js/${spec.slice(2)}`];
    if (!url) throw new Error(`worker: ${spec} is not in the import map`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`worker: ${url}: HTTP ${res.status}`);
    const text = await res.text();
    const deps = moduleDeps(text);
    const urls = await Promise.all(deps.map((d) => loadModule(d, imports, cache)));
    const map = Object.fromEntries(deps.map((d, i) => [d, urls[i]]));
    const code = `${rewriteImports(text, (s) => map[s])}\n//# sourceURL=${url}`;
    return URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  })();
  cache.set(spec, p);
  return p;
}

// ---- worker side (skipped when this module is imported by the tests in Node) ----
const isWorker = typeof self !== 'undefined' && typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;
if (isWorker) {
  let calc = null;
  let ready = null;
  self.onmessage = async (e) => {
    const m = e.data;
    if (m.type === 'init') {
      ready = (async () => {
        const url = await loadModule('./calc.js', m.imports, new Map());
        const mod = await import(url);
        calc = mod.createCalc();
      })();
      try { await ready; self.postMessage({ type: 'ready' }); } catch (err) {
        self.postMessage({ type: 'error', id: null, message: String(err?.message ?? err) });
      }
      return;
    }
    if (m.type === 'run') {
      try {
        await ready;
        const result = calc.run(m.params);
        self.postMessage({ type: 'result', id: m.id, result }, [result.Edir.buffer, result.Eind.buffer]);
      } catch (err) {
        self.postMessage({ type: 'error', id: m.id, message: String(err?.stack ?? err?.message ?? err) });
      }
    }
    if (m.type === 'plan') {
      try {
        await ready;
        const plan = calc.plan(m.z);
        self.postMessage({ type: 'plan', id: m.id, plan }, [plan.E.buffer]);
      } catch (err) {
        self.postMessage({ type: 'error', id: m.id, plan: true, message: String(err?.stack ?? err?.message ?? err) });
      }
    }
  };
}
