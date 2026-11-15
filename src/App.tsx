import { useState, type ReactNode } from "react";
import { GearIcon } from "./components/ui";
import { StoreProvider, useStore } from "./lib/store";
import Bolo from "./pages/Bolo";
import Khata from "./pages/Khata";
import Orders from "./pages/Orders";
import Hisaab from "./pages/Hisaab";
import Settings, { statusText } from "./pages/Settings";
import CustomerView from "./pages/CustomerView";
import { balancePaise, rupees } from "./lib/ledger";

type Tab = "bolo" | "khata" | "order" | "hisaab" | "settings";
const TABS: { id: Tab; icon: ReactNode; label: string }[] = [
  { id: "bolo", icon: "🎙️", label: "Bolo" },
  { id: "khata", icon: "📒", label: "Khata" },
  { id: "order", icon: "📦", label: "Order" },
  { id: "hisaab", icon: "🧾", label: "Hisaab" },
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

/**
 * Responsive shell:
 * - Phone (< 1024px): header + one column + bottom tab bar.
 * - Laptop / large tablet (>= 1024px): left sidebar menu, wide content.
 *   On "Bolo" the live Hisaab dashboard sits next to the mic, so the whole shop fits on one screen.
 */
function Shell() {
  const { data, status } = useStore();
  const [tab, setTab] = useState<Tab>("bolo");
  const total = data.customers.reduce((s, c) => s + Math.max(0, balancePaise(c.id, data.transactions)), 0);
  const pendingOrders = data.orders.filter((o) => o.status === "pending").length;

  return (
    <div className="min-h-full lg:flex">
      {/* Sidebar (laptop) */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-chai p-5 text-cream lg:flex xl:w-64">
        <h1 className="text-2xl font-extrabold leading-tight">Bol Khata</h1>
        <p className="text-xl font-bold text-haldi">बोल खाता</p>
        <p className="mt-1 text-sm text-cream/70">{data.shop.name}</p>
        <nav className="mt-8 flex flex-col gap-1.5">
          {[...TABS, { id: "settings" as Tab, icon: <GearIcon className="h-7 w-7" />, label: "Settings" }].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left text-lg font-bold transition ${tab === t.id ? "bg-kesar text-white" : "text-cream/85 hover:bg-white/10"}`}>
              <span className="text-2xl">{t.icon}</span>
              {t.label}
              {t.id === "order" && pendingOrders > 0 && (
                <span className="ml-auto rounded-full bg-mirchi px-2 text-sm text-white">{pendingOrders}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl bg-white/10 p-4">
          <div className="text-sm text-cream/70">Bazaar mein baaki</div>
          <div className="text-3xl font-extrabold text-haldi">{rupees(total)}</div>
          <div className="mt-2 text-sm text-cream/70">{statusText(status)}</div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {/* Header (phone / tablet) */}
        <header className="sticky top-0 z-30 bg-chai px-4 pt-[max(env(safe-area-inset-top),0.75rem)] pb-3 text-cream shadow-md lg:hidden">
          <div className="mx-auto max-w-2xl">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-extrabold leading-tight">Bol Khata <span className="text-haldi">बोल खाता</span></h1>
                <p className="text-sm text-cream/80">{data.shop.name} · {statusText(status)}</p>
              </div>
              <button onClick={() => setTab("settings")} className="rounded-full bg-white/10 px-3 py-2 text-xl" aria-label="Settings"><GearIcon /></button>
            </div>
            <div className="mt-2 rounded-xl bg-white/10 px-3 py-1.5 text-center">
              Bazaar mein baaki: <b className="text-xl text-haldi">{rupees(total)}</b>
            </div>
          </div>
        </header>

        {/* Page title (laptop) */}
        <div className="hidden border-b border-line px-8 py-5 lg:block">
          <h2 className="text-3xl font-extrabold text-chai">
            <span className="inline-flex align-middle text-chai">{[...TABS, { id: "settings", icon: <GearIcon className="h-8 w-8" />, label: "Settings" }].find((t) => t.id === tab)?.icon}</span>{" "}
            {{ bolo: "Bolo — awaaz se likho", khata: "Khata", order: "Supplier order", hisaab: "Hisaab", settings: "Settings" }[tab]}
          </h2>
        </div>

        <main className="mx-auto w-full max-w-2xl px-4 pt-4 pb-28 lg:max-w-none lg:px-8 lg:pt-6 lg:pb-10">
          {tab === "bolo" && (
            <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8 2xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
              <Bolo />
              <section className="hidden lg:block">
                <h3 className="mb-3 text-xl font-bold text-chai">🧾 Aaj ki dukaan</h3>
                <Hisaab />
              </section>
            </div>
          )}
          {tab === "khata" && <Khata />}
          {tab === "order" && <Orders />}
          {tab === "hisaab" && <Hisaab />}
          {tab === "settings" && <Settings />}
        </main>

        {/* Bottom tab bar (phone / tablet) */}
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-cream pb-[env(safe-area-inset-bottom)] lg:hidden">
          <div className="mx-auto flex max-w-2xl">
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
          </div>
        </nav>
      </div>
    </div>
  );
}
