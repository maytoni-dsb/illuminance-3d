function F = rect_to_rect(n1, lo1, hi1, n2, lo2, hi2, mode)
%RECT_TO_RECT Form factor F12 between two axis-aligned rectangles.
%   F = RECT_TO_RECT(n1, lo1, hi1, n2, lo2, hi2) returns the fraction of the
%   diffuse flux leaving rectangle 1 that reaches rectangle 2. Each rectangle
%   has a unit normal n along a coordinate axis and opposite corners lo, hi
%   (lo and hi coincide in the normal coordinate). The rectangles must see
%   each other fully (true for any two faces of an empty box).
%
%   Same algorithm as rectToRect in js/formfactor.js:
%   - centre distance < 5 * largest side: Sparrow's closed form
%       A1 F12 = 1/(2 pi) sum (-1)^(i+j+k+l) H(...),
%       H(t; s) = 1/4 (t^2 - s^2) ln(t^2 + s^2) + s t atan(t/s);
%   - otherwise: 5 x 5 Gauss-Legendre rule over rectangle 1 of the exact
%     point-to-rectangle factor (ff_point_rect), more accurate for far pairs.
%
%   RECT_TO_RECT(..., 'exact') always uses the closed form,
%   RECT_TO_RECT(..., 'gauss') always uses the quadrature.

if nargin < 7, mode = 'auto'; end
n1 = n1(:).'; n2 = n2(:).';
[lo1, hi1] = deal(min(lo1(:).', hi1(:).'), max(lo1(:).', hi1(:).'));
[lo2, hi2] = deal(min(lo2(:).', hi2(:).'), max(lo2(:).', hi2(:).'));
a1 = find(n1); a2 = find(n2);

% visibility: rectangle 2 in front of 1 and vice versa
d21 = n1(a1) * ([lo2(a1) hi2(a1)] - lo1(a1));
d12 = n2(a2) * ([lo1(a2) hi1(a2)] - lo2(a2));
if max(d21) <= 0 || max(d12) <= 0
    F = 0;
    return
end
tol = 1e-9 * max([d21 d12]);
if min(d21) < -tol || min(d12) < -tol
    error('rect_to_rect: rectangles in partial view');
end

dc = (lo1 + hi1 - lo2 - hi2) / 2;
sz = max([hi1 - lo1, hi2 - lo2]);
useGauss = strcmp(mode, 'gauss') || (strcmp(mode, 'auto') && norm(dc) >= 5 * sz);

if useGauss
    t = [-sqrt(5 + 2*sqrt(10/7))/3, -sqrt(5 - 2*sqrt(10/7))/3, 0, sqrt(5 - 2*sqrt(10/7))/3, sqrt(5 + 2*sqrt(10/7))/3];
    w = [(322 - 13*sqrt(70))/900, (322 + 13*sqrt(70))/900, 128/225, (322 + 13*sqrt(70))/900, (322 - 13*sqrt(70))/900];
    x = (t + 1) / 2; w = w / 2;
    ax1 = setdiff(1:3, a1); ax2 = setdiff(1:3, a2);
    ea = zeros(1, 3); eb = zeros(1, 3);
    ea(ax2(1)) = hi2(ax2(1)) - lo2(ax2(1));
    eb(ax2(2)) = hi2(ax2(2)) - lo2(ax2(2));
    F = 0;
    p = lo1;
    for i = 1:5
        p(ax1(1)) = lo1(ax1(1)) + x(i) * (hi1(ax1(1)) - lo1(ax1(1)));
        for j = 1:5
            p(ax1(2)) = lo1(ax1(2)) + x(j) * (hi1(ax1(2)) - lo1(ax1(2)));
            F = F + w(i) * w(j) * ff_point_rect(p, n1, lo2, ea, eb, n2);
        end
    end
    return
end

if a1 == a2                               % parallel, facing each other
    ax = setdiff(1:3, a1);
    F = sparrow_parallel([lo1(ax(1)) hi1(ax(1))], [lo1(ax(2)) hi1(ax(2))], ...
                         [lo2(ax(1)) hi2(ax(1))], [lo2(ax(2)) hi2(ax(2))], abs(lo1(a1) - lo2(a1)));
else                                      % perpendicular
    k = 6 - a1 - a2;                      % common axis
    y = sort(abs([lo1(a2) hi1(a2)] - lo2(a2)));
    z = sort(abs([lo2(a1) hi2(a1)] - lo1(a1)));
    F = sparrow_perpendicular([lo1(k) hi1(k)], y, [lo2(k) hi2(k)], z);
end
end

function v = H(t, s)
q = t.^2 + s.^2;
v = 0;
if q > 0, v = v + 0.25 * (t^2 - s^2) * log(q); end
if s > 0, v = v + s * t * atan(t / s); end
end

function F = sparrow_parallel(X, Y, P, Q, c)
S = 0;
for i = 1:2, for j = 1:2, for k = 1:2, for l = 1:2
    u = X(i) - P(k); v = Y(j) - Q(l);
    S = S + (-1)^(i+j+k+l) * (H(u, sqrt(v^2 + c^2)) + H(v, sqrt(u^2 + c^2)));
end, end, end, end
F = S / (2 * pi * diff(X) * diff(Y));
end

function F = sparrow_perpendicular(X, Y, P, Z)
S = 0;
for i = 1:2, for j = 1:2, for k = 1:2, for l = 1:2
    S = S + (-1)^(i+j+k+l) * H(X(i) - P(k), sqrt(Y(j)^2 + Z(l)^2));
end, end, end, end
F = S / (2 * pi * diff(X) * diff(Y));
end
