// Reports are read by a person with no other context, so a few words like
// "doesnt work" can't be acted on. Require a sentence or so of detail.
const MIN_WORDS = 5;
const MIN_CJK_CHARS = 12; // Chinese/Japanese don't separate words with spaces

const CJK_PATTERN = /[぀-ヿ㐀-䶿一-鿿가-힯]/g;

export const isReportDetailsTooVague = text => {
  const trimmed = (text || "").trim();
  if (!trimmed) return true;
  const cjkChars = (trimmed.match(CJK_PATTERN) || []).length;
  const words = trimmed
    .replace(CJK_PATTERN, " ")
    .split(/\s+/)
    .filter(word => /[\p{L}\p{N}]/u.test(word));
  return cjkChars < MIN_CJK_CHARS && words.length < MIN_WORDS;
};
