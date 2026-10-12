import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStandaloneSvgString, exportFilename, ATTRIBUTION } from '../../public/js/export.js';

const opts = { title: 'John 3:16 & friends <x>', width: 800, height: 400, background: '#14161a', color: '#e6e8eb' };
const svg = buildStandaloneSvgString('<g><path d="M0 0"/></g>', opts);

test('standalone svg has xmlns, viewBox with extra header/footer height, and the inner markup', () => {
  assert.match(svg, /^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /viewBox="0 0 800 (\d+)"/);
  const h = +/viewBox="0 0 800 (\d+)"/.exec(svg)[1];
  assert.ok(h > 400, `height ${h}`);
  assert.ok(svg.includes('<path d="M0 0"/>'));
});

test('title is XML-escaped and attribution is present', () => {
  assert.ok(svg.includes('John 3:16 &amp; friends &lt;x&gt;'));
  assert.ok(!svg.includes('<x>'));
  assert.equal(ATTRIBUTION, 'Cross-reference data: openbible.info (CC-BY)');
  assert.ok(svg.includes(ATTRIBUTION));
});

test('no external references and background is painted', () => {
  assert.ok(!/url\(/.test(svg));
  assert.ok(svg.includes('fill="#14161a"'));
});

test('exportFilename builds reference-map-<ref>.<ext> and sanitizes', () => {
  assert.equal(exportFilename('John.3.16', 'png'), 'reference-map-John.3.16.png');
  assert.equal(exportFilename('Gen/1 1', 'svg'), 'reference-map-Gen-1-1.svg');
});

const legend = [{ name: 'Law', color: '#b5651d' }, { name: 'History', color: '#8a6d1d' }, { name: 'Revelation', color: '#1f8a9e' }];
const withKey = buildStandaloneSvgString('<g/>', { ...opts, legend });

test('export includes a color key with every group name and swatch color', () => {
  for (const l of legend) {
    assert.ok(withKey.includes('>' + l.name + '<'), l.name);
    assert.ok(withKey.includes('fill="' + l.color + '"'), l.color);
  }
});

const heightOf = (markup) => +/viewBox="0 0 \d+ (\d+)"/.exec(markup)[1];

test('export grows to make room for the key, and more so when the image is narrow', () => {
  assert.ok(heightOf(withKey) > heightOf(svg));
  const wide = buildStandaloneSvgString('<g/>', { ...opts, width: 1200, legend });
  const narrow = buildStandaloneSvgString('<g/>', { ...opts, width: 200, legend });
  assert.ok(heightOf(narrow) > heightOf(wide), 'narrow key wraps to extra rows');
});

test('no legend means no key and the same size as before', () => {
  const same = buildStandaloneSvgString('<g/>', { ...opts, legend: [] });
  assert.equal(heightOf(same), heightOf(svg));
});
