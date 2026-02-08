/* UI Structural Snapshot
 * Extracts candidate elements (paragraphs, tables, sidebars, etc.) so we can
 * later map behavioral signals (dwell, scroll, interaction) to specific elements
 * and infer focusedElementId / friction. */

const DATA_ATTR = 'data-project-zen-el-id';
const ID_PREFIX = 'pzen-';
const TEXT_PREVIEW_LEN = 80;

// Selectors for trackable elements, in document-order priority
const TRACKABLE_SELECTOR = [
  'main',
  'article',
  '[role="main"]',
  'aside',
  '[role="complementary"]',
  'nav',
  '[role="navigation"]',
  'header',
  'footer',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p',
  'blockquote',
  'ul', 'ol',
  'table',
  'figure',
  'section',
  '.sidebar',
  '[class*="sidebar"]',
  '[class*="content"]',
].join(', ');

// Map tag/role to a simple role label for the snapshot
function getRole(el) {
  const tag = el.tagName.toLowerCase();
  const role = (el.getAttribute('role') || '').toLowerCase();
  const cls = (el.className || '').toLowerCase();

  if (tag === 'main' || role === 'main') return 'main';
  if (tag === 'article') return 'article';
  if (tag === 'aside' || role === 'complementary' || cls.includes('sidebar')) return 'sidebar';
  if (tag === 'nav' || role === 'navigation') return 'nav';
  if (tag === 'header') return 'header';
  if (tag === 'footer') return 'footer';
  if (/^h[1-6]$/.test(tag)) return 'heading';
  if (tag === 'p') return 'paragraph';
  if (tag === 'blockquote') return 'blockquote';
  if (tag === 'ul' || tag === 'ol') return 'list';
  if (tag === 'li') return 'list-item';
  if (tag === 'table') return 'table';
  if (tag === 'figure') return 'figure';
  if (tag === 'section') return 'section';
  if (cls.includes('content')) return 'content-block';
  return tag;
}

// Get a short text preview for context
function getTextPreview(el) {
  const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
  return text.slice(0, TEXT_PREVIEW_LEN) + (text.length > TEXT_PREVIEW_LEN ? '…' : '');
}

// Check if an element is likely meaningful (not empty, not script/style)
function isMeaningful(el) {
  if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME'].includes(el.tagName)) return false;
  if (el.closest('script, style, noscript')) return false;
  // Skip tiny fragments (e.g. spacer divs)
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 && rect.height < 2) return false;
  return true;
}

// Recursive collect elements that match our selectors, in document order
function collectElements(root, seen) {
  const list = [];
  const walk = (node) => {
    if (!node || node.nodeType !== 1) return;
    if (seen.has(node)) return;
    const el = /** @type {Element} */ (node);
    if (!isMeaningful(el)) return;

    const matches = el.matches && el.matches(TRACKABLE_SELECTOR);
    if (matches) {
      seen.add(node);
      list.push(el);
    }
    for (let i = 0; i < node.childNodes.length; i++) {
      walk(node.childNodes[i]);
    }
  };
  walk(root);
  return list;
}

/* Build a structural snapshot of the page: all candidate elements we can
 * later map dwell, scroll, and interaction signals to.
 * Injects data-project-zen-el-id on each so we can re-query rects for intersection.
 *
 * @returns {{
 *   timestamp: number,
 *   viewport: { width: number, height: number },
 *   documentHeight: number,
 *   elements: Array<{ id: string, tag: string, role: string, textPreview: string, index: number }>
 * }} */
function getStructuralSnapshot() {
  const root = document.body || document.documentElement;
  if (!root) {
    return { timestamp: Date.now(), viewport: { width: 0, height: 0 }, documentHeight: 0, elements: [] };
  }

  const seen = new Set();
  const rawElements = collectElements(root, seen);

  const viewport = {
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  };
  const documentHeight = Math.max(
    document.body?.scrollHeight ?? 0,
    document.documentElement.scrollHeight ?? 0
  );

  const elements = [];
  rawElements.forEach((el, index) => {
    const id = `${ID_PREFIX}${index}`;
    el.setAttribute(DATA_ATTR, id);
    elements.push({
      id,
      tag: el.tagName.toLowerCase(),
      role: getRole(el),
      textPreview: getTextPreview(el),
      index,
    });
  });

  return {
    timestamp: Date.now(),
    viewport,
    documentHeight,
    elements,
  };
}

/* Get current bounding rect for an element by snapshot id.
 * Use this when mapping viewport intersection / dwell to elements.
 * @param {string} id - Element id from snapshot (e.g. "pzen-0")
 * @returns {{ top: number, left: number, width: number, height: number } | null} */
function getElementRect(id) {
  const el = document.querySelector(`[${DATA_ATTR}="${id}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/* Get all snapshot element ids that currently intersect the viewport (with optional margin).
 * @param {number} [rootMarginTop=0] - Negative = shrink from top (e.g. -100)
 * @param {number} [rootMarginBottom=0] - Negative = shrink from bottom
 * @returns {string[]} ids that intersect */
function getIdsInViewport(rootMarginTop = 0, rootMarginBottom = 0) {
  const vh = document.documentElement.clientHeight;
  const top = rootMarginTop;
  const bottom = vh + rootMarginBottom;
  const inView = [];
  document.querySelectorAll(`[${DATA_ATTR}]`).forEach((el) => {
    const id = el.getAttribute(DATA_ATTR);
    if (!id) return;
    const r = el.getBoundingClientRect();
    if (r.bottom >= top && r.top <= bottom) inView.push(id);
  });
  return inView;
}

// Expose for content script (same world)
if (typeof window !== 'undefined') {
  window.projectZenExtractUI = {
    getStructuralSnapshot,
    getElementRect,
    getIdsInViewport,
    DATA_ATTR,
    ID_PREFIX,
  };
}
