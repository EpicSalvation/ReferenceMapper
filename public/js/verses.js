// Canonical verse numbering; mirrors src/Verses.php. IDs run 1..total in canonical order.

function lastLE(arr, x) {
  let lo = 0, hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arr[mid] <= x) lo = mid; else hi = mid - 1;
  }
  return lo;
}

export function createVerses(booksJson) {
  const books = [];
  const byCode = new Map();
  const bookStarts = [];
  let id = 1;
  for (const b of booksJson.books) {
    const chapterStarts = [];
    for (const n of b.chapters) { chapterStarts.push(id); id += n; }
    const verseCount = id - chapterStarts[0];
    const book = {
      code: b.code, name: b.name, abbr: b.abbr, display: b.abbr.replace(/^(\d)/, '$1 '),
      group: b.group, aliases: b.aliases, chapters: b.chapters, chapterStarts,
      startId: chapterStarts[0], endId: id - 1, verseCount,
    };
    byCode.set(b.code, books.length);
    books.push(book);
    bookStarts.push(book.startId);
  }
  const total = id - 1;

  function bookIndexOf(vid) { return lastLE(bookStarts, vid); }

  function locate(vid) {
    const bi = bookIndexOf(vid);
    const book = books[bi];
    const ci = lastLE(book.chapterStarts, vid);
    return { bi, book, chapter: ci + 1, verse: vid - book.chapterStarts[ci] + 1 };
  }

  return {
    total,
    books,
    bookIndexOf,
    chapterCount: (bi) => books[bi].chapters.length,
    verseCount: (bi, chapter) => books[bi].chapters[chapter - 1],
    idFromRef(ref) {
      const m = /^([0-9A-Za-z]+)\.(\d+)\.(\d+)$/.exec(ref);
      if (!m) return null;
      const bi = byCode.get(m[1]);
      if (bi === undefined) return null;
      const book = books[bi];
      const ch = +m[2], v = +m[3];
      if (ch < 1 || ch > book.chapters.length || v < 1 || v > book.chapters[ch - 1]) return null;
      return book.chapterStarts[ch - 1] + v - 1;
    },
    // id of (book index, chapter, verse); no bounds checking beyond what callers validate
    idFromParts(bi, chapter, verse) { return books[bi].chapterStarts[chapter - 1] + verse - 1; },
    locate,
    refFromId(vid) {
      const l = locate(vid);
      return `${l.book.code}.${l.chapter}.${l.verse}`;
    },
    label(vid) {
      const l = locate(vid);
      return `${l.book.display} ${l.chapter}:${l.verse}`;
    },
    labelRange(a, b) {
      if (a === b) return this.label(a);
      const x = locate(a), y = locate(b);
      if (x.bi !== y.bi) return `${this.label(a)}–${this.label(b)}`;
      if (x.chapter === y.chapter) return `${x.book.display} ${x.chapter}:${x.verse}–${y.verse}`;
      return `${x.book.display} ${x.chapter}:${x.verse}–${y.chapter}:${y.verse}`;
    },
  };
}
