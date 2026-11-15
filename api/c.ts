// Pakka Hisaab: the customer's own read-only khata page.
// GET  /api/c?token=...            -> shop name, customer name, entries, balance
// POST /api/c { token, txn_id }    -> customer marks one entry as wrong (disputed)
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { z } from "zod";
import { db, fail, notConfigured } from "./_lib/db.js";
import { SHOP_ID } from "../src/lib/seed.js";

const Token = z.string().uuid();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const sb = db();
  if (!sb) return notConfigured(res);
  try {
    const token = Token.safeParse(req.method === "GET" ? req.query.token : req.body?.token);
    if (!token.success) return res.status(400).json({ error: "bad_token" });

    const { data: customer, error } = await sb
      .from("customers").select("id,name").eq("view_token", token.data).eq("shop_id", SHOP_ID).maybeSingle();
    if (error) throw error;
    if (!customer) return res.status(404).json({ error: "not_found" });

    if (req.method === "POST") {
      const txnId = z.string().uuid().safeParse(req.body?.txn_id);
      if (!txnId.success) return res.status(400).json({ error: "bad_txn" });
      const { error: e } = await sb.from("transactions")
        .update({ disputed: true }).eq("id", txnId.data).eq("customer_id", customer.id);
      if (e) throw e;
      return res.status(200).json({ ok: true });
    }

    const [shop, txns] = await Promise.all([
      sb.from("shops").select("name").eq("id", SHOP_ID).single(),
      sb.from("transactions").select("id,type,amount_paise,note,voided,disputed,created_at")
        .eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(100),
    ]);
    if (shop.error) throw shop.error;
    if (txns.error) throw txns.error;
    const balance = (txns.data ?? []).reduce((s, t) =>
      t.voided ? s : s + (t.type === "credit" ? t.amount_paise : -t.amount_paise), 0);
    res.status(200).json({ shop: shop.data.name, customer: customer.name, balance_paise: balance, transactions: txns.data });
  } catch (e) {
    fail(res, e);
  }
}
