// Balances, Bharosa Score and daily summary. Pure functions over the transaction list.
import type { Customer, Txn } from "./types.js";

const DAY = 86_400_000;

export function balancePaise(customerId: string, txns: Txn[]): number {
  let b = 0;
  for (const t of txns) {
    if (t.customer_id !== customerId || t.voided) continue;
    b += t.type === "credit" ? t.amount_paise : -t.amount_paise;
  }
  return b;
}

export interface Bharosa {
  score: number;
  level: "green" | "amber" | "red";
  label: string;
  oldestUnpaidDays: number;
  avgRepayDays: number | null;
  reasons: string[];
}

/**
 * Bharosa Score 0-100 (simple and explainable on purpose).
 * Payments settle the oldest credit first (FIFO) to measure how long people take to repay.
 */
export function bharosaScore(customer: Customer, txns: Txn[], now = Date.now()): Bharosa {
  const mine = txns
    .filter((t) => t.customer_id === customer.id && !t.voided)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const open: { at: number; left: number }[] = [];
  const repayDays: number[] = [];
  let onTime = 0;
  for (const t of mine) {
    const at = Date.parse(t.created_at);
    if (t.type === "credit") { open.push({ at, left: t.amount_paise }); continue; }
    let pay = t.amount_paise;
    while (pay > 0 && open.length) {
      const c = open[0];
      const used = Math.min(pay, c.left);
      c.left -= used;
      pay -= used;
      if (c.left === 0) {
        const days = (at - c.at) / DAY;
        repayDays.push(days);
        if (days <= 15) onTime++;
        open.shift();
      }
    }
  }
  const oldestUnpaidDays = open.length ? Math.floor((now - open[0].at) / DAY) : 0;
  const avgRepayDays = repayDays.length ? repayDays.reduce((a, b) => a + b, 0) / repayDays.length : null;
  const balance = balancePaise(customer.id, txns);
  const disputes = mine.filter((t) => t.disputed).length;

  const reasons: string[] = [];
  let score = 100;
  if (avgRepayDays !== null && avgRepayDays > 0) {
    const p = Math.min(40, Math.round(avgRepayDays));
    score -= p;
    if (p >= 10) reasons.push(`Aam taur par ${Math.round(avgRepayDays)} din mein chukata hai`);
  }
  if (oldestUnpaidDays > 0) {
    const p = Math.min(40, oldestUnpaidDays);
    score -= p;
    if (oldestUnpaidDays >= 15) reasons.push(`${oldestUnpaidDays} din purana udhaar baaki`);
  }
  if (customer.credit_limit_paise && balance > customer.credit_limit_paise) {
    score -= 20;
    reasons.push("Udhaar limit se zyada");
  }
  if (disputes) {
    score -= 5 * disputes;
    reasons.push(`${disputes} entry par vivaad (dispute)`);
  }
  if (onTime) {
    score += Math.min(10, onTime);
    if (onTime >= 3) reasons.push(`${onTime} baar samay par chukaya`);
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  const level = score >= 70 ? "green" : score >= 40 ? "amber" : "red";
  const label = level === "green" ? "Bharosa" : level === "amber" ? "Dhyan dein" : "Ruko";
  return { score, level, label, oldestUnpaidDays, avgRepayDays, reasons };
}

export function isSameDay(iso: string, now = new Date()): boolean {
  const d = new Date(iso);
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export function todaySummary(txns: Txn[], now = new Date()) {
  let credit = 0, collected = 0, entries = 0;
  for (const t of txns) {
    if (t.voided || !isSameDay(t.created_at, now)) continue;
    entries++;
    if (t.type === "credit") credit += t.amount_paise; else collected += t.amount_paise;
  }
  return { credit, collected, entries };
}

/** Last 7 days of credit given vs money collected, oldest first. */
export function weekSeries(txns: Txn[], now = new Date()) {
  const days: { label: string; credit: number; collected: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const s = todaySummary(txns, d);
    days.push({ label: d.toLocaleDateString("en-IN", { weekday: "short" }), credit: s.credit, collected: s.collected });
  }
  return days;
}

export const rupees = (paise: number) =>
  "₹" + (paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 });
