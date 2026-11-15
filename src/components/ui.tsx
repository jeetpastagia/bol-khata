import { useEffect, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import type { Bharosa } from "../lib/ledger";

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/50 sm:items-center" onClick={onClose}>
      <div
        className="rise max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-cream p-5 pb-8 shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-2xl font-extrabold text-chai">{title}</h2>
          <button onClick={onClose} className="rounded-full bg-cream-2 px-4 py-2 text-lg font-bold text-chai" aria-label="Band karo">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ScoreBadge({ b }: { b: Bharosa }) {
  const cls = b.level === "green" ? "bg-patti-soft text-patti" : b.level === "amber" ? "bg-amber-soft text-amber" : "bg-mirchi-soft text-mirchi";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-bold ${cls}`} title={b.reasons.join(", ")}>
      {b.level === "green" ? "🟢" : b.level === "amber" ? "🟡" : "🔴"} {b.score}
    </span>
  );
}

export function Qr({ text, size = 220 }: { text: string; size?: number }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    QRCode.toDataURL(text, { width: size, margin: 1, color: { dark: "#2b1a10", light: "#ffffff" } })
      .then(setSrc)
      .catch(() => setSrc(""));
  }, [text, size]);
  return src ? <img src={src} width={size} height={size} alt="UPI QR code" className="rounded-xl border-4 border-white shadow" /> : null;
}

export function Btn({
  children, onClick, href, tone = "kesar", className = "", disabled,
}: {
  children: ReactNode; onClick?: () => void; href?: string; tone?: "kesar" | "patti" | "mirchi" | "soft";
  className?: string; disabled?: boolean;
}) {
  const tones = {
    kesar: "bg-kesar text-white active:bg-kesar-dark",
    patti: "bg-patti text-white active:brightness-90",
    mirchi: "bg-mirchi text-white active:brightness-90",
    soft: "bg-cream-2 text-chai active:brightness-95",
  };
  const cls = `inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-lg font-bold no-underline shadow-sm transition disabled:opacity-40 ${tones[tone]} ${className}`;
  if (href) return <a href={href} target="_blank" rel="noreferrer" className={cls} onClick={onClick}>{children}</a>;
  return <button type="button" className={cls} onClick={onClick} disabled={disabled}>{children}</button>;
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-line bg-white/70 p-4 ${className}`}>{children}</div>;
}

export function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 1) return "abhi";
  if (mins < 60) return `${mins} min pehle`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} ghante pehle`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "kal" : `${days} din pehle`;
}
