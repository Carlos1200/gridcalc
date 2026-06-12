/**
 * Formula text -> tokens. Locale-aware: the argument separator and decimal
 * separator come from the engine config (`=SUM(1,5;2)` in es locales).
 *
 * Whitespace is currently skipped; Excel's space-as-intersection operator
 * is a phase-3 concern.
 */

import { CellErrorType } from '../value/types';
import { DEFAULT_CONFIG, type EngineConfig } from '../config/types';
import { booleanLiteralValue, localizedErrorLiterals } from '../i18n';
import { parseCellReference } from '../reference/addressing';
import { TokenType, type Token } from './tokens';

/** Internal signal for unlexable/unparsable input; callers convert it to #ERROR!. */
export class FormulaSyntaxError extends Error {}

/** Longest first, so prefix overlaps resolve correctly. */
const ERROR_LITERALS: ReadonlyArray<readonly [string, CellErrorType]> = [
  ['#CIRCULAR!', CellErrorType.CIRCULAR],
  ['#DIV/0!', CellErrorType.DIV_BY_ZERO],
  ['#VALUE!', CellErrorType.VALUE],
  ['#SPILL!', CellErrorType.SPILL],
  ['#ERROR!', CellErrorType.ERROR],
  ['#NULL!', CellErrorType.NULL],
  ['#NAME?', CellErrorType.NAME],
  ['#NUM!', CellErrorType.NUM],
  ['#REF!', CellErrorType.REF],
  ['#N/A', CellErrorType.NA],
];

export function errorLiteralToType(
  text: string,
  locale: EngineConfig['locale'] = DEFAULT_CONFIG.locale,
): CellErrorType {
  const upper = text.toUpperCase();
  const match = [...localizedErrorLiterals(locale), ...ERROR_LITERALS].find(
    ([literal]) => literal === upper,
  );
  if (!match) {
    throw new FormulaSyntaxError(`Unknown error literal "${text}"`);
  }
  return match[1];
}

const SINGLE_CHAR_TOKENS: Readonly<Record<string, TokenType>> = {
  '+': TokenType.OP_PLUS,
  '-': TokenType.OP_MINUS,
  '*': TokenType.OP_MULT,
  '/': TokenType.OP_DIV,
  '^': TokenType.OP_POW,
  '&': TokenType.OP_CONCAT,
  '%': TokenType.OP_PERCENT,
  '=': TokenType.OP_EQ,
  '<': TokenType.OP_LT,
  '>': TokenType.OP_GT,
  '(': TokenType.LPAREN,
  ')': TokenType.RPAREN,
  ':': TokenType.RANGE_OP,
  '{': TokenType.ARRAY_OPEN,
  '}': TokenType.ARRAY_CLOSE,
  '\\': TokenType.ARRAY_COL_SEP,
};

const isDigit = (ch: string): boolean => ch >= '0' && ch <= '9';
// Any Unicode letter: localized function names and named expressions may
// carry accents or Ñ (=AÑO(...)); cell references stay ASCII via their parser.
const isLetter = (ch: string): boolean => /\p{L}/u.test(ch);
const isWhitespace = (ch: string): boolean => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
const isIdentStart = (ch: string): boolean => isLetter(ch) || ch === '_' || ch === '$';
const isIdentChar = (ch: string): boolean =>
  isLetter(ch) || isDigit(ch) || ch === '_' || ch === '.' || ch === '$';

/** Tokenizes a formula body (text after the leading "="). */
export function tokenize(input: string, config: EngineConfig = DEFAULT_CONFIG): Token[] {
  const decimalSep = config.decimalSeparator;
  const tokens: Token[] = [];
  let i = 0;

  const push = (type: TokenType, start: number): void => {
    tokens.push({ type, text: input.slice(start, i), start });
  };

  while (i < input.length) {
    const start = i;
    const ch = input[i]!;

    if (isWhitespace(ch)) {
      i++;
      continue;
    }

    // Number: digits, optional decimal part, optional exponent.
    if (isDigit(ch) || (ch === decimalSep && isDigit(input[i + 1] ?? ''))) {
      while (i < input.length && isDigit(input[i]!)) i++;
      if (input[i] === decimalSep) {
        i++;
        while (i < input.length && isDigit(input[i]!)) i++;
      }
      if (input[i] === 'e' || input[i] === 'E') {
        let j = i + 1;
        if (input[j] === '+' || input[j] === '-') j++;
        if (isDigit(input[j] ?? '')) {
          i = j + 1;
          while (i < input.length && isDigit(input[i]!)) i++;
        }
      }
      push(TokenType.NUMBER, start);
      continue;
    }

    // String: double quotes, "" escapes a quote.
    if (ch === '"') {
      i++;
      for (;;) {
        if (i >= input.length) {
          throw new FormulaSyntaxError('Unterminated string literal');
        }
        if (input[i] === '"') {
          if (input[i + 1] === '"') {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      push(TokenType.STRING, start);
      continue;
    }

    // Error literal: #DIV/0!, #N/A, and localized spellings (#¡DIV/0!...).
    if (ch === '#') {
      const rest = input.slice(i).toUpperCase();
      const literal = [...localizedErrorLiterals(config.locale), ...ERROR_LITERALS].find(
        ([text]) => rest.startsWith(text),
      );
      if (!literal) {
        throw new FormulaSyntaxError(`Unknown error literal at position ${i}`);
      }
      i += literal[0].length;
      push(TokenType.ERROR_LITERAL, start);
      continue;
    }

    // Quoted sheet name: 'My Sheet'!A1, with '' escaping a quote.
    if (ch === "'") {
      i++;
      for (;;) {
        if (i >= input.length) {
          throw new FormulaSyntaxError('Unterminated sheet name');
        }
        if (input[i] === "'") {
          if (input[i + 1] === "'") {
            i += 2;
            continue;
          }
          i++;
          break;
        }
        i++;
      }
      if (input[i] !== '!') {
        throw new FormulaSyntaxError(`Expected "!" after sheet name at position ${i}`);
      }
      push(TokenType.SHEET_NAME, start); // text keeps the quotes; the parser unescapes
      i++; // consume the "!"
      continue;
    }

    // Identifier: cell ref, function name, boolean, named expression, or an
    // unquoted sheet name when "!" follows immediately (Sheet2!A1).
    // A "(" after the word wins: LOG10 is a valid cell address (column LOG,
    // row 10), but LOG10(...) is the function — same disambiguation as Excel.
    if (isIdentStart(ch)) {
      i++;
      while (i < input.length && isIdentChar(input[i]!)) i++;
      const text = input.slice(start, i);
      if (input[i] === '!') {
        tokens.push({ type: TokenType.SHEET_NAME, text, start });
        i++; // consume the "!"
        continue;
      }
      let j = i;
      while (j < input.length && isWhitespace(input[j]!)) j++;
      let type: TokenType;
      if (input[j] === '(') {
        type = TokenType.FUNCTION_NAME;
      } else if (parseCellReference(text)) {
        type = TokenType.CELL_REF;
      } else if (booleanLiteralValue(text.toUpperCase(), config.locale) !== undefined) {
        type = TokenType.BOOLEAN;
      } else {
        type = TokenType.NAMED_EXPR;
      }
      tokens.push({ type, text, start });
      continue;
    }

    if (ch === config.argumentSeparator) {
      i++;
      push(TokenType.ARG_SEP, start);
      continue;
    }

    // `;` that is not the argument separator only appears in array literals.
    if (ch === ';') {
      i++;
      push(TokenType.ARRAY_ROW_SEP, start);
      continue;
    }

    const pair = input.slice(i, i + 2);
    if (pair === '<>' || pair === '<=' || pair === '>=') {
      i += 2;
      push(pair === '<>' ? TokenType.OP_NEQ : pair === '<=' ? TokenType.OP_LTE : TokenType.OP_GTE, start);
      continue;
    }

    const single = SINGLE_CHAR_TOKENS[ch];
    if (single !== undefined) {
      i++;
      push(single, start);
      continue;
    }

    throw new FormulaSyntaxError(`Unexpected character "${ch}" at position ${i}`);
  }

  tokens.push({ type: TokenType.END, text: '', start: input.length });
  // Whitespace is skipped above; recover it as a flag so the parser can see
  // Excel's intersection operator (`=SUM(A1:B3 B2:C4)`).
  for (const token of tokens) {
    if (token.start > 0 && isWhitespace(input[token.start - 1]!)) {
      token.spaceBefore = true;
    }
  }
  return tokens;
}
