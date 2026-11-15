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
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (code: string) => void;
}): Listener | null {
  const C = Ctor();
  if (!C) return null;
  const rec = new C();
  rec.lang = "hi-IN";
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
