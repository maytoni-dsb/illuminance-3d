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

Stage 2 — form factor point → rectangle: `js/formfactor.js` (Lambert's contour integral with
horizon clipping and an emitter-side check), `js/checks2.js` (the on-page "Критерии этапа 2" panel),
`tests/formfactor.test.mjs`. Closed forms from Howell's catalogue (B-3, C-11, C-14) are used as
references.

## MATLAB reference values

`matlab/stage2_reference.m` (MATLAB R2025b) writes `matlab/stage2_reference.txt`: every row holds
the full input and the result with 17 significant digits. Copy the file to
`tests/fixtures/stage2_reference.txt`; `npm test` then requires agreement within 1e-9
(the test is skipped while the file is absent).

