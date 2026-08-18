# Product Requirements Document (PRD)
## V-FEED [06] — Interactive Transmedia CRT Installation

The full and detailed PRD is available at: [docs/prd.md](file:///Users/mclovin/Documents/pabellon/v-feed-06/docs/prd.md)

### Technical Stack Summary

| Layer | Technology |
| :--- | :--- |
| **Frontend & Tooling** | Vite + TypeScript |
| **Graphics Engine & Shaders** | Three.js + Custom GLSL Postprocessing Shaders (CRT Curvature, Scanlines, RGB Split, V-Hold, RF Noise) |
| **Computer Vision** | Google MediaPipe Tasks Vision (`@mediapipe/tasks-vision` for Pose & Hands) |
| **Video Ingestion** | Node.js + Express / YouTube Data API v3 + Local buffer fallback for offline mode |
| **Reactive Audio** | Web Audio API (White noise + 15.734 kHz CRT flyback hum) |
| **On-Site Calibration** | lil-gui (Floating HUD for tuning camera thresholds, shaders, and bezel compensation) |
| **Hardware & Output** | 1080×1920 vertical canvas split into a 2×3 matrix across 6 CRT monitors via HDMI-to-RCA/Composite adapters |

For complete system architecture, data flow diagrams, functional/non-functional requirements, and physical hardware specs, refer to [docs/prd.md](file:///Users/mclovin/Documents/pabellon/v-feed-06/docs/prd.md).
