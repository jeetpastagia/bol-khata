// Voice in (Web Speech API, hi-IN) and voice out (speechSynthesis). Both are free and built into Chrome.

type Rec = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function Ctor(): (new () => Rec) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Rec; webkitSpeechRecognition?: new () => Rec };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const speechSupported = () => typeof window !== "undefined" && !!Ctor();

export interface Listener {
  stop: () => void;
}

/** Start listening. onPartial shows live text; onFinal fires once with the full sentence. */
export function listen(opts: {
  lang?: string;
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (code: string) => void;
}): Listener | null {
  const C = Ctor();
  if (!C) return null;
  const rec = new C();
  rec.lang = opts.lang ?? "hi-IN";
  rec.interimResults = true;
  rec.continuous = true;
  rec.maxAlternatives = 1;
  let finalText = "";
  let interim = "";
  let finished = false;
  rec.onresult = (e) => {
    interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript + " ";
      else interim += r[0].transcript;
    }
    opts.onPartial((finalText + interim).trim());
  };
  rec.onerror = (e) => {
    if (e.error !== "no-speech" && e.error !== "aborted") opts.onError(e.error);
  };
  rec.onend = () => {
    if (finished) return;
    finished = true;
    opts.onFinal((finalText + interim).trim());
  };
  rec.start();
  return { stop: () => rec.stop() };
}

let hindiVoice: SpeechSynthesisVoice | null | undefined;
function pickVoice(): SpeechSynthesisVoice | null {
  if (hindiVoice !== undefined && hindiVoice !== null) return hindiVoice;
  const voices = window.speechSynthesis?.getVoices() ?? [];
  hindiVoice = voices.find((v) => v.lang === "hi-IN") ?? voices.find((v) => v.lang.startsWith("hi")) ?? null;
  return hindiVoice;
}
if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => { hindiVoice = undefined; pickVoice(); };
}

/** Speak Hindi text (Devanagari reads best with the Hindi voice). */
export function speak(text: string) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "hi-IN";
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 1.05;
    synth.speak(u);
  } catch {
    /* speech output is optional */
  }
}

export function stopSpeaking() {
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
}

/**
 * Hands-free listening: keeps the mic open and restarts Chrome's recognizer whenever it stops
 * (Chrome ends a session after silence or about a minute). Only works while the app is on screen.
 */
export function listenLoop(opts: {
  lang: string;
  onPartial?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (code: string) => void;
}): Listener | null {
  const C = Ctor();
  if (!C) return null;
  let running = true;
  let rec: Rec | null = null;
  let failures = 0;
  const start = () => {
    if (!running) return;
    rec = new C();
    rec.lang = opts.lang;
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      failures = 0;
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) opts.onFinal(r[0].transcript.trim());
        else interim += r[0].transcript;
      }
      if (interim) opts.onPartial?.(interim.trim());
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") { running = false; opts.onError?.(e.error); return; }
      if (e.error !== "no-speech" && e.error !== "aborted") failures++;
    };
    rec.onend = () => {
      if (!running) return;
      // Back off a little if the recognizer keeps failing (e.g. no internet)
      setTimeout(start, Math.min(5000, 250 + failures * 1000));
    };
    try { rec.start(); } catch { setTimeout(start, 1000); }
  };
  start();
  return { stop: () => { running = false; try { rec?.abort(); } catch { /* already stopped */ } } };
}
