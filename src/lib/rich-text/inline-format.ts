// Real Selection/Range-API formatting — replaces the So-what rich-text
// prototype's `document.execCommand`/`insertHTML` stand-in (wayframe#38
// item 4 / #39's decision: "a proper range implementation ... not
// something to ship as-is"). `execCommand` is deprecated and its behavior
// varies enough across browsers that the prototype called it exactly that —
// a quick stand-in, not a real implementation.
//
// Deliberately simple: wraps/unwraps the live selection in a single inline
// element. It doesn't merge overlapping marks or split a wrap that only
// partially covers an existing one — real rich-text editors solve that with
// a lot more machinery. For a "select a phrase, click Bold" toolbar over a
// one-line statement and short bullets, whole-selection wrap/unwrap covers
// the actual use.

/** Returns the current selection's range if it's collapsed within `root`, or null (nothing usable to format). */
function activeRangeWithin(root: HTMLElement): Range | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  return range;
}

/** Walks up from the range's common ancestor looking for an element with `tagName`, stopping at `root`. Used to decide whether a toggle command should unwrap instead of wrap. */
function findWrappingAncestor(range: Range, tagName: string, root: HTMLElement): HTMLElement | null {
  let node: Node | null = range.commonAncestorContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
  while (node && node !== root.parentNode) {
    if (node instanceof HTMLElement) {
      if (node === root) return null;
      if (node.tagName.toLowerCase() === tagName) return node;
    }
    node = node.parentNode;
  }
  return null;
}

function unwrap(el: HTMLElement) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

function placeCaretAfter(node: Node) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Toggles a plain inline mark (bold/italic/underline/strikethrough/code)
 * over the current selection within `root`. If the selection sits entirely
 * inside an existing element of that tag, unwraps it instead of nesting —
 * the toggle-off case a naive wrap-only implementation would miss.
 */
export function toggleInlineTag(root: HTMLElement, tagName: string): void {
  const range = activeRangeWithin(root);
  if (!range) return;

  const existing = findWrappingAncestor(range, tagName, root);
  if (existing) {
    unwrap(existing);
    return;
  }

  const contents = range.extractContents();
  const wrapper = document.createElement(tagName);
  wrapper.appendChild(contents);
  range.insertNode(wrapper);
  placeCaretAfter(wrapper);
}

/** Wraps the current selection in a `<span>` carrying one CSS property (color or background-color) — the toolbar's color/highlight tools. Always wraps fresh rather than toggling; picking a new color while one is already applied should layer, not fight the same ancestor-detection logic bold/italic uses. */
export function wrapSelectionWithStyle(root: HTMLElement, property: "color" | "background-color", value: string): void {
  const range = activeRangeWithin(root);
  if (!range) return;
  const contents = range.extractContents();
  const wrapper = document.createElement("span");
  wrapper.style.setProperty(property, value);
  wrapper.appendChild(contents);
  range.insertNode(wrapper);
  placeCaretAfter(wrapper);
}

/** Wraps a previously-saved range (see the link toolbar: the URL prompt steals focus and would otherwise collapse the live selection) in an `<a href>`. */
export function wrapRangeWithLink(savedRange: Range, url: string): void {
  const contents = savedRange.extractContents();
  const wrapper = document.createElement("a");
  wrapper.href = url;
  wrapper.appendChild(contents);
  savedRange.insertNode(wrapper);
  placeCaretAfter(wrapper);
}
