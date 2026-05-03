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
- Modularni legal workflow sa feature flag-ovima i fallback tokovima

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
│   └── services/
│       ├── legal_intake_agent.py
│       ├── query_preprocessor.py
│       ├── entity_recognition_and_linking.py
│       ├── pis_on_demand_fetcher.py
│       ├── legal_act_parser.py
│       ├── temporal_validity_checker.py
│       ├── case_law_retriever.py
│       ├── norm_analyzer.py
│       ├── research_interaction_logger.py
│       └── post_answer_survey.py
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
- `SLUZBENI_GLASNIK_API_URL` (opciono, on-demand propisi)
- `SLUZBENI_GLASNIK_API_KEY` (opciono)

Feature flagovi:

- `ENABLE_LEGAL_INTAKE_AGENT=true`
- `ENABLE_QUERY_PREPROCESSOR=true`
- `ENABLE_PIS_ON_DEMAND_FETCH=true`
- `ENABLE_LEGAL_ACT_PARSER=true`
- `ENABLE_TEMPORAL_VALIDITY_CHECK=true`
- `ENABLE_CASE_LAW_SEARCH=true`
- `ENABLE_RESEARCH_LOGGING=true`
- `ENABLE_POST_ANSWER_SURVEY=true`
- `ENABLE_ENTITY_RECOGNITION=true`
- `ENABLE_ECHR_CHECK=true`

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

- `POST /api/chat` - orkestrirani pravni chat (intake → preprocess → routing → retrieval)
- `POST /api/upload` - upload PDF/DOCX/ODT dokumenta
- `POST /api/upload-multiple` - paralelni upload više dokumenata
- `POST /api/reindex` - kompletno reindeksiranje svih dokumenata
- `GET /api/health` - health check
- `GET /api/stats` - osnovne metrike baze (broj odluka, chunk-ova, sudova)
- `POST /api/survey` - opciono čuvanje post-answer ankete

## Hibridna pretraga i metapodaci

Backend koristi kombinaciju:

- vektorske pretrage (OpenAI embeddings + FAISS)
- BM25 keyword pretrage

Rezultati se spajaju i po potrebi rerankuju (ako je konfigurisan transformer
reranker servis), čime je bolje razumevanje pitanja korisnika i opisa situacije.

Postojeći Serbian embedding pipeline nije zamenjen:

- `rag_engine.answer(...)` ostaje primarni semantic retrieval i generativni odgovor.
- Novi moduli dodaju routing, entity signal i fallback tokove preko postojećeg sistema.

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

## Novi legal moduli i fallback ponašanje

### `legal-intake-agent`
- Klasifikuje intent (`REGULATION_LOOKUP`, `CASE_LAW_SEARCH`, `COMBINED...`, itd.).
- Kod niske pouzdanosti vraća kratko pitanje za razjašnjenje.

### `query-preprocessor`
- Normalizuje upit, dodaje leme/POS (heuristički MVP), gradi `expandedQuery`.
- Ako je isključen flag, koristi se originalni/normalizovani query.

### `entity-recognition-and-linking`
- Rule-based prepoznavanje: `LEGAL_ACT`, `COURT`, `CASE_NUMBER`, `ARTICLE_REFERENCE`, `DATE`.
- Fallback: sistem radi i bez NER.

### `pis-on-demand-fetcher`
- On-demand pretraga i dohvat samo traženog propisa.
- Lokalni cache po `actId` (bez masovnog crawl-ovanja).
- Ako fetch padne: sistem nastavlja sa lokalnim retrieval-om i jasno navodi ograničenje.

### `legal-act-parser`
- Strukturira propis u čl./stav./tač. blokove.
- Retrieval chunkovi su vezani za normativnu strukturu, ne samo broj karaktera.
- Ako parser ne uspe: čuva raw tekst i `parsingConfidence=low`.

### `temporal-validity-checker`
- Izdvaja vremenski kontekst iz upita i procenjuje važenje na nivou propisa.
- Ako nema norm-level podataka, to se eksplicitno navodi (bez izmišljanja).

### `case-law-retriever`
- Koristi postojeći `rag_engine.search_case_law` nad lokalnom bazom.
- Vraća metadata polja (sud, broj predmeta, skor, razlike).

### `echr-checker` (HUDOC / ESLJP)
- Interne provere prakse Evropskog suda za ljudska prava preko `echr-extractor`.
- Serbia-first pravilo:
  1. prvo pretraga predmeta protiv Srbije,
  2. tek ako nema dovoljno bliske analogije, proširenje na druge države.
- Mapping korisničke situacije na moguće čl. Konvencije (npr. čl. 6, 8, 10, 14, P1-1).
- Ako je servis nedostupan, chat nastavlja sa domaćim propisima i domaćom praksom.

### `norm-analyzer`
- Spaja norme i praksu u strukturisan izlaz uz ograničenja i disclaimer.

### `research-interaction-logger`
- Non-blocking JSONL logging sa `entityMap`.
- Ako upis padne, chat nastavlja normalno.

### `post-answer-survey`
- Opciona anketa posle odgovora; nezavisna od chat uspeha.

## Open Data i metodološke reference

- **SrpELTeC-gold**: referentni resurs za NER na srpskom (nije pravna baza znanja).
- **SrpKor4Tagging**: resurs za POS/lematizaciju (integracija je ostavljena kroz proširive interfejse preprocessora).
- **PIS / pravno-informacioni-sistem.rs**: primarni izvor propisa (on-demand fetch pristup).
- **HUDOC / ECHR**: dopunski izvor evropske sudske prakse o Konvenciji (Serbia-first analize).
- **Nebojsa Vasiljević metodologija**: osnova za strukturno parsiranje pravnih tekstova.

## Napomena o admin zaštiti

Pristup `/admin` je zaštićen middleware proverom HttpOnly kolačića postavljenog nakon uspešne prijave na `/admin/login`. Lozinka se validira server-side kroz `ADMIN_PASSWORD`.
