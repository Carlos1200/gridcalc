/**
 * Financial functions (phase 4): the time-value-of-money family around
 * PV*(1+r)^n + PMT*(1+r*type)*((1+r)^n - 1)/r + FV = 0, cash-flow analysis
 * (NPV/IRR/MIRR) and depreciation (SLN/SYD/DB/DDB).
 */

import {
  CellError,
  CellErrorType,
  type RawInterpreterValue,
} from '../value/types';
import { asNumber, forEachNumber } from './helpers';
import type { RegisteredFunction } from './types';

/** Required numeric argument shorthand. */
function num(args: RawInterpreterValue[], index: number): number | CellError {
  return asNumber(args[index]!);
}

/** Optional numeric argument that keeps fractions (optionalNumber truncates). */
function numOr(args: RawInterpreterValue[], index: number, fallback: number): number | CellError {
  const arg = args[index];
  if (arg === undefined) {
    return fallback;
  }
  const value = asNumber(arg);
  if (value instanceof CellError) {
    // EmptyValue coerces to 0, which is the right default everywhere here.
    return value;
  }
  return value;
}

/** Value at the end of `nper` periods of one unit paid as pv (TVM kernel). */
function compound(rate: number, nper: number): number {
  return Math.pow(1 + rate, nper);
}

/** PMT for the standard TVM equation. */
function pmtOf(rate: number, nper: number, pv: number, fv: number, type: number): number | CellError {
  if (nper === 0) {
    return new CellError(CellErrorType.NUM, 'NPER cannot be zero');
  }
  if (rate === 0) {
    return -(pv + fv) / nper;
  }
  const growth = compound(rate, nper);
  return (-(pv * growth + fv) * rate) / ((1 + rate * type) * (growth - 1));
}

/** FV for the standard TVM equation. */
function fvOf(rate: number, nper: number, pmt: number, pv: number, type: number): number {
  if (rate === 0) {
    return -(pv + pmt * nper);
  }
  const growth = compound(rate, nper);
  return -(pv * growth + (pmt * (1 + rate * type) * (growth - 1)) / rate);
}

/** Interest portion of payment `per`; shared by IPMT and PPMT. */
function ipmtOf(
  rate: number,
  per: number,
  nper: number,
  pv: number,
  fv: number,
  type: number,
): number | CellError {
  if (per < 1 || per > nper) {
    return new CellError(CellErrorType.NUM, 'Period must be between 1 and NPER');
  }
  const payment = pmtOf(rate, nper, pv, fv, type);
  if (payment instanceof CellError) {
    return payment;
  }
  if (type === 1 && per === 1) {
    return 0;
  }
  // Balance after per-1 payments, then one period of interest on it.
  const balance = fvOf(rate, per - 1, payment, pv, type);
  const interest = balance * rate;
  return type === 1 ? interest / (1 + rate) : interest;
}

/** Numbers collected from cash-flow arguments (range rules: text/booleans skipped). */
function cashFlows(args: RawInterpreterValue[]): number[] | CellError {
  const values: number[] = [];
  const error = forEachNumber(args, (n) => {
    values.push(n);
  });
  return error ?? values;
}

function npvOf(rate: number, values: number[]): number | CellError {
  if (rate === -1) {
    return new CellError(CellErrorType.DIV_BY_ZERO, 'NPV rate cannot be -100%');
  }
  let total = 0;
  for (let i = 0; i < values.length; i++) {
    total += values[i]! / compound(rate, i + 1);
  }
  return total;
}

/** Newton-Raphson root of `f` with derivative `df`; undefined when diverging. */
function newton(
  f: (x: number) => number,
  df: (x: number) => number,
  guess: number,
): number | undefined {
  let x = guess;
  for (let i = 0; i < 64; i++) {
    const y = f(x);
    if (Math.abs(y) < 1e-10) {
      return x;
    }
    const slope = df(x);
    if (slope === 0 || !Number.isFinite(slope)) {
      return undefined;
    }
    const next = x - y / slope;
    if (!Number.isFinite(next)) {
      return undefined;
    }
    if (Math.abs(next - x) < 1e-12) {
      return next;
    }
    x = next;
  }
  return undefined;
}

export const financialFunctions: RegisteredFunction[] = [
  {
    metadata: { name: 'PMT', minArgs: 3, maxArgs: 5 },
    fn: (args: RawInterpreterValue[]) => {
      const rate = num(args, 0);
      if (rate instanceof CellError) return rate;
      const nper = num(args, 1);
      if (nper instanceof CellError) return nper;
      const pv = num(args, 2);
      if (pv instanceof CellError) return pv;
      const fv = numOr(args, 3, 0);
      if (fv instanceof CellError) return fv;
      const type = numOr(args, 4, 0);
      if (type instanceof CellError) return type;
      return pmtOf(rate, nper, pv, fv, type === 0 ? 0 : 1);
    },
  },
  {
    metadata: { name: 'FV', minArgs: 3, maxArgs: 5 },
    fn: (args: RawInterpreterValue[]) => {
      const rate = num(args, 0);
      if (rate instanceof CellError) return rate;
      const nper = num(args, 1);
      if (nper instanceof CellError) return nper;
      const pmt = num(args, 2);
      if (pmt instanceof CellError) return pmt;
      const pv = numOr(args, 3, 0);
      if (pv instanceof CellError) return pv;
      const type = numOr(args, 4, 0);
      if (type instanceof CellError) return type;
      return fvOf(rate, nper, pmt, pv, type === 0 ? 0 : 1);
    },
  },
  {
    metadata: { name: 'PV', minArgs: 3, maxArgs: 5 },
    fn: (args: RawInterpreterValue[]) => {
      const rate = num(args, 0);
      if (rate instanceof CellError) return rate;
      const nper = num(args, 1);
      if (nper instanceof CellError) return nper;
      const pmt = num(args, 2);
      if (pmt instanceof CellError) return pmt;
      const fv = numOr(args, 3, 0);
      if (fv instanceof CellError) return fv;
      const typeNum = numOr(args, 4, 0);
      if (typeNum instanceof CellError) return typeNum;
      const type = typeNum === 0 ? 0 : 1;
      if (rate === 0) {
        return -(fv + pmt * nper);
      }
      const growth = compound(rate, nper);
      return -(fv + (pmt * (1 + rate * type) * (growth - 1)) / rate) / growth;
    },
  },
  {
    metadata: { name: 'NPER', minArgs: 3, maxArgs: 5 },
    fn: (args: RawInterpreterValue[]) => {
      const rate = num(args, 0);
      if (rate instanceof CellError) return rate;
      const pmt = num(args, 1);
      if (pmt instanceof CellError) return pmt;
      const pv = num(args, 2);
      if (pv instanceof CellError) return pv;
      const fv = numOr(args, 3, 0);
      if (fv instanceof CellError) return fv;
      const typeNum = numOr(args, 4, 0);
      if (typeNum instanceof CellError) return typeNum;
      const type = typeNum === 0 ? 0 : 1;
      if (rate === 0) {
        if (pmt === 0) {
          return new CellError(CellErrorType.NUM, 'NPER needs a payment when the rate is zero');
        }
        return -(pv + fv) / pmt;
      }
      const adjusted = (pmt * (1 + rate * type)) / rate;
      const ratio = (adjusted - fv) / (pv + adjusted);
      if (ratio <= 0) {
        return new CellError(CellErrorType.NUM, 'NPER has no solution for these arguments');
      }
      return Math.log(ratio) / Math.log(1 + rate);
    },
  },
  {
    metadata: { name: 'RATE', minArgs: 3, maxArgs: 6 },
    fn: (args: RawInterpreterValue[]) => {
      const nper = num(args, 0);
      if (nper instanceof CellError) return nper;
      const pmt = num(args, 1);
      if (pmt instanceof CellError) return pmt;
      const pv = num(args, 2);
      if (pv instanceof CellError) return pv;
      const fv = numOr(args, 3, 0);
      if (fv instanceof CellError) return fv;
      const typeNum = numOr(args, 4, 0);
      if (typeNum instanceof CellError) return typeNum;
      const guess = numOr(args, 5, 0.1);
      if (guess instanceof CellError) return guess;
      const type = typeNum === 0 ? 0 : 1;
      const f = (r: number): number => {
        if (r === 0) {
          return pv + pmt * nper + fv;
        }
        // expm1/log1p keep (1+r)^n - 1 stable for tiny rates, so Newton can
        // converge on roots near zero without catastrophic cancellation.
        const growthM1 = Math.expm1(nper * Math.log1p(r));
        return pv * (growthM1 + 1) + (pmt * (1 + r * type) * growthM1) / r + fv;
      };
      const df = (r: number): number => {
        const h = 1e-7;
        return (f(r + h) - f(r - h)) / (2 * h);
      };
      const root = newton(f, df, guess);
      return root === undefined || root <= -1
        ? new CellError(CellErrorType.NUM, 'RATE did not converge')
        : root;
    },
  },
  {
    metadata: { name: 'IPMT', minArgs: 4, maxArgs: 6 },
    fn: (args: RawInterpreterValue[]) => {
      const rate = num(args, 0);
      if (rate instanceof CellError) return rate;
      const per = num(args, 1);
      if (per instanceof CellError) return per;
      const nper = num(args, 2);
      if (nper instanceof CellError) return nper;
      const pv = num(args, 3);
      if (pv instanceof CellError) return pv;
      const fv = numOr(args, 4, 0);
      if (fv instanceof CellError) return fv;
      const type = numOr(args, 5, 0);
      if (type instanceof CellError) return type;
      return ipmtOf(rate, Math.trunc(per), nper, pv, fv, type === 0 ? 0 : 1);
    },
  },
  {
    metadata: { name: 'PPMT', minArgs: 4, maxArgs: 6 },
    fn: (args: RawInterpreterValue[]) => {
      const rate = num(args, 0);
      if (rate instanceof CellError) return rate;
      const per = num(args, 1);
      if (per instanceof CellError) return per;
      const nper = num(args, 2);
      if (nper instanceof CellError) return nper;
      const pv = num(args, 3);
      if (pv instanceof CellError) return pv;
      const fv = numOr(args, 4, 0);
      if (fv instanceof CellError) return fv;
      const typeNum = numOr(args, 5, 0);
      if (typeNum instanceof CellError) return typeNum;
      const type = typeNum === 0 ? 0 : 1;
      const payment = pmtOf(rate, nper, pv, fv, type);
      if (payment instanceof CellError) {
        return payment;
      }
      const interest = ipmtOf(rate, Math.trunc(per), nper, pv, fv, type);
      return interest instanceof CellError ? interest : payment - interest;
    },
  },
  {
    metadata: { name: 'NPV', minArgs: 2, maxArgs: Infinity, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      const rate = asNumber(args[0]!);
      if (rate instanceof CellError) {
        return rate;
      }
      const values = cashFlows(args.slice(1));
      return values instanceof CellError ? values : npvOf(rate, values);
    },
  },
  {
    metadata: { name: 'IRR', minArgs: 1, maxArgs: 2, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      const values = cashFlows([args[0]!]);
      if (values instanceof CellError) {
        return values;
      }
      let start = 0.1;
      if (args[1] !== undefined) {
        const g = asNumber(args[1]);
        if (g instanceof CellError) {
          return g;
        }
        start = g;
      }
      if (!values.some((v) => v > 0) || !values.some((v) => v < 0)) {
        return new CellError(CellErrorType.NUM, 'IRR needs at least one inflow and one outflow');
      }
      // NPV here includes the time-0 flow: sum v[i]/(1+r)^i.
      const f = (r: number): number =>
        values.reduce((acc, v, i) => acc + v / Math.pow(1 + r, i), 0);
      const df = (r: number): number =>
        values.reduce((acc, v, i) => acc - (i * v) / Math.pow(1 + r, i + 1), 0);
      const root = newton(f, df, start);
      return root === undefined || root <= -1
        ? new CellError(CellErrorType.NUM, 'IRR did not converge')
        : root;
    },
  },
  {
    metadata: { name: 'MIRR', minArgs: 3, maxArgs: 3, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      const values = cashFlows([args[0]!]);
      if (values instanceof CellError) {
        return values;
      }
      const financeRate = asNumber(args[1]!);
      if (financeRate instanceof CellError) {
        return financeRate;
      }
      const reinvestRate = asNumber(args[2]!);
      if (reinvestRate instanceof CellError) {
        return reinvestRate;
      }
      const n = values.length;
      if (!values.some((v) => v > 0) || !values.some((v) => v < 0)) {
        return new CellError(CellErrorType.DIV_BY_ZERO, 'MIRR needs inflows and outflows');
      }
      const positives = values.map((v) => (v > 0 ? v : 0));
      const negatives = values.map((v) => (v < 0 ? v : 0));
      const npvPos = positives.reduce((acc, v, i) => acc + v / Math.pow(1 + reinvestRate, i), 0);
      const npvNeg = negatives.reduce((acc, v, i) => acc + v / Math.pow(1 + financeRate, i), 0);
      const ratio = (-npvPos * Math.pow(1 + reinvestRate, n - 1)) / npvNeg;
      return Math.pow(ratio, 1 / (n - 1)) - 1;
    },
  },
  {
    metadata: { name: 'SLN', minArgs: 3, maxArgs: 3 },
    fn: (args: RawInterpreterValue[]) => {
      const cost = num(args, 0);
      if (cost instanceof CellError) return cost;
      const salvage = num(args, 1);
      if (salvage instanceof CellError) return salvage;
      const life = num(args, 2);
      if (life instanceof CellError) return life;
      if (life === 0) {
        return new CellError(CellErrorType.DIV_BY_ZERO, 'Life cannot be zero');
      }
      return (cost - salvage) / life;
    },
  },
  {
    metadata: { name: 'SYD', minArgs: 4, maxArgs: 4 },
    fn: (args: RawInterpreterValue[]) => {
      const cost = num(args, 0);
      if (cost instanceof CellError) return cost;
      const salvage = num(args, 1);
      if (salvage instanceof CellError) return salvage;
      const life = num(args, 2);
      if (life instanceof CellError) return life;
      const per = num(args, 3);
      if (per instanceof CellError) return per;
      if (life <= 0 || per < 1 || per > life) {
        return new CellError(CellErrorType.NUM, 'SYD period must be between 1 and life');
      }
      return ((cost - salvage) * (life - per + 1) * 2) / (life * (life + 1));
    },
  },
  {
    // DDB(cost, salvage, life, period, [factor=2]): declining balance with
    // the depreciation clamped so book value never falls below salvage.
    metadata: { name: 'DDB', minArgs: 4, maxArgs: 5 },
    fn: (args: RawInterpreterValue[]) => {
      const cost = num(args, 0);
      if (cost instanceof CellError) return cost;
      const salvage = num(args, 1);
      if (salvage instanceof CellError) return salvage;
      const life = num(args, 2);
      if (life instanceof CellError) return life;
      const period = num(args, 3);
      if (period instanceof CellError) return period;
      const factor = numOr(args, 4, 2);
      if (factor instanceof CellError) return factor;
      if (cost < 0 || salvage < 0 || life <= 0 || period < 1 || period > life || factor <= 0) {
        return new CellError(CellErrorType.NUM, 'Invalid DDB arguments');
      }
      const rate = Math.min(factor / life, 1);
      let book = cost;
      let depreciation = 0;
      for (let p = 1; p <= Math.trunc(period); p++) {
        depreciation = Math.min(book * rate, Math.max(book - salvage, 0));
        book -= depreciation;
      }
      return depreciation;
    },
  },
  {
    // DB(cost, salvage, life, period, [month=12]): fixed-declining balance
    // with the rate rounded to 3 decimals, like Excel.
    metadata: { name: 'DB', minArgs: 4, maxArgs: 5 },
    fn: (args: RawInterpreterValue[]) => {
      const cost = num(args, 0);
      if (cost instanceof CellError) return cost;
      const salvage = num(args, 1);
      if (salvage instanceof CellError) return salvage;
      const life = num(args, 2);
      if (life instanceof CellError) return life;
      const period = num(args, 3);
      if (period instanceof CellError) return period;
      const month = numOr(args, 4, 12);
      if (month instanceof CellError) return month;
      if (cost < 0 || salvage < 0 || life <= 0 || period < 1 || month < 1 || month > 12) {
        return new CellError(CellErrorType.NUM, 'Invalid DB arguments');
      }
      if (period > Math.trunc(life) + (month < 12 ? 1 : 0)) {
        return new CellError(CellErrorType.NUM, 'DB period is past the asset life');
      }
      if (cost === 0) {
        return 0;
      }
      const rate = Math.round((1 - Math.pow(salvage / cost, 1 / life)) * 1000) / 1000;
      let depreciation = (cost * rate * month) / 12;
      if (Math.trunc(period) === 1) {
        return depreciation;
      }
      let accumulated = depreciation;
      for (let p = 2; p <= Math.trunc(period); p++) {
        if (month < 12 && p === Math.trunc(life) + 1) {
          // Final stub period when the first year was partial.
          depreciation = ((cost - accumulated) * rate * (12 - month)) / 12;
        } else {
          depreciation = (cost - accumulated) * rate;
        }
        accumulated += depreciation;
      }
      return depreciation;
    },
  },
];
