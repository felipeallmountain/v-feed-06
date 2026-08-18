# V-FEED [06] — AI Agent Work Process & Context Directory

Welcome to the AI Agent Work Process repository documentation for **V-FEED [06] — Interactive Transmedia CRT Installation**.

This directory (`docs/agent-process/`) synthesizes the complete context, decision records, architectural blueprints, and step-by-step development process followed by AI agents during the creation of the V-FEED [06] system.

---

## 📌 Executive Overview

**V-FEED [06]** is a computational video art installation that maps YouTube Shorts video streams onto a 2×3 matrix of physical Cathode Ray Tube (CRT) monitors (1080×1920 portrait aspect ratio). Using optical computer vision (Google MediaPipe), the system transforms the viewer's body into a **Human Antenna**, modulating GLSL analog distortion shaders (CRT curvature, scanlines, chromatic RGB split, V-Hold jitter, RF noise) and synthesized Web Audio (15.734 kHz CRT flyback hum + static noise) in real time (<45 ms latency).

The development was executed through structured pair-programming cycles with AI agents, guided by [agent-plan.md](file:///home/bricktop/Projects/pabellon/v-feed-06/agent-plan.md) and [docs/prd.md](file:///home/bricktop/Projects/pabellon/v-feed-06/docs/prd.md).

---

## 📂 Process Documentation Index

| File | Description |
| :--- | :--- |
| 📄 **[01-agent-workflow-and-conventions.md](file:///home/bricktop/Projects/pabellon/v-feed-06/docs/agent-process/01-agent-workflow-and-conventions.md)** | Standard operating procedures, prompt guidelines, coding standards, and hardware execution rules for AI agents working on V-FEED [06]. |
| 📄 **[02-architecture-and-subsystem-breakdown.md](file:///home/bricktop/Projects/pabellon/v-feed-06/docs/agent-process/02-architecture-and-subsystem-breakdown.md)** | In-depth breakdown of the 5 core subsystems: Graphics Engine, Computer Vision, Video Pipeline, Web Audio, and Calibration HUD. |
| 📄 **[03-implementation-roadmap-and-decisions.md](file:///home/bricktop/Projects/pabellon/v-feed-06/docs/agent-process/03-implementation-roadmap-and-decisions.md)** | Chronological implementation phases (Phases 1-7) and key Architectural Decision Records (ADRs). |
| 📄 **[04-context-summary-and-cheatsheet.md](file:///home/bricktop/Projects/pabellon/v-feed-06/docs/agent-process/04-context-summary-and-cheatsheet.md)** | High-density context snapshot, directory mapping, CLI commands, Zustand state model, and troubleshooting guide for future AI sessions. |

---

## 🔗 Related Master Documents

- **Master Plan**: [agent-plan.md](file:///home/bricktop/Projects/pabellon/v-feed-06/agent-plan.md)
- **Product Requirements Document**: [docs/prd.md](file:///home/bricktop/Projects/pabellon/v-feed-06/docs/prd.md)
- **Conceptual & Artistic Proposal**: [docs/propuesta.md](file:///home/bricktop/Projects/pabellon/v-feed-06/docs/propuesta.md)
- **Main Application Entry**: [src/main.ts](file:///home/bricktop/Projects/pabellon/v-feed-06/src/main.ts) / [src/core/App.ts](file:///home/bricktop/Projects/pabellon/v-feed-06/src/core/App.ts)
