// Pure geometry for the diagram. No DOM access.

const num = (n) => +n.toFixed(2);

export function layoutBar(verses, width) {
  return verses.books.map((b) => ({
    code: b.code, name: b.name, abbr: b.display, group: b.group,
    startId: b.startId, endId: b.endId,
    x: ((b.startId - 1) / verses.total) * width,
    w: (b.verseCount / verses.total) * width,
  }));
}

export function xForId(verses, id, width) {
  return ((id - 0.5) / verses.total) * width;
}

// Height of the half-ellipse spanning x1..x2 (a semicircle, capped at maxHeight).
export function arcHeight(x1, x2, maxHeight) {
  const rx = Math.max(3, Math.abs(x2 - x1) / 2);
  return Math.min(maxHeight, Math.max(6, rx));
}

// Half-ellipse above ('out') or below ('in') the baseline.
export function arcPath(x1, x2, baseY, direction, maxHeight) {
  let a = Math.min(x1, x2), b = Math.max(x1, x2);
  if (b - a < 6) { const mid = (a + b) / 2; a = mid - 3; b = mid + 3; }
  const rx = (b - a) / 2;
  const ry = arcHeight(a, b, maxHeight);
  const sweep = direction === 'out' ? 1 : 0;
  return `M ${num(a)} ${num(baseY)} A ${num(rx)} ${num(ry)} 0 0 ${sweep} ${num(b)} ${num(baseY)}`;
}

export function arcStyle(votes, maxVotes) {
  const t = maxVotes > 0 ? Math.min(1, Math.log1p(Math.max(0, votes)) / Math.log1p(maxVotes)) : 0;
  return { strokeWidth: num(1 + 5 * t), opacity: num(0.25 + 0.65 * t) };
}

// Picks arcs to label, highest votes first, skipping any whose label box would
// overlap one already chosen. Each arc: {x1, x2, votes, y?} where y is the apex y.
export function selectLabels(arcs, { maxLabels, minGap, labelWidth, labelHeight = 14 }) {
  const order = arcs.map((_, i) => i).sort((i, j) => arcs[j].votes - arcs[i].votes || i - j);
  const chosen = [];
  const boxes = [];
  for (const i of order) {
    if (chosen.length >= maxLabels) break;
    const x = (arcs[i].x1 + arcs[i].x2) / 2;
    const y = arcs[i].y ?? 0;
    const clash = boxes.some((b) => Math.abs(b.x - x) < labelWidth + minGap && Math.abs(b.y - y) < labelHeight);
    if (!clash) { chosen.push(i); boxes.push({ x, y }); }
  }
  return chosen;
}
