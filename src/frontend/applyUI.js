import { 
  createZenContainer, 
  createSummaryCard, 
  createGlassBlock, 
  createContextSidebar,
  createSmartToast  
} from './components/GlassComponents.js';

export function renderZenMode(mode = 'focus', aiContent = null) {
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
  
  let summaryText = mode === 'explain' 
  ? "Contextual definitions active. Complexity reduced." 
  : "Environment optimized. Focus magnifier active.";

  if (aiContent) {
    summaryText = aiContent.payload?.summary || aiContent.payload?.title || "AI Analysis Complete.";
  }

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
  // --- A. THE BOUNCER (Structural Filter) ---
  // 1. Kick out the Site Header, Nav, and Footer immediately
  if (node.closest('header, nav, footer, .header, .navbar, .nav, .site-header, .site-footer, .footer')) return;
  
  // 2. Kick out Search Bars and Logos
  const classStr = (node.className || '').toLowerCase();
  const idStr = (node.id || '').toLowerCase();
  
  if (classStr.includes('search') || idStr.includes('search') || 
      classStr.includes('logo') || idStr.includes('logo') ||
      classStr.includes('menu') || classStr.includes('breadcrumb')) return;

  // --- B. VISIBILITY CHECK ---
  if (!node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return;

  const textStr = (node.innerText || '').toLowerCase();
  
  // (Keep your existing Social & Junk Filter here...)
  const badWords = ['share', 'social', 'facebook', 'twitter', 'linkedin', 'email', 'subscribe', 'advertisement', 'login', 'sign up'];
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
        const tableCard = createGlassBlock(node);
        tableCard.classList.add('zen-data-card'); 
        
        contentWrapper.appendChild(tableCard);
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

  document.body.appendChild(overlay);

  const existingSidebar = document.querySelector('.zen-knowledge-rail');
  if (existingSidebar) existingSidebar.remove();

  if (mode === 'explain') {
    const safeData = aiContent || {
      title: "Context Analysis",
      takeaways: ["Analyzing content...", "Identifying key concepts...", "Simplifying complexity..."],
      concepts: []
    };
    // Append to body so it sits ON TOP of the overlay
    document.body.appendChild(createContextSidebar(safeData));
  } 

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
  
  const targetSelectors = [
      '.zen-content-stream > p', 
      '.zen-content-stream > h2', 
      '.zen-content-stream > h3', 
      '.zen-content-stream > blockquote', 
      '.zen-content-stream > figure',
      '.zen-content-stream > ul', 
      '.zen-content-stream > ol',  
      '.zen-data-card'             
  ];

  column.querySelectorAll(targetSelectors.join(', ')).forEach(el => observer.observe(el));
}

/**
 * Shows the "Smart Prompt" toast
 */
export function showZenNotification(strategy, onConfirm) {
  const existingToast = document.querySelector('.zen-toast-container');
  if (existingToast) existingToast.remove();

  console.log("🔔 Creating Smart Toast for strategy:", strategy);
  const rationale = strategy?.rationale || "High cognitive load detected. Simplify interface?";
  
  // Ensure the confirm callback happens
  const toast = createSmartToast(rationale, () => {
    console.log("✅ User confirmed toast. Activating Zen Mode.");
    if (onConfirm) onConfirm();
  });
  
  document.body.appendChild(toast);
}