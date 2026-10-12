# Reference Mapper — Design Spec

Date: 2026-10-11

## Purpose

A web tool that visualizes Biblical cross references for a chosen verse, in the spirit of Chris Harrison's BibleViz. The user picks a verse (menus or typed) and sees an arc diagram of every cross reference to and from it. Drawing happens client-side; the server only serves a small per-verse lookup and counts searches.

## Source data

`cross_references.txt` (openbible.info, CC-BY): tab-delimited, header row, ~344,800 rows. Columns: `From Verse`, `To Verse`, `Votes`. Verse format `Gen.1.1`; "To" may be a range (`Prov.8.22-Prov.8.30`).

Votes are community votes on the usefulness of each from→to *pair* (not votes on the from-verse). They are used to rank, filter, and weight arcs. The dataset's attribution (CC-BY) must be shown in the page footer.

## Decisions (from interview)

- Visualization: single-verse arc diagram (BibleViz-style), Bible as a horizontal bar.
- Direction: outgoing arcs above the bar, incoming arcs below; each side toggleable.
- Hosting: shared PHP hosting. Dev via `php -S`.
- Client-side image generation; user can download the image.
- Show references only (no verse text) in v1. Verse text via the owner's bible.api account is a planned later add-on; the detail panel must leave room for it.
- Search counting: per-verse counts only; no IPs or user data stored.

## Architecture

```
index.html, app.js, style.css     static client (vanilla JS, SVG, no build step)
api/refs.php                      GET per-verse connections (+ optional log)
api/stats.php                     (optional, later) top-searched verses, token-protected
data/refs.sqlite                  built DB (not web-accessible)
data/searches.sqlite              search counters (not web-accessible; writable)
tools/build_db.php                TSV -> refs.sqlite, with validation report
shared verse table                book names/aliases/chapter+verse counts (JS + PHP copies, generated from one source file)
tests/                            parser/ID tests, build validation
```

### Verse IDs

Verses map to integers 1..~31,100 in canonical order using a static table of books, aliases, and verses per chapter. The table follows the dataset's versification. The build script reports any dataset reference not found in the table (these are skipped and listed, not silently dropped). The table is authored once as a single JSON source and used by both the PHP build/API and the JS client.

### Database

`refs(from_id INTEGER, to_start INTEGER, to_end INTEGER, votes INTEGER)` with indexes on `from_id` and on `(to_start)`. A single-verse "to" has `to_start = to_end`. Incoming lookup selects rows where the chosen verse lies within `[to_start, to_end]`.

### API: `GET api/refs.php?v=<Book.Ch.V>&min=<votes>&limit=<n>&log=1`

- Validates `v`; 400 on invalid.
- Returns `{"v":id, "out":[[to_start,to_end,votes],...], "in":[[from_id,votes],...]}`, ordered by votes descending, capped per direction (default limit, max enforced server-side). IDs are compact integers; the client converts to names via the shared table.
- `log=1` increments that verse's counter in `searches.sqlite` (upsert, with count and last-searched timestamp). Sent only for deliberate searches (menu selection, typed submit, following a link), not redraws/toggles/slider changes or initial hash load being re-rendered.
- Cache headers allow browser/proxy caching of non-logging responses; logging calls are separate so counting is not defeated by caching.
- Prepared statements only. No user data stored.

## Client

### Layout

- Controls: book/chapter/verse selects, a typed-reference box (parses "John 3:16", "Jn 3.16", "1 Cor 13:4", "1Co 13.4", etc., with autocomplete of book names), toggles for outgoing/incoming, minimum-votes slider, download button.
- The URL hash (`#John.3.16`) reflects the current verse and is read on load for shareable links.

### Diagram (SVG)

- Horizontal bar of the 66 books, width proportional to verse count, colored by group (Law, History, Wisdom, Prophets, Gospels, Acts, Epistles, Revelation), with book labels (abbreviated when narrow).
- Chosen verse marked on the bar.
- Outgoing arcs above, incoming below. Arc height scales with span; color from the book at the other end; thickness/opacity from votes. Range targets render as a short band on the bar with the arc landing at its center.
- Wide window: top-N arcs labeled with the reference (e.g. "Rev 4:11"), with collision avoidance; remaining arcs unlabeled but hoverable.
- Narrow window: no on-arc labels; arcs are tappable (adequate hit targets) and selecting one shows a detail panel (reference, direction, votes, link to an external Bible site). Both modes also offer a sortable list of connections; selecting a list item highlights its arc and vice versa.
- The detail panel has a reserved slot for verse text (future bible.api integration).

### Download

"Download PNG" serializes the SVG (inline styles/fonts so it renders standalone), draws it to a canvas at a sensible resolution, and saves. "Download SVG" is offered as a secondary option. The image includes the verse title and the CC-BY attribution. Nothing is sent to the server.

## Error handling

- Invalid typed reference: inline message with suggestion; diagram unchanged.
- Verse with no connections: empty-state message.
- API failure/timeout: message with retry; diagram unchanged.
- Build script: reports row counts, skipped/unparseable rows, and range handling; exits non-zero if the skip rate exceeds a threshold.

## Testing

- Unit tests: reference parser (aliases, punctuation, numbered books), verse↔ID mapping round-trips, range handling.
- Build validation report on the real file (row counts match, skipped rows listed).
- API: valid/invalid input, ordering, caps, incoming-range lookup, log counter increments only with `log=1`.
- Browser check of wide and narrow layouts, label/tap behavior, hash deep links, and PNG/SVG download.

## Out of scope (v1)

Verse text display, multiple translations, accounts, chapter- or book-level aggregate views, a public stats page (the `stats.php` is optional/later).

## Open items for implementation planning

- Confirm PHP version available locally and on the target host (needs `pdo_sqlite`).
- Choose a default arc cap and default minimum votes after seeing real data distributions (e.g. Gen.1.1, John.3.16).
- Source and verify the versification table against the dataset.
