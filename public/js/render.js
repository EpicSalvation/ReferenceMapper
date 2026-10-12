// Builds the arc-diagram SVG. Colors come from CSS custom properties (see style.css).
import { layoutBar, xForId, arcPath, arcHeight, arcRatio, maxArcHeight, arcStyle, selectLabels } from './layout.js';

const NS = 'http://www.w3.org/2000/svg';
export const BAR_HEIGHT = 26;

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
  const x1 = xForId(verses, verseId, width);
  const ratio = arcRatio(narrow);
  const maxH = Math.ceil(maxArcHeight(x1, width, ratio));
  const labelPad = narrow ? 8 : 22;
  const topH = showOut ? maxH + labelPad : 8;
  const bottomH = showIn ? maxH + labelPad : 8;
  const barTop = topH;
  const barBottom = barTop + BAR_HEIGHT;
  const height = barBottom + bottomH;

  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);

  // Bar of books
  const bar = el('g', { class: 'bar' });
  for (const b of layoutBar(verses, width)) {
    const g = el('g');
    g.append(el('title', {}, b.name));
    g.append(el('rect', { x: b.x, y: barTop, width: Math.max(b.w, 0.5), height: BAR_HEIGHT, class: `book g-${b.group}` }));
    if (b.w >= 7 * b.abbr.length + 4) {
      g.append(el('text', { x: b.x + b.w / 2, y: barTop + BAR_HEIGHT / 2 + 3.5, class: 'book-label', 'text-anchor': 'middle' }, b.abbr));
    }
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
    const style = arcStyle(c.votes, maxVotes);
    const selected = i === selectedIndex;
    const g = el('g', { 'data-arc': i, class: `arc ${c.dir}${selected ? ' selected' : ''}` });
    g.append(el('title', {}, `${c.label} · ${c.votes} votes`));
    g.append(el('path', {
      d, class: 'arc-line', fill: 'none',
      style: `stroke:var(--c-${g0.group});stroke-width:${selected ? style.strokeWidth + 2 : style.strokeWidth};stroke-opacity:${selected ? 1 : style.opacity}`,
    }));
    g.append(el('path', { d, class: 'arc-hit', fill: 'none' }));
    // landing mark (band for a range, dot for a single verse)
    if (c.start !== c.end) {
      const bx = xForId(verses, c.start, width) - slot / 2;
      const bw = Math.max(2, (c.end - c.start + 1) * slot);
      g.append(el('rect', { x: bx, y: c.dir === 'out' ? barTop - 5 : barBottom, width: bw, height: 5, style: `fill:var(--c-${g0.group})` }));
    } else {
      g.append(el('circle', { cx: g0.tx, cy: baseY, r: selected ? 3.5 : 2.2, style: `fill:var(--c-${g0.group})` }));
    }
    arcs.append(g);
  }
  svg.append(arcs);

  // Chosen-verse marker
  const marker = el('g', { class: 'marker' });
  marker.append(el('line', { x1, x2: x1, y1: barTop - 6, y2: barBottom + 6 }));
  marker.append(el('circle', { cx: x1, cy: barTop + BAR_HEIGHT / 2, r: 4 }));
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
}
