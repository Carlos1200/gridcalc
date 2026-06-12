/** Distribution functions: the normal family (NORM.DIST, NORM.INV and legacy spellings). */

import { CellError, CellErrorType, type RawInterpreterValue } from '../value/types';
import { asBoolean, asNumber } from './helpers';
import type { RegisteredFunction } from './types';

const SQRT_2 = Math.SQRT2;
const SQRT_2PI = Math.sqrt(2 * Math.PI);
const INV_SQRT_PI = 5.6418958354775628695e-1;

/**
 * erfc via W. J. Cody's rational Chebyshev approximations (SPECFUN, 1969),
 * accurate to full double precision over the three classic regimes.
 */
function erfc(x: number): number {
  const y = Math.abs(x);
  if (y < 0.46875) {
    return 1 - erf(x);
  }
  let result: number;
  const z = y * y;
  if (y < 4) {
    const C = [
      5.64188496988670089e-1, 8.88314979438837594e0, 6.61191906371416295e1,
      2.98635138197400131e2, 8.81952221241769090e2, 1.71204761263407058e3,
      2.05107837782607147e3, 1.23033935479799725e3,
    ];
    const D = [
      1.57449261107098347e1, 1.17693950891312499e2, 5.37181101862009858e2,
      1.62138957456669019e3, 3.29079923573345963e3, 4.36261909014324716e3,
      3.43936767414372164e3, 1.23033935480374942e3,
    ];
    let xnum = 2.15311535474403846e-8 * y;
    let xden = y;
    for (let i = 0; i < 7; i++) {
      xnum = (xnum + C[i]!) * y;
      xden = (xden + D[i]!) * y;
    }
    result = Math.exp(-z) * ((xnum + C[7]!) / (xden + D[7]!));
  } else if (y < 26.5) {
    const P = [
      3.05326634961232344e-1, 3.60344899949804439e-1, 1.25781726111229246e-1,
      1.60837851487422766e-2, 6.58749161529837803e-4,
    ];
    const Q = [
      2.56852019228982242e0, 1.87295284992346047e0, 5.27905102951428412e-1,
      6.05183413124413191e-2, 2.33520497626869185e-3,
    ];
    const z2 = 1 / z;
    let xnum = 1.63153871373020978e-2 * z2;
    let xden = z2;
    for (let i = 0; i < 4; i++) {
      xnum = (xnum + P[i]!) * z2;
      xden = (xden + Q[i]!) * z2;
    }
    const r = (z2 * (xnum + P[4]!)) / (xden + Q[4]!);
    result = (Math.exp(-z) / y) * (INV_SQRT_PI - r);
  } else {
    result = 0;
  }
  return x < 0 ? 2 - result : result;
}

/** erf for |x| < 0.46875 (Cody); larger inputs go through erfc. */
function erf(x: number): number {
  const y = Math.abs(x);
  if (y >= 0.46875) {
    return 1 - erfc(x);
  }
  const A = [
    3.16112374387056560e0, 1.13864154151050156e2, 3.77485237685302021e2,
    3.20937758913846947e3,
  ];
  const B = [
    2.36012909523441209e1, 2.44024637934444173e2, 1.28261652607737228e3,
    2.84423683343917062e3,
  ];
  const z = y * y;
  let xnum = 1.85777706184603153e-1 * z;
  let xden = z;
  for (let i = 0; i < 3; i++) {
    xnum = (xnum + A[i]!) * z;
    xden = (xden + B[i]!) * z;
  }
  return (x * (xnum + A[3]!)) / (xden + B[3]!);
}

/** Standard normal CDF. */
function normalCdf(z: number): number {
  return 0.5 * erfc(-z / SQRT_2);
}

/** Standard normal PDF. */
function normalPdf(z: number): number {
  return Math.exp((-z * z) / 2) / SQRT_2PI;
}

/**
 * Standard normal inverse CDF: Acklam's rational approximation polished with
 * one Halley step against the Cody CDF (full double precision afterwards).
 */
function normalInv(p: number): number {
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0,
    -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0,
    3.754408661907416e0,
  ];
  const pLow = 0.02425;
  let x: number;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x =
      (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  } else if (p <= 1 - pLow) {
    const q = p - 0.5;
    const r = q * q;
    x =
      ((((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q) /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x =
      -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  const e = normalCdf(x) - p;
  const u = e * SQRT_2PI * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

function normDist(
  x: number,
  meanValue: number,
  sd: number,
  cumulative: boolean,
): number | CellError {
  if (sd <= 0) {
    return new CellError(CellErrorType.NUM, 'Standard deviation must be positive');
  }
  const z = (x - meanValue) / sd;
  return cumulative ? normalCdf(z) : normalPdf(z) / sd;
}

function normInv(p: number, meanValue: number, sd: number): number | CellError {
  if (p <= 0 || p >= 1) {
    return new CellError(CellErrorType.NUM, 'Probability must be strictly between 0 and 1');
  }
  if (sd <= 0) {
    return new CellError(CellErrorType.NUM, 'Standard deviation must be positive');
  }
  return meanValue + sd * normalInv(p);
}

/** NORM.DIST and legacy NORMDIST share the 4-arg signature. */
function normDistEntry(name: 'NORM.DIST' | 'NORMDIST'): RegisteredFunction {
  return {
    metadata: { name, minArgs: 4, maxArgs: 4 },
    fn: (args: RawInterpreterValue[]) => {
      const x = asNumber(args[0]!);
      const meanValue = asNumber(args[1]!);
      const sd = asNumber(args[2]!);
      const cumulative = asBoolean(args[3]!);
      if (x instanceof CellError) return x;
      if (meanValue instanceof CellError) return meanValue;
      if (sd instanceof CellError) return sd;
      if (cumulative instanceof CellError) return cumulative;
      return normDist(x, meanValue, sd, cumulative);
    },
  };
}

function normInvEntry(name: 'NORM.INV' | 'NORMINV'): RegisteredFunction {
  return {
    metadata: { name, minArgs: 3, maxArgs: 3 },
    fn: (args: RawInterpreterValue[]) => {
      const p = asNumber(args[0]!);
      const meanValue = asNumber(args[1]!);
      const sd = asNumber(args[2]!);
      if (p instanceof CellError) return p;
      if (meanValue instanceof CellError) return meanValue;
      if (sd instanceof CellError) return sd;
      return normInv(p, meanValue, sd);
    },
  };
}

function normSInvEntry(name: 'NORM.S.INV' | 'NORMSINV'): RegisteredFunction {
  return {
    metadata: { name, minArgs: 1, maxArgs: 1 },
    fn: (args: RawInterpreterValue[]) => {
      const p = asNumber(args[0]!);
      return p instanceof CellError ? p : normInv(p, 0, 1);
    },
  };
}

export const distributionFunctions: RegisteredFunction[] = [
  normDistEntry('NORM.DIST'),
  normDistEntry('NORMDIST'),
  normInvEntry('NORM.INV'),
  normInvEntry('NORMINV'),
  normSInvEntry('NORM.S.INV'),
  normSInvEntry('NORMSINV'),
  {
    // Modern spelling requires the cumulative flag.
    metadata: { name: 'NORM.S.DIST', minArgs: 2, maxArgs: 2 },
    fn: (args: RawInterpreterValue[]) => {
      const z = asNumber(args[0]!);
      const cumulative = asBoolean(args[1]!);
      if (z instanceof CellError) return z;
      if (cumulative instanceof CellError) return cumulative;
      return cumulative ? normalCdf(z) : normalPdf(z);
    },
  },
  {
    // Legacy NORMSDIST is CDF-only.
    metadata: { name: 'NORMSDIST', minArgs: 1, maxArgs: 1 },
    fn: (args: RawInterpreterValue[]) => {
      const z = asNumber(args[0]!);
      return z instanceof CellError ? z : normalCdf(z);
    },
  },
];
