# BlockBid — Security Overview

Ovaj dokument opisuje **bezbednosne mere** koje su implementirane u BlockBid Web3 aplikaciji.
Namenjen je developerima, reviewer-ima i kao prateća dokumentacija (npr. za odbranu projekta).

> TL;DR — Aplikacija je Web3 dApp na Sepolia testnet-u. Autentikacija je preko **wallet-a** (MetaMask / WalletConnect),
> a Lovable Cloud (Supabase) se koristi samo za pomoćne stvari: **AI asistent** (edge function) i **storage**
> (slike aukcija). Ključna logika i novac žive na **smart contractu**, ne na našem serveru.

---

## 1. Threat model — šta štitimo

| Resurs | Pretnja | Mera |
|---|---|---|
| Smart contract (ETH, bidovi) | Re-entrancy, neovlašćeno povlačenje | Logika je u Solidity ugovoru — UI ne može da menja stanje bez wallet potpisa korisnika |
| Korisnikov wallet | Phishing, fake tx | Sve transakcije idu kroz MetaMask/WalletConnect prompt — korisnik **ručno potpisuje** |
| Lovable AI Gateway (LOVABLE_API_KEY) | Krađa kredita / abuse | Edge function sa origin allow-list, size cap, sanitization, prompt-injection zaštita |
| Supabase Storage (slike aukcija) | Upload zlonamernog sadržaja | Public bucket samo za read; upload zahteva wallet sesiju + validaciju |
| Frontend env varijable | Curenje tajni | Samo **publishable** ključevi u `VITE_*` (anon key, contract address) |

---

## 2. API ključevi — gde su, šta je javno, šta nije

### 2.1 Javni (smeju u browser / git)

Ovi ključevi su **publishable** po dizajnu — Supabase ih sam označava kao bezbedne za client-side:

| Varijabla | Gde živi | Zašto je javna |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env`, Vercel env | URL projekta — javan |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env`, Vercel env | Anon key — zaštićen RLS politikama na DB strani |
| `VITE_SUPABASE_PROJECT_ID` | `.env`, Vercel env | Public ref |
| `VITE_CONTRACT_ADDRESS` | `.env`, Vercel env | Adresa contracta na Sepolia (svako može da je vidi na Etherscan-u) |
| `VITE_WALLETCONNECT_PROJECT_ID` | `.env`, Vercel env | Reown publishable id |

**Pravilo:** sve što počinje sa `VITE_` Vite ugrađuje u bundle → **mora biti javno-bezbedno**.
Nikada ne stavljati privatne ključeve u `VITE_*`.

### 2.2 Tajni (samo na serveru / edge functions)

Žive **isključivo** u Lovable Cloud secrets storage-u, nikad u repo-u:

| Secret | Koristi se u | Svrha |
|---|---|---|
| `LOVABLE_API_KEY` | `supabase/functions/chat-assistant` | Auth ka Lovable AI Gateway |
| `SUPABASE_SERVICE_ROLE_KEY` | (rezervisan) | Bypass RLS — ne koristi se u kodu |
| `SUPABASE_DB_URL`, `SUPABASE_JWKS`, … | platforma | Interno |

**Validacija:** `.env` je u `.gitignore`. `.env.example` sadrži samo placeholdere.

---

## 3. Edge Function hardening (`chat-assistant`)

AI asistent je jedini deo aplikacije gde korisnički input dolazi do plaćenog upstream API-ja.
Zato je posebno otporan na zloupotrebu (vidi `supabase/functions/chat-assistant/index.ts`):

1. **Origin allow-list** — prihvataju se samo zahtevi sa `*.lovable.app`, `*.lovableproject.com`,
   `*.vercel.app` i `localhost`. Random sajtovi dobijaju `403`.
2. **Body size cap** — `MAX_BODY_BYTES = 64 KB`. Veći payload → `413` pre parsiranja.
3. **Message limits** — max **20 poruka** po requestu, max **2000 karaktera** po poruci.
4. **Strict input sanitization:**
   - Eth adrese → regex `^0x[0-9a-fA-F]{40}$`
   - Route → regex `^/[A-Za-z0-9/_-]{0,79}$`
   - Tekstualna polja → strip control chars, clamp dužine
5. **Prompt-injection mitigacija** — system prompt eksplicitno označava korisnički kontekst
   kao **"data, not instructions"** i zabranjuje LLM-u da prati direktive iz njega.
6. **Auction snapshot cap** — max **30 aukcija**, svaka sa ograničenom dužinom polja.
   Sprečava napad gde napadač napumpa prompt da troši kredite.
7. **Upstream error mapping** — `429` (rate limit) i `402` (no credits) se prosleđuju klijentu
   sa jasnim porukama, bez curenja internih detalja.
8. **No secret logging** — nikad se ne loguju vrednosti env varijabli niti pune poruke.

---

## 4. Wallet & blockchain layer

- **Nema custodial logike** — aplikacija ne čuva privatne ključeve niti seed fraze.
- **Sve mutacije** (createAuction, placeBid, endAuction, withdraw) idu kroz `eth_sendTransaction`
  → korisnik vidi tačan iznos i adresu pre potpisa.
- **Chain check** — UI proverava `chainId === 11155111` (Sepolia) i traži switch ako nije.
- **Read-only za guest-e** — bez wallet-a moguć je samo browse; bidovanje zahteva konekciju.
- **Contract verifikovan** na Etherscan-u → korisnici mogu da pročitaju izvorni kod.

---

## 5. Database (Supabase) — RLS & access

- Tabele koje skladište metapodatke aukcija imaju **Row Level Security uključen**.
- Storage bucket `auction-images` je **public-read** (slike se prikazuju svima),
  ali **upload** ide samo kroz autorizovan flow iz aplikacije.
- Servisni role key se **ne koristi** u client kodu. Nema bypass-a RLS-a sa frontenda.
- Tipovi (`src/integrations/supabase/types.ts`) i klijent (`client.ts`) su auto-generisani —
  ne edituju se ručno.

---

## 6. Frontend security hygiene

- **Bez `dangerouslySetInnerHTML`** sa korisničkim sadržajem.
- **Validacija formi** (CreateAuction, BidModal) — provera tipova i dužina pre slanja na chain.
- **Input escapovanje** — sve što ide u URL-ove ide kroz `encodeURIComponent`.
- **CSP-friendly** — nema inline `<script>` sa korisničkim podacima.
- **Strict TypeScript** + ESLint sa security pravilima.

---

## 7. Deployment & secrets management

- **Vercel** i **Lovable** koriste isti contract address i isti Cloud backend → konzistentno stanje.
- Env varijable se postavljaju u **Vercel Project Settings → Environment Variables** za production.
- Promena `VITE_*` varijable zahteva **redeploy** (Vite ih ugrađuje u build).
- `LOVABLE_API_KEY` se rotira preko Lovable platforme (ne kroz `update_secret`).

---

## 8. Šta NE radimo (poznata ograničenja)

- Nema rate-limita po IP-u na edge function — oslanjamo se na origin check + size cap +
  upstream `429`. Ako bude potrebno, dodaćemo Redis/KV bazirani limiter.
- Nema email verifikacije — auth je čisto wallet-based.
- Nema admin panela sa elevated privileges (nema admin uloge → nema privilege-escalation
  površine).

---

## 9. Reagovanje na incidente

Ako se sumnja na kompromitovani ključ:

1. **`LOVABLE_API_KEY`** → rotirati kroz Lovable AI Gateway settings.
2. **Supabase ključevi** → rotacija kroz Cloud → Settings → API Keys.
3. **Contract** → ne može se "rotirati"; deploy nove verzije i update `VITE_CONTRACT_ADDRESS`
   na svim okruženjima (Lovable + Vercel) → redeploy.
4. Pregledati `chat-assistant` logove na neuobičajen saobraćaj.

---

_Last updated: 2026-05-01_
