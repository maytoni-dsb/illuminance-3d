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

Stage 1 — geometry and 3D view: `js/geometry.js`, `js/view3d.js`, `js/ui.js`, `index.html`.
Acceptance criteria are checked by `tests/geometry.test.mjs` and by the on-page
"Критерии этапа 1" panel, which derives normals from the vertices of the built triangles.
