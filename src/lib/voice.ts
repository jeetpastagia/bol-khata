// Voice reply settings and multi-language speech.
// Settings are per phone (localStorage). Default: female voice, reply in the same language the shopkeeper used.

export type Lang = "hi" | "en" | "gu";
export type ReplyLang = "auto" | Lang;
export type Gender = "female" | "male";
export type Say = Record<Lang, string>;

export interface VoiceSettings {
  enabled: boolean;
  gender: Gender;
  inputLang: Lang;   // language the mic listens for
  replyLang: ReplyLang; // "auto" = same as what the shopkeeper said
}

const KEY = "bolkhata.voice.v1";
const DEFAULTS: VoiceSettings = { enabled: true, gender: "female", inputLang: "hi", replyLang: "auto" };

export const LANG_LABEL: Record<Lang, string> = { hi: "हिन्दी / Hinglish", en: "English", gu: "ગુજરાતી (Gujarati)" };
export const BCP47: Record<Lang, string> = { hi: "hi-IN", en: "en-IN", gu: "gu-IN" };

export function loadVoiceSettings(): VoiceSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}
export function saveVoiceSettings(s: VoiceSettings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage blocked */ }
}

const HINGLISH = /\b(ka|ke|ki|ko|ne|se|likho|likh|diye|diya|de|hai|hain|baaki|baki|udhaar|udhar|mein|me|aur|karo|kal|aaj|kitna|kitne|nahi|galat|hisaab|hisab|mangwana|mangwa|rupaye|rupay|bhai|wala|chai|doodh|cheeni)\b/i;

/** Which language was this sentence in? Script first, then Hinglish words. */
export function detectLang(text: string): Lang {
  if (/[઀-૿]/.test(text)) return "gu";
  if (/[ऀ-ॿ]/.test(text)) return "hi";
  return HINGLISH.test(text) ? "hi" : "en";
}

export function replyLangFor(transcript: string, s = loadVoiceSettings()): Lang {
  if (s.replyLang !== "auto") return s.replyLang;
  return transcript.trim() ? detectLang(transcript) : s.inputLang;
}

// ---------- Voices ----------
// Word boundaries matter: "Female" must not match the male pattern.
const MALE = /\b(male|madhur|hemant|ravi|prabhat|niranjan|david|guy|mark|rishi)\b/i;
const FEMALE = /\b(female|swara|kalpana|heera|neerja|dhwani|zira|aria|jenny|veena|lekha)\b|^google (?!.*\bmale\b)/i;

function voicesFor(lang: Lang): SpeechSynthesisVoice[] {
  const all = window.speechSynthesis?.getVoices() ?? [];
  const tag = BCP47[lang].toLowerCase();
  const exact = all.filter((v) => v.lang.toLowerCase().replace("_", "-") === tag);
  return exact.length ? exact : all.filter((v) => v.lang.toLowerCase().startsWith(lang));
}

/**
 * Picks a voice for the language and gender. If the phone has no voice of that gender,
 * the available voice is used with a deeper (male) or lighter (female) pitch.
 */
export function pickVoice(lang: Lang, gender: Gender): { voice: SpeechSynthesisVoice | null; pitch: number } {
  const list = voicesFor(lang);
  if (!list.length) return { voice: null, pitch: 1 };
  const want = gender === "male" ? MALE : FEMALE;
  const avoid = gender === "male" ? FEMALE : MALE;
  const exact = list.find((v) => want.test(v.name) && !avoid.test(v.name));
  if (exact) return { voice: exact, pitch: 1 };
  const neutral = list.find((v) => !avoid.test(v.name)) ?? list[0];
  return { voice: neutral, pitch: gender === "male" ? 0.72 : 1.12 };
}

export function hasVoice(lang: Lang): boolean {
  return voicesFor(lang).length > 0;
}

/** Speak a reply in the chosen language. Falls back to Hindi, then English, if the phone lacks that voice. */
export function speakSay(say: Say, lang: Lang, s = loadVoiceSettings()) {
  if (!s.enabled) return;
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const order: Lang[] = [lang, "hi", "en"];
    const use = order.find((l) => hasVoice(l)) ?? lang;
    const { voice, pitch } = pickVoice(use, s.gender);
    synth.cancel();
    const u = new SpeechSynthesisUtterance(say[use]);
    u.lang = BCP47[use];
    if (voice) u.voice = voice;
    u.pitch = pitch;
    u.rate = 1.02;
    synth.speak(u);
  } catch {
    /* speech output is optional */
  }
}

if (typeof window !== "undefined" && window.speechSynthesis) {
  // Voices load asynchronously in Chrome; touching the list early makes them available sooner.
  window.speechSynthesis.getVoices();
}

// ---------- Fixed phrases ----------
export const PHRASES = {
  saved: { hi: "सेव हो गया।", en: "Saved.", gu: "સેવ થઈ ગયું." },
  undone: { hi: "पिछली एंट्री हटा दी।", en: "Removed the last entry.", gu: "છેલ્લી એન્ટ્રી હટાવી દીધી." },
  entryRemoved: { hi: "एंट्री हटा दी।", en: "Entry removed.", gu: "એન્ટ્રી હટાવી દીધી." },
  notUnderstood: { hi: "समझ नहीं आया, फिर से बोलिए।", en: "Sorry, I didn't get that. Please say it again.", gu: "સમજાયું નહીં, ફરીથી બોલો." },
  reminders: { hi: "इन लोगों को रिमाइंडर भेजिए।", en: "Send reminders to these customers.", gu: "આ લોકોને રિમાઇન્ડર મોકલો." },
  test: {
    hi: "नमस्ते! मैं बोल खाता हूँ। रमेश के चालीस रुपये लिख दिए।",
    en: "Hello! I am Bol Khata. Wrote forty rupees for Ramesh.",
    gu: "નમસ્તે! હું બોલ ખાતું છું. રમેશના ચાલીસ રૂપિયા લખી દીધા.",
  },
} satisfies Record<string, Say>;
