// Turns parsed actions into a concrete plan (matched customers, new balances, warnings),
// the replies to show and speak, and the sync operations to save after confirmation.
import { titleCase } from "./hindi";
import { balancePaise, bharosaScore, rupees, todaySummary, type Bharosa } from "./ledger";
import { matchCustomer, matchItem } from "./match";
import { uuid } from "./store";
import type { AppData, Customer, ParsedAction, SyncOp, Txn } from "./types";
import { PHRASES, type Lang, type Say } from "./voice";

export const BIG_AMOUNT_PAISE = 2000_00; // ₹2,000+ needs an explicit "Haan"

export interface MoneyStep {
  kind: "money";
  type: "credit" | "payment";
  customer: Customer;
  isNew: boolean;
  amount_paise: number;
  note: string | null;
  newBalance: number;
  bharosa: Bharosa | null;
  warning: string | null;
}
export interface OrderStep {
  kind: "order";
  item_id: string | null;
  item_name: string;
  qty: number;
  unit: string | null;
  for_date: string;
}
export type Step = MoneyStep | OrderStep;

export type Instant =
  | { kind: "undo" }
  | { kind: "say"; display: string; speech: Say }
  | { kind: "reminders"; minPaise: number };

export interface Plan {
  steps: Step[];
  instant: Instant | null;
  needsExplicitYes: boolean;
}

const inr = (paise: number) => String(Math.round(paise / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

export function dateFor(when: "today" | "tomorrow" | null): string {
  const d = new Date();
  if (when !== "today") d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function buildPlan(actions: ParsedAction[], data: AppData): Plan {
  const steps: Step[] = [];
  const newCustomers = new Map<string, Customer>();
  // Running balances so "Ramesh ka 40 aur Ramesh ka 20" adds up correctly
  const running = new Map<string, number>();

  for (const a of actions) {
    switch (a.type) {
      case "undo_last":
        return { steps: [], instant: { kind: "undo" }, needsExplicitYes: false };
      case "daily_summary": {
        const s = todaySummary(data.transactions);
        const total = data.customers.reduce((sum, c) => sum + Math.max(0, balancePaise(c.id, data.transactions)), 0);
        return {
          steps: [], needsExplicitYes: false,
          instant: {
            kind: "say",
            display: `Aaj ${rupees(s.credit)} udhaar diya, ${rupees(s.collected)} wapas aaya. Bazaar mein kul ${rupees(total)} baaki.`,
            speech: {
              hi: `आज ${inr(s.credit)} रुपये उधार दिया, ${inr(s.collected)} रुपये वापस आए। बाज़ार में कुल ${inr(total)} रुपये बाकी हैं।`,
              en: `Today you gave ${inr(s.credit)} rupees on credit and got back ${inr(s.collected)} rupees. In total, ${inr(total)} rupees is due in the market.`,
              gu: `આજે ${inr(s.credit)} રૂપિયા ઉધાર આપ્યા, ${inr(s.collected)} રૂપિયા પાછા આવ્યા. બજારમાં કુલ ${inr(total)} રૂપિયા બાકી છે.`,
            },
          },
        };
      }
      case "query_balance": {
        const c = a.customer ? matchCustomer(a.customer, data.customers) : null;
        if (!c) {
          return { steps: [], needsExplicitYes: false, instant: {
            kind: "say", display: `"${a.customer ?? "?"}" naam ka customer nahi mila.`, speech: {
              hi: `${a.customer ?? ""} नाम का ग्राहक नहीं मिला।`,
              en: `I couldn't find a customer named ${a.customer ?? ""}.`,
              gu: `${a.customer ?? ""} નામનો ગ્રાહક મળ્યો નહીં.`,
            },
          } };
        }
        const b = balancePaise(c.id, data.transactions);
        return { steps: [], needsExplicitYes: false, instant: b > 0
          ? { kind: "say", display: `${c.name} ke ${rupees(b)} baaki hain.`, speech: { hi: `${c.name} के ${inr(b)} रुपये बाकी हैं।`, en: `${c.name} owes ${inr(b)} rupees.`, gu: `${c.name} ના ${inr(b)} રૂપિયા બાકી છે.` } }
          : { kind: "say", display: `${c.name} ka koi udhaar baaki nahi hai.`, speech: { hi: `${c.name} का कोई उधार बाकी नहीं है।`, en: `${c.name} has nothing due.`, gu: `${c.name} નું કોઈ ઉધાર બાકી નથી.` } } };
      }
      case "send_reminders":
        return { steps: [], needsExplicitYes: false, instant: { kind: "reminders", minPaise: Math.round((a.amount_rupees ?? 100) * 100) } };
      case "clarify":
        return { steps: [], needsExplicitYes: false, instant: {
          kind: "say", display: a.question ?? "Samajh nahi aaya, phir se boliye.",
          speech: a.customer && !a.amount_rupees
            ? { hi: `${a.customer} के कितने रुपये लिखूँ?`, en: `How much should I write for ${a.customer}?`, gu: `${a.customer} ના કેટલા રૂપિયા લખું?` }
            : PHRASES.notUnderstood,
        } };
      case "order": {
        if (!a.item || !a.qty) continue;
        const item = matchItem(a.item, data.items);
        steps.push({
          kind: "order", item_id: item?.id ?? null, item_name: item?.name ?? titleCase(a.item),
          qty: a.qty, unit: a.unit ?? item?.unit ?? null, for_date: dateFor(a.for_date),
        });
        continue;
      }
      case "credit":
      case "payment": {
        if (!a.customer || !a.amount_rupees || a.amount_rupees <= 0) continue;
        const key = a.customer.trim().toLowerCase();
        let customer = matchCustomer(a.customer, data.customers) ?? newCustomers.get(key) ?? null;
        let isNew = false;
        if (!customer) {
          isNew = true;
          customer = {
            id: uuid(), name: titleCase(a.customer.trim()), aliases: [], phone: null, credit_limit_paise: null,
            view_token: uuid(), created_at: new Date().toISOString(),
          };
          newCustomers.set(key, customer);
        }
        const amount = Math.round(a.amount_rupees * 100);
        const before = running.get(customer.id) ?? balancePaise(customer.id, data.transactions);
        const newBalance = before + (a.type === "credit" ? amount : -amount);
        running.set(customer.id, newBalance);
        const bharosa = isNew ? null : bharosaScore(customer, data.transactions);
        let warning: string | null = null;
        if (a.type === "credit" && bharosa && bharosa.level === "red") {
          warning = `Dhyan dein: Bharosa score ${bharosa.score}. ${bharosa.reasons[0] ?? ""}`.trim();
        } else if (a.type === "credit" && customer.credit_limit_paise && newBalance > customer.credit_limit_paise) {
          warning = `Udhaar limit ${rupees(customer.credit_limit_paise)} se zyada ho jayega.`;
        } else if (a.type === "payment" && newBalance < 0) {
          warning = `Yeh baaki se ${rupees(-newBalance)} zyada hai (advance).`;
        }
        steps.push({ kind: "money", type: a.type, customer, isNew, amount_paise: amount, note: a.note, newBalance, bharosa, warning });
        continue;
      }
    }
  }
  if (!steps.length) {
    return { steps: [], needsExplicitYes: false, instant: { kind: "say", display: "Samajh nahi aaya, phir se boliye.", speech: PHRASES.notUnderstood } };
  }
  const needsExplicitYes = steps.some((s) => s.kind === "money" && (s.amount_paise >= BIG_AMOUNT_PAISE || s.warning));
  return { steps, instant: null, needsExplicitYes };
}

export function planReply(plan: Plan): { display: string; speech: Say } {
  const disp: string[] = [];
  const sp: Record<Lang, string[]> = { hi: [], en: [], gu: [] };
  const add = (hi: string, en: string, gu: string) => { sp.hi.push(hi); sp.en.push(en); sp.gu.push(gu); };
  for (const s of plan.steps) {
    if (s.kind === "money") {
      const n = s.customer.name, amt = inr(s.amount_paise), bal = inr(Math.max(0, s.newBalance));
      if (s.type === "credit") {
        disp.push(`${n} ke ${rupees(s.amount_paise)} likh diye${s.isNew ? " (naya customer)" : ""}. Total ${rupees(s.newBalance)}.`);
        add(`${n} के ${amt} रुपये लिख दिए। कुल ${inr(s.newBalance)} रुपये।`,
            `Wrote ${amt} rupees for ${n}. Total ${inr(s.newBalance)} rupees.`,
            `${n} ના ${amt} રૂપિયા લખી દીધા. કુલ ${inr(s.newBalance)} રૂપિયા.`);
      } else {
        disp.push(`${n} se ${rupees(s.amount_paise)} mil gaye. Ab ${rupees(Math.max(0, s.newBalance))} baaki.`);
        add(`${n} से ${amt} रुपये मिल गए। अब ${bal} रुपये बाकी।`,
            `Received ${amt} rupees from ${n}. ${bal} rupees left.`,
            `${n} પાસેથી ${amt} રૂપિયા મળી ગયા. હવે ${bal} રૂપિયા બાકી.`);
      }
      if (s.warning && s.bharosa?.level === "red") {
        add(`ध्यान दें, ${n} का भरोसा स्कोर ${s.bharosa.score} है।`,
            `Careful, ${n}'s trust score is only ${s.bharosa.score}.`,
            `ધ્યાન આપો, ${n} નો ભરોસો સ્કોર ${s.bharosa.score} છે.`);
      }
      if (s.amount_paise >= BIG_AMOUNT_PAISE) add(`${amt} रुपये, पक्का?`, `${amt} rupees, are you sure?`, `${amt} રૂપિયા, પાક્કું?`);
    } else {
      const today = s.for_date === dateFor("today");
      disp.push(`${today ? "Aaj" : "Kal"} ke liye ${s.qty} ${s.unit ?? ""} ${s.item_name} order mein daala.`.replace(/\s+/g, " "));
      const u = s.unit ?? "";
      add(`${today ? "आज" : "कल"} के लिए ${s.qty} ${u} ${s.item_name} ऑर्डर में डाल दिया।`,
          `Added ${s.qty} ${u} ${s.item_name} to ${today ? "today's" : "tomorrow's"} order.`,
          `${today ? "આજ" : "કાલ"} માટે ${s.qty} ${u} ${s.item_name} ઓર્ડરમાં ઉમેર્યું.`);
    }
  }
  if (plan.needsExplicitYes) add("हाँ बटन दबाइए।", "Please press Yes to save.", "હા બટન દબાવો.");
  else add("ठीक है?", "Is that right?", "બરાબર છે?");
  return { display: disp.join(" "), speech: { hi: sp.hi.join(" "), en: sp.en.join(" "), gu: sp.gu.join(" ") } };
}

/** Sync operations to save a confirmed plan. Returns ops and the ids of new transactions. */
export function planToOps(plan: Plan, transcript: string): { ops: SyncOp[]; txnIds: string[] } {
  const ops: SyncOp[] = [];
  const txnIds: string[] = [];
  const addedCustomers = new Set<string>();
  const now = new Date().toISOString();
  for (const s of plan.steps) {
    if (s.kind === "money") {
      if (s.isNew && !addedCustomers.has(s.customer.id)) {
        addedCustomers.add(s.customer.id);
        ops.push({ table: "customers", row: { ...s.customer } });
      }
      const txn: Txn = {
        id: uuid(), customer_id: s.customer.id, type: s.type, amount_paise: s.amount_paise,
        note: s.note, transcript: transcript.slice(0, 500), voided: false, disputed: false, created_at: now,
      };
      txnIds.push(txn.id);
      ops.push({ table: "transactions", row: { ...txn } });
    } else {
      ops.push({ table: "order_items", row: {
        id: uuid(), item_id: s.item_id, item_name: s.item_name, qty: s.qty, unit: s.unit,
        for_date: s.for_date, status: "pending", transcript: transcript.slice(0, 500), created_at: now,
      } });
    }
  }
  return { ops, txnIds };
}
