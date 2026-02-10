/**
 * Project Zen - Main entry point (Orchestrator)
 * Wires UI snapshot, behavioral signals, webcam, load estimation, and frontend.
 */
import './ui-structure/extractUI.js';
import './signals/scroll.js';
import './signals/clicks.js';
import './signals/dwell.js';
import './signals/webcam.js';
import './load-estimation/estimateLoad.js';
import './monitoring/thresholdMonitor.js';

import { renderZenMode, showZenNotification } from './frontend/applyUI.js';

window.projectZenApplyUI = {
  // 1. UPDATE SIGNATURE: Accept 'payload' as 3rd argument
  setZenMode: (enabled, mode = 'focus', payload = null) => {
    if (enabled) {
      document.documentElement.setAttribute('data-project-zen', 'on');
      renderZenMode(mode, payload);

      // 🛑 STOP TRACKING: Privacy on, Camera off, No more toasts.
      if (window.projectZen && window.projectZen.setTracking) {
        console.log("🛑 Zen Mode Active: Pausing all stress monitoring.");
        window.projectZen.setTracking(false);
      }

    } else {
      if (document.documentElement.getAttribute('data-project-zen') === 'on') {
        console.log("↩️ Deactivating Glass UI...");
        document.documentElement.removeAttribute('data-project-zen');
        
        // Re-enable tracking if they leave Zen Mode
        if (window.projectZen) window.projectZen.setTracking(true);
        
        location.reload();
      }
    }
  },

  // The "Smart Prompt" Logic
  showZenPrompt: (strategy) => {
    console.log("✨ Zen Prompt requested via Smart Notification");

    // Determine Mode
    let zenMode = 'focus';
    if (strategy?.mode === 'CONTENT_PRIORITIZATION') {
      zenMode = 'explain';
    }

    // Show the Glass Toast
    showZenNotification(strategy, () => {
       // User clicked "Activate" -> Turn it on!
       window.projectZenApplyUI.setZenMode(true, zenMode, strategy?.payload);
       // Sync with storage
       chrome.storage.local.set({ zenEnabled: true });
    });
  }
};

(function () {
  const DOM_CHANGE_DEBOUNCE_MS = 1000; // Wait 1s after last mutation to update snapshot

  let isTracking = false;
  let uiSnapshot = null;
  let lastUISnapshot = null; // Track previous snapshot for element ID mapping
  let lastAdaptationData = null; // Cache adaptation strategy for partner to apply

  // MutationObserver for tracking DOM changes
  let mutationObserver = null;
  let mutationDebounceTimer = null;


  console.log("🚀 Project Zen: Orchestrator Loaded");

  // 1. LISTEN FOR STATE CHANGES
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'ZEN_STATE_CHANGED') {
      window.projectZenApplyUI.setZenMode(message.zenEnabled);
      sendResponse({ received: true });
    }
    
    else if (message.type === 'TRACKING_STATE_CHANGED') {
      setTracking(message.isTracking);
      sendResponse({ received: true });
    }
    
    else if (message.type === 'SHOW_ZEN_PROMPT') {
      console.log("📩 Received Adaptation Strategy:", message.adaptationStrategy);
      if (message.adaptationStrategy) {
        window.projectZenApplyUI.showZenPrompt(message.adaptationStrategy);
      }
      sendResponse({ success: true });
   }
   return false;
  });

  // // 2. CHECK INITIAL STATE ON LOAD
  // chrome.storage.local.get(['zenEnabled', 'isTracking'], (result) => {
  //   if (result.zenEnabled) {
  //     window.projectZenApplyUI.setZenMode(true);
  //   }
    
  //   // Auto-enable tracking for testing if needed
  //   if (result.isTracking) {
  //     setTracking(true);
  //   } else {
  //     setTracking(true);
  //     chrome.storage.local.set({ isTracking: true });
  //   }
  // });

  // // Trigger new Glass UI
  // function setZenMode(enabled) {
  //   zenActive = enabled;
  //   console.log('[ProjectZen] Setting Zen Mode to:', enabled);

  //   if (window.projectZenApplyUI && window.projectZenApplyUI.setZenMode) {
  //     window.projectZenApplyUI.setZenMode(enabled);
  //   } else {
  //     // Fallback (Legacy)
  //     var root = document.documentElement;
  //     if (enabled) {
  //       root.classList.add('zen-mode-active');
  //       if (document.body) document.body.classList.add('zen-mode-active');
  //     } else {
  //       root.classList.remove('zen-mode-active');
  //       if (document.body) document.body.classList.remove('zen-mode-active');
  //     }
  //   }
  // }

  function setTracking(enabled) {
    if (isTracking === enabled) return;
    isTracking = enabled;
    if (!isTracking) {
      console.log('[ProjectZen] Stopping tracking');
      stopBehavioralTracking();
      if (window.projectZenWebcam) window.projectZenWebcam.stop();
      teardownMutationObserver();
      if (window.projectZenThresholdMonitor && window.projectZenThresholdMonitor.stopMonitoring) {
        window.projectZenThresholdMonitor.stopMonitoring();
      }
    } else {
      console.log('[ProjectZen] Starting tracking');
      createInitialUISnapshot();
      setupMutationObserver();
      startBehavioralTracking();
      if (window.projectZenWebcam) window.projectZenWebcam.setTracking(true);
      if (window.projectZenThresholdMonitor && window.projectZenThresholdMonitor.startMonitoring) {
        window.projectZenThresholdMonitor.startMonitoring(onThresholdBreached);
      }
    }
  }

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
      
      console.log('[ProjectZen] 📋 Initial UI snapshot created:', (uiSnapshot && uiSnapshot.elements && uiSnapshot.elements.length) || 0, 'elements');
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
      
      console.log('[ProjectZen] 📄 UI snapshot updated (signals preserved):', (uiSnapshot && uiSnapshot.elements && uiSnapshot.elements.length) || 0, 'elements');
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
    
    console.log('[ProjectZen] 🔄 Signals re-mapped to new element IDs. Preserved dwell times:', Object.keys(newDwell).length, 'elements');
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
      console.log('[ProjectZen] 📄 DOM changes detected. Updating UI snapshot (preserving signals)...');
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
    console.log('[ProjectZen] 📡 MutationObserver activated. Watching for DOM changes (signals will be preserved).');
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
    if (!S) {
      console.warn('[ProjectZen] Signals API not available');
      return;
    }
    console.log('[ProjectZen] Starting behavioral tracking: scroll, clicks, dwell');
    if (S.startScroll) S.startScroll();
    if (S.startClicks) S.startClicks();
    if (S.startDwell) S.startDwell();
    console.log('[ProjectZen] Behavioral tracking started');
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
    console.log('[ProjectZen] 🚨 Threshold breach detected. Capturing frame and sending to background for Gemini analysis.');
    console.log('[ProjectZen] 📊 Stress trend:', loadData.trend, 'Average stress:', loadData.averageStress?.toFixed(2));
    const behavioralState = getBehavioralState();
    const focusedElementId = behavioralState && behavioralState.focusedElementId;

    const rawText = document.body.innerText || "";
    const cleanText = rawText.replace(/\s+/g, ' ').substring(0, 6000);

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
          pageText: cleanText,
          persistenceSec: loadData.persistenceSec || 0,
          trend: loadData.trend, // stress trend (increasing/steady/decreasing)
          averageStress: loadData.averageStress, // average stress over window
          timestamp: Date.now(),
        },
      }, function (response) {
        if (chrome.runtime.lastError) {
          console.error('[ProjectZen:Error] Failed to send threshold breach:', chrome.runtime.lastError);
        } else {
          console.log('[ProjectZen] ✅ Threshold breach + camera frame sent to background.');
        }
      });
    }
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

    // 1. FORCE ZEN MODE OFF ON LOAD
    window.projectZenApplyUI.setZenMode(false);
    chrome.storage.local.set({ zenEnabled: false });

    // 2. Start Monitoring
    chrome.storage.local.get(['isTracking'], function (result) {
      if (chrome.runtime.lastError) return;
      setTracking(true);
      chrome.storage.local.set({ isTracking: true });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.projectZen = {
    setZenMode: window.projectZenApplyUI.setZenMode,
    setTracking,
    showZenPrompt,
    getBehavioralState,
    getUISnapshot,
    refreshUISnapshot,
    getLastAdaptationStrategy: () => lastAdaptationData,
  };
})();
