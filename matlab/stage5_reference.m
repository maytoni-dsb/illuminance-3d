% Stage 5 reference values: photometric files (IES LM-63, EULUMDAT).
% MATLAB R2025b. Run from this folder; the files are read from ../tests/fixtures/photometry/.
%
% Independent of the JS code: own parsers, the full circle of planes built by mirroring, MATLAB's
% interp1 / interp2 ('linear') for the bilinear interpolant, and the flux by INTEGRAL over γ with
% the tabulated angles as waypoints (the kinks of the interpolant), plane by plane; between planes
% the interpolant is linear in C, so the C integral of each interval is the trapezoid of its two
% planes exactly.
%
% Writes stage5_reference.txt, one row per value, 5 numbers in %.17g:
%   1 k 0 0 Φ        — flux of file k, lm (k from 1, in the order of FILES below)
%   2 k C γ I        — intensity of file k at C, γ (degrees), cd
% Copy the file to ../tests/fixtures/; tests/photfile.test.mjs then requires agreement within 1e-9.

FILES = { ...
  'C009CW-L12B.ies', 'C009CW-L12B.ldt', 'C065CL-02-L12W3K-B.ldt', 'C071WL-L12B3K.ldt', ...
  'DL094-GU10-W-60.ldt', 'DL124-10W-3K-TRS-W.ldt', ...
  'ERCO-32607-000.ies', 'ERCO-32607-000.ldt', 'ERCO-B0000021.ies', 'ERCO-B0000021.ldt', ...
  'ERCO-B5000065.ies', 'ERCO-B5000065.ldt', 'ERCO-C1000001.ies', 'ERCO-C1000001.ldt', ...
  'ERCO-C1000005.ies', 'ERCO-C1000005.ldt', 'O570WL-L10B3K.ies', 'O570WL-L10B3K.ldt', ...
  'TR152-1-7W3K-PT.ldt', 'TR186-1-8W4K-B.ies', 'TR186-1-8W4K-B.ldt'};

dir0 = fullfile(fileparts(mfilename('fullpath')), '..', 'tests', 'fixtures', 'photometry');
out = fopen(fullfile(fileparts(mfilename('fullpath')), 'stage5_reference.txt'), 'w');
for k = 1:numel(FILES)
  name = FILES{k};
  txt = fileread(fullfile(dir0, name));
  if endsWith(lower(name), '.ies'), t = read_ies(txt); else, t = read_ldt(txt); end
  [Cf, If] = full_circle(t);
  % flux: integral over γ of every full-circle plane, trapezoid in C (exact for linear in C)
  Gp = zeros(1, numel(Cf));
  for p = 1:numel(Cf)
    f = @(g) interp1(t.G, If(:, p), g, 'linear', 0) .* sind(g) * pi / 180;
    Gp(p) = integral(f, t.G(1), t.G(end), 'Waypoints', t.G(2:end-1), 'AbsTol', 1e-13, 'RelTol', 1e-13);
  end
  if numel(Cf) == 1
    Phi = 2 * pi * Gp;
  else
    dC = diff(Cf) * pi / 180;
    Phi = sum(dC .* (Gp(1:end-1) + Gp(2:end)) / 2);
  end
  fprintf(out, '%.17g %.17g %.17g %.17g %.17g\n', 1, k, 0, 0, Phi);
  % intensities at 200 fixed directions (also between the tabulated angles)
  for n = 1:200
    C = mod(n * 37.3, 360);
    g = mod(n * 11.7, 180);
    fprintf(out, '%.17g %.17g %.17g %.17g %.17g\n', 2, k, C, g, intensity(t, Cf, If, C, g));
  end
end
fclose(out);
disp('stage5_reference.txt written');

% ------------------------------------------------------------------------------------------------

function I = intensity(t, Cf, If, C, g)
  if g < t.G(1) || g > t.G(end), I = 0; return; end
  if numel(Cf) == 1
    I = interp1(t.G, If, g, 'linear');
  else
    I = interp2(Cf, t.G, If, C, g, 'linear');
  end
end

function [Cf, If] = full_circle(t)
  % planes over 0…360° with the stored data mirrored by the symmetry; the column of each plane
  C = t.C; I = t.I;
  switch t.sym
    case 'rot'
      Cf = 0; If = I(:, 1); return;
    case 'quad'    % stored 0…90
      Cf = [C, 180 - fliplr(C(1:end-1)), 180 + C(2:end), 360 - fliplr(C(1:end-1))];
      If = [I, fliplr(I(:, 1:end-1)), I(:, 2:end), fliplr(I(:, 1:end-1))];
    case 'half0'   % stored 0…180
      Cf = [C, 360 - fliplr(C(1:end-1))];
      If = [I, fliplr(I(:, 1:end-1))];
    case 'half90'  % stored 90…270; mirror C → 180 − C
      lo = 180 - fliplr(C(C > 90 & C <= 180));       % 0 … <90 from 180 … >90
      hi = 540 - fliplr(C(C >= 180 & C < 270));      % >270 … 360 from <270 … 180
      Ilo = fliplr(I(:, C > 90 & C <= 180));
      Ihi = fliplr(I(:, C >= 180 & C < 270));
      Cf = [lo, C, hi]; If = [Ilo, I, Ihi];
    otherwise      % none: close the circle periodically
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
  flux = num(26 + 2 * n + 1);                 % 26c of set 1
  s = 26 + 6 * n + 10 + 1;                    % first line after the direct ratios
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
  I = reshape(d(1:numel(idx)*Ng), Ng, numel(idx)) * flux / 1000;
  C = Cd(idx);
  syms = {'none', 'rot', 'half0', 'half90', 'quad'};
  t.sym = syms{isym + 1};
  if isym == 3   % C270…C90 → mirrored across C90–C270 into 90…270, ascending
    C = mod(180 - C, 360); [C, o] = sort(C); I = I(:, o);
  end
  if isym == 1, C = 0; end
  t.C = C; t.G = G; t.I = I;
end
