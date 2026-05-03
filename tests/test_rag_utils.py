from api.core.rag import SerbianRAGEngine


def test_extract_decision_metadata_from_filename() -> None:
    engine = SerbianRAGEngine()
    metadata = engine._extract_decision_metadata("apelacioni-sud-u-beogradu-gzh1-5224-2023.pdf")
    assert metadata["court"].lower() == "apelacioni sud u beogradu"
    assert metadata["decision_number"] == "GZH1-5224/2023"


def test_bm25_scores_prefer_matching_terms() -> None:
    engine = SerbianRAGEngine()
    query = "naknada stete ugovor"
    texts = [
        "Ova presuda govori o naknadi stete i ugovornoj odgovornosti.",
        "Krivicni postupak i dokazivanje.",
    ]
    scores = engine._bm25_scores(query, texts)
    assert len(scores) == 2
    assert scores[0] > scores[1]
