/**
 * Site documentation generator: introspects the function registry the same
 * way a GraphQL playground introspects a schema. Categories come from the
 * source modules; arity/volatility/laziness from each function's metadata;
 * localized names from the i18n table. Emits site/functions.json.
 *
 * Usage: npx tsx scripts/generate-site-docs.ts
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { arrayFunctions } from '../src/functions/arrays';
import { datetimeFunctions } from '../src/functions/datetime';
import { distributionFunctions } from '../src/functions/distributions';
import { financialFunctions } from '../src/functions/financial';
import { informationFunctions } from '../src/functions/information';
import { logicalFunctions } from '../src/functions/logical';
import { lookupFunctions } from '../src/functions/lookup';
import { mathFunctions } from '../src/functions/math';
import { statisticalFunctions } from '../src/functions/statistical';
import { textFunctions } from '../src/functions/text';
import { FUNCTION_DOCS, type FunctionParamDoc } from '../src/functions/docs';
import type { RegisteredFunction } from '../src/functions/types';
import { ES_FUNCTION_NAMES } from '../src/i18n/es';

const CATEGORIES: ReadonlyArray<readonly [string, RegisteredFunction[]]> = [
  ['math', mathFunctions],
  ['statistical', statisticalFunctions],
  ['distributions', distributionFunctions],
  ['logical', logicalFunctions],
  ['text', textFunctions],
  ['lookup', lookupFunctions],
  ['information', informationFunctions],
  ['datetime', datetimeFunctions],
  ['arrays', arrayFunctions],
  ['financial', financialFunctions],
];

interface FunctionDoc {
  name: string;
  es: string;
  category: string;
  minArgs: number;
  /** null = variadic. */
  maxArgs: number | null;
  volatile: boolean;
  lazy: boolean;
  /** Prose documentation merged from FUNCTION_DOCS; null when undocumented. */
  summary: string | null;
  params: FunctionParamDoc[];
  paramReturns: string | null;
  example: string | null;
  exampleResult: string | null;
}

const docs: FunctionDoc[] = [];
const missing: string[] = [];
for (const [category, entries] of CATEGORIES) {
  for (const { metadata } of entries) {
    const doc = FUNCTION_DOCS[metadata.name];
    if (!doc) {
      missing.push(metadata.name);
    }
    docs.push({
      name: metadata.name,
      es: ES_FUNCTION_NAMES[metadata.name] ?? metadata.name,
      category,
      minArgs: metadata.minArgs,
      maxArgs: Number.isFinite(metadata.maxArgs) ? metadata.maxArgs : null,
      volatile: metadata.volatile === true,
      lazy: metadata.argHandling === 'lazy',
      summary: doc?.summary ?? null,
      params: doc?.params ?? [],
      paramReturns: doc?.returns ?? null,
      example: doc?.example ?? null,
      exampleResult: doc?.result ?? null,
    });
  }
}
docs.sort((a, b) => a.name.localeCompare(b.name));

const out = join(import.meta.dirname, '../site/functions.json');
writeFileSync(out, JSON.stringify({ count: docs.length, functions: docs }));
const documented = docs.length - missing.length;
console.log(`Wrote ${docs.length} function docs to site/functions.json (${documented} with prose).`);
if (missing.length > 0) {
  console.warn(`Missing prose for ${missing.length}: ${missing.join(', ')}`);
}
