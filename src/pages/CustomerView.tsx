// Pakka Hisaab page the customer opens from WhatsApp: their own entries, and a "Galat hai" button on each.
import { useEffect, useState } from "react";
import { rupees } from "../lib/ledger";

interface View {
  shop: string;
  customer: string;
  balance_paise: number;
  transactions: { id: string; type: "credit" | "payment"; amount_paise: number; note: string | null; voided: boolean; disputed: boolean; created_at: string }[];
}

export default function CustomerView({ token }: { token: string }) {
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");

  const load = () =>
    fetch(`/api/c?token=${encodeURIComponent(token)}`)
      .then(async (r) => { if (!r.ok) throw new Error(String(r.status)); setView(await r.json()); })
      .catch(() => setError("Hisaab nahi mila. Link sahi hai? Internet chalu hai?"));
  useEffect(() => { void load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const dispute = async (id: string) => {
    if (!confirm("Kya yeh entry galat hai? Dukaandar ko bataya jayega.")) return;
    await fetch("/api/c", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, txn_id: id }) });
    void load();
  };

  return (
    <div className="mx-auto min-h-full max-w-md p-4">
      <h1 className="text-2xl font-extrabold text-chai">🧾 Pakka Hisaab</h1>
      {error && <p className="mt-4 rounded-2xl bg-mirchi-soft p-4 text-mirchi">{error}</p>}
      {!view && !error && <p className="mt-4 text-chai-soft">Load ho raha hai…</p>}
      {view && (
        <>
          <p className="text-chai-soft">{view.shop} · {view.customer}</p>
          <div className="mt-3 rounded-2xl bg-chai p-4 text-cream">
            <div className="text-cream/80">Aapka baaki</div>
            <div className="text-4xl font-extrabold text-haldi">{rupees(Math.max(0, view.balance_paise))}</div>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            {view.transactions.map((t) => (
              <div key={t.id} className={`rounded-2xl border border-line bg-white/70 p-3 ${t.voided ? "opacity-50" : ""}`}>
                <div className="flex justify-between">
                  <b className={`${t.voided ? "line-through" : ""} ${t.type === "credit" ? "text-mirchi" : "text-patti"}`}>
                    {t.type === "credit" ? "Udhaar" : "Payment"} {rupees(t.amount_paise)}
                  </b>
                  <span className="text-sm text-chai-soft">{new Date(t.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
                </div>
                {t.note && <div className="text-sm text-chai-soft">{t.note}</div>}
                {!t.voided && t.type === "credit" && (
                  t.disputed
                    ? <div className="mt-1 text-sm font-bold text-mirchi">⚠️ Aapne galat bataya — dukaandar dekhenge</div>
                    : <button onClick={() => void dispute(t.id)} className="mt-2 rounded-xl bg-mirchi-soft px-3 py-1.5 text-sm font-bold text-mirchi">Galat hai</button>
                )}
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-chai-soft">Bol Khata se bheja gaya</p>
        </>
      )}
    </div>
  );
}
