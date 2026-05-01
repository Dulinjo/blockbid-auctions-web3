from __future__ import annotations

from pathlib import Path

import fitz
from docx import Document as DocxDocument
from odf import teletype
from odf.opendocument import OpenDocumentText
from odf.text import P


BASE_DIR = Path(__file__).resolve().parents[1]
DOCS_DIR = BASE_DIR / "data" / "documents"

DOCX_TEXT = (
    "UGOVOR O DELU\n\n"
    "Član 1.\n"
    "Naručilac poverava Izvršiocu izradu pravnog mišljenja povodom tumačenja klauzule o odgovornosti.\n\n"
    "Član 2.\n"
    "Izvršilac je dužan da posao izvrši savesno, u skladu sa pravilima struke i u ugovorenom roku.\n\n"
    "Član 3.\n"
    "U slučaju kašnjenja, naručilac ima pravo na srazmerno umanjenje naknade i naknadu stvarne štete."
)

ODT_TEXT = (
    "OBAVEŠTENJE O OTKAZU UGOVORA O RADU\n\n"
    "Poslodavac obaveštava zaposlenog da se otkaz ugovora o radu daje iz razloga povrede radne obaveze.\n"
    "Zaposleni ima pravo da u zakonskom roku pokrene postupak zaštite prava pred nadležnim sudom.\n"
    "Ovo obaveštenje sadrži pouku o pravnom leku i rokovima za izjavljivanje zahteva."
)

PDF_TEXT = (
    "IZVOD IZ PRAVILNIKA O PARNIČNOM POSTUPKU\n\n"
    "Tužba mora sadržati određeni tužbeni zahtev, činjenice i predložene dokaze.\n"
    "Sud vodi računa o načelu kontradiktornosti i jednakosti stranaka.\n"
    "Dokazni predlozi se ocenjuju u skladu sa pravilima slobodnog sudijskog uverenja."
)


def _write_docx(path: Path, content: str) -> None:
    doc = DocxDocument()
    for paragraph in content.split("\n\n"):
        doc.add_paragraph(paragraph)
    doc.save(path)


def _write_odt(path: Path, content: str) -> None:
    doc = OpenDocumentText()
    for paragraph in content.split("\n"):
        element = P()
        teletype.addTextToElement(element, paragraph)
        doc.text.addElement(element)
    doc.save(path)


def _write_pdf(path: Path, content: str) -> None:
    pdf = fitz.open()
    page = pdf.new_page()
    page.insert_text((72, 72), content, fontsize=11)
    pdf.save(path)
    pdf.close()


def main() -> None:
    DOCS_DIR.mkdir(parents=True, exist_ok=True)
    created_files: list[Path] = []

    docx_path = DOCS_DIR / "primer_ugovor_o_delu.docx"
    odt_path = DOCS_DIR / "obavestenje_o_otkazu.odt"
    pdf_path = DOCS_DIR / "izvod_iz_pravilnika.pdf"

    _write_docx(docx_path, DOCX_TEXT)
    _write_odt(odt_path, ODT_TEXT)
    _write_pdf(pdf_path, PDF_TEXT)

    created_files.extend([docx_path, odt_path, pdf_path])

    print("Kreirani uzorni dokumenti:")
    for path in created_files:
        print(f"- {path.relative_to(BASE_DIR)}")

    print("\nDokumenti su spremni za direktan upload i indeksiranje u LexVibe admin panelu.")


if __name__ == "__main__":
    main()
