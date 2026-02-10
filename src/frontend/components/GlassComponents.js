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
  // A. IMAGE HANDLING (Updated to Save Captions)
  const img = originalNode.tagName === 'IMG' ? originalNode : originalNode.querySelector('img');
  
  // Only process as "Image" if it's NOT a table/infobox
  if (img && !originalNode.tagName.includes('TABLE') && !originalNode.className.includes('infobox')) {
     const wrapper = document.createElement('div');
     wrapper.className = 'zen-media-wrapper';
     
     const newImg = document.createElement('img');
     newImg.src = img.src;
     wrapper.appendChild(newImg);

     // 🛑 NEW: Check if the original node had a caption!
     // If applyUI.js wrapped it in a <figure>, the caption is inside.
     const caption = originalNode.querySelector('figcaption');
     if (caption) {
         const newCap = document.createElement('figcaption');
         newCap.className = 'zen-caption';
         newCap.innerText = caption.innerText;
         wrapper.appendChild(newCap);
     }

     return wrapper;
  }

  // B. TABLE & BOX HANDLING
  if (originalNode.tagName === 'TABLE' || originalNode.classList.contains('infobox') || originalNode.classList.contains('wikitable')) {
    const wrapper = document.createElement('div');
    wrapper.className = 'zen-data-card'; 

    const clone = originalNode.cloneNode(true);
    clone.removeAttribute('style');
    clone.removeAttribute('width');
    clone.removeAttribute('height');

    wrapper.appendChild(clone);
    return wrapper;
  }

  // C. STANDARD TEXT HANDLING
  const clone = originalNode.cloneNode(true);
  const cleaner = (el) => {
    el.removeAttribute('class');
    el.removeAttribute('id');
    el.removeAttribute('style');
    if (el.tagName === 'A') {
        el.target = "_blank"; 
        el.style.textDecoration = "underline";
    }
  };
  cleaner(clone);
  clone.querySelectorAll('*').forEach(cleaner);
  
  return clone;
}

/**
 * 4. THE INTERVENTION: A Full-Screen "Breathing Space" Modal
 */
export function createSmartToast(rationale, onConfirm) { // Keeping name same to avoid refactoring import
  const backdrop = document.createElement('div');
  backdrop.className = 'zen-backdrop';
  
  backdrop.innerHTML = `
    <div class="zen-modal-glass">
      <div class="zen-modal-icon">🌱</div>
      <h3 class="zen-modal-title">Take a moment...</h3>
      <p class="zen-modal-text">${rationale || "High cognitive load detected. <br>Would you like to switch to a calmer view?"}</p>
      
      <div class="zen-modal-actions">
        <button id="zen-btn-dismiss">No, thanks</button>
        <button id="zen-btn-accept">Enter Zen Mode</button>
      </div>
    </div>
  `;

  // Actions
  backdrop.querySelector('#zen-btn-accept').onclick = () => {
    // Fade out smoothly
    backdrop.style.opacity = '0';
    setTimeout(() => {
      backdrop.remove();
      onConfirm();
    }, 300);
  };

  backdrop.querySelector('#zen-btn-dismiss').onclick = () => {
    backdrop.style.opacity = '0';
    setTimeout(() => backdrop.remove(), 300);
  };

  return backdrop;
}

/**
 * 5. THE KNOWLEDGE RAIL: For the "Confused" User (Explainer Mode)
 */
export function createContextSidebar(data) {
  const sidebar = document.createElement('div');
  sidebar.className = 'zen-knowledge-rail';
  
  // 1. Title (Fixed at top)
  const h3 = document.createElement('h3');
  h3.className = 'rail-header';
  h3.innerText = data.title || "Context Analysis";
  sidebar.appendChild(h3);

  // 2. Scrollable Wrapper (Prevents Cutoff)
  const wrapper = document.createElement('div');
  wrapper.className = 'rail-content-wrapper';

  // --- 🛑 NEW: THE 5-SENTENCE SUMMARY ---
  if (data.summary) {
    const summaryBox = document.createElement('div');
    summaryBox.className = 'rail-card rail-summary';
    // Make it look distinct (italic/bold)
    summaryBox.innerHTML = `<em>${data.summary}</em>`;
    summaryBox.style.borderLeft = "3px solid #d97706"; // Orange accent
    wrapper.appendChild(summaryBox);
  }

  // 3. The Takeaways (Bullet Points)
  if (data.takeaways) {
    data.takeaways.forEach(point => {
      const card = document.createElement('div');
      card.className = 'rail-card';
      card.innerText = "• " + point;
      wrapper.appendChild(card);
    });
  }

  // 4. The Definitions
  if (data.concepts) {
    data.concepts.forEach(item => {
      const card = document.createElement('div');
      card.className = 'rail-card';
      card.innerHTML = `<strong>${item.term}:</strong> ${item.definition}`;
      wrapper.appendChild(card);
    });
  }

  sidebar.appendChild(wrapper);
  return sidebar;
}