// POST /api/parse { transcript, customers: string[], items: [{name, price_paise, unit}] }
// -> { actions, source } using the AI fallback chain (Claude -> Gemini -> Groq -> OpenRouter -> Cerebras -> rules).
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { parseWithFallback, PROVIDERS } from "./_lib/ai.js";
import type { Item } from "../src/lib/types.js";

const Body = z.object({
  transcript: z.string().min(1).max(500),
  customers: z.array(z.string().max(60)).max(500).default([]),
  items: z.array(z.object({
    name: z.string().max(60),
    aliases: z.array(z.string()).optional(),
    price_paise: z.number().nullable(),
    unit: z.string().nullable(),
  })).max(200).default([]),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    // Health check: which AI providers have keys configured (never returns the keys)
    return res.status(200).json({ providers: PROVIDERS.map((p) => ({ name: p.name, enabled: p.enabled() })) });
  }
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const body = Body.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "bad_request", message: body.error.message });

  const items: Item[] = body.data.items.map((i, n) => ({
    id: `x${n}`, name: i.name, aliases: i.aliases ?? [], price_paise: i.price_paise, unit: i.unit, supplier_id: null,
  }));
  const result = await parseWithFallback(
    { transcript: body.data.transcript, customers: body.data.customers, items },
    items,
  );
  if (result.tried.length) console.warn("[parse] fallbacks:", result.tried.join(" | "));
  res.status(200).json({ actions: result.actions, source: result.source });
}
