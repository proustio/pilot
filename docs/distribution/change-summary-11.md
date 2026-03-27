# Changes Summary — Distribution Planning (11)

This sprint covers the **Distribution Strategy** and **Brand Asset Generation** for the 3D Voxel Battleships game. We are preparing the groundwork for multi-platform availability without committing to specific wrapper code yet.

### Key Conceptual Goals:
1.  **Platform Independence**: Designing the core game to run identically across Web, Desktop (Steam, Itch.io), and Mobile (App Store, Play Store).
2.  **Brand Identity**: Creation of a master "Hero" icon that conveys the voxel aesthetic and game's theme instantly.

---

### Phase 1: Brand Asset Generation (DONE)

We have established a unified branding suite. These assets are stored in `public/icons/` and include:
*   **Master Icon (1024x1024)**: High-resolution source.
*   **Web/PWA Suite**: 192px and 512px.
*   **Mobile Store Suite**: 180px (iOS), 120px, and small legacy sizes.
*   **Steam/Itch.io Thumbnails**: Platform-specific aspect ratios (e.g., Capsule art and Cover images).

---

### Phase 2: Technical Distribution Model (Planned)

The strategy utilizes a "Best of Breed" split to ensure high-fidelity rendering on all platforms:

#### 1. Steam / Itch.io (Electron)
*   Wrap the Vite `dist/` production build in an **Electron** shell.
*   Bundles a dedicated Chromium browser to guarantee Three.js lighting and post-processing reflect exactly what we see in development.
*   Ability to integrate `steamworks.js` for achievements and cloud saves.

#### 2. iOS & Android (Capacitor)
*   Drop the Vite build into **Capacitor**.
*   Handles native SDKs (Android Studio, Xcode) while keeping the same core logic.
*   Optimized for "Store-Ready" behavior.

---

### Crucial App Store "Gotchas" (To Address)

To avoid rejection (especially from Apple), the game must "feel native." We will implement the following:
*   **Disable Web UI Behaviors**: CSS hardening to block `user-select`, magnifying glasses, and rubber-band scrolling.
*   **Asset Bundling**: Ensure all 5MB+ .gltf models are packed locally in the build to prevent blank screens during network fetching.
*   **Offline Support**: Leverage the existing PWA Service Worker as a fallback even within the native wrappers.

> [!NOTE]  
> The `public/icons/` directory now contains all necessary sizes to satisfy PWA manifests and app store requirements.
