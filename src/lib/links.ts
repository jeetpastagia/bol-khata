// UPI payment links and WhatsApp click-to-chat links.
// The UPI link is a normal "pay" request the customer approves in their own UPI app.
// Bol Khata never sends "collect" requests and never moves money itself.

export function upiLink(vpa: string, shopName: string, paise: number, note: string): string {
  const p = new URLSearchParams({
    pa: vpa,
    pn: shopName,
    am: (paise / 100).toFixed(2),
    cu: "INR",
    tn: note.slice(0, 50),
  });
  return `upi://pay?${p.toString().replace(/\+/g, "%20")}`;
}

/** Indian 10-digit numbers get the 91 country code. Empty phone opens WhatsApp's contact picker. */
export function waLink(phone: string | null | undefined, text: string): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  const full = digits.length === 10 ? "91" + digits : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}

export function appOrigin(): string {
  return typeof window !== "undefined" ? window.location.origin : "";
}
