%STAGE2_RECT_REFERENCE Reference values of the rectangle-to-rectangle form factor (stage 2).
%   Called at the end of stage2_reference.m; can also be run on its own:
%     run('<repo>/matlab/stage2_rect_reference.m')
%   Writes stage2_rect_reference.txt next to this script. Send that file to the chat;
%   it goes to tests/fixtures/ and tests/formfactor.test.mjs compares JS with it (|dF| <= 1e-9).
%
%   Every row holds the full input:
%     id  n1(3)  lo1(3)  hi1(3)  n2(3)  lo2(3)  hi2(3)  F12      (20 columns, %.17g)
%
%   If Symbolic Math Toolbox is available, Sparrow's closed form is also evaluated
%   with 50 significant digits (vpa) and the double-precision errors of both
%   branches (closed form, Gauss 5 x 5) are printed by centre distance.

here = fileparts(mfilename('fullpath'));
R = zeros(0, 20);
add = @(R, n1, lo1, hi1, n2, lo2, hi2) [R; size(R, 1) + 1, n1(:).', lo1(:).', hi1(:).', n2(:).', lo2(:).', hi2(:).', rect_to_rect(n1, lo1, hi1, n2, lo2, hi2)];

%% Room faces (spec, "Система координат и грани")
room = @(L, W, H) struct( ...
    'n',  {[0 0 1],  [0 0 -1], [0 1 0],  [0 -1 0], [1 0 0],  [-1 0 0]}, ...
    'u',  {[1 0 0],  [1 0 0],  [1 0 0],  [1 0 0],  [0 1 0],  [0 1 0]}, ...
    'v',  {[0 1 0],  [0 1 0],  [0 0 1],  [0 0 1],  [0 0 1],  [0 0 1]}, ...
    'o',  {[0 0 0],  [0 0 H],  [0 0 0],  [0 W 0],  [0 0 0],  [L 0 0]}, ...
    'su', {L, L, L, L, W, W}, ...
    'sv', {W, W, H, H, H, H});

%% 1. Whole faces of the default room 6 x 4 x 3 m: all 30 ordered pairs
L = 6; W = 4; H = 3;
fc = room(L, W, H);
for f1 = 1:6
    for f2 = 1:6
        if f1 == f2, continue, end
        A = fc(f1); B = fc(f2);
        R = add(R, A.n, A.o, A.o + A.su * A.u + A.sv * A.v, B.n, B.o, B.o + B.su * B.u + B.sv * B.v);
    end
end

%% 2. Elements of the default room at the automatic step: near edges and corners, mid and far
S = 2 * (L*W + L*H + W*H);
h = min(1, max(0.1, sqrt(S / 4000)));
nd = @(s) max(1, ceil(s / h - 1e-9));
elem = @(F, i, j) F.o + i * (F.su / nd(F.su)) * F.u + j * (F.sv / nd(F.sv)) * F.v;
for src = [1 0 0; 1 1 1; 3 0 0; 3 2 5; 5 0 0; 2 7 3; 6 4 9].'
    A = fc(src(1));
    loA = elem(A, src(2), src(3));
    hiA = loA + (A.su / nd(A.su)) * A.u + (A.sv / nd(A.sv)) * A.v;
    for f2 = 1:6
        if f2 == src(1), continue, end
        B = fc(f2); nu = nd(B.su); nv = nd(B.sv);
        for ij = [0 0; 1 0; 0 1; 2 3; nu-1 nv-1; floor(nu/2) floor(nv/2)].'
            loB = elem(B, ij(1), ij(2));
            hiB = loB + (B.su / nu) * B.u + (B.sv / nv) * B.v;
            R = add(R, A.n, loA, hiA, B.n, loB, hiB);
        end
    end
end

%% 3. Random sub-rectangles on the faces of the default room
rng(20261103, 'twister');
for t = 1:200
    f = randperm(6, 2);
    lohi = cell(2, 2);
    for q = 1:2
        F = fc(f(q));
        su = 0.05 + (F.su - 0.05) * rand^2; sv = 0.05 + (F.sv - 0.05) * rand^2;
        u0 = (F.su - su) * rand; v0 = (F.sv - sv) * rand;
        lohi{q, 1} = F.o + u0 * F.u + v0 * F.v;
        lohi{q, 2} = lohi{q, 1} + su * F.u + sv * F.v;
    end
    R = add(R, fc(f(1)).n, lohi{1, 1}, lohi{1, 2}, fc(f(2)).n, lohi{2, 1}, lohi{2, 2});
end

%% 4. Elements of a large room 50 x 50 x 20 m (step 1 m), near and far
fb = room(50, 50, 20);
for t = 1:60
    f = randperm(6, 2);
    lohi = cell(2, 2);
    for q = 1:2
        F = fb(f(q));
        i = randi(F.su) - 1; j = randi(F.sv) - 1;
        if t <= 20, i = min(i, 2); j = min(j, 2); end   % corner region: near pairs
        lohi{q, 1} = F.o + i * F.u + j * F.v;
        lohi{q, 2} = lohi{q, 1} + F.u + F.v;
    end
    R = add(R, fb(f(1)).n, lohi{1, 1}, lohi{1, 2}, fb(f(2)).n, lohi{2, 1}, lohi{2, 2});
end

%% Write the file
out = fullfile(here, 'stage2_rect_reference.txt');
fid = fopen(out, 'w');
fprintf(fid, '%% stage2_rect_reference: id n1(3) lo1(3) hi1(3) n2(3) lo2(3) hi2(3) F12; MATLAB %s, %s\n', version, char(datetime('now', 'Format', 'yyyy-MM-dd HH:mm')));
fprintf(fid, [repmat('%.17g ', 1, 19) '%.17g\n'], R.');
fclose(fid);
fprintf('Wrote %d cases to %s\n', size(R, 1), out);

%% Checks (printed only)
% Reciprocity A1 F12 = A2 F21 and closed forms for the cube
area = @(lo, hi) prod(nonzeros(hi - lo));
e = 0;
for r = 1:size(R, 1)
    v = R(r, :);
    F21 = rect_to_rect(v(11:13), v(14:16), v(17:19), v(2:4), v(5:7), v(8:10));
    a1 = area(v(5:7), v(8:10)); a2 = area(v(14:16), v(17:19));
    e = max(e, abs(a1 * v(20) - a2 * F21) / max(a1 * v(20), realmin));
end
fprintf('Reciprocity: max relative |A1 F12 - A2 F21| = %.3g\n', e);
fprintf('Unit cube: F(floor -> ceiling) = %.17g (Howell C-11: 0.19982489569838...)\n', rect_to_rect([0 0 1], [0 0 0], [1 1 0], [0 0 -1], [0 0 1], [1 1 1]));
fprintf('Unit cube: F(floor -> wall)    = %.17g (Howell C-14: 0.20004377607540...)\n', rect_to_rect([0 0 1], [0 0 0], [1 1 0], [0 1 0], [0 0 0], [1 0 1]));

% High-precision closed form (Symbolic Math Toolbox): errors of both branches by centre distance
if license('test', 'Symbolic_Toolbox') && ~isempty(ver('symbolic'))
    digits(50);
    bins = [0 2 3 4 5 6 8 10 15 20 30 inf];
    errE = zeros(1, numel(bins) - 1); errG = errE; cnt = errE;
    for r = 1:size(R, 1)
        v = R(r, :);
        ratio = norm((v(5:7) + v(8:10) - v(14:16) - v(17:19)) / 2) / max([v(8:10) - v(5:7), v(17:19) - v(14:16)]);
        Fv = double(sparrow_vpa(v(2:4), v(5:7), v(8:10), v(11:13), v(14:16), v(17:19)));
        if Fv == 0, continue, end
        b = find(ratio >= bins, 1, 'last');
        errE(b) = max(errE(b), abs(rect_to_rect(v(2:4), v(5:7), v(8:10), v(11:13), v(14:16), v(17:19), 'exact') / Fv - 1));
        errG(b) = max(errG(b), abs(rect_to_rect(v(2:4), v(5:7), v(8:10), v(11:13), v(14:16), v(17:19), 'gauss') / Fv - 1));
        cnt(b) = cnt(b) + 1;
    end
    fprintf('\nRelative error vs 50-digit closed form (switch to Gauss at 5 sizes):\n');
    fprintf('  distance/size   cases   closed form (double)   Gauss 5x5\n');
    for b = 1:numel(cnt)
        if cnt(b) == 0, continue, end
        fprintf('  %5g ... %-5g   %5d   %20.2g   %10.2g\n', bins(b), bins(b + 1), cnt(b), errE(b), errG(b));
    end
else
    fprintf('Symbolic Math Toolbox not found: the 50-digit check is skipped.\n');
end

function F = sparrow_vpa(n1, lo1, hi1, n2, lo2, hi2)
% Sparrow's closed form in variable precision; inputs are taken as exact binary values.
x = @(a) sym(a, 'f');
[lo1, hi1] = deal(min(lo1, hi1), max(lo1, hi1));
[lo2, hi2] = deal(min(lo2, hi2), max(lo2, hi2));
a1 = find(n1); a2 = find(n2);
if a1 == a2 && lo1(a1) == lo2(a1), F = sym(0); return, end
Hs = @(t, s) hv(t, s);
S = sym(0);
if a1 == a2
    ax = setdiff(1:3, a1);
    X = x([lo1(ax(1)) hi1(ax(1))]); Y = x([lo1(ax(2)) hi1(ax(2))]);
    P = x([lo2(ax(1)) hi2(ax(1))]); Q = x([lo2(ax(2)) hi2(ax(2))]);
    c = abs(x(lo1(a1)) - x(lo2(a1)));
    for i = 1:2, for j = 1:2, for k = 1:2, for l = 1:2
        u = X(i) - P(k); w = Y(j) - Q(l);
        S = S + (-1)^(i+j+k+l) * (Hs(u, sqrt(w^2 + c^2)) + Hs(w, sqrt(u^2 + c^2)));
    end, end, end, end
else
    k3 = 6 - a1 - a2;
    X = x([lo1(k3) hi1(k3)]); P = x([lo2(k3) hi2(k3)]);
    Y = sort(abs(x([lo1(a2) hi1(a2)]) - x(lo2(a2))));
    Z = sort(abs(x([lo2(a1) hi2(a1)]) - x(lo1(a1))));
    for i = 1:2, for j = 1:2, for k = 1:2, for l = 1:2
        S = S + (-1)^(i+j+k+l) * Hs(X(i) - P(k), sqrt(Y(j)^2 + Z(l)^2));
    end, end, end, end
end
F = vpa(S / (2 * sym(pi) * (X(2) - X(1)) * (Y(2) - Y(1))));
end

function v = hv(t, s)
v = sym(0);
q = t^2 + s^2;
if isAlways(q > 0), v = v + vpa((t^2 - s^2) / 4 * log(q)); end
if isAlways(s > 0), v = v + vpa(s * t * atan(t / s)); end
end
