import { describe, expect, it } from "vitest";
import { normalize, readNumber, transliterate } from "../src/lib/hindi";
import { parseRules } from "../src/lib/parseRules";
import { bharosaScore, balancePaise } from "../src/lib/ledger";
import { buildPlan } from "../src/lib/plan";
import { seedData } from "../src/lib/seed";
import { matchCustomer } from "../src/lib/match";
import { upiLink } from "../src/lib/links";

const data = seedData();
const items = data.items;
const num = (s: string) => readNumber(normalize(s).split(" "))?.value;

describe("Hindi numbers", () => {
  it.each([
    ["chaalis", 40], ["40", 40], ["dedh sau", 150], ["dhai sau", 250], ["saade teen sau", 350],
    ["do sau pachaas", 250], ["ek hazaar", 1000], ["डेढ़ सौ", 150], ["चालीस", 40], ["सौ", 100], ["४०", 40],
  ])("%s = %d", (s, n) => expect(num(s)).toBe(n));
});

describe("Transliteration", () => {
  it.each([["रमेश", "ramesh"], ["मोहन", "mohan"], ["पप्पू", "pappu"], ["उधार", "udhar"], ["दूध", "dudh"]])(
    "%s -> %s", (dev, rom) => expect(normalize(dev)).toBe(rom));
  it("keeps roman text", () => expect(transliterate("Ramesh 40")).toBe("Ramesh 40"));
});

describe("Rule parser (Section 5 examples)", () => {
  it("credit", () => {
    const [a] = parseRules("Ramesh ka 40 rupaye udhaar likho", items);
    expect(a).toMatchObject({ type: "credit", customer: "Ramesh", amount_rupees: 40 });
  });
  it("payment", () => {
    const [a] = parseRules("Suresh ne 100 de diye", items);
    expect(a).toMatchObject({ type: "payment", customer: "Suresh", amount_rupees: 100 });
  });
  it("two credits in one sentence", () => {
    const r = parseRules("Ramesh ka 40 aur Pappu ka 20 likho", items);
    expect(r).toHaveLength(2);
    expect(r[1]).toMatchObject({ type: "credit", customer: "Pappu", amount_rupees: 20 });
  });
  it("item math from price list", () => {
    const [a] = parseRules("Do chai aur ek bun Mohan ke khaate mein", items);
    expect(a).toMatchObject({ type: "credit", customer: "Mohan", amount_rupees: 35 });
  });
  it("balance query", () => {
    expect(parseRules("Ramesh ka kitna baaki hai?", items)[0]).toMatchObject({ type: "query_balance", customer: "Ramesh" });
  });
  it("orders", () => {
    const r = parseRules("Kal subah 20 packet doodh aur 2 kilo cheeni mangwana", items);
    expect(r.map((x) => [x.type, x.item, x.qty, x.unit])).toEqual([["order", "Doodh", 20, "packet"], ["order", "Cheeni", 2, "kg"]]);
  });
  it("undo", () => expect(parseRules("Nahi, galat hai", items)[0].type).toBe("undo_last"));
  it("summary", () => expect(parseRules("Aaj ka hisaab batao", items)[0].type).toBe("daily_summary"));
  it("devanagari credit", () => {
    expect(parseRules("रमेश का डेढ़ सौ उधार", items)[0]).toMatchObject({ type: "credit", amount_rupees: 150 });
  });
  it("missing amount asks", () => expect(parseRules("Ramesh ka likho", items)[0].type).toBe("clarify"));
  it("reminders", () => expect(parseRules("Sabko reminder bhejo", items)[0].type).toBe("send_reminders"));
});

describe("Matching, ledger, score", () => {
  it("fuzzy names", () => {
    expect(matchCustomer("Rames", data.customers)?.name).toBe("Ramesh");
    expect(matchCustomer("रमेश", data.customers)?.name).toBe("Ramesh");
    expect(matchCustomer("Ramesh bhai", data.customers)?.name).toBe("Ramesh");
    expect(matchCustomer("Xyzabc", data.customers)).toBeNull();
  });
  it("Suresh is risky, Sunita is trusted", () => {
    const s = data.customers.find((c) => c.name === "Suresh")!;
    const d = data.customers.find((c) => c.name === "Sunita Didi")!;
    expect(bharosaScore(s, data.transactions).level).toBe("red");
    expect(bharosaScore(d, data.transactions).level).not.toBe("red");
  });
  it("plan adds running balances and flags big amounts", () => {
    const ramesh = data.customers.find((c) => c.name === "Ramesh")!;
    const before = balancePaise(ramesh.id, data.transactions);
    const plan = buildPlan(parseRules("Ramesh ka 40 aur Ramesh ka 20", items), data);
    const last = plan.steps[1];
    expect(last.kind === "money" && last.newBalance).toBe(before + 6000);
    expect(buildPlan(parseRules("Ramesh ka 40000 likho", items), data).needsExplicitYes).toBe(true);
  });
  it("UPI link", () => {
    expect(upiLink("raju@okaxis", "Raju Chai", 16000, "Udhaar")).toBe("upi://pay?pa=raju%40okaxis&pn=Raju%20Chai&am=160.00&cu=INR&tn=Udhaar");
  });
});

describe("Voice reply language", async () => {
  const { detectLang } = await import("../src/lib/voice");
  it.each([
    ["Ramesh ka 40 likho", "hi"], ["रमेश का चालीस", "hi"], ["રમેશના 40 લખો", "gu"],
    ["Write 40 rupees for Ramesh", "en"], ["How much does Suresh owe", "en"],
  ])("%s -> %s", (t, l) => expect(detectLang(t)).toBe(l));
});
