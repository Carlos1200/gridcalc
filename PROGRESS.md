# Estado del proyecto gridcalc

> Documento de seguimiento para sesiones de trabajo. Marcar ítems al completarlos.
> La especificación completa está en `docs/SPEC.md` (fuente de verdad del diseño).
> Última actualización: 2026-06-12.

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
- [x] `generate-fixtures.ts` probado y funcionando contra LibreOffice 26.2.4.2 (2026-06-10). Fixes que necesitó: declarar `xmlns:of` (sin él todo era Err:510), refs ODF `[.A1]` vía el lexer propio, booleanos como `TRUE()`, `IFS`/`CONCAT` como `COM.MICROSOFT.*`, soporte de `inputs` (un .fods por fixture, una sola invocación de soffice), campo `expected` manual para divergencias LO/Excel
- [ ] CI (GitHub Actions) cuando haya remoto

## Fase 1 — MVP núcleo (single sheet) ✅ COMPLETA (2026-06-10)

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
- [x] **~40 funciones de Fase 1, cada una con golden tests** (206 fixtures generados contra LibreOffice; las listas fuente viven en `tests/golden/formulas/*.json` y se regeneran con `npm run generate-fixtures`):
  - [x] math: SUM, ROUND, ROUNDUP, ROUNDDOWN, ABS, SQRT, POWER, MOD, INT
  - [x] statistical: AVERAGE, COUNT, COUNTA, MIN, MAX, SUMIF, COUNTIF
  - [x] logical: IF, IFS, AND, OR, NOT, IFERROR (IF/IFS/IFERROR lazy con cortocircuito; AND/OR eager — Excel NO cortocircuita: `=AND(FALSE,1/0)`→`#DIV/0!`)
  - [x] text: CONCAT, LEFT, RIGHT, MID, LEN, UPPER, LOWER, TRIM, TEXT (subset numérico: General/0/0.00/#,##0/%; formatos de fecha → Fase 4), VALUE
  - [x] lookup: VLOOKUP, HLOOKUP, INDEX, MATCH (sin comodines en lookups por ahora; COUNTIF/SUMIF sí los soportan con `~` escape)
  - [x] information: ISBLANK, ISNUMBER, ISTEXT, ISERROR (no propagan errores)
  - [x] datetime: TODAY, NOW (volátiles), DATE (normaliza overflow de mes/día, años 0-1899 suman 1900)
  - Divergencias LO/Excel documentadas con `expected` manual en las listas: LO trata booleanos como números (SUM/COUNT/AVERAGE/LEN/ISNUMBER), comodines desactivados por defecto, `Err:502` donde Excel da `#NUM!`/`#DIV/0!`/`#REF!`, coerción de texto en args directos de SUM/AVERAGE/MIN, CONCAT de booleanos
  - PRODUCT, CEILING, FLOOR y demás quedan para la expansión a ~150 (Fase 2)
- [x] `engine/Engine.ts` — `buildEmpty`, `setCellContents` (devuelve `ChangedCell[]`, solo celdas cuyo valor cambió), `getCellValue` (null = vacía), `getCellFormula`, `batch` (un solo recálculo; recalcula incluso si el callback lanza)
  - Contenido tecleado se parsea estilo Excel: `"42"`→42, `"TRUE"`→true; `null`/`""` limpia la celda
  - Resultado vacío de fórmula se materializa a 0 (`=A1` con A1 vacía); `-0` se normaliza a 0 (Excel no tiene cero negativo)
  - Ciclos: `#CIRCULAR!` asignado antes de evaluar el resto del plan, dependientes lo propagan; al romper el ciclo se recuperan los valores
- [x] Reemplazar el evaluador placeholder del harness golden (`tests/golden/harness.ts` → `evaluateFixture`) por el Engine real (fórmula en ZZ10000, inputs vía `setCellContents`)
- [x] Capa de redondeo compatible con Excel (`precisionRounding`): el resultado de `+`/`-` se ajusta a N dígitos significativos (`=0.1+0.2=0.3` → TRUE); multiplicación/división NO se ajustan, como Excel. Verificado con golden contra LibreOffice
- [x] Ejemplo en README: crear motor, `=SUM(A1:A3)`, editar A1, ver recálculo (ejecutado y verificado, salida real)
- [x] **Criterio de fase:** golden tests de las 40 funciones pasan (338 tests, 209 fixtures golden); editar una celda recalcula solo dependientes (test con contador de evaluaciones); ciclos → `#CIRCULAR!` con recuperación al romperlos

## Fase 2 — Multi-hoja y expansión 🔶 EN CURSO

- [x] Cross-sheet refs (`Sheet2!A1`, `'Mi Hoja'!A1:B2`, escape `''` para comillas)
  - Token `SHEET_NAME` en el lexer (identificador o nombre entrecomillado seguido de `!`)
  - El parser resuelve nombre→id vía `SheetLookup` (case-insensitive); hoja desconocida → literal `#REF!` **pegajoso** (no se recupera al crear la hoja después; hay que reescribir la fórmula, como Excel); rangos 3D entre hojas distintas → PARSE_ERROR
  - El sheet de `Sheet2!A1:B2` aplica al rango entero
- [x] `addSheet`/`removeSheet`/`getSheetNames` (+ `getSheetId`)
  - Ids de hoja **estables** (slot nunca se reutiliza): eliminar una hoja no desplaza los índices de las demás
  - `removeSheet` borra celdas, recalcula dependientes externos → leen `#REF!`; re-crear una hoja con el mismo nombre NO resucita referencias viejas
  - `buildEmpty()` arranca con `Sheet1`; nombres auto `SheetN` evitan colisiones
- [x] Named expressions (`=IVA`): `addNamedExpression`/`removeNamedExpression`/`listNamedExpressions`
  - Cada nombre es una **celda virtual** en la hoja reservada `NAMES_SHEET = -1` (col 0, row = id estable): el grafo recalcula usuarios cuando cambian los precedentes del nombre, detecta ciclos a través de nombres, y definir un nombre repara los `#NAME?` previos (el id se asigna en la primera mención, aunque aún no exista)
  - Contenido como el de una celda (escalar o fórmula); las refs dentro de un nombre deben ir calificadas con hoja (`=Sheet1!$A$1*2`) o lanza
  - Nombres case-insensitive; inválidos (`A1`, `TRUE`, `2x`) lanzan
- [x] Ajuste de referencias al copiar: `Engine.copyCell(source, target)`
  - `ast/serialize.ts`: serializador AST→fórmula con paréntesis mínimos por precedencia (round-trip garantizado por tests), prefijos de hoja con quoting solo cuando hace falta, separadores de locale
  - `adjustReferences`: desplaza partes relativas, respeta `$`, fuera de la cuadrícula → `#REF!`; valores se copian tal cual; fórmulas rotas (PARSE_ERROR) se copian verbatim
  - "Mover" (cut/paste con reescritura de referencias entrantes) queda pendiente para más adelante
- [x] Traducción de nombres de función en `i18n/`: las 40 funciones con nombres es-ES (`=SUMA`→SUM, `=SI.ERROR`→IFERROR...). El AST siempre lleva el nombre canónico inglés; el parser traduce al entrar y el serializador (y por tanto `copyCell`) emite el localizado. Los nombres canónicos se aceptan en cualquier locale
  - [x] Literales booleanos (`VERDADERO`/`FALSO`) y de error (`#¡DIV/0!`, `#N/D`, `#¿NOMBRE?`...) localizados (2026-06-12): el lexer/parser aceptan la grafía es además de la canónica; el serializador (y `copyCell`) emiten la localizada; errores sin grafía es (`#CIRCULAR!`, `#ERROR!`) conservan la canónica
- [x] Primera tanda de expansión: **66 funciones totales** (2026-06-11), todas con golden y nombre es
  - math: PRODUCT, CEILING, FLOOR, SUMPRODUCT — divergencia LO: con significancia negativa LO intercambia el redondeo de CEILING/FLOOR (`CEILING(-2.5,-2)` LO=-2, Excel=-4) y rechaza signo mixto `(-2.5, 2)` con Err:502; fixtures con `expected` manual a lo Excel
  - statistical: COUNTIFS, SUMIFS, AVERAGEIF, AVERAGEIFS (rangos de criterio con forma distinta → `#VALUE!`)
  - information: ISLOGICAL, ISNONTEXT, ISNA, ISERR + ISEVEN/ISODD (estos dos SÍ coercionan y propagan errores, como Excel)
  - datetime: YEAR/MONTH/DAY (serial 0 → 1900-01-00 estilo Excel con `expected` manual; LO usa epoch 1899-12-30), EDATE/EOMONTH (clamp de fin de mes), DATEDIF (unidades Y/M/D/YM/MD/YD; orden inverso o unidad desconocida → `#NUM!`)
  - text: SUBSTITUTE, REPLACE, FIND (case-sensitive; `FIND("",x)`→1 con `expected` manual, LO da `#VALUE!`), SEARCH (case-insensitive + comodines, `expected` manual porque LO los trae desactivados), REPT (tope 32767), TEXTJOIN (vía `COM.MICROSOFT.TEXTJOIN` en el generador)
  - lookup: CHOOSE (lazy: `=CHOOSE(1,2,1/0)`→2), LOOKUP (forma vector y forma array ancha/alta)
  - El lexer ahora acepta letras Unicode en identificadores (`=AÑO(...)`); las refs de celda siguen siendo ASCII vía su parser
- [x] Segunda tanda de expansión: **107 funciones totales** (2026-06-11), todas con golden y nombre es
  - math: TRUNC, SIGN, EXP, LN, LOG, LOG10, PI, EVEN, ODD
  - statistical: MEDIAN, MODE (empate → el primero visto), STDEV/VAR (muestrales, <2 números → `#DIV/0!`), LARGE/SMALL, RANK (valor ausente → `#N/A`), COUNTBLANK (cuenta vacías y `""`)
  - logical: XOR (impar de TRUEs), TRUE/FALSE, IFNA, SWITCH (lazy; comparación de texto case-insensitive fijada a Excel con `expected` manual; vía `COM.MICROSOFT.SWITCH` en el generador)
  - information: NA, N, T, ERROR.TYPE (códigos Excel 1-7 + SPILL→9; errores propios del motor → `#N/A`)
  - datetime: TIME (normaliza componentes y da la vuelta a medianoche: `TIME(27,0,0)`→0.125 fijado a Excel, LO devuelve >1; LO exporta el resultado formateado como hora → `expected` manual numérico), HOUR/MINUTE/SECOND, WEEKDAY (tipos 1/2/3/11-17)
  - text: PROPER, EXACT, CHAR/CODE (1-255, Excel; LO acepta >255 → `expected` manual), CONCATENATE (legacy, solo escalares), CLEAN
  - lookup: ROW/COLUMN (lazy, inspeccionan la referencia sin evaluarla; sin argumento responden por la celda de la fórmula — unit test, no golden: el harness evalúa en ZZ10000), ROWS/COLUMNS
  - Divergencia extra: `ERROR.TYPE(SQRT(-1))` en LO da `#N/A` (su SQRT(-1) es Err:502); fijado a 6 (`#NUM!` Excel)
- [x] Tercera tanda de expansión: **137 funciones totales** (2026-06-11), todas con golden y nombre es
  - math: SIN/COS/TAN/ASIN/ACOS/ATAN/ATAN2 (orden de args Excel: `ATAN2(x,y)`; `(0,0)`→`#DIV/0!`), RADIANS/DEGREES, SQRTPI, FACT (>170→`#NUM!`), COMBIN (forma multiplicativa), GCD/LCM (variádicas, negativos→`#NUM!`), ROMAN (solo forma clásica 0)/ARABIC
  - statistical: MAXIFS/MINIFS (sin match → 0; vía `COM.MICROSOFT.*` en el generador), PERCENTILE (interpolación lineal estilo .INC)/QUARTILE
  - datetime: DAYS, DAYS360 (métodos US/NASD y europeo), WEEKNUM (tipos 1/2/11-17 y 21 ISO), WORKDAY/NETWORKDAYS (festivos opcionales; intervalo invertido → negativo; golden vía comparación `=DATE(...)` porque LO exporta el resultado formateado como fecha)
  - text: UNICHAR/UNICODE (rechaza surrogates), FIXED (redondeo half-away, separador de miles; resultado sin comas fijado como string — el CSV lo convierte a número)
  - information: TYPE (1/2/4/16/64; `TYPE(TRUE)` fijado a 4 — LO da 1 porque trata booleanos como números), ISREF (lazy, inspecciona el AST)
  - YEARFRAC pospuesta (bases 30/360 y actual/actual con reglas Excel propias); OFFSET/INDIRECT siguen para Fase 3 (volátiles, grafo)
- [x] Cuarta tanda de expansión: **163 funciones totales** (2026-06-11) — ✅ objetivo de ~150 superado
  - math: SINH/COSH/TANH/ASINH/ACOSH/ATANH, MROUND (mitades alejándose de cero; signos distintos → `#NUM!`), SUMSQ, BASE/DECIMAL (radix 2-36; ojo: el nombre es de FIXED es `DECIMAL` y el de DECIMAL es `CONV.DECIMAL`), BITAND/BITOR/BITXOR/BITLSHIFT/BITRSHIFT (enteros en [0, 2^48) vía BigInt; decimales → `#NUM!`), DELTA/GESTEP
  - statistical: AVEDEV, DEVSQ, GEOMEAN/HARMEAN (solo positivos), STDEVP/VARP (poblacionales, denominador n), PERMUT
  - datetime: YEARFRAC (las 5 bases: 30/360 US y europeo, actual/actual con reglas Excel de denominador — mismo año bisiesto → 366, multianual → media de los años tocados —, actual/360, actual/365; orden de args indiferente, devuelve positivo)
  - lookup: ADDRESS (abs 1-4, estilos A1 y R1C1, hoja opcional con quoting `''` — fijado a sintaxis Excel `Hoja!$C$2`, LO emite `Hoja.$C$2`)
  - ISFORMULA/FORMULATEXT/SHEET/SHEETS pendientes: necesitan ampliar `EvaluationContext` (saber si una celda tiene fórmula / su texto / contar hojas)
- [x] Quinta tanda (expansión opcional, 2026-06-12): **176 funciones totales**, todas con golden y nombre es
  - statistical (regresión): COVAR, CORREL, SLOPE, INTERCEPT, FORECAST — pares no numéricos se saltan posicionalmente, tamaños distintos → `#N/A` (LO da Err:502, `expected` manual), sin datos o varianza cero → `#DIV/0!` (CORREL con rangos vacíos: LO da `#VALUE!`, fijado a `#DIV/0!` Excel)
  - distributions (`src/functions/distributions.ts`): NORM.DIST/NORMDIST, NORM.INV/NORMINV, NORM.S.DIST/NORMSDIST (la legacy es solo CDF), NORM.S.INV/NORMSINV — erf/erfc de Cody (SPECFUN) + inversa de Acklam con un paso de Halley; coincide con LO dentro de 1e-9 incluso en colas (`NORMSDIST(-8)`); sd ≤ 0 o p fuera de (0,1) → `#NUM!`
  - Generador: grafías modernas vía `COM.MICROSOFT.NORM.*`; las legacy NORMSDIST/NORMSINV en ODF son `LEGACY.NORMS*`
- [ ] Resto de la expansión opcional: DOLLAR, TEXTBEFORE/TEXTAFTER (TEXTSPLIT devuelve arrays → Fase 3), ISFORMULA/FORMULATEXT/SHEET/SHEETS (con extensión del contexto), OFFSET/INDIRECT (Fase 3)

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
