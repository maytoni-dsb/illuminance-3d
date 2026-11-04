// 3D view of the room in Three.js.
// The only place where room coordinates are converted to Three.js:
// (x, y, z)three = (x, z, −y) — a −90° rotation about X, no reflection.
// Strings shown in the UI (self-check results, labels) are in Russian.
import * as THREE from 'three';
import {
  createOrbit, rotate, zoom, zoomBy, pan, cameraPosition, anglesOf,
  fitPlan, panPlan, zoomPlan, zoomPlanBy, planToOrbit,
} from './orbit.js';
import { facePoint, faceVertexValues } from './geometry.js';
import { LEVELS, COLORS } from './colorscale.js';

/** Room → Three.js. */
export const toThree = (p) => [p[0], p[2], -p[1]];
/** Matrix of the same mapping (columns are the images of the room's X, Y, Z unit vectors). */
export const ROOM_TO_THREE = Object.freeze([
  [1, 0, 0],
  [0, 0, 1],
  [0, -1, 0],
]);

/** Placeholder face colors by face number (stage 1); used in the "условные цвета" mode. */
export const FACE_COLORS = Object.freeze(['#b9a27f', '#e8e4da', '#7fa6c9', '#9fbfd9', '#8fb98b', '#b5d3a8']);
const AXIS_COLORS = { X: '#d0443a', Y: '#2e9b4a', Z: '#2f6fd6' };

/**
 * Unlit false-color material: per-vertex illuminance `value` is interpolated over the triangles and
 * mapped to the stepped scale in the fragment shader, so color borders follow the isolines.
 * Palette colors are sRGB and are written as is (no color-space conversion is applied).
 */
function falseColorMaterial() {
  const n = LEVELS.length;
  return new THREE.ShaderMaterial({
    uniforms: {
      levels: { value: LEVELS.slice() },
      colors: { value: COLORS.map((c) => new THREE.Vector3(c[0], c[1], c[2])) },
    },
    vertexShader: `
      attribute float value;
      varying float vValue;
      void main() {
        vValue = value;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform float levels[${n}];
      uniform vec3 colors[${n}];
      varying float vValue;
      void main() {
        int k = 0;
        for (int i = 1; i < ${n}; i++) if (vValue >= levels[i]) k = i;
        gl_FragColor = vec4(colors[k], 1.0);
      }`,
    side: THREE.FrontSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
}

const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function textSprite(text, color, px = 64) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = `600 ${px}px system-ui, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 16;
  c.width = w; c.height = px + 16;
  ctx.font = `600 ${px}px system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 8, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.renderOrder = 10;
  s.userData.aspect = w / c.height;
  return s;
}

function disposeTree(obj) {
  obj.traverse((o) => {
    o.geometry?.dispose();
    const m = o.material;
    if (m) for (const mm of Array.isArray(m) ? m : [m]) { mm.map?.dispose(); mm.dispose(); }
  });
}

/** Face mesh: (nu+1)(nv+1) vertices, two triangles per element. */
function buildFaceMesh(face) {
  const { nu, nv, du, dv } = face;
  const nThree = toThree(face.normal);
  const pos = new Float32Array(3 * (nu + 1) * (nv + 1));
  const nor = new Float32Array(pos.length);
  const p = [0, 0, 0];
  for (let b = 0; b <= nv; b++) for (let a = 0; a <= nu; a++) {
    const t = toThree(facePoint(face, a * du, b * dv, p));
    const k = 3 * (a + b * (nu + 1));
    pos[k] = t[0]; pos[k + 1] = t[1]; pos[k + 2] = t[2];
    nor[k] = nThree[0]; nor[k + 1] = nThree[1]; nor[k + 2] = nThree[2];
  }
  // Winding is chosen so that the front side matches the face normal:
  // u × v is not always equal to n (ceiling, walls y = 0 and x = L).
  const ccw = dot(cross(face.u, face.v), face.normal) > 0;
  const idx = new Uint32Array(6 * nu * nv);
  let q = 0;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const v00 = i + j * (nu + 1), v10 = v00 + 1, v01 = v00 + nu + 1, v11 = v01 + 1;
    if (ccw) idx.set([v00, v10, v11, v00, v11, v01], q);
    else idx.set([v00, v11, v10, v00, v01, v11], q);
    q += 6;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('value', new THREE.BufferAttribute(new Float32Array((nu + 1) * (nv + 1)), 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const mat = new THREE.MeshLambertMaterial({
    color: FACE_COLORS[face.id],
    side: THREE.FrontSide, // faces near the camera point away from it and are culled
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.userData.faceId = face.id;
  mesh.userData.plainMaterial = mat;
  return mesh;
}

/** Element boundary lines of a face. */
function buildFaceGrid(face) {
  const { nu, nv, du, dv, sizeU, sizeV } = face;
  const pts = [];
  const push = (u, v) => pts.push(...toThree(facePoint(face, u, v)));
  for (let a = 0; a <= nu; a++) { push(a * du, 0); push(a * du, sizeV); }
  for (let b = 0; b <= nv; b++) { push(0, b * dv); push(sizeU, b * dv); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x2b2b2b, transparent: true, opacity: 0.35 }));
  return lines;
}

/**
 * Luminaire markers: light squares facing down at the photometric centre, turned by ψ,
 * with a suspension line for pendants. The luminaire size is not known before stage 5,
 * so the square side is a fixed fraction of the grid pitch (at most 0.3 m).
 */
function buildLuminaires(r, lums, edgeColor) {
  const group = new THREE.Group();
  if (!lums.length) return group;
  const zs = lums[0].pos[2];
  const xs = new Set(lums.map((s) => s.pos[0])).size, ys = new Set(lums.map((s) => s.pos[1])).size;
  const side = Math.min(0.3, 0.35 * Math.min(r.L / xs, r.W / ys));
  const plane = new THREE.PlaneGeometry(side, side);
  plane.rotateX(Math.PI / 2); // PlaneGeometry faces +Z; after rotation it faces −Y (down in Three.js)
  const fill = new THREE.MeshBasicMaterial({ color: 0xfffbea, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const edges = new THREE.EdgesGeometry(plane);
  const edgeMat = new THREE.LineBasicMaterial({ color: edgeColor });
  const hangs = [];
  const zMark = Math.min(zs, r.H - 0.004); // keep the square just below the ceiling plane
  for (const s of lums) {
    const t = toThree([s.pos[0], s.pos[1], zMark]);
    const m = new THREE.Mesh(plane, fill);
    m.position.set(t[0], t[1], t[2]);
    m.rotation.y = s.psi; // Three.js +Y is room +Z: rotation about it is counterclockwise viewed from above
    const e = new THREE.LineSegments(edges, edgeMat);
    e.position.copy(m.position); e.rotation.copy(m.rotation);
    group.add(m, e);
    if (r.H - zs > 1e-6) hangs.push(...toThree([s.pos[0], s.pos[1], r.H]), ...t);
  }
  if (hangs.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(hangs, 3));
    group.add(new THREE.LineSegments(g, edgeMat));
  }
  return group;
}

/**
 * Creates the 3D view inside a container.
 * @param {HTMLElement} container
 * @param {{ onHover?: (info: null | {f:number, i:number, j:number, g:number, name:string}) => void }} [opts]
 */
export function createView(container, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0); // background comes from the container's CSS (light and dark themes)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 1000);
  // Scene lighting only conveys face shape; colors are placeholders (by face number).
  scene.add(new THREE.HemisphereLight(0xffffff, 0xdcdcdc, 2.6));
  const sun = new THREE.DirectionalLight(0xffffff, 0.5);
  sun.position.set(0.4, 1, 0.7);
  scene.add(sun);

  let orbit = null;        // camera state, see orbit.js; pivot = floor center
  let room = null;
  let roomGroup = null;
  let lumGroup = null;     // luminaire markers
  let values = null;       // element values (lx) shown in false colors, or null
  // 'false' — false colors by `values`; 'neutral' — plain light grey faces;
  // 'faces' — placeholder colors by face number (developer aid)
  let colorMode = 'false';
  const fcMaterial = falseColorMaterial();
  const neutralMaterial = new THREE.MeshLambertMaterial({
    color: 0xe6e3dd, side: THREE.FrontSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  let faceParts = [];      // [{ face, mesh, grid, arrow, center, normal }]
  let showGrid = false, showNormals = false; // element grid and normals are developer aids, off by default
  let edgeMaterial = null;
  let viewW = 1, viewH = 1;
  let viewTouched = false;  // true once the user has rotated, panned or zoomed since the last fit

  /**
   * Axis indicator (3ds Max-like): X, Y, Z arrows of unit length in their own scene, drawn in a
   * small square in the lower left corner of the view. It turns with the camera only (no pan, no zoom).
   */
  function buildAxes() {
    const group = new THREE.Group();
    const dirs = {};
    const unit = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
    for (const k of ['X', 'Y', 'Z']) {
      const d = v3(toThree(unit[k]));
      dirs[k] = d.clone();
      const arrow = new THREE.ArrowHelper(d, new THREE.Vector3(0, 0, 0), 1, AXIS_COLORS[k], 0.3, 0.16);
      group.add(arrow);
      const s = textSprite(k, AXIS_COLORS[k]);
      const sz = 0.5;
      s.scale.set(sz * s.userData.aspect, sz, 1);
      s.position.copy(d.clone().multiplyScalar(1.3));
      group.add(s);
    }
    return { group, dirs };
  }
  const axes = buildAxes(); // { group, dirs: { X, Y, Z } }
  const gizmoScene = new THREE.Scene();
  gizmoScene.add(axes.group);
  const gizmoCam = new THREE.OrthographicCamera(-1.55, 1.55, 1.55, -1.55, 0.1, 10);
  const GIZMO_PX = 76;

  // Plan view (orthographic, from above); null when the perspective orbit is active.
  let plan = null;
  const planCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 1000);
  const activeCamera = () => (plan ? planCam : camera);

  /** Initial view direction: from above, past the corner (L, 0) of the room. */
  const DEFAULT_DIR = toThree([0.55, -1, 0.75]);

  /**
   * Frames the room. The pivot is always the floor center. With keepAngles the current
   * azimuth and elevation stay (used when the room size changes); otherwise the default
   * view is restored. In both cases the image is shifted so that the room's center is
   * in the middle of the viewport: from above, the floor near walls and the ceiling are
   * culled, so we see the floor and the far walls ("dollhouse" view).
   */
  function fitCamera(r, keepAngles) {
    const R = 0.5 * Math.hypot(r.L, r.W, r.H);
    // fit the room's bounding sphere into the narrower of the vertical and horizontal fields of view
    const vHalf = THREE.MathUtils.degToRad(camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * (viewW / viewH));
    const fit = R / Math.sin(Math.min(vHalf, hHalf)) + 0.5 * r.H;
    const angles = keepAngles && orbit ? { azimuth: orbit.azimuth, elevation: orbit.elevation } : anglesOf(DEFAULT_DIR);
    orbit = createOrbit({
      target: toThree([r.L / 2, r.W / 2, 0]),
      ...angles,
      distance: fit,
      minDistance: 0.05 * R,
      maxDistance: 20 * fit,
    });
    camera.near = 0.01 * R; camera.far = 100 * fit;
    applyCamera(false);
    // center the room in the viewport by a lens shift (the pivot does not move)
    const c = v3(toThree([r.L / 2, r.W / 2, r.H / 2])).project(camera);
    orbit.shiftX = -c.x * viewW / 2;
    orbit.shiftY = c.y * viewH / 2;
    applyCamera(true);
    viewTouched = false;
  }

  /** Overlay sizes from the page (buttons on top, status and legend below), CSS px. */
  const insets = () => ({ top: 56, bottom: 24, side: 24, ...(opts.insets?.() ?? {}) });
  /** Plan fit keeps clear of the status row and the axis indicator as well. */
  const planInsets = () => { const i = insets(); return { ...i, bottom: i.planBottom ?? i.bottom + 40 }; };

  /** Copies the plan state to the orthographic camera: looking down, room +Y up on screen. */
  function applyPlan() {
    const a = viewW / viewH;
    planCam.left = -plan.half * a; planCam.right = plan.half * a;
    planCam.top = plan.half; planCam.bottom = -plan.half;
    const top = (room ? room.H : 3) + 1;
    planCam.position.set(plan.cx, top + 1, plan.cz);
    planCam.up.set(0, 0, -1);
    planCam.lookAt(plan.cx, 0, plan.cz);
    planCam.near = 0.01; planCam.far = top + 2;
    planCam.updateProjectionMatrix();
    planCam.updateMatrixWorld();
  }

  /** Switches to the plan view, fitted to the floor. */
  function showPlan() {
    if (!room) return;
    plan = fitPlan(room, viewW, viewH, planInsets());
    viewTouched = true;
    opts.onPlanChange?.(true);
    requestRender();
  }

  /** Leaves the plan for the orbit from straight above, keeping the image in place. */
  function leavePlan() {
    if (!plan) return;
    const R = 0.5 * Math.hypot(room.L, room.W, room.H);
    orbit = planToOrbit(plan, orbit.target, THREE.MathUtils.degToRad(camera.fov / 2), viewH,
      { minDistance: orbit.minDistance, maxDistance: Math.max(orbit.maxDistance, 40 * R) });
    plan = null;
    opts.onPlanChange?.(false);
  }

  /** Copies the orbit state to the Three.js camera; withShift applies the pan as a view offset. */
  function applyCamera(withShift = true) {
    const p = cameraPosition(orbit);
    camera.position.set(p[0], p[1], p[2]);
    camera.up.set(0, 1, 0);
    camera.lookAt(orbit.target[0], orbit.target[1], orbit.target[2]);
    if (withShift && (orbit.shiftX || orbit.shiftY)) {
      camera.setViewOffset(viewW, viewH, -orbit.shiftX, -orbit.shiftY, viewW, viewH);
    } else {
      camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  /** Rebuilds the scene for a new room. */
  function setRoom(r) {
    for (const p of faceParts) p.mesh.material = p.mesh.userData.plainMaterial; // the shared false-color material outlives rooms
    if (roomGroup) { scene.remove(roomGroup); disposeTree(roomGroup); }
    room = r;
    roomGroup = new THREE.Group();
    const arrowLen = 0.12 * Math.min(r.L, r.W, r.H) + 0.1;
    faceParts = r.faces.map((face) => {
      const mesh = buildFaceMesh(face);
      const grid = buildFaceGrid(face);
      const center = toThree(facePoint(face, face.sizeU / 2, face.sizeV / 2));
      const normal = toThree(face.normal);
      const arrow = new THREE.ArrowHelper(v3(normal), v3(center), arrowLen, cssColor('--ink', '#111111'), 0.3 * arrowLen, 0.15 * arrowLen);
      roomGroup.add(mesh, grid, arrow);
      return { face, mesh, grid, arrow, center, normal };
    });
    // room outline
    const box = new THREE.BoxGeometry(r.L, r.H, r.W);
    box.translate(r.L / 2, r.H / 2, -r.W / 2);
    edgeMaterial = new THREE.LineBasicMaterial({ color: cssColor('--view-edge', '#444444') });
    roomGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(box), edgeMaterial));
    box.dispose();
    scene.add(roomGroup);
    if (lumGroup) { scene.remove(lumGroup); disposeTree(lumGroup); lumGroup = null; }
    values = null;
    applyMaterials();
    fitCamera(r, keepView); // first room: default view; later rooms keep the user's angles
    if (plan) plan = fitPlan(r, viewW, viewH, planInsets());
    keepView = true;
    requestRender();
  }
  let keepView = false;

  /** False colors when values are set and that mode is on; neutral grey or placeholder colors otherwise. */
  function applyMaterials() {
    for (const p of faceParts) {
      p.mesh.material = colorMode === 'faces' ? p.mesh.userData.plainMaterial
        : colorMode === 'false' && values ? fcMaterial : neutralMaterial;
    }
  }

  /**
   * Element values to show in false colors (lx, global element order), or null.
   * Vertex values are means of the adjacent elements of the same face (geometry.faceVertexValues).
   */
  function setValues(v) {
    values = v;
    if (v) {
      for (const p of faceParts) {
        const attr = p.mesh.geometry.attributes.value;
        attr.array.set(faceVertexValues(p.face, v));
        attr.needsUpdate = true;
      }
    }
    applyMaterials();
    requestRender();
  }

  /** Luminaire markers (photometry.luminaireGrid). */
  function setLuminaires(lums) {
    if (lumGroup) { scene.remove(lumGroup); disposeTree(lumGroup); }
    lumGroup = room ? buildLuminaires(room, lums, cssColor('--view-edge', '#444444')) : null;
    if (lumGroup) scene.add(lumGroup);
    requestRender();
  }

  /** Reads a color from a CSS custom property of the container (follows the page theme). */
  function cssColor(name, fallback) {
    const v = getComputedStyle(container).getPropertyValue(name).trim();
    return new THREE.Color(v || fallback);
  }

  /** Grid lines and normal arrows are shown only on faces whose front side faces the camera. */
  function updateVisibility() {
    const cam = activeCamera().position.toArray();
    for (const p of faceParts) {
      const front = dot(p.normal, sub(cam, p.center)) > 0;
      p.grid.visible = showGrid && front;
      p.arrow.visible = showNormals && front;
    }
  }

  // ---- rendering on demand: one frame per input event, no animation loop ----
  let framePending = false;
  function requestRender() {
    if (framePending) return;
    framePending = true;
    requestAnimationFrame(() => {
      framePending = false;
      if (!orbit) return;
      if (plan) applyPlan(); else applyCamera();
      updateVisibility();
      const cam = activeCamera();
      renderer.setViewport(0, 0, viewW, viewH);
      renderer.render(scene, cam);
      // axis indicator: same orientation as the view camera, its own square in the lower left corner
      gizmoCam.quaternion.copy(cam.quaternion);
      gizmoCam.position.set(0, 0, 5).applyQuaternion(cam.quaternion);
      gizmoCam.updateMatrixWorld();
      const gb = insets().bottom;
      renderer.autoClear = false;
      renderer.clearDepth();
      renderer.setScissorTest(true);
      renderer.setScissor(6, gb, GIZMO_PX, GIZMO_PX);
      renderer.setViewport(6, gb, GIZMO_PX, GIZMO_PX);
      renderer.render(gizmoScene, gizmoCam);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, viewW, viewH);
      renderer.autoClear = true;
    });
  }

  // ---- mouse and touch: left = rotate, right / middle = pan, wheel = zoom ----
  const el = renderer.domElement;
  el.style.touchAction = 'none';
  const pointers = new Map(); // pointerId → { x, y }
  let dragMode = null;        // 'rotate' | 'pan' | null
  let pinch = null;           // { d, mx, my } for two-finger touch

  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('pointerdown', (e) => {
    if (!orbit) return;
    el.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      dragMode = null;
    } else if (pointers.size === 1) {
      dragMode = e.button === 0 ? 'rotate' : 'pan';
    }
    opts.onHover?.(null);
    viewTouched = true;
    e.preventDefault();
  });
  el.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) { hover(e); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      if (plan) {
        if (pinch.d > 0) zoomPlanBy(plan, d / pinch.d);
        panPlan(plan, mx - pinch.mx, my - pinch.my, viewH);
      } else {
        if (pinch.d > 0) zoomBy(orbit, d / pinch.d);
        pan(orbit, mx - pinch.mx, my - pinch.my);
      }
      pinch = { d, mx, my };
    } else if (dragMode === 'rotate') {
      if (plan) leavePlan(); // the first rotation leaves the plan, starting from straight above
      rotate(orbit, dx, dy, viewH);
    } else if (dragMode === 'pan') {
      if (plan) panPlan(plan, dx, dy, viewH); else pan(orbit, dx, dy);
    }
    requestRender();
  });
  const release = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) dragMode = null;
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('wheel', (e) => {
    if (!orbit) return;
    e.preventDefault();
    const k = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 500 : 1; // lines / pages → px
    if (plan) zoomPlan(plan, e.deltaY * k); else zoom(orbit, e.deltaY * k);
    viewTouched = true;
    requestRender();
  }, { passive: false });

  // hover: face, element (i, j), global index
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function hover(e) {
    if (!room || !opts.onHover) return;
    const rect = el.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, activeCamera());
    const hit = raycaster.intersectObjects(faceParts.map((p) => p.mesh), false)[0];
    if (!hit) { opts.onHover(null); return; }
    const f = hit.object.userData.faceId;
    const face = room.faces[f];
    const elem = Math.floor(hit.faceIndex / 2); // two triangles per element, order i + j·nu
    const i = elem % face.nu, j = Math.floor(elem / face.nu);
    const g = face.offset + elem;
    opts.onHover({ f, i, j, g, name: face.name, value: values ? values[g] : null });
  }
  el.addEventListener('pointerleave', () => opts.onHover?.(null));

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    if (orbit) { orbit.shiftX *= w / viewW; orbit.shiftY *= h / viewH; } // keep the framing proportional
    viewW = w; viewH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    if (room && orbit && !viewTouched) fitCamera(room, true); // untouched view: refit to the new size
    if (plan && room) { // keep the plan's scale; refit only the free area
      const f = fitPlan(room, w, h, planInsets());
      plan.fitHalf = f.fitHalf;
    }
    requestRender();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  /**
   * Self-check against the built scene (stage 1 acceptance criteria).
   * Normals are computed from actual triangle vertices, not from the face table.
   */
  function selfCheck() {
    if (!room) return [];
    const res = [];
    const roomC = toThree([room.L / 2, room.W / 2, room.H / 2]);
    const edgeN = { L: room.n.L, W: room.n.W, H: room.n.H };

    let normalsOk = true; const nDetail = [];
    let countOk = true; const cDetail = [];
    for (const { face, mesh, center, normal } of faceParts) {
      const pos = mesh.geometry.attributes.position.array;
      const idx = mesh.geometry.index.array;
      let bad = 0;
      for (let t = 0; t < idx.length; t += 3) {
        const a = [pos[3 * idx[t]], pos[3 * idx[t] + 1], pos[3 * idx[t] + 2]];
        const b = [pos[3 * idx[t + 1]], pos[3 * idx[t + 1] + 1], pos[3 * idx[t + 1] + 2]];
        const c = [pos[3 * idx[t + 2]], pos[3 * idx[t + 2] + 1], pos[3 * idx[t + 2] + 2]];
        const gn = cross(sub(b, a), sub(c, a));
        const len = Math.hypot(...gn);
        if (!(dot(gn, normal) / len > 1 - 1e-6)) bad++;           // front side = face normal
      }
      const inward = dot(normal, sub(roomC, center)) > 0;          // normal points into the room
      if (bad || !inward) { normalsOk = false; nDetail.push(`${face.name}: ${bad ? bad + ' треуг. не по нормали' : 'наружу'}`); }

      const tris = idx.length / 3;
      const FD = { 0: ['L', 'W'], 1: ['L', 'W'], 2: ['L', 'H'], 3: ['L', 'H'], 4: ['W', 'H'], 5: ['W', 'H'] }[face.id];
      const expected = edgeN[FD[0]] * edgeN[FD[1]];
      if (tris !== 2 * expected || face.count !== expected) {
        countOk = false; cDetail.push(`${face.name}: ${tris / 2} ≠ ${expected}`);
      }
    }
    res.push({ name: 'Нормали всех граней направлены внутрь', ok: normalsOk, detail: normalsOk ? '6 из 6, по вершинам треугольников' : nDetail.join('; ') });
    const total = faceParts.reduce((s, p) => s + p.mesh.geometry.index.count / 6, 0);
    res.push({
      name: 'Число элементов совпадает с n_L, n_W, n_H',
      ok: countOk && total === room.N,
      detail: countOk ? `N = ${total} = 2·(n_L·n_W + n_L·n_H + n_W·n_H)` : cDetail.join('; '),
    });

    // axes: X → +x, Y → −z, Z → +y in Three.js; floor at y = 0, ceiling at y = H
    const want = { X: [1, 0, 0], Y: [0, 0, -1], Z: [0, 1, 0] };
    let axesOk = true;
    for (const k of ['X', 'Y', 'Z']) {
      const d = axes.dirs[k].toArray();
      if (dot(d, want[k]) < 1 - 1e-9) axesOk = false;
    }
    const m = ROOM_TO_THREE;
    const det = m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const floorY = faceParts[0].center[1], ceilY = faceParts[1].center[1];
    const wallY0 = faceParts[2].center[2], wallYW = faceParts[3].center[2];
    if (det !== 1 || floorY !== 0 || Math.abs(ceilY - room.H) > 1e-6 || wallY0 !== 0 || Math.abs(wallYW + room.W) > 1e-6) axesOk = false;
    res.push({ name: 'Оси в 3D соответствуют спецификации', ok: axesOk, detail: `X→+x, Y→−z, Z→+y; det = ${det}` });
    return res;
  }

  return {
    setRoom,
    selfCheck,
    setValues,
    setLuminaires,
    /** 'false' — false colors (default); 'neutral' — grey faces; 'faces' — placeholder colors by face number. */
    setColorMode(m) { colorMode = m; applyMaterials(); requestRender(); },
    setShowGrid(v) { showGrid = v; requestRender(); },
    setShowNormals(v) { showNormals = v; requestRender(); },
    resetView() {
      if (!room) return;
      if (plan) { plan = null; opts.onPlanChange?.(false); }
      fitCamera(room, false); requestRender();
    },
    /** Orthographic view from above, fitted to the floor; a rotation returns to the orbit. */
    showPlan,
    isPlan: () => !!plan,
    /** Redraws after overlays changed size (legend shown or hidden). */
    refresh() { requestRender(); },
    /** Re-reads theme colors from CSS (call after switching light/dark theme). */
    refreshTheme() {
      edgeMaterial?.color.copy(cssColor('--view-edge', '#444444'));
      const ink = cssColor('--ink', '#111111');
      for (const p of faceParts) p.arrow.setColor(ink);
      lumGroup?.traverse((o) => { if (o.isLineSegments) o.material.color.copy(cssColor('--view-edge', '#444444')); });
      requestRender();
    },
    /** Orbit state for diagnostics and tests (copy). */
    orbitState() { return orbit && JSON.parse(JSON.stringify(orbit)); },
    dispose() {
      ro.disconnect();
      for (const p of faceParts) p.mesh.material = p.mesh.userData.plainMaterial;
      if (roomGroup) disposeTree(roomGroup);
      if (lumGroup) disposeTree(lumGroup);
      fcMaterial.dispose(); neutralMaterial.dispose();
      disposeTree(axes.group);
      renderer.dispose(); el.remove();
    },
  };
}
