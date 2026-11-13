%STAGE3_REFERENCE Reference values of the direct illuminance (stage 3).
%   Run in MATLAB R2025b from any folder:  run('<repo>/matlab/stage3_reference.m')
%   Writes two files next to this script; send both to the chat. They go to tests/fixtures/,
%   and tests/direct.test.mjs compares JS with them.
%
%   stage3_point_reference.txt — direct illuminance at a point from ONE luminaire:
%     id  x(3)  n(3)  s(3)  flux  fUp  psi  E                       (14 columns, %.17g)
%   stage3_element_reference.txt — element-average direct illuminance from ONE luminaire,
%   computed with integral2 of the point formula (independent of the form-factor route in JS):
%     id  s(3)  flux  fUp  p0(3)  a(3)  b(3)  nA(3)  E              (19 columns, %.17g)
%
%   Photometry (spec, "Luminaires"): fUp = 0 is the cosine model, fUp > 0 the direct-indirect one:
%     I(gamma) = flux*(1-fUp)/pi*cos(gamma) for gamma < 90 deg, flux*fUp/pi*|cos(gamma)| above;
%   gamma is measured from -Z. Both models are rotationally symmetric, so psi (rad) must not
%   change E; it is stored so that JS recomputes exactly the same cases.
%
%   Point formula (spec, "Calculation method", item 1):  E = I(C, gamma) * cos(xi) / d^2, 0 if cos(xi) <= 0.
%   Also prints the largest difference between integral2 and the exact form-factor route
%   E = sum_lobes flux_l * F(source, axis_l -> element) / A (ff_point_rect.m, stage 2).

here = fileparts(mfilename('fullpath'));
addpath(here);

%% Room 6 x 4 x 3 m, faces as in the spec ("Coordinate system and faces"), automatic step
L = 6; W = 4; H = 3;
faces = struct( ...
    'n',  {[0 0 1],  [0 0 -1], [0 1 0],  [0 -1 0], [1 0 0],  [-1 0 0]}, ...
    'u',  {[1 0 0],  [1 0 0],  [1 0 0],  [1 0 0],  [0 1 0],  [0 1 0]}, ...
    'v',  {[0 1 0],  [0 1 0],  [0 0 1],  [0 0 1],  [0 0 1],  [0 0 1]}, ...
    'o',  {[0 0 0],  [0 0 H],  [0 0 0],  [0 W 0],  [0 0 0],  [L 0 0]}, ...
    'su', {L, L, L, L, W, W}, ...
    'sv', {W, W, H, H, H, H});
S = 2 * (L*W + L*H + W*H);
h = min(1, max(0.1, sqrt(S / 4000)));
nd = @(s) max(1, ceil(s / h - 1e-9));

% Luminaire configurations: suspension hc, upward fraction fUp, rotation psi, flux
configs = [ ...
    0    0    0         4000;    % recessed, cosine
    0.5  0.3  pi/6      4000;    % pendant, direct-indirect
    1.2  1    2.1       2500;    % pendant, all flux upwards
    2.1  0.5  0         12000];  % lowest pendant allowed (H - 0.9), half up
nx = 3; ny = 2;
lumsOf = @(hc) [reshape(repmat(((0:nx-1) + 0.5) * L / nx, 1, ny), [], 1), ...
                reshape(repmat(((0:ny-1) + 0.5) * W / ny, nx, 1), [], 1), ...
                repmat(H - hc, nx * ny, 1)];

%% 1. Points: a 5 x 5 pattern on every face, the work plane at 0.8 m and an oblique receiver
fr = [0.02 0.3 0.5 0.77 0.98];
prow = zeros(0, 14);
for c = 1:size(configs, 1)
    hc = configs(c, 1); fUp = configs(c, 2); psi = configs(c, 3); flux = configs(c, 4);
    S3 = lumsOf(hc);
    for si = [1 5]                                   % a corner and a middle luminaire
        s = S3(si, :);
        for f = 1:6
            F = faces(f);
            for a = fr, for b = fr
                x = F.o + a * F.su * F.u + b * F.sv * F.v;
                prow(end+1, :) = [size(prow, 1) + 1, x, F.n, s, flux, fUp, psi, Epoint(x, F.n, s, flux, fUp)]; %#ok<AGROW>
            end, end
        end
        for x = [s(1) s(2) 0; s(1) s(2) 0.8; 0.1 0.1 0.8; L-0.1 W/2 0.8; s(1) s(2) H; s(1)+0.3 s(2) H].'
            n = [0 0 1]; if x(3) == H, n = [0 0 -1]; end
            prow(end+1, :) = [size(prow, 1) + 1, x.', n, s, flux, fUp, psi, Epoint(x.', n, s, flux, fUp)]; %#ok<AGROW>
        end
        n = [0.6 0.48 0.64];
        x = [1.1 2.3 1.2];
        prow(end+1, :) = [size(prow, 1) + 1, x, n, s, flux, fUp, psi, Epoint(x, n, s, flux, fUp)]; %#ok<AGROW>
    end
end

%% 2. Elements at the automatic step: corners, middle, rows near the source plane, under the source
erow = zeros(0, 19);
dmax = 0;
for c = 1:size(configs, 1)
    hc = configs(c, 1); fUp = configs(c, 2); flux = configs(c, 4);
    S3 = lumsOf(hc);
    for si = [1 5]
        s = S3(si, :);
        for f = 1:6
            F = faces(f);
            nu = nd(F.su); nv = nd(F.sv); du = F.su / nu; dv = F.sv / nv;
            ij = [0 0; nu-1 0; 0 nv-1; nu-1 nv-1; floor(nu/2) floor(nv/2); 1 floor(nv/3)];
            if f <= 2                                   % floor / ceiling: the element below / above the source
                ij(end+1, :) = [floor(s(1) / du) floor(s(2) / dv)]; %#ok<AGROW>
            else                                        % walls: the rows around the source plane z = H - hc
                jz = min(nv - 1, floor((H - hc) / dv));
                ij(end+1:end+3, :) = [floor(nu/2) jz; floor(nu/2) max(jz-1, 0); 2 jz]; %#ok<AGROW>
            end
            for k = 1:size(ij, 1)
                p0 = F.o + ij(k, 1) * du * F.u + ij(k, 2) * dv * F.v;
                a = du * F.u; b = dv * F.v;
                E = Eelement(s, flux, fUp, p0, a, b, F.n, H - hc);
                Ef = Eformfactor(s, flux, fUp, p0, a, b, F.n);
                dmax = max(dmax, abs(E - Ef) / max(E, 1e-3));
                erow(end+1, :) = [size(erow, 1) + 1, s, flux, fUp, p0, a, b, F.n, E]; %#ok<AGROW>
            end
        end
    end
end

%% Write the files
stamp = sprintf('MATLAB %s, %s', version, char(datetime('now', 'Format', 'yyyy-MM-dd HH:mm')));
out1 = fullfile(here, 'stage3_point_reference.txt');
fid = fopen(out1, 'w');
fprintf(fid, '%% stage3_point_reference: id x(3) n(3) s(3) flux fUp psi E; %s\n', stamp);
fprintf(fid, [repmat('%.17g ', 1, 13) '%.17g\n'], prow.');
fclose(fid);
fprintf('Wrote %d point cases to %s\n', size(prow, 1), out1);

out2 = fullfile(here, 'stage3_element_reference.txt');
fid = fopen(out2, 'w');
fprintf(fid, '%% stage3_element_reference: id s(3) flux fUp p0(3) a(3) b(3) nA(3) E; %s\n', stamp);
fprintf(fid, [repmat('%.17g ', 1, 18) '%.17g\n'], erow.');
fclose(fid);
fprintf('Wrote %d element cases to %s\n', size(erow, 1), out2);

%% Independent checks (printed only)
fprintf('integral2 vs form-factor route (ff_point_rect): max relative |dE| = %.3g\n', dmax);

% Directly below a luminaire: E = I(0)/d^2
e1 = 0;
for c = 1:size(configs, 1)
    s = [L/2 W/2 H - configs(c, 1)]; flux = configs(c, 4); fUp = configs(c, 2);
    if fUp == 1, continue, end                 % no downward flux: I(0) = 0
    e1 = max(e1, abs(Epoint([s(1) s(2) 0], [0 0 1], s, flux, fUp) / (flux * (1 - fUp) / pi / s(3)^2) - 1));
end
fprintf('Below the luminaire, E = I(0)/d^2: max relative error = %.3g\n', e1);

% Flux reaching all faces equals the luminaire flux (form-factor route over whole faces)
e2 = 0;
for c = 1:size(configs, 1)
    s = lumsOf(configs(c, 1)); s = s(5, :); flux = configs(c, 4); fUp = configs(c, 2);
    tot = 0;
    for f = 1:6
        F = faces(f);
        tot = tot + F.su * F.sv * Eformfactor(s, flux, fUp, F.o, F.su * F.u, F.sv * F.v, F.n);
    end
    e2 = max(e2, abs(tot / flux - 1));
end
fprintf('Flux on all faces / luminaire flux: max |ratio - 1| = %.3g\n', e2);

%% ---------------------------------------------------------------------------------------------
function I = intensity(cosg, flux, fUp)
% Intensity, cd, for cos(gamma) (gamma from -Z): cosine (fUp = 0) or direct-indirect model
I = flux * (1 - fUp) / pi * max(cosg, 0) + flux * fUp / pi * max(-cosg, 0);
end

function E = Epoint(x, n, s, flux, fUp)
% Direct illuminance at points x (rows, k x 3) with normal n from a luminaire at s
d = x - s;                                 % luminaire -> point
r2 = sum(d.^2, 2); r = sqrt(r2);
cosxi = -(d * n(:)) ./ r;
cosg = -d(:, 3) ./ r;
E = intensity(cosg, flux, fUp) .* max(cosxi, 0) ./ r2;
E(~(r2 > 0)) = 0;
end

function E = Eelement(s, flux, fUp, p0, a, b, nA, zs)
% Element average: integral2 over the parameter square, split where the element crosses the
% source plane z = zs (the intensity has a kink there).
f = @(u, v) reshape(Epoint([p0(1) + u(:)*a(1) + v(:)*b(1), p0(2) + u(:)*a(2) + v(:)*b(2), p0(3) + u(:)*a(3) + v(:)*b(3)], nA, s, flux, fUp), size(u));
us = [0 1]; vs = [0 1];
if a(3) ~= 0, t = (zs - p0(3)) / a(3); if t > 0 && t < 1, us = [0 t 1]; end, end
if b(3) ~= 0, t = (zs - p0(3)) / b(3); if t > 0 && t < 1, vs = [0 t 1]; end, end
E = 0;
for i = 1:numel(us) - 1
    for j = 1:numel(vs) - 1
        E = E + integral2(f, us(i), us(i+1), vs(j), vs(j+1), 'Method', 'iterated', 'AbsTol', 1e-14 * flux, 'RelTol', 1e-13);
    end
end
end

function E = Eformfactor(s, flux, fUp, p0, a, b, nA)
% Exact route used in JS: a cosine lobe is a Lambertian differential emitter
A = norm(cross(a, b));
E = (flux * (1 - fUp) * ff_point_rect(s, [0 0 -1], p0, a, b, nA) + flux * fUp * ff_point_rect(s, [0 0 1], p0, a, b, nA)) / A;
end
