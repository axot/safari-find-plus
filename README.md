# Regex Find — Safari Web Extension

A Safari web extension that replaces the built-in Find (Cmd+F) with a regex-powered search. Highlights all matches on the page using the CSS Custom Highlight API and lets you navigate between them.

## Prerequisites

- macOS 13+ (Ventura or later)
- Xcode 15+ with Command Line Tools installed
- Safari 17.2+ (required for CSS Custom Highlight API)
- Free Apple ID (for code signing)

## Setup

### 1. Generate the Xcode Project

Use the included build script (handles bundle identifier fix automatically):

```bash
bash build.sh
```

Or run manually:

```bash
xcrun safari-web-extension-converter RegexFind/ \
  --project-location ./build \
  --app-name "RegexFind" \
  --bundle-identifier com.local.regexfind \
  --swift \
  --macos-only \
  --force \
  --no-open \
  --copy-resources
```

### 2. Open in Xcode

```bash
open build/RegexFind/RegexFind.xcodeproj
```

### 3. Configure Signing

1. Select the **RegexFind** project in the navigator
2. For **both** targets (RegexFind and RegexFind Extension):
   - Go to **Signing & Capabilities**
   - Set **Team** to your Personal Team (your Apple ID)

### 4. Build and Run

Press **Cmd+R** (⌘R) to build and run. The host app will launch — you can close it.

### 5. Enable the Extension in Safari

1. Open **Safari → Settings → Extensions**
2. Check the box next to **RegexFind**
3. Open **Safari → Settings → Developer** (or **Advanced**)
4. Check **Allow unsigned extensions**

> **Note:** "Allow unsigned extensions" resets every time Safari restarts. You'll need to re-enable it each session.

## Usage

| Action | Shortcut |
|--------|----------|
| Open Regex Find popup | **⌘⇧F** (Command+Shift+F) |
| Next match | **Enter** |
| Previous match | **Shift+Enter** |
| Toggle case sensitivity | Click **Aa** button |
| Clear and close | **Escape** |

1. Press **⌘⇧F** to open the search popup
2. Type a JavaScript-compatible regex pattern (e.g., `\d{3}-\d{4}`, `https?://\S+`)
3. Matches are highlighted on the page in real time
4. Use **Enter** / **Shift+Enter** to navigate between matches
5. The match counter shows your position (e.g., "3 of 42")

## Known Limitations

- **No cross-element matching** — A regex like `hello` won't match text split across HTML elements (e.g., `<b>hel</b>lo`)
- **No iframe/cross-frame search** — Only searches the top-level document
- **Maximum 500 matches** — Highlighting is capped at 500 matches for performance
- **No dynamic content tracking** — Highlights auto-refresh on SPA navigation and significant DOM changes, but some edge cases may require re-searching
- **Safari 17.2+ required** — Uses the CSS Custom Highlight API, unavailable in older Safari versions
- **"Allow unsigned extensions" resets on Safari restart** — Must be re-enabled each time you launch Safari
