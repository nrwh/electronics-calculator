## Feedback network

The output drives a series RC arm into a parallel RC arm to ground, and the junction feeds the
non-inverting input. With $Z_s = R + \dfrac{1}{sC}$ and $Z_p = R \parallel \dfrac{1}{sC} = \dfrac{R}{1 + sRC}$,

$$
\beta(s) = \frac{Z_p}{Z_s + Z_p} = \frac{sRC}{(sRC)^2 + 3\,sRC + 1}.
$$

At $s = j\omega$,

$$
\beta(j\omega) = \frac{1}{3 + j\left(\omega RC - \dfrac{1}{\omega RC}\right)},
$$

which is real, with magnitude $1/3$ (−9.54 dB), at

$$
\omega_0 RC = 1 \quad\Rightarrow\quad f_0 = \frac{1}{2\pi RC}.
$$

Rearranged for each solve option: $R = \dfrac{1}{2\pi f_0 C}$ and $C = \dfrac{1}{2\pi f_0 R}$.

## Gain for oscillation

The non-inverting amplifier has gain $G = 1 + R_f/R_g$. The loop gain at $f_0$ is $\beta G = G/3$ (Barkhausen criterion):

- $G = 3$ ($R_f = 2R_g$): a steady oscillation, but any loss stops it, and it will not start.
- $G < 3$: oscillations die away.
- $G > 3$: oscillations grow until something limits them.

So the small-signal gain is set a little above 3,

$$
G_\text{start} = 3(1 + m), \qquad R_f = (2 + 3m)\,R_g,
$$

and an amplitude-dependent element pulls the gain back to exactly 3 at the operating amplitude. The closed-loop poles are at $s^2 + (3 - G)\,\omega_0 s + \omega_0^2 = 0$, so the envelope grows as $e^{(G-3)\,\omega_0 t/2}$: a larger margin starts faster but distorts more.

## Diode stabilisation

$R_f$ is split into $R_{f1}$, always in circuit, and $R_{f2}$, shunted by two anti-parallel diodes. At small amplitude the diodes are off and $G = 1 + (R_{f1} + R_{f2})/R_g$. At large amplitude they conduct and $G \to 1 + R_{f1}/R_g < 3$.

**Design.** The bridge holds the inverting input at $v_\text{out}/3$, so a current $v_\text{out}/(3R_g)$ flows through the feedback chain. If the diodes hold $R_{f2}$'s voltage at $V_D$ at the peak,

$$
\frac{2}{3}V_\text{pk} = \frac{V_\text{pk}}{3R_g}R_{f1} + V_D \quad\Rightarrow\quad R_{f1} = R_g\left(2 - \frac{3V_D}{V_\text{pk}}\right),
$$

with $R_{f2} = (2 + 3m)R_g - R_{f1}$. This hard-clamp estimate needs $V_\text{pk} > 1.5\,V_D$. Real diodes conduct gradually, so it underestimates the $R_{f1}$ needed. The calculator refines $R_{f1}$ by solving the describing function below for the target amplitude, then snaps $R_{f1}$ and $R_{f2}$.

**Amplitude.** For given parts, the calculator finds the amplitude $A$ by describing function. It drives the sinusoidal current $i = \frac{A}{3R_g}\sin\theta$ through $R_g + R_{f1}$ and through $R_{f2}$ in parallel with diodes obeying $i_D = I_S\left(e^{v/nV_T} - 1\right)$ ($n = 1.75$, $I_S$ set by $V_D$ at 1 mA). It then solves

$$
\frac{2}{\pi}\int_0^\pi v_\text{out}(\theta)\sin\theta\,d\theta = A
$$

for $A$ (the fundamental of the output equals the amplitude, i.e. a loop gain of exactly 1). The SPICE netlist uses the same diode law.

## Effect of the op-amp

With a single-pole op-amp of gain-bandwidth GBW, the amplifier gain is $G(s) = \dfrac{A(s)}{1 + A(s)/3}$, which lags slightly at $f_0$. The oscillation settles where $\arg\big(\beta(j\omega)\,G(j\omega)\big) = 0$, a little below $f_0$. The calculator solves for that frequency numerically. Keeping GBW $\gtrsim 100 \cdot 3 f_0$ keeps the shift small.

## Assumptions

- The bridge resistors match each other, and so do the bridge capacitors.
- The op-amp is single-pole with $A_0 = 10^5$. Slew-rate limiting is not modelled (see the Components tab).
- Diode amplitude: the inverting input is sinusoidal, the diodes are at 27 °C, and their series resistance is ignored.
