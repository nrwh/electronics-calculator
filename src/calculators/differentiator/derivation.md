## Ideal differentiator

An inverting amplifier with a capacitor at the input and a resistor in feedback has

$$
H(s) = -\frac{Z_f}{Z_\text{in}} = -sR_fC,
$$

so $v_\text{out} = -R_fC\,\dfrac{dv_\text{in}}{dt}$. Its gain rises at 20 dB per decade forever. That amplifies high-frequency noise without limit, and, as shown below, it is unstable with a real op-amp.

## Practical form

Adding $R_1$ in series with $C$ and $C_f$ across $R_f$ gives

$$
Z_\text{in} = R_1 + \frac{1}{sC}, \qquad Z_f = \frac{R_f}{1 + sR_fC_f},
$$

$$
H(s) = -\frac{sR_fC}{(1 + sR_1C)(1 + sR_fC_f)}.
$$

Well below both poles, $H \approx -sR_fC$: an ideal differentiator. The gain magnitude $\omega R_f C$ equals 1 at

$$
f_a = \frac{1}{2\pi R_f C}.
$$

The two poles are at $1/(2\pi R_1 C)$ and $1/(2\pi R_f C_f)$. Placing both at the upper corner $f_b$ gives the sharpest roll-off above the differentiated band:

$$
R_1 = \frac{1}{2\pi f_b C}, \qquad C_f = \frac{R_1 C}{R_f} \quad\Rightarrow\quad R_fC_f = R_1C.
$$

With coincident poles, the gain at $f_b$ is $\tfrac{1}{2}\,f_b/f_a$ (6 dB below the ideal differentiator). When the parts are given instead, the calculator reports $f_b$ as the geometric mean of the two poles and warns if they differ by more than 1.5×.

## Stability

The op-amp sees the noise gain $1/\beta = 1 + Z_f/Z_\text{in}$. For the ideal differentiator, $1/\beta = 1 + sR_fC$, which rises at 20 dB per decade from $f_a$. A single-pole op-amp,

$$
A(s) = \frac{A_0}{1 + s/\omega_p}, \qquad \omega_p = \frac{2\pi\,\text{GBW}}{A_0},
$$

falls at 20 dB per decade. The two curves meet with a 40 dB per decade closing rate at

$$
f_i \approx \sqrt{f_a \cdot \text{GBW}},
$$

where the loop has almost no phase margin, so the circuit rings or oscillates. The poles at $f_b$ flatten the noise gain to

$$
\frac{1}{\beta}\bigg|_{f \gg f_b} = 1 + \frac{C}{C_f}
$$

before it reaches the op-amp curve, which restores phase margin. This requires $f_b$ to be well below $f_i$.

The calculator finds the loop-gain crossover $|A/(1/\beta)| = 1$ numerically, and reports the phase margin $180° + \arg\!\big(A\beta\big)$ there, together with the smallest GBW that gives 60°.

## Closed-loop response with a real op-amp

$$
H_\text{cl}(s) = -\frac{Z_f}{Z_\text{in}} \cdot \frac{1}{1 + \dfrac{1/\beta}{A(s)}}.
$$

This is the curve plotted and simulated. The SPICE netlist uses the same single-pole op-amp model.

## Slew rate

A sine output of peak $V_\text{pk}$ at frequency $f$ changes at up to $2\pi f V_\text{pk}$, so the op-amp's slew rate must exceed that.

## Assumptions

- A single-pole op-amp with $A_0 = 10^5$ (100 dB). Real op-amps have further poles near GBW, which reduce the phase margin.
- Output limits are modelled only in the time-domain plot and the SPICE clamps.
- The source impedance is zero; otherwise add it to $R_1$.
