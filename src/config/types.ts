export interface EngineConfig {
  locale: 'en' | 'es';
  /** English locales use ","; many Spanish locales use ";". */
  argumentSeparator: ',' | ';';
  decimalSeparator: '.' | ',';
  /** Replicate Excel's phantom 1900-02-29 (default true for compatibility). */
  use1900LeapYearBug: boolean;
  /** Significant digits for Excel-compatible float rounding. */
  precisionRounding: number;
}

export const DEFAULT_CONFIG: EngineConfig = {
  locale: 'en',
  argumentSeparator: ',',
  decimalSeparator: '.',
  use1900LeapYearBug: true,
  precisionRounding: 14,
};

export function buildConfig(overrides?: Partial<EngineConfig>): EngineConfig {
  const config = { ...DEFAULT_CONFIG, ...overrides };
  if (config.argumentSeparator === ',' && config.decimalSeparator === ',') {
    throw new Error('argumentSeparator and decimalSeparator cannot both be ","');
  }
  return config;
}
