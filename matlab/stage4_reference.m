%STAGE4_REFERENCE Reference values of the radiosity solution (stage 4).
%   Run in MATLAB R2025b from any folder:  run('<repo>/matlab/stage4_reference.m')
%   Writes stage4_reference.txt next to this script; send it to the chat. It goes to tests/fixtures/,
%   and tests/radiosity.test.mjs compares JS with it (tolerance 1e-9).
%
%   Independent of the JS route: the full N x N form-factor matrix is assembled pair by pair with
%   rect_to_rect.m (no kernel tables, no symmetry) and the system is solved directly,
%       (I - F*R) * Eind = F*R*Edir,   R = diag(rho),
%   instead of Gauss-Seidel iterations. Edir is the exact element average for cosine lobes,
%   sum_lobes flux_l * F(source, axis_l -> element) / A (ff_point_rect.m; checked against integral2
%   at stage 3).
%
%   Every row is one element:
%     case L W H h rho(6) nx ny flux fUp hc g Edir Eind          (19 columns, %.17g)
%   rho is per face 0..5 (floor, ceiling, y = 0, y = W, x = 0, x = L); fUp = 0 is the cosine model;
%   g is the global element index from 0 (faces 0..5, inside a face k = i + j*nu).
%   Also prints: max |sum_j F_ij - 1|, reciprocity, energy balance, solve time.

here = fileparts(mfilename('fullpath'));
addpath(here);

% L W H h  rho0..rho5  nx ny flux fUp hc
cases = [ ...
    3 2 2.5 0.5   0.2 0.7 0.5 0.5 0.5 0.5   2 1 4000  0   0  ;
    4 3 2.8 0.4   0.3 0.8 0.6 0.6 0.4 0.4   2 2 3000  0.3 0.5;
    5 5 3   0.5   0.9 0.9 0.9 0.9 0.9 0.9   3 3 2500  0.5 1.0;
    6 2 4   0.5   0.1 0.85 0.0 0.7 0.5 0.3  3 1 5000  0.2 0.8];

rows = zeros(0, 19);
for c = 1:size(cases, 1)
    p = cases(c, :);
    L = p(1); W = p(2); H = p(3); h = p(4); rho = p(5:10);
    nx = p(11); ny = p(12); flux = p(13); fUp = p(14); hc = p(15);

    [n, lo, hi, A, face] = elements(L, W, H, h);
    N = size(lo, 1);

    tic
    F = zeros(N);
    for i = 1:N
        for j = 1:N
            if face(i) ~= face(j)
                F(i, j) = rect_to_rect(n(i, :), lo(i, :), hi(i, :), n(j, :), lo(j, :), hi(j, :));
            end
        end
    end
    tF = toc;

    % luminaires: x_i = (i + 0.5) L / nx, y_j = (j + 0.5) W / ny, z = H - hc
    [xs, ys] = ndgrid(((0:nx-1) + 0.5) * L / nx, ((0:ny-1) + 0.5) * W / ny);
    S = [xs(:), ys(:), repmat(H - hc, nx * ny, 1)];
    Edir = zeros(N, 1);
    for e = 1:N
        [p0, a, b] = edges(lo(e, :), hi(e, :), n(e, :));
        for s = 1:size(S, 1)
            Edir(e) = Edir(e) + (flux * (1 - fUp) * ff_point_rect(S(s, :), [0 0 -1], p0, a, b, n(e, :)) ...
                               + flux * fUp * ff_point_rect(S(s, :), [0 0 1], p0, a, b, n(e, :))) / A(e);
        end
    end

    R = diag(rho(face + 1));
    tic
    Eind = (eye(N) - F * R) \ (F * R * Edir);
    tS = toc;

    rs = max(abs(sum(F, 2) - 1));
    AF = A .* F;
    rec = max(abs(AF - AF.'), [], 'all') / max(AF, [], 'all');
    absorbed = sum((1 - rho(face + 1).') .* (Edir + Eind) .* A);
    fprintf('case %d: N = %d, max|sum F - 1| = %.2g, reciprocity %.2g, balance %.2g, F %.1f s, solve %.3f s\n', ...
        c, N, rs, rec, absorbed / (size(S, 1) * flux) - 1, tF, tS);

    g = (0:N-1).';
    rows = [rows; repmat([c, L, W, H, h, rho, nx, ny, flux, fUp, hc], N, 1), g, Edir, Eind]; %#ok<AGROW>
end

stamp = sprintf('MATLAB %s, %s', version, char(datetime('now', 'Format', 'yyyy-MM-dd HH:mm')));
out = fullfile(here, 'stage4_reference.txt');
fid = fopen(out, 'w');
fprintf(fid, '%% stage4_reference: case L W H h rho(6) nx ny flux fUp hc g Edir Eind; %s\n', stamp);
fprintf(fid, [repmat('%.17g ', 1, 18) '%.17g\n'], rows.');
fclose(fid);
fprintf('Wrote %d rows to %s\n', size(rows, 1), out);

%% ---------------------------------------------------------------------------------------------
function [n, lo, hi, A, face] = elements(L, W, H, h)
% Elements in the global order of js/geometry.js: faces 0..5, inside a face i fastest (k = i + j*nu).
nd = @(s) max(1, ceil(s / h - 1e-9));
nL = nd(L); nW = nd(W); nH = nd(H);
F = struct( ...
    'n',  {[0 0 1],  [0 0 -1], [0 1 0],  [0 -1 0], [1 0 0],  [-1 0 0]}, ...
    'u',  {[1 0 0],  [1 0 0],  [1 0 0],  [1 0 0],  [0 1 0],  [0 1 0]}, ...
    'v',  {[0 1 0],  [0 1 0],  [0 0 1],  [0 0 1],  [0 0 1],  [0 0 1]}, ...
    'o',  {[0 0 0],  [0 0 H],  [0 0 0],  [0 W 0],  [0 0 0],  [L 0 0]}, ...
    'su', {L, L, L, L, W, W}, 'sv', {W, W, H, H, H, H}, ...
    'nu', {nL, nL, nL, nL, nW, nW}, 'nv', {nW, nW, nH, nH, nH, nH});
n = []; lo = []; hi = []; A = []; face = [];
for f = 1:6
    du = F(f).su / F(f).nu; dv = F(f).sv / F(f).nv;
    for j = 0:F(f).nv - 1
        for i = 0:F(f).nu - 1
            p = F(f).o + i * du * F(f).u + j * dv * F(f).v;
            n(end+1, :) = F(f).n; %#ok<AGROW>
            lo(end+1, :) = p; %#ok<AGROW>
            hi(end+1, :) = p + du * F(f).u + dv * F(f).v; %#ok<AGROW>
            A(end+1, 1) = du * dv; %#ok<AGROW>
            face(end+1, 1) = f - 1; %#ok<AGROW>
        end
    end
end
end

function [p0, a, b] = edges(lo, hi, n)
% Corner and edge vectors of an axis-aligned rectangle
ax = setdiff(1:3, find(n));
p0 = lo; a = zeros(1, 3); b = zeros(1, 3);
a(ax(1)) = hi(ax(1)) - lo(ax(1));
b(ax(2)) = hi(ax(2)) - lo(ax(2));
end
