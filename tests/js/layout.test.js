import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createVerses } from '../../public/js/verses.js';
import { layoutBar, xForId, arcPath, arcStyle, selectLabels } from '../../public/js/layout.js';

const verses = createVerses(JSON.parse(readFileSync(new URL('../../public/books.json', import.meta.url))));

test('layoutBar widths sum to the width and scale with verse count', () => {
  const bar = layoutBar(verses, 1000);
  assert.equal(bar.length, 66);
  const sum = bar.reduce((s, b) => s + b.w, 0);
  assert.ok(Math.abs(sum - 1000) < 0.001, `sum ${sum}`);
  const w = (code) => bar.find((b) => b.code === code).w;
  assert.ok(w('Ps') > w('Obad') * 50);
  assert.equal(bar[0].x, 0);
  assert.ok(Math.abs(bar[1].x - bar[0].w) < 1e-9);
});

test('xForId is increasing and within the bar', () => {
  let prev = -1;
  for (const id of [1, 100, 5000, 20000, verses.total]) {
    const x = xForId(verses, id, 1000);
    assert.ok(x > prev && x >= 0 && x <= 1000, `id ${id} -> ${x}`);
    prev = x;
  }
});

const apexY = (d) => {
  const m = /^M\s*([\d.-]+)[ ,]([\d.-]+)\s*A\s*([\d.-]+)[ ,]([\d.-]+)\s/.exec(d);
  assert.ok(m, d);
  return { base: +m[2], ry: +m[4] };
};

test('arcPath out goes above the baseline and in goes below', () => {
  const out = arcPath(100, 300, 200, 'out', 0.35);
  const inn = arcPath(100, 300, 200, 'in', 0.35);
  assert.match(out, /A\s*100[ ,]35\s0\s0\s1\s/);
  assert.match(inn, /A\s*100[ ,]35\s0\s0\s0\s/);
  assert.equal(apexY(out).ry, 35);
});

test('arcPath tolerates reversed endpoints', () => {
  const d = arcPath(900, 100, 200, 'out', 0.35);
  assert.equal(apexY(d).ry, 140);
  assert.ok(d.startsWith('M 100 200'), d);
});

test('arcPath of a zero-length span is still visible', () => {
  const d = arcPath(500, 500, 200, 'out', 0.35);
  assert.ok(apexY(d).ry >= 6, d);
  assert.ok(!/NaN/.test(d));
});

test('arcStyle is monotonic and clamped', () => {
  const lo = arcStyle(1, 1000), hi = arcStyle(1000, 1000);
  assert.ok(hi.strokeWidth > lo.strokeWidth && hi.opacity > lo.opacity);
  assert.ok(lo.strokeWidth >= 1 && hi.strokeWidth <= 6);
  assert.ok(lo.opacity >= 0.25 && hi.opacity <= 0.9);
  const z = arcStyle(0, 0);
  assert.ok(z.strokeWidth >= 1 && z.opacity >= 0.25);
});

const box = (a, o) => ({ x: (a.x1 + a.x2) / 2, y: a.y ?? 0, w: o.labelWidth + o.minGap, h: o.labelHeight ?? 14 });

test('selectLabels never overlaps, respects maxLabels, prefers votes', () => {
  const opts = { maxLabels: 10, minGap: 4, labelWidth: 50 };
  const arcs = [];
  for (let i = 0; i < 40; i++) arcs.push({ x1: i * 10, x2: i * 10 + 20, votes: i });
  const picked = selectLabels(arcs, opts);
  assert.ok(picked.length > 0 && picked.length <= 10);
  assert.equal(picked[0], 39);
  for (let a = 0; a < picked.length; a++) for (let b = a + 1; b < picked.length; b++) {
    const A = box(arcs[picked[a]], opts), B = box(arcs[picked[b]], opts);
    assert.ok(Math.abs(A.x - B.x) >= A.w || Math.abs(A.y - B.y) >= A.h, `overlap ${picked[a]} ${picked[b]}`);
  }
});

test('selectLabels allows nearby apexes when their heights differ', () => {
  const opts = { maxLabels: 5, minGap: 2, labelWidth: 50, labelHeight: 14 };
  const arcs = [
    { x1: 100, x2: 200, votes: 9, y: 40 },
    { x1: 110, x2: 190, votes: 8, y: 80 },
  ];
  assert.deepEqual(selectLabels(arcs, opts).sort(), [0, 1]);
});

test('selectLabels handles 500 arcs quickly', () => {
  const arcs = Array.from({ length: 500 }, (_, i) => ({ x1: (i * 37) % 900, x2: ((i * 37) % 900) + 50, votes: i % 97 }));
  const t = performance.now();
  selectLabels(arcs, { maxLabels: 25, minGap: 4, labelWidth: 50 });
  assert.ok(performance.now() - t < 50);
});

import { arcHeight, arcRatio, maxArcHeight } from '../../public/js/layout.js';
test('arcHeight is proportional to span with no cap', () => {
  assert.equal(arcHeight(100, 300, 0.35), 35);
  assert.equal(arcHeight(100, 500, 0.35), 70);
  assert.equal(arcHeight(0, 1000, 0.35), 175);
  assert.ok(arcHeight(500, 500, 0.35) >= 6);
});

test('arcs from one verse keep one aspect ratio, so they nest instead of crossing', () => {
  const ratio = arcRatio(false);
  const x1 = 700;
  for (const x2 of [760, 900, 1100, 1146, 400, 100, 2]) {
    const rx = Math.abs(x2 - x1) / 2;
    assert.ok(Math.abs(arcHeight(x1, x2, ratio) / rx - ratio) < 1e-9, `x2 ${x2}`);
  }
});

test('arcRatio is flattened everywhere, a bit taller on narrow screens', () => {
  assert.equal(arcRatio(false), 0.35);
  assert.ok(arcRatio(true) > arcRatio(false) && arcRatio(true) < 1);
});

test('maxArcHeight is the height of the farthest possible arc from a verse', () => {
  assert.equal(maxArcHeight(0, 1000, 0.35), 175);
  assert.equal(maxArcHeight(1000, 1000, 0.35), 175);
  assert.equal(maxArcHeight(500, 1000, 0.35), 87.5);
});

import { zoneLabel, directionInfo } from '../../public/js/layout.js';
test('zoneLabel describes each zone with the verse and its count', () => {
  assert.equal(zoneLabel('out', 'John 3:16', 61), 'References from John 3:16 (61)');
  assert.equal(zoneLabel('in', 'John 3:16', 35), 'References to John 3:16 (35)');
  assert.equal(zoneLabel('in', 'Jude 1:5', 0), 'References to Jude 1:5 (0)');
});

test('directionInfo gives a visible badge and a full screen-reader phrase', () => {
  assert.deepEqual(directionInfo('out'), { badge: 'From', sr: 'Outgoing reference' });
  assert.deepEqual(directionInfo('in'), { badge: 'To', sr: 'Incoming reference' });
});
