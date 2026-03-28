(function () {
'use strict';

if (typeof CSS === 'undefined' || !CSS.highlights || !document.body) {
  browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    sendResponse({ pattern: '', matchCount: 0, currentIndex: -1, error: null });
    return true;
  });
  return;
}

const MAX_RESULTS = 500;
const EXCLUDE_TAGS = /^(script|style|svg|audio|canvas|figure|video|select|input|textarea|noscript|template)$/i;
const HIGHLIGHT_NAME = 'regex-find-matches';
const CURRENT_HIGHLIGHT_NAME = 'regex-find-current';
const BACKTRACK_TIMEOUT_MS = 1000;
const TOTAL_SEARCH_TIMEOUT_MS = 3000;

let searchState = {
  pattern: '',
  flags: 'gi',
  matchCount: 0,
  currentIndex: -1,
  error: null
};
let matchRanges = [];

function isNodeExcluded(node) {
  const el = node.parentElement;
  if (!el) return true;

  let ancestor = el;
  while (ancestor) {
    if (EXCLUDE_TAGS.test(ancestor.tagName)) return true;
    if (ancestor.getAttribute('contenteditable') === 'true') return true;
    ancestor = ancestor.parentElement;
  }

  if (el.checkVisibility) {
    if (!el.checkVisibility({
      opacityProperty: true,
      visibilityProperty: true
    })) return true;
  } else {
    const style = getComputedStyle(el);
    if (style.display === 'none') return true;
    if (style.visibility === 'hidden') return true;
    if (style.opacity === '0') return true;
  }

  return false;
}

function collectTextNodes(root) {
  const textNodes = [];
  const checkedParents = new Map();

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  let current = walker.nextNode();

  while (current) {
    const parent = current.parentElement;
    if (parent) {
      let excluded = checkedParents.get(parent);
      if (excluded === undefined) {
        excluded = isNodeExcluded(current);
        checkedParents.set(parent, excluded);
      }
      if (!excluded && current.textContent.length > 0) {
        textNodes.push(current);
      }
    }
    current = walker.nextNode();
  }

  return textNodes;
}

function findMatches(textNodes, regex, maxResults) {
  const ranges = [];
  const searchStart = performance.now();

  for (const textNode of textNodes) {
    if (ranges.length >= maxResults) break;

    if (performance.now() - searchStart > TOTAL_SEARCH_TIMEOUT_MS) {
      searchState.error = 'Search timed out — try a simpler pattern';
      break;
    }

    regex.lastIndex = 0;
    const text = textNode.textContent;
    const nodeStart = performance.now();
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match[0].length === 0) {
        regex.lastIndex++;
        continue;
      }

      if (performance.now() - nodeStart > BACKTRACK_TIMEOUT_MS) {
        searchState.error = 'Regex too slow on some content — results may be incomplete';
        break;
      }

      const range = document.createRange();
      range.setStart(textNode, match.index);
      range.setEnd(textNode, match.index + match[0].length);
      ranges.push(range);

      if (ranges.length >= maxResults) break;
    }
  }

  return ranges;
}

function applyHighlights(ranges) {
  if (ranges.length === 0) return;
  const highlight = new Highlight(...ranges);
  CSS.highlights.set(HIGHLIGHT_NAME, highlight);
}

function highlightCurrent(index) {
  if (index < 0 || index >= matchRanges.length) return;
  CSS.highlights.set(CURRENT_HIGHLIGHT_NAME, new Highlight(matchRanges[index]));
}

function scrollToMatch(index) {
  if (index < 0 || index >= matchRanges.length) return;
  const rect = matchRanges[index].getBoundingClientRect();
  window.scrollTo({
    top: window.scrollY + rect.top - window.innerHeight / 2,
    behavior: 'smooth'
  });
}

function navigateTo(index) {
  searchState.currentIndex = index;
  highlightCurrent(index);
  scrollToMatch(index);
}

function selectNext() {
  if (matchRanges.length === 0) return;
  navigateTo((searchState.currentIndex + 1) % matchRanges.length);
}

function selectPrev() {
  if (matchRanges.length === 0) return;
  navigateTo((searchState.currentIndex - 1 + matchRanges.length) % matchRanges.length);
}

function clearHighlights() {
  CSS.highlights.delete(HIGHLIGHT_NAME);
  CSS.highlights.delete(CURRENT_HIGHLIGHT_NAME);
  matchRanges = [];
  searchState.pattern = '';
  searchState.matchCount = 0;
  searchState.currentIndex = -1;
  searchState.error = null;
}

function performSearch(pattern, flags) {
  clearHighlights();

  if (!pattern) return searchState;

  let regex;
  try {
    regex = new RegExp(pattern, flags);
  } catch (e) {
    searchState.pattern = pattern;
    searchState.flags = flags;
    searchState.error = e.message;
    return searchState;
  }

  const textNodes = collectTextNodes(document.body);
  matchRanges = findMatches(textNodes, regex, MAX_RESULTS);
  applyHighlights(matchRanges);

  searchState.pattern = pattern;
  searchState.flags = flags;
  searchState.matchCount = matchRanges.length;

  if (matchRanges.length >= MAX_RESULTS) {
    searchState.error = 'Showing first ' + MAX_RESULTS + ' matches';
  }

  if (matchRanges.length > 0) {
    searchState.currentIndex = 0;
    highlightCurrent(0);
    scrollToMatch(0);
  }

  return searchState;
}

function respondWithState(sendResponse, broadcast = true) {
  sendResponse({ ...searchState });
  if (broadcast) {
    browser.runtime.sendMessage({ action: 'stateUpdate', ...searchState }).catch(() => {});
  }
}

let lastUrl = location.href;
let mutationTimer = null;
const MUTATION_DEBOUNCE_MS = 1500;

function rerunSearch() {
  if (searchState.pattern) {
    performSearch(searchState.pattern, searchState.flags);
  }
}

function onSpaNavigation() {
  if (location.href === lastUrl) return;
  lastUrl = location.href;
  setTimeout(rerunSearch, 500);
}

// SPA navigation: History API + hash routing
for (const method of ['pushState', 'replaceState']) {
  const original = history[method];
  history[method] = function () {
    const result = original.apply(this, arguments);
    onSpaNavigation();
    return result;
  };
}
window.addEventListener('popstate', onSpaNavigation);
window.addEventListener('hashchange', onSpaNavigation);

// Dynamic content: re-search when DOM changes significantly (infinite scroll, "load more", etc.)
const observer = new MutationObserver((mutations) => {
  if (!searchState.pattern) return;

  let addedNodes = 0;
  for (const mutation of mutations) {
    addedNodes += mutation.addedNodes.length;
  }
  if (addedNodes < 5) return;

  CSS.highlights.delete(HIGHLIGHT_NAME);
  CSS.highlights.delete(CURRENT_HIGHLIGHT_NAME);
  matchRanges = [];

  clearTimeout(mutationTimer);
  mutationTimer = setTimeout(rerunSearch, MUTATION_DEBOUNCE_MS);
});

observer.observe(document.body, { childList: true, subtree: true });

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (!request || !request.action) return false;

  switch (request.action) {
    case 'search':
      performSearch(request.pattern, request.flags);
      respondWithState(sendResponse);
      break;
    case 'selectNext':
      selectNext();
      respondWithState(sendResponse);
      break;
    case 'selectPrev':
      selectPrev();
      respondWithState(sendResponse);
      break;
    case 'clear':
      clearHighlights();
      respondWithState(sendResponse, false);
      break;
    case 'getState':
      respondWithState(sendResponse, false);
      break;
    default:
      return false;
  }
  return true;
});

})();
