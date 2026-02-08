/**
 * Project Zen - Webcam signal
 * Camera capture & 320px downsampling; sends base64 JPEG to background for AI.
 */

(function () {
  const CAPTURE_INTERVAL_MS = 3000;
  const TARGET_WIDTH = 320;
  const JPEG_QUALITY = 0.6;

  let videoEl = null;
  let canvasEl = null;
  let stream = null;
  let captureTimerId = null;
  let isTracking = false;

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
    if (!videoEl || videoEl.paused || videoEl.ended || videoEl.readyState < 2) return null;
    const scale = TARGET_WIDTH / videoEl.videoWidth;
    const w = TARGET_WIDTH;
    const h = videoEl.videoHeight * scale;
    canvasEl.width = w;
    canvasEl.height = h;
    const ctx = canvasEl.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, w, h);
    return canvasEl.toDataURL('image/jpeg', JPEG_QUALITY);
  }

  function startCaptureLoop() {
    if (captureTimerId) clearInterval(captureTimerId);
    captureTimerId = setInterval(function () {
      if (!isTracking) {
        window.projectZenWebcam && window.projectZenWebcam.stop();
        return;
      }
      const base64 = captureFrameToBase64();
      if (base64 && typeof chrome !== 'undefined' && chrome.runtime) {
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

  function start() {
    if (!isTracking) return;
    createCameraElements();
    if (stream) {
      startCaptureLoop();
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then(function (mediaStream) {
        if (!isTracking) {
          mediaStream.getTracks().forEach(function (t) { t.stop(); });
          return;
        }
        stream = mediaStream;
        videoEl.srcObject = stream;
        videoEl.onloadedmetadata = function () {
          videoEl.play().catch(function () {});
          startCaptureLoop();
        };
      })
      .catch(function (err) {
        var name = err && err.name || '';
        var denied = name === 'NotAllowedError' || name === 'PermissionDeniedError';
        console.warn('Project Zen: camera access', denied ? 'denied or dismissed' : (err && err.message));
      });
  }

  function stop() {
    stopCaptureLoop();
    if (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
    }
    if (videoEl && videoEl.srcObject) videoEl.srcObject = null;
  }

  function setTracking(enabled) {
    isTracking = !!enabled;
    if (!isTracking) stop();
    else start();
  }

  if (typeof window !== 'undefined') {
    window.projectZenWebcam = {
      start,
      stop,
      setTracking,
      captureFrameToBase64,
    };
  }
})();
