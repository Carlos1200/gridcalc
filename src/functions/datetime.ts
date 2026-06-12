/** Date & time functions: TODAY/NOW, DATE/TIME, fields, WEEKDAY/WEEKNUM, EDATE/EOMONTH, DATEDIF, working days. */

import { dateToSerial, fractionToTime, serialToDate, timeToFraction, type SimpleDate, type SimpleTime } from '../value/dates';
import { CellError, CellErrorType, EmptyValue, type RawInterpreterValue } from '../value/types';
import type { EvaluationContext } from '../evaluator/context';
import { asMatrix, asNumber, asScalar, asString } from './helpers';
import type { RegisteredFunction } from './types';

function todaySerial(context: EvaluationContext): number {
  const now = new Date();
  return dateToSerial(
    { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() },
    context.config.use1900LeapYearBug,
  );
}

/** Coerces a serial-number argument into a calendar date; negatives -> #NUM!. */
function asDate(value: RawInterpreterValue, context: EvaluationContext): SimpleDate | CellError {
  const n = asNumber(value);
  if (n instanceof CellError) {
    return n;
  }
  const serial = Math.floor(n);
  if (serial < 0) {
    return new CellError(CellErrorType.NUM, 'Date serial numbers cannot be negative');
  }
  if (serial === 0 && context.config.use1900LeapYearBug) {
    return { year: 1900, month: 1, day: 0 }; // Excel's "January 0, 1900"
  }
  return serialToDate(serial, context.config.use1900LeapYearBug);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Shifts a date by whole months clamping the day (Jan 31 + 1 month = Feb 28/29). */
function shiftMonths(date: SimpleDate, months: number): SimpleDate {
  const total = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12 + 1;
  return { year, month, day: Math.min(date.day, daysInMonth(year, month)) };
}

/** EDATE and EOMONTH differ only in which day of the shifted month they land on. */
function monthShifter(name: 'EDATE' | 'EOMONTH'): RegisteredFunction {
  return {
    metadata: { name, minArgs: 2, maxArgs: 2 },
    fn: (args: RawInterpreterValue[], context: EvaluationContext) => {
      const start = asDate(args[0]!, context);
      if (start instanceof CellError) {
        return start;
      }
      const monthsNum = asNumber(args[1]!);
      if (monthsNum instanceof CellError) {
        return monthsNum;
      }
      const shifted = shiftMonths(start, Math.trunc(monthsNum));
      if (name === 'EOMONTH') {
        shifted.day = daysInMonth(shifted.year, shifted.month);
      }
      const serial = dateToSerial(shifted, context.config.use1900LeapYearBug);
      return serial < 0
        ? new CellError(CellErrorType.NUM, `${name} result is before 1900-01-01`)
        : serial;
    },
  };
}

/** One date field (year/month/day) of a serial number. */
function dateField(name: string, pick: (date: SimpleDate) => number): RegisteredFunction {
  return {
    metadata: { name, minArgs: 1, maxArgs: 1 },
    fn: (args: RawInterpreterValue[], context: EvaluationContext) => {
      const date = asDate(args[0]!, context);
      return date instanceof CellError ? date : pick(date);
    },
  };
}

/** Monday-0 day-of-week index of a serial (serial 1 = Sunday = 6). */
function mondayIndex(serial: number): number {
  return (serial + 5) % 7;
}

const isWeekend = (serial: number): boolean => mondayIndex(serial) >= 5;

/** The optional holidays range of WORKDAY/NETWORKDAYS as a set of serials. */
function collectHolidays(arg: RawInterpreterValue | undefined): Set<number> | CellError {
  const holidays = new Set<number>();
  if (arg === undefined) {
    return holidays;
  }
  for (const row of asMatrix(arg)) {
    for (const cell of row) {
      const value = asScalar(cell);
      if (value instanceof CellError) {
        return value;
      }
      if (typeof value === 'number') {
        holidays.add(Math.trunc(value));
      } else if (value !== EmptyValue) {
        return new CellError(CellErrorType.VALUE, 'Holidays must be dates');
      }
    }
  }
  return holidays;
}

/** One time-of-day field (hour/minute/second) of a serial number's fraction. */
function timeField(name: string, pick: (time: SimpleTime) => number): RegisteredFunction {
  return {
    metadata: { name, minArgs: 1, maxArgs: 1 },
    fn: (args: RawInterpreterValue[]) => {
      const n = asNumber(args[0]!);
      if (n instanceof CellError) {
        return n;
      }
      if (n < 0) {
        return new CellError(CellErrorType.NUM, `${name} serial cannot be negative`);
      }
      return pick(fractionToTime(n));
    },
  };
}

export const datetimeFunctions: RegisteredFunction[] = [
  {
    metadata: { name: 'TODAY', minArgs: 0, maxArgs: 0, volatile: true },
    fn: (_args: RawInterpreterValue[], context: EvaluationContext) => todaySerial(context),
  },
  {
    metadata: { name: 'NOW', minArgs: 0, maxArgs: 0, volatile: true },
    fn: (_args: RawInterpreterValue[], context: EvaluationContext) => {
      const now = new Date();
      return (
        todaySerial(context) +
        timeToFraction({
          hours: now.getHours(),
          minutes: now.getMinutes(),
          seconds: now.getSeconds(),
        })
      );
    },
  },
  {
    metadata: { name: 'DATE', minArgs: 3, maxArgs: 3 },
    fn: (args: RawInterpreterValue[], context: EvaluationContext) => {
      const yearNum = asNumber(args[0]!);
      if (yearNum instanceof CellError) {
        return yearNum;
      }
      const monthNum = asNumber(args[1]!);
      if (monthNum instanceof CellError) {
        return monthNum;
      }
      const dayNum = asNumber(args[2]!);
      if (dayNum instanceof CellError) {
        return dayNum;
      }
      let year = Math.trunc(yearNum);
      if (year < 0 || year > 9999) {
        return new CellError(CellErrorType.NUM, 'DATE year must be between 0 and 9999');
      }
      if (year < 1900) {
        year += 1900; // Excel: years 0-1899 are offsets from 1900
      }
      // Month and day overflow/underflow normalize (=DATE(2008,14,1) is 2009-02-01).
      const totalMonths = year * 12 + (Math.trunc(monthNum) - 1);
      const normalizedYear = Math.floor(totalMonths / 12);
      const normalizedMonth = ((totalMonths % 12) + 12) % 12 + 1;
      const serial =
        dateToSerial(
          { year: normalizedYear, month: normalizedMonth, day: 1 },
          context.config.use1900LeapYearBug,
        ) +
        (Math.trunc(dayNum) - 1);
      return serial < 1
        ? new CellError(CellErrorType.NUM, 'DATE is before 1900-01-01')
        : serial;
    },
  },
  dateField('YEAR', (date) => date.year),
  dateField('MONTH', (date) => date.month),
  dateField('DAY', (date) => date.day),
  timeField('HOUR', (time) => time.hours),
  timeField('MINUTE', (time) => time.minutes),
  timeField('SECOND', (time) => time.seconds),
  {
    metadata: { name: 'TIME', minArgs: 3, maxArgs: 3 },
    fn: (args: RawInterpreterValue[]) => {
      const parts: number[] = [];
      for (const arg of args) {
        const n = asNumber(arg);
        if (n instanceof CellError) {
          return n;
        }
        parts.push(Math.trunc(n));
      }
      // Components normalize (TIME(1,90,0) = 2:30) and wrap past midnight.
      const totalSeconds = parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
      if (totalSeconds < 0) {
        return new CellError(CellErrorType.NUM, 'TIME is before midnight');
      }
      return (totalSeconds % 86400) / 86400;
    },
  },
  {
    metadata: { name: 'WEEKDAY', minArgs: 1, maxArgs: 2 },
    fn: (args: RawInterpreterValue[]) => {
      const serialNum = asNumber(args[0]!);
      if (serialNum instanceof CellError) {
        return serialNum;
      }
      const serial = Math.floor(serialNum);
      if (serial < 0) {
        return new CellError(CellErrorType.NUM, 'WEEKDAY serial cannot be negative');
      }
      let type = 1;
      if (args.length > 1) {
        const typeNum = asNumber(args[1]!);
        if (typeNum instanceof CellError) {
          return typeNum;
        }
        type = Math.trunc(typeNum);
      }
      // Serial 1 is a Sunday in Excel's calendar (1900-01-01, leap bug included).
      if (type === 1) {
        const day = serial % 7;
        return day === 0 ? 7 : day;
      }
      if (type === 2) {
        return ((serial + 5) % 7) + 1;
      }
      if (type === 3) {
        return (serial + 5) % 7;
      }
      if (type >= 11 && type <= 17) {
        // 11..17 start the week on Monday..Sunday.
        return ((serial + 5 - (type - 11) + 7) % 7) + 1;
      }
      return new CellError(CellErrorType.NUM, `Unknown WEEKDAY type ${type}`);
    },
  },
  monthShifter('EDATE'),
  monthShifter('EOMONTH'),
  {
    metadata: { name: 'DAYS', minArgs: 2, maxArgs: 2 },
    fn: (args: RawInterpreterValue[]) => {
      const end = asNumber(args[0]!);
      if (end instanceof CellError) {
        return end;
      }
      const start = asNumber(args[1]!);
      return start instanceof CellError ? start : Math.trunc(end) - Math.trunc(start);
    },
  },
  {
    metadata: { name: 'DAYS360', minArgs: 2, maxArgs: 3 },
    fn: (args: RawInterpreterValue[], context: EvaluationContext) => {
      const startNum = asNumber(args[0]!);
      if (startNum instanceof CellError) {
        return startNum;
      }
      const endNum = asNumber(args[1]!);
      if (endNum instanceof CellError) {
        return endNum;
      }
      let european = false;
      if (args[2] !== undefined) {
        const flag = asNumber(args[2]);
        if (flag instanceof CellError) {
          return flag;
        }
        european = flag !== 0;
      }
      const bug = context.config.use1900LeapYearBug;
      const start = serialToDate(Math.floor(startNum), bug);
      const end = serialToDate(Math.floor(endNum), bug);
      let startDay = start.day;
      let endDay = end.day;
      let endMonthShift = 0;
      if (european) {
        startDay = Math.min(startDay, 30);
        endDay = Math.min(endDay, 30);
      } else {
        // US/NASD method.
        if (startDay === daysInMonth(start.year, start.month)) {
          startDay = 30;
        }
        if (endDay === 31) {
          if (startDay < 30) {
            endDay = 1;
            endMonthShift = 1;
          } else {
            endDay = 30;
          }
        }
      }
      return (
        (end.year - start.year) * 360 +
        (end.month + endMonthShift - start.month) * 30 +
        (endDay - startDay)
      );
    },
  },
  {
    metadata: { name: 'WEEKNUM', minArgs: 1, maxArgs: 2 },
    fn: (args: RawInterpreterValue[], context: EvaluationContext) => {
      const serialNum = asNumber(args[0]!);
      if (serialNum instanceof CellError) {
        return serialNum;
      }
      const serial = Math.floor(serialNum);
      if (serial < 0) {
        return new CellError(CellErrorType.NUM, 'WEEKNUM serial cannot be negative');
      }
      let type = 1;
      if (args.length > 1) {
        const typeNum = asNumber(args[1]!);
        if (typeNum instanceof CellError) {
          return typeNum;
        }
        type = Math.trunc(typeNum);
      }
      const bug = context.config.use1900LeapYearBug;
      if (type === 21) {
        // ISO 8601: the week containing the first Thursday is week 1.
        const thursday = serial - mondayIndex(serial) + 3;
        const yearStart = dateToSerial({ year: serialToDate(thursday, bug).year, month: 1, day: 1 }, bug);
        return Math.floor((thursday - yearStart) / 7) + 1;
      }
      // System 1: the week containing January 1 is week 1.
      let weekStartMonday: number; // 0 = Monday ... 6 = Sunday
      if (type === 1) {
        weekStartMonday = 6;
      } else if (type === 2) {
        weekStartMonday = 0;
      } else if (type >= 11 && type <= 17) {
        weekStartMonday = type - 11;
      } else {
        return new CellError(CellErrorType.NUM, `Unknown WEEKNUM type ${type}`);
      }
      const january1 = dateToSerial({ year: serialToDate(serial, bug).year, month: 1, day: 1 }, bug);
      const daysBeforeJanuary1 = (mondayIndex(january1) - weekStartMonday + 7) % 7;
      return Math.floor((serial - january1 + daysBeforeJanuary1) / 7) + 1;
    },
  },
  {
    metadata: { name: 'WORKDAY', minArgs: 2, maxArgs: 3, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      const startNum = asNumber(args[0]!);
      if (startNum instanceof CellError) {
        return startNum;
      }
      const daysNum = asNumber(args[1]!);
      if (daysNum instanceof CellError) {
        return daysNum;
      }
      const holidays = collectHolidays(args[2]);
      if (holidays instanceof CellError) {
        return holidays;
      }
      let current = Math.trunc(startNum);
      let remaining = Math.trunc(daysNum);
      const step = remaining >= 0 ? 1 : -1;
      while (remaining !== 0) {
        current += step;
        if (current < 0) {
          return new CellError(CellErrorType.NUM, 'WORKDAY went before 1900-01-01');
        }
        if (!isWeekend(current) && !holidays.has(current)) {
          remaining -= step;
        }
      }
      return current;
    },
  },
  {
    metadata: { name: 'NETWORKDAYS', minArgs: 2, maxArgs: 3, argHandling: 'range-aware' },
    fn: (args: RawInterpreterValue[]) => {
      const startNum = asNumber(args[0]!);
      if (startNum instanceof CellError) {
        return startNum;
      }
      const endNum = asNumber(args[1]!);
      if (endNum instanceof CellError) {
        return endNum;
      }
      const holidays = collectHolidays(args[2]);
      if (holidays instanceof CellError) {
        return holidays;
      }
      const start = Math.trunc(startNum);
      const end = Math.trunc(endNum);
      // Both endpoints count; a reversed interval counts negative, like Excel.
      const sign = start <= end ? 1 : -1;
      const [from, to] = start <= end ? [start, end] : [end, start];
      let count = 0;
      for (let serial = from; serial <= to; serial++) {
        if (!isWeekend(serial) && !holidays.has(serial)) {
          count++;
        }
      }
      return sign * count;
    },
  },
  {
    metadata: { name: 'YEARFRAC', minArgs: 2, maxArgs: 3 },
    fn: (args: RawInterpreterValue[], context: EvaluationContext) => {
      const aNum = asNumber(args[0]!);
      if (aNum instanceof CellError) {
        return aNum;
      }
      const bNum = asNumber(args[1]!);
      if (bNum instanceof CellError) {
        return bNum;
      }
      let basis = 0;
      if (args[2] !== undefined) {
        const basisNum = asNumber(args[2]);
        if (basisNum instanceof CellError) {
          return basisNum;
        }
        basis = Math.trunc(basisNum);
      }
      if (basis < 0 || basis > 4) {
        return new CellError(CellErrorType.NUM, 'YEARFRAC basis must be between 0 and 4');
      }
      // Excel returns the positive fraction regardless of argument order.
      const startSerial = Math.min(Math.floor(aNum), Math.floor(bNum));
      const endSerial = Math.max(Math.floor(aNum), Math.floor(bNum));
      if (startSerial < 0) {
        return new CellError(CellErrorType.NUM, 'YEARFRAC serials cannot be negative');
      }
      const bug = context.config.use1900LeapYearBug;
      const start = serialToDate(startSerial, bug);
      const end = serialToDate(endSerial, bug);
      if (basis === 0 || basis === 4) {
        let startDay = start.day;
        let endDay = end.day;
        if (basis === 4) {
          // European 30/360.
          startDay = Math.min(startDay, 30);
          endDay = Math.min(endDay, 30);
        } else {
          // US (NASD) 30/360.
          if (startDay === 31) {
            startDay = 30;
          }
          if (endDay === 31 && startDay === 30) {
            endDay = 30;
          }
        }
        const days =
          (end.year - start.year) * 360 + (end.month - start.month) * 30 + (endDay - startDay);
        return days / 360;
      }
      if (basis === 2) {
        return (endSerial - startSerial) / 360;
      }
      if (basis === 3) {
        return (endSerial - startSerial) / 365;
      }
      // Basis 1, actual/actual, with Excel's denominator rules.
      const isLeap = (year: number): boolean =>
        (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
      const spansOverOneYear =
        end.year > start.year &&
        !(
          end.year === start.year + 1 &&
          (end.month < start.month || (end.month === start.month && end.day <= start.day))
        );
      let denominator: number;
      if (spansOverOneYear) {
        // Average length of every calendar year touched.
        const yearCount = end.year - start.year + 1;
        denominator =
          (dateToSerial({ year: end.year + 1, month: 1, day: 1 }, bug) -
            dateToSerial({ year: start.year, month: 1, day: 1 }, bug)) /
          yearCount;
      } else if (start.year === end.year) {
        denominator = isLeap(start.year) ? 366 : 365;
      } else {
        denominator = 365;
        for (const year of [start.year, end.year]) {
          if (isLeap(year)) {
            const feb29 = dateToSerial({ year, month: 2, day: 29 }, bug);
            if (startSerial <= feb29 && feb29 <= endSerial) {
              denominator = 366;
            }
          }
        }
      }
      return (endSerial - startSerial) / denominator;
    },
  },
  {
    metadata: { name: 'DATEDIF', minArgs: 3, maxArgs: 3 },
    fn: (args: RawInterpreterValue[], context: EvaluationContext) => {
      const startNum = asNumber(args[0]!);
      if (startNum instanceof CellError) {
        return startNum;
      }
      const endNum = asNumber(args[1]!);
      if (endNum instanceof CellError) {
        return endNum;
      }
      const unit = asString(args[2]!);
      if (unit instanceof CellError) {
        return unit;
      }
      const startSerial = Math.floor(startNum);
      const endSerial = Math.floor(endNum);
      if (startSerial < 0 || endSerial < 0 || startSerial > endSerial) {
        return new CellError(CellErrorType.NUM, 'DATEDIF start must not be after end');
      }
      const bug = context.config.use1900LeapYearBug;
      const start = serialToDate(startSerial, bug);
      const end = serialToDate(endSerial, bug);
      const dayBorrow = end.day < start.day ? 1 : 0;
      switch (unit.toUpperCase()) {
        case 'D':
          return endSerial - startSerial;
        case 'M':
          return (end.year - start.year) * 12 + (end.month - start.month) - dayBorrow;
        case 'Y': {
          const beforeAnniversary =
            end.month < start.month || (end.month === start.month && dayBorrow === 1);
          return end.year - start.year - (beforeAnniversary ? 1 : 0);
        }
        case 'YM': {
          const months = (end.month - start.month) - dayBorrow;
          return months < 0 ? months + 12 : months;
        }
        case 'MD': {
          if (dayBorrow === 0) {
            return end.day - start.day;
          }
          // Borrow the length of the month before the end date, like Excel.
          return end.day - start.day + daysInMonth(end.year, end.month - 1);
        }
        case 'YD': {
          // Distance from the start's last anniversary on or before the end.
          const sameYear = { ...start, year: end.year };
          const anniversaryYear =
            dateToSerial(sameYear, bug) <= endSerial ? end.year : end.year - 1;
          return endSerial - dateToSerial({ ...start, year: anniversaryYear }, bug);
        }
        default:
          return new CellError(CellErrorType.NUM, `Unknown DATEDIF unit "${unit}"`);
      }
    },
  },
];
