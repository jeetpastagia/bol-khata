// Hindi helpers: Devanagari -> rough Roman transliteration, spelling normalisation,
// and Hindi number words ("dedh sau" -> 150). Used by the offline rule parser and name matching.

const VOWELS: Record<string, string> = {
  "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo", "ए": "e", "ऐ": "ai",
  "ओ": "o", "औ": "au", "ऋ": "ri", "ऑ": "o",
};
const MATRAS: Record<string, string> = {
  "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo", "े": "e", "ै": "ai", "ो": "o",
  "ौ": "au", "ृ": "ri", "ॉ": "o",
};
const CONSONANTS: Record<string, string> = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "n", "च": "ch", "छ": "chh", "ज": "j",
  "झ": "jh", "ञ": "n", "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n", "त": "t",
  "थ": "th", "द": "d", "ध": "dh", "न": "n", "प": "p", "फ": "ph", "ब": "b", "भ": "bh",
  "म": "m", "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh", "ष": "sh", "स": "s", "ह": "h",
};
const NUKTA_FORMS: Record<string, string> = { "क": "q", "ख": "kh", "ग": "g", "ज": "z", "ड": "r", "ढ": "rh", "फ": "f" };
const SIGNS: Record<string, string> = { "ं": "n", "ँ": "n", "ः": "h" };
const VIRAMA = "्";
const NUKTA = "़";

/** Convert Devanagari text to a rough Roman form. Roman text passes through unchanged. */
export function transliterate(input: string): string {
  const out: string[] = [];
  const chars = Array.from(input.normalize("NFC"));
  let pendingSchwa = false; // consonant written, inherent "a" not yet decided

  const flushSchwa = (atWordEnd: boolean) => {
    if (pendingSchwa && !atWordEnd) out.push("a");
    pendingSchwa = false;
  };

  for (let i = 0; i < chars.length; i++) {
    let c = chars[i];
    // Precomposed nukta letters (क़, ज़, ड़, ढ़, फ़) -> base + nukta
    const decomposed = c.normalize("NFD");
    if (decomposed.length === 2 && decomposed[1] === NUKTA) {
      c = decomposed[0];
      chars.splice(i + 1, 0, NUKTA);
    }
    const digit = "०१२३४५६७८९".indexOf(c);
    if (digit >= 0) { flushSchwa(true); out.push(String(digit)); continue; }

    if (CONSONANTS[c]) {
      flushSchwa(false);
      let roman = CONSONANTS[c];
      if (chars[i + 1] === NUKTA) { roman = NUKTA_FORMS[c] ?? roman; i++; }
      out.push(roman);
      const next = chars[i + 1];
      if (next && MATRAS[next]) { out.push(MATRAS[next]); i++; }
      else if (next === VIRAMA) { i++; }
      else pendingSchwa = true;
      continue;
    }
    if (VOWELS[c]) { flushSchwa(false); out.push(VOWELS[c]); continue; }
    if (SIGNS[c]) { flushSchwa(false); out.push(SIGNS[c]); continue; }
    if (MATRAS[c]) { pendingSchwa = false; out.push(MATRAS[c]); continue; }
    if (c === NUKTA || c === VIRAMA) continue;
    // Any other char (space, latin, punctuation) ends a Devanagari word
    const isWordChar = /[\p{L}\p{N}]/u.test(c);
    flushSchwa(!isWordChar);
    out.push(c === "।" ? " " : c);
  }
  flushSchwa(true);
  return out.join("");
}

/** Lowercase, transliterate, simplify spellings so "Raamesh", "रमेश" and "ramesh" compare equal. */
export function normalize(text: string): string {
  return transliterate(text)
    .toLowerCase()
    .replace(/₹/g, " ")
    .replace(/[^\p{L}\p{N}\s.]/gu, " ")
    .replace(/(\d)\.(?!\d)/g, "$1 ")
    .replace(/(?<!\d)\./g, " ")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/aa+/g, "a")
    .replace(/ee+/g, "i")
    .replace(/oo+/g, "u")
    .replace(/ii+/g, "i")
    .replace(/w/g, "v")
    .replace(/ph/g, "f")
    .replace(/q/g, "k")
    .replace(/z/g, "j")
    .replace(/\s+/g, " ")
    .trim();
}

// Number words after normalize(): "chaalis" -> "chalis", "bees" -> "bis" ...
const UNITS: Record<string, number> = {
  ek: 1, ik: 1, one: 1,
  do: 2, two: 2,
  tin: 3, three: 3,
  char: 4, chaar: 4, four: 4,
  panch: 5, panc: 5, five: 5,
  chhe: 6, chhah: 6, chah: 6, che: 6, chhai: 6, six: 6,
  sat: 7, seven: 7,
  ath: 8, eight: 8,
  nau: 9, nine: 9,
  das: 10, ten: 10,
  gyarah: 11, gyara: 11, barah: 12, bara: 12, terah: 13, tera: 13, chaudah: 14, chauda: 14,
  pandrah: 15, pandra: 15, solah: 16, sola: 16, satrah: 17, satra: 17, atharah: 18, athara: 18,
  unnis: 19, bis: 20, ikkis: 21, baiis: 22, bais: 22, teis: 23, chaubis: 24, pachis: 25, pachchis: 25,
  tis: 30, paintis: 35, chalis: 40, pentalis: 45, paintalis: 45, pachas: 50, pachpan: 55,
  sath: 60, saath: 60, sattar: 70, assi: 80, nabbe: 90, nave: 90,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const FRACTIONS: Record<string, number> = { dedh: 1.5, derh: 1.5, der: 1.5, dhai: 2.5, dhaai: 2.5, adhai: 2.5 };
const HUNDRED = new Set(["sau", "so", "hundred"]);
const THOUSAND = new Set(["hajar", "hajaar", "thousand", "hajr"]);
const VERB_AFTER_DO = new Set(["likh", "de", "kar", "bhej", "hata", "mita", "bata", "dikha", "rakh", "jod", "dal"]);

export function isNumberToken(tok: string, prev?: string): boolean {
  if (/^\d+(\.\d+)?$/.test(tok)) return true;
  if (tok === "do" && prev && VERB_AFTER_DO.has(prev)) return false; // "likh do" = "write it"
  return tok in UNITS || tok in FRACTIONS || HUNDRED.has(tok) || THOUSAND.has(tok) ||
    tok === "sade" || tok === "sadhe" || tok === "paune";
}

/**
 * Read the first number in a token list. Returns value and the [start, end) token span.
 * "do sau pachas" -> 250, "dedh sau" -> 150, "sade tin sau" -> 350, "40" -> 40.
 */
export function readNumber(tokens: string[], from = 0): { value: number; start: number; end: number } | null {
  let i = from;
  while (i < tokens.length && !isNumberToken(tokens[i], tokens[i - 1])) i++;
  if (i >= tokens.length) return null;
  const start = i;
  let total = 0;
  let cur = 0;
  let addHalf = false;
  let minusQuarter = false;
  let any = false;
  for (; i < tokens.length && isNumberToken(tokens[i], tokens[i - 1]); i++) {
    const t = tokens[i];
    any = true;
    if (/^\d/.test(t)) cur += Number(t);
    else if (t in UNITS) cur += UNITS[t];
    else if (t in FRACTIONS) cur += FRACTIONS[t];
    else if (t === "sade" || t === "sadhe") addHalf = true;
    else if (t === "paune") minusQuarter = true;
    else if (HUNDRED.has(t)) {
      let base = cur || 1;
      if (addHalf) { base += 0.5; addHalf = false; }
      if (minusQuarter) { base -= 0.25; minusQuarter = false; }
      cur = base * 100;
    } else if (THOUSAND.has(t)) {
      let base = cur || 1;
      if (addHalf) { base += 0.5; addHalf = false; }
      if (minusQuarter) { base -= 0.25; minusQuarter = false; }
      total += base * 1000;
      cur = 0;
    }
  }
  if (!any) return null;
  let value = total + cur;
  if (addHalf) value += 0.5;
  if (minusQuarter) value -= 0.25;
  return { value: Math.round(value * 100) / 100, start, end: i };
}

export function titleCase(s: string): string {
  return s.replace(/\b\p{L}/gu, (m) => m.toUpperCase());
}
