if (typeof CSS === 'undefined' || !CSS.highlights) {
  console.error('CSS Custom Highlight API not supported');
}

const MAX_RESULTS = 500;
const EXCLUDE_TAGS = /^(script|style|svg|audio|canvas|figure|video|select|input|textarea|noscript|template)$/i;
const HIGHLIGHT_NAME = 'regex-find-matches';
const CURRENT_HIGHLIGHT_NAME = 'regex-find-current';
const BACKTRACK_TIMEOUT_MS = 1000;

let searchState = {
  pattern: '',
  flags: 'gi',
  matchCount: 0,
  currentIndex: -1,
  error: null
};
let matchRanges = [];

function isNodeExcluded(node) {
  let el = node.parentElement;
  while (el) {
    if (EXCLUDE_TAGS.test(el.tagName)) return true;
    if (el.getAttribute('contenteditable') === 'true') return true;
    if (getComputedStyle(el).display === 'none') return true;
    el = el.parentElement;
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

  for (const textNode of textNodes) {
    if (ranges.length >= maxResults) break;

    regex.lastIndex = 0;
    const nodeStart = performance.now();
    let match;

    while ((match = regex.exec(textNode.textContent)) !== null) {
      // Prevent infinite loop on zero-length matches (e.g. regex /a*/ matching "")
      if (match[0].length === 0) {
        regex.lastIndex++;
        continue;
      }

      // Catastrophic backtracking guard: abandon node after 1s
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
