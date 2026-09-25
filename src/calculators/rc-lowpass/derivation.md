## Transfer function

R and C form a voltage divider. The capacitor's impedance is $Z_C = \dfrac{1}{sC}$, so

$$
H(s) = \frac{V_\text{out}}{V_\text{in}} = \frac{Z_C}{R + Z_C} = \frac{1}{1 + sRC}.
$$

## Cut-off frequency

With $s = j\omega$, the magnitude is

$$
|H(j\omega)| = \frac{1}{\sqrt{1 + (\omega RC)^2}}.
$$

The cut-off (−3 dB, half-power) point is where $|H| = 1/\sqrt{2}$, i.e. $\omega RC = 1$:

$$
f_c = \frac{1}{2\pi RC}.
$$

Rearranged for each solve option:

$$
R = \frac{1}{2\pi f_c C}, \qquad C = \frac{1}{2\pi f_c R}.
$$

Above $f_c$ the gain falls at 20 dB per decade. The phase is

$$
\varphi(f) = -\arctan\frac{f}{f_c},
$$

which is −45° at $f_c$ and tends to −90°.

## Step response

For a step of height $V$ at $t = 0$, the output is

$$
v_\text{out}(t) = V\left(1 - e^{-t/\tau}\right), \qquad \tau = RC.
$$

It reaches 63 % of the step after one time constant. The 10 % and 90 % points are at $t = \tau \ln\frac{10}{9}$ and $t = \tau \ln 10$, so the 10–90 % rise time is

$$
t_r = \tau \ln 9 \approx 2.2\,\tau = \frac{0.35}{f_c}.
$$

## Tolerance

Since $f_c \propto 1/(RC)$, relative errors add to first order:

$$
\frac{\Delta f_c}{f_c} \approx -\left(\frac{\Delta R}{R} + \frac{\Delta C}{C}\right).
$$

The spread shown in the results evaluates the exact formula at every tolerance corner.

## Assumptions

- The source has zero output impedance (otherwise add it to R).
- The load has infinite impedance (otherwise it forms a divider with R and raises $f_c$).
- The parts are ideal: no capacitor ESR or leakage, and no resistor parasitics.
