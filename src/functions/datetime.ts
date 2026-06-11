/** Date & time functions: TODAY/NOW, DATE/TIME, date and time fields, WEEKDAY, EDATE/EOMONTH, DATEDIF. */

import { dateToSerial, fractionToTime, serialToDate, timeToFraction, type SimpleDate, type SimpleTime } from '../value/dates';
import { CellError, CellErrorType, type RawInterpreterValue } from '../value/types';
import type { EvaluationContext } from '../evaluator/context';
import { asNumber, asString } from './helpers';
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
