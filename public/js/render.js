// Builds the arc-diagram SVG. Colors come from CSS custom properties (see style.css).
import { layoutBar, xForId, arcPath, arcHeight, arcRatio, maxArcHeight, arcStyle, selectLabels, zoneLabel, styleSettings, testamentBoundaryX } from './layout.js';

const NS = 'http://www.w3.org/2000/svg';

function el(name, attrs = {}, text) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * state: {verses, verseId, connections, width, narrow, selectedIndex, showOut, showIn}
 * connections: [{dir:'out'|'in', start, end, votes, label}]; arc i carries data-arc="i".
 */
export function renderDiagram(svg, state) {
  const { verses, verseId, connections, width, narrow, selectedIndex, showOut, showIn } = state;
  const st = styleSettings(state.styleName);
  const x1 = xForId(verses, verseId, width);
  const ratio = arcRatio(narrow);
  const maxH = Math.ceil(maxArcHeight(x1, width, ratio));
  const labelPad = narrow ? 28 : 38; // room for the zone label (and arc labels on wide screens)
  const topH = showOut ? maxH + labelPad : 8;
  const bottomH = showIn ? maxH + labelPad : 8;
  const barTop = topH;
  const barBottom = barTop + st.barHeight;
  const height = barBottom + bottomH;

  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);

  const outCount = connections.filter((c) => c.dir === 'out').length;
  const inCount = connections.length - outCount;
  const here = verses.label(verseId);
  svg.setAttribute('aria-label', `Arc diagram for ${here}: ${showOut ? outCount : 0} outgoing references above the bar and ${showIn ? inCount : 0} incoming references below it`);

  // Tinted zones: outgoing above the bar, incoming below
  if (showOut) svg.append(el('rect', { x: 0, y: 0, width, height: barTop, class: 'zone zone-out' }));
  if (showIn) svg.append(el('rect', { x: 0, y: barBottom, width, height: height - barBottom, class: 'zone zone-in' }));

  // Bar of books
  const bar = el('g', { class: 'bar' });
  for (const b of layoutBar(verses, width)) {
    const g = el('g');
    g.append(el('title', {}, b.name));
    g.append(el('rect', { x: b.x, y: barTop, width: Math.max(b.w, 0.5), height: st.barHeight, class: `book g-${b.group}` }));
    bar.append(g);
  }
  svg.append(bar);

  const slot = width / verses.total;
  const maxVotes = connections.reduce((m, c) => Math.max(m, c.votes), 0);

  // Geometry per connection
  const geo = connections.map((c) => {
    const tx = xForId(verses, (c.start + c.end) / 2, width);
    const ry = arcHeight(x1, tx, ratio);
    const group = verses.books[verses.bookIndexOf(c.start)].group;
    return { tx, ry, group };
  });

  // Arcs, weakest first so strong ones sit on top
  const arcs = el('g', { class: 'arcs' });
  const order = connections.map((_, i) => i).sort((a, b) => connections[a].votes - connections[b].votes);
  if (selectedIndex !== null && selectedIndex >= 0) {
    order.splice(order.indexOf(selectedIndex), 1);
    order.push(selectedIndex);
  }
  for (const i of order) {
    const c = connections[i];
    const g0 = geo[i];
    const baseY = c.dir === 'out' ? barTop : barBottom;
    const d = arcPath(x1, g0.tx, baseY, c.dir, ratio);
    const style = arcStyle(c.votes, maxVotes, st);
    const selected = i === selectedIndex;
    const g = el('g', { 'data-arc': i, class: `arc ${c.dir}${selected ? ' selected' : ''}` });
    g.append(el('title', {}, `${c.label} · ${c.votes} votes`));
    g.append(el('path', {
      d, class: 'arc-line', fill: 'none',
      style: `${c.dir === 'in' ? 'stroke-dasharray:7 4;' : ''}stroke:var(--c-${g0.group});stroke-width:${selected ? style.strokeWidth + st.selectedExtra : style.strokeWidth};stroke-opacity:${selected ? 1 : style.opacity}`,
    }));
    g.append(el('path', { d, class: 'arc-hit', fill: 'none' }));
    // landing mark (band for a range, dot for a single verse)
    if (c.start !== c.end) {
      const bx = xForId(verses, c.start, width) - slot / 2;
      const bw = Math.max(2, (c.end - c.start + 1) * slot);
      g.append(el('rect', { x: bx, y: c.dir === 'out' ? barTop - st.bandH : barBottom, width: bw, height: st.bandH, style: `fill:var(--c-${g0.group})` }));
    } else {
      g.append(el('circle', { cx: g0.tx, cy: baseY, r: selected ? st.dotRSelected : st.dotR, style: `fill:var(--c-${g0.group})` }));
    }
    arcs.append(g);
  }
  svg.append(arcs);

  // Old/New Testament tick: crosses the bar and pokes out a little on both sides
  const tx0 = testamentBoundaryX(verses, width);
  const tick = el('g', { class: 'testament-tick' });
  tick.append(el('line', { x1: tx0, x2: tx0, y1: barTop - st.tickExtra, y2: barBottom + st.tickExtra, class: 'tick-halo', style: `stroke-width:${st.tickWidth + 2}` }));
  tick.append(el('line', { x1: tx0, x2: tx0, y1: barTop - st.tickExtra, y2: barBottom + st.tickExtra, class: 'tick-line', style: `stroke-width:${st.tickWidth}` }));
  const tickHit = el('rect', { x: tx0 - 5, y: barTop, width: 10, height: st.barHeight, class: 'tick-hit' });
  tickHit.append(el('title', {}, 'Old Testament | New Testament'));
  tick.append(tickHit);
  svg.append(tick);

  // Chosen-verse marker
  const marker = el('g', { class: 'marker' });
  marker.append(el('line', { x1, x2: x1, y1: barTop - 6, y2: barBottom + 6, style: `stroke-width:${st.markerLine}` }));
  marker.append(el('circle', { cx: x1, cy: barTop + st.barHeight / 2, r: st.markerDot, style: `stroke-width:${st.markerLine}` }));
  svg.append(marker);

  // Labels (wide layouts only)
  if (!narrow && connections.length) {
    const candidates = connections.map((c, i) => ({
      x1, x2: geo[i].tx, votes: c.votes, y: c.dir === 'out' ? -geo[i].ry : geo[i].ry,
    }));
    const picked = new Set(selectLabels(candidates, { maxLabels: Math.max(3, Math.floor(width / 90)), minGap: 6, labelWidth: 64 }));
    if (selectedIndex !== null && selectedIndex >= 0) picked.add(selectedIndex);
    const labels = el('g', { class: 'labels' });
    for (const i of picked) {
      const c = connections[i];
      const apexX = Math.min(width - 34, Math.max(34, (x1 + geo[i].tx) / 2));
      const y = c.dir === 'out' ? barTop - geo[i].ry - 6 : barBottom + geo[i].ry + 14;
      labels.append(el('text', { x: apexX, y, class: `arc-label${i === selectedIndex ? ' selected' : ''}`, 'text-anchor': 'middle' }, c.label));
    }
    svg.append(labels);
  }

  // Zone labels (real text, so direction never depends on color alone)
  if (showOut) svg.append(el('text', { x: 10, y: 17, class: 'zone-label' }, zoneLabel('out', here, outCount)));
  if (showIn) svg.append(el('text', { x: 10, y: height - 9, class: 'zone-label' }, zoneLabel('in', here, inCount)));
}
