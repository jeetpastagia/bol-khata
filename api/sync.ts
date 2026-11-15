// POST /api/sync { ops: [{ table, row }] } -> upserts rows made on the phone (online or after being offline).
// Rows carry ids made on the phone, so sending the same op twice never creates duplicates.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { db, fail, notConfigured } from "./_lib/db.js";
import { SHOP_ID } from "../src/lib/seed.js";

const uuid = z.string().uuid();
const iso = z.string().min(10);

const rowSchemas = {
  customers: z.object({
    id: uuid, name: z.string().min(1).max(60), aliases: z.array(z.string().max(60)).max(20),
    phone: z.string().max(15).nullable(), credit_limit_paise: z.number().int().nonnegative().nullable(),
    view_token: uuid, created_at: iso,
  }),
  transactions: z.object({
    id: uuid, customer_id: uuid, type: z.enum(["credit", "payment"]),
    amount_paise: z.number().int().positive().max(100_000_00), // max ₹1,00,000 per entry
    note: z.string().max(200).nullable(), transcript: z.string().max(500).nullable(),
    voided: z.boolean(), disputed: z.boolean(), created_at: iso,
  }),
  order_items: z.object({
    id: uuid, item_id: uuid.nullable(), item_name: z.string().min(1).max(60), qty: z.number().positive().max(10000),
    unit: z.string().max(20).nullable(), for_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.enum(["pending", "sent"]), transcript: z.string().max(500).nullable(), created_at: iso,
  }),
  shops: z.object({
    id: z.literal(SHOP_ID), name: z.string().min(1).max(80), upi_vpa: z.string().max(80), owner_phone: z.string().max(15),
  }),
} as const;

const Body = z.object({
  ops: z.array(z.object({ table: z.enum(["customers", "transactions", "order_items", "shops"]), row: z.record(z.string(), z.unknown()) })).max(500),
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const sb = db();
  if (!sb) return notConfigured(res);
  const body = Body.safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "bad_request", message: body.error.message });

  try {
    let applied = 0;
    for (const op of body.data.ops) {
      const parsed = rowSchemas[op.table].safeParse(op.row);
      if (!parsed.success) return res.status(400).json({ error: "bad_row", table: op.table, message: parsed.error.message });
      const row: Record<string, unknown> = op.table === "shops" ? { ...parsed.data } : { ...parsed.data, shop_id: SHOP_ID };
      const { error } = await sb.from(op.table).upsert(row);
      if (error) throw error;
      applied++;
    }
    res.status(200).json({ ok: true, applied });
  } catch (e) {
    fail(res, e);
  }
}
