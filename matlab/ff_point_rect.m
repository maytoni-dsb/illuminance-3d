function F = ff_point_rect(x, n, p0, a, b, nA)
%FF_POINT_RECT Form factor from a differential area to a rectangle (parallelogram).
%   F = FF_POINT_RECT(x, n, p0, a, b, nA) returns the configuration factor from a
%   differential area at point x with unit normal n to the parallelogram with
%   vertices p0, p0+a, p0+a+b, p0+b (all 3-vectors, metres).
%
%   Lambert's contour integral (spec, "Метод расчёта", item 2):
%     F = 1/(2*pi) * | sum_k gamma_k * n . (r_k x r_k+1) / |r_k x r_k+1| |,
%   r_k = p_k - x, gamma_k = atan2(|r_k x r_k+1|, r_k . r_k+1).
%
%   Visibility rules (same as js/formfactor.js):
%   1. Horizon clipping: the polygon is clipped to the half-space n.(p - x) >= 0.
%   2. Emitter side: if nA is given and nonzero, F = 0 unless nA.(x - p0) > 0.
%
%   Reference implementation for stage 2 of the lighting calculator.

x = x(:); n = n(:); p0 = p0(:); a = a(:); b = b(:);
if nargin >= 6 && any(nA(:) ~= 0)
    if ~(dot(nA(:), x - p0) > 0)
        F = 0;
        return
    end
end

R = [p0, p0 + a, p0 + a + b, p0 + b] - x;   % 3x4, vertices relative to x
s = n.' * R;                                 % signed distances to the receiver plane

if ~any(s > 0)
    F = 0;                                   % entirely behind or in the receiver plane
    return
end

if any(s < 0)                                % Sutherland-Hodgman clipping to s >= 0
    m = size(R, 2);
    Q = zeros(3, 0);
    for k = 1:m
        k1 = mod(k, m) + 1;
        if s(k) >= 0
            Q(:, end + 1) = R(:, k); %#ok<AGROW>
        end
        if s(k) * s(k1) < 0
            t = s(k) / (s(k) - s(k1));
            Q(:, end + 1) = R(:, k) + t * (R(:, k1) - R(:, k)); %#ok<AGROW>
        end
    end
    R = Q;
end

m = size(R, 2);
S = 0;
for k = 1:m
    r1 = R(:, k);
    r2 = R(:, mod(k, m) + 1);
    c = cross(r1, r2);
    cn = norm(c);
    if cn > 0
        S = S + atan2(cn, dot(r1, r2)) * dot(n, c) / cn;
    end
end
F = abs(S) / (2 * pi);
end
