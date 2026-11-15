// App state with offline-first sync.
// Every change is applied on the phone first (saved in localStorage) and queued.
// The queue is sent to /api/sync whenever the internet is available, then fresh data is pulled.
// If the server has no database configured, the app runs in "local mode" with the starter shop.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { seedData } from "./seed";
import type { AppData, Customer, OrderItem, Shop, SyncOp, Txn } from "./types";

const DATA_KEY = "bolkhata.data.v1";
const QUEUE_KEY = "bolkhata.queue.v1";

export type SyncStatus = "synced" | "pending" | "offline" | "local" | "syncing" | "error";

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function save(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}

export const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
        (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));

function applyOp(data: AppData, op: SyncOp): AppData {
  const upsert = <T extends { id: string }>(list: T[], row: T) => {
    const i = list.findIndex((r) => r.id === row.id);
    if (i < 0) return [...list, row];
    const copy = list.slice();
    copy[i] = row;
    return copy;
  };
  switch (op.table) {
    case "customers": return { ...data, customers: upsert(data.customers, op.row as unknown as Customer) };
    case "transactions": return { ...data, transactions: upsert(data.transactions, op.row as unknown as Txn) };
    case "order_items": return { ...data, orders: upsert(data.orders, op.row as unknown as OrderItem) };
    case "shops": return { ...data, shop: op.row as unknown as Shop };
  }
}

interface Store {
  data: AppData;
  status: SyncStatus;
  pending: number;
  serverReady: boolean;
  commit: (ops: SyncOp[]) => void;
  syncNow: () => Promise<void>;
  resetLocal: () => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => load<AppData>(DATA_KEY) ?? seedData());
  const [queue, setQueue] = useState<SyncOp[]>(() => load<SyncOp[]>(QUEUE_KEY) ?? []);
  const [status, setStatus] = useState<SyncStatus>("syncing");
  const [serverReady, setServerReady] = useState(false);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const syncing = useRef(false);

  useEffect(() => save(DATA_KEY, data), [data]);
  useEffect(() => save(QUEUE_KEY, queue), [queue]);

  const syncNow = useCallback(async () => {
    if (syncing.current) return;
    if (!navigator.onLine) { setStatus("offline"); return; }
    syncing.current = true;
    setStatus("syncing");
    try {
      const sending = queueRef.current;
      const sent = new Set(sending);
      if (sending.length) {
        const r = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ops: sending }),
        });
        if (r.status === 503) { setServerReady(false); setStatus("local"); return; }
        if (!r.ok) throw new Error(`sync ${r.status}`);
        // Remove only what we sent; new ops added meanwhile stay queued.
        setQueue((q) => q.filter((op) => !sent.has(op)));
      }
      const s = await fetch("/api/state");
      if (s.status === 503) { setServerReady(false); setStatus("local"); return; }
      if (!s.ok) throw new Error(`state ${s.status}`);
      const fresh = (await s.json()) as AppData;
      setServerReady(true);
      // Re-apply anything queued after we sent, so nothing typed during sync disappears.
      const leftover = queueRef.current.filter((op) => !sent.has(op));
      setData(leftover.reduce(applyOp, fresh));
      setStatus(leftover.length ? "pending" : "synced");
    } catch {
      setStatus(navigator.onLine ? "error" : "offline");
    } finally {
      syncing.current = false;
    }
  }, []);

  const commit = useCallback((ops: SyncOp[]) => {
    setData((d) => ops.reduce(applyOp, d));
    setQueue((q) => [...q, ...ops]);
    setStatus((s) => (s === "local" ? "local" : "pending"));
    setTimeout(() => void syncNow(), 50);
  }, [syncNow]);

  const resetLocal = useCallback(() => {
    setData(seedData());
    setQueue([]);
  }, []);

  useEffect(() => {
    void syncNow();
    const onOnline = () => void syncNow();
    const onOffline = () => setStatus("offline");
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const timer = setInterval(() => { if (queueRef.current.length) void syncNow(); }, 20_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      clearInterval(timer);
    };
  }, [syncNow]);

  const value = useMemo<Store>(() => ({
    data, status, pending: queue.length, serverReady, commit, syncNow, resetLocal,
  }), [data, status, queue.length, serverReady, commit, syncNow, resetLocal]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
