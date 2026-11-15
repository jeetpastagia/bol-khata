// GET /api/tts?t=<text>&l=hi|en|gu&g=female|male -> audio/wav
// Natural voice replies from Gemini text-to-speech, used when the phone has no voice for the
// language (e.g. Gujarati) or no real male/female voice. Responses are cached by Vercel's CDN,
// so a repeated phrase is only generated once.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";

const Query = z.object({
  t: z.string().min(1).max(300),
  l: z.enum(["hi", "en", "gu"]),
  g: z.enum(["female", "male"]),
});

const VOICES = { female: "Kore", male: "Charon" } as const; // Charon is a deeper male voice
const MODELS = [process.env.GEMINI_TTS_MODEL, "gemini-3.8-flash-tts", "gemini-3.1-flash-tts-preview"].filter(Boolean) as string[];

/** Wraps raw 16-bit PCM in a WAV header so every browser can play it. */
function pcmToWav(pcm: Buffer, sampleRate: number): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(sampleRate, 24); h.writeUInt32LE(sampleRate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

async function synth(model: string, text: string, voice: string, key: string): Promise<Buffer> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
        },
      }),
    });
    if (!res.ok) throw new Error(`tts ${res.status}`);
    const data = (await res.json()) as { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[] };
    const part = data.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData;
    if (!part?.data) throw new Error("tts: no audio");
    const bytes = Buffer.from(part.data, "base64");
    const mime = part.mimeType ?? "";
    if (mime.includes("wav") || bytes.subarray(0, 4).toString() === "RIFF") return bytes;
    const rate = Number(/rate=(\d+)/.exec(mime)?.[1] ?? 24000);
    return pcmToWav(bytes, rate);
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const q = Query.safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: "bad_request" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: "not_configured" });

  let lastErr = "";
  for (const model of MODELS) {
    try {
      const wav = await synth(model, q.data.t, VOICES[q.data.g], key);
      res.setHeader("Content-Type", "audio/wav");
      // Same text + voice always gives the same audio: let the CDN and the phone keep it
      res.setHeader("Cache-Control", "public, max-age=604800, s-maxage=31536000, immutable");
      res.status(200);
      res.end(wav);
      return;
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  console.warn("[tts] failed:", lastErr);
  res.status(502).json({ error: "tts_failed" });
}
