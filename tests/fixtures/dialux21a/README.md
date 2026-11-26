# DIALux comparison of stage 2.1a (26 Nov 2026): tilted luminaires

Room 4 × 4 × 2.7 m, reflectances ceiling 0.7, walls 0.5, floor 0.2, MF 0.75, work plane 0.8 m with
no edge zone; four Maytoni Exility Focus Led TR032-2-12W4K-S-B (840 lm, housing height 125 mm,
`TR032-2-12W4K-S-B.ldt`), mounting height 2.7 m, rotation X / Y / Z as in the DIALux report:

| No | X, m | Y, m | X, ° | Y, ° | Z, ° |
| --- | --- | --- | --- | --- | --- |
| 1 | 2.693 | 2.832 | 0.0 | −39.2 | 99.4 |
| 2 | 1.137 | 2.717 | 0.0 | −40.6 | 104.7 |
| 3 | 2.791 | 1.089 | 0.0 | −44.0 | 30.5 |
| 4 | 1.258 | 0.643 | −16.5 | 14.6 | 4.2 |

The DIALux angles are our tx, ty, ψ as they stand: R = Rz(Z)·Ry(Y)·Rx(X), the beam directions of the
plan of the report (page 24) agree. DIALux turns the luminaire about its mounting point, as we do
(turning about the photometric centre gives E_max 12 % off).

DIALux results (report of 26 Nov 2026, pages 28–30): work plane Ē 88.0 lx, E_min 15.5 lx, E_max 790 lx;
floor Ē 56.1 lx, E_max 379 lx; walls x = L 76.2 (RS2), y = W 127 (RS3), y = 0 64.7 (RS4), x = 0 41.5
(RS5) lx; ceiling 28.5 lx. The point values of the work plane (0.25 + 0.5 i m) are in
`tests/dialux21a.test.mjs`; the ones hidden in the report by the luminaire symbols and the isolines
are left out (9 of 64).
