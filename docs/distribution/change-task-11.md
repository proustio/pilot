# Changes Tasks — Distribution Planning (11)

> Reference: `docs/distribution/change-summary-11.md`  
> Codebase context: `public/icons/`, `docs/distribution/`

---

## 11. Distribution Planning & Branding

> **Goal**: Prepare the game for multi-platform distribution while maintaining a single codebase.

---

### 11.1 — Integrated Brand Assets

**Files:**
- `public/icons/icon-master-1024.png` (Master)
- `public/icons/icon-512.png | icon-192.png | icon-180.png | ...` (Variants)
- `public/icons/thumbnail-itch.png`
- `public/icons/thumbnail-steam-capsule.png`

- [x] **Generate Master Voxel Icon**: `public/icons/battleships-icon.png` (Source).
- [x] **Generate Resize Suite**:
  - [x] **Web/PWA**: 192px, 512px.
  - [x] **Apple (iOS/macOS)**: 1024px, 180px, 120px, 64px, 32px, 16px.
  - [x] **Android**: 512px, 192px.
- [x] **Generate Distribution Thumbnails**:
  - [x] **Itch.io Cover**: 630x500.
  - [x] **Steam Capsule**: 460x215.
- [ ] **Update `public/manifest.json`**: Point icons to the new `public/icons/` folder instead of the generic assets.

---

### 11.2 — Platform Hardware Abstraction (Planned)

**Future work to execute when platform support is required:**

- [ ] **Create `src/infrastructure/platform/PlatformService.ts`**:
  - Detect if running in `window.electron`, `Capacitor.platform`, or `Browser`.
  - Abstract "Quit Game" logic (closes window in Electron, closes app in Android).
- [ ] **Native CSS Hardening**:
  - [ ] Add `user-select: none` to `body`.
  - [ ] Disable touch callouts and magnifying glass.
  - [ ] Implement safe-area-insets for mobile displays.

---

### 11.3 — Wrapper Scaffolding (Planned)

- [ ] **Desktop Wrapper (Electron)**:
  - Integration script: `npm run build:electron`.
  - Placeholder for Steamworks API.
- [ ] **Mobile Wrapper (Capacitor)**:
  - Dependency addition: `@capacitor/core`, `@capacitor/cli`.
  - Native project initialization (`npx cap add ios`, `npx cap add android`).

---

### 11.4 — Distribution Docs

- [x] **Create `docs/distribution/change-summary-11.md`**: Outlines strategy and split.
- [x] **Create `docs/distribution/change-task-11.md`**: This task document.
