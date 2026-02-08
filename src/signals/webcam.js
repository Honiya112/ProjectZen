/**
 * Project Zen - Webcam signal
 * Camera stream management. Captures frame ON-DEMAND (when threshold breached).
 * Frame is downsampled to 320px for efficiency.
 */

(function () {
  const TARGET_WIDTH = 320;
  const JPEG_QUALITY = 0.6;

  let videoEl = null;
  let canvasEl = null;
  let stream = null;
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

  /**
   * Capture a single frame at 320px and return as base64 JPEG.
   * Called ON-DEMAND when threshold is breached.
   */
  function captureFrameNow() {
    if (!videoEl || videoEl.paused || videoEl.ended || videoEl.readyState < 2) {
      console.warn('Project Zen Webcam: Video not ready to capture.');
      return null;
    }
    const scale = TARGET_WIDTH / videoEl.videoWidth;
    const w = TARGET_WIDTH;
    const h = videoEl.videoHeight * scale;
    canvasEl.width = w;
    canvasEl.height = h;
    const ctx = canvasEl.getContext('2d');
    ctx.drawImage(videoEl, 0, 0, w, h);
    const base64 = canvasEl.toDataURL('image/jpeg', JPEG_QUALITY);
    console.log(`📸 Frame captured on-demand: ${base64.length} chars (320px)`);
    return base64;
  }

  function start() {
    if (!isTracking) return;
    createCameraElements();
    if (stream) {
      console.log('📹 Camera stream already active.');
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
          console.log('📹 Camera stream initialized. Ready for on-demand capture.');
        };
      })
      .catch(function (err) {
        var name = err && err.name || '';
        var denied = name === 'NotAllowedError' || name === 'PermissionDeniedError';
        console.warn('Project Zen: camera access', denied ? 'denied or dismissed' : (err && err.message));
      });
  }

  function stop() {
    if (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
      stream = null;
    }
    if (videoEl && videoEl.srcObject) videoEl.srcObject = null;
    console.log('📹 Camera stream stopped.');
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
      captureFrameNow,
    };
  }
})();
