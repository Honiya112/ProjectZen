// src/frontend/applyUI.js
import { createZenContainer, createSummaryCard, createGlassBlock } from './components/GlassComponents.js';

/**
 * THE RENDERER: Orchestrates the Zen View
 */
export function renderZenMode() {
  // 1. EXTRACT COLORS (Simple Heuristic)
  let primaryColor = window.getComputedStyle(document.body).backgroundColor;
  // If transparent/white, try to find a header color
  if (primaryColor === 'rgba(0, 0, 0, 0)' || primaryColor === 'rgb(255, 255, 255)') {
    const header = document.querySelector('header, nav, .navbar');
    if (header) primaryColor = window.getComputedStyle(header).backgroundColor;
  }
  // Fallback to "Smart Grey"
  if (!primaryColor || primaryColor === 'rgb(255, 255, 255)') {
    primaryColor = 'rgba(226, 232, 240, 0.6)'; 
  }

  // 2. SCRAPE CONTENT (The "Extract" Phase)
  // We look for the main content wrapper
  const articleRoot = document.querySelector('#mw-content-text .mw-parser-output') || 
                      document.querySelector('article') || 
                      document.querySelector('main') || 
                      document.querySelector('#content') || 
                      document.body;

  // 3. BUILD THE STAGE
  // Remove existing overlay if present
  const existing = document.getElementById('zen-reader-view');
  if (existing) existing.remove();

  // Create the container with the dynamic color
  const { overlay, column } = createZenContainer(primaryColor);

  // Add the AI Summary Chip
  column.appendChild(createSummaryCard("Environment optimized. Focus magnifier active."));

  // Add the Title
  const title = document.createElement('h1');
  title.innerText = document.title.split('-')[0].trim();
  column.appendChild(title);

  // 4. PROCESS & INJECT NODES
  Array.from(articleRoot.children).forEach(node => {
    // Filter junk (navs, scripts, tiny lists)
    if (['NAV', 'HEADER', 'FOOTER', 'ASIDE', 'FORM', 'SCRIPT', 'STYLE'].includes(node.tagName)) return;
    if (node.classList.contains('mw-editsection') || node.classList.contains('toc')) return;
    
    // Check if it's "Substantive" content
    let isContent = false;
    if (['H1','H2','H3','H4'].includes(node.tagName)) isContent = true;
    if (['P','BLOCKQUOTE','FIGURE','UL','OL'].includes(node.tagName) && node.innerText.trim().length > 20) isContent = true;
    if (node.tagName === 'P' && node.querySelector('img')) isContent = true;

    if (isContent) {
      // Use our Component Factory to create the glass block
      const glassBlock = createGlassBlock(node);
      column.appendChild(glassBlock);
    }
  });

  // Attach to DOM
  document.body.appendChild(overlay);

  // 5. ACTIVATE THE "MAGNIFYING GLASS" (Intersection Observer)
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      // This toggles the CSS class that triggers the 3D Pop-out effect
      if (entry.isIntersecting) {
        entry.target.classList.add('focus-paragraph');
      } else {
        entry.target.classList.remove('focus-paragraph');
      }
    });
  }, { 
    root: overlay, 
    rootMargin: "-45% 0px -45% 0px", // Strict center focus
    threshold: 0 
  });

  // Watch text blocks
  column.querySelectorAll('p, h2, h3, li, blockquote').forEach(el => observer.observe(el));
}