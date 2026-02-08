/**
 * Project Zen - Main entry point (Orchestrator)
 * Wires UI snapshot, behavioral signals, webcam, load estimation, and frontend.
 */

(function () {
  const ZEN_ATTR = 'data-project-zen';
  let zenActive = false;
  let isTracking = false;
  let uiSnapshot = null;

  function refreshUISnapshot() {
    if (typeof window.projectZenExtractUI !== 'undefined' && window.projectZenExtractUI.getStructuralSnapshot) {
      uiSnapshot = window.projectZenExtractUI.getStructuralSnapshot();
      if (window.projectZenSignals && window.projectZenSignals.resetSignals) {
        window.projectZenSignals.resetSignals();
      }
      console.log('Project Zen: UI snapshot has', (uiSnapshot && uiSnapshot.elements && uiSnapshot.elements.length) || 0, 'candidate elements');
    }
  }

  function startBehavioralTracking() {
    var S = window.projectZenSignals;
    if (!S) return;
    if (S.startScroll) S.startScroll();
    if (S.startClicks) S.startClicks();
    if (S.startDwell) S.startDwell();
  }

  function stopBehavioralTracking() {
    var S = window.projectZenSignals;
    if (!S) return;
    if (S.stopScroll) S.stopScroll();
    if (S.stopClicks) S.stopClicks();
    if (S.stopDwell) S.stopDwell();
  }

  /**
   * Callback when threshold breach is confirmed.
   * Send enriched context to background for Gemini analysis.
   */
  function onThresholdBreached(loadData) {
    console.log('🚨 Threshold breach detected. Sending to background for Gemini analysis.');
    const behavioralState = getBehavioralState();
    const focusedElementId = behavioralState && behavioralState.focusedElementId;

    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'THRESHOLD_BREACH',
        payload: {
          score: loadData.score,
          factors: loadData.factors,
          focusedElementId,
          idsInViewport: behavioralState && behavioralState.idsInViewport,
          uiSnapshot,
          timestamp: Date.now(),
        },
      }, function (response) {
        if (chrome.runtime.lastError) {
          console.error('Failed to send threshold breach:', chrome.runtime.lastError);
        } else {
          console.log('✅ Threshold breach sent to background.');
        }
      });
    }
  }

  function setTracking(enabled) {
    if (isTracking === enabled) return;
    isTracking = enabled;
    if (!isTracking) {
      stopBehavioralTracking();
      if (window.projectZenWebcam) window.projectZenWebcam.stop();
      // Stop threshold monitor
      if (window.projectZenThresholdMonitor && window.projectZenThresholdMonitor.stopMonitoring) {
        window.projectZenThresholdMonitor.stopMonitoring();
      }
    } else {
      refreshUISnapshot();
      startBehavioralTracking();
      if (window.projectZenWebcam) window.projectZenWebcam.setTracking(true);
      // Start threshold monitor with callback
      if (window.projectZenThresholdMonitor && window.projectZenThresholdMonitor.startMonitoring) {
        window.projectZenThresholdMonitor.startMonitoring(onThresholdBreached);
      }
    }
  }

  function setZenMode(enabled) {
    zenActive = enabled;
    if (window.projectZenApplyUI && window.projectZenApplyUI.setZenMode) {
      window.projectZenApplyUI.setZenMode(enabled);
    } else {
      var root = document.documentElement;
      if (enabled) {
        root.classList.add('zen-mode-active');
        if (document.body) document.body.classList.add('zen-mode-active');
      } else {
        root.classList.remove('zen-mode-active');
        if (document.body) document.body.classList.remove('zen-mode-active');
      }
    }
    console.log('Project Zen: Zen Mode', enabled ? 'on' : 'off');
  }

  function showZenPrompt() {
    if (window.projectZenApplyUI && window.projectZenApplyUI.showZenPrompt) {
      window.projectZenApplyUI.showZenPrompt();
    }
  }

  function getBehavioralState() {
    return (window.projectZenSignals && window.projectZenSignals.getState) ? window.projectZenSignals.getState() : null;
  }

  function getUISnapshot() {
    return uiSnapshot;
  }

  function init() {
    if (typeof chrome === 'undefined' || !chrome.runtime) return;
    chrome.runtime.sendMessage({ type: 'GET_ZEN_STATE' }, function (response) {
      if (chrome.runtime.lastError) return;
      setZenMode(response && response.zenEnabled);
    });
    chrome.storage.local.get(['isTracking'], function (result) {
      if (chrome.runtime.lastError) return;
      setTracking(result && result.isTracking);
    });
  }

  chrome.runtime.onMessage.addListener(function (message) {
    if (message.type === 'ZEN_STATE_CHANGED' && typeof message.zenEnabled === 'boolean') {
      setZenMode(message.zenEnabled);
    }
    if (message.type === 'TRACKING_STATE_CHANGED' && typeof message.isTracking === 'boolean') {
      setTracking(message.isTracking);
    }
    if (message.type === 'SHOW_ZEN_PROMPT') {
      showZenPrompt();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.projectZen = {
    setZenMode,
    setTracking,
    showZenPrompt,
    getBehavioralState,
    getUISnapshot,
    refreshUISnapshot,
  };
})();
