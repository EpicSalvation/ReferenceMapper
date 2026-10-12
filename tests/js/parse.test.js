import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createVerses } from '../../public/js/verses.js';
import { parseReference } from '../../public/js/parse.js';

const verses = createVerses(JSON.parse(readFileSync(new URL('../../public/books.json', import.meta.url))));
const ok = (text, ref) => test(`parses ${JSON.stringify(text)} as ${ref}`, () => {
  const r = parseReference(text, verses);
  assert.equal(r.id, verses.idFromRef(ref), JSON.stringify(r));
});
const bad = (text) => test(`rejects ${JSON.stringify(text)}`, () => {
  const r = parseReference(text, verses);
  assert.ok(r.error, JSON.stringify(r));
});

ok('John 3:16', 'John.3.16');
ok('Jn 3.16', 'John.3.16');
ok('jn3:16', 'John.3.16');
ok('  John  3 : 16 ', 'John.3.16');
ok('John.3.16', 'John.3.16');
ok('1 Cor 13:4', '1Cor.13.4');
ok('1Co 13.4', '1Cor.13.4');
ok('1 John 1:9', '1John.1.9');
ok('John 1:9', 'John.1.9');
ok('Psalm 23', 'Ps.23.1');
ok('Ps 23:1', 'Ps.23.1');
ok('Song of Songs 2:1', 'Song.2.1');
ok('Jude 5', 'Jude.1.5');
ok('Philemon 4', 'Phlm.1.4');
ok('Genesis 1', 'Gen.1.1');

bad('Foo 1:1');
bad('John 3:99');
bad('John 99:1');
bad('');
bad('   ');
bad('3:16');

test('typo returns suggestions including John', () => {
  const r = parseReference('Jhon 3:16', verses);
  assert.ok(r.error);
  assert.ok(r.suggestions.includes('John'), JSON.stringify(r));
});

test('nonsense short book gets no suggestions', () => {
  const r = parseReference('Foo 1:1', verses);
  assert.ok(r.error);
  assert.deepEqual(r.suggestions, []);
});
