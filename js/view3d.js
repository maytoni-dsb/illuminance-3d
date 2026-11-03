// 3D view of the room in Three.js.
// The only place where room coordinates are converted to Three.js:
// (x, y, z)three = (x, z, −y) — a −90° rotation about X, no reflection.
// Strings shown in the UI (self-check results, labels) are in Russian.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { facePoint } from './geometry.js';

/** Room → Three.js. */
export const toThree = (p) => [p[0], p[2], -p[1]];
/** Matrix of the same mapping (columns are the images of the room's X, Y, Z unit vectors). */
export const ROOM_TO_THREE = Object.freeze([
  [1, 0, 0],
  [0, 0, 1],
  [0, -1, 0],
]);

/** Placeholder face colors by face number (stage 1). */
export const FACE_COLORS = Object.freeze(['#b9a27f', '#e8e4da', '#7fa6c9', '#9fbfd9', '#8fb98b', '#b5d3a8']);
const AXIS_COLORS = { X: '#d0443a', Y: '#2e9b4a', Z: '#2f6fd6' };

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
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const mat = new THREE.MeshLambertMaterial({
    color: FACE_COLORS[face.id],
    side: THREE.FrontSide, // faces near the camera point away from it and are culled
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.userData.faceId = face.id;
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

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  let room = null;
  let roomGroup = null;
  let faceParts = [];      // [{ face, mesh, grid, arrow, center, normal }]
  let axes = null;         // { group, dirs: { X, Y, Z } }
  let showGrid = true, showNormals = false;
  let firstFit = true;

  function buildAxes(r) {
    const len = 0.25 * Math.max(r.L, r.W, r.H) + 0.3;
    const group = new THREE.Group();
    const dirs = {};
    const unit = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
    for (const k of ['X', 'Y', 'Z']) {
      const d = v3(toThree(unit[k]));
      dirs[k] = d.clone();
      const arrow = new THREE.ArrowHelper(d, new THREE.Vector3(0, 0, 0), len, AXIS_COLORS[k], 0.12 * len, 0.06 * len);
      arrow.line.material.depthTest = false; arrow.cone.material.depthTest = false;
      arrow.renderOrder = 9;
      group.add(arrow);
      const s = textSprite(k, AXIS_COLORS[k]);
      const sz = 0.14 * len;
      s.scale.set(sz * s.userData.aspect, sz, 1);
      s.position.copy(d.clone().multiplyScalar(len * 1.12));
      group.add(s);
    }
    const o = textSprite('0', '#555');
    const sz = 0.07 * len;
    o.scale.set(sz * o.userData.aspect, sz, 1);
    o.position.set(-0.05 * len, -0.05 * len, 0.05 * len);
    group.add(o);
    return { group, dirs };
  }

  function fitCamera(r) {
    const c = v3(toThree([r.L / 2, r.W / 2, r.H / 2]));
    const radius = 0.5 * Math.hypot(r.L, r.W, r.H);
    const dist = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05;
    let dir;
    if (firstFit) {
      // view from above, past the corner (L, 0): floor and far walls y = W, x = 0 are visible;
      // near walls and the ceiling face away from the camera and are culled ("dollhouse" view)
      dir = v3(toThree([0.55, -1, 0.75])).normalize();
      firstFit = false;
    } else {
      dir = camera.position.clone().sub(controls.target).normalize();
    }
    controls.target.copy(c);
    camera.position.copy(c.clone().add(dir.multiplyScalar(dist)));
    camera.near = dist / 100; camera.far = dist * 10;
    camera.updateProjectionMatrix();
    controls.update();
  }

  /** Rebuilds the scene for a new room. */
  function setRoom(r) {
    if (roomGroup) { scene.remove(roomGroup); disposeTree(roomGroup); }
    if (axes) { scene.remove(axes.group); disposeTree(axes.group); }
    room = r;
    roomGroup = new THREE.Group();
    const arrowLen = 0.12 * Math.min(r.L, r.W, r.H) + 0.1;
    faceParts = r.faces.map((face) => {
      const mesh = buildFaceMesh(face);
      const grid = buildFaceGrid(face);
      const center = toThree(facePoint(face, face.sizeU / 2, face.sizeV / 2));
      const normal = toThree(face.normal);
      const arrow = new THREE.ArrowHelper(v3(normal), v3(center), arrowLen, 0x111111, 0.3 * arrowLen, 0.15 * arrowLen);
      roomGroup.add(mesh, grid, arrow);
      return { face, mesh, grid, arrow, center, normal };
    });
    // room outline
    const box = new THREE.BoxGeometry(r.L, r.H, r.W);
    box.translate(r.L / 2, r.H / 2, -r.W / 2);
    roomGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: 0x444444 })));
    box.dispose();
    scene.add(roomGroup);
    axes = buildAxes(r);
    scene.add(axes.group);
    fitCamera(r);
    updateVisibility();
  }

  /** Grid lines and normal arrows are shown only on faces whose front side faces the camera. */
  function updateVisibility() {
    const cam = camera.position.toArray();
    for (const p of faceParts) {
      const front = dot(p.normal, sub(cam, p.center)) > 0;
      p.grid.visible = showGrid && front;
      p.arrow.visible = showNormals && front;
    }
  }

  // hover: face, element (i, j), global index
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!room || !opts.onHover) return;
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(faceParts.map((p) => p.mesh), false)[0];
    if (!hit) { opts.onHover(null); return; }
    const f = hit.object.userData.faceId;
    const face = room.faces[f];
    const elem = Math.floor(hit.faceIndex / 2); // two triangles per element, order i + j·nu
    const i = elem % face.nu, j = Math.floor(elem / face.nu);
    opts.onHover({ f, i, j, g: face.offset + elem, name: face.name });
  });
  renderer.domElement.addEventListener('pointerleave', () => opts.onHover?.(null));

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  let raf = 0;
  (function loop() {
    raf = requestAnimationFrame(loop);
    controls.update();
    updateVisibility();
    renderer.render(scene, camera);
  })();

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
    setShowGrid(v) { showGrid = v; },
    setShowNormals(v) { showNormals = v; },
    resetView() { firstFit = true; if (room) fitCamera(room); },
    dispose() {
      cancelAnimationFrame(raf); ro.disconnect(); controls.dispose();
      if (roomGroup) disposeTree(roomGroup);
      if (axes) disposeTree(axes.group);
      renderer.dispose(); renderer.domElement.remove();
    },
  };
}
