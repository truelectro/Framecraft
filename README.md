# Framecraft — App Store, Play Store & Product Feature Studio

A local, privacy-first design studio inspired by [AppLaunchpad](https://theapplaunchpad.com/) for crafting pixel-exact **Apple App Store screenshots**, **Google Play Store screenshots & 1024×500 Feature Graphics**, and **16:9 Product Feature Banners**.

## Quick Start

```bash
npm install
npm run dev
```

## Highlights

- **Exact Store Presets & Guardrails**
  - **Apple App Store Connect:** `1320 × 2868` (6.9" Primary Required), `1290 × 2796` (6.7"), `2064 × 2752` (iPad Pro 13")
  - **Google Play Console:** `1080 × 1920` (9:16 Editorial-Eligible Phone) & **`1024 × 500` Mandatory Feature Graphic** with safe-zone margin guides
  - **Web & Launch:** `1600 × 900` Product Feature Banner, `1270 × 760` Product Hunt Gallery, or Custom `W × H`
  - **Zero-Alpha 24-bit PNG Export:** Canvas renders on an opaque surface (`alpha: false`) so App Store Connect and Google Play Console never reject uploads for alpha channels.
- **9 Studio Layout Compositions** including a **Seamless 2-Slide Panoramic Device Bridge**, **Banner Split Hero**, **Dual Layer Depth**, **Perspective Tilts**, and **Spotlight UI Card**.
- **5 Vector Hardware Frames & Finishes:** iPhone 16 Pro, Pixel 9 Pro, iPad Pro 13", SaaS Window Card, and Frameless UI Card across Titanium & Minimal Clay finishes.
- **Platform-Independent Transforms & Overlays:** Device model, position, scale, and rotation are saved independently per platform (`iOS`, `Android`, `iPad`, `Banner`) while text, fills, screenshots, and custom **Overlay Layers** stay synced across targets.
- **Figma-Style Direct Canvas & Navigation:** Click, drag, corner-scale, and rotate devices, overlays, and text directly on the artboard with magnetic center snap guides and inline text editing (`T`). Includes cursor-anchored mouse-wheel / trackpad-pinch zoom, `Space` + drag panning, resizable sidebars (`⌘\`), Undo/Redo (`⌘Z` / `⌘⇧Z`), and full keyboard shortcuts (`?`).
- **Fast Export Workflow:** Drag-and-drop screenshots (`Shift` + drop for overlays), paste from clipboard (`⌘V`), preview inside simulated Light/Dark App Store & Play Store listings (`P`), and export single PNGs (`⌘E`), preset sets, or a combined **Both Stores** `.zip` bundle (`⌘⇧E`).
