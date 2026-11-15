import { useEffect, useState, type ReactNode } from "react";
import { Btn, Card } from "../components/ui";
import { rupees } from "../lib/ledger";
import { useStore } from "../lib/store";
import {
  LANG_LABEL, PHRASES, hasVoice, loadVoiceSettings, needsCloudVoice, pickVoice, saveVoiceSettings, speakSay,
  type Gender, type Lang, type ReplyLang, type VoiceSettings,
} from "../lib/voice";

export default function Settings() {
  const { data, commit } = useStore();
  const [shop, setShop] = useState(data.shop);
  useEffect(() => setShop(data.shop), [data.shop]);
  const changed = JSON.stringify(shop) !== JSON.stringify(data.shop);

  return (
    <div className="grid items-start gap-3 lg:max-w-5xl lg:grid-cols-2">
      <VoiceCard />

      <Card className="flex flex-col gap-3">
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
      <p className="text-center text-sm text-chai-soft lg:col-span-2">Bol Khata · bolo, aur likh gaya 🎙️</p>
    </div>
  );
}

function Choice<T extends string>({ value, options, onChange }: {
  value: T; options: { id: T; label: ReactNode }[]; onChange: (v: T) => void;
}) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(options.length, 2)}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)} aria-pressed={value === o.id}
          className={`min-h-12 rounded-2xl border-2 px-3 py-2 text-left text-base font-bold transition ${value === o.id ? "border-kesar bg-kesar text-white" : "border-line bg-white text-chai"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Voice reply preferences: on/off, female/male voice, mic language, reply language (default: same as spoken). */
function VoiceCard() {
  const [v, setV] = useState<VoiceSettings>(loadVoiceSettings);
  const [, refresh] = useState(0);
  useEffect(() => {
    // Voice lists arrive late in Chrome; re-render when they do so the hints are correct.
    const synth = window.speechSynthesis;
    if (!synth) return;
    const on = () => refresh((n) => n + 1);
    synth.addEventListener?.("voiceschanged", on);
    return () => synth.removeEventListener?.("voiceschanged", on);
  }, []);

  const update = (patch: Partial<VoiceSettings>) => {
    const next = { ...v, ...patch };
    setV(next);
    saveVoiceSettings(next);
  };
  const testLang: Lang = v.replyLang === "auto" ? v.inputLang : v.replyLang;
  const test = (s = v) => speakSay(PHRASES.test, s.replyLang === "auto" ? s.inputLang : s.replyLang, { ...s, enabled: true });
  const realVoice = hasVoice(testLang) ? pickVoice(testLang, v.gender) : null;

  return (
    <Card className="flex flex-col gap-4 lg:row-span-2">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-bold text-chai">Awaaz mein jawab</h3>
        <button type="button" onClick={() => update({ enabled: !v.enabled })} role="switch" aria-checked={v.enabled}
          className={`relative h-8 w-14 rounded-full transition ${v.enabled ? "bg-patti" : "bg-line"}`} aria-label="Awaaz mein jawab chalu / band">
          <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${v.enabled ? "left-7" : "left-1"}`} />
        </button>
      </div>

      <div className={`flex flex-col gap-4 ${v.enabled ? "" : "pointer-events-none opacity-50"}`}>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-bold text-chai-soft">Awaaz</span>
          <Choice<Gender> value={v.gender} onChange={(g) => { update({ gender: g }); test({ ...v, gender: g }); }}
            options={[{ id: "female", label: "👩 Mahila (Female)" }, { id: "male", label: "👨 Purush (Male)" }]} />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-bold text-chai-soft">Jawab kis bhasha mein?</span>
          <Choice<ReplyLang> value={v.replyLang} onChange={(l) => update({ replyLang: l })}
            options={[
              { id: "auto", label: "✨ Jis bhasha mein bola" },
              { id: "hi", label: "हिन्दी" },
              { id: "en", label: "English" },
              { id: "gu", label: "ગુજરાતી" },
            ]} />
          <span className="text-sm text-chai-soft">Default: aap jis bhasha mein bolenge, jawab usi bhasha mein aayega.</span>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-bold text-chai-soft">Mic kis bhasha mein sune?</span>
          <Choice<Lang> value={v.inputLang} onChange={(l) => update({ inputLang: l })}
            options={(["hi", "en", "gu"] as Lang[]).map((l) => ({ id: l, label: LANG_LABEL[l] }))} />
        </div>

        <Btn tone="soft" onClick={() => test()}>▶ Awaaz sunein</Btn>
        <p className="text-sm text-chai-soft">
          {needsCloudVoice(testLang, v.gender)
            ? `Is device mein ${LANG_LABEL[testLang]}${v.gender === "male" ? " male" : ""} awaaz nahi hai, isliye internet se natural awaaz aayegi (pehli baar 2–4 second lag sakte hain).`
            : `Awaaz: ${realVoice?.voice?.name ?? "phone ki default"}`}
        </p>
      </div>
    </Card>
  );
}

export function statusText(s: string) {
  return ({ synced: "✅ Sab save", pending: "⏳ Bhej raha hai", offline: "📴 Offline (baad mein sync hoga)", local: "Local mode", syncing: "⏳ Sync ho raha hai", error: "⚠️ Sync nahi hua, dobara koshish hogi" } as Record<string, string>)[s] ?? s;
}
