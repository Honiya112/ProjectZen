/**
 * 1. THE STAGE: Creates the main overlay with dynamic background colors
 */
export function createZenContainer(primaryColor) {
  const overlay = document.createElement('div');
  overlay.id = 'zen-reader-view';
  
  // Set dynamic colors extracted from the site
  if (primaryColor) {
    overlay.style.setProperty('--zen-bg-1', primaryColor);
    overlay.style.setProperty('--zen-bg-2', primaryColor.replace(')', ', 0.5)'));
  }

  const column = document.createElement('div');
  column.className = 'zen-reader-column';
  
  overlay.appendChild(column);
  return { overlay, column };
}

/**
 * 2. THE SUMMARY: The "AI Briefing" Chip
 */
export function createSummaryCard(text = "Environment optimized. Focus magnifier active.") {
  const card = document.createElement('div');
  card.className = 'summary-card';
  card.innerHTML = `
    <p class="summary-content">✨ <b>AI Briefing:</b> ${text}</p>
  `;
  return card;
}

/**
 * 3. THE CONTENT: Cleans and prepares text/images for the Glass View
 */
export function createGlassBlock(originalNode) {
  // Clone the node to avoid breaking the original site
  const clone = originalNode.cloneNode(true);

  // CLEANUP: Strip all classes, IDs, and styles to let our CSS take over
  const cleaner = (el) => {
    el.removeAttribute('class');
    el.removeAttribute('id');
    el.removeAttribute('style');
    // Keep image dimensions for aspect ratio, strip for everything else
    if (el.tagName !== 'IMG') {
      el.removeAttribute('width');
      el.removeAttribute('height');
    }
    // Force links to new tab
    if (el.tagName === 'A') el.target = "_blank";
  };

  cleaner(clone);
  clone.querySelectorAll('*').forEach(cleaner);

  // Fix Relative Image URLs
  clone.querySelectorAll('img').forEach(img => {
    if (!img.src.startsWith('http')) img.src = img.src; 
  });
  if (clone.tagName === 'IMG' && !clone.src.startsWith('http')) {
    clone.src = originalNode.src;
  }

  return clone;
}