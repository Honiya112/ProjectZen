/**
 * Project Zen - Content Script
 * DOM manipulation and zen-mode UI injection.
 * Webcam capture (when isTracking) for AI/background.
 */

let zenActive = false;
let isTracking = false;
const ZEN_ATTR = 'data-project-zen';

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
  // SAFETY CHECK: videoEl must exist, be playing, and have actual pixel data (readyState 2+)
  if (!videoEl || videoEl.paused || videoEl.ended || videoEl.readyState < 2) {
    return null;
  }
  
  const w = videoEl.videoWidth;
  const h = videoEl.videoHeight;
  if (w === 0 || h === 0) return null; // Avoid empty frames

  canvasEl.width = w;
  canvasEl.height = h;
  const ctx = canvasEl.getContext('2d');
  ctx.drawImage(videoEl, 0, 0);
  
  return canvasEl.toDataURL('image/jpeg', 0.5); // Lower quality = faster speed for AI
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
    stopCameraCapture();
  } else {
    startCameraCapture();
  }
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
 * SCRAPER & SCROLL LOGIC
 * 1. Grabs real text from the page.
 * 2. Injects the Zen View.
 * 3. Watches scrolling to highlight the active paragraph.
 */
function activateZenModeWithRealData() {
  // 1. SCRAPE: Find the biggest text container (simple heuristic for Hackathon)
  // We look for all <p> tags, filter out short ones (nav links), and take the top 15.
  const allParagraphs = Array.from(document.querySelectorAll('p, article p'))
    .filter(p => p.innerText.length > 60) // Ignore short menu items
    .slice(0, 15) // Limit to 15 paragraphs for the demo
    .map(p => p.innerText);

  // If no text found, fallback to dummy
  if (allParagraphs.length === 0) {
    allParagraphs.push("Could not find main article text. Try a news article or Wikipedia page!");
  }

  // 2. BUILD: Create the Zen Overlay
  const existing = document.getElementById('zen-reader-view');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'zen-reader-view';

  const column = document.createElement('div');
  column.className = 'zen-reader-column';

  // The AI Briefing (Static for now, but ready for API data)
  const summaryCard = document.createElement('div');
  summaryCard.className = 'summary-card';
  summaryCard.innerHTML = `
    <span class="summary-badge"></span>
    <p class="summary-content">
      This is a live extraction of the current page. The content below is the actual text from the website, cleaned and refocused for your cognitive ease.
    </p>
  `;
  column.appendChild(summaryCard);

  // The Title (Grab real title)
  const title = document.createElement('h1');
  title.innerText = document.title.split('-')[0] || "Zen Mode Article";
  column.appendChild(title);

  // 3. INJECT: Add real paragraphs
  allParagraphs.forEach((text) => {
    const p = document.createElement('p');
    p.innerText = text;
    column.appendChild(p);
  });

  overlay.appendChild(column);
  document.body.appendChild(overlay);

  // 4. OBSERVE: The "Scroll Focus" Magic
  // We create a "zone" in the middle of the screen (-40% top, -40% bottom).
  // Whatever enters this thin strip gets the 'focus-paragraph' class.
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('focus-paragraph');
      } else {
        entry.target.classList.remove('focus-paragraph');
      }
    });
  }, {
    root: overlay,           // Watch scrolling inside the overlay
    rootMargin: "-45% 0px -45% 0px", // The "Hot Zone" is only the center 10% of screen
    threshold: 0
  });

  // Tell observer to watch all new p tags
  column.querySelectorAll('p').forEach(p => observer.observe(p));
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
