# walp

Canvas-based Matrix rain wallpaper for Wallpaper Engine. Streams can reveal an image using ASCII brightness and a configurable 16-color palette, or run as classic cmatrix-style rain with bright heads. Plain HTML/CSS/JavaScript, no build step or dependencies.

## Wallpaper Engine

1. Place the **complete repository folder** in `steamapps/common/wallpaper_engine/projects/myprojects/walp/` (the changes-only ZIP must first be extracted over your existing clone).
2. Open the project in Wallpaper Engine's editor via **File → Open**, then apply it. `project.json` contains the ready-made user properties; keep it beside `index.html`.
3. Select the wallpaper in **Installed** and adjust its properties. Choose a local image with **Image**. Changes apply immediately and restart the streams.

For a browser preview, open `index.html`. It defaults to classic rain until an image is supplied through Wallpaper Engine. The original repository contains no default image. Wallpaper Engine's settings UI is not available in a normal browser.

## Parameters

| Property | Meaning |
| --- | --- |
| Font size | Character size in pixels, 6–64 (default 12). |
| Minimum / maximum stream length | Independent limits in characters, 1–200 (defaults 7 / 20). Reversed limits are treated as a sorted range. |
| Density | 1–100, default 50; higher values produce more streams. |
| Use image | Map image brightness to ASCII characters; off enables classic rain. |
| Image | Local image selector. Empty or unreadable images fall back to classic rain. Images are stretched to the character grid, as in the original code. |
| Use image colors | On: quantize the image to the palette. Off: retain image brightness but use the main color. Has no effect on classic rain. |
| Main / monochrome color | Classic stream body and monochrome image color. |
| Classic rain head color | Bright stream heads (white by default); choose a lighter color than the body. |
| Background color | Canvas background, independent of all character colors. |
| Image palette 01–16 | Individual colors used for nearest-color image quantization. |

Density uses `scale = 50 / density`:

```js
MIN_DIST = Math.max(1, Math.round(4 * scale));
MAX_DIST = Math.max(MIN_DIST, Math.round(15 * scale));
PROB = Math.max(0, Math.round(11 * scale) - 1);
```

At density 50 these are exactly `4`, `15`, `10`. After the minimum gap, a stream starts with probability `1 / (PROB + 1)` per animation step; after the maximum gap it starts unconditionally. Distance is measured in character rows after the newest stream's tail.

## Code

- `src/script.js`: original grid, image sampling, stream animation and changed-cell rendering; Wallpaper Engine callbacks are at the bottom.
- `src/style.css`: font and layout defaults.
- `project.json`: property names, defaults and limits. Keep defaults in sync with JS/CSS when editing.

The animation targets 24 steps/s and respects lower Wallpaper Engine FPS limits and pause events. Rapid image/settings changes discard stale image-processing results. Fixed missing gradient decoding, font URL, last-row rendering and stream spacing/removal checks from the original.

API reference: [Wallpaper Engine user properties](https://docs.wallpaperengine.io/en/web/customization/properties.html).

## Rename the GitHub repository

On GitHub: **Settings → General → Repository name → Rename**. Then run inside the existing local clone:

```sh
git remote set-url origin https://github.com/MAKRORK/NEW_NAME.git
git remote -v
```

Commits, branches and local changes stay intact; no new clone or `git init` is needed. Renaming the local directory is optional. GitHub redirects the old repository URL, but updating `origin` is recommended.
