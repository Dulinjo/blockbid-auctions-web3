# LexVibe LegalTech SaaS

LexVibe je profesionalna LegalTech RAG aplikacija sa Next.js frontendom i FastAPI backendom za obradu i pretragu pravnih dokumenata na srpskom jeziku.

## Tehnologije

- **Frontend**: Next.js 14 (App Router), Tailwind CSS, Shadcn/UI, Lucide Icons
- **Backend**: FastAPI u `api/index.py` (Vercel Python function)
- **AI/RAG**: LangChain + OpenAI (`text-embedding-3-small`, `gpt-4o-mini`) + FAISS
- **Parseri dokumenata**: PyMuPDF (PDF), python-docx (DOCX), odfpy (ODT)

## Ključne mogućnosti

- Chat interfejs sa citatima izvora i confidence score metrikama
- Admin panel za upload i reindeksiranje dokumenata
- Serbian normalization (ćirilica + latinica) pre embedovanja i upita
- Profesionalan pravni ton odgovora na srpskom jeziku
- Dark theme ("Midnight Blue & Slate") i glassmorphism UI elementi

## Struktura projekta

```text
.
├── app/
│   ├── page.tsx
│   └── admin/
│       ├── page.tsx
│       ├── login/page.tsx
│       ├── login/api/route.ts
│       └── logout/api/route.ts
├── api/
│   ├── index.py
│   └── core/
│       ├── processor.py
│       └── rag.py
├── components/
│   ├── ChatInput.tsx
│   ├── Sidebar.tsx
│   ├── CitationCard.tsx
│   └── ui/
├── styles/
│   └── globals.css
├── data/
│   ├── documents/
│   └── index/
├── scripts/
│   └── seed_sample_docs.py
├── tests/
│   ├── test_api_auth.py
│   └── test_processor.py
├── requirements.txt
├── package.json
└── vercel.json
```

## Environment promenljive

Kopirajte primer i unesite vrednosti:

```bash
cp .env.example .env
```

Obavezne promenljive:

- `OPENAI_API_KEY`
- `ADMIN_PASSWORD`
- `SLUZBENI_GLASNIK_API_URL` (opciono)
- `SLUZBENI_GLASNIK_API_KEY` (opciono)
- `SLUZBENI_GLASNIK_TIMEOUT` (opciono)

## Pokretanje lokalno

```bash
npm install
pip install -r requirements.txt
npm run dev
```

## Seed uzornih dokumenata

Za brzo testiranje admin/RAG toka možete generisati primer pravnih fajlova:

```bash
python3 scripts/seed_sample_docs.py
```

Skripta kreira u `data/documents/`:

- `primer_ugovor_o_delu.docx`
- `obavestenje_o_otkazu.odt`
- `izvod_iz_pravilnika.pdf`

Nakon toga u admin panelu pokrenite **Re-index**.

## Testiranje backenda

```bash
pytest
```

## Reranker (opciono, transformer servis)

LexVibe može opciono da koristi eksterni transformer reranker servis (npr.
ModernBERTić/SRBerta) kako bi bolje rangirao već pronađene chunkove pre finalnog
odgovora modela.

Potrebne env promenljive:

- `RERANKER_API_URL` - URL servisa (npr. `https://reranker.mojdomen.com/rerank`)
- `RERANKER_API_KEY` - opcioni bearer token za taj servis
- `RERANKER_TIMEOUT_SECONDS` - timeout poziva (podrazumevano 8)
- `RERANKER_TOP_N` - koliko rerankovanih chunkova vraćamo (podrazumevano 4)

Napomena: Vercel sam po sebi nije idealan za hostovanje težih transformer modela.
Preporučeno je da model radi kao odvojen mikroservis (CPU/GPU), a LexVibe ga samo
poziva.

## API rute

- `POST /api/chat` - pravni chat nad indeksiranom bazom
- `POST /api/upload` - upload PDF/DOCX/ODT dokumenta
- `POST /api/upload-multiple` - paralelni upload više dokumenata
- `POST /api/reindex` - kompletno reindeksiranje svih dokumenata
- `GET /api/health` - health check
- `GET /api/stats` - osnovne metrike baze (broj odluka, chunk-ova, sudova)

## Hibridna pretraga i metapodaci

Backend koristi kombinaciju:

- vektorske pretrage (OpenAI embeddings + FAISS)
- BM25 keyword pretrage

Rezultati se spajaju i po potrebi rerankuju (ako je konfigurisan transformer
reranker servis), čime je bolje razumevanje pitanja korisnika i opisa situacije.

Svaki dokument dobija izvučene metapodatke iz naziva fajla:

- naziv suda
- broj odluke/predmeta
- godina

Ti metapodaci se prikazuju u citation karticama i koriste za dashboard metrike.

## Propisi sa Službenog glasnika (opciono)

Ako je dostupan API endpoint, aplikacija može u odgovoru dodati i reference na
relevantne propise:

- `SLUZBENI_GLASNIK_API_URL`
- `SLUZBENI_GLASNIK_API_KEY`

Ako nisu podešeni, chat radi standardno nad internom bazom odluka.

## Napomena o admin zaštiti

Pristup `/admin` je zaštićen middleware proverom HttpOnly kolačića postavljenog nakon uspešne prijave na `/admin/login`. Lozinka se validira server-side kroz `ADMIN_PASSWORD`.
