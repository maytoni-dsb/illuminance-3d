# Illuminance 3D

Online lighting calculator: illuminance distribution in an empty rectangular room,
computed with radiosity (gathering with a form-factor kernel). Everything runs in the browser.

Specification (living document, in Russian): https://claude.ai/artifact/911Gfh2dzzs71fY7wyDCSB

## Run locally

```
python -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` via `file://` does not work: browsers
refuse to load ES modules from the file system. Three.js 0.170.0 is loaded from jsDelivr
through an import map, so an internet connection is required.

## Module version stamps

Modules are loaded without a bundler, so a browser could combine a fresh module with a cached old
copy of another one. The import map in `index.html` therefore points every `./js/*.js` module to
`./js/<name>.js?v=<content hash>`; relative imports between modules are redirected too. After
changing anything in `js/`, run

```
npm run stamp
```

`npm test` fails while the stamps are out of date. Import maps do not apply inside Web Workers, so
`js/worker.js` has no static imports: the page creates it from its stamped URL and sends it the import
map, and the worker fetches every module by its stamped URL, rewrites the `'./name.js'` specifiers to
object URLs of the loaded dependencies and imports the result. Relative imports between modules
must therefore have the form `from './name.js'` (checked by `tests/stage4.test.mjs`).

## Tests

```
npm test
```

Node 18+, no dependencies (`node:test`). Calculation modules use neither the DOM nor Three.js.

## Conventions

- Code comments, documentation and commit messages are in English.
- User-facing text (labels, messages, face names) is in Russian.
- SI units everywhere; degrees only in the UI.

## Status

Stage 1 — geometry and 3D view: `js/geometry.js`, `js/orbit.js`, `js/view3d.js`, `js/ui.js`, `index.html`.
The subdivision step is chosen automatically (`autoStep`, about 4000 elements); it is not a user input.
Acceptance criteria are checked by `tests/geometry.test.mjs` and by the on-page
"Критерии этапа 1" panel, which derives normals from the vertices of the built triangles.

Stage 2 — form factors in `js/formfactor.js`:
- point → rectangle (`pointToRect`): Lambert's contour integral with horizon clipping and an
  emitter-side check; used for work-plane points;
- rectangle → rectangle (`rectToRect`, `elementToElement`): Sparrow's closed form for near pairs and,
  where its rounding error grows (centre distance ≥ 5 sizes), a 5 × 5 Gauss rule over the receiver of
  the exact point factor; relative error about 1e-12 for kernel elements, at most ~1e-10 for
  rectangles of very different size; used for the element kernel.

`js/checks2.js` is the on-page "Критерии этапа 2" panel, `tests/formfactor.test.mjs` the tests.
Closed forms from Howell's catalogue (B-3, C-11, C-14) are used as references.
MATLAB reference values (`tests/fixtures/`, 528 point and 500 rectangle cases) agree within
1.1e-16 and 3.5e-18 absolute (relative 1.7e-13 for rectangle → rectangle).

## MATLAB reference values

`matlab/stage2_reference.m` (MATLAB R2025b) writes `matlab/stage2_reference.txt` (point → rectangle)
and, through `matlab/stage2_rect_reference.m`, `matlab/stage2_rect_reference.txt` (rectangle →
rectangle). Every row holds the full input and the result with 17 significant digits. Copy the files
to `tests/fixtures/`; `npm test` then requires agreement within 1e-9 (the tests are skipped while the
files are absent).


Stage 3 — direct component and false colors:
- `js/photometry.js`: cosine and direct-indirect models in the C-γ system, luminaire grid
  (half-pitch margins, suspension h_c, rotation ψ);
- `js/direct.js`: direct illuminance at points (`directAtPoint`) and element averages
  (`elementDirect`). For photometry made of cosine lobes the element average is exact,
  Σ Φ_l · F(source, lobe axis → element) / A, so the flux on all faces equals the luminaires'
  flux to rounding on any mesh; general photometry (stage 5) uses a 4 × 4 Gauss rule;
- `js/colorscale.js`: the fixed 27-level scale (0…2000 lx) with stepped colors and the project palette
  (below 1 lx black, 2000 lx and above white); the legend runs along the bottom of the 3D view and
  the "Фиктивные цвета" button switches coloring off (neutral grey faces);
  `js/view3d.js` colors faces in a shader so color borders follow the isolines, and shows luminaires.

The form has luminaire inputs, photometry, f_up and MF (results are E = MF · E₀).
`js/checks3.js` is the on-page "Критерии этапа 3" panel, `tests/direct.test.mjs` the tests.
`matlab/stage3_reference.m` writes `stage3_point_reference.txt` and `stage3_element_reference.txt`
(element averages by `integral2` of the point formula, independent of the form-factor route);
they are in `tests/fixtures/`. MATLAB R2025b comparison (4 Nov 2026): 1256 point cases agree within
1.2e-13 relative, 400 element averages within 7.5e-12 (the accuracy of integral2 itself: MATLAB's
integral2 and the form-factor route differ by 7.8e-12).

Layout: inputs | 3D view | results, all as tall as the view, side panels scroll inside (three columns from 1280 px; results below at
900–1280 px; one column below 900 px). The view buttons are icons with instant tooltips:
false colors, plan view, initial view. The plan view is an orthographic camera from above
(`fitPlan`, `panPlan`, `zoomPlan`, `planToOrbit` in `js/orbit.js`); the first rotation returns to
the orbit from straight above. The X/Y/Z axis indicator is drawn in its own small viewport in the
lower left corner, above the legend.

Stage 4 — reflected light (radiosity) and the realistic view:
- `js/kernel.js`: the element → element form factors as six small tables instead of an N × N
  matrix — parallel faces by (|Δi|, |Δj|), perpendicular faces by the shift along the common edge and
  the two distances from it (stored as A·F, symmetric). Values are exact `rectToRect` factors, so
  Σ_j F_ij = 1 (to 6e-14) and reciprocity hold; the kernel equals the direct factor within 1e-11;
- `js/solver.js`: Gauss–Seidel gathering E_ind,i = Σ_j F_ij ρ_j (E_dir,j + E_ind,j) until the largest
  relative change is below ε = 1e-4, with a face-level coarse correction after every sweep (a constant
  per face from a 6 × 6 system with exact face-to-face factors, which zeroes the area-weighted
  residual of every face). The correction does not change the solution; it cuts ρ = 0.9 from 39 to 7
  sweeps and makes the energy balance exact to rounding. Also `energyBalance` and `sumpner`;
- `js/calc.js`: the whole calculation with the kernel cached per geometry, the direct component cached
  per luminaire set and a warm start of the solver; MF is applied by the page, so MF needs no
  recalculation. `js/worker.js` runs it in a Web Worker (main-thread fallback);
- `js/tonemap.js` and the realistic view in `js/view3d.js`: luminance L = ρE/π, Ward's contrast-based
  exposure from the log-average luminance of the whole room (never the visible part, so rotation does
  not change it), a soft shoulder and the sRGB curve in the fragment shader; ±2 stops correction in
  "Дополнительные настройки". The false-color button switches between false colors and this view;
- the form has reflectances (ceiling, walls, floor); the results table shows total, direct and
  reflected mean illuminance per face, and the face map can show any of the three.

`js/checks4.js` is the on-page "Критерии этапа 4" panel (the exposure check renders the room from eight
directions in `view3d.exposureCheck`); `tests/radiosity.test.mjs` and `tests/stage4.test.mjs` are the
tests. `matlab/stage4_reference.m` assembles the full matrix pair by pair with `rect_to_rect.m` and
solves (I − F R) E_ind = F R E_dir directly; its `stage4_reference.txt` goes to `tests/fixtures/`
(tolerance 1e-9). Timing for 10 × 10 × 3 m (4176 elements, headless Chromium): kernel 0.3 s once per
geometry, direct component 10 ms, solver 0.3 s (6 sweeps).
