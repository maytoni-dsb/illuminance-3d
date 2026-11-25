%STAGE21A_REFERENCE Reference values for tilted luminaires (stage 2.1a, 25 Nov 2026).
%   Run in MATLAB R2025b from any folder:  run('<repo>/matlab/stage21a_reference.m')
%   Writes stage21a_reference.txt next to this script; it goes to tests/fixtures/, and
%   tests/tilt.test.mjs compares JS with it (points and cosine-lobe elements within 1e-9).
%
%   Orientation (spec v2, stage 2.1a): R = Rz(psi) * Ry(ty) * Rx(tx) maps the luminaire frame
%   (C0 along x, gamma = 0 along -z) to the room. A room direction d is d_l = R' * d in the
%   luminaire frame; gamma = atan2(norm(d_l(1:2)), -d_l(3)), C = atan2(d_l(2), d_l(1)).
%   Built here from the three elementary rotation matrices (JS uses the expanded product).
%
%   Independent of the JS code: own file parsers (as in stage5_reference.m), interp1 / interp2
%   for the bilinear interpolant; element averages of cosine lobes by ff_point_rect.m with the
%   turned lobe axis (exact), of files by integral2 of the point formula.
%
%   Rows (%.17g):
%     1 case x y z nx ny nz E      direct illuminance at a point with normal n, lx
%     2 case g E                   element average, g = global element index from 0
%                                  (js/geometry.js order: faces 0..5, k = i + j*nu)
%     3 case 0 Phi                 flux below the horizontal of the turned distribution, lm
%                                  (Gauss 3 x 3 on 0.1 deg cells; the test allows 2e-6)
%                                  (a luminaire in the ceiling plane)

here = fileparts(mfilename('fullpath'));
addpath(here);
dir0 = fullfile(here, '..', 'tests', 'fixtures', 'photometry');

% The same table as tests/tilt-cases.mjs. phot: 1 cosine, 2 direct-indirect, 3 file.
C = struct( ...
  'phot', {1, 2, 3, 3, 3}, ...
  'flux', {3000, 2000, 0, 0, 0}, 'fUp', {0, 0.3, 0, 0, 0}, ...
  'file', {'', '', 'ERCO-C1000001.ldt', 'C009CW-L12B.ies', 'ERCO-32607-000.ldt'}, ...
  'room', {[5 4 3], [4 3 2.8], [5 4 3], [6 4 3.2], [5 4 3]}, ...
  'h', {0.5, 0.4, 0.5, 0.5, 0.5}, ...
  'pos', {[1.7 1.3 2.6], [2.2 1.6 2.1], [1.5 1.2 2.7], [4.2 2.5 2.9], [2.5 2 3]}, ...
  'psi', {20, 75, 30, -50, 0}, 'tx', {25, -60, 20, -30, 0}, 'ty', {-40, 15, 35, 0, 40});

rows = {};
fr = [0.02 0.3 0.5 0.77 0.98];
for c = 1:numel(C)
  K = C(c);
  L = K.room(1); W = K.room(2); H = K.room(3); s = K.pos;
  R = Rz(K.psi) * Ry(K.ty) * Rx(K.tx);
  if K.phot == 3
    txt = fileread(fullfile(dir0, K.file));
    if endsWith(lower(K.file), '.ies'), t = read_ies(txt); else, t = read_ldt(txt); end
    [Cf, If] = full_circle(t);
    I = @(Cd, gd) intensity(t, Cf, If, Cd, gd);
  else
    I0d = K.flux * (1 - K.fUp) / pi; I0u = K.flux * K.fUp / pi;
    I = @(Cd, gd) max(cosd(gd), 0) * I0d + max(-cosd(gd), 0) * I0u;
  end
  E = @(x, n) Epoint(x, n, s, R, I);

  % 1. points: a 5 x 5 pattern on every face, three points of the work plane, an oblique receiver
  for f = 1:6
    F = face(f, L, W, H);
    for a = fr, for b = fr
      x = F.o + a * F.su * F.u + b * F.sv * F.v;
      rows{end+1} = [1, c, x, F.n, E(x, F.n)]; %#ok<AGROW>
    end, end
  end
  for x = [s(1) s(2) 0.8; 0.3 0.4 0.8; L-0.2 W/2 0.8].'
    rows{end+1} = [1, c, x.', 0 0 1, E(x.', [0 0 1])]; %#ok<AGROW>
  end
  n = [0.6 0.48 0.64];
  rows{end+1} = [1, c, 1.1 2.3 1.2, n, E([1.1 2.3 1.2], n)]; %#ok<AGROW>

  % 2. element averages: all elements for cosine lobes (exact), every 7th for files (integral2)
  [nrm, lo, hi] = elements(L, W, H, K.h);
  N = size(lo, 1);
  if K.phot == 3, gs = 0:7:N-1; else, gs = 0:N-1; end
  for g = gs
    [p0, a, b] = edges(lo(g+1, :), hi(g+1, :), nrm(g+1, :));
    A = norm(cross(a, b));
    if K.phot == 3
      f2 = @(u, v) reshape(arrayfun(@(uu, vv) E(p0 + uu * a + vv * b, nrm(g+1, :)), u(:), v(:)), size(u));
      Ev = integral2(f2, 0, 1, 0, 1, 'Method', 'iterated', 'AbsTol', 1e-9, 'RelTol', 1e-7);
    else
      down = R * [0; 0; -1]; up = -down;
      Ev = (K.flux * (1 - K.fUp) * ff_point_rect(s, down, p0, a, b, nrm(g+1, :)) ...
          + K.flux * K.fUp * ff_point_rect(s, up, p0, a, b, nrm(g+1, :))) / A;
    end
    rows{end+1} = [2, c, g, Ev]; %#ok<AGROW>
  end

  % 3. flux below the horizontal (files): integral over the lower hemisphere of the room.
  %    Not integral2: the table has a kink at every tabulated angle, an adaptive rule refines
  %    without end (25 Nov 2026). A vectorised 3-point Gauss rule on 0.1 deg cells instead; the
  %    same on 0.2 deg cells is printed as the estimate of its error.
  if K.phot == 3
    Phi = hemiFlux(R, t, Cf, If, 900, 3600);
    Phi2 = hemiFlux(R, t, Cf, If, 450, 1800);
    fprintf('case %d: flux below the horizontal %.9g lm (0.2 deg: rel. diff %.1e)\n', c, Phi, abs(Phi2 / Phi - 1));
    rows{end+1} = [3, c, 0, Phi]; %#ok<AGROW>
  end
  fprintf('case %d done\n', c);
end

out = fullfile(here, 'stage21a_reference.txt');
fid = fopen(out, 'w');
fprintf(fid, '%% stage21a_reference: kind case ... value; MATLAB %s, %s\n', version, char(datetime('now', 'Format', 'yyyy-MM-dd HH:mm')));
for k = 1:numel(rows)
  r = rows{k};
  fprintf(fid, [repmat('%.17g ', 1, numel(r) - 1) '%.17g\n'], r);
end
fclose(fid);
fprintf('Wrote %d rows to %s\n', numel(rows), out);

% ------------------------------------------------------------------------------------------------

function M = Rx(a), M = [1 0 0; 0 cosd(a) -sind(a); 0 sind(a) cosd(a)]; end
function M = Ry(b), M = [cosd(b) 0 sind(b); 0 1 0; -sind(b) 0 cosd(b)]; end
function M = Rz(c), M = [cosd(c) -sind(c) 0; sind(c) cosd(c) 0; 0 0 1]; end

function v = Idir(R, I, d)
% intensity of the turned luminaire in the room direction d
dl = R.' * d(:);
g = atan2d(norm(dl(1:2)), -dl(3));
Cd = 0;
if norm(dl(1:2)) > 0, Cd = mod(atan2d(dl(2), dl(1)), 360); end
v = I(Cd, g);
end

function Phi = hemiFlux(R, t, Cf, If, nT, nP)
% integral of I over the lower hemisphere of the room (theta from the downward vertical), Gauss
% 3 x 3 on every cell of an nT x nP grid; vectorised over a ring of cells at a time
gx = [0.5 - sqrt(15) / 10, 0.5, 0.5 + sqrt(15) / 10]; gw = [5 8 5] / 18;
dT = pi / 2 / nT; dP = 2 * pi / nP;
ph = reshape((0:nP-1) + gx.', 1, []) * dP;          % all phi nodes, 3 nP
wp = repmat(gw.', nP, 1).';                          % their weights
wp = reshape(wp, 1, []);
cp = cos(ph); sp = sin(ph);
Phi = 0;
for i = 0:nT-1
  for a = 1:3
    th = (i + gx(a)) * dT; st = sin(th); ct = cos(th);
    D = R.' * [st * cp; st * sp; -ct * ones(size(cp))]; % directions in the luminaire frame
    g = atan2d(hypot(D(1, :), D(2, :)), -D(3, :));
    C = mod(atan2d(D(2, :), D(1, :)), 360);
    Phi = Phi + gw(a) * st * (wp * intensityV(t, Cf, If, C, g).');
  end
end
Phi = Phi * dT * dP;
end

function I = intensityV(t, Cf, If, C, g)
% the bilinear interpolant of intensity() for vectors of angles, deg
if numel(Cf) == 1
  I = interp1(t.G, If, g, 'linear', 0);
else
  I = interp2(Cf, t.G, If, C, g, 'linear', 0);
end
I(g < t.G(1) | g > t.G(end)) = 0;
end

function E = Epoint(x, n, s, R, I)
d = x(:) - s(:); r = norm(d);
cx = -dot(n(:), d) / r;
if ~(r > 0) || ~(cx > 0), E = 0; return; end
E = Idir(R, I, d) * cx / r^2;
end

function F = face(f, L, W, H)
ns = {[0 0 1], [0 0 -1], [0 1 0], [0 -1 0], [1 0 0], [-1 0 0]};
us = {[1 0 0], [1 0 0], [1 0 0], [1 0 0], [0 1 0], [0 1 0]};
vs = {[0 1 0], [0 1 0], [0 0 1], [0 0 1], [0 0 1], [0 0 1]};
os = {[0 0 0], [0 0 H], [0 0 0], [0 W 0], [0 0 0], [L 0 0]};
su = [L L L L W W]; sv = [W W H H H H];
F = struct('n', ns{f}, 'u', us{f}, 'v', vs{f}, 'o', os{f}, 'su', su(f), 'sv', sv(f));
end

function [n, lo, hi] = elements(L, W, H, h)
% Elements in the global order of js/geometry.js (as in stage4_reference.m)
nd = @(s) max(1, ceil(s / h - 1e-9));
nL = nd(L); nW = nd(W); nH = nd(H);
nu = [nL nL nL nL nW nW]; nv = [nW nW nH nH nH nH];
n = []; lo = []; hi = [];
for f = 1:6
  F = face(f, L, W, H);
  du = F.su / nu(f); dv = F.sv / nv(f);
  for j = 0:nv(f) - 1
    for i = 0:nu(f) - 1
      p = F.o + i * du * F.u + j * dv * F.v;
      n(end+1, :) = F.n; %#ok<AGROW>
      lo(end+1, :) = p; %#ok<AGROW>
      hi(end+1, :) = p + du * F.u + dv * F.v; %#ok<AGROW>
    end
  end
end
end

function [p0, a, b] = edges(lo, hi, n)
ax = setdiff(1:3, find(n));
p0 = lo; a = zeros(1, 3); b = zeros(1, 3);
a(ax(1)) = hi(ax(1)) - lo(ax(1));
b(ax(2)) = hi(ax(2)) - lo(ax(2));
end

% --- photometric files: as in stage5_reference.m --------------------------------------------------

function I = intensity(t, Cf, If, C, g)
  if g < t.G(1) || g > t.G(end), I = 0; return; end
  if numel(Cf) == 1
    I = interp1(t.G, If, g, 'linear');
  else
    I = interp2(Cf, t.G, If, C, g, 'linear');
  end
end

function [Cf, If] = full_circle(t)
  C = t.C; I = t.I;
  switch t.sym
    case 'rot'
      Cf = 0; If = I(:, 1); return;
    case 'quad'
      Cf = [C, 180 - fliplr(C(1:end-1)), 180 + C(2:end), 360 - fliplr(C(1:end-1))];
      If = [I, fliplr(I(:, 1:end-1)), I(:, 2:end), fliplr(I(:, 1:end-1))];
    case 'half0'
      Cf = [C, 360 - fliplr(C(1:end-1))];
      If = [I, fliplr(I(:, 1:end-1))];
    case 'half90'
      lo = 180 - fliplr(C(C > 90 & C <= 180));
      hi = 540 - fliplr(C(C >= 180 & C < 270));
      Ilo = fliplr(I(:, C > 90 & C <= 180));
      Ihi = fliplr(I(:, C >= 180 & C < 270));
      Cf = [lo, C, hi]; If = [Ilo, I, Ihi];
    otherwise
      Cf = C; If = I;
      if Cf(1) > 0, Cf = [Cf(end) - 360, Cf]; If = [If(:, end), If]; end
      if Cf(end) < 360, Cf = [Cf, Cf(2 - (C(1) > 0)) + 360]; If = [If, If(:, 2 - (C(1) > 0))]; end
  end
  [Cf, ia] = unique(round(Cf, 9)); If = If(:, ia);
end

function t = read_ies(txt)
  L = regexp(txt, '\r\n|\n|\r', 'split');
  k = find(startsWith(strtrim(upper(L)), 'TILT'), 1);
  v = str2double(regexp(strtrim(strjoin(L(k+1:end), ' ')), '[\s,]+', 'split'));
  nV = v(4); nH = v(5); mult = v(3) * v(11) * v(12);
  q = 14;
  t.G = v(q:q+nV-1); q = q + nV;
  t.C = v(q:q+nH-1); q = q + nH;
  t.I = reshape(v(q:q+nV*nH-1), nV, nH) * mult;
  h0 = t.C(1); h1 = t.C(end);
  if nH == 1, t.sym = 'rot';
  elseif h0 == 0 && h1 == 90, t.sym = 'quad';
  elseif h0 == 0 && h1 == 180, t.sym = 'half0';
  elseif h0 == 90 && h1 == 270, t.sym = 'half90';
  else, t.sym = 'none';
  end
end

function t = read_ldt(txt)
  L = regexp(txt, '\r\n|\n|\r', 'split');
  num = @(i) str2double(strrep(strtrim(L{i}), ',', '.'));
  isym = num(3); Mc = num(4); Ng = num(6);
  n = num(26);
  flux = num(26 + 2 + 1);
  s = 26 + 6 * n + 10 + 1;
  v = str2double(strrep(regexp(strtrim(strjoin(L(s:end), ' ')), '\s+', 'split'), ',', '.'));
  Cd = v(1:Mc); G = v(Mc+1:Mc+Ng); d = v(Mc+Ng+1:end);
  if Mc == 1, isym = 1; end
  switch isym
    case 0, idx = 1:Mc;
    case 1, idx = 1;
    case 2, idx = 1:Mc/2+1;
    case 3, idx = mod((3*Mc/4) + (0:Mc/2), Mc) + 1;
    case 4, idx = 1:Mc/4+1;
  end
  cf = num(24); if ~(cf > 0), cf = 1; end
  I = reshape(d(1:numel(idx)*Ng), Ng, numel(idx)) * flux / 1000 * cf;
  C = Cd(idx);
  syms = {'none', 'rot', 'half0', 'half90', 'quad'};
  t.sym = syms{isym + 1};
  if isym == 3
    C = mod(180 - C, 360); [C, o] = sort(C); I = I(:, o);
  end
  if isym == 1, C = 0; end
  t.C = C; t.G = G; t.I = I;
end
