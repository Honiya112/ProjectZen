/**
 * Project Zen - Main entry point (Orchestrator)
 * Wires UI snapshot, behavioral signals, webcam, load estimation, and frontend.
 */

(function () {
  const ZEN_ATTR = 'data-project-zen';
  const DOM_CHANGE_DEBOUNCE_MS = 1000; // Wait 1s after last mutation to update snapshot

  let zenActive = false;
  let isTracking = false;
  let uiSnapshot = null;
  let lastUISnapshot = null; // Track previous snapshot for element ID mapping
  let lastAdaptationData = null; // Cache adaptation strategy for partner to apply

  // MutationObserver for tracking DOM changes
  let mutationObserver = null;
  let mutationDebounceTimer = null;
  
  // Element ID mapping for signal preservation
  let elementIdMapping = {}; // Maps old element IDs to new element IDs when DOM changes

  /**
   * Create initial UI snapshot and RESET signals
   * Called only on page load and when tracking starts
   */
  function createInitialUISnapshot() {
    if (typeof window.projectZenExtractUI !== 'undefined' && window.projectZenExtractUI.getStructuralSnapshot) {
      lastUISnapshot = uiSnapshot; // Save previous for mapping
      uiSnapshot = window.projectZenExtractUI.getStructuralSnapshot();
      
      // ONLY reset signals on initial creation (not on DOM changes)
      if (window.projectZenSignals && window.projectZenSignals.resetSignals) {
        window.projectZenSignals.resetSignals();
      }
      
      console.log('📋 Initial UI snapshot created:', (uiSnapshot && uiSnapshot.elements && uiSnapshot.elements.length) || 0, 'elements');
    }
  }

  /**
   * Refresh UI snapshot WITHOUT resetting signals
   * Called when DOM structure changes (don't lose behavioral data!)
   */
  function refreshUISnapshot() {
    if (typeof window.projectZenExtractUI !== 'undefined' && window.projectZenExtractUI.getStructuralSnapshot) {
      lastUISnapshot = uiSnapshot; // Save previous for mapping
      uiSnapshot = window.projectZenExtractUI.getStructuralSnapshot();
      
      // Re-map existing signals to new element IDs
      if (lastUISnapshot && uiSnapshot) {
        remapSignalsToNewElements(lastUISnapshot, uiSnapshot);
      }
      
      console.log('📄 UI snapshot updated (signals preserved):', (uiSnapshot && uiSnapshot.elements && uiSnapshot.elements.length) || 0, 'elements');
    }
  }

  /**
   * Re-map behavioral signals when element IDs change due to DOM mutations
   * Preserves dwell time and other signals across structure changes
   */
  function remapSignalsToNewElements(oldSnapshot, newSnapshot) {
    if (!window.projectZenSignals) return;
    
    const S = window.projectZenSignals;
    if (!S.dwellByElementId) return;
    
    // Build mapping: old element index → new element index (based on tag/role/text)
    const mapping = buildElementMapping(oldSnapshot, newSnapshot);
    
    // Remap dwell times
    const newDwell = {};
    Object.keys(S.dwellByElementId).forEach((oldId) => {
      const newId = mapping[oldId];
      if (newId) {
        newDwell[newId] = (newDwell[newId] || 0) + S.dwellByElementId[oldId];
      }
    });
    
    S.dwellByElementId = newDwell;
    
    // Update focused element ID if it exists in mapping
    if (S.focusedElementId && mapping[S.focusedElementId]) {
      S.focusedElementId = mapping[S.focusedElementId];
    }
    
    // Update last clicked element ID
    if (S.lastClickedElementId && mapping[S.lastClickedElementId]) {
      S.lastClickedElementId = mapping[S.lastClickedElementId];
    }
    
    console.log('🔄 Signals re-mapped to new element IDs. Preserved dwell times:', Object.keys(newDwell).length, 'elements');
  }

  /**
   * Build mapping from old element IDs to new element IDs
   * Matches elements by: role → tag → text preview content
   * This is fuzzy matching to handle DOM reorganization
   */
  function buildElementMapping(oldSnapshot, newSnapshot) {
    const mapping = {};
    if (!oldSnapshot.elements || !newSnapshot.elements) return mapping;
    
    const oldElements = oldSnapshot.elements;
    const newElements = newSnapshot.elements;
    
    // Create lookup by: role + tag + text fingerprint
    const oldBySignature = {};
    oldElements.forEach((el) => {
      const sig = createElementSignature(el);
      if (!oldBySignature[sig]) oldBySignature[sig] = [];
      oldBySignature[sig].push(el);
    });
    
    // Try to match new elements to old elements
    const usedNewIndices = new Set();
    newElements.forEach((newEl) => {
      const sig = createElementSignature(newEl);
      if (oldBySignature[sig] && oldBySignature[sig].length > 0) {
        // Find first unused old element with same signature
        for (const oldEl of oldBySignature[sig]) {
          if (!usedNewIndices.has(oldEl.id)) {
            mapping[oldEl.id] = newEl.id;
            usedNewIndices.add(oldEl.id);
            break;
          }
        }
      }
    });
    
    return mapping;
  }

  /**
   * Create a unique signature for an element to match across DOM restructuring
   */
  function createElementSignature(element) {
    // Use role + tag + first 30 chars of text as signature
    const text = (element.textPreview || '').substring(0, 30);
    return `${element.role}:${element.tag}:${text}`;
  }

  /**
   * Debounced UI snapshot refresh - called when DOM changes detected
   * This refresh PRESERVES signals (unlike initial creation)
   */
  function debouncedRefreshUISnapshot() {
    if (mutationDebounceTimer) clearTimeout(mutationDebounceTimer);
    mutationDebounceTimer = setTimeout(() => {
      console.log('📄 DOM changes detected. Updating UI snapshot (preserving signals)...');
      refreshUISnapshot();
    }, DOM_CHANGE_DEBOUNCE_MS);
  }

  /**
   * Setup MutationObserver to detect DOM structure changes
   */
  function setupMutationObserver() {
    if (mutationObserver) return; // Already set up

    const config = {
      childList: true,      // Track added/removed children
      subtree: true,        // Watch entire tree
      attributes: false,    // Don't track attribute changes (too noisy)
      characterData: false, // Don't track text changes
    };

    mutationObserver = new MutationObserver((mutations) => {
      // Check if changes are meaningful (not just noise)
      const hasMeaningfulChanges = mutations.some((mutation) => {
        if (mutation.type === 'childList') {
          return mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0;
        }
        return false;
      });

      if (hasMeaningfulChanges) {
        debouncedRefreshUISnapshot();
      }
    });

    const rootNode = document.body || document.documentElement;
    mutationObserver.observe(rootNode, config);
    console.log('📡 MutationObserver activated. Watching for DOM changes (signals will be preserved).');
  }

  /**
   * Teardown MutationObserver
   */
  function teardownMutationObserver() {
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }
    if (mutationDebounceTimer) {
      clearTimeout(mutationDebounceTimer);
      mutationDebounceTimer = null;
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
   * Capture frame immediately and send enriched context to background for Gemini analysis.
   */
  function onThresholdBreached(loadData) {
    console.log('🚨 Threshold breach detected. Capturing frame and sending to background for Gemini analysis.');
    console.log('📊 Stress trend:', loadData.trend, 'Average stress:', loadData.averageStress?.toFixed(2));
    const behavioralState = getBehavioralState();
    const focusedElementId = behavioralState && behavioralState.focusedElementId;

    // Capture frame immediately
    let cameraFrame = null;
    if (window.projectZenWebcam && window.projectZenWebcam.captureFrameNow) {
      cameraFrame = window.projectZenWebcam.captureFrameNow();
    }

    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage({
        type: 'THRESHOLD_BREACH',
        payload: {
          score: loadData.score,
          factors: loadData.factors,
          perElementStress: loadData.perElementStress, // NEW: per-element stress breakdown
          focusedElementId,
          idsInViewport: behavioralState && behavioralState.idsInViewport,
          uiSnapshot,
          cameraFrame,
          persistenceSec: loadData.persistenceSec || 0,
          trend: loadData.trend, // stress trend (increasing/steady/decreasing)
          averageStress: loadData.averageStress, // average stress over window
          timestamp: Date.now(),
        },
      }, function (response) {
        if (chrome.runtime.lastError) {
          console.error('Failed to send threshold breach:', chrome.runtime.lastError);
        } else {
          console.log('✅ Threshold breach + camera frame sent to background.');
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
      teardownMutationObserver();
      // Stop threshold monitor
      if (window.projectZenThresholdMonitor && window.projectZenThresholdMonitor.stopMonitoring) {
        window.projectZenThresholdMonitor.stopMonitoring();
      }
    } else {
      // On initial tracking start, create snapshot with signal reset
      createInitialUISnapshot();
      setupMutationObserver();
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

  /**
   * Get cached adaptation strategy (for partner to apply)
   */
  function getLastAdaptationStrategy() {
    return lastAdaptationData;
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
      // Store adaptation strategy for partner to consume
      if (message.adaptationStrategy) {
        lastAdaptationData = message.adaptationStrategy;
        console.log('📋 Adaptation strategy received:', lastAdaptationData);
        // If partner hasn't implemented UI changes yet, show basic prompt
        showZenPrompt();
        // Partner can call window.projectZen.getLastAdaptationStrategy() to get the full strategy
      } else {
        // Legacy: simple prompt without adaptation data
        showZenPrompt();
      }
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
    getLastAdaptationStrategy,
  };
})();
