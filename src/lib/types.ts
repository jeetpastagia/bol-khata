// Shared data types used by the app (browser) and the API (server).
// All money is stored as integer paise: ₹40 = 4000. Never use decimals for money.

export interface Shop {
  id: string;
  name: string;
  upi_vpa: string;
  owner_phone: string;
}

export interface Customer {
  id: string;
  name: string;
  aliases: string[];
  phone: string | null;
  credit_limit_paise: number | null;
  view_token: string;
  created_at: string;
}

export type TxnType = "credit" | "payment";

export interface Txn {
  id: string; // generated on the phone, so offline sync never duplicates
  customer_id: string;
  type: TxnType;
  amount_paise: number;
  note: string | null;
  transcript: string | null;
  voided: boolean;
  disputed: boolean;
  created_at: string;
}

export interface Item {
  id: string;
  name: string;
  aliases: string[];
  price_paise: number | null;
  unit: string | null;
  supplier_id: string | null;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
}

export interface OrderItem {
  id: string;
  item_id: string | null;
  item_name: string;
  qty: number;
  unit: string | null;
  for_date: string; // YYYY-MM-DD
  status: "pending" | "sent";
  transcript: string | null;
  created_at: string;
}

export interface AppData {
  shop: Shop;
  customers: Customer[];
  transactions: Txn[];
  items: Item[];
  suppliers: Supplier[];
  orders: OrderItem[];
}

/** One action understood from a spoken sentence (flat shape works for every AI + the rule parser). */
export type ActionType =
  | "credit"
  | "payment"
  | "order"
  | "query_balance"
  | "undo_last"
  | "daily_summary"
  | "send_reminders"
  | "clarify";

export interface ParsedAction {
  type: ActionType;
  customer: string | null;
  amount_rupees: number | null;
  item: string | null;
  qty: number | null;
  unit: string | null;
  for_date: "today" | "tomorrow" | null;
  note: string | null;
  question: string | null;
}

export interface ParseResult {
  actions: ParsedAction[];
  source: "claude" | "gemini" | "rules";
}

/** Rows the sync endpoint is allowed to upsert. */
export type SyncTable = "customers" | "transactions" | "order_items" | "shops";
export interface SyncOp {
  table: SyncTable;
  row: Record<string, unknown>;
}

export const emptyAction = (type: ActionType): ParsedAction => ({
  type,
  customer: null,
  amount_rupees: null,
  item: null,
  qty: null,
  unit: null,
  for_date: null,
  note: null,
  question: null,
});
