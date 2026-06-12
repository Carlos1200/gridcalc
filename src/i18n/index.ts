/**
 * Function-name localization. Canonical names are English and are what the
 * AST, the registry and the evaluator always use; localized spellings are a
 * parse/serialize-time concern. Canonical names are accepted in every locale.
 */

import type { EngineConfig } from '../config/types';
import type { CellErrorType } from '../value/types';
import { ES_BOOLEAN_LITERALS, ES_ERROR_LITERALS, ES_FUNCTION_NAMES } from './es';

const TO_CANONICAL: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  es: Object.fromEntries(
    Object.entries(ES_FUNCTION_NAMES).map(([canonical, localized]) => [localized, canonical]),
  ),
};

const TO_LOCALIZED: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  es: ES_FUNCTION_NAMES,
};

/** `SUMA` -> `SUM` under es; unknown or already-canonical names pass through. */
export function toCanonicalName(upperName: string, locale: EngineConfig['locale']): string {
  return TO_CANONICAL[locale]?.[upperName] ?? upperName;
}

/** `SUM` -> `SUMA` under es; functions without a translation keep their name. */
export function toLocalizedName(canonicalName: string, locale: EngineConfig['locale']): string {
  return TO_LOCALIZED[locale]?.[canonicalName] ?? canonicalName;
}

const BOOLEAN_LITERALS: Readonly<Record<string, Readonly<Record<'TRUE' | 'FALSE', string>>>> = {
  es: ES_BOOLEAN_LITERALS,
};

/**
 * The boolean a (already uppercased) word denotes, or undefined when it is
 * not a boolean literal. Canonical TRUE/FALSE work in every locale.
 */
export function booleanLiteralValue(
  upperText: string,
  locale: EngineConfig['locale'],
): boolean | undefined {
  if (upperText === 'TRUE' || upperText === BOOLEAN_LITERALS[locale]?.TRUE) {
    return true;
  }
  if (upperText === 'FALSE' || upperText === BOOLEAN_LITERALS[locale]?.FALSE) {
    return false;
  }
  return undefined;
}

/** TRUE -> VERDADERO under es; canonical spelling elsewhere. */
export function toLocalizedBoolean(value: boolean, locale: EngineConfig['locale']): string {
  return BOOLEAN_LITERALS[locale]?.[value ? 'TRUE' : 'FALSE'] ?? (value ? 'TRUE' : 'FALSE');
}

const ERROR_LITERALS_BY_LOCALE: Readonly<
  Record<string, ReadonlyArray<readonly [string, CellErrorType]>>
> = {
  es: ES_ERROR_LITERALS,
};

/** Extra error spellings accepted on input for the locale (longest first). */
export function localizedErrorLiterals(
  locale: EngineConfig['locale'],
): ReadonlyArray<readonly [string, CellErrorType]> {
  return ERROR_LITERALS_BY_LOCALE[locale] ?? [];
}

/** `#VALUE!` -> `#¡VALOR!` under es; canonical display elsewhere. */
export function toLocalizedErrorText(
  type: CellErrorType,
  canonicalDisplay: string,
  locale: EngineConfig['locale'],
): string {
  const match = ERROR_LITERALS_BY_LOCALE[locale]?.find(([, errorType]) => errorType === type);
  return match?.[0] ?? canonicalDisplay;
}
