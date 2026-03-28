# AGENTS.md

## Project Overview

Safari Find Plus is a Safari Web Extension (Manifest V3) that adds regex-powered find-on-page. It uses the CSS Custom Highlight API for zero-DOM-mutation highlighting.

## Architecture

```
RegexFind/
├── manifest.json       # MV3 extension manifest — permissions, commands, content scripts
├── popup.html/css/js   # Popup UI — search input, match counter, navigation buttons
├── content.js          # Content script — highlight engine, injected into every page
├── content.css         # CSS Custom Highlight API styles (::highlight pseudo-elements)
├── background.js       # Background script — minimal (popup opens via _execute_action)
└── images/             # Extension icons (16, 32, 48, 96, 128px PNGs)
```

### Component Roles

- **popup.js**: UI logic — regex validation (debounced 300ms), keyboard handlers (Enter/Shift+Enter/Escape), case toggle. Sends messages to content script via `browser.tabs.sendMessage`. Uses fire-and-forget pattern (popup closes on blur, pending Promises die).
- **content.js**: Highlight engine — TreeWalker text node collection, regex matching with empty-match guard and backtracking timeout (1s), CSS Custom Highlight API rendering, match navigation with wrap-around and smooth scroll.
- **content.css**: Two `::highlight()` rules — `regex-find-matches` (yellow) for all matches, `regex-find-current` (orange) for the active match.
- **background.js**: Nearly empty — `_execute_action` command opens popup automatically without code.

### Message Protocol

Messages between popup and content use `{ action, ...payload }`:
- `search` — popup→content: `{ action: 'search', pattern, flags }`
- `selectNext` / `selectPrev` — popup→content: navigate matches
- `clear` — popup→content: remove all highlights
- `getState` — popup→content: query current searchState (used on popup open for state restoration)
- `stateUpdate` — content→popup: broadcast match count/index changes

## Build & Run Commands

```bash
# Full build (generates Xcode project, fixes bundle IDs, compiles)
./build.sh

# Or step by step:
xcrun safari-web-extension-converter RegexFind/ \
  --project-location ./build \
  --app-name "RegexFind" \
  --bundle-identifier com.local.regexfind \
  --swift --macos-only --force --no-open --copy-resources

xcodebuild -project build/RegexFind/RegexFind.xcodeproj -scheme "RegexFind" build

# Open in Xcode (then Cmd+R to build and run)
open build/RegexFind/RegexFind.xcodeproj

# Validate manifest.json
cat RegexFind/manifest.json | python3 -m json.tool
```

There is no npm, no bundler, no test framework. All QA is manual in Safari.

### Safari Setup (after build)

1. Safari → Settings → Extensions → Enable "Regex Find"
2. Safari → Settings → Developer → "Allow unsigned extensions"
3. Note: "Allow unsigned extensions" resets every Safari restart

## Testing

No automated test framework. Test manually in Safari:

1. Open `test-page.html` in Safari with the extension enabled
2. Press ⌘⇧F to open popup
3. Verify: `\d+` highlights all numbers (yellow), current match is orange
4. Verify: `[invalid` shows red error border on input
5. Verify: Enter/Shift+Enter navigates between matches (wrap-around at ends)
6. Verify: Escape clears highlights and resets input
7. Verify: Opening popup on about:blank shows "Cannot search on this page"
8. Verify: Close popup, reopen — previous search state is restored
9. Verify: `.*` (empty-match regex) does NOT freeze the page

`test-page.html` includes: normal text, inline elements, `<script>` tags, `display:none` divs, `<textarea>`, `<input>`, `contenteditable` — the engine must skip all non-visible/editable content.

## Code Style

### JavaScript

- **No build tools** — vanilla JS, no npm, no bundler, no transpiler
- **`const`/`let` only** — never `var`
- **`browser.*` API** — Safari uses the Firefox-style Promise-based API, NOT `chrome.*`
- **Plain functions** — no classes, no IIFEs, no design patterns. Functions at module scope.
- **2-space indentation**, single quotes in JS where practical
- **No inline event handlers** in HTML — all listeners in JS files
- **No `console.log`** in production paths — only `console.error` for API support checks
- **No `eval()`** — regex is always via `new RegExp()`

### CSS

- **No CSS frameworks** — vanilla CSS only
- **Dark mode** via `@media (prefers-color-scheme: dark)` — all components must support it
- **No inline styles** in HTML (except test-page.html which is a test harness)
- **Highlight colors**: yellow `#ffff00` (all matches), orange `#ff9900` (current match)
- **System font stack**: `-apple-system, BlinkMacSystemFont, ...`
- **Monospace for input**: `'SF Mono', Menlo, Monaco, 'Courier New', monospace`

### HTML

- **No inline scripts** — Safari extension popup CSP enforces `script-src 'self'`
- External `<script src="popup.js">` and `<link rel="stylesheet" href="popup.css">` only

### Naming Conventions

- Functions: `camelCase` — `performSearch`, `collectTextNodes`, `sendToActiveTab`
- Constants: `UPPER_SNAKE_CASE` — `MAX_RESULTS`, `EXCLUDE_TAGS`, `HIGHLIGHT_NAME`
- State variables: `camelCase` — `searchState`, `matchRanges`, `debounceTimer`
- CSS classes: `kebab-case` — `.toggle-active`, `.search-container`, `.nav-buttons`
- CSS IDs: `kebab-case` — `#regex-input`, `#match-count`, `#error-msg`
- Message actions: `camelCase` strings — `'search'`, `'selectNext'`, `'getState'`

### Error Handling

- Regex validation: `try { new RegExp(pattern, flags) } catch (e)` — show `e.message` to user
- Messaging errors: `.catch(() => showCannotSearch())` on popup→content calls
- Empty-match guard: `if (match[0].length === 0) { regex.lastIndex++; continue; }`
- Backtracking timeout: `performance.now()` per-node, >1000ms aborts with error message
- Result cap: `MAX_RESULTS = 500` — stops collecting after 500 matches

### Key Technical Decisions

- **CSS Custom Highlight API** over DOM mutation (`<mark>` tags) — zero DOM changes, no text node fragmentation, single-line cleanup
- **Fire-and-forget messaging** — popup sends command, content script processes, popup queries state on re-open (avoids Safari popup-close Promise kill)
- **Manifest V3 with `"scripts"` background** (not `"service_worker"`) — Safari prefers document context
- **`_execute_action` command** — opens popup directly via ⌘⇧F without background.js listener

## Scope Boundaries

### In Scope
- Regex find-on-page with highlighting and navigation
- Case-insensitive toggle
- Keyboard shortcuts (⌘⇧F, Enter, Shift+Enter, Escape)
- macOS Safari only

### Out of Scope — Do NOT add
- Search history / recent searches
- Custom highlight colors / options page
- Find-and-replace
- iOS/iPadOS support
- Cross-frame (iframe) search
- Shadow DOM penetration
- Cross-element-boundary matching
- Badge count on toolbar icon
- npm / bundler / build tooling
- Automated test framework
