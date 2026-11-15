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
  // Mic set to English/Gujarati: reply in that language (Chrome may write the words in another script)
  if (s.inputLang !== "hi") return s.inputLang;
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
  return { voice: neutral, pitch: gender === "male" ? 0.6 : 1.12 };
}

export function hasVoice(lang: Lang): boolean {
  return voicesFor(lang).length > 0;
}

/** True when this device has no voice for the language, or no real voice of the chosen gender. */
export function needsCloudVoice(lang: Lang, gender: Gender): boolean {
  if (!hasVoice(lang)) return true;
  return pickVoice(lang, gender).pitch !== 1;
}

let lastSpeechEnd = 0;
let lastText = "";
let lastTextAt = 0;
let speakToken = 0;
let currentAudio: HTMLAudioElement | null = null;
const audioCache = new Map<string, string>(); // tts url -> object URL

/** Stop every reply that is playing or about to play. */
export function stopAllSpeech() {
  speakToken++;
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  lastSpeechEnd = Date.now();
}

/** True while the app is talking (and just after), so hands-free mode doesn't hear its own voice. */
export function isAppSpeaking(): boolean {
  return !!window.speechSynthesis?.speaking || (!!currentAudio && !currentAudio.paused) || Date.now() - lastSpeechEnd < 900;
}

/** Device voice. Falls back to Hindi, then English, if the device lacks the language. */
function speakOnDevice(say: Say, lang: Lang, gender: Gender, token: number) {
  const synth = window.speechSynthesis;
  if (!synth) { lastSpeechEnd = Date.now(); return; }
  const use = ([lang, "hi", "en"] as Lang[]).find((l) => hasVoice(l)) ?? lang;
  const { voice, pitch } = pickVoice(use, gender);
  const u = new SpeechSynthesisUtterance(say[use]);
  u.lang = BCP47[use];
  if (voice) u.voice = voice;
  u.pitch = pitch;
  u.rate = gender === "male" && pitch !== 1 ? 0.95 : 1.02;
  u.onend = u.onerror = () => { if (token === speakToken) lastSpeechEnd = Date.now(); };
  // Chrome on Android can drop or double an utterance spoken in the same tick as cancel()
  setTimeout(() => { if (token === speakToken) synth.speak(u); }, 60);
}

/** Natural voice from the server (Gemini text-to-speech), cached per sentence. */
async function speakFromCloud(text: string, lang: Lang, gender: Gender, token: number) {
  const url = `/api/tts?t=${encodeURIComponent(text)}&l=${lang}&g=${gender}`;
  let src = audioCache.get(url);
  if (!src) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      if (!r.ok) throw new Error(String(r.status));
      src = URL.createObjectURL(await r.blob());
    } finally {
      clearTimeout(timer);
    }
    audioCache.set(url, src);
    if (audioCache.size > 60) {
      const oldest = audioCache.keys().next().value as string;
      URL.revokeObjectURL(audioCache.get(oldest)!);
      audioCache.delete(oldest);
    }
  }
  if (token !== speakToken) return; // a newer reply took over
  const a = new Audio(src);
  currentAudio = a;
  a.onended = a.onerror = () => { if (token === speakToken) { lastSpeechEnd = Date.now(); currentAudio = null; } };
  await a.play();
}

/**
 * Speak a reply. Uses the device voice when it has the right language and gender (instant, offline);
 * otherwise a natural voice from the server; if that fails, the device voice anyway.
 */
export function speakSay(say: Say, lang: Lang, s = loadVoiceSettings()) {
  if (!s.enabled) return;
  try {
    const text = say[lang];
    // Never say the same thing twice in a row (duplicate recognition results on Android)
    const key = `${s.gender}|${lang}|${text}`;
    if (key === lastText && Date.now() - lastTextAt < 2500) return;
    lastText = key;
    lastTextAt = Date.now();
    // Only one reply at a time
    stopAllSpeech();
    const token = speakToken;
    lastSpeechEnd = Date.now() + 60_000; // until playback ends
    if (navigator.onLine && needsCloudVoice(lang, s.gender)) {
      speakFromCloud(text, lang, s.gender, token).catch(() => {
        if (token === speakToken) speakOnDevice(say, lang, s.gender, token);
      });
    } else {
      speakOnDevice(say, lang, s.gender, token);
    }
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
  wake: { hi: "हाँ जी, बोलिए।", en: "Yes, go ahead.", gu: "હા, બોલો." },
  cancelled: { hi: "ठीक है, नहीं लिखा।", en: "Okay, not saved.", gu: "બરાબર, નથી લખ્યું." },
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
