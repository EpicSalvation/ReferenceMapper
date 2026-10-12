import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createVerses } from '../../public/js/verses.js';

const verses = createVerses(JSON.parse(readFileSync(new URL('../../public/books.json', import.meta.url))));

test('total is 31103 (dataset versification)', () => assert.equal(verses.total, 31103));
test('Gen.1.1 is id 1', () => assert.equal(verses.idFromRef('Gen.1.1'), 1));
test('Rev.22.21 is the last id', () => assert.equal(verses.idFromRef('Rev.22.21'), 31103));
test('out-of-range and unknown refs are null', () => {
  assert.equal(verses.idFromRef('Gen.1.32'), null);
  assert.equal(verses.idFromRef('Foo.1.1'), null);
});
test('every id round trips', () => {
  for (let i = 1; i <= verses.total; i++) assert.equal(verses.idFromRef(verses.refFromId(i)), i);
});
test('label formats Rev 4:11', () => assert.equal(verses.label(verses.idFromRef('Rev.4.11')), 'Rev 4:11'));
test('labelRange within a chapter', () => {
  const a = verses.idFromRef('Prov.8.22'), b = verses.idFromRef('Prov.8.30');
  assert.equal(verses.labelRange(a, b), 'Prov 8:22–30');
});
test('labelRange across chapters', () => {
  const a = verses.idFromRef('Rom.1.19'), b = verses.idFromRef('Rom.2.2');
  assert.equal(verses.labelRange(a, b), 'Rom 1:19–2:2');
});
test('labelRange of a single verse is a plain label', () => {
  const a = verses.idFromRef('John.3.16');
  assert.equal(verses.labelRange(a, a), 'John 3:16');
});
test('books carry id spans and group', () => {
  const gen = verses.books[0];
  assert.equal(gen.startId, 1);
  assert.equal(gen.endId, 1533);
  assert.equal(gen.group, 'Law');
  assert.equal(verses.bookIndexOf(1533), 0);
  assert.equal(verses.bookIndexOf(1534), 1);
});
test('chapterCount and verseCount', () => {
  const ps = verses.books.findIndex(b => b.code === 'Ps');
  assert.equal(verses.chapterCount(ps), 150);
  assert.equal(verses.verseCount(ps, 119), 176);
});
