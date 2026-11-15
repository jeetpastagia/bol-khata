import { Btn, Card } from "../components/ui";
import { waLink } from "../lib/links";
import { supplierOrderText } from "../lib/messages";
import { dateFor } from "../lib/plan";
import { useStore, uuid } from "../lib/store";
import type { OrderItem, Supplier } from "../lib/types";

export default function Orders() {
  const { data, commit } = useStore();
  const pending = data.orders.filter((o) => o.status === "pending");
  const sent = data.orders.filter((o) => o.status === "sent").sort((a, b) => b.created_at.localeCompare(a.created_at));

  const supplierOf = (o: OrderItem): Supplier | null => {
    const item = data.items.find((i) => i.id === o.item_id);
    return data.suppliers.find((s) => s.id === item?.supplier_id) ?? null;
  };
  const groups = new Map<string, { supplier: Supplier | null; items: OrderItem[] }>();
  for (const o of pending) {
    const s = supplierOf(o);
    const key = s?.id ?? "none";
    if (!groups.has(key)) groups.set(key, { supplier: s, items: [] });
    groups.get(key)!.items.push(o);
  }

  const lastSentDate = sent[0]?.for_date;
  const repeatLast = () => {
    if (!lastSentDate) return;
    const now = new Date().toISOString();
    commit(sent.filter((o) => o.for_date === lastSentDate).map((o) => ({
      table: "order_items" as const,
      row: { ...o, id: uuid(), status: "pending", for_date: dateFor("tomorrow"), created_at: now, transcript: "Pichla order dobara" },
    })));
  };

  return (
    <div className="@container flex flex-col gap-3">
      <div className="grid gap-3 @2xl:grid-cols-2 @5xl:grid-cols-3">
      {groups.size === 0 && (
        <Card>
          <p className="text-lg">Koi order baaki nahi.</p>
          <p className="text-chai-soft">Bolo: “Kal subah 20 packet doodh aur 2 kilo cheeni mangwana”</p>
        </Card>
      )}
      {[...groups.values()].map(({ supplier, items }) => (
        <Card key={supplier?.id ?? "none"}>
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-chai">🚚 {supplier?.name ?? "Supplier chuna nahi"}</h3>
            <span className="text-sm text-chai-soft">{items[0].for_date === dateFor("today") ? "Aaj" : "Kal"}</span>
          </div>
          <ul className="my-2 text-lg">
            {items.map((i) => (
              <li key={i.id} className="flex items-center justify-between border-b border-line py-1.5 last:border-0">
                <span>• {i.item_name} — <b>{i.qty} {i.unit ?? ""}</b></span>
                <button className="px-2 text-chai-soft" aria-label="Hatao"
                  onClick={() => commit([{ table: "order_items", row: { ...i, status: "sent", transcript: "cancelled" } }])}>✕</button>
              </li>
            ))}
          </ul>
          <Btn tone="patti" className="w-full" href={waLink(supplier?.phone, supplierOrderText(data.shop, supplier, items))}
            onClick={() => commit(items.map((i) => ({ table: "order_items" as const, row: { ...i, status: "sent" } })))}>
            📲 WhatsApp par bhejo
          </Btn>
        </Card>
      ))}
      </div>

      {lastSentDate && <Btn tone="soft" className="@2xl:self-start" onClick={repeatLast}>🔁 Pichla order kal ke liye dobara</Btn>}

      {sent.length > 0 && (
        <div className="@2xl:max-w-xl">
          <h3 className="mb-2 text-lg font-bold text-chai">Bheje gaye</h3>
          {sent.slice(0, 10).map((o) => (
            <div key={o.id} className="flex justify-between border-b border-line py-1.5 text-chai-soft">
              <span>✓ {o.item_name} — {o.qty} {o.unit ?? ""}</span><span>{o.for_date}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
