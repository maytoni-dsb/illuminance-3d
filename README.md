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

Layout: inputs | 3D view | results (three columns from 1280 px; results under the view at
900–1280 px; one column below 900 px). The view buttons are icons with instant tooltips:
false colors, plan view, initial view. The plan view is an orthographic camera from above
(`fitPlan`, `panPlan`, `zoomPlan`, `planToOrbit` in `js/orbit.js`); the first rotation returns to
the orbit from straight above. The X/Y/Z axis indicator is drawn in its own small viewport in the
lower left corner, above the legend.
