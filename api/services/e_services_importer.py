from __future__ import annotations

import csv
import io
import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from api.core.processor import get_runtime_data_dir


KB_PATH = get_runtime_data_dir() / "e_services_kb.json"


@dataclass(slots=True)
class ImportResult:
    imported_services: int
    imported_contacts: int
    imported_envelope_clues: int
    kb_version: str
    warnings: list[str]


def _split_ids(value: str) -> list[str]:
    if not value:
        return []
    rows = [item.strip() for item in re.split(r"[;,]", value) if item.strip()]
    return rows


def _parse_status(value: str) -> str:
    lowered = (value or "").strip().lower()
    if lowered in {"active", "draft", "paused", "deprecated"}:
        return lowered
    return "draft"


def _search_key(*parts: str) -> str:
    text = " ".join(part for part in parts if part).lower()
    tokens = re.findall(r"[a-z0-9čćžšđ]{2,}", text, flags=re.IGNORECASE)
    return " ".join(dict.fromkeys(token.lower() for token in tokens))


def _seed_services() -> list[dict[str, Any]]:
    return [
        {
            "serviceId": "SRV-001",
            "serviceName": "Ostavinski postupak — informacije i pokretanje",
            "institution": "Primer: Osnovni sud / Javni beležnik",
            "orgLevel": "local",
            "serviceChannel": "info + in_person",
            "serviceCategory": "inheritance",
            "lifeEventCategory": "death_in_family",
            "routePriority": "normal",
            "status": "draft",
            "keywordsSynonyms": [
                "ostavina",
                "nasledstvo",
                "smrt",
                "ostavinski postupak",
                "naslednik",
            ],
            "userPhrasesExamples": [
                "umro mi je otac",
                "preminula mi je majka",
                "nasledstvo",
                "ostavina",
                "sta radim posle smrti u porodici",
            ],
            "readyToUseInstructionCopy": (
                "Na osnovu vašeg opisa, najrelevantnije su informacije o ostavinskom postupku. "
                "Pripremite smrtovnicu, osnovne podatke o naslednicima i podatke o imovini ako ih imate. "
                "Sledeći korak je da proverite nadležnost i način pokretanja postupka."
            ),
            "relatedContactIds": [],
            "relatedEnvelopeClueIds": [],
        },
        {
            "serviceId": "SRV-002",
            "serviceName": "Prijava nasilja / hitno usmeravanje",
            "institution": "Primer: Policija / Centar za socijalni rad",
            "orgLevel": "local",
            "serviceChannel": "phone + in_person",
            "serviceCategory": "safety",
            "lifeEventCategory": "violence_or_threat",
            "routePriority": "critical",
            "status": "draft",
            "keywordsSynonyms": ["nasilje", "pretnja", "hitno", "policija", "csr"],
            "userPhrasesExamples": [
                "bojim se",
                "partner me maltretira",
                "trpim nasilje",
                "hitno",
                "pretnje",
            ],
            "readyToUseInstructionCopy": (
                "Ako postoji neposredna opasnost, odmah se obratite hitnim službama ili policiji. "
                "Ako nije hitno, mogu vas uputiti na odgovarajuću službu za dalju podršku i informacije."
            ),
            "relatedContactIds": [],
            "relatedEnvelopeClueIds": [],
        },
        {
            "serviceId": "SRV-003",
            "serviceName": "Provera statusa predmeta po broju predmeta (upisniku)",
            "institution": "Primer: Sud / organ uprave",
            "orgLevel": "national/local",
            "serviceChannel": "info",
            "serviceCategory": "case_status",
            "lifeEventCategory": "received_letter_or_case_number",
            "routePriority": "high",
            "status": "draft",
            "keywordsSynonyms": [
                "broj predmeta",
                "upisnik",
                "status predmeta",
                "pisarnica",
                "predmet",
                "resenje",
                "poziv",
            ],
            "userPhrasesExamples": [
                "stigla mi je koverta",
                "imam broj predmeta",
                "kako da proverim status",
                "dokle je stiglo",
                "sta znaci P 123/2024",
            ],
            "readyToUseInstructionCopy": (
                "Pošaljite ili prepišite naziv organa i broj predmeta tačno kako piše na dopisu. "
                "Na osnovu toga mogu da vas usmerim gde se status proverava i koji kontakt je najrelevantniji."
            ),
            "relatedContactIds": ["CNT-001"],
            "relatedEnvelopeClueIds": ["ENV-001", "ENV-002"],
        },
        {
            "serviceId": "SRV-004",
            "serviceName": "Tok predmeta javnog izvršitelja",
            "institution": "Javni izvršitelj",
            "orgLevel": "",
            "serviceChannel": "info",
            "serviceCategory": "case_status",
            "lifeEventCategory": "",
            "routePriority": "normal",
            "status": "draft",
            "keywordsSynonyms": [],
            "userPhrasesExamples": [],
            "readyToUseInstructionCopy": "",
            "relatedContactIds": [],
            "relatedEnvelopeClueIds": [],
        },
        {
            "serviceId": "SRV-005",
            "serviceName": "Elektronska oglasna tabla suda",
            "institution": "Javni izvršitelj, sud",
            "orgLevel": "",
            "serviceChannel": "e-service",
            "serviceCategory": "registry",
            "lifeEventCategory": "",
            "routePriority": "normal",
            "status": "draft",
            "keywordsSynonyms": [],
            "userPhrasesExamples": [],
            "readyToUseInstructionCopy": "",
            "relatedContactIds": [],
            "relatedEnvelopeClueIds": [],
        },
        {
            "serviceId": "SRV-006",
            "serviceName": "Elektronska oglasna tabla suda",
            "institution": "Sud",
            "orgLevel": "",
            "serviceChannel": "e-service",
            "serviceCategory": "registry",
            "lifeEventCategory": "",
            "routePriority": "normal",
            "status": "draft",
            "keywordsSynonyms": [],
            "userPhrasesExamples": [],
            "readyToUseInstructionCopy": "",
            "relatedContactIds": [],
            "relatedEnvelopeClueIds": [],
        },
        {
            "serviceId": "SRV-007",
            "serviceName": "Registar neplaćenih novčanih kazni i drugih novčanih iznosa",
            "institution": "",
            "orgLevel": "",
            "serviceChannel": "e-service",
            "serviceCategory": "registry",
            "lifeEventCategory": "",
            "routePriority": "normal",
            "status": "draft",
            "keywordsSynonyms": [],
            "userPhrasesExamples": [],
            "readyToUseInstructionCopy": "",
            "relatedContactIds": [],
            "relatedEnvelopeClueIds": [],
        },
        {
            "serviceId": "SRV-008",
            "serviceName": "Zahtev za rehabilitaciono obeštećenje",
            "institution": "Ministarstvo pravde",
            "orgLevel": "national",
            "serviceChannel": "info",
            "serviceCategory": "compensation",
            "lifeEventCategory": "",
            "routePriority": "normal",
            "status": "draft",
            "keywordsSynonyms": [],
            "userPhrasesExamples": [],
            "readyToUseInstructionCopy": (
                "Komisija za rehabilitaciono obeštećenje razmatra zahteve i priloženu dokumentaciju i donosi "
                "odgovarajuće odluke. Kada Komisija donese odluku kojom usvoji zahtev za rehabilitaciono obeštećenje "
                "predlaže i visinu naknade. Nakon donošenja odluke o usvajanju zahteva, Ministarstvo podnosiocu zahteva "
                "dostavlja Predlog sporazuma o rehabilitacionom obeštećenju sa propratnim aktom (u kome je precizno "
                "navedeno šta od dokumentacije treba dostaviti Ministarstvu, ako postoji saglasnost u vezi sporazuma) "
                "i ostavlja rok u kome je potrebno da se podnosilac zahteva izjasni da li prihvata predloženi sporazum. "
                "Ukoliko Komisija donese odluku kojom nije usvojila zahtev za rehabilitaciono obeštećenje, podnosiocu "
                "zahteva se dostavlja obrazložen odgovor sa navedenim razlozima koji su bili opredeljujući za donošenje odluke."
            ),
            "relatedContactIds": [],
            "relatedEnvelopeClueIds": [],
        },
        {
            "serviceId": "SRV-009",
            "serviceName": "Zahtev za naknadu štete neosnovano osuđenih i neosnovano lišenih slobode",
            "institution": "Ministarstvo pravde",
            "orgLevel": "national",
            "serviceChannel": "info",
            "serviceCategory": "compensation",
            "lifeEventCategory": "",
            "routePriority": "normal",
            "status": "draft",
            "keywordsSynonyms": [],
            "userPhrasesExamples": [],
            "readyToUseInstructionCopy": "",
            "relatedContactIds": [],
            "relatedEnvelopeClueIds": [],
        },
        {
            "serviceId": "SRV-010",
            "serviceName": "Elektronska javna prodaja",
            "institution": "Ministarstvo pravde",
            "orgLevel": "national",
            "serviceChannel": "e-service",
            "serviceCategory": "auction",
            "lifeEventCategory": "",
            "routePriority": "normal",
            "status": "draft",
            "keywordsSynonyms": [],
            "userPhrasesExamples": [],
            "readyToUseInstructionCopy": "",
            "relatedContactIds": [],
            "relatedEnvelopeClueIds": [],
        },
        {
            "serviceId": "SRV-011",
            "serviceName": "Legalizacija dokumenata",
            "institution": "Ministarstvo pravde",
            "orgLevel": "national",
            "serviceChannel": "info",
            "serviceCategory": "documents",
            "lifeEventCategory": "",
            "routePriority": "normal",
            "status": "draft",
            "keywordsSynonyms": [],
            "userPhrasesExamples": [],
            "readyToUseInstructionCopy": "",
            "relatedContactIds": [],
            "relatedEnvelopeClueIds": [],
        },
        {
            "serviceId": "SRV-012",
            "serviceName": "Tok predmeta prekršajnih sudova",
            "institution": "Ministarstvo pravde",
            "orgLevel": "national",
            "serviceChannel": "info",
            "serviceCategory": "case_status",
            "lifeEventCategory": "",
            "routePriority": "normal",
            "status": "draft",
            "keywordsSynonyms": [],
            "userPhrasesExamples": [],
            "readyToUseInstructionCopy": "",
            "relatedContactIds": [],
            "relatedEnvelopeClueIds": [],
        },
    ]


def _seed_contacts() -> list[dict[str, Any]]:
    return [
        {
            "contactId": "CNT-001",
            "institution": "Primer institucija",
            "orgName": "Primer: Pisarnica organa",
            "orgLevel": "local",
            "contactType": "phone",
            "email": "",
            "contactPurpose": "status_check_or_registry",
            "status": "draft",
            "relatedServiceIds": ["SRV-003"],
            "relatedEnvelopeClueIds": ["ENV-001", "ENV-002"],
            "notesForAgent": (
                "Kada korisnik ima broj predmeta i traži proveru statusa — uputi na pisarnicu."
            ),
            "scriptForAgentCopy": (
                "Za proveru statusa pripremite naziv organa i broj predmeta tačno kako piše na dopisu. "
                "Ako imate samo deo oznake, i to može pomoći."
            ),
            "fallbackIfUnreachable": (
                "Ako se niko ne javlja ili kontakt nije ažuran, proveriti website, centralu ili povezani kontakt iz baze."
            ),
            "contactPreference": "phone_first",
        },
        {
            "contactId": "CNT-002",
            "institution": "Primer institucija",
            "orgName": "Primer: eUprava podrška",
            "orgLevel": "national",
            "contactType": "email",
            "email": "podrska@example.rs",
            "contactPurpose": "technical_support",
            "status": "draft",
            "relatedServiceIds": [],
            "relatedEnvelopeClueIds": [],
            "notesForAgent": (
                "Kada korisnik ne može da pristupi e-servisu ili ima tehnički problem sa nalogom."
            ),
            "scriptForAgentCopy": (
                "Ovo izgleda kao tehnički problem sa pristupom servisu. Korisnika uputiti na podršku i zamoliti "
                "da pripremi opis greške, vreme pokušaja i eventualni screenshot."
            ),
            "fallbackIfUnreachable": (
                "Ako email ne radi, ponuditi website ili drugi kanal podrške iz baze."
            ),
            "contactPreference": "email_first",
        },
    ]


def _seed_envelope_clues() -> list[dict[str, Any]]:
    return [
        {
            "clueId": "ENV-001",
            "documentType": "court_letter",
            "issuingBodyName": "Primer: Osnovni sud u ___",
            "issuingBodyAbbrev": "OSU",
            "visibleLabelForCaseNumber": "Broj predmeta / Posl. br.",
            "upisnikCode": "P",
            "caseNumberPatternExample": "P 123/2024",
            "inferredCategory": "status_of_case",
            "mappedServiceId": "SRV-003",
            "mappedContactIds": ["CNT-001"],
            "status": "draft",
            "whatUserCanNotice": (
                "Na koverti/dopisu piše naziv suda i 'Broj predmeta' sa oznakom poput 'P 123/2024'."
            ),
            "whatAgentShouldAskNext": (
                "Traži tačan naziv suda, pun broj predmeta, godinu i da li korisnik ima rešenje, poziv ili presudu."
            ),
            "portalOrRegistryToCheck": (
                "javna pretraga ako postoji; u suprotnom pisarnica / kontakt organa"
            ),
            "readyToUseInstructionCopy": (
                "Na dopisu izgleda da je u pitanju sudski predmet. Zapišite naziv suda i broj predmeta tačno kako piše, "
                "pa proverite status preko nadležnog portala ili pisarnice."
            ),
            "confidenceRule": (
                "Ako postoje naziv suda + oznaka P + broj/godina, visoka verovatnoća da treba rutirati na proveru statusa predmeta."
            ),
        },
        {
            "clueId": "ENV-002",
            "documentType": "administrative_letter",
            "issuingBodyName": "Primer: Organ uprave ___",
            "issuingBodyAbbrev": "ORG",
            "visibleLabelForCaseNumber": "Broj:",
            "upisnikCode": "U",
            "caseNumberPatternExample": "U-456/2025",
            "inferredCategory": "status_of_case",
            "mappedServiceId": "SRV-003",
            "mappedContactIds": ["CNT-001"],
            "status": "draft",
            "whatUserCanNotice": "Piše naziv organa i 'Broj:' pa oznaka predmeta.",
            "whatAgentShouldAskNext": (
                "Traži naziv organa, broj predmeta, datum dopisa i vrstu akta (rešenje, zaključak, obaveštenje)."
            ),
            "portalOrRegistryToCheck": "zvanični portal organa; eUprava; pisarnica",
            "readyToUseInstructionCopy": (
                "Na dopisu izgleda da je u pitanju upravni predmet. Potrebni su naziv organa i broj predmeta "
                "da bi se proverio status ili naredni korak."
            ),
            "confidenceRule": (
                "Ako postoje naziv organa + Broj: + U/oznaka upravnog predmeta, rutirati na status predmeta ili kontakt organa."
            ),
        },
    ]


def _seed_lists() -> dict[str, list[str]]:
    return {
        "org_level": ["local", "regional", "national", "national/local", "varies"],
        "service_channel": [
            "e-service",
            "email",
            "phone",
            "in_person",
            "info",
            "info + in_person",
            "phone + in_person",
        ],
        "needs_eid": ["yes", "no", "maybe"],
        "status": ["draft", "active", "paused", "deprecated"],
        "route_priority": ["critical", "high", "normal", "low"],
        "sensitivity_level": ["urgent_safety", "high_impact", "general_info"],
        "status_check_supported": ["yes", "no", "limited"],
        "contact_preference": ["portal_first", "phone_first", "email_first"],
        "contact_type_extended": [
            "portal",
            "registry",
            "hotline",
            "pisarnica",
            "support",
            "information",
        ],
    }


def _seed_how_to_update() -> list[str]:
    return [
        "Services: jedan red = jedan servis.",
        "Popuniti svakodnevni jezik korisnika, routing pitanja i gotove instrukcije.",
        "status=active koristiti samo za proverene redove.",
        "Agent u produkciji koristi samo active redove.",
        "Gotovi tekstovi u ready_to_use_instruction_copy i script_for_agent_copy treba da imaju 2–5 kratkih rečenica.",
        "Kada se promeni URL, kontakt, taksa, uslov ili portal, ažurirati last_verified.",
        "Ako informacija nije proverena, status ostaje draft.",
        "Ako servis privremeno ne radi, status = paused.",
        "Ako je servis ukinut ili zamenjen, status = deprecated.",
        "Ako korisnik šalje kovertu/dopis, koristiti Envelope_Clues.",
        "Agent pita samo podatke vidljive na dopisu/koverti i ne traži nepotrebne lične podatke.",
    ]


def _read_csv_sheet(blob: bytes, marker: str) -> list[dict[str, str]]:
    try:
        text = blob.decode("utf-8")
    except UnicodeDecodeError:
        return []
    blocks = text.split(marker)
    if len(blocks) < 2:
        return []
    payload = blocks[1]
    lines = payload.strip().splitlines()
    if not lines:
        return []
    reader = csv.DictReader(io.StringIO("\n".join(lines)))
    return [{str(k): str(v) for k, v in row.items()} for row in reader]


def _load_seed_data() -> dict[str, Any]:
    return {
        "services": _seed_services(),
        "contacts": _seed_contacts(),
        "envelopeClues": _seed_envelope_clues(),
        "lists": _seed_lists(),
        "howToUpdate": _seed_how_to_update(),
    }


def _mark_incomplete_service(service: dict[str, Any]) -> bool:
    required = ["serviceId", "serviceName"]
    return not all(str(service.get(field, "")).strip() for field in required)


def import_eservices_knowledge_base_from_xlsx(file_path: str) -> ImportResult:
    path = Path(file_path)
    data = _load_seed_data()
    warnings: list[str] = []

    if path.exists():
        # Soft support: if user exports sheets as CSV blocks into one file, parse basic markers.
        # If not available, we keep bundled seed rows from specification.
        blob = path.read_bytes()
        parsed_services = _read_csv_sheet(blob, "Services")
        if parsed_services:
            data["services"] = []
            for row in parsed_services:
                service = {
                    "serviceId": row.get("service_id", "").strip(),
                    "serviceName": row.get("service_name", "").strip(),
                    "institution": row.get("institution", "").strip(),
                    "orgLevel": row.get("org_level", "").strip(),
                    "serviceChannel": row.get("service_channel", "").strip(),
                    "serviceCategory": row.get("service_category", "").strip(),
                    "lifeEventCategory": row.get("life_event_category", "").strip(),
                    "routePriority": row.get("route_priority", "normal").strip(),
                    "status": _parse_status(row.get("status", "draft")),
                    "keywordsSynonyms": _split_ids(row.get("keywords_synonyms", "").replace("|", ";")),
                    "userPhrasesExamples": _split_ids(
                        row.get("user_phrases_examples", "").replace("|", ";")
                    ),
                    "readyToUseInstructionCopy": row.get("ready_to_use_instruction_copy", "").strip(),
                    "relatedContactIds": _split_ids(row.get("related_contact_ids", "")),
                    "relatedEnvelopeClueIds": _split_ids(row.get("related_envelope_clue_ids", "")),
                }
                if _mark_incomplete_service(service):
                    service["status"] = "draft"
                    service["isIncomplete"] = True
                    warnings.append(f"Nepotpun servis red označen kao draft: {service.get('serviceId','')}")
                data["services"].append(service)

    # Link relationships and generate search keys.
    contacts_map = {row["contactId"]: row for row in data["contacts"]}
    clues_map = {row["clueId"]: row for row in data["envelopeClues"]}
    for service in data["services"]:
        service["status"] = _parse_status(str(service.get("status", "draft")))
        service["searchKey"] = service.get("searchKey") or _search_key(
            str(service.get("serviceName", "")),
            str(service.get("institution", "")),
            " ".join(str(item) for item in service.get("keywordsSynonyms", [])),
            " ".join(str(item) for item in service.get("userPhrasesExamples", [])),
        )
        service["relatedContactIds"] = [
            ref for ref in service.get("relatedContactIds", []) if ref in contacts_map
        ]
        service["relatedEnvelopeClueIds"] = [
            ref for ref in service.get("relatedEnvelopeClueIds", []) if ref in clues_map
        ]

    for clue in data["envelopeClues"]:
        clue["status"] = _parse_status(str(clue.get("status", "draft")))
        clue["searchKey"] = clue.get("searchKey") or _search_key(
            str(clue.get("documentType", "")),
            str(clue.get("issuingBodyName", "")),
            str(clue.get("visibleLabelForCaseNumber", "")),
            str(clue.get("upisnikCode", "")),
            str(clue.get("caseNumberPatternExample", "")),
        )
        clue["mappedContactIds"] = [ref for ref in clue.get("mappedContactIds", []) if ref in contacts_map]

    for contact in data["contacts"]:
        contact["status"] = _parse_status(str(contact.get("status", "draft")))
        contact["searchKey"] = contact.get("searchKey") or _search_key(
            str(contact.get("orgName", "")),
            str(contact.get("institution", "")),
            str(contact.get("contactPurpose", "")),
            str(contact.get("notesForAgent", "")),
        )

    kb_version = datetime.now(UTC).strftime("kb-%Y%m%d%H%M%S")
    payload = {
        "adminKnowledgeBaseVersion": kb_version,
        "importedAt": datetime.now(UTC).isoformat(),
        "services": data["services"],
        "contacts": data["contacts"],
        "envelopeClues": data["envelopeClues"],
        "lists": data["lists"],
        "howToUpdate": data["howToUpdate"],
    }
    KB_PATH.parent.mkdir(parents=True, exist_ok=True)
    KB_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    return ImportResult(
        imported_services=len(data["services"]),
        imported_contacts=len(data["contacts"]),
        imported_envelope_clues=len(data["envelopeClues"]),
        kb_version=kb_version,
        warnings=warnings,
    )

