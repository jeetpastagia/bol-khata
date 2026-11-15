import { useState } from "react";
import { StoreProvider, useStore } from "./lib/store";
import Bolo from "./pages/Bolo";
import Khata from "./pages/Khata";
import Orders from "./pages/Orders";
import Hisaab from "./pages/Hisaab";
import Settings, { statusText } from "./pages/Settings";
import CustomerView from "./pages/CustomerView";
import { balancePaise, rupees } from "./lib/ledger";

type Tab = "bolo" | "khata" | "order" | "hisaab" | "settings";
const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: "bolo", icon: "🎙️", label: "Bolo" },
  { id: "khata", icon: "📒", label: "Khata" },
  { id: "order", icon: "📦", label: "Order" },
  { id: "hisaab", icon: "📊", label: "Hisaab" },
];

export default function App() {
  const m = window.location.pathname.match(/^\/c\/([0-9a-f-]{36})$/i);
  if (m) return <CustomerView token={m[1]} />;
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

function Shell() {
  const { data, status } = useStore();
  const [tab, setTab] = useState<Tab>("bolo");
  const total = data.customers.reduce((s, c) => s + Math.max(0, balancePaise(c.id, data.transactions)), 0);
  const pendingOrders = data.orders.filter((o) => o.status === "pending").length;

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col">
      <header className="sticky top-0 z-30 bg-chai px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 text-cream shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold leading-tight">Bol Khata <span className="text-haldi">बोल खाता</span></h1>
            <p className="text-sm text-cream/80">{data.shop.name} · {statusText(status)}</p>
          </div>
          <button onClick={() => setTab("settings")} className="rounded-full bg-white/10 px-3 py-2 text-xl" aria-label="Settings">⚙️</button>
        </div>
        <div className="mt-2 rounded-xl bg-white/10 px-3 py-1.5 text-center">
          Bazaar mein baaki: <b className="text-xl text-haldi">{rupees(total)}</b>
        </div>
      </header>

      <main className="flex-1 px-4 pt-4 pb-28">
        {tab === "bolo" && <Bolo />}
        {tab === "khata" && <Khata />}
        {tab === "order" && <Orders />}
        {tab === "hisaab" && <Hisaab />}
        {tab === "settings" && <Settings />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md border-t border-line bg-cream pb-[env(safe-area-inset-bottom)]">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`relative flex flex-1 flex-col items-center py-2 text-sm font-bold ${tab === t.id ? "text-kesar-dark" : "text-chai-soft"}`}>
            <span className={`text-2xl ${tab === t.id ? "" : "opacity-70"}`}>{t.icon}</span>
            {t.label}
            {t.id === "order" && pendingOrders > 0 && (
              <span className="absolute top-1 right-1/4 rounded-full bg-mirchi px-1.5 text-xs text-white">{pendingOrders}</span>
            )}
            {tab === t.id && <span className="absolute top-0 h-1 w-10 rounded-b bg-kesar" />}
          </button>
        ))}
      </nav>
    </div>
  );
}
