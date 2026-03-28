#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "==> Generating Xcode project..."
xcrun safari-web-extension-converter RegexFind/ \
  --project-location ./build \
  --app-name "RegexFind" \
  --bundle-identifier com.local.regexfind \
  --swift \
  --macos-only \
  --force \
  --no-open \
  --copy-resources

echo "==> Fixing bundle identifier case..."
sed -i '' 's/com\.local\.RegexFind/com.local.regexfind/g' \
  build/RegexFind/RegexFind.xcodeproj/project.pbxproj

echo "==> Building..."
xcodebuild -project build/RegexFind/RegexFind.xcodeproj \
  -scheme "RegexFind" \
  build \
  -quiet

echo ""
echo "✅ Build succeeded!"
echo ""
echo "To install:"
echo "  1. open build/RegexFind/RegexFind.xcodeproj  (then ⌘R)"
echo "  2. Safari → Settings → Extensions → Enable 'Regex Find'"
echo "  3. Safari → Settings → Developer → 'Allow unsigned extensions'"
