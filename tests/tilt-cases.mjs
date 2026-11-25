// Cases of the stage 2.1a MATLAB reference (matlab/stage21a_reference.m holds the same table).
// Angles in degrees; room = [L, W, H], h = element step, pos = photometric centre, m.
export const cases = [
  { phot: 'cosine', flux: 3000, room: [5, 4, 3], h: 0.5, pos: [1.7, 1.3, 2.6], psi: 20, tx: 25, ty: -40 },
  { phot: 'directIndirect', flux: 2000, fUp: 0.3, room: [4, 3, 2.8], h: 0.4, pos: [2.2, 1.6, 2.1], psi: 75, tx: -60, ty: 15 },
  { file: 'ERCO-C1000001.ldt', room: [5, 4, 3], h: 0.5, pos: [1.5, 1.2, 2.7], psi: 30, tx: 20, ty: 35 },
  { file: 'C009CW-L12B.ies', room: [6, 4, 3.2], h: 0.5, pos: [4.2, 2.5, 2.9], psi: -50, tx: -30, ty: 0 },
  { file: 'ERCO-32607-000.ldt', room: [5, 4, 3], h: 0.5, pos: [2.5, 2, 3], psi: 0, tx: 0, ty: 40 },
];
