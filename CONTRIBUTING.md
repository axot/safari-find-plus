# Contributing to Safari Find Plus

Thanks for your interest in contributing!

## Development Setup

1. Clone the repo and ensure you have **Xcode 15+** with Command Line Tools installed.

2. Generate the Xcode project:
   ```bash
   xcrun safari-web-extension-converter RegexFind/ \
     --project-location ./build \
     --app-name "RegexFind" \
     --bundle-identifier com.local.regexfind \
     --swift --macos-only --force --no-open --copy-resources
   ```

3. Open and run:
   ```bash
   open build/RegexFind/RegexFind.xcodeproj
   # Press Cmd+R to build and run
   ```

4. Enable in Safari:
   - Safari → Settings → Extensions → Enable "Regex Find"
   - Safari → Settings → Developer → "Allow unsigned extensions"
   - **Note:** "Allow unsigned extensions" resets every time Safari restarts.

## Testing

There is no automated test framework. Test manually in Safari using `test-page.html`:
- Verify regex highlighting, match navigation, error states, and keyboard shortcuts.
- See the **Testing** section in `AGENTS.md` for the full checklist.

## Code Style

This project uses vanilla JS/CSS/HTML with no build tools or dependencies. See `AGENTS.md` for detailed code style guidelines. Key points:
- `const`/`let` only, never `var`
- `browser.*` API (not `chrome.*`)
- 2-space indentation
- Support dark mode via `@media (prefers-color-scheme: dark)`

## Submitting Changes

1. Fork the repo and create a feature branch.
2. Make your changes — keep them focused on a single concern.
3. Test manually in Safari (see above).
4. Open a pull request with a clear description of what changed and why.
