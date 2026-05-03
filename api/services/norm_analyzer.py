from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(slots=True)
class NormAnalysis:
    short_answer: str
    analysis: str
    limitations: str
    regulation_rows: list[dict[str, Any]]
    case_rows: list[dict[str, Any]]
    e_services_rows: list[dict[str, Any]]


class NormAnalyzer:
    def _build_inheritance_registration_orientation(self, user_summary: str) -> NormAnalysis:
        analysis = (
            "Ako ste kuću nasledili, uknjižba se najčešće radi na osnovu pravnosnažnog rešenja o "
            "nasleđivanju. Ukratko, postupak obično ide ovako:\n\n"
            "1. Najpre proverite da li imate pravnosnažno rešenje o nasleđivanju.\n"
            "2. Zatim proverite da li je kuća već upisana u katastar i na koga se vodi.\n"
            "3. Ako je ostavilac upisan kao vlasnik, promena vlasnika se po pravilu sprovodi u katastru "
            "na osnovu rešenja o nasleđivanju.\n"
            "4. Zahtev se podnosi Republičkom geodetskom zavodu (katastar), preko nadležnog kanala "
            "za predaju zahteva.\n"
            "5. Uz zahtev se obično prilaže rešenje o nasleđivanju, dokaz o uplati takse i eventualna "
            "dodatna dokumentacija ako stanje u katastru nije usklađeno.\n"
            "6. Ako kuća nije legalizovana, nije upisana, ili se zemljište i objekat vode različito, "
            "postupak može biti složeniji i potrebno je prvo uskladiti prethodna pitanja.\n\n"
            "Prvi praktičan korak: pripremite rešenje o nasleđivanju i list nepokretnosti za kuću, "
            "pa proverite da li je potrebna samo promena vlasnika ili i dodatno usklađivanje podataka.\n\n"
            "Da bih vas preciznije usmerio, korisno je da znamo: da li imate pravnosnažno rešenje o "
            "nasleđivanju i da li se kuća već vidi u katastru?"
        )
        return NormAnalysis(
            short_answer=(
                "Najverovatnije je reč o postupku uknjižbe nasleđene nepokretnosti u katastru."
            ),
            analysis=analysis,
            limitations=(
                "Ovo je opšta pravna orijentacija i ne predstavlja konačan pravni savet za vaš konkretan slučaj."
            ),
            regulation_rows=[],
            case_rows=[],
            e_services_rows=[],
        )

    def _build_orientation_when_clear(self, user_summary: str) -> NormAnalysis | None:
        lowered = user_summary.lower()
        inheritance_terms = ("nasled", "ostavin", "uknjiz", "katastar", "nepokretn")
        if sum(1 for term in inheritance_terms if term in lowered) >= 2:
            return self._build_inheritance_registration_orientation(user_summary)
        return None

    def analyze(
        self,
        user_summary: str,
        regulation_rows: list[dict[str, Any]],
        case_rows: list[dict[str, Any]],
        e_services_rows: list[dict[str, Any]] | None = None,
    ) -> NormAnalysis:
        e_services_rows = e_services_rows or []
        if not regulation_rows and not case_rows:
            orientation = self._build_orientation_when_clear(user_summary)
            if orientation:
                return orientation
            if e_services_rows:
                return NormAnalysis(
                    short_answer=(
                        "Nisam pronašao dovoljno relevantnu sudsku praksu u dostupnoj lokalnoj bazi, "
                        "ali mogu da vas usmerim kroz praktične korake i dostupne servise."
                    ),
                    analysis=(
                        "Dostupno je servisno usmerenje za praktične naredne korake, "
                        "kontakte i proveru statusa predmeta."
                    ),
                    limitations=(
                        "Servisno usmerenje nije pravni izvor i ne zamenjuje pravni savet advokata."
                    ),
                    regulation_rows=[],
                    case_rows=[],
                    e_services_rows=e_services_rows,
                )
            return NormAnalysis(
                short_answer=(
                    "Nisam pronašao dovoljno izvora za pouzdanu pravnu analizu. "
                    "Predlažem dodatno preciziranje činjenica i proveru zvaničnih izvora."
                ),
                analysis="Nema dovoljno relevantnih normi ili odluka za zaključak.",
                limitations=(
                    "Sistem ne generiše pravni zaključak bez izvora. "
                    "Odgovor nije zamena za pravni savet advokata."
                ),
                regulation_rows=[],
                case_rows=[],
                e_services_rows=[],
            )

        if regulation_rows and case_rows:
            short_answer = (
                "Na osnovu dostupnih normi i srodne sudske prakse, moguće je dati "
                "informativni pravni okvir i ukazati na ključne rizike."
            )
            analysis = (
                f"Propisi pronađeni: {len(regulation_rows)}; "
                f"slične odluke: {len(case_rows)}."
            )
        elif regulation_rows:
            short_answer = (
                "Pronađeni su relevantni propisi za opisanu situaciju. "
                "Sudska praksa trenutno nije uključena."
            )
            analysis = f"Broj pronađenih normi: {len(regulation_rows)}."
        else:
            short_answer = (
                "Pronađena je slična sudska praksa, ali bez potvrđenog "
                "propisa iz PIS izvora."
            )
            analysis = f"Broj sličnih odluka: {len(case_rows)}."

        return NormAnalysis(
            short_answer=short_answer,
            analysis=f"Korisnička situacija: {user_summary}. {analysis}",
            limitations=(
                "Odgovor je informativan i ne predstavlja pravni savet. "
                "Važenje konkretne norme treba potvrditi u zvaničnom izvoru."
            ),
            regulation_rows=regulation_rows,
            case_rows=case_rows,
            e_services_rows=e_services_rows,
        )

