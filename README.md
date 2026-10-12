# ReferenceMapper

Web-based Bible cross-reference visualizer. Pick a verse (menus or type "John 3:16") and see an arc diagram of every cross reference **from** it (above the bar) and **to** it (below). The picture is drawn in the browser as SVG and can be downloaded as PNG or SVG. The server only serves static files, answers a small per-verse lookup, and counts how often each verse is searched.

## How it works

- `tools/build_db.php` turns `cross_references.txt` into `data/refs.sqlite` (one-time build).
- `public/api/refs.php?v=John.3.16` returns that verse's connections as compact verse IDs (a few KB).
- `public/js/*` converts IDs to names, lays out and draws the SVG, handles search, and exports images.
- Votes in the data are community votes on how useful each *pair* is; they drive arc thickness/opacity and sorting.

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

1. Build `data/refs.sqlite` locally (or on the server with the CLI) and upload it. The source TSV is not needed on the server.
2. Put the contents of `public/` in the web root (e.g. `public_html/`). Put `src/` and `data/` **next to** the web root, not inside it, so `data/*.sqlite` is not downloadable (the API finds them at `../../src` and `../../data` relative to `api/`). Set the `REFMAP_DATA_DIR` environment variable if your layout differs.
3. Make `data/` writable by the web server user; `searches.sqlite` is created there on the first logged search.
4. Confirm `pdo_sqlite` is enabled (it is on the PHP 8.1.34 server).

To see the most-searched verses: `SELECT verse_id, count FROM searches ORDER BY count DESC LIMIT 20;` (IDs follow canonical order; `Verses::refFromId()` converts them).

## Planned

Verse text for the selected connection via a bible.api account; the detail panel has an empty `#verse-text` slot reserved for it.

## Data and license

Cross-reference data: [openbible.info](https://www.openbible.info/labs/cross-references/), licensed CC-BY. Attribution appears in the page footer and on every exported image.
