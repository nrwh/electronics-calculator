## Duty cycle

In continuous conduction (CCM) the inductor current never reaches zero, and the average inductor voltage over a period is zero (volt-second balance).

**Asynchronous (diode):** during the on-time the inductor sees $V_\text{in} - V_\text{out}$. During the off-time the diode conducts and it sees $-(V_\text{out} + V_F)$. Balancing these gives

$$
D = \frac{V_\text{out} + V_F}{V_\text{in} + V_F}.
$$

**Synchronous (MOSFET):** losses are lumped into the efficiency estimate $\eta$. The switch must supply $P_\text{out}/\eta$, so

$$
D \approx \frac{V_\text{out}}{\eta\,V_\text{in}}.
$$

This is equivalent to a series loss resistance that drops $V_\text{out}(1/\eta - 1)$ at full load. The inductor then sees $-V_\text{out}/\eta$ while the switch is off. The SPICE netlist models exactly this.

$D$ is largest at $V_\text{in,min}$ and smallest at $V_\text{in,max}$.

## Inductor

With $V_\text{off}$ the magnitude of the off-time inductor voltage ($V_\text{out} + V_F$, or $V_\text{out}/\eta$), the peak-to-peak ripple current is

$$
\Delta I_L = \frac{V_\text{off}\,(1 - D)}{f_\text{sw}\,L}.
$$

It is largest at $V_\text{in,max}$ (smallest $D$), so the inductor is sized there for a ripple of $r \cdot I_\text{out}$:

$$
L = \frac{V_\text{off}\,(1 - D_\text{min})}{f_\text{sw}\; r\,I_\text{out}}.
$$

The currents follow from the triangular waveform:

$$
I_\text{pk} = I_\text{out} + \frac{\Delta I_L}{2}, \qquad
I_{L,\text{rms}} = \sqrt{I_\text{out}^2 + \frac{\Delta I_L^2}{12}}.
$$

Below a load of $\Delta I_L/2$ the valley current reaches zero. An asynchronous converter then enters discontinuous conduction, where these formulas no longer hold. A forced-PWM synchronous converter instead lets the current reverse.

## Output capacitor

The capacitor carries the ripple current $i_C = i_L - I_\text{out}$, a zero-mean triangle. The output ripple is

$$
v_\text{out}(t) = \text{ESR}\cdot i_C(t) + \frac{1}{C}\int i_C\,dt.
$$

The usual estimates for its two parts are

$$
\Delta V_C = \frac{\Delta I_L}{8 f_\text{sw} C}, \qquad \Delta V_\text{ESR} = \Delta I_L \cdot \text{ESR}.
$$

They peak at different times, so simply adding them overestimates the ripple. The calculator evaluates the waveform above over one period and takes its peak-to-peak value. To solve for $C_\text{out}$, it finds the capacitance that gives the target ripple with a bracketed root finder. This is impossible if $\text{ESR}\cdot\Delta I_L$ alone exceeds the target.

The capacitor's RMS ripple current is $\Delta I_L/\sqrt{12}$.

## Input capacitor

The input current is a pulse train of height $\approx I_\text{out}$ and duty $D$. Its AC component, which the input capacitor supplies, has RMS value

$$
I_{C_\text{in},\text{rms}} = I_\text{out}\sqrt{D(1 - D)},
$$

which is largest ($I_\text{out}/2$) at $D = 0.5$. For an input ripple of $\Delta V_\text{in}$ (1 % of $V_\text{in,min}$ here),

$$
C_\text{in} \ge \frac{I_\text{out}\, D(1 - D)}{f_\text{sw}\,\Delta V_\text{in}}.
$$

## Output filter

Seen from the switch node, $L$ and $C_\text{out}$ (with its ESR) form a second-order low-pass loaded by $R = V_\text{out}/I_\text{out}$:

$$
H(s) = \frac{Z}{sL + Z}, \qquad Z = \left(\text{ESR} + \frac{1}{sC}\right) \parallel R,
$$

with resonance at $f_{LC} = \dfrac{1}{2\pi\sqrt{LC}}$ and an ESR zero at $f_\text{ESR} = \dfrac{1}{2\pi\,\text{ESR}\,C}$. The controller's compensation must handle both. This calculator does not design the loop.

## Feedback divider

The controller regulates the divider tap to $V_\text{ref}$:

$$
V_\text{out} = V_\text{ref}\left(1 + \frac{R_\text{top}}{R_\text{bot}}\right).
$$

The calculator searches the selected resistor series for the pair whose ratio is closest to $V_\text{out}/V_\text{ref} - 1$, with $R_\text{bot}$ between 1 kΩ and 100 kΩ (preferring about 10 kΩ).

## Assumptions

- Continuous conduction and steady state; ripple quantities are evaluated at $V_\text{in,max}$.
- Losses are lumped into $\eta$ (synchronous) or the diode's $V_F$ (asynchronous). Switching transitions are instantaneous.
- The SPICE netlist is the open-loop power stage at the computed duty cycle, simulated at $V_\text{in,max}$.
