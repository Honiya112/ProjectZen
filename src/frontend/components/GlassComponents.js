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
  // A. IMAGE HANDLING (Protect images from being crushed)
  // Check if the node IS an image or CONTAINS an image
  const img = originalNode.tagName === 'IMG' ? originalNode : originalNode.querySelector('img');
  
  if (img) {
    const wrapper = document.createElement('div');
    wrapper.className = 'zen-media-wrapper'; // New class for CSS
    
    const newImg = document.createElement('img');
    newImg.src = img.src.startsWith('http') ? img.src : img.src; // Keep src safe
    
    // Copy caption if it exists (figcaption or nearby text)
    const captionText = originalNode.innerText.trim();
    if (captionText && captionText.length > 0 && captionText.length < 100) {
        const caption = document.createElement('div');
        caption.className = 'zen-caption';
        caption.innerText = captionText;
        wrapper.appendChild(newImg);
        wrapper.appendChild(caption);
    } else {
        wrapper.appendChild(newImg);
    }
    return wrapper;
  }

  // B. TEXT HANDLING (Standard Logic)
  const clone = originalNode.cloneNode(true);
  
  // Cleaner function
  const cleaner = (el) => {
    el.removeAttribute('class');
    el.removeAttribute('id');
    el.removeAttribute('style');
    if (el.tagName === 'A') el.target = "_blank";
  };

  cleaner(clone);
  clone.querySelectorAll('*').forEach(cleaner);
  
  return clone;
}