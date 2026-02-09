import { 
  createZenContainer, 
  createSummaryCard, 
  createGlassBlock, 
  createContextSidebar,
  createSmartToast  // 👈 Added this!
} from './components/GlassComponents.js';

export function renderZenMode(mode = 'focus') {
  console.log(`🎨 Rendering Zen Mode using recipe: [${mode}]`);

  // 1. COLORS & ROOT
  let primaryColor = window.getComputedStyle(document.body).backgroundColor;
  if (!primaryColor || primaryColor === 'rgba(0, 0, 0, 0)') primaryColor = 'rgba(226, 232, 240, 0.6)';

  let articleRoot = document.querySelector('article') || 
                    document.querySelector('#content') || 
                    document.querySelector('#mw-content-text .mw-parser-output') || 
                    document.body;

  // 2. BUILD STAGE
  const existing = document.getElementById('zen-reader-view');
  if (existing) existing.remove();
  const { overlay, column } = createZenContainer(primaryColor);
  
  const summaryText = mode === 'explain' ? "Contextual definitions active. Complexity reduced." : "Environment optimized. Focus magnifier active.";
  column.appendChild(createSummaryCard(summaryText));
  if (mode === 'explain') overlay.classList.add('zen-mode-explain');

  const title = document.createElement('h1');
  const docTitle = document.title.split('-')[0].trim();
  const pageH1 = document.querySelector('h1');
  title.innerText = (pageH1 && pageH1.innerText.length > 5) ? pageH1.innerText : docTitle;
  column.appendChild(title);

  // 3. INJECT CONTENT
  const contentWrapper = document.createElement('div');
  contentWrapper.className = 'zen-content-stream';

  const selectors = [
    'h2', 'h3', 'h4',        
    'p',                           
    'figure', 'img',                         
    'ul', 'ol', 'blockquote',
    'video', '.video-container',
    'table', '.infobox', '.wikitable', 'aside'
  ];
  
  const candidates = Array.from(articleRoot.querySelectorAll(selectors.join(',')));
  const acceptedNodes = new Set();

  candidates.forEach((node, index) => {
    // --- A. VISIBILITY & BLACKLIST ---
    if (!node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return;

    const classStr = (node.className || '').toLowerCase();
    const idStr = (node.id || '').toLowerCase();
    const textStr = (node.innerText || '').toLowerCase();
    
    // Explicitly kill Table of Contents (TOC) and Menus
    if (classStr.includes('toc') || idStr.includes('toc') || 
        classStr.includes('nav') || classStr.includes('menu') || 
        classStr.includes('sidebar') || textStr.startsWith('contents') || textStr === 'sections') return;

    // Social & Junk Filter
    const badWords = ['share', 'social', 'facebook', 'twitter', 'linkedin', 'email', 'subscribe', 'advertisement'];
    if (badWords.some(w => classStr.includes(w))) return;
    if (textStr.length < 200 && badWords.some(w => textStr.includes(w))) return;
    
    // Wikipedia Icons Filter
    if (classStr.includes('noviewer') || classStr.includes('metadata') || classStr.includes('noprint')) return;

    // --- B. LIST INVESTIGATOR (The "Link Menu" Killer) ---
    // If it's a list, check if it's actually just a pile of links (Navigation)
    if (node.tagName === 'UL' || node.tagName === 'OL') {
        const totalText = node.innerText.length;
        // Count how much of that text is inside links
        const links = node.querySelectorAll('a');
        let linkText = 0;
        links.forEach(l => linkText += l.innerText.length);
        
        // If > 50% of the text is clickable links, it's a menu/TOC. Trash it.
        // Exception: Unless it's really long (like a bibliography), but usually we want to hide that too in Zen Mode.
        if (totalText > 0 && (linkText / totalText) > 0.5) return;
    }

    // --- C. ICON KILLER ---
    if (node.tagName === 'IMG') {
        const w = node.naturalWidth || node.width || 0;
        const h = node.naturalHeight || node.height || 0;
        if (w < 150 || h < 100) return; 
        if (w > h * 4) return; 
        if (node.src.includes('.svg')) return;
    }

    // --- D. TABLE/BOX HANDLING ---
    if (node.tagName === 'TABLE' || classStr.includes('infobox') || classStr.includes('wikitable')) {
        let parent = node.parentElement;
        while (parent && parent !== articleRoot) {
            if (acceptedNodes.has(parent)) return;
            parent = parent.parentElement;
        }
        acceptedNodes.add(node);
        contentWrapper.appendChild(createGlassBlock(node));
        return;
    }

    // --- E. DUPLICATE GUARDS ---
    if (node.closest('ul, ol') && node.tagName !== 'UL' && node.tagName !== 'OL') return;

    let parent = node.parentElement;
    while (parent && parent !== articleRoot) {
      if (acceptedNodes.has(parent)) return;
      parent = parent.parentElement;
    }

    // --- F. CAPTION HUNTER ---
    let finalNode = node;
    if (node.tagName === 'IMG' && !node.closest('figure')) {
        let anchor = node.closest('a');
        let targetForNeighbor = anchor ? anchor : node;
        let nextSibling = targetForNeighbor.nextElementSibling;
        
        while(nextSibling && nextSibling.nodeType === 3) nextSibling = nextSibling.nextSibling;

        if (nextSibling && 
           ['P', 'DIV', 'SPAN', 'CITE', 'FIGCAPTION', 'SMALL', 'DD'].includes(nextSibling.tagName) &&
           nextSibling.innerText.length > 5 && 
           nextSibling.innerText.length < 300) {
            
            const wrapper = document.createElement('figure');
            const mediaClone = anchor ? anchor.cloneNode(true) : node.cloneNode(true);
            const capClone = document.createElement('figcaption');
            capClone.innerText = nextSibling.innerText;
            
            wrapper.appendChild(mediaClone);
            wrapper.appendChild(capClone);
            
            acceptedNodes.add(nextSibling); 
            if (anchor) acceptedNodes.add(anchor);
            
            finalNode = wrapper;
        }
    }

    acceptedNodes.add(node);
    contentWrapper.appendChild(createGlassBlock(finalNode));
  });

  column.appendChild(contentWrapper);
  if (mode === 'explain') column.appendChild(createContextSidebar());
  document.body.appendChild(overlay);

  // 4. OBSERVER
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
          entry.target.classList.add('focus-paragraph');
      } else {
          entry.target.classList.remove('focus-paragraph');
      }
    });
  }, { 
      root: overlay, 
      rootMargin: "-40% 0px -40% 0px", 
      threshold: 0.1 
  });
  
  // 🛑 FINAL FIX: Added 'ul' and 'ol' to this list so the whole card glows!
  const targetSelectors = [
      '.zen-content-stream > p', 
      '.zen-content-stream > h2', 
      '.zen-content-stream > h3', 
      '.zen-content-stream > blockquote', 
      '.zen-content-stream > figure',
      '.zen-content-stream > ul',  // 👈 Added Bullet Lists
      '.zen-content-stream > ol',  // 👈 Added Numbered Lists
      '.zen-data-card'             // 👈 Added Tables/Infoboxes
  ];

  column.querySelectorAll(targetSelectors.join(', ')).forEach(el => observer.observe(el));
}

/**
 * Shows the "Smart Prompt" toast
 */
export function showZenNotification(strategy, onConfirm) {
  // Prevent duplicates
  if (document.querySelector('.zen-toast-container')) return;

  const rationale = strategy?.rationale || "High cognitive load detected. Simplify interface?";
  const toast = createSmartToast(rationale, onConfirm);
  document.body.appendChild(toast);
}