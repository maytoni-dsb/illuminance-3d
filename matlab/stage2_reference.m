%STAGE2_REFERENCE Reference values of the point-to-rectangle form factor (stage 2).
%   Run in MATLAB R2025b from any folder:  run('<repo>/matlab/stage2_reference.m')
%   Writes stage2_reference.txt next to this script. Send that file to the chat;
%   it goes to tests/fixtures/ and tests/formfactor.test.mjs compares JS with it (|dF| <= 1e-9).
%
%   Every row holds the full input, so JS recomputes exactly the same cases:
%     id  x(3)  n(3)  p0(3)  a(3)  b(3)  nA(3)  F        (20 columns, %.17g)
%   nA = 0 0 0 means "no emitter-side check".
%
%   Also prints two independent checks: closed forms (Howell B-3, C-11) and
%   numerical integration with integral2 of cos(t1)cos(t2)/(pi r^2).
%
%   At the end runs stage2_rect_reference.m (rectangle-to-rectangle factors),
%   which writes stage2_rect_reference.txt. Send both .txt files.

here = fileparts(mfilename('fullpath'));
rows = zeros(0, 20);
addcase = @(rows, x, n, p0, a, b, nA) [rows; size(rows, 1) + 1, x(:).', n(:).', p0(:).', a(:).', b(:).', nA(:).', ff_point_rect(x, n, p0, a, b, nA)];

%% 1. Whole faces of the default room 6 x 4 x 3 m (spec, "Система координат и грани")
L = 6; W = 4; H = 3;
faces = struct( ...
    'n',  {[0 0 1],  [0 0 -1], [0 1 0],  [0 -1 0], [1 0 0],  [-1 0 0]}, ...
    'u',  {[1 0 0],  [1 0 0],  [1 0 0],  [1 0 0],  [0 1 0],  [0 1 0]}, ...
    'v',  {[0 1 0],  [0 1 0],  [0 0 1],  [0 0 1],  [0 0 1],  [0 0 1]}, ...
    'o',  {[0 0 0],  [0 0 H],  [0 0 0],  [0 W 0],  [0 0 0],  [L 0 0]}, ...
    'su', {L, L, L, L, W, W}, ...
    'sv', {W, W, H, H, H, H});

up = [0 0 1];
points = { ...
    [L/2 W/2 0],     up;            % floor centre
    [0.05 W/2 0],    up;            % floor, near wall x = 0
    [0.05 0.05 0],   up;            % floor corner
    [L/2 W/2 0.8],   up;            % work plane 0.8, centre (walls are clipped)
    [0.1 0.1 0.8],   up;            % work plane 0.8, corner
    [2.2 1.7 H],     [0 0 -1];      % ceiling point
    [L/2 0 1.5],     [0 1 0];       % wall y = 0, centre
    [1.1 2.3 1.2],   [0.6 0.48 0.64] };  % interior point, oblique normal
for p = 1:size(points, 1)
    for f = 1:6
        F = faces(f);
        rows = addcase(rows, points{p, 1}, points{p, 2}, F.o, F.su * F.u, F.sv * F.v, F.n);
    end
end

%% 2. Elements of the default room at the automatic step (spec, "Разбиение граней")
S = 2 * (L*W + L*H + W*H);
h = min(1, max(0.1, sqrt(S / 4000)));
nd = @(s) max(1, ceil(s / h - 1e-9));
for p = 1:5
    x = points{p, 1}; n = points{p, 2};
    for f = 1:6
        F = faces(f);
        nu = nd(F.su); nv = nd(F.sv); du = F.su / nu; dv = F.sv / nv;
        for ij = [0 0; nu-1 0; 0 nv-1; nu-1 nv-1; floor(nu/2) floor(nv/2); 1 floor(nv/3)].'
            p0 = F.o + ij(1) * du * F.u + ij(2) * dv * F.v;
            rows = addcase(rows, x, n, p0, du * F.u, dv * F.v, F.n);
        end
    end
end

%% 3. Random rectangles, points and normals (many cases cross the receiver's horizon)
rng(20261103, 'twister');
for t = 1:300
    [Qm, ~] = qr(randn(3));                       % random orthonormal frame
    a = (0.05 + 3 * rand) * Qm(:, 1);
    b = (0.05 + 3 * rand) * Qm(:, 2);
    p0 = 4 * rand(3, 1) - 2;
    x = 4 * rand(3, 1) - 2;
    n = randn(3, 1); n = n / norm(n);
    switch mod(t, 3)
        case 0, nA = [0 0 0];                     % no emitter-side check
        case 1, nA = Qm(:, 3);
        case 2, nA = -Qm(:, 3);
    end
    rows = addcase(rows, x, n, p0, a, b, nA);
end

%% Write the file
out = fullfile(here, 'stage2_reference.txt');
fid = fopen(out, 'w');
fprintf(fid, '%% stage2_reference: id x(3) n(3) p0(3) a(3) b(3) nA(3) F; MATLAB %s, %s\n', version, char(datetime('now', 'Format', 'yyyy-MM-dd HH:mm')));
fprintf(fid, [repmat('%.17g ', 1, 19) '%.17g\n'], rows.');
fclose(fid);
fprintf('Wrote %d cases to %s\n', size(rows, 1), out);

%% Independent checks (printed only)
% Closed form: point on the normal through a corner of a parallel rectangle (Howell B-3)
cp = @(a, b, c) 1/(2*pi) * (a/c/sqrt(1+(a/c)^2) * atan(b/c/sqrt(1+(a/c)^2)) + b/c/sqrt(1+(b/c)^2) * atan(a/c/sqrt(1+(b/c)^2)));
e1 = 0;
for abc = [1 1 1; 2 3 1; 0.1 5 2; 10 10 0.3].'
    Fc = ff_point_rect([0 0 0], up, [0 0 abc(3)], [abc(1) 0 0], [0 abc(2) 0], [0 0 -1]);
    e1 = max(e1, abs(Fc - cp(abc(1), abc(2), abc(3))));
end
fprintf('Howell B-3 (corner, parallel): max |dF| = %.3g\n', e1);

% Sum over the faces of the room = 1
e2 = 0;
for p = 1:size(points, 1)
    s = 0;
    for f = 1:6
        F = faces(f);
        s = s + ff_point_rect(points{p, 1}, points{p, 2}, F.o, F.su * F.u, F.sv * F.v, F.n);
    end
    e2 = max(e2, abs(s - 1));
end
fprintf('Sum over room faces: max |sum F - 1| = %.3g\n', e2);

% Coaxial squares, area to area (Howell C-11) by integral2 of the point factor
c11 = @(X, Y) 2/(pi*X*Y) * (log(sqrt((1+X^2)*(1+Y^2)/(1+X^2+Y^2))) + X*sqrt(1+Y^2)*atan(X/sqrt(1+Y^2)) + Y*sqrt(1+X^2)*atan(Y/sqrt(1+X^2)) - X*atan(X) - Y*atan(Y));
for s = [0.5 1 2 5]
    fpt = @(u, v) arrayfun(@(uu, vv) ff_point_rect([uu vv 0], up, [0 0 1], [s 0 0], [0 s 0], [0 0 -1]), u, v);
    Fq = integral2(fpt, 0, s, 0, s, 'AbsTol', 1e-13, 'RelTol', 1e-11) / s^2;
    fprintf('Coaxial squares s/c = %g: closed form %.10f, integral2 %.10f, |dF| = %.3g\n', s, c11(s, s), Fq, abs(Fq - c11(s, s)));
end

% Random cases against direct integration of cos(t1) cos(t2) / (pi r^2) over the rectangle
e3 = 0; k = 0;
for r = find(rows(:, 1) > size(rows, 1) - 300).'
    v = rows(r, :);
    x = v(2:4).'; n = v(5:7).'; p0 = v(8:10).'; a = v(11:13).'; b = v(14:16).'; nA = v(17:19).';
    if v(20) == 0, continue, end
    if ~any(nA), nA = cross(a, b); if dot(nA, x - p0) < 0, nA = -nA; end, end
    nA = nA / norm(nA);
    A = norm(cross(a, b));
    g = @(s, t) kern(s, t, x, n, p0, a, b, nA) * A;
    Fi = integral2(g, 0, 1, 0, 1, 'AbsTol', 1e-12, 'RelTol', 1e-9, 'Method', 'iterated');
    e3 = max(e3, abs(Fi - v(20)) / max(v(20), 1e-3));
    k = k + 1;
end
fprintf('Random cases vs integral2 (%d with F > 0): max relative |dF| = %.3g\n', k, e3);

%% Rectangle-to-rectangle reference (element kernel)
fprintf('\n');
run(fullfile(here, 'stage2_rect_reference.m'));

function y = kern(s, t, x, n, p0, a, b, nA)
% cos(t1) cos(t2) / (pi r^2), zero where the point or the emitter is facing away
y = zeros(size(s));
for i = 1:numel(s)
    r = p0 + s(i) * a + t(i) * b - x;
    d2 = dot(r, r);
    c1 = max(dot(n, r), 0);
    c2 = max(-dot(nA, r), 0);
    y(i) = c1 * c2 / (pi * d2 * d2);
end
end
