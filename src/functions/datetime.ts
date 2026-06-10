/** Date & time functions: TODAY, NOW, DATE. */

import { dateToSerial, timeToFraction } from '../value/dates';
import { CellError, CellErrorType, type RawInterpreterValue } from '../value/types';
import type { EvaluationContext } from '../evaluator/context';
import { asNumber } from './helpers';
import type { RegisteredFunction } from './types';

function todaySerial(context: EvaluationContext): number {
  const now = new Date();
  return dateToSerial(
    { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() },
    context.config.use1900LeapYearBug,
  );
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
];
