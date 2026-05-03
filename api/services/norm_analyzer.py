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
    def analyze(
        self,
        user_summary: str,
        regulation_rows: list[dict[str, Any]],
        case_rows: list[dict[str, Any]],
        e_services_rows: list[dict[str, Any]] | None = None,
    ) -> NormAnalysis:
        e_services_rows = e_services_rows or []
        if not regulation_rows and not case_rows:
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

