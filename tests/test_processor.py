import io

import pytest

from api.core.processor import DocumentProcessingError, normalize_serbian_text, parse_and_normalize_file


def test_normalize_serbian_text_transliterates_cyrillic_and_compacts_whitespace() -> None:
    sample = "  Привредни    суд\r\n\nш\n"
    normalized = normalize_serbian_text(sample)
    assert normalized == "Privredni sud\n\nš"


def test_parse_and_normalize_file_rejects_unsupported_extension() -> None:
    with pytest.raises(DocumentProcessingError) as exc:
        parse_and_normalize_file("ugovor.txt", io.BytesIO(b"nebitan-sadrzaj"))
    assert "Nepodržan format dokumenta" in str(exc.value)
