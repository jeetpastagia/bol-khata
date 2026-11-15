// Wake word for hands-free mode: "Bol Khata" (also बोल खाता, Hello/Hey Khata, Gujarati બોલ ખાતા).
// Distinct enough that normal shop chatter doesn't trigger it.

const WAKE_RE =
  /(?:\b(?:bol|bole|bolo|hello|helo|hey|hi|ok|okay)\s*kh?a+t+a+\b|\bbolkhata\b|बोल\s*खाता|बोलो\s*खाता|हेलो\s*खाता|हे\s*खाता|બોલ\s*ખાતા)/i;

/** Returns null if the wake word isn't in the text, otherwise whatever was said after it. */
export function afterWakeWord(text: string): string | null {
  const m = WAKE_RE.exec(text);
  if (!m) return null;
  return text.slice(m.index + m[0].length).replace(/^[\s,.!?।-]+/, "").trim();
}

// JS "\b" only understands English letters, so the end of a word is checked by hand (space, punctuation or end).
const END = String.raw`(?=[\s,.!?।]|$)`;
const YES_RE = new RegExp(String.raw`^(?:haan|haa|han|ha|hanji|haanji|yes|yeah|theek|thik|ok|okay|sahi|save|हाँ|हां|हा|ठीक|सही|હા|બરાબર)` + END, "i");
const NO_RE = new RegExp(String.raw`^(?:nahi|nahin|nai|na|no|cancel|galat|mat|नहीं|नही|ना|गलत|ના|નહીં)` + END, "i");

/** During the confirm step the shopkeeper can just say "haan" or "nahi" without the wake word. */
export function yesOrNo(text: string): "yes" | "no" | null {
  const t = text.trim();
  if (NO_RE.test(t)) return "no";
  if (YES_RE.test(t)) return "yes";
  return null;
}
