import { useMemo, useState } from "react";
import { Btn, Card, Qr, ScoreBadge, Sheet, timeAgo } from "../components/ui";
import { balancePaise, bharosaScore, rupees } from "../lib/ledger";
import { upiLink, waLink } from "../lib/links";
import { normalize } from "../lib/hindi";
import { reminderText } from "../lib/messages";
import { useStore, uuid } from "../lib/store";
import type { Customer } from "../lib/types";

export default function Khata() {
  const { data, commit } = useStore();
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const rows = useMemo(() => {
    const nq = normalize(q);
    return data.customers
      .filter((c) => !nq || normalize([c.name, ...c.aliases].join(" ")).includes(nq))
      .map((c) => ({ c, bal: balancePaise(c.id, data.transactions), b: bharosaScore(c, data.transactions) }))
      .sort((a, b) => b.bal - a.bal);
  }, [data, q]);

  const open = data.customers.find((c) => c.id === openId) ?? null;

  return (
    <div className="@container flex flex-col gap-3">
      <div className="flex gap-2 @3xl:max-w-xl">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Naam dhoondhein"
          className="min-h-12 min-w-0 flex-1 rounded-2xl border border-line bg-white px-4 text-lg" />
        <Btn tone="soft" onClick={() => setAdding(true)}>＋ Naya</Btn>
      </div>
      <div className="grid gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
      {rows.map(({ c, bal, b }) => (
        <button key={c.id} onClick={() => setOpenId(c.id)}
          className="flex items-center justify-between rounded-2xl border border-line bg-white/70 p-3 text-left active:bg-cream-2">
          <div>
            <div className="text-xl font-bold">{c.name}</div>
            <div className="mt-0.5 flex items-center gap-2 text-sm text-chai-soft">
              <ScoreBadge b={b} />
              {b.oldestUnpaidDays > 0 && <span>{b.oldestUnpaidDays} din purana</span>}
              {!c.phone && <span>· 📵 phone nahi</span>}
            </div>
          </div>
          <div className={`text-2xl font-extrabold ${bal > 0 ? "text-mirchi" : "text-patti"}`}>{bal > 0 ? rupees(bal) : "✓"}</div>
        </button>
      ))}
      </div>
      {open && <CustomerSheet c={open} onClose={() => setOpenId(null)} />}
      {adding && (
        <AddCustomer
          onClose={() => setAdding(false)}
          onSave={(name, phone) => {
            commit([{ table: "customers", row: {
              id: uuid(), name, aliases: [], phone: phone || null, credit_limit_paise: null,
              view_token: uuid(), created_at: new Date().toISOString(),
            } }]);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

function AddCustomer({ onClose, onSave }: { onClose: () => void; onSave: (name: string, phone: string) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  return (
    <Sheet title="Naya customer" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Naam"
          className="min-h-12 rounded-2xl border border-line bg-white px-4 text-lg" />
        <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Mobile (10 ank)"
          inputMode="numeric" className="min-h-12 rounded-2xl border border-line bg-white px-4 text-lg" />
        <Btn onClick={() => name.trim() && onSave(name.trim(), phone)} disabled={!name.trim()}>Save</Btn>
      </div>
    </Sheet>
  );
}

function CustomerSheet({ c, onClose }: { c: Customer; onClose: () => void }) {
  const { data, commit } = useStore();
  const [phone, setPhone] = useState(c.phone ?? "");
  const [showQr, setShowQr] = useState(false);
  const bal = balancePaise(c.id, data.transactions);
  const b = bharosaScore(c, data.transactions);
  const history = data.transactions.filter((t) => t.customer_id === c.id).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const upi = upiLink(data.shop.upi_vpa, data.shop.name, bal, `Udhaar ${c.name}`);

  return (
    <Sheet title={c.name} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Card className="flex items-center justify-between">
          <div>
            <div className="text-sm text-chai-soft">Baaki</div>
            <div className={`text-4xl font-extrabold ${bal > 0 ? "text-mirchi" : "text-patti"}`}>{rupees(Math.max(0, bal))}</div>
          </div>
          <div className="text-right">
            <ScoreBadge b={b} />
            <div className="mt-1 text-sm font-bold">{b.label}</div>
          </div>
        </Card>
        {b.reasons.length > 0 && (
          <ul className="list-inside list-disc text-chai-soft">{b.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
        )}

        <div className="flex gap-2">
          <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="Mobile number" inputMode="numeric" className="min-h-12 min-w-0 flex-1 rounded-2xl border border-line bg-white px-4 text-lg" />
          <Btn tone="soft" disabled={phone === (c.phone ?? "")}
            onClick={() => commit([{ table: "customers", row: { ...c, phone: phone || null } }])}>Save</Btn>
        </div>

        {bal > 0 && (
          <div className="grid grid-cols-2 gap-2">
            <Btn tone="kesar" onClick={() => setShowQr((s) => !s)}>💰 Paise maango</Btn>
            <Btn tone="patti" href={waLink(c.phone, reminderText(data.shop, c, bal))}>💬 WhatsApp</Btn>
          </div>
        )}
        {showQr && bal > 0 && (
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-white p-4">
            <Qr text={upi} />
            <p className="text-center text-sm text-chai-soft">Customer scan kare → GPay / PhonePe mein {rupees(bal)} pehle se bhara hoga</p>
            <a href={upi} className="text-sm font-bold">Is phone par UPI app kholein</a>
          </div>
        )}

        <h3 className="mt-2 text-lg font-bold text-chai">Poora hisaab</h3>
        <div className="flex flex-col gap-2">
          {history.map((t) => (
            <div key={t.id} className={`rounded-xl border border-line bg-white/70 p-3 ${t.voided ? "opacity-50" : ""}`}>
              <div className="flex items-center justify-between">
                <span className={`text-lg font-bold ${t.voided ? "line-through" : ""} ${t.type === "credit" ? "text-mirchi" : "text-patti"}`}>
                  {t.type === "credit" ? "+ Udhaar" : "− Payment"} {rupees(t.amount_paise)}
                </span>
                <span className="text-sm text-chai-soft">{new Date(t.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
              </div>
              {(t.note || t.transcript) && <div className="text-sm text-chai-soft">{t.note}{t.transcript ? ` · 🎙️ “${t.transcript}”` : ""}</div>}
              <div className="text-sm">
                {t.voided && <span className="text-chai-soft">Hata di gayi · </span>}
                {t.disputed && <span className="font-bold text-mirchi">⚠️ Customer ne galat bataya</span>}
                {!t.voided && !t.disputed && <span className="text-chai-soft">{timeAgo(t.created_at)}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
