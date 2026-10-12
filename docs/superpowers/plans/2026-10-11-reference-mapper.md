# Reference Mapper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a client-rendered arc-diagram web tool for Biblical cross references, backed by a tiny PHP/SQLite per-verse lookup that also counts searches.

**Architecture:** A one-time PHP script converts `cross_references.txt` into `refs.sqlite`. `api/refs.php` returns one verse's incoming and outgoing references as compact integer IDs. A vanilla-JS client (SVG, no build step) converts IDs to names via a shared `books.json`, draws the diagram, and can export it as PNG/SVG.

**Tech Stack:** PHP 8.1-compatible code (dev machine runs 8.5.8; server runs 8.1.34) with `pdo_sqlite`; vanilla JS (ES modules); Node 24 `node --test` for JS tests; a plain PHP assertion runner for PHP tests (PHPUnit is not installed).

**Spec:** `docs/superpowers/specs/2026-10-11-reference-mapper-design.md`

## Global Constraints

- PHP code must run on **PHP 8.1.34** (no 8.2+ only features such as readonly classes or `json_validate`); local dev is 8.5.8.
- Verse IDs are integers `1..~31,100` in canonical order; a "to" range is stored as `to_start`..`to_end` (e.g. `Prov.8.22-Prov.8.30`).
- Dataset verse format is `Book.Chapter.Verse` with 66 book codes: `Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps Prov Eccl Song Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal Matt Mark Luke John Acts Rom 1Cor 2Cor Gal Eph Phil Col 1Thess 2Thess 1Tim 2Tim Titus Phlm Heb Jas 1Pet 2Pet 1John 2John 3John Jude Rev`.
- `cross_references.txt` has a header row, tab-delimited `From Verse`, `To Verse`, `Votes`; 344,800 lines, 88,150 of them with a range "to".
- Votes are per-pair usefulness; use them for ranking, filtering, arc thickness/opacity — never as "votes for the from-verse".
- Outgoing arcs **above** the bar, incoming **below**; each side toggleable.
- Search logging stores only verse ID, count, last-searched time. No IPs, no user data. Only `log=1` requests increment.
- Verse text is NOT shown in v1; the detail panel keeps a reserved empty slot (`#verse-text`) for the later bible.api integration.
- Footer and exported images must carry the CC-BY attribution "Cross-reference data: openbible.info (CC-BY)".
- `data/*.sqlite` must not be web-accessible; docroot is `public/`.
- The project folder is not a git repo. Steps marked **Checkpoint** are commit points if `git init` is done; otherwise skip them.

## Review Focus

1. Verse with zero connections (obscure verse, or only incoming/only outgoing): empty-state message, no JS exception, download still works. (Task 6)
2. Incoming lookup for a verse that lies *inside* a range target (e.g. Prov.8.25 when `Prov.8.22-Prov.8.30` exists) must be found. (Task 4)
3. Typed references people really type: `Psalm 23`, `Ps 23:1`, `Song of Songs 2:1`, `1 John 1:9` vs `John 1:9`, `Jude 5` / `Philemon 4` (single-chapter books), `jn3:16`, trailing/extra whitespace; chapter-only input should resolve to verse 1 of that chapter. (Task 2)
4. Very high-degree verses (e.g. Gen.1.1, John.3.16 — hundreds of arcs): capped by `limit`, labels do not overlap, rendering stays responsive. (Tasks 4, 5)
5. Hostile or malformed API/hash input: `v=Gen.1.99`, `v=Foo.1.1`, `v='; DROP`, missing `v`, huge `limit`, bad `#hash` — clean 400 / ignored, never a PHP warning or counter row for an invalid verse. (Tasks 4, 6)

---

## File Structure

```
public/                      <- web docroot
  index.html                 page shell, controls, footer attribution
  style.css                  layout, responsive rules, group colors
  books.json                 generated copy of the table (see Task 1)
  js/verses.js               table lookups (id <-> ref <-> label)
  js/parse.js                typed-reference parser
  js/layout.js               pure geometry: bar, arcs, label selection, styling
  js/render.js               builds the SVG from layout output
  js/export.js               SVG serialization, PNG download
  js/app.js                  wiring: controls, fetch, hash, list/detail panel
  api/refs.php               per-verse lookup (+ optional log)
src/Verses.php               PHP table lookups (id <-> ref, range parsing)
src/Db.php                   PDO helpers for refs/searches databases
src/config.php               data dir path (env REFMAP_DATA_DIR override)
data/books.json              SOURCE OF TRUTH table (books, aliases, groups, verses per chapter)
data/refs.sqlite             built (gitignored/not deployed from source)
data/searches.sqlite         created on first logged search (must be writable)
tools/build_db.php           TSV -> refs.sqlite + validation report
dev/php.ini                  enables pdo_sqlite/sqlite3 for local php (local PHP has no php.ini)
tests/run.php                PHP assertion runner
tests/php/*.php              PHP tests
tests/js/*.test.js           Node tests
README.md                    run, test, build, deploy instructions
```

`public/books.json` is a build copy of `data/books.json` produced by `tools/build_db.php` (and by `php tools/sync_books.php`), so there is one authored source.

---

### Task 1: Versification table and PHP verse library

**Files:**
- Create: `data/books.json`, `src/Verses.php`, `tools/sync_books.php`, `tests/run.php`, `tests/php/VersesTest.php`, `dev/php.ini`
- Create (generated): `public/books.json`

**Interfaces:**
- Produces `data/books.json`: `{"books":[{"code":"Gen","name":"Genesis","abbr":"Gen","group":"Law","aliases":["genesis","gen","ge","gn"],"chapters":[31,25,...]}, ...66 entries in canonical order]}`. Groups: `Law, History, Wisdom, Prophets, Gospels, Acts, Epistles, Revelation`. `aliases` are lowercase, no spaces/periods.
- Produces `Verses` (PHP, static): `Verses::load(string $path): void`; `Verses::total(): int`; `Verses::idFromRef(string $ref): ?int` (`"Gen.1.1"` → 1, invalid/out-of-range → null); `Verses::refFromId(int $id): string`; `Verses::parseTo(string $to): ?array` (`"Prov.8.22-Prov.8.30"` or single → `[start,end]`, null if invalid or end < start).
- Produces test runner convention: each `tests/php/*Test.php` returns `['name' => callable, ...]`; `php -c dev/php.ini tests/run.php` runs all, prints failures, exits non-zero on any failure. Helper `assertSame($expected, $actual, string $msg='')` defined in `tests/run.php`.
- Produces `dev/php.ini` with `extension_dir="D:/Dev/php-8.5.8/ext"`, `extension=pdo_sqlite`, `extension=sqlite3`, `extension=mbstring`.

- [ ] **Step 1: Write the failing tests** in `tests/php/VersesTest.php`: `total` equals 31102; `idFromRef('Gen.1.1')` is 1; `idFromRef('Rev.22.21')` equals 31102; `idFromRef('Gen.1.32')` is null; `idFromRef('Foo.1.1')` is null; `refFromId(idFromRef('John.3.16'))` is `'John.3.16'` and round-trips for every id 1..total; `parseTo('Prov.8.22-Prov.8.30')` gives `[start,end]` with `end-start === 8`; `parseTo('Prov.8.30-Prov.8.22')` is null; `parseTo('Gen.1.1')` gives `[1,1]`. Also a test that every ref in `cross_references.txt` (both columns, ranges split) resolves (collect and list first 20 failures in the message).
- [ ] **Step 2: Run** `php -c dev/php.ini tests/run.php` → expect FAIL (class/file missing).
- [ ] **Step 3: Author `data/books.json`.** All 66 books in canonical order with verses-per-chapter arrays following KJV versification (total must be 31102). Aliases cover common names/abbreviations including numbered-book forms ("1john", "1jn", "ij"), "songofsolomon"/"songofsongs"/"sos"/"canticles", "psalm"/"psalms"/"ps"/"psa", "philemon"/"phm"/"phlm". If the dataset has references outside the table, fix the table (not the data) unless the dataset genuinely uses a different count, in which case record the deviation in a comment field `"notes"` at the top of the JSON.
- [ ] **Step 4: Implement `Verses`** in `src/Verses.php` with prefix-sum arrays for O(log n) `refFromId`; implement `tools/sync_books.php` (copies `data/books.json` → `public/books.json`) and `dev/php.ini`.
- [ ] **Step 5: Run tests** → expect all PASS. If the dataset-coverage test fails, correct the table as described in Step 3 and re-run.
- [ ] **Step 6: Checkpoint** — files added.

---

### Task 2: JS verse library and typed-reference parser

**Files:**
- Create: `public/js/verses.js`, `public/js/parse.js`, `tests/js/verses.test.js`, `tests/js/parse.test.js`

**Interfaces:**
- Consumes: `public/books.json` shape from Task 1.
- Produces `verses.js` (ES module): `createVerses(booksJson): Verses` where `Verses` has `total: number`, `books: {code,name,abbr,group,startId,endId,verseCount}[]`, `idFromRef(ref: string): number|null` (`"Gen.1.1"`), `refFromId(id): string`, `label(id): string` (`"Rev 4:11"`), `labelRange(start, end): string` (`"Prov 8:22–30"`, `"Rom 1:19–2:2"` across chapters), `bookIndexOf(id): number`, `chapterCount(bookIdx): number`, `verseCount(bookIdx, chapter): number`.
- Produces `parse.js`: `parseReference(text: string, verses: Verses): {id:number}|{error:string, suggestions?:string[]}`.

- [ ] **Step 1: Write failing tests.** `verses.test.js`: ids match the PHP expectations (Gen.1.1→1, Rev.22.21→31102, total 31102); `label(idFromRef('Rev.4.11'))` is `'Rev 4:11'`; `labelRange` for `Prov.8.22`–`Prov.8.30` is `'Prov 8:22–30'`. `parse.test.js` asserts these inputs resolve to the given refs: `"John 3:16"`, `"Jn 3.16"`, `"jn3:16"`, `"  John  3 : 16 "`→`John.3.16`; `"1 Cor 13:4"`, `"1Co 13.4"`→`1Cor.13.4`; `"1 John 1:9"`→`1John.1.9` and `"John 1:9"`→`John.1.9`; `"Psalm 23"`→`Ps.23.1`; `"Song of Songs 2:1"`→`Song.2.1`; `"Jude 5"`→`Jude.1.5`; `"Philemon 4"`→`Phlm.1.4`; and errors for `"Foo 1:1"`, `"John 3:99"`, `"John 99:1"`, `""`, with `"Jhon 3:16"` returning a suggestions list containing "John".
- [ ] **Step 2: Run** `node --test tests/js` → FAIL.
- [ ] **Step 3: Implement `createVerses`** (prefix sums, binary search) in `public/js/verses.js`.
- [ ] **Step 4: Implement `parseReference`**: normalize (lowercase, strip periods/extra whitespace), peel trailing `chapter[:|.| ]verse` digits, resolve the book part through the alias map (alias keys built from `aliases`, `name`, `abbr`, with spaces removed); single-chapter books treat a lone number as the verse; chapter-only input → verse 1; bounds-check against the table; suggestions via simple prefix/edit-distance ≤2 on book names.
- [ ] **Step 5: Run** `node --test tests/js` → PASS.
- [ ] **Step 6: Checkpoint.**

---

### Task 3: Database build script

**Files:**
- Create: `tools/build_db.php`, `src/Db.php`, `src/config.php`, `tests/php/BuildTest.php`
- Generated: `data/refs.sqlite`

**Interfaces:**
- Consumes: `Verses` (Task 1).
- Produces `config.php`: `dataDir(): string` (env `REFMAP_DATA_DIR`, else `<project>/data`).
- Produces `Db::refs(): PDO` (read-only open of `refs.sqlite`), `Db::searches(): PDO` (creates `searches(verse_id INTEGER PRIMARY KEY, count INTEGER NOT NULL, last_at INTEGER NOT NULL)` if missing).
- Produces schema `refs(from_id INTEGER NOT NULL, to_start INTEGER NOT NULL, to_end INTEGER NOT NULL, votes INTEGER NOT NULL)` with indexes `idx_from(from_id, votes DESC)` and `idx_to(to_start, to_end)`.
- Produces CLI: `php -c dev/php.ini tools/build_db.php [--src cross_references.txt] [--out data/refs.sqlite]`; prints rows read / inserted / skipped (first 20 skipped with reason) / ranges; exits 1 if skipped > 0.5% of rows.

- [ ] **Step 1: Write failing test** `BuildTest.php`: build from a small fixture TSV (written to a temp file in the test: a header, a normal row, a range row, a row with an invalid verse `Gen.1.99`, a malformed row with 2 columns) into a temp db; assert inserted count is 2, skipped is 2, range row has `to_end - to_start === 8`, and both indexes exist.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `build_db.php` as a function `buildDb(string $src, string $out): array` (returns counts) plus a CLI wrapper; insert in one transaction with a prepared statement; skip header lines starting with non-data; create indexes after loading.
- [ ] **Step 4: Run tests** → PASS. Then run the real build and verify the printed report: ~344,800 rows read, ~0 skipped.
- [ ] **Step 5: Verify** with `sqlite3`-via-PHP one-liner that `SELECT COUNT(*) FROM refs` equals inserted count and `Gen.1.1` has outgoing rows.
- [ ] **Step 6: Checkpoint.**

---

### Task 4: API endpoint `refs.php` with search logging

**Files:**
- Create: `public/api/refs.php`, `tests/php/ApiTest.php`
- Create: `README.md` (API section)

**Interfaces:**
- Consumes: `Verses`, `Db`, `config.php`.
- Produces: `handleRefs(array $query, PDO $refs, ?PDO $searches): array{status:int, body:array, cacheable:bool}` in `public/api/refs.php` (so tests call it without HTTP); the script's top level wraps it, emits JSON, headers (`Content-Type: application/json`, `Cache-Control: public, max-age=86400` when `cacheable`, `no-store` when logging).
- Query params: `v` required `Book.Ch.V`; `min` int ≥0 default 0; `limit` int default **150** max **500** per direction (revisit defaults in Step 6); `log=1` increments counter.
- Response: `{"v":<id>,"out":[[to_start,to_end,votes],...],"in":[[from_id,votes],...]}`, each ordered by votes desc then id.
- Errors: 400 `{"error":"invalid verse"}` for missing/invalid `v`; non-numeric `min`/`limit` are clamped to defaults.

- [ ] **Step 1: Write failing tests** against an in-memory refs DB with: `Gen.1.1→Rev.4.11 (205)`, `Gen.1.1→Isa.40.28 (67)`, `Ps.1.1→Prov.8.22-Prov.8.30 (10)`, `John.1.1→Gen.1.1 (50)`. Assert: `v=Gen.1.1` returns out sorted `[Rev.4.11, Isa.40.28]` and `in` containing `John.1.1`'s id; `v=Prov.8.25` returns `in` containing Ps.1.1 (range containment); `min=100` drops the 67-vote row; `limit=1` keeps one per direction; `v=Gen.1.99`, `v=Foo.1.1`, `v=`, missing `v`, `v=' OR 1=1` → status 400; `limit=99999` clamps to 500; with `log=1` and a valid verse, `searches` count for that verse is 1, calling twice gives 2; without `log`, no row; invalid verse with `log=1` creates no row.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement `handleRefs`** using prepared statements: outgoing `WHERE from_id=? AND votes>=? ORDER BY votes DESC, to_start LIMIT ?`; incoming `WHERE to_start<=? AND to_end>=? AND votes>=? ORDER BY votes DESC, from_id LIMIT ?` (index `idx_to` plus filter is acceptable at this size). Logging via `INSERT ... ON CONFLICT(verse_id) DO UPDATE SET count=count+1, last_at=?` (SQLite ≥3.24, fine for PHP 8.1 builds).
- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Smoke test** with `php -c dev/php.ini -S localhost:8080 -t public`; `curl "http://localhost:8080/api/refs.php?v=Gen.1.1"` returns JSON; confirm the response for `John.3.16` and `Gen.1.1` takes well under 100 ms.
- [ ] **Step 6: Choose defaults** from real data: examine how many rows `Gen.1.1` and `John.3.16` return and the vote distribution; adjust default `limit` and the client's default minimum-votes (recorded in README) so the default view is readable. Update tests if the default changes.
- [ ] **Step 7: Checkpoint.**

---

### Task 5: Layout geometry (pure functions)

**Files:**
- Create: `public/js/layout.js`, `tests/js/layout.test.js`

**Interfaces:**
- Consumes: `Verses` (Task 2).
- Produces:
  - `layoutBar(verses, width: number): {code, name, abbr, group, x, w, startId, endId}[]` — widths proportional to verse count, gap-free, summing to `width`.
  - `xForId(verses, id, width): number` — position within the bar (centered in the verse's slot).
  - `arcPath(x1, x2, baseY, direction: 'out'|'in', maxHeight): string` — half-ellipse SVG path above (`out`) or below (`in`) `baseY`; height = `min(maxHeight, (|x2-x1|/2)*k)` with a minimum visible height of 6px.
  - `arcStyle(votes, maxVotes): {strokeWidth, opacity}` — strokeWidth in [1, 6], opacity in [0.25, 0.9], monotonic in votes.
  - `selectLabels(arcs: {x1,x2,votes}[], opts: {maxLabels:number, minGap:number, labelWidth:number}): number[]` — indices of arcs to label, highest votes first, skipping any whose apex label box would overlap an already-chosen one.

- [ ] **Step 1: Write failing tests**: `layoutBar` sum of widths equals `width` (±0.001) and Psalms is wider than Obadiah; `xForId` is increasing in id and within [0,width]; `arcPath('out')` apex y < baseY, `arcPath('in')` apex y > baseY (parse numbers from path); zero-length span still returns a visible arc; `arcStyle` monotonic and clamped; `selectLabels` returns no two indices whose label boxes (apex x ± labelWidth/2) overlap, never exceeds `maxLabels`, and prefers higher votes.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the functions; `selectLabels` is greedy by votes with an interval-overlap check.
- [ ] **Step 4: Run** → PASS. Add a perf test: `selectLabels` over 500 arcs completes in under 50 ms.
- [ ] **Step 5: Checkpoint.**

---

### Task 6: Page, rendering, and interaction

**Files:**
- Create: `public/index.html`, `public/style.css`, `public/js/render.js`, `public/js/app.js`

**Interfaces:**
- Consumes: Tasks 2, 4, 5. API: `GET api/refs.php`.
- Produces `render.js`: `renderDiagram(svgEl: SVGElement, state: {verses, verseId, out, in, width, narrow, showOut, showIn, minVotes, selected}): {arcs: {id, dir, targetStart, targetEnd, votes, label}[]}` — clears and redraws the SVG: bar with book blocks + labels, chosen-verse marker, arcs (with `data-arc` ids for hit-testing; invisible fat stroke for ≥12px touch targets), labels from `selectLabels` only when `!narrow`.
- Produces `app.js` behavior: loads `books.json`, builds book/chapter/verse selects and the type-in box (Task 2 parser; Enter submits; errors shown inline); `fetchRefs(verseId, {log: boolean})`; `#Book.Ch.V` hash read on load (invalid hash ignored) and written on selection; toggles for out/in; min-votes slider (client-side filter over fetched rows); `narrow` = container width < 700px, re-render on resize (debounced); connection list (sortable by votes / canonical position) with two-way highlight and click-to-select; detail panel (`#detail`) showing reference, direction, votes, external Bible link (BibleGateway), and an empty `#verse-text` slot; clicking a list item or arc "Go to this verse" re-centers on that verse with `log=1`.
- `log=1` is sent only on deliberate searches (menus, typed submit, "go to" clicks) — not initial hash load re-renders, toggles, slider, or resize.

- [ ] **Step 1: Build `index.html`** with controls, `<svg id="diagram">`, list `#connections`, `#detail`, footer attribution, and viewport meta. Build `style.css` with CSS variables for the eight group colors (light/dark friendly), 16px gutters, no horizontal page scroll at 360px.
- [ ] **Step 2: Implement `render.js`** per the interface; empty state text "No cross references found for this verse." when both lists are empty after filtering.
- [ ] **Step 3: Implement `app.js`** per the interface.
- [ ] **Step 4: Manual check in browser** (`php -c dev/php.ini -S localhost:8080 -t public`): select `John.3.16` via menus; type `jn 3:16`; type `Foo 1:1` (inline error, diagram unchanged); load `http://localhost:8080/#Gen.1.1` directly; load `#garbage` (no crash, default verse); verse with no connections shows empty state. Resize to ~375px: no on-arc labels, tapping an arc fills `#detail`; at ~1200px: labels visible without overlaps. Confirm via the dev server that `searches` increments on deliberate searches only (check the search db).
- [ ] **Step 5: Check Gen.1.1** (hundreds of arcs): interaction remains responsive; labels limited; list scrolls.
- [ ] **Step 6: Checkpoint.**

---

### Task 7: Image download

**Files:**
- Create: `public/js/export.js`, `tests/js/export.test.js`
- Modify: `public/index.html` (buttons), `public/js/app.js` (wire buttons)

**Interfaces:**
- Consumes: the rendered `<svg id="diagram">`.
- Produces `export.js`: `serializeSvg(svgEl: SVGElement, opts: {title: string, attribution: string}): string` — standalone SVG markup with inlined computed styles/fonts, `xmlns`, `viewBox`, an added title text and attribution text in the margin; `downloadSvg(svgEl, opts, filename)`; `downloadPng(svgEl, opts, filename, scale = 2): Promise<void>` — draws the SVG via an `Image` to a canvas at `scale`× and triggers a download.
- Filenames: `reference-map-<Book.Ch.V>.png|svg`.

- [ ] **Step 1: Write failing test** (`node --test`, with a minimal fake DOM or by testing a pure helper `buildStandaloneSvgString(svgMarkup, opts)`): output contains the xmlns attribute, the title text, the attribution string "Cross-reference data: openbible.info (CC-BY)", and no external `url(` references.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `export.js`; keep the DOM-touching parts thin.
- [ ] **Step 4: Run** tests → PASS.
- [ ] **Step 5: Manual check:** download PNG and SVG for `John.3.16`, then for an empty verse (works, shows title/attribution); open both files and verify they match the on-screen diagram, including at a narrow window width.
- [ ] **Step 6: Checkpoint.**

---

### Task 8: Verification and deployment notes

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write README** covering: local run (`php -c dev/php.ini -S localhost:8080 -t public`), tests (`php -c dev/php.ini tests/run.php`, `node --test tests/js`), building the DB, deploying (`public/` → docroot; `data/` and `src/` outside or protected; make the data directory writable for `searches.sqlite`; set `REFMAP_DATA_DIR` if needed; confirm `pdo_sqlite` on PHP 8.1.34), the data attribution (CC-BY, openbible.info), and a note on the future bible.api hook (`#verse-text`).
- [ ] **Step 2: Run the full test suites** and expect all PASS with zero warnings.
- [ ] **Step 3: Run PHP syntax lint** on every PHP file and confirm no 8.2+ only constructs are used (`php -l`; scan for `readonly class`, `json_validate`, DNF types, `#[\Override]`).
- [ ] **Step 4: End-to-end pass** against Review Focus items 1–5 in the browser and via `curl`; report the results.
- [ ] **Step 5: Checkpoint.**

---

## Self-Review

- **Spec coverage:** data & versification (T1, T3), API/logging (T4), controls/typed parsing/hash (T2, T6), diagram, directions, toggles, votes styling, labels vs tap, list, detail panel + text slot (T5, T6), download PNG/SVG + attribution (T7), error handling (T4, T6), testing and PHP/pdo_sqlite confirmation (T1–T8). The stats page is out of scope per the spec.
- **Types:** `Verses` JS/PHP APIs, `handleRefs` response shape, and `layout.js` signatures are used consistently in T6/T7.
- **Open spec items:** PHP versions recorded in Global Constraints; default limit/min-votes chosen in T4 Step 6; versification verified in T1 Step 5.
