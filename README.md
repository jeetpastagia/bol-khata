# 🎙️ Bol Khata — बोल खाता

**"Bolo, aur likh gaya."** A voice-first credit (udhaar) ledger for chaiwalas, kirana shops and street vendors.
The shopkeeper presses one big button and speaks in Hindi or Hinglish. Bol Khata writes the entry, speaks it back for confirmation, sends a UPI payment reminder and the supplier order on WhatsApp. No typing needed.

> VibeX Codes Hackathon · Track 1: Helping Daily Workers, Small Shopkeepers (Chaiwalas) & Office Workers
> **Team Asur Coders** (see [Team](#team) below)

**Live app:** https://bol-khata-app-india.vercel.app · **Video:** _add link_

---

## What it does

| Say this | Bol Khata does |
|---|---|
| "Ramesh ka 40 rupaye udhaar likho" | Adds ₹40 credit to Ramesh, speaks back the new total |
| "Ramesh ka 40 aur Pappu ka 20" | Two entries from one sentence |
| "Do chai aur ek bun Mohan ke khaate mein" | Works out ₹35 from the shop's rate list (**item math**) |
| "Suresh ne 100 de diye" | Records a payment, reduces his balance |
| "Ramesh ka kitna baaki hai?" | Speaks the balance |
| "Kal subah 20 packet doodh aur 2 kilo cheeni mangwana" | Adds both to tomorrow's supplier order |
| "Nahi, galat hai" | Undoes the last entry (kept in history, struck through) |
| "Aaj ka hisaab batao" | Speaks today's summary |
| "Sabko reminder bhejo" | Lists everyone who owes money, with WhatsApp + UPI QR buttons |
| "**Bol Khata**, Ramesh ka 40 likho" | Hands-free mode: the wake word opens the mic, no touching the phone |

### Four features that make it different
1. **Pakka Hisaab (both sides confirm):** after each entry, one tap sends the customer a WhatsApp message with a link to their own khata page. They can press **"Galat hai"** on any wrong entry, and it shows up as disputed for the shopkeeper.
2. **Bharosa Score:** a 0–100 trust score for each customer, based on how fast they repay, how old their dues are, credit limit and disputes. A 🔴 customer triggers a spoken warning and needs an explicit "Haan" before more credit is saved.
3. **Hands-free and offline:** switch on **Hands-free mode** and just say **"Bol Khata"**; the app answers *"Haan ji, boliye"* and takes the command, and at the confirm step a spoken "haan" / "nahi" is enough. The mic button also works by tap in both modes. If the internet is off, a built-in Hindi rule parser still understands common sentences and entries sync later.
4. **Item math:** the shopkeeper says *what* was taken, not the total.

### Talks back in your language
Every reply is spoken. **Settings → Awaaz mein jawab:**
- **Female or male voice** (if the phone has only one voice, its pitch is adjusted).
- **Reply language:** by default the **same language the shopkeeper spoke** (Hindi/Hinglish, English or Gujarati), or fixed to one of them.
- **Mic language:** Hindi/Hinglish, English or Gujarati.

### Safety
- Money is stored as whole **paise** (₹40 = 4000), never decimals.
- The ledger is **append-only**: undo marks an entry as voided instead of deleting it. Every entry keeps the exact spoken sentence.
- ₹2,000+ entries and warnings need an explicit "Haan". Otherwise the entry saves automatically after 5 seconds, with a visible countdown.
- UPI links are normal **pay** requests that the customer approves in their own app. The app never sends "collect" requests and never moves money.
- The database is locked with row-level security and only the server (service role key) can reach it. AI and database keys never reach the browser.

## Technology

| Layer | Tech |
|---|---|
| Language | TypeScript |
| Frontend | React 19 + Vite, Tailwind CSS v4, installable PWA (works offline) |
| Voice | Web Speech API (`hi-IN`, `en-IN`, `gu-IN`) for speech-to-text and the "Bol Khata" wake word; `speechSynthesis` replies in Hindi, English or Gujarati with a female or male voice |
| AI understanding | Fallback chain: **Claude → Gemini → Groq → OpenRouter → Cerebras → offline rules**. Busy or rate-limited providers are skipped automatically. All AI output is checked with **Zod**. |
| Backend | Vercel serverless functions (`/api`) |
| Database | Supabase (PostgreSQL) |
| Offline | localStorage queue + automatic sync, duplicate-safe (ids are created on the phone) |
| Matching | Fuse.js fuzzy names + a Devanagari → Roman transliterator (so "रमेश", "Rames" and "Ramesh bhai" all match Ramesh) |
| Payments | UPI deep links + QR codes (`qrcode`) |
| Messages | WhatsApp click-to-chat links |
| Tests | Vitest (48 tests: Hindi numbers, transliteration, parsing, Bharosa Score, UPI, reply language, wake word) |

```
api/            serverless functions: parse (AI chain), state, sync, c (customer page)
api/_lib/       ai.ts (provider chain), db.ts (Supabase)
src/lib/        hindi.ts, parseRules.ts, match.ts, ledger.ts (balances + Bharosa Score),
                plan.ts, speech.ts, store.tsx (offline sync), links.ts, messages.ts, seed.ts
src/pages/      Bolo, Khata, Order, Hisaab, Settings, CustomerView (Pakka Hisaab page)
supabase/       schema.sql
tests/          parser.test.ts
```

---

## Run locally

```bash
npm install
cp .env.example .env      # fill in keys (all optional to start)
npm run dev               # http://localhost:5173  (app + API together)
npm test
```
With no keys at all the app still runs in **local mode**: starter shop data, offline rule parser, everything saved on the phone.

## Deploy (about 15 minutes)

### 1. Database: Supabase (free)
1. Go to **supabase.com**, then **New project**. Choose the **Mumbai** region.
2. Open **SQL Editor**, paste all of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
3. Go to **Project Settings → API** and copy the **Project URL** and the **service_role** key.

### 2. Free AI keys (get at least one; two or more is better)
- Gemini: https://aistudio.google.com/apikey
- Groq: https://console.groq.com/keys
- OpenRouter: https://openrouter.ai/keys
- Cerebras: https://cloud.cerebras.ai
- Claude (optional, paid per use): https://platform.claude.com

### 3. Push to GitHub
```bash
git remote add origin https://github.com/<you>/bol-khata.git
git push -u origin main
```

### 4. Vercel (free)
1. Go to **vercel.com**, then **Add New → Project**, and import the GitHub repo. It detects Vite automatically.
2. Under **Environment Variables**, add every key from `.env.example` that you have (at least `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and one AI key).
3. Click **Deploy**. Open the link in **Chrome on your phone**, allow the microphone, then use **⋮ → Add to Home screen**.

The first load fills the database with the starter shop "Raju Chai Stall". Open **⚙️ Settings** to check that the database shows "Supabase se juda" (connected) and to see which AI providers are active.

## Team

**Asur Coders**

| Member | GitHub | Role |
|---|---|---|
| Jeet Pastagia | [@jeetpastagia](https://github.com/jeetpastagia) | Back-end |
| Aum Sorathiya | [@AumSorathiya](https://github.com/AumSorathiya) | Front-end |
| Harikrushna Ghadiya | [@HariKrushna-Gadhiya](https://github.com/HariKrushna-Gadhiya) | Testing |
| Divyesh Shukla | _GitHub link coming soon_ | Testing |

## Known limits (honest list for the judges)
- Browser speech recognition works best in **Chrome**. In other browsers, use the text box.
- Messages are sent with WhatsApp **click-to-chat** (one tap). Fully automatic sending needs the WhatsApp Cloud API (future work).
- One shop per deployment. Shopkeeper login for multiple shops is future work.
- Hands-free listening works while the app is open on screen (browsers cannot listen in the background). Android Chrome plays a short beep each time the mic restarts.
