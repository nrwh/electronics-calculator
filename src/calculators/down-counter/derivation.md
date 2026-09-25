## Number of flip-flops

A modulo-$N$ counter needs $N$ distinct states, so it uses

$$
k = \lceil \log_2 N \rceil
$$

D flip-flops, with state $S = (Q_{k-1} \dots Q_1 Q_0)_2$. Its terminal count (TC, state 0) occurs once every $N$ clocks:

$$
f_\text{out} = \frac{f_\text{clk}}{N}.
$$

Solving for $N$ from a wanted output frequency gives $N = \operatorname{round}(f_\text{clk}/f_\text{out})$. The achieved $f_\text{out}$ and its error are shown.

## Next-state table

Counting down, each state goes to the one below it, and 0 wraps to $N - 1$:

$$
S^{+} = \begin{cases} S - 1, & 1 \le S \le N - 1 \\ N - 1, & S = 0 \end{cases}
$$

A D flip-flop loads its input on the clock edge, so each $D_i$ is simply bit $i$ of $S^{+}$ as a function of the present state. The $2^k - N$ unused states are *don't-cares*: they never occur in normal counting, so they can take whichever value makes the logic simplest.

## Minimisation

Each $D_i$ is minimised as an exact sum of products:

1. Find all **prime implicants** (Quine–McCluskey): combine minterms and don't-cares that differ in one bit until nothing more combines.
2. Choose the **minimum cover** of the 1-minterms: the fewest product terms, then the fewest literals. With at most 4 variables, an exhaustive branch-and-bound search is fast, so the result is guaranteed minimal and not merely heuristic.

Complemented literals come free from the flip-flops' $\overline{Q}$ outputs, so no inverters are needed.

## Self-start (lockout) check

Minimisation silently gives each unused state some next state. If an unused state leads only to other unused states in a loop, a counter that powers up there never reaches the count (**lockout**). The calculator follows each unused state's next state until it reaches the sequence. If any unused state loops instead, it assigns that state's next state explicitly to $N - 1$, turning its don't-care into a fixed entry, and minimises again. The results list where every unused state goes.

## Timing

After a clock edge, a new $Q$ appears after $t_{\text{clk}\to Q}$. It then propagates through the AND–OR logic, and must reach each $D$ input at least $t_\text{su}$ before the next edge:

$$
f_\text{max} = \frac{1}{t_{\text{clk}\to Q} + t_\text{logic} + t_\text{su}}.
$$

The logic is built from 2-input gates (’08 AND, ’32 OR). A product of $n$ literals needs a tree of $\lceil \log_2 n \rceil$ AND levels, and a sum of $m$ terms needs $\lceil \log_2 m \rceil$ OR levels:

$$
t_\text{logic} = \max_i \left( \Big\lceil \log_2 n_\text{max} \Big\rceil\, t_\text{AND} + \Big\lceil \log_2 m_i \Big\rceil\, t_\text{OR} \right).
$$

The delays come from a table of typical datasheet maximums at 25 °C for each family, at the nearest tabulated $V_{CC}$ at or below the chosen one. You can also enter your own values.

## Outputs

Each $Q_i$ repeats with the counting sequence, and the calculator finds its shortest period (for example, $Q_0$ of a mod-4 counter repeats every 2 clocks). TC is high for one clock in $N$, a duty cycle of $1/N$.

## Assumptions

- All flip-flops share one clock with negligible skew.
- Delays are for light loads. Each extra input or trace adds capacitance and slows the edges.
- TC is decoded from several $Q$ outputs and can glitch; re-time it if it drives a clock.
