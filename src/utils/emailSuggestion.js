/**
 * Suggests a fix for a mistyped email domain, like gmail.con -> gmail.com
 */

const POPULAR_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "msn.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "gmx.de",
  "gmx.net",
  "mail.com",
  "yandex.com",
  "yandex.ru",
  "mail.ru",
  "web.de",
  "qq.com",
  "163.com",
  "comcast.net",
  "hotmail.co.uk",
  "yahoo.co.uk",
  "hotmail.fr",
  "orange.fr",
  "outlook.fr",
  "outlook.de",
  "libero.it",
  "uol.com.br",
  "bol.com.br",
];

// Top-level domains that are almost always a slip on .com/.net/.org
const TLD_TYPOS = {
  con: "com",
  cmo: "com",
  ocm: "com",
  vom: "com",
  xom: "com",
  comm: "com",
  cpm: "com",
  cim: "com",
  nte: "net",
  ent: "net",
  ogr: "org",
};

// Edit distance that counts a swapped pair of letters as one edit
const distance = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
};

/**
 * @param {string} email
 * @returns {string|null} the corrected email, or null when it looks fine
 */
export const suggestEmail = email => {
  const at = email.trim().lastIndexOf("@");
  if (at < 1) return null;
  const local = email.trim().slice(0, at);
  const domain = email
    .trim()
    .slice(at + 1)
    .toLowerCase();
  if (!domain.includes(".") || POPULAR_DOMAINS.includes(domain)) return null;

  const maxEdits = domain.length < 8 ? 1 : 2;
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of POPULAR_DOMAINS) {
    const d = distance(domain, candidate);
    if (d <= maxEdits && d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  if (best) return `${local}@${best}`;

  const dot = domain.lastIndexOf(".");
  const fixedTld = TLD_TYPOS[domain.slice(dot + 1)];
  return fixedTld ? `${local}@${domain.slice(0, dot + 1)}${fixedTld}` : null;
};
