# ReferenceMapper

Web-based Bible cross-reference visualizer. Pick a verse (menus or type "John 3:16") and see an arc diagram of every cross reference **from** it (above the bar) and **to** it (below). The picture is drawn in the browser as SVG and can be downloaded as PNG or SVG. The server only serves static files, answers a small per-verse lookup, and counts how often each verse is searched.

## How it works

- `tools/build_db.php` turns `cross_references.txt` into `data/refs.sqlite` (one-time build).
- `public/api/refs.php?v=John.3.16` returns that verse's connections as compact verse IDs (a few KB).
- `public/js/*` converts IDs to names, lays out and draws the SVG, handles search, and exports images.
- Votes in the data are community votes on how useful each *pair* is; they drive arc thickness/opacity and sorting.

## Styles

The diagram has two looks: **Light** (default; thin book bar, fine faint arcs) and **Bold** (a chunky bar and heavy arcs, handy for slides). Switch with the Style menu, or share a link with `?style=bold` / `?style=light` (for example `https://example.com/?style=bold#John.3.16`). A link parameter wins over the browser's saved choice, which wins over the default. PNG/SVG downloads use whichever style is on screen and include a key for the book-group colors and for solid (outgoing) vs dashed (incoming) arcs. A tick on the book bar marks the Old/New Testament boundary. The numbers for each style live in `STYLES` in `public/js/layout.js`.

## Local development

Requires PHP 8.1+ with `pdo_sqlite` (developed on 8.5.8, deployed on 8.1.34) and Node 18+ for the JS tests. If your local PHP has no `php.ini`, use the one in `dev/`:

```
php -c dev/php.ini tools/build_db.php                  # build data/refs.sqlite (about a second)
php -c dev/php.ini -S localhost:8080 -t public         # serve the app
php -c dev/php.ini tests/run.php                       # PHP tests
node --test "tests/js/**/*.test.js"                    # JS tests
```

`data/books.json` is the single authored table of books, aliases and verses per chapter (it follows the dataset's versification: 31,103 verses, 3 John has 15). After editing it, run `php tools/sync_books.php` to refresh the browser copy `public/books.json`.

## API

`GET api/refs.php?v=<Book.Ch.V>[&min=<votes>][&limit=<n>][&log=1]`

- Returns `{"v":id,"out":[[to_start,to_end,votes],...],"in":[[from_id,votes],...]}`, strongest first.
- `limit` defaults to 150 per direction (max 500). `min` filters by votes.
- `log=1` increments that verse's search counter (verse ID, count, last time only; no IPs or user data). The client sends it only for deliberate searches, not for page loads, back/forward navigation, toggles, or resizing.
- Invalid verses get HTTP 400 and are never counted.

## Deploying

Needs PHP 8.1+ with `pdo_sqlite` (SQLite 3.24+ for the search counter). The site can live at a domain root or in a subfolder such as `public_html/RefMap/`; all page URLs are relative.

First build `data/refs.sqlite` locally (`php -c dev/php.ini tools/build_db.php`). The source TSV is not needed on the server. Then pick a layout.

### Recommended: `src/` and `data/` outside the web root

```
~/refmap/                      (anywhere above public_html)
├── src/                       the whole src/ folder
└── data/                      books.json + refs.sqlite (data/books.json, not public/books.json)
~/public_html/RefMap/          the contents of public/
├── .htaccess, index.html, style.css, books.json, js/…
└── api/                       refs.php, paths.php, config.local.php
```

`public/.htaccess` sets security headers (CSP, nosniff, no framing) on Apache. It is a dotfile, so make sure your upload includes it. On other servers, copy the headers into the server config.

Copy `api/config.local.php.example` to `api/config.local.php` and set `'root'` to the absolute path of `~/refmap`. The database then cannot be downloaded at all.

### Fallback: everything inside the site folder

```
~/public_html/RefMap/
├── index.html, style.css, books.json, js/…, api/
├── src/                       (with its .htaccess)
└── data/                      books.json + refs.sqlite (with its .htaccess)
```

No config file is needed (it is auto-detected). The `.htaccess` files deny web access on Apache, but verify it on your host (see below), because they are the only thing protecting the database in this layout.

### Then, for either layout

1. Make `data/` writable by the web server user; `searches.sqlite` is created there on the first logged search. If it is not writable the app still works, but searches are not counted.
2. Verify: load `/RefMap/` (with the browser console open, check for no CSP errors and that both downloads work); open `/RefMap/api/refs.php?v=John.3.16` (JSON); search for something and confirm `data/searches.sqlite` appears; and, in the fallback layout, confirm `/RefMap/data/refs.sqlite` is **not** downloadable (expect 403 or 404).
3. Updating later: re-upload the changed files from `public/`. If you rebuild the database, replace only `refs.sqlite` and leave `searches.sqlite` alone, since it holds your counts. A database built before the `meta` table existed still works, but its incoming-reference lookups are slower, so rebuild and re-upload it.

Location lookup order (see `public/api/paths.php`): `api/config.local.php` (`root`, `data_dir`), then the `REFMAP_ROOT` / `REFMAP_DATA_DIR` environment variables, then auto-detection.

To see the most-searched verses: `SELECT verse_id, count FROM searches ORDER BY count DESC LIMIT 20;` (IDs follow canonical order; `Verses::refFromId()` converts them).

## Planned

Verse text for the selected connection via a bible.api account; the detail panel has an empty `#verse-text` slot reserved for it.

## Data and license

Cross-reference data: [openbible.info](https://www.openbible.info/labs/cross-references/), licensed CC-BY. Attribution appears in the page footer and on every exported image.
