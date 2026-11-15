// GET /api/state -> everything the app needs for the shop. Fills an empty database with the starter shop.
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { db, fail, notConfigured } from "./_lib/db.js";
import { seedData, SHOP_ID } from "../src/lib/seed.js";

async function seedIfEmpty() {
  const sb = db()!;
  const { data: shop, error } = await sb.from("shops").select("id").eq("id", SHOP_ID).maybeSingle();
  if (error) throw error;
  if (shop) return;
  const s = seedData();
  const steps: [string, unknown[]][] = [
    ["shops", [s.shop]],
    ["suppliers", s.suppliers.map((r) => ({ ...r, shop_id: SHOP_ID }))],
    ["items", s.items.map((r) => ({ ...r, shop_id: SHOP_ID }))],
    ["customers", s.customers.map((r) => ({ ...r, shop_id: SHOP_ID }))],
    ["transactions", s.transactions.map((r) => ({ ...r, shop_id: SHOP_ID }))],
  ];
  for (const [table, rows] of steps) {
    const { error: e } = await sb.from(table).upsert(rows);
    if (e) throw e;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const sb = db();
  if (!sb) return notConfigured(res);
  try {
    await seedIfEmpty();
    const q = (table: string) => sb.from(table).select("*").eq("shop_id", SHOP_ID);
    const [shop, customers, transactions, items, suppliers, orders] = await Promise.all([
      sb.from("shops").select("id,name,upi_vpa,owner_phone").eq("id", SHOP_ID).single(),
      q("customers").order("name"),
      q("transactions").order("created_at"),
      q("items").order("name"),
      q("suppliers").order("name"),
      q("order_items").order("created_at"),
    ]);
    for (const r of [shop, customers, transactions, items, suppliers, orders]) if (r.error) throw r.error;
    res.status(200).json({
      shop: shop.data,
      customers: customers.data,
      transactions: transactions.data,
      items: items.data,
      suppliers: suppliers.data,
      orders: orders.data,
    });
  } catch (e) {
    fail(res, e);
  }
}
