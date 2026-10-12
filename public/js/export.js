import { layoutLegend } from './layout.js';

// Client-side image export: standalone SVG and PNG. Nothing is sent to the server.

export const ATTRIBUTION = 'Cross-reference data: openbible.info (CC-BY)';
const HEADER = 38;
const FOOTER = 26;

const escapeXml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function exportFilename(ref, ext) {
  return `reference-map-${String(ref).replace(/[^A-Za-z0-9.]+/g, '-')}.${ext}`;
}

/** Wraps already-inlined diagram markup with a title, attribution and background. */
export function buildStandaloneSvgString(innerMarkup, { title, width, height, background, color, legend = [] }) {
  const key = layoutLegend(legend, width);
  const keyHeight = key.rows ? key.height + 10 : 0;
  const total = height + HEADER + keyHeight + FOOTER;
  const font = 'font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"';
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${total}" viewBox="0 0 ${width} ${total}">`,
    `<rect width="${width}" height="${total}" fill="${escapeXml(background)}"/>`,
    `<text x="14" y="26" ${font} font-size="18" font-weight="700" fill="${escapeXml(color)}">${escapeXml(title)}</text>`,
    `<g transform="translate(0 ${HEADER})">${innerMarkup}</g>`,
    key.rows ? `<g transform="translate(0 ${HEADER + height + 8})">${key.items.map((it, i) => `<rect x="${it.x}" y="${it.y + 2}" width="10" height="10" rx="2" fill="${escapeXml(legend[i].color)}"/><text x="${it.x + 16}" y="${it.y + 11}" ${font} font-size="12" fill="${escapeXml(color)}">${escapeXml(it.name)}</text>`).join('')}</g>` : '',
    `<text x="14" y="${total - 9}" ${font} font-size="11" fill="${escapeXml(color)}" fill-opacity="0.7">${escapeXml(ATTRIBUTION)}</text>`,
    '</svg>',
  ].join('');
}

const STYLE_PROPS = [
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linejoin', 'stroke-dasharray',
  'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'paint-order',
];

/** Serializes the live diagram with computed styles inlined so it renders standalone. */
function inlineDiagram(svgEl) {
  const clone = svgEl.cloneNode(true);
  const live = svgEl.querySelectorAll('*');
  const copy = clone.querySelectorAll('*');
  live.forEach((node, i) => {
    const cs = getComputedStyle(node);
    const target = copy[i];
    target.removeAttribute('class');
    target.removeAttribute('style');
    for (const p of STYLE_PROPS) target.style.setProperty(p, cs.getPropertyValue(p));
  });
  clone.querySelectorAll('.arc-hit, title').forEach((n) => n.remove());
  return new XMLSerializer().serializeToString(clone).replace(/^<svg[^>]*>|<\/svg>$/g, '');
}

function buildFromDom(svgEl, { title, legend }) {
  const cs = getComputedStyle(svgEl.closest('.diagram-wrap') || svgEl);
  const width = +svgEl.getAttribute('width');
  const height = +svgEl.getAttribute('height');
  const body = getComputedStyle(document.body);
  return {
    width, height,
    markup: buildStandaloneSvgString(inlineDiagram(svgEl), {
      title, width, height, background: cs.backgroundColor, color: body.color, legend,
    }),
  };
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadSvg(svgEl, opts, filename) {
  const { markup } = buildFromDom(svgEl, opts);
  saveBlob(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }), filename);
}

export async function downloadPng(svgEl, opts, filename, scale = 2) {
  const { markup, width } = buildFromDom(svgEl, opts);
  const height = +/viewBox="0 0 \d+ (\d+)"/.exec(markup)[1];
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png'));
    saveBlob(blob, filename);
  } finally {
    URL.revokeObjectURL(url);
  }
}
