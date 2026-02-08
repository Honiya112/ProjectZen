/**
 * Project Zen - UI Structural Snapshot (DOM scanning for Gemini)
 * Creates the JSON map of the page content: paragraphs, tables, sidebars, etc.
 * Used to map behavioral signals to elements and send structure to AI.
 */

const DATA_ATTR = 'data-project-zen-el-id';
const ID_PREFIX = 'pzen-';
const TEXT_PREVIEW_LEN = 80;

const TRACKABLE_SELECTOR = [
  'main', 'article', '[role="main"]',
  'aside', '[role="complementary"]', 'nav', '[role="navigation"]',
  'header', 'footer',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'blockquote', 'ul', 'ol', 'table', 'figure', 'section',
  '.sidebar', '[class*="sidebar"]', '[class*="content"]',
].join(', ');

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

function getTextPreview(el) {
  const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
  return text.slice(0, TEXT_PREVIEW_LEN) + (text.length > TEXT_PREVIEW_LEN ? '…' : '');
}

function isMeaningful(el) {
  if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME'].includes(el.tagName)) return false;
  if (el.closest('script, style, noscript')) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 && rect.height < 2) return false;
  return true;
}

function collectElements(root, seen) {
  const list = [];
  const walk = (node) => {
    if (!node || node.nodeType !== 1) return;
    if (seen.has(node)) return;
    const el = node;
    if (!isMeaningful(el)) return;
    if (el.matches && el.matches(TRACKABLE_SELECTOR)) {
      seen.add(node);
      list.push(el);
    }
    for (let i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i]);
  };
  walk(root);
  return list;
}

function getStructuralSnapshot() {
  const root = document.body || document.documentElement;
  if (!root) return { timestamp: Date.now(), viewport: { width: 0, height: 0 }, documentHeight: 0, elements: [] };
  const seen = new Set();
  const rawElements = collectElements(root, seen);
  const viewport = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
  const documentHeight = Math.max(document.body?.scrollHeight ?? 0, document.documentElement.scrollHeight ?? 0);
  const elements = [];
  rawElements.forEach((el, index) => {
    const id = ID_PREFIX + index;
    el.setAttribute(DATA_ATTR, id);
    elements.push({ id, tag: el.tagName.toLowerCase(), role: getRole(el), textPreview: getTextPreview(el), index });
  });
  return { timestamp: Date.now(), viewport, documentHeight, elements };
}

function getElementRect(id) {
  const el = document.querySelector(`[${DATA_ATTR}="${id}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

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

if (typeof window !== 'undefined') {
  window.projectZenExtractUI = {
    getStructuralSnapshot,
    getElementRect,
    getIdsInViewport,
    DATA_ATTR,
    ID_PREFIX,
  };
}
