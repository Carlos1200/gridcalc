/* gridcalc site · the playground runs the real engine (gridcalc.js = dist ESM build). */

import {
  Engine,
  buildConfig,
  parseFormula,
  serializeAst,
  isCellError,
} from '../gridcalc.js';

// TODO(repo): set once the repository is public.
const REPO_URL = 'https://github.com/';

const COLS = 8;
const ROWS = 8;
const EN = buildConfig({});
const ES = buildConfig({ locale: 'es', argumentSeparator: ';', decimalSeparator: ',' });

const $ = (id) => document.getElementById(id);
const colName = (c) => String.fromCharCode(65 + c);
const addr = (col, row) => ({ sheet: 0, col, row });
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

document.querySelectorAll('[data-repo-link]').forEach((a) => (a.href = REPO_URL));

/* ── value formatting ───────────────────────────────────────────────── */
function fmt(value) {
  if (value === null) return '';
  if (isCellError(value)) return String(value);
  if (typeof value === 'number') return String(Number(value.toPrecision(12)));
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

/* ── copy buttons · silent success ──────────────────────────────────── */
for (const btn of document.querySelectorAll('[data-copy]')) {
  const original = btn.innerHTML;
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      btn.dataset.state = 'success';
      btn.innerHTML = '<code>copied</code>';
    } catch {
      btn.dataset.state = 'error';
    }
    setTimeout(() => {
      delete btn.dataset.state;
      btn.innerHTML = original;
    }, 1600);
  });
}
$('copy-quickstart')?.addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  try {
    await navigator.clipboard.writeText($('quickstart-code').innerText);
    btn.dataset.state = 'success';
    btn.textContent = 'copied';
  } catch {
    btn.dataset.state = 'error';
  }
  setTimeout(() => {
    delete btn.dataset.state;
    btn.textContent = 'copy';
  }, 1600);
});

/* ── reveal · one-shot ──────────────────────────────────────────────── */
const io = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    }
  },
  { rootMargin: '0px 0px -10% 0px' },
);
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

/* ── hero demo · the formula types in once, then the engine spills ──── */
function heroDemo() {
  const formula = '=SEQUENCE(4,3,10,10)';
  const grid = $('hero-grid');
  const text = $('hero-formula');
  for (let i = 0; i < 12; i++) grid.appendChild(document.createElement('span'));
  const cells = [...grid.children];

  const run = () => {
    const engine = Engine.buildEmpty();
    const t0 = performance.now();
    const changes = engine.setCellContents(addr(0, 0), formula);
    const ms = performance.now() - t0;
    text.textContent = formula;
    cells.forEach((span, i) => {
      const value = engine.getCellValue(addr(i % 3, Math.floor(i / 3)));
      span.textContent = fmt(value);
      setTimeout(() => span.classList.add('is-filled'), reduced ? 0 : i * 45);
    });
    $('hero-status').hidden = false;
    $('hero-timing').textContent =
      `spilled ${changes.length} cells · ${ms < 1 ? ms.toFixed(2) : ms.toFixed(1)} ms`;
  };

  if (reduced) {
    run();
    return;
  }
  let i = 0;
  const caret = document.createElement('span');
  caret.className = 'caret';
  caret.setAttribute('aria-hidden', 'true');
  const tick = () => {
    text.textContent = formula.slice(0, i);
    text.appendChild(caret);
    if (i++ < formula.length) {
      setTimeout(tick, 42);
    } else {
      setTimeout(run, 220);
    }
  };
  setTimeout(tick, 500);
}
heroDemo();

/* ── playground ─────────────────────────────────────────────────────── */
const SCENARIOS = {
  spilling: {
    hint: 'C1 sorts the column and spills. Type over C3 to block it and watch #SPILL!; clear it to recover.',
    cells: [
      ['A1', 10], ['A2', 250], ['A3', 40], ['A4', 300], ['A5', 120],
      ['C1', '=SORT(A1:A5,1,-1)'],
      ['E1', '=SUM(C1:C5)'],
    ],
    select: 'C1',
  },
  xlookup: {
    hint: 'E1 looks D1 up in the table. Change D1 to "carmen" or break it to see if_not_found.',
    cells: [
      ['A1', 'ana'], ['B1', 30], ['A2', 'luis'], ['B2', 41],
      ['A3', 'carmen'], ['B3', 27], ['A4', 'pedro'], ['B4', 35],
      ['D1', 'luis'],
      ['E1', '=XLOOKUP(D1,A1:A4,B1:B4,"not found")'],
    ],
    select: 'E1',
  },
  broadcast: {
    hint: 'C1 multiplies the whole range elementwise and spills — no loop, no map().',
    cells: [
      ['A1', 19.9], ['A2', 45], ['A3', 7.5], ['A4', 120],
      ['C1', '=A1:A4*1.21'],
      ['E1', '=SUM(ABS({-1,2,-3}))'],
    ],
    select: 'C1',
  },
  financial: {
    hint: 'C1 is the monthly payment on A3 at rate A1 over A2 months. Edit A1 and watch it recalculate.',
    cells: [
      ['A1', 0.04], ['A2', 360], ['A3', 250000],
      ['C1', '=PMT(A1/12,A2,A3)'],
      ['C2', '=IPMT(A1/12,1,A2,A3)'],
      ['C3', '=NPER(A1/12,C1,A3)'],
    ],
    select: 'C1',
  },
  intersection: {
    hint: 'E1 sums the overlap of two ranges — the space between references is Excel’s intersection operator.',
    cells: [
      ['A1', 1], ['B1', 2], ['C1', 3],
      ['A2', 4], ['B2', 5], ['C2', 6],
      ['A3', 7], ['B3', 8], ['C3', 9],
      ['E1', '=SUM(A1:B3 B2:C4)'],
    ],
    select: 'E1',
  },
  es: {
    hint: 'Same engine, locale es: localized names, ; separators, decimal comma. =SUMA is =SUM.',
    locale: 'es',
    cells: [
      ['A1', 1200], ['A2', 800], ['A3', 99.5],
      ['C1', '=SUMA(A1:A3)'],
      ['C2', '=SI(C1>2000;"alto";"bajo")'],
      ['C3', '=BUSCARX(99,5;A1:A3;A1:A3;"sin datos";-1)'],
    ],
    select: 'C1',
  },
};

const pg = {
  engine: null,
  locale: 'en',
  scenario: 'spilling',
  selected: { col: 0, row: 0 },
  edited: new Set(),
};

const gridEl = $('pg-grid');
const inputEl = $('pg-input');
const statusEl = $('pg-status');

function buildEngine(locale) {
  return locale === 'es'
    ? Engine.buildEmpty({ locale: 'es', argumentSeparator: ';', decimalSeparator: ',' })
    : Engine.buildEmpty();
}

/** Translates a formula between locales with the library's own parser. */
function translate(formula, from, to) {
  if (typeof formula !== 'string' || !formula.startsWith('=') || from === to) return formula;
  const ast = parseFormula(formula, from === 'es' ? ES : EN);
  return '=' + serializeAst(ast, to === 'es' ? ES : EN);
}

function loadScenario(name) {
  const scenario = SCENARIOS[name];
  pg.scenario = name;
  if (scenario.locale && pg.locale !== scenario.locale) {
    pg.locale = scenario.locale;
    $('pg-locale').value = scenario.locale;
  }
  pg.engine = buildEngine(pg.locale);
  pg.edited = new Set();
  const sourceLocale = scenario.locale ?? 'en';
  pg.engine.batch(() => {
    for (const [ref, content] of scenario.cells) {
      const { col, row } = parseRef(ref);
      pg.engine.setCellContents(addr(col, row), translate(content, sourceLocale, pg.locale));
      pg.edited.add(`${col},${row}`);
    }
  });
  $('pg-hint').textContent = scenario.hint;
  selectCell(parseRef(scenario.select));
  render();
  statusEl.textContent = '';
  document.querySelectorAll('.chip-btn').forEach((b) =>
    b.classList.toggle('is-active', b.dataset.example === name),
  );
}

function parseRef(ref) {
  return { col: ref.charCodeAt(0) - 65, row: Number(ref.slice(1)) - 1 };
}

function render() {
  const head = ['<tr><th></th>' + Array.from({ length: COLS }, (_, c) => `<th scope="col">${colName(c)}</th>`).join('') + '</tr>'];
  const rows = [];
  for (let r = 0; r < ROWS; r++) {
    const tds = [`<th scope="row">${r + 1}</th>`];
    for (let c = 0; c < COLS; c++) {
      const value = pg.engine.getCellValue(addr(c, r));
      const formula = pg.engine.getCellFormula(addr(c, r));
      const classes = [];
      if (typeof value === 'string') classes.push('is-text');
      if (value !== null && isCellError(value)) classes.push('is-error');
      if (formula) classes.push('is-formula');
      if (!formula && value !== null && !pg.edited.has(`${c},${r}`)) classes.push('is-spill');
      if (pg.selected.col === c && pg.selected.row === r) classes.push('is-selected');
      tds.push(`<td data-col="${c}" data-row="${r}" class="${classes.join(' ')}">${escapeHtml(fmt(value))}</td>`);
    }
    rows.push(`<tr>${tds.join('')}</tr>`);
  }
  gridEl.innerHTML = head.join('') + rows.join('');
}

function escapeHtml(text) {
  return text.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[ch]);
}

function selectCell({ col, row }) {
  pg.selected = { col, row };
  $('pg-cellref').textContent = `${colName(col)}${row + 1}`;
  const formula = pg.engine.getCellFormula(addr(col, row));
  const value = pg.engine.getCellValue(addr(col, row));
  inputEl.value = formula ?? (value === null ? '' : fmt(value));
  delete inputEl.dataset.state;
}

function applyInput() {
  const { col, row } = pg.selected;
  const raw = inputEl.value.trim();
  const t0 = performance.now();
  const changes = pg.engine.setCellContents(addr(col, row), raw === '' ? null : raw);
  const ms = performance.now() - t0;
  if (raw === '') {
    pg.edited.delete(`${col},${row}`);
  } else {
    pg.edited.add(`${col},${row}`);
  }
  const result = pg.engine.getCellValue(addr(col, row));
  inputEl.dataset.state = result !== null && isCellError(result) ? 'error' : '';
  if (inputEl.dataset.state === '') delete inputEl.dataset.state;
  render();
  statusEl.textContent =
    `${changes.length} cell${changes.length === 1 ? '' : 's'} recalculated · ${ms < 1 ? ms.toFixed(2) : ms.toFixed(1)} ms`;
}

gridEl.addEventListener('click', (e) => {
  const td = e.target.closest('td[data-col]');
  if (!td) return;
  selectCell({ col: Number(td.dataset.col), row: Number(td.dataset.row) });
  render();
});
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') applyInput();
});
$('pg-apply').addEventListener('click', applyInput);
$('pg-locale').addEventListener('change', (e) => {
  pg.locale = e.target.value;
  // Re-run the scenario, translating its formulas with the library itself.
  loadScenario(pg.scenario);
});
document.querySelectorAll('.chip-btn').forEach((btn) =>
  btn.addEventListener('click', () => loadScenario(btn.dataset.example)),
);

loadScenario('spilling');

/* ── function reference · introspected registry ─────────────────────── */
let FUNCTIONS = [];

function argsLabel(fn) {
  if (fn.maxArgs === null) return `${fn.minArgs}+`;
  if (fn.minArgs === fn.maxArgs) return String(fn.minArgs);
  return `${fn.minArgs}–${fn.maxArgs}`;
}

function localizedName(name) {
  return pg.locale === 'es' ? (FUNCTIONS.find((f) => f.name === name)?.es ?? name) : name;
}

function insertIntoPlayground(name) {
  inputEl.value = `=${localizedName(name)}(`;
  document.querySelector('#playground').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  inputEl.focus({ preventScroll: true });
}

/** Evaluates a self-contained example with a throwaway engine, in English. */
function evalExample(formula) {
  try {
    const engine = Engine.buildEmpty();
    engine.setCellContents(addr(0, 0), formula);
    const value = engine.getCellValue(addr(0, 0));
    if (value !== null && isCellError(value)) return null;
    return fmt(value);
  } catch {
    return null;
  }
}

/** Builds the signature line "NAME(param1, param2, …)" from the param docs. */
function signature(fn) {
  const inner = fn.params.length
    ? fn.params.map((p) => (p.optional ? `[${p.name}]` : p.name)).join(', ')
    : '';
  return `${localizedName(fn.name)}(${inner})`;
}

/** The expandable documentation panel for one function, as a <tr>. */
function buildDetailRow(fn) {
  const tr = document.createElement('tr');
  tr.className = 'fn-detail';
  const td = document.createElement('td');
  td.colSpan = 5;
  const doc = document.createElement('div');
  doc.className = 'fn-doc';

  if (!fn.summary) {
    const none = document.createElement('p');
    none.className = 'fn-doc__summary';
    none.textContent = 'No prose yet — run npm run site:build to regenerate.';
    doc.append(none);
    td.append(doc);
    tr.append(td);
    return tr;
  }

  const summary = document.createElement('p');
  summary.className = 'fn-doc__summary';
  summary.textContent = fn.summary;

  const sig = document.createElement('p');
  sig.className = 'fn-doc__sig mono';
  sig.textContent = signature(fn);

  doc.append(sig, summary);

  if (fn.params.length) {
    const dl = document.createElement('dl');
    dl.className = 'fn-doc__params';
    for (const p of fn.params) {
      const row = document.createElement('div');
      const dt = document.createElement('dt');
      dt.className = 'mono';
      dt.textContent = p.name;
      if (p.optional) {
        const tag = document.createElement('span');
        tag.className = 'fn-doc__opt';
        tag.textContent = 'optional';
        dt.append(' ', tag);
      }
      const dd = document.createElement('dd');
      dd.textContent = p.description;
      row.append(dt, dd);
      dl.append(row);
    }
    doc.append(dl);
  }

  if (fn.paramReturns) {
    const ret = document.createElement('p');
    ret.className = 'fn-doc__returns';
    const label = document.createElement('span');
    label.className = 'fn-doc__label';
    label.textContent = 'Returns';
    ret.append(label, document.createTextNode(' ' + fn.paramReturns));
    doc.append(ret);
  }

  if (fn.example) {
    const shown = translate(fn.example, 'en', pg.locale);
    const result = fn.exampleResult ?? evalExample(fn.example);
    const ex = document.createElement('div');
    ex.className = 'fn-doc__example';
    const formula = document.createElement('code');
    formula.className = 'mono fn-doc__formula';
    formula.textContent = shown;
    ex.append(formula);
    if (result !== null) {
      const arrow = document.createElement('span');
      arrow.className = 'fn-doc__arrow';
      arrow.textContent = '→';
      const out = document.createElement('code');
      out.className = 'mono fn-doc__result';
      out.textContent = result;
      ex.append(arrow, out);
    }
    doc.append(ex);
  }

  const insert = document.createElement('button');
  insert.className = 'fn-doc__insert mono';
  insert.dataset.insert = fn.name;
  insert.textContent = 'Insert into playground →';
  doc.append(insert);

  td.append(doc);
  tr.append(td);
  return tr;
}

function toggleDetail(nameBtn) {
  const row = nameBtn.closest('tr');
  const open = nameBtn.getAttribute('aria-expanded') === 'true';
  // Collapse any other open panel — one at a time keeps the list scannable.
  document.querySelectorAll('#fn-table .fn-detail').forEach((el) => el.remove());
  document
    .querySelectorAll('#fn-table .fn-name[aria-expanded="true"]')
    .forEach((el) => el.setAttribute('aria-expanded', 'false'));
  if (open) return;
  const fn = FUNCTIONS.find((f) => f.name === nameBtn.dataset.fn);
  if (!fn) return;
  nameBtn.setAttribute('aria-expanded', 'true');
  row.after(buildDetailRow(fn));
}

function renderTable(query) {
  const q = query.trim().toLowerCase();
  const rows = FUNCTIONS.filter(
    (fn) =>
      !q ||
      fn.name.toLowerCase().includes(q) ||
      fn.es.toLowerCase().includes(q) ||
      fn.category.includes(q) ||
      (fn.summary ?? '').toLowerCase().includes(q) ||
      (q === 'volatile' && fn.volatile) ||
      (q === 'lazy' && fn.lazy),
  );
  const body = rows
    .map(
      (fn) => `<tr class="fn-row">
        <td><button class="fn-name" data-fn="${fn.name}" aria-expanded="false">${fn.name}</button></td>
        <td class="fn-es">${fn.es === fn.name ? '·' : fn.es}</td>
        <td class="fn-args">${argsLabel(fn)}</td>
        <td class="fn-cat">${fn.category}</td>
        <td>${fn.volatile ? '<span class="trait">volatile</span>' : ''}${fn.lazy ? '<span class="trait">lazy</span>' : ''}</td>
      </tr>`,
    )
    .join('');
  document.querySelector('#fn-table tbody').innerHTML =
    body || '<tr><td colspan="5" class="cmdk__empty">No function matches that filter.</td></tr>';
  $('fn-count').textContent = q ? `${rows.length} of ${FUNCTIONS.length}` : `${FUNCTIONS.length} registered`;
}

$('fn-search').addEventListener('input', (e) => renderTable(e.target.value));
document.querySelector('#fn-table').addEventListener('click', (e) => {
  const insert = e.target.closest('[data-insert]');
  if (insert) {
    insertIntoPlayground(insert.dataset.insert);
    return;
  }
  const name = e.target.closest('.fn-name');
  if (name) toggleDetail(name);
});

/* ── ⌘K palette ─────────────────────────────────────────────────────── */
const cmdk = $('cmdk');
const cmdkInput = $('cmdk-input');
const cmdkResults = $('cmdk-results');
let cmdkActive = 0;
let cmdkMatches = [];
let lastFocus = null;

function cmdkRender(query) {
  const q = query.trim().toLowerCase();
  cmdkMatches = FUNCTIONS.filter(
    (fn) => !q || fn.name.toLowerCase().includes(q) || fn.es.toLowerCase().includes(q) || fn.category.includes(q),
  ).slice(0, 30);
  cmdkActive = 0;
  if (cmdkMatches.length === 0) {
    cmdkResults.innerHTML = '<p class="cmdk__empty">Nothing in the registry matches.</p>';
    return;
  }
  let lastCategory = '';
  const parts = [];
  cmdkMatches.forEach((fn, i) => {
    if (fn.category !== lastCategory) {
      parts.push(`<p class="cmdk__group">${fn.category}</p>`);
      lastCategory = fn.category;
    }
    parts.push(
      `<button class="cmdk__item${i === 0 ? ' is-active' : ''}" data-index="${i}" role="option" aria-selected="${i === 0}">
        <span class="mono">${fn.name}</span>
        <span class="cmdk__es mono">${fn.es === fn.name ? '' : fn.es}</span>
        <span class="cmdk__meta mono">${argsLabel(fn)} args</span>
      </button>`,
    );
  });
  cmdkResults.innerHTML = parts.join('');
}

function cmdkSetActive(index) {
  cmdkActive = Math.max(0, Math.min(index, cmdkMatches.length - 1));
  cmdkResults.querySelectorAll('.cmdk__item').forEach((el) => {
    const isActive = Number(el.dataset.index) === cmdkActive;
    el.classList.toggle('is-active', isActive);
    el.setAttribute('aria-selected', String(isActive));
    if (isActive) el.scrollIntoView({ block: 'nearest' });
  });
}

function cmdkOpen() {
  lastFocus = document.activeElement;
  cmdk.classList.add('is-open');
  cmdk.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  cmdkInput.value = '';
  cmdkRender('');
  cmdkInput.focus();
}

function cmdkClose() {
  cmdk.classList.remove('is-open');
  cmdk.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  lastFocus?.focus?.();
}

$('searchpill').addEventListener('click', cmdkOpen);
cmdk.querySelector('[data-close]').addEventListener('click', cmdkClose);
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    cmdk.classList.contains('is-open') ? cmdkClose() : cmdkOpen();
  } else if (e.key === 'Escape' && cmdk.classList.contains('is-open')) {
    cmdkClose();
  }
});
cmdkInput.addEventListener('input', (e) => cmdkRender(e.target.value));
cmdkInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    cmdkSetActive(cmdkActive + 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    cmdkSetActive(cmdkActive - 1);
  } else if (e.key === 'Enter' && cmdkMatches[cmdkActive]) {
    insertIntoPlayground(cmdkMatches[cmdkActive].name);
    cmdkClose();
  }
});
cmdkResults.addEventListener('click', (e) => {
  const item = e.target.closest('.cmdk__item');
  if (item) {
    insertIntoPlayground(cmdkMatches[Number(item.dataset.index)].name);
    cmdkClose();
  }
});

/* ── boot the reference ─────────────────────────────────────────────── */
fetch('./functions.json')
  .then((r) => r.json())
  .then((data) => {
    FUNCTIONS = data.functions;
    renderTable('');
  })
  .catch(() => {
    $('fn-count').textContent = 'functions.json missing — run npm run site:build';
  });
