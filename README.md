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

Stage 4 — reflected light (radiosity) and the realistic view (accepted 4 Nov 2026; `npm test` on Windows: 90 of 90):
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
solves (I − F R) E_ind = F R E_dir directly; its `stage4_reference.txt` is in `tests/fixtures/`
(tolerance 1e-9). MATLAB R2025b comparison (4 Nov 2026): 1352 elements in four rooms, E_dir within
2.4e-15 and E_ind within 1.0e-13 relative. Timing for 10 × 10 × 3 m (4176 elements, headless Chromium): kernel 0.3 s once per
geometry, direct component 10 ms, solver 0.3 s (6 sweeps).

Stage 5 — photometric files (IES LM-63 and EULUMDAT):
- `js/photfile.js`: parsers reducing both formats to one table (stored C planes × γ angles, cd) with
  the symmetry (`rot`, `quad`, `half0`, `half90` — LDT Isym 3 starts at C270 —, `none`), sizes and the
  rated flux (LDT: Φ_lamps of the first lamp set · LORL; IES states no luminaire flux). Quirks met in
  the Maytoni library are tolerated with a warning (an LDT declaring Isym 0/2/4 with one plane is
  read as rotational; the LDT conversion factor is not applied: the tables integrate to the rated
  flux without it); broken files are rejected with a message in Russian. IES horizontal angles are
  read as C angles as they are; the luminaire length lies along C0–C180 in IES and along C90–C270
  in LDT (ERCO pairs: IES width = LDT length, identical C angles);
- `js/photometry.js`: the table expanded to the full circle, a bilinear interpolant in (C, γ) and the
  exact closed-form flux of that interpolant (total, downward, upward). A luminaire in the ceiling
  plane (h_c = 0) emits only its downward flux; the page says how much upward flux is lost;
- `js/direct.js`: element averages for tabulated photometry by adaptive cubature (Gauss 3 × 3 against
  its four quarters, tolerance max(1e-3 · value, 1e-7 · Φ) per element and luminaire) with a flux
  balance control of 1e-3 per luminaire; 10 × 10 × 3 m with 16–36 luminaires: 0.2–0.4 s;
- `js/photui.js`: the file picker (button or drop onto the form), the luminaire card with a polar
  diagram (C0–C180 and C90–C270, cd/klm); the last file is kept in this browser's localStorage;
  `js/view3d.js` draws the luminous surface in its size and, for pendants, the grey housing;
- `js/checks5.js`: the on-page "Критерии этапа 5" panel; `tests/photfile.test.mjs` the tests with
  synthetic files of every symmetry and real files in `tests/fixtures/photometry/`.

Check a whole folder of photometric files (every file must parse, the flux of the table must agree
with the rated flux within 1 %, IES/LDT pairs of the same name are compared direction by direction):

```
node scripts/check-library.mjs <folder> [--verbose] [--json report.json]
```

`matlab/stage5_reference.m` parses the fixture files independently and writes fluxes (MATLAB's
`integral` with the tabulated angles as waypoints) and intensities at 200 directions per file
(`interp1` / `interp2`) to `stage5_reference.txt`; copy it to `tests/fixtures/` (tolerance 1e-9).

Stage 5, revision 1 (user feedback, 4 Nov 2026):
- LDT lamp sets are read one after another (six lines each); the form shows a choice of the light
  source when a file has several; flux (step 100 lm), colour temperature (step 100 K) and power
  (step 0.1 W) are editable — the table is scaled so that its flux equals the flux in the form;
- the photometry chips are replaced by the file drop zone; without a file the cosine distribution
  is used; the luminaire description is manufacturer, name, catalogue number, housing size
  "length × width × height м" and a compact polar diagram (γ lines every 30°, no labels);
- the form fields are 32 px high with up / down arrows on the left (and ↑ / ↓ keys), step 0.1 unless
  stated otherwise (counts 1, ψ 5°, E_n 10 lx); "?" help buttons open a popover (`js/help.js`,
  texts to be written); MF, the required illuminance E_n and the work plane height h_р are in the
  room section;
- results (`js/workplane.js`, computed in the worker): the planes Г-0,0, Г-0,8 and Г-h (when h_р
  differs from both), grid p = 0.2 · 5^lg d with points at cell centres, E = E_dir(x) + Σ F(x → A_j)
  M_j with the exact point → element factors (cached per room and plane height). Each plane is a
  collapsed row with Ē and U₀; the normative plane is marked red / green / orange against E_n and the
  scale of levels, U₀ < 0.3 red; the others are "* Для справки";
- 3D view: only the edges of culled faces are drawn; the wheel zooms toward the pointer (orbit and
  plan); the fitted room is centred in the free part of the view.

Stage 5, revision 2 (5 Nov 2026):
- plane indices on the element mesh (`js/workplane.js`): the plane at height z is divided into cells
  like the floor and every cell gets its area-average illuminance — direct by the exact lobe formula
  or the adaptive cubature, reflected Σ F(cell → element) M with exact rectangle factors kept in
  small tables (ceiling by |Δi|, |Δj|; walls by the shift along the wall, the cell's distance from it
  and the wall row, clipped at the plane). Ē is the exact area mean, Г-0,0 is the floor itself;
  results show Ē, E_min, E_max, E_min / Ē (U₀) and E_min / E_max. The GOST grid (`workGrid`) stays for
  the point values on the plans (stage 6);
- `js/estimate.js`: the preliminary number of luminaires by the method of the estimate page
  (formulas 1–16, Z = 1.15) and a grid with at least that many (`gridFor`: uneven spacing penalised);
  run when a file is loaded and by the "Предложить" button, never on other changes;
- the form: fields 26 px high; the luminaire section is the drop zone (file name inside it, a new file
  can be dropped onto it), the luminaire description and parameters, then the grid; no edges in 3D.
