/** Heuristic: answer likely cut off before completion. */
export function looksTruncated(markdown: string): boolean {
  const text = markdown.trim();
  if (text.length === 0) {
    return true;
  }
  if (text.length < 80) {
    return true;
  }
  if (/[:;]\s*$/.test(text)) {
    return true;
  }
  if (
    text.length < 220 &&
    /^(?:set|add|include|increase|open|try|use)\b/i.test(text) &&
    !/\n\n/.test(text)
  ) {
    return true;
  }
  return false;
}
