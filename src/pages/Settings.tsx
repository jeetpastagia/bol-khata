import { useEffect, useState } from "react";
import { Btn, Card } from "../components/ui";
import { rupees } from "../lib/ledger";
import { useStore } from "../lib/store";

export default function Settings() {
  const { data, commit, status, pending, serverReady, syncNow, resetLocal } = useStore();
  const [shop, setShop] = useState(data.shop);
  const [providers, setProviders] = useState<{ name: string; enabled: boolean }[] | null>(null);
  useEffect(() => setShop(data.shop), [data.shop]);
  useEffect(() => {
    fetch("/api/parse").then((r) => (r.ok ? r.json() : null)).then((j) => setProviders(j?.providers ?? null)).catch(() => setProviders(null));
  }, []);
  const changed = JSON.stringify(shop) !== JSON.stringify(data.shop);

  return (
    <div className="grid items-start gap-3 lg:max-w-5xl lg:grid-cols-2">
      <Card className="flex flex-col gap-3 lg:row-span-2">
        <h3 className="text-lg font-bold text-chai">Dukaan</h3>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-chai-soft">Dukaan ka naam</span>
          <input value={shop.name} onChange={(e) => setShop({ ...shop, name: e.target.value })} className="min-h-12 rounded-2xl border border-line bg-white px-4 text-lg" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-chai-soft">UPI ID (paise isme aayenge)</span>
          <input value={shop.upi_vpa} onChange={(e) => setShop({ ...shop, upi_vpa: e.target.value.trim() })} placeholder="naam@okaxis" className="min-h-12 rounded-2xl border border-line bg-white px-4 text-lg" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-chai-soft">Aapka mobile</span>
          <input value={shop.owner_phone} inputMode="numeric" onChange={(e) => setShop({ ...shop, owner_phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} className="min-h-12 rounded-2xl border border-line bg-white px-4 text-lg" />
        </label>
        <Btn disabled={!changed || !shop.name} onClick={() => commit([{ table: "shops", row: { ...shop } }])}>Save</Btn>
      </Card>

      <Card>
        <h3 className="mb-2 text-lg font-bold text-chai">Rate list (item math ke liye)</h3>
        {data.items.filter((i) => i.price_paise).map((i) => (
          <div key={i.id} className="flex justify-between border-b border-line py-1.5 last:border-0">
            <span>{i.name}</span><b>{rupees(i.price_paise!)}</b>
          </div>
        ))}
      </Card>

      <Card className="flex flex-col gap-2">
        <h3 className="text-lg font-bold text-chai">Sync aur AI</h3>
        <p>Status: <b>{statusText(status)}</b>{pending > 0 && ` · ${pending} entry bhejni baaki`}</p>
        <p>Database: <b>{serverReady ? "✅ Supabase se juda" : "📱 Sirf is phone par (local mode)"}</b></p>
        <div>
          AI (is kram mein koshish):{" "}
          {providers
            ? providers.map((p) => <span key={p.name} className={`mr-1 inline-block rounded-full px-2 py-0.5 text-sm ${p.enabled ? "bg-patti-soft text-patti" : "bg-cream-2 text-chai-soft line-through"}`}>{p.name}</span>)
            : <span className="text-chai-soft">server nahi mila</span>}
          <span className="inline-block rounded-full bg-patti-soft px-2 py-0.5 text-sm text-patti">offline rules</span>
        </div>
        <div className="flex gap-2">
          <Btn tone="soft" onClick={() => void syncNow()}>⟳ Abhi sync</Btn>
          {!serverReady && <Btn tone="mirchi" onClick={() => confirm("Khata shuru se karein? Is phone ki nayi entries hat jayengi.") && resetLocal()}>Shuru se karein</Btn>}
        </div>
      </Card>
      <p className="text-center text-sm text-chai-soft lg:col-span-2">Bol Khata · bolo, aur likh gaya 🎙️</p>
    </div>
  );
}

export function statusText(s: string) {
  return ({ synced: "✅ Sab save", pending: "⏳ Bhej raha hai", offline: "📴 Offline (baad mein sync hoga)", local: "📱 Local mode", syncing: "⏳ Sync ho raha hai", error: "⚠️ Sync nahi hua, dobara koshish hogi" } as Record<string, string>)[s] ?? s;
}
