# Project Zen

Adjusts webpage complexity based on your real-time cognitive load using Gemini.

## Structure

- **public/** – Static assets (images, icons); `index.html` is the main demo/fallback page.
- **src/** – Core logic:
  - **signals/** – Behavioral & visual data collection: scroll, clicks, dwell, webcam.
  - **load-estimation/** – Local cognitive load processing (stress score).
  - **ui-structure/** – DOM scanning for Gemini (JSON map of page content).
  - **gemini/** – AI orchestration (sends signals + UI JSON; receives semantic response).
  - **frontend/** – UI adaptation & component library (applyUI, Summary, Magnify).
  - **styles/** – Global styling (zen-mode.css – “Milky Glass OS” theme).
  - **index.js** – Main entry point (orchestrator).
- **background.js** – Chrome service worker for AI & state.
- **manifest.json** – Extension configuration & permissions.

## Setup

1. Load the extension in Chrome (Developer mode → Load unpacked).
2. Set your Gemini API key if using AI (e.g. via build env or storage).
3. Enable tracking in the popup to start behavioral signals and optional camera capture.

## Documentation & Hackathon Pitch

Project Zen infers cognitive load from behavioral signals (dwell, scroll entropy, interaction latency, re-reading, pauses) and optional webcam frames. When load exceeds a threshold, it can suggest or apply Zen Mode: a calmer, focused reading experience with adaptive glass UI.
