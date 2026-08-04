const SIMILARITY_THRESHOLD = 0.75;

function normalizeToTokens(title) {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function titleSimilarity(a, b) {
  const setA = new Set(normalizeToTokens(a));
  const setB = new Set(normalizeToTokens(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  const intersectionSize = [...setA].filter((word) => setB.has(word)).length;
  const unionSize = new Set([...setA, ...setB]).size;
  return intersectionSize / unionSize;
}

// Drops items whose title is near-duplicate (token-overlap based) of either
// an already-kept item in this batch or a title seen in a prior run —
// catches re-slugged/re-published articles that a plain URL check misses.
export function filterDuplicateTitles(items, historicalTitles = []) {
  const keptTitles = [...historicalTitles];
  const kept = [];
  for (const item of items) {
    const isDuplicate = keptTitles.some(
      (title) => titleSimilarity(title, item.title) >= SIMILARITY_THRESHOLD
    );
    if (!isDuplicate) {
      kept.push(item);
      keptTitles.push(item.title);
    }
  }
  return kept;
}
