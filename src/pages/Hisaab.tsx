import { Card, ScoreBadge } from "../components/ui";
import { balancePaise, bharosaScore, rupees, todaySummary, weekSeries } from "../lib/ledger";
import { waLink } from "../lib/links";
import { reminderText } from "../lib/messages";
import { useStore } from "../lib/store";

export default function Hisaab() {
  const { data } = useStore();
  const rows = data.customers
    .map((c) => ({ c, bal: balancePaise(c.id, data.transactions), b: bharosaScore(c, data.transactions) }))
    .sort((a, b) => b.bal - a.bal);
  const total = rows.reduce((s, r) => s + Math.max(0, r.bal), 0);
  const today = todaySummary(data.transactions);
  const week = weekSeries(data.transactions);
  const max = Math.max(1, ...week.flatMap((d) => [d.credit, d.collected]));
  const risky = rows.filter((r) => r.b.level === "red" && r.bal > 0).length;

  return (
    <div className="@container flex flex-col gap-3">
      <div className="grid gap-3 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="flex flex-col gap-3">
      <Card className="bg-chai text-cream">
        <div className="text-cream/80">Bazaar mein baaki</div>
        <div className="text-5xl font-extrabold text-haldi">{rupees(total)}</div>
        <div className="mt-1 text-cream/80">{rows.filter((r) => r.bal > 0).length} logon ka · {risky} 🔴 dhyan dene layak</div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card><div className="text-chai-soft">Aaj udhaar diya</div><div className="text-3xl font-extrabold text-mirchi">{rupees(today.credit)}</div></Card>
        <Card><div className="text-chai-soft">Aaj wapas aaya</div><div className="text-3xl font-extrabold text-patti">{rupees(today.collected)}</div></Card>
      </div>
      </div>

      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-lg font-bold text-chai">Pichle 7 din</h3>
          <div className="flex gap-3 text-sm">
            <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-sm bg-mirchi" /> Udhaar</span>
            <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-sm bg-patti" /> Wapas</span>
          </div>
        </div>
        <div className="flex h-36 items-end justify-between gap-2">
          {week.map((d) => (
            <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-28 w-full items-end justify-center gap-0.5">
                <div className="w-1/2 rounded-t bg-mirchi" style={{ height: `${(d.credit / max) * 100}%` }} title={`Udhaar ${rupees(d.credit)}`} />
                <div className="w-1/2 rounded-t bg-patti" style={{ height: `${(d.collected / max) * 100}%` }} title={`Wapas ${rupees(d.collected)}`} />
              </div>
              <span className="text-xs text-chai-soft">{d.label}</span>
            </div>
          ))}
        </div>
      </Card>
      </div>

      <h3 className="text-lg font-bold text-chai">Sabse zyada baaki</h3>
      <div className="grid gap-3 @xl:grid-cols-2 @5xl:grid-cols-3">
      {rows.filter((r) => r.bal > 0).slice(0, 6).map(({ c, bal, b }) => (
        <div key={c.id} className="flex items-center justify-between rounded-2xl border border-line bg-white/70 p-3">
          <div>
            <div className="text-lg font-bold">{c.name} <ScoreBadge b={b} /></div>
            <div className="text-xl font-extrabold text-mirchi">{rupees(bal)}</div>
          </div>
          <a href={waLink(c.phone, reminderText(data.shop, c, bal))} target="_blank" rel="noreferrer"
            className="rounded-2xl bg-patti px-4 py-3 font-bold text-white no-underline">💬 Yaad dilao</a>
        </div>
      ))}
      </div>
    </div>
  );
}
