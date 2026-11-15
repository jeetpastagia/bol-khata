// AI parsing with an automatic fallback chain.
// Order: Claude (if key) -> Gemini (free) -> Groq (free) -> OpenRouter (free) -> Cerebras (free) -> offline rules.
// A provider with no key is skipped. A provider that is busy, rate-limited, slow or returns bad JSON
// is skipped and the next one answers. The rule parser at the end always works.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { parseRules } from "../../src/lib/parseRules.js";
import type { Item, ParsedAction } from "../../src/lib/types.js";

const TIMEOUT_MS = 5000; // give up on a slow provider after 5 s and try the next one

const ActionSchema = z.object({
  type: z.enum(["credit", "payment", "order", "query_balance", "undo_last", "daily_summary", "send_reminders", "clarify"]),
  customer: z.string().nullable(),
  amount_rupees: z.number().nullable(),
  item: z.string().nullable(),
  qty: z.number().nullable(),
  unit: z.string().nullable(),
  for_date: z.enum(["today", "tomorrow"]).nullable(),
  note: z.string().nullable(),
  question: z.string().nullable(),
});
const ResultSchema = z.object({ actions: z.array(ActionSchema) });

export interface ParseContext {
  transcript: string;
  customers: string[];
  items: Pick<Item, "name" | "price_paise" | "unit">[];
}

function systemPrompt(ctx: ParseContext): string {
  const prices = ctx.items
    .map((i) => `${i.name}${i.price_paise ? ` = ₹${i.price_paise / 100}` : ""}${i.unit ? ` (${i.unit})` : ""}`)
    .join("; ");
  return `You are the parser for "Bol Khata", a voice credit ledger (udhaar khata) for Indian chai stalls and kirana shops.
The input is ONE transcript spoken by the shopkeeper in Hindi, English, Gujarati or Hinglish (Roman, Devanagari or Gujarati script). It may contain speech-recognition mistakes.
Return ONLY a JSON object: {"actions": [Action, ...]}.
Every Action has ALL these keys (use null when not relevant):
type, customer, amount_rupees, item, qty, unit, for_date, note, question.

Action types:
- "credit": customer took goods on credit (udhaar). Words: likho, udhaar, khaate mein, credit, naam likho.
- "payment": customer paid money back. Words: diye, de diye, jama, mil gaye, chukaye, wapas.
- "order": shopkeeper wants stock from a supplier. Words: mangwana, order, bhejna, chahiye. Fill item, qty, unit, for_date ("tomorrow" unless they say today/aaj).
- "query_balance": asks how much a customer owes (kitna baaki).
- "undo_last": nahi / galat / cancel / pichla hatao.
- "daily_summary": aaj ka hisaab.
- "send_reminders": remind everyone who owes money. amount_rupees = minimum balance if said.
- "clarify": name or amount is missing or unclear. Put a short Hinglish question in "question".

Rules:
- One sentence can contain several actions ("Ramesh ka 40 aur Pappu ka 20" = 2 credits).
- Hindi numbers: ek=1, do=2, teen=3, chaar=4, paanch=5, das=10, bees=20, tees=30, chaalis=40, pachaas=50, sau=100, dedh sau=150, dhai sau=250, saade teen sau=350, hazaar=1000.
- If the shopkeeper lists items for a customer ("2 chai aur 1 bun Mohan ke khaate mein"), compute amount_rupees from this price list and put the items in "note" (e.g. "2 chai, 1 bun"). Price list: ${prices || "none"}.
- Known customers: ${ctx.customers.join(", ") || "none"}. If the spoken name is close to a known customer, return the known spelling. Otherwise return the name as spoken, in Roman script, Title Case.
- amount_rupees must be a plain number of rupees (no symbols). Never invent an amount or a name.

Example: "Ramesh ka 40 aur Pappu ka 20 likho" ->
{"actions":[{"type":"credit","customer":"Ramesh","amount_rupees":40,"item":null,"qty":null,"unit":null,"for_date":null,"note":null,"question":null},{"type":"credit","customer":"Pappu","amount_rupees":20,"item":null,"qty":null,"unit":null,"for_date":null,"note":null,"question":null}]}`;
}

function withTimeout(): { signal: AbortSignal; done: () => void } {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  return { signal: ctrl.signal, done: () => clearTimeout(t) };
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("no JSON in reply");
  return JSON.parse(text.slice(start, end + 1));
}

function validate(raw: unknown): ParsedAction[] {
  const parsed = ResultSchema.parse(raw);
  return parsed.actions.map((a) => ({
    ...a,
    amount_rupees: a.amount_rupees !== null && a.amount_rupees > 0 ? Math.round(a.amount_rupees * 100) / 100 : a.amount_rupees,
  }));
}

// ---------- Providers ----------

async function viaClaude(ctx: ParseContext): Promise<ParsedAction[]> {
  const model = process.env.CLAUDE_MODEL || "claude-opus-5-5";
  const client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 0 });
  const isHaiku = model.startsWith("claude-haiku");
  const response = await client.beta.messages.parse({
    model,
    max_tokens: 4000,
    system: systemPrompt(ctx),
    messages: [{ role: "user", content: ctx.transcript }],
    output_config: { effort: "low", format: betaZodOutputFormat(ResultSchema) },
    // Server-side fallback if a model declines (not available on Haiku).
    ...(isHaiku ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }),
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) throw new Error("claude: no parsed output");
  return validate(response.parsed_output);
}

async function viaGemini(ctx: ParseContext): Promise<ParsedAction[]> {
  const model = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
  const { signal, done } = withTimeout();
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt(ctx) }] },
        contents: [{ role: "user", parts: [{ text: ctx.transcript }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      }),
    });
    if (!res.ok) throw new Error(`gemini ${res.status}`);
    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return validate(extractJson(text));
  } finally {
    done();
  }
}

/** Groq, OpenRouter and Cerebras all speak the same OpenAI-style chat format. */
async function viaOpenAIStyle(url: string, key: string, model: string, ctx: ParseContext, jsonMode = true): Promise<ParsedAction[]> {
  const { signal, done } = withTimeout();
  try {
    const res = await fetch(url, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0,
        ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        // gpt-oss models think before answering; "low" keeps replies under ~1 second
        ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
        messages: [
          { role: "system", content: systemPrompt(ctx) },
          { role: "user", content: ctx.transcript },
        ],
      }),
    });
    if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return validate(extractJson(data.choices?.[0]?.message?.content ?? ""));
  } finally {
    done();
  }
}

interface Provider {
  name: string;
  enabled: () => boolean;
  run: (ctx: ParseContext) => Promise<ParsedAction[]>;
}

const env = (k: string) => process.env[k] ?? "";

export const PROVIDERS: Provider[] = [
  { name: "claude", enabled: () => !!env("ANTHROPIC_API_KEY"), run: viaClaude },
  { name: "gemini", enabled: () => !!env("GEMINI_API_KEY"), run: viaGemini },
  {
    name: "groq",
    enabled: () => !!env("GROQ_API_KEY"),
    run: (ctx) => viaOpenAIStyle("https://api.groq.com/openai/v1/chat/completions", env("GROQ_API_KEY"),
      env("GROQ_MODEL") || "openai/gpt-oss-120b", ctx),
  },
  {
    name: "openrouter",
    enabled: () => !!env("OPENROUTER_API_KEY"),
    run: (ctx) => viaOpenAIStyle("https://openrouter.ai/api/v1/chat/completions", env("OPENROUTER_API_KEY"),
      env("OPENROUTER_MODEL") || "meta-llama/llama-3.3-70b-instruct:free", ctx, false),
  },
  {
    name: "cerebras",
    enabled: () => !!env("CEREBRAS_API_KEY"),
    run: (ctx) => viaOpenAIStyle("https://api.cerebras.ai/v1/chat/completions", env("CEREBRAS_API_KEY"),
      env("CEREBRAS_MODEL") || "llama-3.3-70b", ctx),
  },
];

/** AI_ORDER="groq,gemini" puts those first; providers not listed keep their default order after them. */
function orderedProviders(): Provider[] {
  const wanted = env("AI_ORDER").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const rank = (p: Provider) => (wanted.includes(p.name) ? wanted.indexOf(p.name) : wanted.length + PROVIDERS.indexOf(p));
  return [...PROVIDERS].sort((a, b) => rank(a) - rank(b));
}

export async function parseWithFallback(ctx: ParseContext, items: Item[]) {
  const tried: string[] = [];
  for (const p of orderedProviders()) {
    if (!p.enabled()) continue;
    try {
      const actions = await p.run(ctx);
      if (actions.length) return { actions, source: p.name, tried };
      tried.push(`${p.name}: empty`);
    } catch (e) {
      tried.push(`${p.name}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 160));
    }
  }
  return { actions: parseRules(ctx.transcript, items), source: "rules", tried };
}
