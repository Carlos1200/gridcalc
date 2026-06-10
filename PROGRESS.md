# Estado del proyecto gridcalc

> Documento de seguimiento para sesiones de trabajo. Marcar ítems al completarlos.
> La especificación completa está en `docs/SPEC.md` (fuente de verdad del diseño).
> Última actualización: 2026-06-10.

## Decisiones tomadas

- **Nombre:** `gridcalc` (verificado libre en npm el 2026-06-09; `formula-engine` también estaba libre, `calccore` y `formulon` tomados).
- **Errores de sintaxis:** las fórmulas inválidas no lanzan excepción; producen un nodo `PARSE_ERROR` que evalúa a `#ERROR!` (tipo `CellErrorType.ERROR`, misma convención que HyperFormula). La spec mencionaba `#NAME?` o `#ERROR!`; se eligió `#ERROR!` para sintaxis y `#NAME?` quedará para nombres/funciones desconocidos en evaluación.
- **`CellReference` aplanado:** en vez del `{ address, colAbsolute, rowAbsolute }` anidado de la spec, se usa `{ sheet?, col, row, colAbsolute, rowAbsolute }` con `sheet` omitido = "misma hoja que la fórmula" (cross-sheet es Fase 2).
- **Serial 60 (29/2/1900 fantasma):** al convertir serial→fecha con el bug activado, el serial 60 mapea a 1900-02-28 (documentado en `src/value/dates.ts`).
- **Whitespace como operador de intersección:** ignorado por ahora (Fase 3); el lexer se salta los espacios.
- **Commits:** incrementales, en inglés, sin línea de co-author.

## Fase 0 — Setup ✅ COMPLETA

- [x] Repo con estructura de la spec §16, git inicializado
- [x] TypeScript estricto (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, etc.)
- [x] Vitest, ESLint (flat config + typescript-eslint), build dual ESM/CJS/tipos con tsup
- [x] Licencia AGPL-3.0, README
- [x] Harness de golden tests (`tests/golden/harness.ts`): carga `*.fixtures.json`, tolerancia de punto flotante, errores comparados por display string (`#DIV/0!`)
- [x] Fixture dummy pasa por todo el pipeline (criterio de aceptación de Fase 0)
- [x] `scripts/generate-fixtures.ts`: genera `.fods`, lo corre por LibreOffice headless, emite fixtures JSON
- [ ] ⚠️ Probar `generate-fixtures.ts` de verdad — **requiere instalar LibreOffice** (`brew install --cask libreoffice`); está escrito pero sin ejecutar
- [ ] CI (GitHub Actions) cuando haya remoto

## Fase 1 — MVP núcleo (single sheet) 🔶 EN CURSO

- [x] `value/types.ts` — `CellError`, `CellErrorType`, `EmptyValue` (símbolo ≠ 0 ≠ ""), `ScalarValue`, `InterpreterValue`
- [x] `value/coercion.ts` — reglas Excel: booleanos→1/0, texto numérico (científica y `%`), `""`→`#VALUE!` pero celda vacía→0, propagación de errores
- [x] `value/dates.ts` — seriales desde epoch 1899-12-30, bug bisiesto 1900 configurable, fracciones de tiempo (verificado: 2008-01-01 = 39448)
- [x] `config/` — `EngineConfig` (locale, separadores, `use1900LeapYearBug`, `precisionRounding`) + `buildConfig` con validación
- [x] `reference/` — A1 ↔ índices 0-based (`colLetterToIndex`/`indexToColLetter`), parsing/formato de refs relativas/absolutas
- [x] `lexer/` — tokenizador consciente de locale (`=SUM(1,5;2)` en config es), strings escapados, notación científica, literales de error, desambiguación celda-vs-función estilo Excel (`LOG10` vs `LOG10()`)
- [x] `parser/` — Pratt con precedencia Excel completa (§8): `^` asociativo izquierda, `-` unario más fuerte que `^` (`-2^2=4`), `%` postfijo, rangos, argumentos omitidos (`=IF(1,,2)`), tolerante a errores
- [x] `ast/` — todos los nodos incl. `EmptyArgAst`, `ParseErrorAst`, `ArrayLiteralAst` (este último se parsea en Fase 3)
- [x] `dependency/` — grafo de dependencias
  - [x] Extracción de referencias del AST (`extract.ts`: celdas, rangos normalizados, named expressions, dedupe)
  - [x] Orden topológico + detección de ciclos en un solo paso: Tarjan iterativo (SCC) sobre el subgrafo dirty; emite SCCs en orden precedentes-primero
  - [x] Recálculo incremental: `getRecalculationPlan(changed)` → `{ order, cyclic }`; dirty = clausura de dependientes; celdas en ciclo → el engine les asignará `#CIRCULAR!` y sus dependientes lo propagan como valor
  - [x] Flag de volátiles (`VOLATILE_FUNCTIONS`: NOW, TODAY, RAND, RANDBETWEEN, OFFSET, INDIRECT) detectado en el AST; las volátiles entran en todo plan
  - Nota: los rangos se expanden a aristas por celda al registrar la fórmula (suficiente para Fase 1; nodos-rango estilo HyperFormula quedan como optimización futura)
- [x] `evaluator/` — `evaluateAst` + `EvaluationContext` (`getCellValue`/`getRangeValues` devuelven `RawScalarValue`, con `EmptyValue`)
  - Operadores con coerciones Excel: aritmética (`/0`→`#DIV/0!`, `0^0` y NaN/overflow→`#NUM!`), `&`, comparaciones sin coerción cruzada (number < text < logical, texto case-insensitive, vacío adopta el tipo del otro lado), `%` postfijo, `+` unario no-op (incluso sobre texto)
  - Propagación de errores: operandos izquierda-primero; error real gana a fallo de coerción; rango en contexto escalar → `#VALUE!` (sin intersección implícita en Fase 1)
  - Las funciones reciben args crudos (eager) o ASTs (lazy para IF/IFERROR/AND/OR con cortocircuito); cada función hace sus propias coerciones
- [x] `functions/registry.ts` — `FunctionRegistry` por motor (case-insensitive, duplicados lanzan), metadata (`minArgs`/`maxArgs`/`volatile`/`argHandling: scalar|range-aware|lazy`); arity inválida → `#N/A`, función desconocida → `#NAME?`
  - Pendiente: unificar `VOLATILE_FUNCTIONS` (hoy set estático en `dependency/extract.ts`) con el flag `volatile` del registro cuando existan las funciones
- [ ] **~40 funciones de Fase 1, cada una con golden tests:** ← SIGUIENTE PASO
  - [ ] math: SUM, ROUND, ROUNDUP, ROUNDDOWN, ABS, SQRT, POWER, MOD, INT
  - [ ] statistical: AVERAGE, COUNT, COUNTA, MIN, MAX, SUMIF, COUNTIF
  - [ ] logical: IF, IFS, AND, OR, NOT, IFERROR
  - [ ] text: CONCAT, LEFT, RIGHT, MID, LEN, UPPER, LOWER, TRIM, TEXT, VALUE
  - [ ] lookup: VLOOKUP, HLOOKUP, INDEX, MATCH
  - [ ] information: ISBLANK, ISNUMBER, ISTEXT, ISERROR
  - [ ] datetime: TODAY, NOW, DATE
- [ ] `engine/Engine.ts` — `buildEmpty`, `setCellContents` (devuelve `ChangedCell[]`), `getCellValue`, `getCellFormula`, `batch`
- [ ] Reemplazar el evaluador placeholder del harness golden (`tests/golden/harness.ts` → `evaluateFixture`) por el Engine real
- [ ] Capa de redondeo compatible con Excel (`precisionRounding`) — riesgo #1 de la spec §19
- [ ] Ejemplo en README: crear motor, `=SUM(A1:A3)`, editar A1, ver recálculo
- [ ] **Criterio de fase:** golden tests de las 40 funciones pasan; editar una celda recalcula solo dependientes; ciclos → `#CIRCULAR`

## Fase 2 — Multi-hoja y expansión ⬜ PENDIENTE

- [ ] Cross-sheet refs (`Sheet2!A1`, `'Mi Hoja'!A1:B2`)
- [ ] Named expressions (`=IVA`) — el parser ya produce `NamedExpressionAst`
- [ ] Ajuste de referencias al copiar/mover (los flags absolute ya se guardan)
- [ ] Traducción de nombres de función (`=SUMA(...)` → SUM) en `i18n/` — separadores ya soportados
- [ ] Subir a ~150 funciones
- [ ] `addSheet`/`removeSheet`/`getSheetNames`, `addNamedExpression`

## Fase 3 — Dynamic arrays ⬜ PENDIENTE

- [ ] Spilling, `#SPILL!`, arrays como valores
- [ ] Array literals `{1,2;3,4}` (el lexer ya emite `{`/`}`; el parser hoy devuelve PARSE_ERROR)
- [ ] Whitespace como operador de intersección
- [ ] FILTER, SORT, SORTBY, UNIQUE, SEQUENCE, XLOOKUP, XMATCH
- [ ] Volátiles bien integradas en el ciclo de recálculo

## Fase 4 — Producto ⬜ PENDIENTE

- [ ] `toJSON`/`fromJSON`, undo/redo
- [ ] Funciones financieras (PMT, FV, PV, NPV, IRR...)
- [ ] Benchmarks y optimización (objetivo: recálculo parcial sub-100ms en ~100k+ celdas)
- [ ] Mejorar `numberToText` a fidelidad de formato General de Excel

## Fase 5 — Comercial ⬜ PENDIENTE

- [ ] Decidir nombre definitivo en npm y publicar (gridcalc estaba libre el 2026-06-09)
- [ ] Empaquetado doble licencia (AGPL público + build comercial)
- [ ] Docs, demos, sitio

## Comandos

```sh
npm test            # toda la suite (unit + golden)
npm run typecheck
npm run lint
npm run build       # ESM + CJS + d.ts en dist/
npm run generate-fixtures -- formulas.json tests/golden/fixtures/x.fixtures.json
```

## Regla de oro (de la spec §11/§14)

Una función NO está terminada hasta pasar golden tests generados contra LibreOffice/Excel: caso normal, bordes (vacío, 0, negativo, texto), tipos incorrectos con el error exacto, rangos y errores propagados.
