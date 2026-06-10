import { describe, expect, it } from 'vitest';
import {
  dateToSerial,
  fractionToTime,
  isValidDate,
  serialToDate,
  timeToFraction,
} from '../../../src/index';

describe('dateToSerial (1900 leap-year bug enabled, Excel default)', () => {
  it('matches known Excel serials', () => {
    expect(dateToSerial({ year: 1900, month: 1, day: 1 })).toBe(1);
    expect(dateToSerial({ year: 1900, month: 2, day: 28 })).toBe(59);
    // 1900-03-01 is 61 because Excel inserts the phantom 1900-02-29 at 60.
    expect(dateToSerial({ year: 1900, month: 3, day: 1 })).toBe(61);
    expect(dateToSerial({ year: 2008, month: 1, day: 1 })).toBe(39448);
    expect(dateToSerial({ year: 1999, month: 12, day: 31 })).toBe(36525);
  });
});

describe('dateToSerial (bug disabled)', () => {
  it('uses the real calendar', () => {
    expect(dateToSerial({ year: 1900, month: 1, day: 1 }, false)).toBe(1);
    expect(dateToSerial({ year: 1900, month: 3, day: 1 }, false)).toBe(60);
    expect(dateToSerial({ year: 2008, month: 1, day: 1 }, false)).toBe(39447);
  });
});

describe('serialToDate', () => {
  it('round-trips with dateToSerial', () => {
    const dates = [
      { year: 1900, month: 1, day: 1 },
      { year: 1900, month: 2, day: 28 },
      { year: 1900, month: 3, day: 1 },
      { year: 2000, month: 2, day: 29 },
      { year: 2026, month: 6, day: 9 },
    ];
    for (const date of dates) {
      expect(serialToDate(dateToSerial(date))).toEqual(date);
      expect(serialToDate(dateToSerial(date, false), false)).toEqual(date);
    }
  });

  it('maps the phantom serial 60 to 1900-02-28', () => {
    expect(serialToDate(60)).toEqual({ year: 1900, month: 2, day: 28 });
  });

  it('ignores the time fraction', () => {
    expect(serialToDate(39448.75)).toEqual({ year: 2008, month: 1, day: 1 });
  });
});

describe('time fractions', () => {
  it('converts time of day to a day fraction and back', () => {
    expect(timeToFraction({ hours: 12, minutes: 0, seconds: 0 })).toBe(0.5);
    expect(timeToFraction({ hours: 6, minutes: 0, seconds: 0 })).toBe(0.25);
    expect(fractionToTime(0.75)).toEqual({ hours: 18, minutes: 0, seconds: 0 });
    expect(fractionToTime(39448.5)).toEqual({ hours: 12, minutes: 0, seconds: 0 });
  });
});

describe('isValidDate', () => {
  it('accepts real dates and rejects impossible ones', () => {
    expect(isValidDate({ year: 2024, month: 2, day: 29 })).toBe(true);
    expect(isValidDate({ year: 2023, month: 2, day: 29 })).toBe(false);
    expect(isValidDate({ year: 1900, month: 2, day: 29 })).toBe(false); // the bug is ours to emulate, not the calendar's
    expect(isValidDate({ year: 2024, month: 13, day: 1 })).toBe(false);
    expect(isValidDate({ year: 2024, month: 4, day: 31 })).toBe(false);
  });
});
