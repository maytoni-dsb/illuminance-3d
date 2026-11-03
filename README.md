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

