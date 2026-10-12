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

// Every arc is a deliberately flattened half-ellipse: height = ratio * half-span.
// One shared ratio means arcs from the same verse are scaled copies of each other,
// so they nest and never cross, however far apart the references are.
export function arcRatio(narrow) {
  return narrow ? 0.5 : 0.35;
}

// Height of the half-ellipse spanning x1..x2 (proportional to the span, no cap).
export function arcHeight(x1, x2, ratio) {
  return Math.max(6, (Math.abs(x2 - x1) / 2) * ratio);
}

// Height of the farthest arc a verse at x could have; sizes the drawing area.
export function maxArcHeight(x, width, ratio) {
  return arcHeight(0, Math.max(x, width - x), ratio);
}

// Half-ellipse above ('out') or below ('in') the baseline.
export function arcPath(x1, x2, baseY, direction, ratio) {
  let a = Math.min(x1, x2), b = Math.max(x1, x2);
  if (b - a < 6) { const mid = (a + b) / 2; a = mid - 3; b = mid + 3; }
  const rx = (b - a) / 2;
  const ry = arcHeight(a, b, ratio);
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

// Text for the labelled zones above (outgoing) and below (incoming) the book bar.
export function zoneLabel(direction, verseLabel, count) {
  return `References ${direction === 'out' ? 'from' : 'to'} ${verseLabel} (${count})`;
}

// Non-color direction cue for list rows: a short visible badge plus a full phrase for screen readers.
export function directionInfo(direction) {
  return direction === 'out'
    ? { badge: 'From', sr: 'Outgoing reference' }
    : { badge: 'To', sr: 'Incoming reference' };
}
