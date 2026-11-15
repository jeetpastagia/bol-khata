import { useCallback, useEffect, useRef, useState } from "react";
import { Btn, Card, Qr, ScoreBadge, timeAgo } from "../components/ui";
import { balancePaise, rupees } from "../lib/ledger";
import { waLink, upiLink } from "../lib/links";
import { pakkaHisaabText, reminderText } from "../lib/messages";
import { parseRules } from "../lib/parseRules";
import { buildPlan, dateFor, planReply, planToOps, type Plan } from "../lib/plan";
import { listen, listenLoop, speechSupported, stopSpeaking, type Listener } from "../lib/speech";
import { afterWakeWord, yesOrNo } from "../lib/wake";
import { BCP47, PHRASES, isAppSpeaking, loadVoiceSettings, replyLangFor, speakSay, type Lang } from "../lib/voice";
import { useStore } from "../lib/store";
import type { ParsedAction, Txn } from "../lib/types";

type Phase =
  | { name: "idle" }
  | { name: "listening"; partial: string }
  | { name: "thinking"; transcript: string }
  | { name: "confirm"; transcript: string; plan: Plan; display: string; source: string }
  | { name: "done"; display: string; txnIds: string[]; reminderMin?: number; isError?: boolean };

const AUTO_CONFIRM_MS = 4000;

const EXAMPLES = [
  "Ramesh ka 40 rupaye udhaar likho",
  "Suresh ne 100 de diye",
  "Do chai aur ek bun Mohan ke khaate mein",
  "Kal subah 20 packet doodh aur 2 kilo cheeni mangwana",
  "Ramesh ka kitna baaki hai?",
  "Aaj ka hisaab batao",
];

async function parseOnline(transcript: string, data: ReturnType<typeof useStore>["data"]) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch("/api/parse", {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript,
        customers: data.customers.map((c) => c.name),
        items: data.items.map((i) => ({ name: i.name, aliases: i.aliases, price_paise: i.price_paise, unit: i.unit })),
      }),
    });
    if (!r.ok) throw new Error(String(r.status));
    return (await r.json()) as { actions: ParsedAction[]; source: string };
  } finally {
    clearTimeout(t);
  }
}

export default function Bolo() {
  const { data, commit } = useStore();
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [typed, setTyped] = useState("");
  const [qrFor, setQrFor] = useState<string | null>(null);
  const listener = useRef<Listener | null>(null);
  const autoTimer = useRef<number | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;
  const [handsFree, setHandsFree] = useState<boolean>(() => {
    try { return localStorage.getItem("bolkhata.handsfree") === "1"; } catch { return false; }
  });
  const awaitingRef = useRef(false);     // wake word heard, waiting for the command
  const awaitTimer = useRef<number | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const langRef = useRef<Lang>(loadVoiceSettings().replyLang === "auto" ? loadVoiceSettings().inputLang : (loadVoiceSettings().replyLang as Lang));

  const clearAuto = () => {
    if (autoTimer.current) window.clearTimeout(autoTimer.current);
    autoTimer.current = null;
  };

  const undoLast = useCallback(() => {
    const last = [...dataRef.current.transactions]
      .filter((t) => !t.voided)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (!last) {
      setPhase({ name: "done", display: "Hatane ke liye koi entry nahi hai.", txnIds: [] });
      return;
    }
    commit([{ table: "transactions", row: { ...last, voided: true } }]);
    const c = dataRef.current.customers.find((x) => x.id === last.customer_id);
    speakSay(PHRASES.undone, langRef.current);
    setPhase({ name: "done", display: `Pichli entry hata di: ${c?.name ?? ""} ${rupees(last.amount_paise)}. (History mein kati hui dikhegi)`, txnIds: [] });
  }, [commit]);

  const confirm = useCallback((p: Extract<Phase, { name: "confirm" }>) => {
    clearAuto();
    const { ops, txnIds } = planToOps(p.plan, p.transcript);
    commit(ops);
    speakSay(PHRASES.saved, langRef.current);
    setPhase({ name: "done", display: "✅ Save ho gaya. " + p.display, txnIds });
  }, [commit]);

  const handleTranscript = useCallback(async (raw: string) => {
    const transcript = raw.trim();
    if (!transcript) { setPhase({ name: "idle" }); return; }
    setPhase({ name: "thinking", transcript });
    langRef.current = replyLangFor(transcript);
    const d = dataRef.current;
    let actions: ParsedAction[];
    let source = "offline";
    try {
      if (!navigator.onLine) throw new Error("offline");
      const r = await parseOnline(transcript, d);
      actions = r.actions;
      source = r.source;
    } catch {
      actions = parseRules(transcript, d.items);
      source = "offline";
    }
    const plan = buildPlan(actions, d);
    if (plan.instant) {
      const ins = plan.instant;
      if (ins.kind === "undo") return undoLast();
      if (ins.kind === "say") {
        speakSay(ins.speech, langRef.current);
        setPhase({ name: "done", display: ins.display, txnIds: [] });
        return;
      }
      speakSay(PHRASES.reminders, langRef.current);
      setPhase({ name: "done", display: `${rupees(ins.minPaise)} se zyada baaki walon ko reminder bhejiye:`, txnIds: [], reminderMin: ins.minPaise });
      return;
    }
    const reply = planReply(plan);
    speakSay(reply.speech, langRef.current);
    const next: Extract<Phase, { name: "confirm" }> = { name: "confirm", transcript, plan, display: reply.display, source };
    setPhase(next);
    clearAuto();
    if (!plan.needsExplicitYes) autoTimer.current = window.setTimeout(() => confirm(next), AUTO_CONFIRM_MS + 1500);
  }, [confirm, undoLast]);

  const startListening = useCallback(() => {
    stopSpeaking();
    clearAuto();
    if (!speechSupported()) {
      setPhase({ name: "done", display: "Is browser mein awaaz support nahi hai. Chrome kholiye ya neeche likhiye.", txnIds: [], isError: true });
      return;
    }
    setPhase({ name: "listening", partial: "" });
    listener.current = listen({
      lang: BCP47[loadVoiceSettings().inputLang],
      onPartial: (partial) => setPhase({ name: "listening", partial }),
      onFinal: (text) => { listener.current = null; void handleTranscript(text); },
      onError: (code) => {
        listener.current = null;
        const msg = code === "not-allowed" ? "Mic ki permission dijiye (address bar mein 🔒 dabayein)." : "Awaaz saaf nahi aayi, phir se boliye.";
        setPhase({ name: "done", display: msg, txnIds: [], isError: true });
      },
    });
  }, [handleTranscript]);

  const toggleMic = useCallback(() => {
    if (handsFreeRef.current) {
      // Hands-free on: tap = same as saying "Bol Khata"; tap "Bas" again = finish now with what was heard
      if (awaitingRef.current) {
        const ph = phaseRef.current;
        stopAwaiting();
        const heard = ph.name === "listening" ? ph.partial.trim() : "";
        if (heard) void handleRef.current(heard); else setPhase({ name: "idle" });
        return;
      }
      wakeNowRef.current();
      return;
    }
    if (listener.current) { listener.current.stop(); return; }
    startListening();
  }, [startListening]);

  // ---------- Hands-free mode: say "Bol Khata" to wake the mic ----------
  const handsFreeRef = useRef(handsFree);
  handsFreeRef.current = handsFree;
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;
  const handleRef = useRef(handleTranscript);
  handleRef.current = handleTranscript;

  const stopAwaiting = () => {
    awaitingRef.current = false;
    if (awaitTimer.current) window.clearTimeout(awaitTimer.current);
    awaitTimer.current = null;
  };
  const wakeNowRef = useRef(() => {});
  wakeNowRef.current = () => {
    clearAuto();
    awaitingRef.current = true;
    speakSay(PHRASES.wake, langRef.current);
    setPhase({ name: "listening", partial: "" });
    if (awaitTimer.current) window.clearTimeout(awaitTimer.current);
    // Nothing said within 10 s: go back to waiting for the wake word
    awaitTimer.current = window.setTimeout(() => {
      stopAwaiting();
      if (phaseRef.current.name === "listening") setPhase({ name: "idle" });
    }, 10000);
  };

  useEffect(() => {
    try { localStorage.setItem("bolkhata.handsfree", handsFree ? "1" : "0"); } catch { /* ignore */ }
    if (!handsFree) return;
    if (!speechSupported()) {
      setHandsFree(false);
      setPhase({ name: "done", display: "Is browser mein awaaz support nahi hai. Chrome kholiye.", txnIds: [], isError: true });
      return;
    }
    listener.current?.stop();
    listener.current = null;

    // Keep the screen on while waiting for "Bol Khata"
    let lock: { release: () => Promise<void> } | null = null;
    const wl = (navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock;
    const getLock = () => wl?.request("screen").then((l) => { lock = l; }).catch(() => {});
    void getLock();
    const onVis = () => { if (document.visibilityState === "visible") void getLock(); };
    document.addEventListener("visibilitychange", onVis);

    const loop = listenLoop({
      lang: BCP47[loadVoiceSettings().inputLang],
      onPartial: (t) => {
        if (awaitingRef.current && !isAppSpeaking()) setPhase({ name: "listening", partial: t });
      },
      onFinal: (text) => {
        if (!text || isAppSpeaking()) return; // ignore our own voice
        const ph = phaseRef.current;
        if (ph.name === "confirm") {
          const yn = yesOrNo(afterWakeWord(text) ?? text);
          if (yn === "yes") { confirmRef.current(ph); return; }
          if (yn === "no") { clearAuto(); speakSay(PHRASES.cancelled, langRef.current); setPhase({ name: "idle" }); return; }
        }
        if (awaitingRef.current) {
          stopAwaiting();
          void handleRef.current(afterWakeWord(text) ?? text);
          return;
        }
        const rest = afterWakeWord(text);
        if (rest === null) return; // no wake word: ignore normal shop talk
        if (rest.split(/\s+/).filter(Boolean).length >= 2) void handleRef.current(rest); // "Bol Khata, Ramesh ka 40 likho"
        else wakeNowRef.current();
      },
      onError: () => {
        setHandsFree(false);
        setPhase({ name: "done", display: "Mic ki permission dijiye (address bar mein 🔒 dabayein).", txnIds: [], isError: true });
      },
    });
    return () => {
      loop?.stop();
      stopAwaiting();
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release().catch(() => {});
    };
  }, [handsFree]);

  // Space bar = mic button (also works with many Bluetooth earphone/clicker buttons mapped to keys)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.code === "Space" && tag !== "INPUT" && tag !== "TEXTAREA" && !e.repeat) {
        e.preventDefault();
        toggleMic();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleMic]);

  useEffect(() => () => { clearAuto(); listener.current?.stop(); stopAwaiting(); }, []);

  const recent = [...data.transactions].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);
  const listening = phase.name === "listening";
  const customerOf = (t: Txn) => data.customers.find((c) => c.id === t.customer_id);

  return (
    <div className="flex flex-col gap-4">
      {/* Big mic */}
      <div className="flex flex-col items-center gap-3 pt-2 lg:pt-6">
        <button
          onClick={toggleMic}
          className={`flex h-48 w-48 lg:h-56 lg:w-56 flex-col items-center justify-center rounded-full text-white shadow-xl transition active:scale-95 ${listening ? "mic-live bg-mirchi" : "bg-kesar"}`}
          aria-label={listening ? "Bolna band karo" : "Bolo"}
        >
          <span className="text-7xl leading-none">{listening ? "⏹" : "🎙️"}</span>
          <span className="mt-2 text-2xl font-extrabold">{listening ? "Bas" : "Bolo"}</span>
        </button>
        <p className="text-center text-chai-soft">
          {handsFree
            ? listening ? "Haan ji, boliye… (khatam ho to 'Bas' dabaiye)" : "“Bol Khata” boliye ya mic dabaiye"
            : listening ? "Sun raha hoon… bolke 'Bas' dabaiye" : "Dabaiye aur Hindi mein boliye"}
        </p>
        <button type="button" role="switch" aria-checked={handsFree} onClick={() => setHandsFree((h) => !h)}
          className={`flex w-full max-w-sm items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition ${handsFree ? "border-patti bg-patti-soft" : "border-line bg-white/70"}`}>
          <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${handsFree ? "bg-patti" : "bg-line"}`}>
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${handsFree ? "left-[1.4rem]" : "left-0.5"}`} />
          </span>
          <span className="flex flex-col">
            <span className="font-bold text-chai">Hands-free mode{handsFree && <span className="ml-2 inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-patti align-middle" />}</span>
            <span className="text-sm text-chai-soft">{handsFree ? "Sun raha hai… “Bol Khata” boliye ya mic dabaiye" : "“Bol Khata” bolo, mic apne aap khulega"}</span>
          </span>
        </button>
      </div>

      {/* Live / result panel */}
      {phase.name === "listening" && (
        <Card className="rise min-h-16 text-xl font-medium">{phase.partial || "…"}</Card>
      )}
      {phase.name === "thinking" && (
        <Card className="rise">
          <p className="text-lg">“{phase.transcript}”</p>
          <p className="mt-1 text-chai-soft">Samajh raha hoon… ⏳</p>
        </Card>
      )}
      {phase.name === "confirm" && (
        <Card className="rise border-2 border-kesar">
          <p className="text-sm text-chai-soft">“{phase.transcript}” · <span className="font-bold">{phase.source === "offline" || phase.source === "rules" ? "Offline samajh" : `AI: ${phase.source}`}</span></p>
          <div className="mt-3 flex flex-col gap-2">
            {phase.plan.steps.map((s, i) => s.kind === "money" ? (
              <div key={i} className={`rounded-xl p-3 ${s.type === "credit" ? "bg-mirchi-soft" : "bg-patti-soft"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-xl font-extrabold"><span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-kesar text-base text-white">{s.customer.name.charAt(0)}</span>{s.customer.name}{s.isNew && <span className="ml-2 rounded bg-haldi px-1.5 text-xs">NAYA</span>}</span>
                  <span className={`text-2xl font-extrabold ${s.type === "credit" ? "text-mirchi" : "text-patti"}`}>
                    {s.type === "credit" ? "+" : "−"}{rupees(s.amount_paise)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-sm text-chai-soft">
                  <span>{s.type === "credit" ? "Udhaar" : "Payment mila"}{s.note ? ` · ${s.note}` : ""}</span>
                  <span>Naya total: <b className="text-ink">{rupees(s.newBalance)}</b></span>
                </div>
                {s.bharosa && <div className="mt-1"><ScoreBadge b={s.bharosa} /> <span className="text-sm text-chai-soft">Bharosa score</span></div>}
                {s.warning && <p className="mt-2 rounded-lg bg-white/70 p-2 font-bold text-mirchi">⚠️ {s.warning}</p>}
              </div>
            ) : (
              <div key={i} className="rounded-xl bg-amber-soft p-3 text-lg">
                📦 <b>{s.qty} {s.unit ?? ""} {s.item_name}</b> · {s.for_date === dateFor("today") ? "aaj" : "kal"} ke liye
              </div>
            ))}
          </div>
          {!phase.plan.needsExplicitYes && (
            <div className="mt-3 h-1.5 overflow-hidden rounded bg-cream-2">
              <div className="countdown-bar h-full bg-kesar" style={{ animationDuration: `${AUTO_CONFIRM_MS + 1500}ms` }} />
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Btn tone="mirchi" onClick={() => { clearAuto(); stopSpeaking(); setPhase({ name: "idle" }); }}>❌ Nahi</Btn>
            <Btn tone="patti" onClick={() => confirm(phase)}>✅ Haan</Btn>
          </div>
          <p className="mt-2 text-center text-sm text-chai-soft">
            {phase.plan.needsExplicitYes ? "Badi rakam / chetavani — 'Haan' dabana zaroori hai" : "Kuch na karein to 5 second mein apne aap save"}
          </p>
        </Card>
      )}
      {phase.name === "done" && (
        <Card className={`rise ${phase.isError ? "border-mirchi" : ""}`}>
          <p className="text-lg font-medium">{phase.display}</p>
          {/* Pakka Hisaab: send the customer a confirmation of what was written */}
          {phase.txnIds.map((id) => {
            const t = data.transactions.find((x) => x.id === id);
            const c = t && customerOf(t);
            if (!t || !c) return null;
            const bal = balancePaise(c.id, data.transactions);
            return (
              <div key={id} className="mt-3 flex flex-wrap gap-2">
                <Btn tone="patti" href={waLink(c.phone, pakkaHisaabText(data.shop, c, t, bal))}>
                  💬 {c.name} ko Pakka Hisaab bhejo
                </Btn>
                {!c.phone && <span className="self-center text-sm text-chai-soft">(Khata mein phone number jodein)</span>}
              </div>
            );
          })}
          {phase.reminderMin !== undefined && (
            <ReminderList minPaise={phase.reminderMin} onQr={setQrFor} />
          )}
        </Card>
      )}

      {/* Type instead of speaking */}
      <form
        className="flex gap-2"
        onSubmit={(e) => { e.preventDefault(); const t = typed; setTyped(""); void handleTranscript(t); }}
      >
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Ya yahan likhiye… (Ramesh ka 40 likho)"
          className="min-h-12 min-w-0 flex-1 rounded-2xl border border-line bg-white px-4 text-lg"
        />
        <Btn tone="soft" onClick={() => { const t = typed; setTyped(""); void handleTranscript(t); }}>➤</Btn>
      </form>

      {phase.name === "idle" && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => void handleTranscript(ex)} className="rounded-full border border-line bg-white/70 px-3 py-1.5 text-sm text-chai">
              “{ex}”
            </button>
          ))}
        </div>
      )}

      {/* Recent entries with undo */}
      <div>
        <h3 className="mb-2 text-lg font-bold text-chai">Abhi ki entries</h3>
        <div className="flex flex-col gap-2">
          {recent.map((t) => {
            const c = customerOf(t);
            return (
              <div key={t.id} className={`flex items-center justify-between rounded-xl border border-line bg-white/70 px-3 py-2 ${t.voided ? "opacity-50" : ""}`}>
                <div className={t.voided ? "line-through" : ""}>
                  <div className="font-bold">{c?.name ?? "?"} <span className={t.type === "credit" ? "text-mirchi" : "text-patti"}>{t.type === "credit" ? "+" : "−"}{rupees(t.amount_paise)}</span></div>
                  <div className="text-sm text-chai-soft">{t.note ? `${t.note} · ` : ""}{timeAgo(t.created_at)}{t.disputed ? " · ⚠️ vivaad" : ""}</div>
                </div>
                {!t.voided && (
                  <button
                    className="rounded-xl bg-cream-2 px-3 py-2 font-bold text-chai"
                    onClick={() => { commit([{ table: "transactions", row: { ...t, voided: true } }]); speakSay(PHRASES.entryRemoved, langRef.current); }}
                    aria-label="Entry hatao"
                  >↶ Hatao</button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {qrFor && (() => {
        const c = data.customers.find((x) => x.id === qrFor);
        if (!c) return null;
        const bal = balancePaise(c.id, data.transactions);
        return (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/50" onClick={() => setQrFor(null)}>
            <div className="rise flex flex-col items-center gap-2 rounded-3xl bg-cream p-6" onClick={(e) => e.stopPropagation()}>
              <p className="text-xl font-bold">{c.name} · {rupees(bal)}</p>
              <Qr text={upiLink(data.shop.upi_vpa, data.shop.name, bal, `Udhaar ${c.name}`)} />
              <Btn tone="soft" onClick={() => setQrFor(null)}>Band karo</Btn>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function ReminderList({ minPaise, onQr }: { minPaise: number; onQr: (id: string) => void }) {
  const { data } = useStore();
  const due = data.customers
    .map((c) => ({ c, bal: balancePaise(c.id, data.transactions) }))
    .filter((x) => x.bal >= minPaise)
    .sort((a, b) => b.bal - a.bal);
  if (!due.length) return <p className="mt-2 text-chai-soft">Kisi ka itna udhaar baaki nahi hai. 🎉</p>;
  return (
    <div className="mt-3 flex flex-col gap-2">
      {due.map(({ c, bal }) => (
        <div key={c.id} className="flex items-center justify-between gap-2 rounded-xl bg-white/70 p-2">
          <span className="font-bold">{c.name} <span className="text-mirchi">{rupees(bal)}</span></span>
          <span className="flex gap-2">
            <button onClick={() => onQr(c.id)} className="rounded-xl bg-cream-2 px-3 py-2">QR</button>
            <a className="rounded-xl bg-patti px-3 py-2 font-bold text-white no-underline" target="_blank" rel="noreferrer"
               href={waLink(c.phone, reminderText(data.shop, c, bal))}>WhatsApp</a>
          </span>
        </div>
      ))}
    </div>
  );
}
