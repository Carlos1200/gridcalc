/**
 * Human-readable documentation for every registered function, keyed by the
 * canonical English name. Kept separate from the implementations because most
 * functions are produced by factory helpers (numeric1, comparator, ...), so
 * there is no single call site to hang prose on. The site generator merges
 * this catalog into functions.json the same way it merges the i18n names, and
 * warns about any registered function missing an entry here.
 *
 * Authoring rules:
 * - `summary`: one sentence, present tense, what the function returns.
 * - `params`: in signature order; mark trailing optionals with `optional: true`.
 * - `returns`: the type/shape of the result, error conditions worth knowing.
 * - `example`: a self-contained formula the site can evaluate live with the
 *   real engine. Prefer array literals ({1,2,3}) over cell ranges so the
 *   example needs no surrounding sheet. When the result is an array, a
 *   reference, or otherwise not meaningful as a single live value, set
 *   `result` to describe it and the site shows that instead of evaluating.
 */

export interface FunctionParamDoc {
  name: string;
  optional?: boolean;
  description: string;
}

export interface FunctionDocEntry {
  summary: string;
  params: FunctionParamDoc[];
  returns: string;
  example: string;
  /** Override shown instead of live-evaluating (arrays, references, volatiles). */
  result?: string;
}

export const FUNCTION_DOCS: Record<string, FunctionDocEntry> = {
  /* ── math ─────────────────────────────────────────────────────────── */
  SUM: {
    summary: 'Adds all of its numeric arguments and the numbers inside any ranges.',
    params: [{ name: 'number1, number2, …', description: 'Numbers, ranges, or arrays to add. Text and blanks are ignored.' }],
    returns: 'The total as a number. Propagates any error found in the inputs.',
    example: '=SUM(10, 20, {3, 4})',
  },
  ROUND: {
    summary: 'Rounds a number to a given number of digits, half away from zero.',
    params: [
      { name: 'number', description: 'The value to round.' },
      { name: 'num_digits', description: 'Digits to keep. Negative rounds to the left of the decimal point.' },
    ],
    returns: 'The rounded number.',
    example: '=ROUND(2.555, 2)',
  },
  ROUNDUP: {
    summary: 'Rounds a number away from zero to a given number of digits.',
    params: [
      { name: 'number', description: 'The value to round.' },
      { name: 'num_digits', description: 'Digits to keep. Negative rounds to the left of the decimal point.' },
    ],
    returns: 'The rounded-up number.',
    example: '=ROUNDUP(2.111, 2)',
  },
  ROUNDDOWN: {
    summary: 'Rounds a number toward zero to a given number of digits.',
    params: [
      { name: 'number', description: 'The value to round.' },
      { name: 'num_digits', description: 'Digits to keep. Negative rounds to the left of the decimal point.' },
    ],
    returns: 'The rounded-down number.',
    example: '=ROUNDDOWN(2.999, 2)',
  },
  ABS: {
    summary: 'Returns the absolute value of a number.',
    params: [{ name: 'number', description: 'The number whose sign is dropped.' }],
    returns: 'A non-negative number.',
    example: '=ABS(-42)',
  },
  SQRT: {
    summary: 'Returns the positive square root of a number.',
    params: [{ name: 'number', description: 'A non-negative number. Negative input yields #NUM!.' }],
    returns: 'The square root, or #NUM! for negatives.',
    example: '=SQRT(144)',
  },
  POWER: {
    summary: 'Raises a number to a power.',
    params: [
      { name: 'number', description: 'The base.' },
      { name: 'power', description: 'The exponent.' },
    ],
    returns: 'number raised to power.',
    example: '=POWER(2, 10)',
  },
  MOD: {
    summary: 'Returns the remainder after division, with the sign of the divisor.',
    params: [
      { name: 'number', description: 'The dividend.' },
      { name: 'divisor', description: 'The divisor. Zero yields #DIV/0!.' },
    ],
    returns: 'The remainder.',
    example: '=MOD(-3, 5)',
  },
  INT: {
    summary: 'Rounds a number down to the nearest integer.',
    params: [{ name: 'number', description: 'The value to floor.' }],
    returns: 'The largest integer ≤ number.',
    example: '=INT(-2.5)',
  },
  PRODUCT: {
    summary: 'Multiplies all of its numeric arguments together.',
    params: [{ name: 'number1, number2, …', description: 'Numbers, ranges, or arrays to multiply.' }],
    returns: 'The product as a number.',
    example: '=PRODUCT(2, 3, 4)',
  },
  CEILING: {
    summary: 'Rounds a number up to the nearest multiple of significance.',
    params: [
      { name: 'number', description: 'The value to round.' },
      { name: 'significance', description: 'The multiple to round to.' },
    ],
    returns: 'The rounded-up multiple.',
    example: '=CEILING(23, 5)',
  },
  FLOOR: {
    summary: 'Rounds a number down to the nearest multiple of significance.',
    params: [
      { name: 'number', description: 'The value to round.' },
      { name: 'significance', description: 'The multiple to round to.' },
    ],
    returns: 'The rounded-down multiple.',
    example: '=FLOOR(23, 5)',
  },
  TRUNC: {
    summary: 'Truncates a number toward zero, optionally keeping decimals.',
    params: [
      { name: 'number', description: 'The value to truncate.' },
      { name: 'num_digits', optional: true, description: 'Decimals to keep. Defaults to 0.' },
    ],
    returns: 'The truncated number.',
    example: '=TRUNC(3.14159, 2)',
  },
  SIGN: {
    summary: 'Returns the sign of a number: 1, 0, or -1.',
    params: [{ name: 'number', description: 'The value to test.' }],
    returns: '1 if positive, -1 if negative, 0 if zero.',
    example: '=SIGN(-8)',
  },
  EXP: {
    summary: 'Returns e raised to a power.',
    params: [{ name: 'number', description: 'The exponent applied to e.' }],
    returns: 'e^number.',
    example: '=EXP(1)',
  },
  LN: {
    summary: 'Returns the natural logarithm (base e) of a number.',
    params: [{ name: 'number', description: 'A positive number.' }],
    returns: 'ln(number), or #NUM! for non-positive input.',
    example: '=LN(EXP(3))',
  },
  LOG10: {
    summary: 'Returns the base-10 logarithm of a number.',
    params: [{ name: 'number', description: 'A positive number.' }],
    returns: 'log₁₀(number).',
    example: '=LOG10(1000)',
  },
  LOG: {
    summary: 'Returns the logarithm of a number in a given base.',
    params: [
      { name: 'number', description: 'A positive number.' },
      { name: 'base', optional: true, description: 'The logarithm base. Defaults to 10.' },
    ],
    returns: 'log_base(number).',
    example: '=LOG(8, 2)',
  },
  PI: {
    summary: 'Returns the constant π to 15 digits.',
    params: [],
    returns: 'The number 3.14159265358979.',
    example: '=PI()',
  },
  EVEN: {
    summary: 'Rounds a number up, away from zero, to the nearest even integer.',
    params: [{ name: 'number', description: 'The value to round.' }],
    returns: 'The nearest even integer away from zero.',
    example: '=EVEN(3)',
  },
  ODD: {
    summary: 'Rounds a number up, away from zero, to the nearest odd integer.',
    params: [{ name: 'number', description: 'The value to round.' }],
    returns: 'The nearest odd integer away from zero.',
    example: '=ODD(2)',
  },
  SUMPRODUCT: {
    summary: 'Multiplies corresponding elements of arrays and sums the products.',
    params: [{ name: 'array1, array2, …', description: 'Arrays or ranges of equal shape.' }],
    returns: 'The sum of the elementwise products.',
    example: '=SUMPRODUCT({1,2,3}, {4,5,6})',
  },
  SIN: {
    summary: 'Returns the sine of an angle given in radians.',
    params: [{ name: 'number', description: 'The angle in radians.' }],
    returns: 'The sine, between -1 and 1.',
    example: '=SIN(PI()/2)',
  },
  COS: {
    summary: 'Returns the cosine of an angle given in radians.',
    params: [{ name: 'number', description: 'The angle in radians.' }],
    returns: 'The cosine, between -1 and 1.',
    example: '=COS(0)',
  },
  TAN: {
    summary: 'Returns the tangent of an angle given in radians.',
    params: [{ name: 'number', description: 'The angle in radians.' }],
    returns: 'The tangent of the angle.',
    example: '=TAN(0)',
  },
  ASIN: {
    summary: 'Returns the arcsine (inverse sine) of a number, in radians.',
    params: [{ name: 'number', description: 'A value between -1 and 1.' }],
    returns: 'The angle in radians between -π/2 and π/2.',
    example: '=ASIN(1)',
  },
  ACOS: {
    summary: 'Returns the arccosine (inverse cosine) of a number, in radians.',
    params: [{ name: 'number', description: 'A value between -1 and 1.' }],
    returns: 'The angle in radians between 0 and π.',
    example: '=ACOS(1)',
  },
  ATAN: {
    summary: 'Returns the arctangent (inverse tangent) of a number, in radians.',
    params: [{ name: 'number', description: 'Any number.' }],
    returns: 'The angle in radians between -π/2 and π/2.',
    example: '=ATAN(1)',
  },
  ATAN2: {
    summary: 'Returns the angle of the point (x, y) from the positive x-axis.',
    params: [
      { name: 'x_num', description: 'The x coordinate.' },
      { name: 'y_num', description: 'The y coordinate.' },
    ],
    returns: 'The angle in radians between -π and π.',
    example: '=ATAN2(1, 1)',
  },
  RADIANS: {
    summary: 'Converts degrees to radians.',
    params: [{ name: 'angle', description: 'The angle in degrees.' }],
    returns: 'The angle in radians.',
    example: '=RADIANS(180)',
  },
  DEGREES: {
    summary: 'Converts radians to degrees.',
    params: [{ name: 'angle', description: 'The angle in radians.' }],
    returns: 'The angle in degrees.',
    example: '=DEGREES(PI())',
  },
  SQRTPI: {
    summary: 'Returns the square root of a number multiplied by π.',
    params: [{ name: 'number', description: 'A non-negative number.' }],
    returns: 'sqrt(number × π).',
    example: '=SQRTPI(1)',
  },
  FACT: {
    summary: 'Returns the factorial of a number.',
    params: [{ name: 'number', description: 'A non-negative integer; the decimal part is truncated.' }],
    returns: 'number! (1×2×…×number).',
    example: '=FACT(5)',
  },
  COMBIN: {
    summary: 'Returns the number of combinations of items taken k at a time.',
    params: [
      { name: 'number', description: 'Total number of items.' },
      { name: 'number_chosen', description: 'Number of items in each combination.' },
    ],
    returns: 'The binomial coefficient C(n, k).',
    example: '=COMBIN(49, 6)',
  },
  GCD: {
    summary: 'Returns the greatest common divisor of the integers given.',
    params: [{ name: 'number1, number2, …', description: 'Non-negative integers (decimals truncated).' }],
    returns: 'The largest integer that divides them all.',
    example: '=GCD(24, 36)',
  },
  LCM: {
    summary: 'Returns the least common multiple of the integers given.',
    params: [{ name: 'number1, number2, …', description: 'Non-negative integers (decimals truncated).' }],
    returns: 'The smallest integer that is a multiple of them all.',
    example: '=LCM(4, 6)',
  },
  ROMAN: {
    summary: 'Converts an Arabic number to a Roman-numeral string.',
    params: [
      { name: 'number', description: 'An integer between 1 and 3999.' },
      { name: 'form', optional: true, description: 'Style 0–4. Only the classic form (0) is supported.' },
    ],
    returns: 'The Roman numeral as text.',
    example: '=ROMAN(2024)',
  },
  SINH: {
    summary: 'Returns the hyperbolic sine of a number.',
    params: [{ name: 'number', description: 'Any number.' }],
    returns: 'The hyperbolic sine.',
    example: '=SINH(0)',
  },
  COSH: {
    summary: 'Returns the hyperbolic cosine of a number.',
    params: [{ name: 'number', description: 'Any number.' }],
    returns: 'The hyperbolic cosine (≥ 1).',
    example: '=COSH(0)',
  },
  TANH: {
    summary: 'Returns the hyperbolic tangent of a number.',
    params: [{ name: 'number', description: 'Any number.' }],
    returns: 'The hyperbolic tangent, between -1 and 1.',
    example: '=TANH(0)',
  },
  ASINH: {
    summary: 'Returns the inverse hyperbolic sine of a number.',
    params: [{ name: 'number', description: 'Any number.' }],
    returns: 'The inverse hyperbolic sine.',
    example: '=ASINH(0)',
  },
  ACOSH: {
    summary: 'Returns the inverse hyperbolic cosine of a number.',
    params: [{ name: 'number', description: 'A number ≥ 1.' }],
    returns: 'The inverse hyperbolic cosine.',
    example: '=ACOSH(1)',
  },
  ATANH: {
    summary: 'Returns the inverse hyperbolic tangent of a number.',
    params: [{ name: 'number', description: 'A number strictly between -1 and 1.' }],
    returns: 'The inverse hyperbolic tangent.',
    example: '=ATANH(0)',
  },
  MROUND: {
    summary: 'Rounds a number to the nearest multiple of significance.',
    params: [
      { name: 'number', description: 'The value to round.' },
      { name: 'multiple', description: 'The multiple to round to; must share the sign of number.' },
    ],
    returns: 'The nearest multiple.',
    example: '=MROUND(10, 3)',
  },
  SUMSQ: {
    summary: 'Returns the sum of the squares of its arguments.',
    params: [{ name: 'number1, number2, …', description: 'Numbers, ranges, or arrays.' }],
    returns: 'The sum of each value squared.',
    example: '=SUMSQ(3, 4)',
  },
  BASE: {
    summary: 'Converts a number to a text representation in the given radix.',
    params: [
      { name: 'number', description: 'A non-negative integer to convert.' },
      { name: 'radix', description: 'The target base, 2–36.' },
      { name: 'min_length', optional: true, description: 'Minimum length, zero-padded on the left.' },
    ],
    returns: 'The number as text in the requested base.',
    example: '=BASE(255, 16)',
  },
  DECIMAL: {
    summary: 'Converts a text representation in a given radix back to a number.',
    params: [
      { name: 'text', description: 'The digits to parse.' },
      { name: 'radix', description: 'The base of the text, 2–36.' },
    ],
    returns: 'The decimal value.',
    example: '=DECIMAL("FF", 16)',
  },
  BITAND: {
    summary: 'Returns the bitwise AND of two non-negative integers.',
    params: [
      { name: 'number1', description: 'A non-negative integer below 2^48.' },
      { name: 'number2', description: 'A non-negative integer below 2^48.' },
    ],
    returns: 'The bitwise AND.',
    example: '=BITAND(12, 10)',
  },
  BITOR: {
    summary: 'Returns the bitwise OR of two non-negative integers.',
    params: [
      { name: 'number1', description: 'A non-negative integer below 2^48.' },
      { name: 'number2', description: 'A non-negative integer below 2^48.' },
    ],
    returns: 'The bitwise OR.',
    example: '=BITOR(12, 10)',
  },
  BITXOR: {
    summary: 'Returns the bitwise exclusive OR of two non-negative integers.',
    params: [
      { name: 'number1', description: 'A non-negative integer below 2^48.' },
      { name: 'number2', description: 'A non-negative integer below 2^48.' },
    ],
    returns: 'The bitwise XOR.',
    example: '=BITXOR(12, 10)',
  },
  BITLSHIFT: {
    summary: 'Shifts the bits of a number left, doubling per position.',
    params: [
      { name: 'number', description: 'A non-negative integer below 2^48.' },
      { name: 'shift_amount', description: 'Positions to shift; negative shifts right.' },
    ],
    returns: 'The shifted integer.',
    example: '=BITLSHIFT(1, 4)',
  },
  BITRSHIFT: {
    summary: 'Shifts the bits of a number right, halving per position.',
    params: [
      { name: 'number', description: 'A non-negative integer below 2^48.' },
      { name: 'shift_amount', description: 'Positions to shift; negative shifts left.' },
    ],
    returns: 'The shifted integer.',
    example: '=BITRSHIFT(16, 4)',
  },
  DELTA: {
    summary: 'Tests whether two numbers are equal (Kronecker delta).',
    params: [
      { name: 'number1', description: 'The first value.' },
      { name: 'number2', optional: true, description: 'The second value. Defaults to 0.' },
    ],
    returns: '1 if the numbers are equal, otherwise 0.',
    example: '=DELTA(5, 5)',
  },
  GESTEP: {
    summary: 'Tests whether a number is greater than or equal to a step.',
    params: [
      { name: 'number', description: 'The value to test.' },
      { name: 'step', optional: true, description: 'The threshold. Defaults to 0.' },
    ],
    returns: '1 if number ≥ step, otherwise 0.',
    example: '=GESTEP(5, 4)',
  },
  ARABIC: {
    summary: 'Converts a Roman-numeral string to an Arabic number.',
    params: [{ name: 'text', description: 'The Roman numeral to convert.' }],
    returns: 'The numeric value.',
    example: '=ARABIC("MMXXIV")',
  },

  /* ── statistical ──────────────────────────────────────────────────── */
  AVERAGE: {
    summary: 'Returns the arithmetic mean of its numeric arguments.',
    params: [{ name: 'number1, number2, …', description: 'Numbers or ranges. Text and blanks are ignored.' }],
    returns: 'The mean, or #DIV/0! when there are no numbers.',
    example: '=AVERAGE({2, 4, 9})',
  },
  COUNT: {
    summary: 'Counts how many of the values are numbers.',
    params: [{ name: 'value1, value2, …', description: 'Values or ranges to inspect.' }],
    returns: 'The count of numeric values.',
    example: '=COUNT({1, "a", 3, TRUE})',
  },
  COUNTA: {
    summary: 'Counts how many of the values are not empty.',
    params: [{ name: 'value1, value2, …', description: 'Values or ranges to inspect.' }],
    returns: 'The count of non-blank values.',
    example: '=COUNTA({1, "a", "", 3})',
  },
  MIN: {
    summary: 'Returns the smallest number among its arguments.',
    params: [{ name: 'number1, number2, …', description: 'Numbers or ranges. Text and blanks are ignored.' }],
    returns: 'The minimum, or 0 when there are no numbers.',
    example: '=MIN({5, 2, 8})',
  },
  MAX: {
    summary: 'Returns the largest number among its arguments.',
    params: [{ name: 'number1, number2, …', description: 'Numbers or ranges. Text and blanks are ignored.' }],
    returns: 'The maximum, or 0 when there are no numbers.',
    example: '=MAX({5, 2, 8})',
  },
  SUMIF: {
    summary: 'Adds the cells in a range that meet a single criterion.',
    params: [
      { name: 'range', description: 'The cells tested against the criterion.' },
      { name: 'criteria', description: 'A value or condition such as ">10" or "apple".' },
      { name: 'sum_range', optional: true, description: 'Cells to add instead of range, aligned by position.' },
    ],
    returns: 'The conditional sum.',
    example: '=SUMIF({1,2,3,4}, ">2")',
  },
  COUNTIF: {
    summary: 'Counts the cells in a range that meet a single criterion.',
    params: [
      { name: 'range', description: 'The cells to test.' },
      { name: 'criteria', description: 'A value or condition such as ">=5" or "n*".' },
    ],
    returns: 'The number of matching cells.',
    example: '=COUNTIF({1,2,3,4}, ">2")',
  },
  AVERAGEIF: {
    summary: 'Averages the cells in a range that meet a single criterion.',
    params: [
      { name: 'range', description: 'The cells tested against the criterion.' },
      { name: 'criteria', description: 'A value or condition.' },
      { name: 'average_range', optional: true, description: 'Cells to average instead of range.' },
    ],
    returns: 'The conditional mean, or #DIV/0! if nothing matches.',
    example: '=AVERAGEIF({1,2,3,4}, ">2")',
  },
  COUNTIFS: {
    summary: 'Counts cells that meet all of several range/criteria pairs.',
    params: [
      { name: 'range1', description: 'First range to test.' },
      { name: 'criteria1', description: 'Condition applied to range1.' },
      { name: 'range2, criteria2, …', optional: true, description: 'Further range/criteria pairs, all combined with AND.' },
    ],
    returns: 'The count of rows matching every criterion.',
    example: '=COUNTIFS({1,2,3,4}, ">1", {5,6,7,8}, "<8")',
  },
  SUMIFS: {
    summary: 'Adds cells that meet all of several range/criteria pairs.',
    params: [
      { name: 'sum_range', description: 'The cells to add.' },
      { name: 'criteria_range1', description: 'First range to test.' },
      { name: 'criteria1', description: 'Condition applied to criteria_range1.' },
      { name: 'criteria_range2, criteria2, …', optional: true, description: 'Further range/criteria pairs, all combined with AND.' },
    ],
    returns: 'The conditional sum.',
    example: '=SUMIFS({10,20,30}, {1,2,3}, ">1")',
  },
  MEDIAN: {
    summary: 'Returns the median (middle value) of its numbers.',
    params: [{ name: 'number1, number2, …', description: 'Numbers or ranges.' }],
    returns: 'The middle value, or the mean of the two middle values.',
    example: '=MEDIAN({1, 2, 3, 10})',
  },
  MODE: {
    summary: 'Returns the most frequently occurring number.',
    params: [{ name: 'number1, number2, …', description: 'Numbers or ranges.' }],
    returns: 'The most common value, or #N/A if all are unique.',
    example: '=MODE({1, 2, 2, 3})',
  },
  VAR: {
    summary: 'Estimates variance based on a sample.',
    params: [{ name: 'number1, number2, …', description: 'The sample values.' }],
    returns: 'The sample variance (divides by n-1).',
    example: '=VAR({1, 2, 3, 4})',
  },
  STDEV: {
    summary: 'Estimates standard deviation based on a sample.',
    params: [{ name: 'number1, number2, …', description: 'The sample values.' }],
    returns: 'The sample standard deviation (divides by n-1).',
    example: '=STDEV({1, 2, 3, 4})',
  },
  LARGE: {
    summary: 'Returns the k-th largest value in a data set.',
    params: [
      { name: 'array', description: 'The data to rank.' },
      { name: 'k', description: 'The position from the top (1 = largest).' },
    ],
    returns: 'The k-th largest value.',
    example: '=LARGE({3, 1, 4, 1, 5}, 2)',
  },
  SMALL: {
    summary: 'Returns the k-th smallest value in a data set.',
    params: [
      { name: 'array', description: 'The data to rank.' },
      { name: 'k', description: 'The position from the bottom (1 = smallest).' },
    ],
    returns: 'The k-th smallest value.',
    example: '=SMALL({3, 1, 4, 1, 5}, 2)',
  },
  RANK: {
    summary: 'Returns the rank of a number within a list.',
    params: [
      { name: 'number', description: 'The value to rank.' },
      { name: 'ref', description: 'The list of numbers.' },
      { name: 'order', optional: true, description: '0 (default) ranks descending; non-zero ranks ascending.' },
    ],
    returns: 'The 1-based rank.',
    example: '=RANK(4, {1, 4, 2, 8})',
  },
  VARP: {
    summary: 'Calculates variance based on an entire population.',
    params: [{ name: 'number1, number2, …', description: 'The population values.' }],
    returns: 'The population variance (divides by n).',
    example: '=VARP({1, 2, 3, 4})',
  },
  STDEVP: {
    summary: 'Calculates standard deviation based on an entire population.',
    params: [{ name: 'number1, number2, …', description: 'The population values.' }],
    returns: 'The population standard deviation (divides by n).',
    example: '=STDEVP({1, 2, 3, 4})',
  },
  AVEDEV: {
    summary: 'Returns the average of the absolute deviations from the mean.',
    params: [{ name: 'number1, number2, …', description: 'The data values.' }],
    returns: 'The mean absolute deviation.',
    example: '=AVEDEV({2, 4, 6})',
  },
  DEVSQ: {
    summary: 'Returns the sum of squared deviations from the mean.',
    params: [{ name: 'number1, number2, …', description: 'The data values.' }],
    returns: 'The sum of squares of deviations.',
    example: '=DEVSQ({2, 4, 6})',
  },
  GEOMEAN: {
    summary: 'Returns the geometric mean of positive numbers.',
    params: [{ name: 'number1, number2, …', description: 'Positive numbers.' }],
    returns: 'The geometric mean, or #NUM! if any value ≤ 0.',
    example: '=GEOMEAN({1, 2, 4})',
  },
  HARMEAN: {
    summary: 'Returns the harmonic mean of positive numbers.',
    params: [{ name: 'number1, number2, …', description: 'Positive numbers.' }],
    returns: 'The harmonic mean, or #NUM! if any value ≤ 0.',
    example: '=HARMEAN({1, 2, 4})',
  },
  PERMUT: {
    summary: 'Returns the number of permutations of items taken k at a time.',
    params: [
      { name: 'number', description: 'Total number of items.' },
      { name: 'number_chosen', description: 'Number of items in each permutation.' },
    ],
    returns: 'The count of ordered arrangements, n!/(n-k)!.',
    example: '=PERMUT(5, 2)',
  },
  MAXIFS: {
    summary: 'Returns the maximum of cells that meet all criteria.',
    params: [
      { name: 'max_range', description: 'The cells to take the maximum of.' },
      { name: 'criteria_range1', description: 'First range to test.' },
      { name: 'criteria1', description: 'Condition applied to criteria_range1.' },
      { name: 'criteria_range2, criteria2, …', optional: true, description: 'Further range/criteria pairs.' },
    ],
    returns: 'The conditional maximum, or 0 if nothing matches.',
    example: '=MAXIFS({10,20,30}, {1,2,3}, ">1")',
  },
  MINIFS: {
    summary: 'Returns the minimum of cells that meet all criteria.',
    params: [
      { name: 'min_range', description: 'The cells to take the minimum of.' },
      { name: 'criteria_range1', description: 'First range to test.' },
      { name: 'criteria1', description: 'Condition applied to criteria_range1.' },
      { name: 'criteria_range2, criteria2, …', optional: true, description: 'Further range/criteria pairs.' },
    ],
    returns: 'The conditional minimum, or 0 if nothing matches.',
    example: '=MINIFS({10,20,30}, {1,2,3}, ">1")',
  },
  PERCENTILE: {
    summary: 'Returns the value at a given percentile of a data set (inclusive).',
    params: [
      { name: 'array', description: 'The data.' },
      { name: 'k', description: 'The percentile, between 0 and 1.' },
    ],
    returns: 'The interpolated percentile value.',
    example: '=PERCENTILE({1, 2, 3, 4}, 0.5)',
  },
  QUARTILE: {
    summary: 'Returns the requested quartile of a data set.',
    params: [
      { name: 'array', description: 'The data.' },
      { name: 'quart', description: '0=min, 1=25%, 2=median, 3=75%, 4=max.' },
    ],
    returns: 'The quartile value.',
    example: '=QUARTILE({1, 2, 3, 4}, 1)',
  },
  COUNTBLANK: {
    summary: 'Counts the empty cells in a range.',
    params: [{ name: 'range', description: 'The cells to inspect.' }],
    returns: 'The number of blank cells (empty strings count as blank).',
    example: '=COUNTBLANK({1, "", 3, ""})',
  },
  AVERAGEIFS: {
    summary: 'Averages cells that meet all of several range/criteria pairs.',
    params: [
      { name: 'average_range', description: 'The cells to average.' },
      { name: 'criteria_range1', description: 'First range to test.' },
      { name: 'criteria1', description: 'Condition applied to criteria_range1.' },
      { name: 'criteria_range2, criteria2, …', optional: true, description: 'Further range/criteria pairs.' },
    ],
    returns: 'The conditional mean, or #DIV/0! if nothing matches.',
    example: '=AVERAGEIFS({10,20,30}, {1,2,3}, ">1")',
  },
  COVAR: {
    summary: 'Returns population covariance between two data sets.',
    params: [
      { name: 'array1', description: 'The first data set.' },
      { name: 'array2', description: 'The second data set, same length.' },
    ],
    returns: 'The average of the products of paired deviations.',
    example: '=COVAR({1,2,3}, {4,6,8})',
  },
  CORREL: {
    summary: 'Returns the Pearson correlation coefficient of two data sets.',
    params: [
      { name: 'array1', description: 'The first data set.' },
      { name: 'array2', description: 'The second data set, same length.' },
    ],
    returns: 'A correlation between -1 and 1.',
    example: '=CORREL({1,2,3}, {4,6,8})',
  },
  SLOPE: {
    summary: 'Returns the slope of the linear regression line through points.',
    params: [
      { name: 'known_ys', description: 'The dependent values.' },
      { name: 'known_xs', description: 'The independent values, same length.' },
    ],
    returns: 'The slope of the best-fit line.',
    example: '=SLOPE({2,4,6}, {1,2,3})',
  },
  INTERCEPT: {
    summary: 'Returns the y-intercept of the linear regression line.',
    params: [
      { name: 'known_ys', description: 'The dependent values.' },
      { name: 'known_xs', description: 'The independent values, same length.' },
    ],
    returns: 'The y value where the best-fit line crosses x = 0.',
    example: '=INTERCEPT({2,4,6}, {1,2,3})',
  },
  FORECAST: {
    summary: 'Predicts a y value for a given x using linear regression.',
    params: [
      { name: 'x', description: 'The point to predict for.' },
      { name: 'known_ys', description: 'The dependent values.' },
      { name: 'known_xs', description: 'The independent values, same length.' },
    ],
    returns: 'The predicted y value.',
    example: '=FORECAST(4, {2,4,6}, {1,2,3})',
  },

  /* ── distributions ────────────────────────────────────────────────── */
  'NORM.DIST': {
    summary: 'Returns the normal distribution for the given mean and deviation.',
    params: [
      { name: 'x', description: 'The value to evaluate.' },
      { name: 'mean', description: 'The mean of the distribution.' },
      { name: 'standard_dev', description: 'The standard deviation (> 0).' },
      { name: 'cumulative', description: 'TRUE for the CDF, FALSE for the PDF.' },
    ],
    returns: 'The density or cumulative probability.',
    example: '=NORM.DIST(0, 0, 1, TRUE)',
  },
  NORMDIST: {
    summary: 'Legacy alias of NORM.DIST: the normal distribution.',
    params: [
      { name: 'x', description: 'The value to evaluate.' },
      { name: 'mean', description: 'The mean of the distribution.' },
      { name: 'standard_dev', description: 'The standard deviation (> 0).' },
      { name: 'cumulative', description: 'TRUE for the CDF, FALSE for the PDF.' },
    ],
    returns: 'The density or cumulative probability.',
    example: '=NORMDIST(0, 0, 1, TRUE)',
  },
  'NORM.INV': {
    summary: 'Returns the inverse of the normal cumulative distribution.',
    params: [
      { name: 'probability', description: 'A probability between 0 and 1.' },
      { name: 'mean', description: 'The mean of the distribution.' },
      { name: 'standard_dev', description: 'The standard deviation (> 0).' },
    ],
    returns: 'The x value whose CDF equals the probability.',
    example: '=NORM.INV(0.5, 0, 1)',
  },
  NORMINV: {
    summary: 'Legacy alias of NORM.INV: inverse normal cumulative distribution.',
    params: [
      { name: 'probability', description: 'A probability between 0 and 1.' },
      { name: 'mean', description: 'The mean of the distribution.' },
      { name: 'standard_dev', description: 'The standard deviation (> 0).' },
    ],
    returns: 'The x value whose CDF equals the probability.',
    example: '=NORMINV(0.5, 0, 1)',
  },
  'NORM.S.INV': {
    summary: 'Returns the inverse of the standard normal cumulative distribution.',
    params: [{ name: 'probability', description: 'A probability between 0 and 1.' }],
    returns: 'The z value whose standard-normal CDF equals the probability.',
    example: '=NORM.S.INV(0.975)',
  },
  NORMSINV: {
    summary: 'Legacy alias of NORM.S.INV: inverse standard normal distribution.',
    params: [{ name: 'probability', description: 'A probability between 0 and 1.' }],
    returns: 'The z value whose standard-normal CDF equals the probability.',
    example: '=NORMSINV(0.975)',
  },
  'NORM.S.DIST': {
    summary: 'Returns the standard normal distribution (mean 0, deviation 1).',
    params: [
      { name: 'z', description: 'The value to evaluate.' },
      { name: 'cumulative', description: 'TRUE for the CDF, FALSE for the PDF.' },
    ],
    returns: 'The density or cumulative probability.',
    example: '=NORM.S.DIST(0, TRUE)',
  },
  NORMSDIST: {
    summary: 'Legacy alias of NORM.S.DIST: standard normal cumulative distribution.',
    params: [{ name: 'z', description: 'The value to evaluate.' }],
    returns: 'The cumulative probability up to z.',
    example: '=NORMSDIST(0)',
  },

  /* ── logical ──────────────────────────────────────────────────────── */
  IF: {
    summary: 'Returns one value if a condition is true and another if false.',
    params: [
      { name: 'logical_test', description: 'An expression evaluating to TRUE or FALSE.' },
      { name: 'value_if_true', description: 'Returned when the test is TRUE.' },
      { name: 'value_if_false', optional: true, description: 'Returned when the test is FALSE. Defaults to FALSE.' },
    ],
    returns: 'One of the two branch values (only the taken branch is evaluated).',
    example: '=IF(2 > 1, "yes", "no")',
  },
  IFS: {
    summary: 'Checks conditions in order and returns the first match.',
    params: [
      { name: 'test1', description: 'First condition.' },
      { name: 'value1', description: 'Result if test1 is TRUE.' },
      { name: 'test2, value2, …', optional: true, description: 'Further condition/result pairs.' },
    ],
    returns: 'The value for the first TRUE test, or #N/A if none match.',
    example: '=IFS(FALSE, "a", TRUE, "b")',
  },
  AND: {
    summary: 'Returns TRUE only if all of its arguments are TRUE.',
    params: [{ name: 'logical1, logical2, …', description: 'Conditions to combine.' }],
    returns: 'TRUE if every argument is TRUE, otherwise FALSE.',
    example: '=AND(2 > 1, 3 > 2)',
  },
  OR: {
    summary: 'Returns TRUE if any of its arguments is TRUE.',
    params: [{ name: 'logical1, logical2, …', description: 'Conditions to combine.' }],
    returns: 'TRUE if at least one argument is TRUE, otherwise FALSE.',
    example: '=OR(1 > 2, 3 > 2)',
  },
  XOR: {
    summary: 'Returns TRUE if an odd number of its arguments are TRUE.',
    params: [{ name: 'logical1, logical2, …', description: 'Conditions to combine.' }],
    returns: 'The exclusive-or of the arguments.',
    example: '=XOR(TRUE, TRUE, TRUE)',
  },
  NOT: {
    summary: 'Reverses the logical value of its argument.',
    params: [{ name: 'logical', description: 'The value to negate.' }],
    returns: 'TRUE becomes FALSE and vice versa.',
    example: '=NOT(FALSE)',
  },
  TRUE: {
    summary: 'Returns the logical value TRUE.',
    params: [],
    returns: 'The boolean TRUE.',
    example: '=TRUE()',
  },
  FALSE: {
    summary: 'Returns the logical value FALSE.',
    params: [],
    returns: 'The boolean FALSE.',
    example: '=FALSE()',
  },
  IFERROR: {
    summary: 'Returns a fallback value if an expression evaluates to any error.',
    params: [
      { name: 'value', description: 'The expression to try.' },
      { name: 'value_if_error', description: 'Returned when value is an error.' },
    ],
    returns: 'value, or value_if_error if value is an error.',
    example: '=IFERROR(1/0, "n/a")',
  },
  IFNA: {
    summary: 'Returns a fallback value only when an expression is #N/A.',
    params: [
      { name: 'value', description: 'The expression to try.' },
      { name: 'value_if_na', description: 'Returned when value is #N/A.' },
    ],
    returns: 'value, or value_if_na if value is #N/A (other errors pass through).',
    example: '=IFNA(NA(), "missing")',
  },
  SWITCH: {
    summary: 'Compares an expression against cases and returns the first match.',
    params: [
      { name: 'expression', description: 'The value to match.' },
      { name: 'value1', description: 'A candidate to compare against.' },
      { name: 'result1', description: 'Returned when value1 matches.' },
      { name: 'value2, result2, …', optional: true, description: 'Further value/result pairs.' },
      { name: 'default', optional: true, description: 'A trailing lone argument returned if nothing matches.' },
    ],
    returns: 'The matching result, the default, or #N/A.',
    example: '=SWITCH(2, 1, "a", 2, "b", "z")',
  },

  /* ── text ─────────────────────────────────────────────────────────── */
  CONCAT: {
    summary: 'Joins text from values and ranges into a single string.',
    params: [{ name: 'text1, text2, …', description: 'Values or ranges to join, in reading order.' }],
    returns: 'The concatenated text.',
    example: '=CONCAT("grid", "calc")',
  },
  LEFT: {
    summary: 'Returns the leftmost characters of a text string.',
    params: [
      { name: 'text', description: 'The source string.' },
      { name: 'num_chars', optional: true, description: 'How many characters to take. Defaults to 1.' },
    ],
    returns: 'The leading substring.',
    example: '=LEFT("gridcalc", 4)',
  },
  RIGHT: {
    summary: 'Returns the rightmost characters of a text string.',
    params: [
      { name: 'text', description: 'The source string.' },
      { name: 'num_chars', optional: true, description: 'How many characters to take. Defaults to 1.' },
    ],
    returns: 'The trailing substring.',
    example: '=RIGHT("gridcalc", 4)',
  },
  MID: {
    summary: 'Returns characters from the middle of a string by position.',
    params: [
      { name: 'text', description: 'The source string.' },
      { name: 'start_num', description: 'The 1-based position of the first character.' },
      { name: 'num_chars', description: 'How many characters to take.' },
    ],
    returns: 'The extracted substring.',
    example: '=MID("gridcalc", 5, 4)',
  },
  LEN: {
    summary: 'Returns the number of characters in a string.',
    params: [{ name: 'text', description: 'The string to measure.' }],
    returns: 'The character count.',
    example: '=LEN("gridcalc")',
  },
  UPPER: {
    summary: 'Converts text to uppercase.',
    params: [{ name: 'text', description: 'The string to convert.' }],
    returns: 'The uppercased text.',
    example: '=UPPER("gridcalc")',
  },
  LOWER: {
    summary: 'Converts text to lowercase.',
    params: [{ name: 'text', description: 'The string to convert.' }],
    returns: 'The lowercased text.',
    example: '=LOWER("GRIDCALC")',
  },
  TRIM: {
    summary: 'Removes leading, trailing, and repeated inner spaces.',
    params: [{ name: 'text', description: 'The string to clean.' }],
    returns: 'The trimmed text (single spaces between words).',
    example: '=TRIM("  a   b  ")',
  },
  VALUE: {
    summary: 'Converts a text string that represents a number into a number.',
    params: [{ name: 'text', description: 'A number, date, or time in text form.' }],
    returns: 'The numeric value, or #VALUE! if it cannot be parsed.',
    example: '=VALUE("1234")',
  },
  TEXT: {
    summary: 'Formats a number as text using a format code.',
    params: [
      { name: 'value', description: 'The number to format.' },
      { name: 'format_text', description: 'A format code such as "0.00" or "0%".' },
    ],
    returns: 'The formatted string.',
    example: '=TEXT(0.25, "0.0%")',
  },
  FIND: {
    summary: 'Finds one string inside another, case-sensitive.',
    params: [
      { name: 'find_text', description: 'The substring to locate.' },
      { name: 'within_text', description: 'The string to search.' },
      { name: 'start_num', optional: true, description: 'Position to start at. Defaults to 1.' },
    ],
    returns: 'The 1-based position, or #VALUE! if not found.',
    example: '=FIND("c", "gridcalc")',
  },
  SEARCH: {
    summary: 'Finds one string inside another, case-insensitive with wildcards.',
    params: [
      { name: 'find_text', description: 'The substring to locate (supports * and ?).' },
      { name: 'within_text', description: 'The string to search.' },
      { name: 'start_num', optional: true, description: 'Position to start at. Defaults to 1.' },
    ],
    returns: 'The 1-based position, or #VALUE! if not found.',
    example: '=SEARCH("C", "gridcalc")',
  },
  PROPER: {
    summary: 'Capitalizes the first letter of each word.',
    params: [{ name: 'text', description: 'The string to convert.' }],
    returns: 'The title-cased text.',
    example: '=PROPER("hello world")',
  },
  CLEAN: {
    summary: 'Removes non-printable control characters from text.',
    params: [{ name: 'text', description: 'The string to clean.' }],
    returns: 'The text without control characters.',
    example: '=CLEAN("a" & CHAR(7) & "b")',
  },
  CODE: {
    summary: 'Returns the numeric code of the first character of a string.',
    params: [{ name: 'text', description: 'The string whose first character is read.' }],
    returns: 'The character code point.',
    example: '=CODE("A")',
  },
  CHAR: {
    summary: 'Returns the character for a given code (1–255).',
    params: [{ name: 'number', description: 'A code point between 1 and 255.' }],
    returns: 'The single-character string.',
    example: '=CHAR(65)',
  },
  UNICHAR: {
    summary: 'Returns the Unicode character for a given code point.',
    params: [{ name: 'number', description: 'A positive Unicode code point.' }],
    returns: 'The character as text.',
    example: '=UNICHAR(8364)',
  },
  UNICODE: {
    summary: 'Returns the Unicode code point of the first character.',
    params: [{ name: 'text', description: 'The string whose first character is read.' }],
    returns: 'The code point number.',
    example: '=UNICODE("€")',
  },
  FIXED: {
    summary: 'Formats a number with fixed decimals and optional thousands separators.',
    params: [
      { name: 'number', description: 'The number to format.' },
      { name: 'decimals', optional: true, description: 'Decimal places. Defaults to 2.' },
      { name: 'no_commas', optional: true, description: 'TRUE suppresses thousands separators.' },
    ],
    returns: 'The formatted string.',
    example: '=FIXED(1234.567, 1)',
  },
  EXACT: {
    summary: 'Tests whether two strings are exactly equal, case-sensitive.',
    params: [
      { name: 'text1', description: 'The first string.' },
      { name: 'text2', description: 'The second string.' },
    ],
    returns: 'TRUE if identical, otherwise FALSE.',
    example: '=EXACT("Grid", "grid")',
  },
  CONCATENATE: {
    summary: 'Legacy join: concatenates its text arguments (ranges not expanded).',
    params: [{ name: 'text1, text2, …', description: 'The values to join.' }],
    returns: 'The concatenated text.',
    example: '=CONCATENATE("grid", "calc")',
  },
  SUBSTITUTE: {
    summary: 'Replaces occurrences of one substring with another.',
    params: [
      { name: 'text', description: 'The source string.' },
      { name: 'old_text', description: 'The substring to replace.' },
      { name: 'new_text', description: 'The replacement.' },
      { name: 'instance_num', optional: true, description: 'Which occurrence to replace; omit for all.' },
    ],
    returns: 'The text with substitutions applied.',
    example: '=SUBSTITUTE("a-b-c", "-", "+")',
  },
  REPLACE: {
    summary: 'Replaces part of a string by character position.',
    params: [
      { name: 'old_text', description: 'The source string.' },
      { name: 'start_num', description: 'The 1-based position to start replacing.' },
      { name: 'num_chars', description: 'How many characters to remove.' },
      { name: 'new_text', description: 'The text to insert.' },
    ],
    returns: 'The modified text.',
    example: '=REPLACE("abcdef", 2, 3, "X")',
  },
  REPT: {
    summary: 'Repeats a string a given number of times.',
    params: [
      { name: 'text', description: 'The string to repeat.' },
      { name: 'number_times', description: 'How many repetitions.' },
    ],
    returns: 'The repeated text.',
    example: '=REPT("ab", 3)',
  },
  TEXTJOIN: {
    summary: 'Joins values with a delimiter, optionally skipping empties.',
    params: [
      { name: 'delimiter', description: 'The separator inserted between values.' },
      { name: 'ignore_empty', description: 'TRUE skips empty values.' },
      { name: 'text1, text2, …', description: 'Values or ranges to join.' },
    ],
    returns: 'The joined string.',
    example: '=TEXTJOIN("-", TRUE, {1, 2, 3})',
  },
  DOLLAR: {
    summary: 'Formats a number as currency text with a thousands separator.',
    params: [
      { name: 'number', description: 'The number to format.' },
      { name: 'decimals', optional: true, description: 'Decimal places. Defaults to 2.' },
    ],
    returns: 'The currency-formatted string.',
    example: '=DOLLAR(1234.5)',
  },
  TEXTBEFORE: {
    summary: 'Returns the text that comes before a delimiter.',
    params: [
      { name: 'text', description: 'The source string.' },
      { name: 'delimiter', description: 'The marker to search for.' },
      { name: 'instance_num', optional: true, description: 'Which occurrence to split on. Defaults to 1.' },
    ],
    returns: 'The substring before the delimiter.',
    example: '=TEXTBEFORE("name@host", "@")',
  },
  TEXTAFTER: {
    summary: 'Returns the text that comes after a delimiter.',
    params: [
      { name: 'text', description: 'The source string.' },
      { name: 'delimiter', description: 'The marker to search for.' },
      { name: 'instance_num', optional: true, description: 'Which occurrence to split on. Defaults to 1.' },
    ],
    returns: 'The substring after the delimiter.',
    example: '=TEXTAFTER("name@host", "@")',
  },
  TEXTSPLIT: {
    summary: 'Splits text into a spilled array by column and row delimiters.',
    params: [
      { name: 'text', description: 'The string to split.' },
      { name: 'col_delimiter', description: 'Delimiter that splits into columns.' },
      { name: 'row_delimiter', optional: true, description: 'Delimiter that splits into rows.' },
    ],
    returns: 'An array of the split pieces that spills across cells.',
    example: '=TEXTSPLIT("a,b,c", ",")',
    result: 'Spills "a", "b", "c" across three columns.',
  },

  /* ── lookup ───────────────────────────────────────────────────────── */
  VLOOKUP: {
    summary: 'Looks up a value in the first column of a table and returns a column from the same row.',
    params: [
      { name: 'lookup_value', description: 'The value to find.' },
      { name: 'table_array', description: 'The table to search.' },
      { name: 'col_index_num', description: 'The 1-based column to return from.' },
      { name: 'range_lookup', optional: true, description: 'TRUE/omitted for approximate match (sorted), FALSE for exact.' },
    ],
    returns: 'The matching cell, or #N/A if not found.',
    example: '=VLOOKUP(2, {1,"a";2,"b";3,"c"}, 2, FALSE)',
  },
  HLOOKUP: {
    summary: 'Looks up a value in the first row of a table and returns a row from the same column.',
    params: [
      { name: 'lookup_value', description: 'The value to find.' },
      { name: 'table_array', description: 'The table to search.' },
      { name: 'row_index_num', description: 'The 1-based row to return from.' },
      { name: 'range_lookup', optional: true, description: 'TRUE/omitted for approximate match (sorted), FALSE for exact.' },
    ],
    returns: 'The matching cell, or #N/A if not found.',
    example: '=HLOOKUP(2, {1,2,3;"a","b","c"}, 2, FALSE)',
  },
  INDEX: {
    summary: 'Returns a value from an array by row and column position.',
    params: [
      { name: 'array', description: 'The range or array.' },
      { name: 'row_num', description: 'The 1-based row (0 returns the whole column).' },
      { name: 'column_num', optional: true, description: 'The 1-based column (0 returns the whole row).' },
    ],
    returns: 'The value at the position, or a spilled row/column.',
    example: '=INDEX({10,20;30,40}, 2, 1)',
  },
  MATCH: {
    summary: 'Returns the position of a value within a one-dimensional range.',
    params: [
      { name: 'lookup_value', description: 'The value to find.' },
      { name: 'lookup_array', description: 'The range to search.' },
      { name: 'match_type', optional: true, description: '1=largest ≤ value (ascending), 0=exact, -1=smallest ≥ value (descending).' },
    ],
    returns: 'The 1-based position, or #N/A.',
    example: '=MATCH(30, {10, 20, 30, 40}, 0)',
  },
  CHOOSE: {
    summary: 'Returns one of a list of values by index.',
    params: [
      { name: 'index_num', description: 'Which value to return (1-based).' },
      { name: 'value1, value2, …', description: 'The candidate values.' },
    ],
    returns: 'The value at index_num.',
    example: '=CHOOSE(2, "a", "b", "c")',
  },
  ROW: {
    summary: 'Returns the row number of a reference.',
    params: [{ name: 'reference', optional: true, description: 'A cell reference. Omitted = the formula\'s own row.' }],
    returns: 'The 1-based row number.',
    example: '=ROW(A5)',
    result: '5 (the row of the referenced cell).',
  },
  COLUMN: {
    summary: 'Returns the column number of a reference.',
    params: [{ name: 'reference', optional: true, description: 'A cell reference. Omitted = the formula\'s own column.' }],
    returns: 'The 1-based column number.',
    example: '=COLUMN(C1)',
    result: '3 (the column of the referenced cell).',
  },
  ROWS: {
    summary: 'Returns the number of rows in a range or array.',
    params: [{ name: 'array', description: 'The range or array to measure.' }],
    returns: 'The row count.',
    example: '=ROWS({1;2;3})',
  },
  COLUMNS: {
    summary: 'Returns the number of columns in a range or array.',
    params: [{ name: 'array', description: 'The range or array to measure.' }],
    returns: 'The column count.',
    example: '=COLUMNS({1,2,3})',
  },
  ADDRESS: {
    summary: 'Builds a cell-address string from row and column numbers.',
    params: [
      { name: 'row_num', description: 'The row number.' },
      { name: 'column_num', description: 'The column number.' },
      { name: 'abs_num', optional: true, description: '1=absolute, 2=abs row, 3=abs col, 4=relative.' },
      { name: 'a1', optional: true, description: 'TRUE for A1 style (default), FALSE for R1C1.' },
      { name: 'sheet_text', optional: true, description: 'A sheet name to prefix.' },
    ],
    returns: 'The address as text.',
    example: '=ADDRESS(2, 3)',
  },
  LOOKUP: {
    summary: 'Searches a sorted vector for a value and returns the aligned result.',
    params: [
      { name: 'lookup_value', description: 'The value to find.' },
      { name: 'lookup_vector', description: 'A sorted row or column to search.' },
      { name: 'result_vector', optional: true, description: 'The aligned values to return. Defaults to lookup_vector.' },
    ],
    returns: 'The matching result, or #N/A.',
    example: '=LOOKUP(2.5, {1,2,3}, {"a","b","c"})',
  },
  FORMULATEXT: {
    summary: 'Returns the formula in a referenced cell as text.',
    params: [{ name: 'reference', description: 'The cell whose formula is read.' }],
    returns: 'The formula string, or #N/A if the cell has no formula.',
    example: '=FORMULATEXT(A1)',
    result: 'The formula text of A1, e.g. "=SUM(B1:B3)".',
  },
  XMATCH: {
    summary: 'Returns the position of a value with flexible match and search modes.',
    params: [
      { name: 'lookup_value', description: 'The value to find.' },
      { name: 'lookup_array', description: 'The range to search.' },
      { name: 'match_mode', optional: true, description: '0=exact (default), -1/1=next smaller/larger, 2=wildcard.' },
      { name: 'search_mode', optional: true, description: '1=first to last (default), -1=last to first, ±2=binary.' },
    ],
    returns: 'The 1-based position, or #N/A.',
    example: '=XMATCH(30, {10, 20, 30, 40})',
  },
  XLOOKUP: {
    summary: 'Looks up a value and returns the aligned item, with a fallback and search modes.',
    params: [
      { name: 'lookup_value', description: 'The value to find.' },
      { name: 'lookup_array', description: 'The range to search.' },
      { name: 'return_array', description: 'The aligned values to return.' },
      { name: 'if_not_found', optional: true, description: 'Value returned when no match is found.' },
      { name: 'match_mode', optional: true, description: '0=exact (default), -1/1=next smaller/larger, 2=wildcard.' },
      { name: 'search_mode', optional: true, description: '1=first to last (default), -1=last to first, ±2=binary.' },
    ],
    returns: 'The matching item, the fallback, or #N/A.',
    example: '=XLOOKUP(2, {1,2,3}, {"a","b","c"}, "none")',
  },
  OFFSET: {
    summary: 'Returns a range shifted from a starting reference by rows and columns.',
    params: [
      { name: 'reference', description: 'The anchor cell or range.' },
      { name: 'rows', description: 'Rows to move down (negative = up).' },
      { name: 'cols', description: 'Columns to move right (negative = left).' },
      { name: 'height', optional: true, description: 'Row height of the result. Defaults to the anchor\'s.' },
      { name: 'width', optional: true, description: 'Column width of the result. Defaults to the anchor\'s.' },
    ],
    returns: 'The value or range at the offset position.',
    example: '=OFFSET(A1, 2, 1)',
    result: 'The value of the cell two rows down and one column right of A1.',
  },
  INDIRECT: {
    summary: 'Returns the reference named by a text string.',
    params: [
      { name: 'ref_text', description: 'A cell or range address as text.' },
      { name: 'a1', optional: true, description: 'TRUE for A1 style (default), FALSE for R1C1.' },
    ],
    returns: 'The value at the referenced location.',
    example: '=INDIRECT("A" & 1)',
    result: 'The value of cell A1.',
  },

  /* ── information ──────────────────────────────────────────────────── */
  ISBLANK: {
    summary: 'Tests whether a value refers to an empty cell.',
    params: [{ name: 'value', description: 'The value to test.' }],
    returns: 'TRUE if blank, otherwise FALSE.',
    example: '=ISBLANK("")',
  },
  ISNUMBER: {
    summary: 'Tests whether a value is a number.',
    params: [{ name: 'value', description: 'The value to test.' }],
    returns: 'TRUE if the value is numeric.',
    example: '=ISNUMBER(42)',
  },
  ISTEXT: {
    summary: 'Tests whether a value is text.',
    params: [{ name: 'value', description: 'The value to test.' }],
    returns: 'TRUE if the value is text.',
    example: '=ISTEXT("hi")',
  },
  ISNONTEXT: {
    summary: 'Tests whether a value is anything other than text.',
    params: [{ name: 'value', description: 'The value to test.' }],
    returns: 'TRUE if the value is not text (numbers, blanks, errors).',
    example: '=ISNONTEXT(42)',
  },
  ISLOGICAL: {
    summary: 'Tests whether a value is a boolean.',
    params: [{ name: 'value', description: 'The value to test.' }],
    returns: 'TRUE if the value is TRUE or FALSE.',
    example: '=ISLOGICAL(TRUE)',
  },
  ISERROR: {
    summary: 'Tests whether a value is any error.',
    params: [{ name: 'value', description: 'The value to test.' }],
    returns: 'TRUE for any error including #N/A.',
    example: '=ISERROR(1/0)',
  },
  ISERR: {
    summary: 'Tests whether a value is any error except #N/A.',
    params: [{ name: 'value', description: 'The value to test.' }],
    returns: 'TRUE for errors other than #N/A.',
    example: '=ISERR(1/0)',
  },
  ISNA: {
    summary: 'Tests whether a value is the #N/A error.',
    params: [{ name: 'value', description: 'The value to test.' }],
    returns: 'TRUE only for #N/A.',
    example: '=ISNA(NA())',
  },
  ISEVEN: {
    summary: 'Tests whether a number is even.',
    params: [{ name: 'value', description: 'The number to test (decimals truncated).' }],
    returns: 'TRUE if even, otherwise FALSE.',
    example: '=ISEVEN(4)',
  },
  ISODD: {
    summary: 'Tests whether a number is odd.',
    params: [{ name: 'value', description: 'The number to test (decimals truncated).' }],
    returns: 'TRUE if odd, otherwise FALSE.',
    example: '=ISODD(3)',
  },
  NA: {
    summary: 'Returns the #N/A error value.',
    params: [],
    returns: 'The #N/A error.',
    example: '=NA()',
    result: '#N/A',
  },
  N: {
    summary: 'Converts a value to a number.',
    params: [{ name: 'value', description: 'The value to convert.' }],
    returns: 'Numbers unchanged, TRUE→1, FALSE/text→0, dates→serial.',
    example: '=N(TRUE)',
  },
  T: {
    summary: 'Returns the value if it is text, otherwise an empty string.',
    params: [{ name: 'value', description: 'The value to test.' }],
    returns: 'The text, or "" for non-text.',
    example: '=T("hi")',
  },
  ISREF: {
    summary: 'Tests whether a value is a reference.',
    params: [{ name: 'value', description: 'The value to test.' }],
    returns: 'TRUE if the argument is a cell/range reference.',
    example: '=ISREF(A1)',
    result: 'TRUE for a reference argument.',
  },
  TYPE: {
    summary: 'Returns a code for the data type of a value.',
    params: [{ name: 'value', description: 'The value to classify.' }],
    returns: '1=number, 2=text, 4=logical, 16=error, 64=array.',
    example: '=TYPE("hi")',
  },
  'ERROR.TYPE': {
    summary: 'Returns a number identifying an error value.',
    params: [{ name: 'error_val', description: 'The error to classify.' }],
    returns: '1=#NULL!, 2=#DIV/0!, 3=#VALUE!, 4=#REF!, 5=#NAME?, 6=#NUM!, 7=#N/A; #N/A if not an error.',
    example: '=ERROR.TYPE(1/0)',
  },
  ISFORMULA: {
    summary: 'Tests whether a referenced cell contains a formula.',
    params: [{ name: 'reference', description: 'The cell to inspect.' }],
    returns: 'TRUE if the cell holds a formula.',
    example: '=ISFORMULA(A1)',
    result: 'TRUE if A1 contains a formula.',
  },
  SHEET: {
    summary: 'Returns the sheet number of a reference or the current sheet.',
    params: [{ name: 'value', optional: true, description: 'A reference. Omitted = the current sheet.' }],
    returns: 'The 1-based sheet index.',
    example: '=SHEET()',
    result: 'The index of the current sheet (1 in the playground).',
  },
  SHEETS: {
    summary: 'Returns the number of sheets in a reference or the workbook.',
    params: [{ name: 'reference', optional: true, description: 'A reference. Omitted = the whole workbook.' }],
    returns: 'The sheet count.',
    example: '=SHEETS()',
    result: 'The number of sheets in the workbook.',
  },

  /* ── datetime ─────────────────────────────────────────────────────── */
  TODAY: {
    summary: 'Returns the serial number of the current date.',
    params: [],
    returns: 'Today\'s date as a serial number (volatile).',
    example: '=TODAY()',
    result: 'The serial number of today\'s date.',
  },
  NOW: {
    summary: 'Returns the serial number of the current date and time.',
    params: [],
    returns: 'The current date-time as a serial number (volatile).',
    example: '=NOW()',
    result: 'The serial number of the current date and time.',
  },
  DATE: {
    summary: 'Builds a date serial number from year, month, and day.',
    params: [
      { name: 'year', description: 'The year.' },
      { name: 'month', description: 'The month (overflow rolls into years).' },
      { name: 'day', description: 'The day (overflow rolls into months).' },
    ],
    returns: 'The date as a serial number.',
    example: '=DATE(2024, 2, 29)',
  },
  YEAR: {
    summary: 'Returns the year of a date serial number.',
    params: [{ name: 'serial_number', description: 'The date value.' }],
    returns: 'The four-digit year.',
    example: '=YEAR(DATE(2024, 6, 14))',
  },
  MONTH: {
    summary: 'Returns the month (1–12) of a date serial number.',
    params: [{ name: 'serial_number', description: 'The date value.' }],
    returns: 'The month number.',
    example: '=MONTH(DATE(2024, 6, 14))',
  },
  DAY: {
    summary: 'Returns the day of the month (1–31) of a date serial number.',
    params: [{ name: 'serial_number', description: 'The date value.' }],
    returns: 'The day number.',
    example: '=DAY(DATE(2024, 6, 14))',
  },
  HOUR: {
    summary: 'Returns the hour (0–23) of a time serial number.',
    params: [{ name: 'serial_number', description: 'The time value.' }],
    returns: 'The hour.',
    example: '=HOUR(0.5)',
  },
  MINUTE: {
    summary: 'Returns the minute (0–59) of a time serial number.',
    params: [{ name: 'serial_number', description: 'The time value.' }],
    returns: 'The minute.',
    example: '=MINUTE(TIME(9, 30, 0))',
  },
  SECOND: {
    summary: 'Returns the second (0–59) of a time serial number.',
    params: [{ name: 'serial_number', description: 'The time value.' }],
    returns: 'The second.',
    example: '=SECOND(TIME(9, 30, 15))',
  },
  TIME: {
    summary: 'Builds a time serial fraction from hours, minutes, and seconds.',
    params: [
      { name: 'hour', description: 'The hour.' },
      { name: 'minute', description: 'The minute.' },
      { name: 'second', description: 'The second.' },
    ],
    returns: 'A fraction of a day between 0 and 1.',
    example: '=TIME(12, 0, 0)',
  },
  WEEKDAY: {
    summary: 'Returns the day of the week of a date as a number.',
    params: [
      { name: 'serial_number', description: 'The date value.' },
      { name: 'return_type', optional: true, description: '1=Sun..Sat (default), 2=Mon..Sun, 3=0-based Mon, and more.' },
    ],
    returns: 'The weekday number.',
    example: '=WEEKDAY(DATE(2024, 6, 14), 2)',
  },
  EDATE: {
    summary: 'Returns the date a number of months before or after a start date.',
    params: [
      { name: 'start_date', description: 'The base date.' },
      { name: 'months', description: 'Months to add (negative = before).' },
    ],
    returns: 'The shifted date as a serial number.',
    example: '=EDATE(DATE(2024, 1, 31), 1)',
  },
  EOMONTH: {
    summary: 'Returns the last day of the month a number of months away.',
    params: [
      { name: 'start_date', description: 'The base date.' },
      { name: 'months', description: 'Months to add (negative = before).' },
    ],
    returns: 'The month-end date as a serial number.',
    example: '=EOMONTH(DATE(2024, 1, 15), 0)',
  },
  DAYS: {
    summary: 'Returns the number of days between two dates.',
    params: [
      { name: 'end_date', description: 'The later date.' },
      { name: 'start_date', description: 'The earlier date.' },
    ],
    returns: 'end_date − start_date in days.',
    example: '=DAYS(DATE(2024, 1, 31), DATE(2024, 1, 1))',
  },
  DAYS360: {
    summary: 'Returns days between two dates on a 360-day (12×30) calendar.',
    params: [
      { name: 'start_date', description: 'The earlier date.' },
      { name: 'end_date', description: 'The later date.' },
      { name: 'method', optional: true, description: 'FALSE=US/NASD (default), TRUE=European.' },
    ],
    returns: 'The day count on a 360-day year.',
    example: '=DAYS360(DATE(2024, 1, 1), DATE(2024, 2, 1))',
  },
  WEEKNUM: {
    summary: 'Returns the week number of a date within the year.',
    params: [
      { name: 'serial_number', description: 'The date value.' },
      { name: 'return_type', optional: true, description: 'Code for which day starts the week. Defaults to 1 (Sunday).' },
    ],
    returns: 'The 1-based week of the year.',
    example: '=WEEKNUM(DATE(2024, 1, 1))',
  },
  WORKDAY: {
    summary: 'Returns the date a number of working days from a start date.',
    params: [
      { name: 'start_date', description: 'The base date.' },
      { name: 'days', description: 'Working days to add (negative = before); weekends are skipped.' },
      { name: 'holidays', optional: true, description: 'Dates to also skip.' },
    ],
    returns: 'The resulting workday as a serial number.',
    example: '=WORKDAY(DATE(2024, 6, 14), 3)',
  },
  NETWORKDAYS: {
    summary: 'Counts working days between two dates, excluding weekends.',
    params: [
      { name: 'start_date', description: 'The first date.' },
      { name: 'end_date', description: 'The last date.' },
      { name: 'holidays', optional: true, description: 'Dates to also exclude.' },
    ],
    returns: 'The number of working days, inclusive.',
    example: '=NETWORKDAYS(DATE(2024, 6, 10), DATE(2024, 6, 14))',
  },
  YEARFRAC: {
    summary: 'Returns the fraction of a year between two dates.',
    params: [
      { name: 'start_date', description: 'The first date.' },
      { name: 'end_date', description: 'The second date.' },
      { name: 'basis', optional: true, description: 'Day-count basis 0–4. Defaults to 0 (US 30/360).' },
    ],
    returns: 'The year fraction.',
    example: '=YEARFRAC(DATE(2024, 1, 1), DATE(2024, 7, 1))',
  },
  DATEDIF: {
    summary: 'Returns the difference between two dates in a chosen unit.',
    params: [
      { name: 'start_date', description: 'The earlier date.' },
      { name: 'end_date', description: 'The later date.' },
      { name: 'unit', description: '"Y", "M", "D", "MD", "YM", or "YD".' },
    ],
    returns: 'The difference in the requested unit.',
    example: '=DATEDIF(DATE(2020, 1, 1), DATE(2024, 6, 14), "Y")',
  },

  /* ── arrays ───────────────────────────────────────────────────────── */
  SEQUENCE: {
    summary: 'Generates a spilled array of sequential numbers.',
    params: [
      { name: 'rows', description: 'Number of rows.' },
      { name: 'columns', optional: true, description: 'Number of columns. Defaults to 1.' },
      { name: 'start', optional: true, description: 'First value. Defaults to 1.' },
      { name: 'step', optional: true, description: 'Increment between values. Defaults to 1.' },
    ],
    returns: 'A rows×columns array that spills.',
    example: '=SEQUENCE(2, 3, 10, 10)',
    result: 'Spills a 2×3 grid: 10 20 30 / 40 50 60.',
  },
  UNIQUE: {
    summary: 'Returns the distinct values from a range or array.',
    params: [
      { name: 'array', description: 'The source values.' },
      { name: 'by_col', optional: true, description: 'TRUE compares columns instead of rows.' },
      { name: 'exactly_once', optional: true, description: 'TRUE returns only values that appear once.' },
    ],
    returns: 'A spilled array of unique values.',
    example: '=UNIQUE({1; 2; 2; 3})',
    result: 'Spills 1, 2, 3.',
  },
  SORT: {
    summary: 'Sorts the rows (or columns) of a range or array.',
    params: [
      { name: 'array', description: 'The values to sort.' },
      { name: 'sort_index', optional: true, description: 'Which column/row to sort by. Defaults to 1.' },
      { name: 'sort_order', optional: true, description: '1 ascending (default), -1 descending.' },
      { name: 'by_col', optional: true, description: 'TRUE sorts columns instead of rows.' },
    ],
    returns: 'A spilled, sorted array.',
    example: '=SORT({3; 1; 2})',
    result: 'Spills 1, 2, 3.',
  },
  SORTBY: {
    summary: 'Sorts an array by the values in one or more other arrays.',
    params: [
      { name: 'array', description: 'The values to return, in sorted order.' },
      { name: 'by_array1', description: 'The first array to sort by.' },
      { name: 'sort_order1', optional: true, description: '1 ascending (default), -1 descending.' },
      { name: 'by_array2, sort_order2, …', optional: true, description: 'Further sort keys.' },
    ],
    returns: 'A spilled array reordered by the keys.',
    example: '=SORTBY({"a";"b";"c"}, {3;1;2})',
    result: 'Spills "b", "c", "a".',
  },
  FILTER: {
    summary: 'Returns only the rows of an array that meet a condition.',
    params: [
      { name: 'array', description: 'The data to filter.' },
      { name: 'include', description: 'A boolean array marking which rows to keep.' },
      { name: 'if_empty', optional: true, description: 'Value returned when nothing matches.' },
    ],
    returns: 'A spilled array of matching rows, or if_empty / #CALC!.',
    example: '=FILTER({1;2;3;4}, {1;0;1;0})',
    result: 'Spills 1 and 3.',
  },

  /* ── financial ────────────────────────────────────────────────────── */
  PMT: {
    summary: 'Returns the periodic payment for a loan or annuity.',
    params: [
      { name: 'rate', description: 'The interest rate per period.' },
      { name: 'nper', description: 'The total number of periods.' },
      { name: 'pv', description: 'The present value (loan principal).' },
      { name: 'fv', optional: true, description: 'The future value. Defaults to 0.' },
      { name: 'type', optional: true, description: '0 = end of period (default), 1 = beginning.' },
    ],
    returns: 'The payment per period (negative for outflows).',
    example: '=PMT(0.04/12, 360, 250000)',
  },
  FV: {
    summary: 'Returns the future value of an investment.',
    params: [
      { name: 'rate', description: 'The interest rate per period.' },
      { name: 'nper', description: 'The total number of periods.' },
      { name: 'pmt', description: 'The payment each period.' },
      { name: 'pv', optional: true, description: 'The present value. Defaults to 0.' },
      { name: 'type', optional: true, description: '0 = end of period (default), 1 = beginning.' },
    ],
    returns: 'The future value.',
    example: '=FV(0.05/12, 120, -200)',
  },
  PV: {
    summary: 'Returns the present value of an investment.',
    params: [
      { name: 'rate', description: 'The interest rate per period.' },
      { name: 'nper', description: 'The total number of periods.' },
      { name: 'pmt', description: 'The payment each period.' },
      { name: 'fv', optional: true, description: 'The future value. Defaults to 0.' },
      { name: 'type', optional: true, description: '0 = end of period (default), 1 = beginning.' },
    ],
    returns: 'The present value.',
    example: '=PV(0.05/12, 120, -200)',
  },
  NPER: {
    summary: 'Returns the number of periods for an investment or loan.',
    params: [
      { name: 'rate', description: 'The interest rate per period.' },
      { name: 'pmt', description: 'The payment each period.' },
      { name: 'pv', description: 'The present value.' },
      { name: 'fv', optional: true, description: 'The future value. Defaults to 0.' },
      { name: 'type', optional: true, description: '0 = end of period (default), 1 = beginning.' },
    ],
    returns: 'The number of payment periods.',
    example: '=NPER(0.04/12, -1200, 250000)',
  },
  RATE: {
    summary: 'Returns the interest rate per period of an annuity (iterative).',
    params: [
      { name: 'nper', description: 'The total number of periods.' },
      { name: 'pmt', description: 'The payment each period.' },
      { name: 'pv', description: 'The present value.' },
      { name: 'fv', optional: true, description: 'The future value. Defaults to 0.' },
      { name: 'type', optional: true, description: '0 = end of period (default), 1 = beginning.' },
      { name: 'guess', optional: true, description: 'A starting estimate. Defaults to 0.1.' },
    ],
    returns: 'The rate per period, or #NUM! if it cannot converge.',
    example: '=RATE(360, -1200, 250000)',
  },
  IPMT: {
    summary: 'Returns the interest portion of a payment for a given period.',
    params: [
      { name: 'rate', description: 'The interest rate per period.' },
      { name: 'per', description: 'The period of interest (1 to nper).' },
      { name: 'nper', description: 'The total number of periods.' },
      { name: 'pv', description: 'The present value.' },
      { name: 'fv', optional: true, description: 'The future value. Defaults to 0.' },
      { name: 'type', optional: true, description: '0 = end of period (default), 1 = beginning.' },
    ],
    returns: 'The interest paid in that period.',
    example: '=IPMT(0.04/12, 1, 360, 250000)',
  },
  PPMT: {
    summary: 'Returns the principal portion of a payment for a given period.',
    params: [
      { name: 'rate', description: 'The interest rate per period.' },
      { name: 'per', description: 'The period of interest (1 to nper).' },
      { name: 'nper', description: 'The total number of periods.' },
      { name: 'pv', description: 'The present value.' },
      { name: 'fv', optional: true, description: 'The future value. Defaults to 0.' },
      { name: 'type', optional: true, description: '0 = end of period (default), 1 = beginning.' },
    ],
    returns: 'The principal paid in that period.',
    example: '=PPMT(0.04/12, 1, 360, 250000)',
  },
  NPV: {
    summary: 'Returns the net present value of a series of cash flows.',
    params: [
      { name: 'rate', description: 'The discount rate per period.' },
      { name: 'value1, value2, …', description: 'Cash flows occurring at the end of each period.' },
    ],
    returns: 'The net present value.',
    example: '=NPV(0.1, -100, 60, 60)',
  },
  IRR: {
    summary: 'Returns the internal rate of return of a series of cash flows.',
    params: [
      { name: 'values', description: 'Cash flows; needs at least one negative and one positive.' },
      { name: 'guess', optional: true, description: 'A starting estimate. Defaults to 0.1.' },
    ],
    returns: 'The rate that makes NPV zero, or #NUM! if it cannot converge.',
    example: '=IRR({-100, 60, 60})',
  },
  MIRR: {
    summary: 'Returns the modified internal rate of return.',
    params: [
      { name: 'values', description: 'Cash flows with mixed signs.' },
      { name: 'finance_rate', description: 'The rate paid on negative cash flows.' },
      { name: 'reinvest_rate', description: 'The rate earned on positive cash flows.' },
    ],
    returns: 'The modified internal rate of return.',
    example: '=MIRR({-100, 60, 60}, 0.1, 0.12)',
  },
  SLN: {
    summary: 'Returns straight-line depreciation for one period.',
    params: [
      { name: 'cost', description: 'The initial cost of the asset.' },
      { name: 'salvage', description: 'The value at the end of its life.' },
      { name: 'life', description: 'The number of periods of useful life.' },
    ],
    returns: 'The depreciation per period (constant).',
    example: '=SLN(10000, 1000, 5)',
  },
  SYD: {
    summary: 'Returns sum-of-years-digits depreciation for a period.',
    params: [
      { name: 'cost', description: 'The initial cost of the asset.' },
      { name: 'salvage', description: 'The value at the end of its life.' },
      { name: 'life', description: 'The number of periods of useful life.' },
      { name: 'per', description: 'The period to compute (1 to life).' },
    ],
    returns: 'The depreciation for that period.',
    example: '=SYD(10000, 1000, 5, 1)',
  },
  DDB: {
    summary: 'Returns double-declining-balance depreciation for a period.',
    params: [
      { name: 'cost', description: 'The initial cost of the asset.' },
      { name: 'salvage', description: 'The value at the end of its life.' },
      { name: 'life', description: 'The number of periods of useful life.' },
      { name: 'period', description: 'The period to compute (1 to life).' },
      { name: 'factor', optional: true, description: 'The declining-balance rate. Defaults to 2.' },
    ],
    returns: 'The depreciation for that period.',
    example: '=DDB(10000, 1000, 5, 1)',
  },
  DB: {
    summary: 'Returns fixed-declining-balance depreciation for a period.',
    params: [
      { name: 'cost', description: 'The initial cost of the asset.' },
      { name: 'salvage', description: 'The value at the end of its life.' },
      { name: 'life', description: 'The number of periods of useful life.' },
      { name: 'period', description: 'The period to compute (1 to life).' },
      { name: 'month', optional: true, description: 'Months in the first year. Defaults to 12.' },
    ],
    returns: 'The depreciation for that period.',
    example: '=DB(10000, 1000, 5, 1)',
  },
};
