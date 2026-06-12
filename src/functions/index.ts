import { FunctionRegistry } from './registry';
import { arrayFunctions } from './arrays';
import { datetimeFunctions } from './datetime';
import { distributionFunctions } from './distributions';
import { informationFunctions } from './information';
import { logicalFunctions } from './logical';
import { lookupFunctions } from './lookup';
import { mathFunctions } from './math';
import { statisticalFunctions } from './statistical';
import { textFunctions } from './text';

/** The built-in function library every new Engine starts with. */
export function buildDefaultRegistry(): FunctionRegistry {
  const registry = new FunctionRegistry();
  for (const entry of [
    ...mathFunctions,
    ...statisticalFunctions,
    ...distributionFunctions,
    ...arrayFunctions,
    ...logicalFunctions,
    ...textFunctions,
    ...lookupFunctions,
    ...informationFunctions,
    ...datetimeFunctions,
  ]) {
    registry.register(entry);
  }
  return registry;
}
