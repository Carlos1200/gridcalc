/**
 * Function-name localization. Canonical names are English and are what the
 * AST, the registry and the evaluator always use; localized spellings are a
 * parse/serialize-time concern. Canonical names are accepted in every locale.
 */

import type { EngineConfig } from '../config/types';
import { ES_FUNCTION_NAMES } from './es';

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
