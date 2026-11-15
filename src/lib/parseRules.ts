// Offline rule-based parser. Works with no internet and no AI key.
// Handles the common sentence shapes; the AI handles anything messier when online.
import { normalize, readNumber, isNumberToken, titleCase } from "./hindi.js";
import { matchItem } from "./match.js";
import { emptyAction, type Item, type ParsedAction } from "./types.js";

const PARTICLES = new Set(["ka", "ke", "ki", "ne", "ko", "se", "kа"]);
const STOP = new Set([
  "ka", "ke", "ki", "ne", "ko", "se", "likho", "likh", "likhna", "likhiye", "likhdo", "likha", "do", "de", "dena",
  "udhar", "udhari", "credit", "rupaye", "rupay", "rupye", "rupe", "rupiya", "rupaya", "rupees", "rupee", "rs", "ru", "inr",
  "diye", "diya", "die", "dia", "dijiye", "hai", "he", "tha", "the", "aur", "or", "and", "jama", "kar", "karo", "karna",
  "mein", "me", "main", "par", "pe", "bhai", "bhaiya", "ji", "sahab", "khate", "khata", "khatte", "account", "naam",
  "mil", "gaye", "gae", "gye", "mile", "mila", "chukaye", "chukae", "payment", "bhar", "lauta", "lautaye", "vapas",
  "please", "plij", "jara", "abhi", "aaj", "aj", "baki", "baaki", "kitna", "kitne", "bacha", "hua", "huye", "total",
  "ek", "wala", "vala", "vali", "vale", "upar", "add", "ho", "gaya", "gya", "liye", "lie", "liya",
]);

const PAYMENT_RE = /\b(diye|diya|die|dia|de diye|de gaya|de gye|de gae|jama|mil gaye|mil gae|mile|mila|chukaye|chukae|payment|bhar diye|lauta|lautaye|vapas|paid|pay kiya|pay kar)\b/;
const UNDO_RE = /^(nahi|nahin|galat|cancel|undo|na)\b|\b(galat hai|galat|cancel|pichla hatao|pichli hatao|hata do|hatao|mita do|undo)\b/;
const SUMMARY_RE = /\b(hisab|hisaab|summary)\b/;
const QUERY_RE = /\b(kitna|kitne|kya)\b.*\b(baki|baaki|bacha|dena|udhar)\b|\b(baki|baaki)\b.*\b(kitna|kitne|batao|bolo)\b/;
const REMIND_RE = /\b(reminder|yad|yaad|yad dila|takaja)\b/;
const ORDER_RE = /\b(mang|mangva|mangava|mangvana|mangavana|mangao|mangva do|order|bhejna|bhej dena|lana|lani|chahiye)\w*/;
const KHATA_RE = /\b(khate|khata|khatte|account)\b/;
const UNITS: Record<string, string> = {
  packet: "packet", paket: "packet", pkt: "packet", packets: "packet", pack: "packet",
  kilo: "kg", kg: "kg", kilogram: "kg", gram: "gram",
  litre: "litre", liter: "litre", ltr: "litre",
  dabba: "dabba", dabbe: "dabba", bori: "bori", peti: "peti", darjan: "darjan", dozen: "darjan",
};
const ORDER_STOP = new Set([...STOP, "kal", "subah", "sham", "shaam", "ke", "liye", "lie", "mangvana", "mangavana",
  "mangva", "mangava", "mangao", "order", "bhejna", "bhej", "dena", "lana", "lani", "chahiye", "kar", "karna", "do",
  "aur", "and", "tak", "baje", "savere", "sabere", "parso"]);

function splitClauses(text: string): string[] {
  return text.split(/\b(?:aur|and|tatha|or|phir)\b|,/).map((s) => s.trim()).filter(Boolean);
}

/** Find a person's name: words just before ka/ke/ki/ne/ko/se, else first non-stop word. */
function findName(tokens: string[]): string | null {
  for (let i = 0; i < tokens.length; i++) {
    if (PARTICLES.has(tokens[i]) && i > 0) {
      const words: string[] = [];
      for (let j = i - 1; j >= 0 && words.length < 2; j--) {
        const t = tokens[j];
        if (STOP.has(t) || isNumberToken(t, tokens[j - 1])) break;
        words.unshift(t);
      }
      if (words.length) return titleCase(words.join(" "));
    }
  }
  const first = tokens.find((t, i) => !STOP.has(t) && !isNumberToken(t, tokens[i - 1]) && t.length > 1);
  return first ? titleCase(first) : null;
}

function parseItemsWithQty(text: string, items: Item[]) {
  const parts = splitClauses(text);
  const found: { item: Item | null; name: string; qty: number; unit: string | null }[] = [];
  for (const part of parts) {
    const tokens = part.split(" ");
    const num = readNumber(tokens);
    const qty = num ? num.value : 1;
    let unit: string | null = null;
    const rest: string[] = [];
    tokens.forEach((t, i) => {
      if (num && i >= num.start && i < num.end) return;
      if (UNITS[t]) { unit = UNITS[t]; return; }
      if (!ORDER_STOP.has(t)) rest.push(t);
    });
    const name = rest.join(" ").trim();
    if (!name) continue;
    found.push({ item: matchItem(name, items), name, qty, unit });
  }
  return found;
}

export function parseRules(transcript: string, items: Item[]): ParsedAction[] {
  const text = normalize(transcript);
  if (!text) return [];
  const tokens = text.split(" ");
  const hasNumber = !!readNumber(tokens);

  if (UNDO_RE.test(text) && !hasNumber) return [emptyAction("undo_last")];
  if (SUMMARY_RE.test(text)) return [emptyAction("daily_summary")];
  if (REMIND_RE.test(text) && /\b(sab|sabko|sabhi|sare)\b/.test(text)) {
    const a = emptyAction("send_reminders");
    const n = readNumber(tokens);
    a.amount_rupees = n ? n.value : null;
    return [a];
  }
  if (QUERY_RE.test(text) && !PAYMENT_RE.test(text)) {
    const a = emptyAction("query_balance");
    a.customer = findName(tokens);
    return [a];
  }

  // "do chai aur ek bun Mohan ke khate mein" -> item math from the price list
  if (KHATA_RE.test(text)) {
    const m = text.match(/^(.*?)\s*\b([\p{L}]+(?:\s[\p{L}]+)?)\s+(?:ke|ka|ki)\s+(?:khate|khata|khatte|account)\b/u);
    if (m) {
      let nameWords = m[2].split(" ").filter((w) => !STOP.has(w) && !isNumberToken(w));
      let prefix = m[1];
      // "ek bun Mohan" -> the word before the name is an item, not part of the name
      if (nameWords.length === 2 && matchItem(nameWords[0], items)) {
        prefix = `${prefix} ${nameWords[0]}`;
        nameWords = [nameWords[1]];
      }
      const lines = parseItemsWithQty(prefix, items);
      const priced = lines.filter((l) => l.item?.price_paise);
      if (nameWords.length && priced.length) {
        const a = emptyAction("credit");
        a.customer = titleCase(nameWords.join(" "));
        a.amount_rupees = priced.reduce((s, l) => s + l.qty * (l.item!.price_paise! / 100), 0);
        a.note = priced.map((l) => `${l.qty} ${l.item!.name}`).join(", ");
        return [a];
      }
    }
  }

  if (ORDER_RE.test(text) && !PAYMENT_RE.test(text)) {
    const forDate: "today" | "tomorrow" = /\b(aaj|aj|abhi)\b/.test(text) && !/\bkal\b/.test(text) ? "today" : "tomorrow";
    const lines = parseItemsWithQty(text, items);
    if (lines.length) {
      return lines.map((l) => {
        const a = emptyAction("order");
        a.item = l.item?.name ?? titleCase(l.name);
        a.qty = l.qty;
        a.unit = l.unit ?? l.item?.unit ?? null;
        a.for_date = forDate;
        return a;
      });
    }
  }

  // Credit / payment, possibly several in one sentence
  const sentenceIsPayment = PAYMENT_RE.test(text);
  const actions: ParsedAction[] = [];
  for (const clause of splitClauses(text)) {
    const ct = clause.split(" ");
    const num = readNumber(ct);
    const name = findName(ct);
    if (!name && !num) continue;
    const isPayment = PAYMENT_RE.test(clause) || (sentenceIsPayment && !/\blikh/.test(clause));
    if (!num) {
      const a = emptyAction("clarify");
      a.customer = name;
      a.question = `${name ?? ""} ke kitne rupaye likhun?`;
      actions.push(a);
      continue;
    }
    if (!name) {
      const a = emptyAction("clarify");
      a.amount_rupees = num.value;
      a.question = `${num.value} rupaye kiske naam likhun?`;
      actions.push(a);
      continue;
    }
    const a = emptyAction(isPayment ? "payment" : "credit");
    a.customer = name;
    a.amount_rupees = num.value;
    actions.push(a);
  }
  if (!actions.length) {
    const a = emptyAction("clarify");
    a.question = "Samajh nahi aaya, phir se boliye.";
    return [a];
  }
  return actions;
}
