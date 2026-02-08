/**
 * Project Zen - Content Script
 * DOM manipulation and zen-mode UI injection.
 * Webcam capture (when isTracking) for AI/background.
 */

let zenActive = false;
let isTracking = false;
const ZEN_ATTR = 'data-project-zen';

// --- UI structural snapshot (candidate elements for behavioral signal mapping) ---
let uiSnapshot = null;

// --- Camera capture (hidden video + canvas, 3s frame → Base64 JPEG → background) ---
const CAPTURE_INTERVAL_MS = 3000;
let videoEl = null;
let canvasEl = null;
let stream = null;
let captureTimerId = null;

function createCameraElements() {
  if (videoEl && canvasEl) return;
  const wrap = document.createElement('div');
  wrap.id = 'project-zen-camera';
  wrap.setAttribute('aria-hidden', 'true');
  wrap.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;';
  videoEl = document.createElement('video');
  videoEl.autoplay = true;
  videoEl.muted = true;
  videoEl.playsInline = true;
  videoEl.setAttribute('playsinline', '');
  canvasEl = document.createElement('canvas');
  wrap.appendChild(videoEl);
  wrap.appendChild(canvasEl);
  (document.body || document.documentElement).appendChild(wrap);
}

function captureFrameToBase64() {
  if (!videoEl || videoEl.paused || videoEl.ended || videoEl.readyState < 2) {
    return null;
  }
  
  // OPTIMIZATION: Downscale to 320px width to save AI tokens/latency
  // 320px is plenty for Gemini to see facial expressions.
  const scale = 320 / videoEl.videoWidth;
  const w = 320;
  const h = videoEl.videoHeight * scale;

  canvasEl.width = w;
  canvasEl.height = h;
  const ctx = canvasEl.getContext('2d');
  
  // Draw the small version
  ctx.drawImage(videoEl, 0, 0, w, h);
  
  // Compress to JPEG 60% quality
  return canvasEl.toDataURL('image/jpeg', 0.6); 
}

function startCameraCapture() {
  if (!isTracking) return;
  createCameraElements();
  if (stream) {
    startCaptureLoop();
    return;
  }
  navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    .then((mediaStream) => {
      if (!isTracking) {
        mediaStream.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = mediaStream;
      videoEl.srcObject = stream;
      videoEl.onloadedmetadata = () => {
        videoEl.play().catch(() => {});
        startCaptureLoop();
      };
    })
    .catch((err) => {
      const name = err?.name || '';
      const denied = name === 'NotAllowedError' || name === 'PermissionDeniedError';
      console.warn('Project Zen: camera access', denied ? 'denied or dismissed' : err.message);
    });
}

function startCaptureLoop() {
  stopCaptureLoop();
  captureTimerId = setInterval(() => {
    if (!isTracking) {
      stopCameraCapture();
      return;
    }
    const base64 = captureFrameToBase64();
    if (base64) {
      chrome.runtime.sendMessage({ type: 'CAMERA_FRAME', frame: base64 });
    }
  }, CAPTURE_INTERVAL_MS);
}

function stopCaptureLoop() {
  if (captureTimerId) {
    clearInterval(captureTimerId);
    captureTimerId = null;
  }
}

function stopCameraCapture() {
  stopCaptureLoop();
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  if (videoEl && videoEl.srcObject) {
    videoEl.srcObject = null;
  }
}

function setTracking(enabled) {
  if (isTracking === enabled) return;
  isTracking = enabled;
  if (!isTracking) {
    stopBehavioralTracking();
    stopCameraCapture();
  } else {
    refreshUISnapshot();
    startBehavioralTracking();
    startCameraCapture();
  }
}

/** Refresh the structural snapshot of the page (candidate elements for dwell/scroll mapping). */
function refreshUISnapshot() {
  if (typeof window.projectZenExtractUI !== 'undefined' && window.projectZenExtractUI.getStructuralSnapshot) {
    uiSnapshot = window.projectZenExtractUI.getStructuralSnapshot();
    if (typeof window.projectZenBehavioralSignals !== 'undefined' && window.projectZenBehavioralSignals.reset) {
      window.projectZenBehavioralSignals.reset();
    }
    console.log('Project Zen: UI snapshot has', uiSnapshot?.elements?.length ?? 0, 'candidate elements');
  }
}

function startBehavioralTracking() {
  if (typeof window.projectZenBehavioralSignals !== 'undefined' && window.projectZenBehavioralSignals.start) {
    window.projectZenBehavioralSignals.start();
  }
}

function stopBehavioralTracking() {
  if (typeof window.projectZenBehavioralSignals !== 'undefined' && window.projectZenBehavioralSignals.stop) {
    window.projectZenBehavioralSignals.stop();
  }
}

/** Get current behavioral signals (for AI / cognitive-load threshold). */
function getBehavioralState() {
  return typeof window.projectZenBehavioralSignals !== 'undefined' && window.projectZenBehavioralSignals.getState
    ? window.projectZenBehavioralSignals.getState()
    : null;
}

function init() {
  chrome.runtime.sendMessage({ type: 'GET_ZEN_STATE' }, (response) => {
    if (chrome.runtime.lastError) return;
    setZenMode(response?.zenEnabled ?? false);
  });
  chrome.storage.local.get(['isTracking'], (result) => {
    if (chrome.runtime.lastError) return;
    setTracking(result?.isTracking ?? false);
  });
}

function setZenMode(enabled) {
  zenActive = enabled;
  console.log("Setting Zen Mode to:", enabled);

  // Instead of just the body, let's put it on the HTML tag so it's global
  const root = document.documentElement; 
  
  if (enabled) {
    root.classList.add('zen-mode-active');
    document.body.classList.add('zen-mode-active');
  } else {
    root.classList.remove('zen-mode-active');
    document.body.classList.remove('zen-mode-active');
  }
}

function toggleZenMode() {
  zenActive = !zenActive;
  document.documentElement.setAttribute(ZEN_ATTR, zenActive ? 'on' : 'off');
  document.body?.classList.toggle('zen-mode', zenActive);
  return zenActive;
}

function showZenPrompt() {
  // Prevent double popups
  if (document.getElementById('zen-prompt-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'zen-prompt-overlay';
  overlay.innerHTML = `
    <div class="zen-card">
      <div class="zen-icon">🧘‍♂️</div>
      <h3>Need a Focus Boost?</h3>
      <p>You look a bit overwhelmed. Want to switch to Zen Mode?</p>
      <div class="zen-actions">
        <button id="zen-yes">Yes, please</button>
        <button id="zen-no">Not now</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Logic for buttons
  document.getElementById('zen-yes').onclick = () => {
    console.log("✅ Honiya's Zen Mode: ACTIVATE!");
    setZenMode(true); // Your existing function
    overlay.remove();
  };

  document.getElementById('zen-no').onclick = () => {
    overlay.remove();
  };
}

// Listen for state changes from popup/background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'ZEN_STATE_CHANGED' && typeof message.zenEnabled === 'boolean') {
    setZenMode(message.zenEnabled);
  }
  if (message.type === 'TRACKING_STATE_CHANGED' && typeof message.isTracking === 'boolean') {
    setTracking(message.isTracking);
  }
});

/**
 * ZEN MODE v5: Adaptive Colors & Magnifying Focus
 */
function activateZenModeWithRealData() {
  // 1. EXTRACT COLORS (Simple Heuristic)
  // We grab the computed background color of the body or header
  let primaryColor = window.getComputedStyle(document.body).backgroundColor;
  // If transparent/white, try to find a header color
  if (primaryColor === 'rgba(0, 0, 0, 0)' || primaryColor === 'rgb(255, 255, 255)') {
    const header = document.querySelector('header, nav, .navbar');
    if (header) primaryColor = window.getComputedStyle(header).backgroundColor;
  }
  // If still boring, fallback to a soft "Smart Grey" (Zen default)
  if (!primaryColor || primaryColor === 'rgb(255, 255, 255)') {
    primaryColor = 'rgba(226, 232, 240, 0.6)'; // Slate-200
  }

  // 2. SCRAPE CONTENT
  const articleRoot = document.querySelector('#mw-content-text .mw-parser-output') || 
                      document.querySelector('article') || 
                      document.querySelector('main') || 
                      document.querySelector('#content') || 
                      document.body;

  const overlay = document.createElement('div');
  overlay.id = 'zen-reader-view';
  
  // INJECT DYNAMIC COLORS
  // We set CSS variables on the overlay to match the site's vibe
  overlay.style.setProperty('--zen-bg-1', primaryColor);
  // Complementary color (just dim the primary slightly for the second orb)
  overlay.style.setProperty('--zen-bg-2', primaryColor.replace('rgb', 'rgba').replace(')', ', 0.5)'));

  const column = document.createElement('div');
  column.className = 'zen-reader-column';

  // AI Briefing
  column.innerHTML = `
    <div class="summary-card">
      <p class="summary-content">✨ <b>AI Briefing:</b> Environment adapted to page context. Focus magnifier active.</p>
    </div>
    <h1>${document.title.split('-')[0].trim()}</h1>
  `;

  // 3. INTELLIGENT CLONING (Preserve Blocks)
  Array.from(articleRoot.children).forEach(node => {
    // Filter junk
    if (['NAV', 'HEADER', 'FOOTER', 'ASIDE', 'FORM', 'SCRIPT', 'STYLE'].includes(node.tagName)) return;
    if (node.classList.contains('mw-editsection') || node.classList.contains('toc')) return;
    if (['UL', 'OL'].includes(node.tagName) && node.querySelectorAll('a').length > 5 && node.innerText.length < 200) return;

    // Filter for content
    let isContent = false;
    if (['H1','H2','H3','H4'].includes(node.tagName)) isContent = true;
    if (['P','BLOCKQUOTE','FIGURE','UL','OL'].includes(node.tagName) && node.innerText.trim().length > 20) isContent = true;
    if (node.tagName === 'P' && node.querySelector('img')) isContent = true;

    if (isContent) {
      const clone = node.cloneNode(true);
      // Clean attributes
      const cleaner = (el) => {
        el.removeAttribute('class'); el.removeAttribute('id'); el.removeAttribute('style');
        if(el.tagName !== 'IMG') { el.removeAttribute('width'); el.removeAttribute('height'); }
        if (el.tagName === 'A') el.target = "_blank";
      };
      cleaner(clone);
      clone.querySelectorAll('*').forEach(cleaner);
      
      // Fix images
      clone.querySelectorAll('img').forEach(img => {
         if (!img.src.startsWith('http')) img.src = img.src; 
      });

      column.appendChild(clone);
    }
  });

  overlay.appendChild(column);
  document.body.appendChild(overlay);

  // 4. ATTACH OBSERVER (The Magnifying Logic)
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      // Toggle the 'focus-paragraph' class which now triggers the POP OUT effect
      if (entry.isIntersecting) entry.target.classList.add('focus-paragraph');
      else entry.target.classList.remove('focus-paragraph');
    });
  }, { 
    root: overlay, 
    rootMargin: "-45% 0px -45% 0px", // Strict center focus
    threshold: 0 
  });

  column.querySelectorAll('p, h2, h3, li, blockquote').forEach(el => observer.observe(el));
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
