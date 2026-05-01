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

## API rute

- `POST /api/chat` - pravni chat nad indeksiranom bazom
- `POST /api/upload` - upload PDF/DOCX/ODT dokumenta
- `POST /api/reindex` - kompletno reindeksiranje svih dokumenata
- `GET /api/health` - health check

## Napomena o admin zaštiti

Pristup `/admin` je zaštićen middleware proverom HttpOnly kolačića postavljenog nakon uspešne prijave na `/admin/login`. Lozinka se validira server-side kroz `ADMIN_PASSWORD`.
