# Especificación Técnica — Motor de Cálculo de Fórmulas Headless

> **Documento de implementación para Claude Code.**
> Objetivo: construir un motor de fórmulas tipo Excel, headless (sin UI), en TypeScript, listo para publicarse como librería open source con doble licencia.
>
> Nombre de trabajo: `formula-engine` (verificar disponibilidad en npm y elegir nombre final antes de publicar — sugerencias: `calccore`, `gridcalc`, `formulon`).
>
> **Idioma del código:** todo el código, identificadores, comentarios técnicos y documentación pública van en **inglés** (es una librería de alcance global). La *localización* (nombres de función y separadores en español) es una **feature en runtime**, no el idioma del código fuente.

---

## 1. Qué es y por qué tiene valor

Una librería sin interfaz que recibe celdas con fórmulas (`=SUM(A1:B2)*2`) y devuelve sus valores calculados, manteniendo un grafo de dependencias para recalcular de forma incremental cuando algo cambia. Es el "cerebro" detrás de cualquier hoja de cálculo embebida, calculadora compleja, herramienta de presupuestos, simulador financiero o tabla con fórmulas dentro de una app.

**El foso (lo que hace que no lo repliquen):** la dificultad no es algorítmica, es de *cobertura*. Implementar cientos de funciones con la semántica EXACTA de Excel, todos sus tipos de error, su sistema de fechas, su precedencia de operadores y sus casos borde es trabajo tedioso y enorme que casi nadie quiere repetir. Cada función bien clavada y testeada contra Excel real es un ladrillo del foso.

**Referencia de mercado:** HyperFormula vende exactamente esto bajo doble licencia (GPLv3 + comercial). El objetivo no es competir de frente con ellos sino servir mejor un segmento (ver §16).

---

## 2. Modelo de negocio (contexto, no afecta el código aún)

- **Núcleo open source bajo AGPLv3** — funciona completo, pero su licencia "viral" obliga a abrir el código a quien lo embeba en producto cerrado.
- **Licencia comercial de pago** — para empresas que necesitan usarlo en software propietario/SaaS sin abrir su código.
- **Decisión de arquitectura derivada:** todo debe quedar en un único paquete embebible, sin dependencia de servicios externos, para que la propuesta "compras una licencia y lo metes en tu app" sea limpia. **Cero dependencias de runtime** es un objetivo de diseño fuerte (facilita auditoría, licenciamiento y confianza).

---

## 3. Decisiones técnicas

| Decisión | Elección | Razón |
|---|---|---|
| Lenguaje | TypeScript (estricto) | Tipado fuerte = menos bugs en un dominio lleno de casos borde; ecosistema npm |
| Dependencias runtime | **Cero** (objetivo) | Embebibilidad, auditabilidad, licenciamiento limpio |
| Build | tsup o tsc + esbuild | Salida ESM + CJS + tipos |
| Target | ES2020, navegador y Node | El motor es agnóstico de entorno |
| Tests | Vitest | Rápido, nativo TS |
| Precisión numérica | IEEE 754 (double) con redondeos compatibles con Excel | Ver §18 (riesgo conocido) |

**Principios:**
1. El motor es **headless y agnóstico**: no sabe nada de UI, archivos `.xlsx` ni DOM. Solo celdas, fórmulas y valores.
2. **Compatibilidad con Excel por defecto**, incluso replicando sus "bugs" históricos (ej. año bisiesto 1900) cuando sea necesario para coincidir.
3. **Inmutabilidad donde ayude** y mutación controlada en el grafo (rendimiento).
4. Cada función es un módulo aislado, testeable de forma independiente.

---

## 4. Arquitectura general

Pipeline de procesamiento de una fórmula:

```
texto "=SUM(A1:B2)*2"
   │
   ▼  Lexer
[tokens]
   │
   ▼  Parser
AST
   │
   ▼  Builder de dependencias  ──► Grafo de dependencias
   │
   ▼  Evaluator (recorre AST, resuelve referencias, llama funciones)
InterpreterValue (número | texto | booleano | error | array)
```

Módulos principales (cada uno una carpeta en `src/`):

- `lexer/` — texto → tokens
- `parser/` — tokens → AST
- `ast/` — definición de nodos del AST
- `reference/` — sistema de direcciones (A1, rangos, cross-sheet, nombrados)
- `dependency/` — grafo de dependencias + orden topológico + detección de ciclos
- `evaluator/` — recorrido del AST y resolución
- `functions/` — biblioteca de funciones (el foso), una subcarpeta por categoría
- `value/` — sistema de tipos, errores, coerciones, fechas
- `engine/` — la clase pública `Engine` que orquesta todo y expone la API
- `i18n/` — separadores y traducción de nombres de función
- `config/` — opciones del motor

---

## 5. Sistema de tipos y valores

```ts
// value/types.ts

export enum CellErrorType {
  DIV_BY_ZERO = 'DIV/0',   // #DIV/0!
  VALUE = 'VALUE',         // #VALUE!
  REF = 'REF',             // #REF!
  NAME = 'NAME',           // #NAME?
  NUM = 'NUM',             // #NUM!
  NA = 'NA',               // #N/A
  NULL = 'NULL',           // #NULL!
  SPILL = 'SPILL',         // #SPILL!  (fase 3)
  CIRCULAR = 'CIRCULAR',   // referencia circular
}

export class CellError {
  constructor(
    public readonly type: CellErrorType,
    public readonly message?: string,
  ) {}
}

// Valor escalar que puede vivir en una celda o producir una expresión
export type ScalarValue = number | string | boolean | CellError;

// Resultado de evaluar: escalar o array 2D (para dynamic arrays / spilling, fase 3)
export type InterpreterValue = ScalarValue | InterpreterValue[][];

export const EmptyValue = Symbol('empty'); // celda vacía ≠ 0 ≠ ""
```

**Reglas de tipos críticas (compatibles con Excel):**
- Celda vacía referenciada en aritmética → `0`; en concatenación → `""`; pero `ISBLANK` debe distinguirla.
- Booleanos en aritmética: `TRUE → 1`, `FALSE → 0`.
- Texto numérico (`"5"`) se coacciona a número en contexto aritmético; texto no numérico → `#VALUE!`.
- Cualquier operación con un `CellError` propaga ese error (salvo `IFERROR`, `ISERROR`, etc.).

**Fechas:** Excel representa fechas como **número de serie** desde el epoch `1899-12-30`. Implementar conversión serial↔fecha en `value/dates.ts`. **Replicar el bug del año bisiesto 1900** (Excel cree que 1900 fue bisiesto) para compatibilidad — documentarlo como decisión consciente y hacerlo configurable.

---

## 6. Sistema de referencias

```ts
// reference/types.ts

export interface SimpleCellAddress {
  sheet: number;   // índice de hoja
  col: number;     // 0-based
  row: number;     // 0-based
}

export interface CellReference {
  address: SimpleCellAddress;
  colAbsolute: boolean;  // $A
  rowAbsolute: boolean;  // $1
}

export interface RangeReference {
  start: CellReference;
  end: CellReference;
}
```

Debe soportar (por fase):
- **Fase 1:** `A1`, rangos `A1:B10`, absolutas/relativas `$A$1`, `$A1`, `A$1`.
- **Fase 2:** cross-sheet `Sheet2!A1`, `'Mi Hoja'!A1:B2`, nombres definidos (named expressions) `=IVA`, `=ventas_q1`.
- Conversión A1 ↔ índices (`colLetterToIndex`, `indexToColLetter`: `A→0`, `Z→25`, `AA→26`...).
- Ajuste de referencias relativas/absolutas al **copiar/mover** celdas (fase 2).

---

## 7. Lexer

Convierte el texto de la fórmula en tokens. Entrada: string que empieza con `=` (o un literal puro).

Tipos de token: `NUMBER`, `STRING`, `BOOLEAN`, `ERROR_LITERAL`, `CELL_REF`, `RANGE_OP (:)`, `FUNCTION_NAME`, `LPAREN`, `RPAREN`, `ARG_SEP (, o ;)`, `OP_PLUS`, `OP_MINUS`, `OP_MULT`, `OP_DIV`, `OP_POW`, `OP_CONCAT (&)`, `OP_PERCENT (%)`, `OP_EQ`, `OP_NEQ`, `OP_LT`, `OP_GT`, `OP_LTE`, `OP_GTE`, `NAMED_EXPR`, `ARRAY_OPEN ({)`, `ARRAY_CLOSE (})`, `WHITESPACE` (operador de intersección en Excel — relevante en fase 3).

Detalles: strings con comillas dobles, comillas escapadas (`""` dentro de string), notación científica (`1.5E-3`), separador de argumentos configurable (ver §13).

---

## 8. Parser

**Recursive descent** o **Pratt parser** (recomendado Pratt por la precedencia). Produce el AST.

### Precedencia de operadores (de mayor a menor, según Excel)

1. `:` (rango), espacio (intersección) — operadores de referencia
2. `-` unario (negación)
3. `%` (porcentaje, postfijo)
4. `^` (exponente)
5. `*` `/` (multiplicación, división)
6. `+` `-` (suma, resta)
7. `&` (concatenación)
8. `=` `<` `>` `<=` `>=` `<>` (comparación)

### Nodos del AST

```ts
// ast/nodes.ts
export type Ast =
  | NumberLiteral
  | StringLiteral
  | BooleanLiteral
  | ErrorLiteral
  | CellReferenceAst
  | RangeReferenceAst
  | NamedExpressionAst
  | FunctionCallAst
  | UnaryOpAst        // -x, +x, x%
  | BinaryOpAst       // x+y, x&y, x>y, x:y ...
  | ArrayLiteralAst;  // {1,2;3,4}  (fase 3)

export interface FunctionCallAst {
  type: 'FUNCTION_CALL';
  name: string;            // siempre normalizado a inglés (ver i18n)
  args: Ast[];
}
// ...resto de interfaces análogas
```

El parser debe ser **tolerante a errores** y producir un nodo de error parseable en vez de lanzar excepción cuando la fórmula es inválida (debe devolver `#NAME?` o `#ERROR!` según corresponda, como Excel).

---

## 9. Grafo de dependencias y recálculo

El corazón del rendimiento. Cuando una celda cambia, solo deben recalcularse sus dependientes, en el orden correcto.

```ts
// dependency/graph.ts
// Nodos del grafo: celdas, rangos y named expressions.
// Arista A → B significa "A depende de B" (A usa el valor de B).
```

Responsabilidades:
- Al parsear una fórmula, extraer sus referencias y registrar aristas.
- **Orden topológico** para recalcular (Kahn o DFS).
- **Detección de ciclos** con Tarjan (SCC). Un ciclo → todas las celdas del ciclo devuelven `#CIRCULAR` (o iteración si está activada, fase avanzada).
- **Recálculo incremental:** al editar una celda, marcar dirty solo su subárbol de dependientes y recomputar ese subconjunto en orden topológico.
- **Funciones volátiles** (`NOW`, `TODAY`, `RAND`, `RANDBETWEEN`, `OFFSET`, `INDIRECT`): se recalculan en cada ciclo aunque sus inputs no cambien. Marcarlas con un flag en su metadata.

---

## 10. Evaluator

Recorre el AST de una celda y produce un `InterpreterValue`.

```ts
// evaluator/interpreter.ts
export interface EvaluationContext {
  formulaAddress: SimpleCellAddress;  // dónde vive esta fórmula
  getCellValue(addr: SimpleCellAddress): InterpreterValue;
  getRangeValues(range: RangeReference): InterpreterValue[][];
  config: EngineConfig;
}
```

- Resuelve literales directamente.
- Resuelve referencias vía `context.getCellValue` (que dispara cálculo perezoso si la celda aún no se evaluó).
- Para `FunctionCallAst`, busca la función en el registro y la invoca con los argumentos evaluados.
- Propaga errores hacia arriba salvo en funciones que los capturan.
- Maneja coerciones de tipo según §5.

---

## 11. Biblioteca de funciones (el foso)

Cada función es un módulo con una **firma común** y metadata. Esto permite registrarlas, traducirlas y testearlas uniformemente.

```ts
// functions/types.ts
export interface FunctionMetadata {
  name: string;              // nombre canónico en inglés, ej. "SUM"
  minArgs: number;
  maxArgs: number;           // Infinity si variádico
  volatile?: boolean;
  // Cómo recibe cada argumento: escalar coaccionado, o rango crudo
  argHandling?: 'scalar' | 'range-aware';
}

export type FunctionImplementation = (
  args: InterpreterValue[],
  context: EvaluationContext,
) => InterpreterValue;

export interface RegisteredFunction {
  metadata: FunctionMetadata;
  fn: FunctionImplementation;
}
```

Organización por categoría en `functions/`:
- `math/` — SUM, PRODUCT, ROUND, ROUNDUP, ROUNDDOWN, ABS, SQRT, POWER, MOD, INT, CEILING, FLOOR, SIGN, EXP, LN, LOG, LOG10, TRUNC...
- `statistical/` — AVERAGE, COUNT, COUNTA, COUNTBLANK, MIN, MAX, MEDIAN, STDEV, VAR, RANK, LARGE, SMALL, AVERAGEIF, COUNTIF, SUMIF, SUMIFS, COUNTIFS, AVERAGEIFS...
- `logical/` — IF, IFS, AND, OR, NOT, XOR, IFERROR, IFNA, TRUE, FALSE, SWITCH...
- `text/` — CONCATENATE, CONCAT, LEFT, RIGHT, MID, LEN, UPPER, LOWER, PROPER, TRIM, SUBSTITUTE, REPLACE, FIND, SEARCH, TEXT, VALUE, REPT, TEXTJOIN, EXACT...
- `lookup/` — VLOOKUP, HLOOKUP, INDEX, MATCH, CHOOSE, OFFSET, INDIRECT, XLOOKUP, LOOKUP...
- `datetime/` — TODAY, NOW, DATE, TIME, YEAR, MONTH, DAY, HOUR, MINUTE, SECOND, WEEKDAY, DATEDIF, EDATE, EOMONTH, NETWORKDAYS, DATEVALUE...
- `information/` — ISBLANK, ISNUMBER, ISTEXT, ISERROR, ISERR, ISNA, ISLOGICAL, ISREF, NA, TYPE, N...
- `financial/` (fase 4, alto valor comercial) — PMT, FV, PV, RATE, NPV, IRR, NPER, IPMT, PPMT...

> **Regla de oro:** cada función nueva NO se considera terminada hasta que pasa sus golden tests contra Excel/LibreOffice (§14). El valor del proyecto es proporcional a cuántas funciones están *correctamente* clavadas, no a cuántas existen a medias.

---

## 12. API pública

```ts
// engine/Engine.ts
export class Engine {
  static buildEmpty(config?: Partial<EngineConfig>): Engine;
  static buildFromData(sheets: SheetData[], config?: Partial<EngineConfig>): Engine;

  // Hojas
  addSheet(name?: string): number;
  removeSheet(sheetId: number): void;
  getSheetNames(): string[];

  // Celdas
  setCellContents(addr: SimpleCellAddress, content: string | number | boolean | null): ChangedCell[];
  getCellValue(addr: SimpleCellAddress): InterpreterValue;
  getCellFormula(addr: SimpleCellAddress): string | undefined;
  getSheetValues(sheetId: number): InterpreterValue[][];

  // Lotes (rendimiento)
  batch(fn: () => void): ChangedCell[];   // suspende recálculo hasta el final

  // Nombres definidos (fase 2)
  addNamedExpression(name: string, expression: string): void;

  // Serialización (fase 4)
  toJSON(): SerializedEngine;
  static fromJSON(data: SerializedEngine): Engine;

  // Undo/redo (fase 4)
  undo(): void;
  redo(): void;
}

export interface ChangedCell {
  address: SimpleCellAddress;
  newValue: InterpreterValue;
}
```

`setCellContents` debe devolver **la lista de celdas cuyo valor cambió** (no solo la editada) — esto es lo que el consumidor usa para refrescar su UI. Es un detalle de DX que diferencia un motor bueno de uno usable.

---

## 13. Localización (diferenciador clave)

Soporte de primera clase para mercados no anglosajones — donde los grandes flaquean.

- **Separador de argumentos configurable:** inglés usa `,`; muchas configuraciones regionales en español usan `;`. Configurable en `EngineConfig.argumentSeparator`.
- **Separador decimal:** `.` vs `,` (cuando el separador de args es `;`, el decimal suele ser `,`).
- **Nombres de función traducidos:** el usuario puede escribir `=SUMA(A1:B2)` y el motor lo normaliza internamente a `SUM`. Mantener tablas de traducción en `i18n/` (empezar con `es` y `en`). El AST **siempre** guarda el nombre canónico en inglés; la traducción ocurre al parsear (entrada) y al serializar la fórmula (salida).

```ts
// config/types.ts
export interface EngineConfig {
  locale: 'en' | 'es';
  argumentSeparator: ',' | ';';
  decimalSeparator: '.' | ',';
  use1900LeapYearBug: boolean;   // default true (compat Excel)
  precisionRounding: number;     // dígitos para redondeo compatible
  // ...
}
```

---

## 14. Estrategia de pruebas (ESTO ES EL FOSO — máxima prioridad)

La compatibilidad no se "afirma", se **demuestra** con tests contra una hoja de cálculo real. Montar esto desde la Fase 0.

**Golden tests:**
1. Crear archivos `.ods`/`.xlsx` de referencia con fórmulas y sus valores esperados.
2. Generar los valores esperados con **LibreOffice headless** (`libreoffice --headless --convert-to csv ...`) o un set de referencia derivado de Excel.
3. Guardar como fixtures JSON: `{ formula, inputs, expected }`.
4. Test que parsea+evalúa cada fórmula y compara con `expected` (con tolerancia de punto flotante donde aplique).

**Estructura:**
```
tests/
  golden/
    math.fixtures.json
    text.fixtures.json
    lookup.fixtures.json
    ...
  unit/        # lexer, parser, graph aislados
  integration/ # recálculo, dependencias, edición
```

**Cobertura mínima por función:** caso normal, argumentos en el borde (vacío, 0, negativo, texto), tipos incorrectos (debe dar el error correcto), rangos, errores propagados. Una función sin estos casos no se mergea.

Incluir además un **script generador** que, dado un set de fórmulas, las corra por LibreOffice y produzca el fixture automáticamente — así crecer la suite de compatibilidad es barato.

---

## 15. Rendimiento (no optimizar prematuramente)

Objetivos a tener en mente, no a alcanzar en Fase 1:
- Cálculo perezoso + memoización por celda.
- Recálculo incremental real (solo dependientes dirty).
- Modo `batch` que suspende recálculo.
- Objetivo aspiracional: manejar hojas de ~100k–1M celdas con recálculos parciales sub-100ms.

En Fase 1: que sea **correcto**. La optimización viene cuando haya tests que garanticen que no se rompe nada.

---

## 16. Estructura de carpetas

```
formula-engine/
├── src/
│   ├── lexer/
│   ├── parser/
│   ├── ast/
│   ├── reference/
│   ├── dependency/
│   ├── evaluator/
│   ├── functions/
│   │   ├── math/
│   │   ├── statistical/
│   │   ├── logical/
│   │   ├── text/
│   │   ├── lookup/
│   │   ├── datetime/
│   │   ├── information/
│   │   ├── registry.ts      # registro central de funciones
│   │   └── types.ts
│   ├── value/
│   ├── engine/
│   ├── i18n/
│   ├── config/
│   └── index.ts             # API pública exportada
├── tests/
│   ├── golden/
│   ├── unit/
│   └── integration/
├── scripts/
│   └── generate-fixtures.ts # corre LibreOffice y genera golden fixtures
├── package.json
├── tsconfig.json
├── README.md
└── LICENSE                  # AGPL-3.0
```

---

## 17. Roadmap por fases (con criterios de aceptación)

### Fase 0 — Setup
- Repo, TS estricto, Vitest, build dual ESM/CJS, lint.
- Harness de golden tests + script generador con LibreOffice.
- **Criterio:** un test "dummy" pasa por todo el pipeline de CI.

### Fase 1 — MVP núcleo (single sheet)
- Lexer + Parser (Pratt) con toda la precedencia de §8.
- Sistema de tipos, errores y fechas (§5).
- Referencias A1, rangos, absolutas/relativas (§6, fase 1).
- Grafo de dependencias + recálculo incremental + detección de ciclos (§9).
- Evaluator (§10).
- **~40 funciones esenciales:** SUM, AVERAGE, COUNT, COUNTA, MIN, MAX, IF, IFS, AND, OR, NOT, IFERROR, ROUND, ROUNDUP, ROUNDDOWN, ABS, SQRT, POWER, MOD, INT, CONCAT, LEFT, RIGHT, MID, LEN, UPPER, LOWER, TRIM, TEXT, VALUE, VLOOKUP, HLOOKUP, INDEX, MATCH, ISBLANK, ISNUMBER, ISTEXT, ISERROR, TODAY, NOW, DATE, SUMIF, COUNTIF.
- API: `buildEmpty`, `setCellContents`, `getCellValue`, `getCellFormula`, `batch`.
- **Criterio:** todas las funciones de la lista pasan golden tests; editar una celda recalcula correctamente solo sus dependientes; ciclos devuelven `#CIRCULAR`. **En este punto ya hay algo demostrable y casi vendible.**

### Fase 2 — Multi-hoja y expansión
- Cross-sheet refs, named expressions.
- Ajuste de referencias al copiar/mover.
- Localización de separadores y nombres de función (§13).
- Subir a ~150 funciones (completar categorías math/text/stat/logical/lookup/datetime).
- **Criterio:** golden tests multi-hoja y de localización (`=SUMA(...;...)`) pasan.

### Fase 3 — Dynamic arrays
- Spilling, `#SPILL!`, arrays como valores.
- Funciones modernas: FILTER, SORT, SORTBY, UNIQUE, SEQUENCE, XLOOKUP, XMATCH.
- Funciones volátiles bien integradas en el ciclo de recálculo.
- **Criterio:** una fórmula que "derrama" un rango actualiza correctamente las celdas adyacentes y marca `#SPILL!` ante colisión.

### Fase 4 — Producto
- Serialización `toJSON`/`fromJSON`, undo/redo.
- Categoría financiera (PMT, NPV, IRR...) — alto valor comercial.
- Optimización de rendimiento sobre benchmarks.
- **Criterio:** benchmark de recálculo en grid grande dentro de objetivo; round-trip de serialización idéntico.

### Fase 5 — Comercial
- Empaquetado de licencia (AGPL en el repo público; build comercial).
- README, docs, demos, sitio.
- (Decidir luego qué, si algo, queda como "Pro" vs todo bajo doble licencia.)

---

## 18. Lo que NO se hace en v1 (disciplina de alcance)

- Sin lectura/escritura de `.xlsx` (eso es otra librería; el motor es agnóstico).
- Sin UI, sin renderizado, sin DOM.
- Sin iteración de referencias circulares (solo detección).
- Sin formato de celdas (negritas, colores): el motor calcula valores, no estilos. (El *formato numérico* de `TEXT` sí, porque afecta el valor de salida.)
- Sin colaboración en tiempo real.

---

## 19. Riesgos técnicos conocidos

1. **Punto flotante.** Excel hace redondeos y correcciones específicas (ej. `0.1 + 0.2`). Implementar una capa de redondeo compatible (`precisionRounding`) y cubrirla con golden tests. Es la fuente #1 de discrepancias sutiles.
2. **Semántica exacta de errores.** Cuándo es `#VALUE!` vs `#NUM!` vs `#N/A` es específico por función; solo los golden tests lo garantizan.
3. **Coerciones de tipo.** Las reglas de Excel (texto↔número, vacío↔0/"") son inconsistentes a propósito; documentarlas en `value/coercion.ts` con tests.
4. **Fechas.** Bug del año bisiesto 1900, sistemas de fecha 1900 vs 1904, husos horarios en `NOW`.
5. **Rendimiento del grafo** en hojas grandes con muchas dependencias cruzadas — dejar para Fase 4 pero no pintarse en una arquitectura que lo imposibilite.

---

## 20. Primeros pasos para Claude Code

1. Inicializa el repo con la estructura de §16, TS estricto, Vitest y build dual.
2. Monta el harness de golden tests y el script `generate-fixtures.ts` con LibreOffice headless **antes** de escribir funciones.
3. Implementa `value/` (tipos, errores, coerciones, fechas) con sus tests unitarios.
4. Implementa `lexer/` → `parser/` (Pratt, precedencia completa) → `ast/`, con tests de parsing.
5. Implementa `reference/` (A1 ↔ índices, rangos).
6. Implementa `dependency/` (grafo, topo-sort, ciclos) y `evaluator/`.
7. Implementa el registro de funciones y las **~40 funciones de Fase 1**, cada una con sus golden tests.
8. Expón la clase `Engine` con la API de Fase 1.
9. Entrega un ejemplo mínimo en el README: crear motor, escribir `=SUM(A1:A3)`, leer el valor, cambiar `A1` y ver el recálculo.

> Empieza pequeño y correcto. Una sola función mal clavada erosiona la confianza en todo el motor; una suite de golden tests que crece es lo que construye el foso.
