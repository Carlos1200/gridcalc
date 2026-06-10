/**
 * Excel date system: dates are serial numbers counted from the 1899-12-30
 * epoch, where serial 1 = 1900-01-01 and the fractional part is time of day.
 *
 * Excel historically treats 1900 as a leap year (it was not), so it has a
 * phantom 1900-02-29 at serial 60 and every real date from 1900-03-01 onward
 * is shifted by one. We replicate that bug by default for compatibility
 * (config `use1900LeapYearBug`); when reading serial 60 back we return
 * 1900-02-28, since the phantom date does not exist.
 *
 * All math is done in UTC to keep results independent of the host timezone.
 */

export interface SimpleDate {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
}

export interface SimpleTime {
  hours: number;
  minutes: number;
  seconds: number;
}

const MS_PER_DAY = 86_400_000;
const SECONDS_PER_DAY = 86_400;

/** Serial 1 = 1900-01-01, so day 0 of the (bug-free) count is 1899-12-31. */
const EPOCH_UTC = Date.UTC(1899, 11, 31);

/** First serial affected by the phantom 1900-02-29 (Excel's 1900-03-01). */
const LEAP_BUG_FIRST_SHIFTED_SERIAL = 61;

export function dateToSerial(date: SimpleDate, use1900LeapYearBug = true): number {
  const days = Math.round((Date.UTC(date.year, date.month - 1, date.day) - EPOCH_UTC) / MS_PER_DAY);
  if (use1900LeapYearBug && days >= LEAP_BUG_FIRST_SHIFTED_SERIAL - 1) {
    return days + 1;
  }
  return days;
}

export function serialToDate(serial: number, use1900LeapYearBug = true): SimpleDate {
  let days = Math.floor(serial);
  if (use1900LeapYearBug && days >= LEAP_BUG_FIRST_SHIFTED_SERIAL - 1) {
    days -= 1;
  }
  const utc = new Date(EPOCH_UTC + days * MS_PER_DAY);
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

/** Time of day as the fractional part of a serial number. */
export function timeToFraction(time: SimpleTime): number {
  return (time.hours * 3600 + time.minutes * 60 + time.seconds) / SECONDS_PER_DAY;
}

export function fractionToTime(fraction: number): SimpleTime {
  const totalSeconds = Math.round((fraction - Math.floor(fraction)) * SECONDS_PER_DAY);
  return {
    hours: Math.floor(totalSeconds / 3600) % 24,
    minutes: Math.floor(totalSeconds / 60) % 60,
    seconds: totalSeconds % 60,
  };
}

export function isValidDate(date: SimpleDate): boolean {
  if (!Number.isInteger(date.year) || !Number.isInteger(date.month) || !Number.isInteger(date.day)) {
    return false;
  }
  if (date.month < 1 || date.month > 12 || date.day < 1) {
    return false;
  }
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day));
  return utc.getUTCMonth() === date.month - 1 && utc.getUTCDate() === date.day;
}
