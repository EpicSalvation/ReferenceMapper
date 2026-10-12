// Parses typed references like "John 3:16", "jn3.16", "1 Cor 13:4", "Psalm 23", "Jude 5".

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[a.length][b.length];
}

const aliasCache = new WeakMap();
function aliasMap(verses) {
  let map = aliasCache.get(verses);
  if (map) return map;
  map = new Map();
  verses.books.forEach((b, i) => {
    for (const a of [b.code, b.name, ...b.aliases]) map.set(a.toLowerCase().replace(/\s+/g, ''), i);
  });
  aliasCache.set(verses, map);
  return map;
}

function suggest(bookKey, verses) {
  if (bookKey.length < 2) return [];
  const scored = [];
  verses.books.forEach((b) => {
    const keys = [b.name, ...b.aliases].map((s) => s.toLowerCase().replace(/\s+/g, ''));
    let best = Infinity;
    for (const k of keys) {
      if (k.startsWith(bookKey)) best = 0;
      else if (k.length >= 3) best = Math.min(best, editDistance(bookKey, k));
    }
    if (best <= 2) scored.push([best, b.name]);
  });
  scored.sort((x, y) => x[0] - y[0]);
  return scored.slice(0, 5).map((x) => x[1]);
}

export function parseReference(text, verses) {
  const norm = String(text ?? '')
    .toLowerCase()
    .replace(/[:.,]/g, ' ')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .trim();
  if (!norm) return { error: 'Enter a reference such as John 3:16.' };
  const tokens = norm.split(/\s+/);
  const aliases = aliasMap(verses);

  let trailing = 0;
  while (trailing < 2 && trailing < tokens.length && /^\d+$/.test(tokens[tokens.length - 1 - trailing])) trailing++;

  for (let n = trailing; n >= 0; n--) {
    const bookTokens = tokens.slice(0, tokens.length - n);
    if (!bookTokens.length) continue;
    const bi = aliases.get(bookTokens.join(''));
    if (bi === undefined) continue;
    const nums = tokens.slice(tokens.length - n).map(Number);
    const book = verses.books[bi];
    let chapter = 1, verse = 1;
    if (n === 2) [chapter, verse] = nums;
    else if (n === 1) {
      if (book.chapters.length === 1) verse = nums[0]; else chapter = nums[0];
    }
    if (chapter < 1 || chapter > book.chapters.length) {
      return { error: `${book.name} has ${book.chapters.length} chapter${book.chapters.length === 1 ? '' : 's'}.` };
    }
    if (verse < 1 || verse > book.chapters[chapter - 1]) {
      return { error: `${book.name} ${chapter} has ${book.chapters[chapter - 1]} verses.` };
    }
    return { id: verses.idFromParts(bi, chapter, verse) };
  }

  const bookKey = tokens.slice(0, tokens.length - trailing).join('');
  const suggestions = suggest(bookKey, verses);
  return { error: `Unknown book "${tokens.slice(0, tokens.length - trailing).join(' ') || text}".`, suggestions };
}
