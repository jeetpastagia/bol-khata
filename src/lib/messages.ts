// WhatsApp message texts (Hinglish, polite).
import { rupees } from "./ledger";
import { appOrigin, upiLink } from "./links";
import type { Customer, OrderItem, Shop, Supplier, Txn } from "./types";

export function reminderText(shop: Shop, c: Customer, balance: number): string {
  const lines = [
    `🙏 Namaste ${c.name} ji,`,
    `${shop.name} par aapka ${rupees(balance)} baaki hai.`,
  ];
  if (shop.upi_vpa) lines.push(`UPI se aasani se dein: ${upiLink(shop.upi_vpa, shop.name, balance, `Udhaar ${c.name}`)}`);
  lines.push(`Apna poora hisaab dekhein: ${appOrigin()}/c/${c.view_token}`);
  lines.push(`Dhanyavaad! — ${shop.name}`);
  return lines.join("\n");
}

/** Pakka Hisaab: confirmation sent to the customer right after an entry is saved. */
export function pakkaHisaabText(shop: Shop, c: Customer, txn: Txn, balance: number): string {
  const what = txn.type === "credit"
    ? `ne aapke khaate mein ${rupees(txn.amount_paise)} likha${txn.note ? ` (${txn.note})` : ""}`
    : `ko aapse ${rupees(txn.amount_paise)} mil gaye, dhanyavaad`;
  return [
    `🧾 ${shop.name} ${what}.`,
    `Kul baaki: ${rupees(Math.max(0, balance))}.`,
    `Galat ho to yahan "Galat hai" dabayein: ${appOrigin()}/c/${c.view_token}`,
  ].join("\n");
}

export function supplierOrderText(shop: Shop, supplier: Supplier | null, items: OrderItem[]): string {
  const date = items[0]?.for_date;
  const when = date ? new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" }) : "kal";
  return [
    `Namaste ${supplier?.name ?? ""},`.replace(" ,", ","),
    `${when} subah tak bhejna:`,
    ...items.map((i) => `• ${i.item_name} – ${i.qty} ${i.unit ?? ""}`.trim()),
    `— ${shop.name}`,
  ].join("\n");
}
