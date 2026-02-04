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

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
