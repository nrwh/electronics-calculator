// A small immutable complex-number type for frequency responses.

export class Complex {
  constructor(
    readonly re: number,
    readonly im = 0,
  ) {}

  static polar(mag: number, arg: number): Complex {
    return new Complex(mag * Math.cos(arg), mag * Math.sin(arg));
  }

  add(o: Complex | number): Complex {
    return typeof o === 'number'
      ? new Complex(this.re + o, this.im)
      : new Complex(this.re + o.re, this.im + o.im);
  }

  sub(o: Complex | number): Complex {
    return typeof o === 'number'
      ? new Complex(this.re - o, this.im)
      : new Complex(this.re - o.re, this.im - o.im);
  }

  mul(o: Complex | number): Complex {
    if (typeof o === 'number') return new Complex(this.re * o, this.im * o);
    return new Complex(this.re * o.re - this.im * o.im, this.re * o.im + this.im * o.re);
  }

  div(o: Complex | number): Complex {
    if (typeof o === 'number') return new Complex(this.re / o, this.im / o);
    const d = o.re * o.re + o.im * o.im;
    return new Complex((this.re * o.re + this.im * o.im) / d, (this.im * o.re - this.re * o.im) / d);
  }

  inv(): Complex {
    return new Complex(1).div(this);
  }

  neg(): Complex {
    return new Complex(-this.re, -this.im);
  }

  abs(): number {
    return Math.hypot(this.re, this.im);
  }

  /** Argument in radians, in (−π, π]. */
  arg(): number {
    return Math.atan2(this.im, this.re);
  }
}

export const c = (re: number, im = 0): Complex => new Complex(re, im);

/** s = jω for frequency f in hertz. */
export const jw = (f: number): Complex => new Complex(0, 2 * Math.PI * f);

/** Parallel combination of impedances. */
export function parallel(...zs: Complex[]): Complex {
  let y = new Complex(0);
  for (const z of zs) y = y.add(z.inv());
  return y.inv();
}
