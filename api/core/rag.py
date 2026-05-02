from __future__ import annotations

import json
import math
import os
import re
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from urllib import error as urllib_error
from urllib import request as urllib_request
from typing import Any

from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

from api.core.processor import (
    StoredDocument,
    SUPPORTED_EXTENSIONS,
    get_runtime_data_dir,
    normalize_serbian_text,
)

MANIFEST_PATH = get_runtime_data_dir() / "manifest.json"
TOKEN_PATTERN = re.compile(r"[a-z0-9čćžšđ]{2,}", re.IGNORECASE)


class SerbianRAGEngine:
    def __init__(self) -> None:
        self.index_path = get_runtime_data_dir() / "index"
        self.index_path.mkdir(parents=True, exist_ok=True)
        self.retrieval_k = max(int(os.getenv("RAG_RETRIEVAL_K", "12")), 4)
        self.answer_top_k = max(int(os.getenv("RAG_ANSWER_TOP_K", "4")), 1)
        self.vector_weight = min(max(float(os.getenv("RAG_VECTOR_WEIGHT", "0.72")), 0.0), 1.0)
        self.bm25_weight = 1.0 - self.vector_weight
        self.reranker_url = os.getenv("TRANSFORMER_RERANKER_URL", "").strip()
        self.reranker_api_key = os.getenv("TRANSFORMER_RERANKER_API_KEY", "").strip()
        self.reranker_timeout = max(float(os.getenv("TRANSFORMER_RERANKER_TIMEOUT", "6")), 1.0)
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=1100,
            chunk_overlap=180,
            separators=["\n\n", "\n", ". ", "; ", " ", ""],
        )
        self.system_prompt = (
            "Ti si LexVibe, profesionalni pravni AI asistent. "
            "Odgovaraj isključivo na srpskom jeziku formalnim i preciznim pravnim stilom. "
            "Ako podaci nisu dostupni u priloženim izvorima, to jasno naglasi. "
            "Ne predstavljaj odgovor kao pravni savet, već kao informativnu pravnu analizu."
        )

    def _get_openai_api_key(self) -> str:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY nije postavljen.")
        return api_key

    def _embedding_model(self) -> OpenAIEmbeddings:
        return OpenAIEmbeddings(
            model="text-embedding-3-small",
            api_key=self._get_openai_api_key(),
        )

    def _chat_model(self) -> ChatOpenAI:
        return ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0.15,
            api_key=self._get_openai_api_key(),
        )

    def _load_store(self) -> FAISS | None:
        if not (self.index_path / "index.faiss").exists():
            return None
        return FAISS.load_local(
            str(self.index_path),
            self._embedding_model(),
            allow_dangerous_deserialization=True,
        )

    def _load_manifest(self) -> dict[str, Any]:
        if not MANIFEST_PATH.exists():
            return {"updated_at": None, "documents": {}, "total_documents": 0, "total_chunks": 0}
        try:
            return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return {"updated_at": None, "documents": {}, "total_documents": 0, "total_chunks": 0}

    def _save_manifest(self, manifest: dict[str, Any]) -> None:
        MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
        MANIFEST_PATH.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def _derive_metadata_from_filename(self, filename: str) -> dict[str, str]:
        stem = Path(filename).stem
        tokens = [token for token in stem.split("-") if token]
        metadata = {
            "court": "Nepoznati sud",
            "decision_number": stem,
            "document_type": "odluka",
        }
        if len(tokens) >= 4:
            metadata["court"] = " ".join(tokens[:4]).replace("_", " ").title()
            metadata["decision_number"] = "-".join(tokens[4:]) or stem
        if "sud" in stem.lower() and metadata["court"] == "Nepoznati sud":
            metadata["court"] = stem.replace("-", " ").title()
        return metadata

    def _extract_decision_metadata(self, filename: str) -> dict[str, str]:
        metadata = self._derive_metadata_from_filename(filename)
        court = metadata.get("court", "")
        if court:
            parts = court.split(" ")
            normalized_parts = [
                part if part.lower() in {"u", "na", "i", "od"} else part.capitalize()
                for part in parts
            ]
            metadata["court"] = " ".join(normalized_parts)
        return metadata

    def _refresh_manifest(self, documents: list[StoredDocument], chunks_total: int) -> None:
        manifest = self._load_manifest()
        existing_docs = manifest.get("documents", {})
        if not isinstance(existing_docs, dict):
            existing_docs = {}

        for document in documents:
            parsed_meta = self._derive_metadata_from_filename(document.filename)
            doc_entry = existing_docs.get(document.filename, {})
            if not isinstance(doc_entry, dict):
                doc_entry = {}
            chunk_count = int(doc_entry.get("chunk_count", 0))
            existing_docs[document.filename] = {
                "filename": document.filename,
                "decision_number": parsed_meta["decision_number"],
                "court": parsed_meta["court"],
                "document_type": parsed_meta["document_type"],
                "chunks": chunk_count if chunk_count > 0 else 0,
                "uploaded_at": datetime.now(UTC).isoformat(),
            }

        runtime_docs_dir = get_runtime_data_dir() / "documents"
        supported_count = 0
        if runtime_docs_dir.exists():
            for path in runtime_docs_dir.iterdir():
                if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS:
                    supported_count += 1

        manifest["documents"] = existing_docs
        manifest["total_documents"] = supported_count
        manifest["total_chunks"] = chunks_total
        manifest["updated_at"] = datetime.now(UTC).isoformat()
        self._save_manifest(manifest)

    def _sync_manifest_chunks(self, langchain_docs: list[Document]) -> None:
        manifest = self._load_manifest()
        entries = manifest.get("documents", {})
        if not isinstance(entries, dict):
            entries = {}

        chunk_counter: Counter[str] = Counter()
        for doc in langchain_docs:
            source = str(doc.metadata.get("source", ""))
            if source:
                chunk_counter[source] += 1

        for source, value in chunk_counter.items():
            parsed_meta = self._derive_metadata_from_filename(source)
            current = entries.get(source, {})
            if not isinstance(current, dict):
                current = {}
            entries[source] = {
                "filename": source,
                "decision_number": current.get("decision_number") or parsed_meta["decision_number"],
                "court": current.get("court") or parsed_meta["court"],
                "document_type": current.get("document_type") or parsed_meta["document_type"],
                "chunks": int(value),
                "uploaded_at": current.get("uploaded_at") or datetime.now(UTC).isoformat(),
            }

        manifest["documents"] = entries
        manifest["total_documents"] = len(entries)
        manifest["total_chunks"] = len(langchain_docs)
        manifest["updated_at"] = datetime.now(UTC).isoformat()
        self._save_manifest(manifest)

    def get_dashboard_stats(self) -> dict[str, Any]:
        manifest = self._load_manifest()
        documents = manifest.get("documents", {})
        if not isinstance(documents, dict):
            documents = {}

        court_counts: dict[str, int] = {}
        for payload in documents.values():
            if not isinstance(payload, dict):
                continue
            court = str(payload.get("court") or "Nepoznati sud")
            court_counts[court] = court_counts.get(court, 0) + 1

        top_courts = sorted(
            [{"court": court, "count": count} for court, count in court_counts.items()],
            key=lambda item: item["count"],
            reverse=True,
        )[:8]

        return {
            "total_documents": int(manifest.get("total_documents", 0)),
            "total_chunks": int(manifest.get("total_chunks", 0)),
            "last_reindex_at": manifest.get("updated_at"),
            "top_courts": top_courts,
        }

    def _call_reranker(self, query: str, candidates: list[dict[str, Any]]) -> list[int]:
        payload = {"query": query, "candidates": candidates}
        request_body = json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if self.reranker_api_key:
            headers["Authorization"] = f"Bearer {self.reranker_api_key}"

        request = urllib_request.Request(
            self.reranker_url,
            data=request_body,
            headers=headers,
            method="POST",
        )
        with urllib_request.urlopen(request, timeout=self.reranker_timeout) as response:
            body = response.read().decode("utf-8")
        parsed = json.loads(body)

        if isinstance(parsed.get("ranked_indices"), list):
            ranked_indices = parsed["ranked_indices"]
        elif isinstance(parsed.get("results"), list):
            ranked_indices = [item.get("index") for item in parsed["results"] if isinstance(item, dict)]
        else:
            raise RuntimeError("Neispravan odgovor reranker servisa.")

        valid_indices: list[int] = []
        for idx in ranked_indices:
            if isinstance(idx, int) and idx not in valid_indices and 0 <= idx < len(candidates):
                valid_indices.append(idx)

        if not valid_indices:
            raise RuntimeError("Reranker nije vratio validan poredak kandidata.")
        return valid_indices

    def _rerank_results(
        self,
        query: str,
        results: list[tuple[Document, float]],
    ) -> list[tuple[Document, float]]:
        if not self.reranker_url or not results:
            return results

        candidates = [
            {
                "index": idx,
                "text": doc.page_content,
                "metadata": doc.metadata,
            }
            for idx, (doc, _) in enumerate(results)
        ]
        try:
            ordered_indices = self._call_reranker(query, candidates)
        except (
            RuntimeError,
            ValueError,
            json.JSONDecodeError,
            urllib_error.URLError,
            TimeoutError,
        ):
            return results

        ranked = [results[idx] for idx in ordered_indices]
        remaining = [result for idx, result in enumerate(results) if idx not in ordered_indices]
        return ranked + remaining

    def _stored_to_langchain_docs(self, documents: list[StoredDocument]) -> list[Document]:
        converted: list[Document] = []
        for document in documents:
            chunks = self.splitter.split_text(document.normalized_text)
            for chunk_number, chunk in enumerate(chunks, start=1):
                converted.append(
                    Document(
                        page_content=chunk,
                        metadata={
                            "source": document.filename,
                            "chunk": chunk_number,
                        },
                    )
                )
        return converted

    def add_documents(self, documents: list[StoredDocument]) -> int:
        if not documents:
            return 0

        langchain_docs = self._stored_to_langchain_docs(documents)
        if not langchain_docs:
            return 0

        existing = self._load_store()
        if existing:
            existing.add_documents(langchain_docs)
            existing.save_local(str(self.index_path))
        else:
            vectorstore = FAISS.from_documents(langchain_docs, self._embedding_model())
            vectorstore.save_local(str(self.index_path))
        self._refresh_manifest(documents, 0)
        self._sync_manifest_chunks(langchain_docs)
        return len(langchain_docs)

    def rebuild_index(self, documents: list[StoredDocument]) -> int:
        for artifact in ("index.faiss", "index.pkl"):
            target = self.index_path / artifact
            if target.exists():
                target.unlink()

        if not documents:
            return 0

        langchain_docs = self._stored_to_langchain_docs(documents)
        if not langchain_docs:
            return 0

        vectorstore = FAISS.from_documents(langchain_docs, self._embedding_model())
        vectorstore.save_local(str(self.index_path))
        self._refresh_manifest(documents, len(langchain_docs))
        self._sync_manifest_chunks(langchain_docs)
        return len(langchain_docs)

    def _tokenize_for_bm25(self, text: str) -> list[str]:
        return [token.lower() for token in TOKEN_PATTERN.findall(text)]

    def _bm25_scores(self, query: str, texts: list[str]) -> list[float]:
        docs = [Document(page_content=text) for text in texts]
        return self._score_bm25(query, docs)

    def _score_bm25(self, query: str, documents: list[Document]) -> list[float]:
        if not documents:
            return []

        tokenized_docs = [self._tokenize_for_bm25(doc.page_content) for doc in documents]
        query_tokens = self._tokenize_for_bm25(query)
        if not query_tokens:
            return [0.0 for _ in documents]

        doc_count = len(tokenized_docs)
        avg_doc_len = sum(len(doc) for doc in tokenized_docs) / max(doc_count, 1)
        k1 = 1.5
        b = 0.75

        doc_freq: dict[str, int] = {}
        for terms in tokenized_docs:
            for token in set(terms):
                doc_freq[token] = doc_freq.get(token, 0) + 1

        scores: list[float] = []
        for terms in tokenized_docs:
            term_freq = Counter(terms)
            score = 0.0
            doc_len = max(len(terms), 1)
            for token in query_tokens:
                if token not in term_freq:
                    continue
                df = doc_freq.get(token, 0)
                idf = math.log(1 + (doc_count - df + 0.5) / (df + 0.5))
                tf = term_freq[token]
                denominator = tf + k1 * (1 - b + b * (doc_len / max(avg_doc_len, 1)))
                score += idf * ((tf * (k1 + 1)) / max(denominator, 1e-9))
            scores.append(score)

        return scores

    def answer(self, query: str) -> dict[str, Any]:
        normalized_query = normalize_serbian_text(query)
        store = self._load_store()
        if not store:
            return {
                "answer": (
                    "Baza dokumenata trenutno nije indeksirana. "
                    "Administrator treba prvo da otpremi dokumente i pokrene reindeksiranje."
                ),
                "citations": [],
            }

        results = store.similarity_search_with_relevance_scores(
            normalized_query,
            k=self.retrieval_k,
        )
        if not results:
            return {
                "answer": "Nisam pronašao relevantne izvore za postavljeno pitanje.",
                "citations": [],
            }

        ranked_results = self._rerank_results(normalized_query, results)

        documents = [item[0] for item in ranked_results]
        vector_scores = [max(0.0, min(float(item[1]), 1.0)) for item in ranked_results]
        bm25_scores = self._score_bm25(normalized_query, documents)
        max_bm25 = max(bm25_scores) if bm25_scores else 0.0
        normalized_bm25 = [
            (score / max_bm25) if max_bm25 > 0 else 0.0 for score in bm25_scores
        ]

        blended: list[tuple[int, Document, float, float, float]] = []
        for idx, doc in enumerate(documents):
            vector_score = vector_scores[idx]
            bm25_score = normalized_bm25[idx] if idx < len(normalized_bm25) else 0.0
            hybrid_score = (self.vector_weight * vector_score) + (self.bm25_weight * bm25_score)
            blended.append((idx, doc, vector_score, bm25_score, hybrid_score))

        blended.sort(key=lambda item: item[4], reverse=True)
        selected_results = blended[: self.answer_top_k]

        context_parts: list[str] = []
        citations: list[dict[str, Any]] = []
        for _, doc, vector_score, bm25_score, hybrid_score in selected_results:
            confidence = round(max(0.0, min(float(hybrid_score), 1.0)), 3)
            source = str(doc.metadata.get("source", "Nepoznati dokument"))
            parsed_meta = self._derive_metadata_from_filename(source)
            context_parts.append(doc.page_content)
            citations.append(
                {
                    "source": source,
                    "chunk": doc.metadata.get("chunk", 0),
                    "confidence": confidence,
                    "vector_score": round(vector_score, 3),
                    "bm25_score": round(bm25_score, 3),
                    "hybrid_score": round(hybrid_score, 3),
                    "court": parsed_meta["court"],
                    "decision_number": parsed_meta["decision_number"],
                    "excerpt": doc.page_content[:260].strip(),
                }
            )

        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", self.system_prompt),
                (
                    "human",
                    (
                        "Pitanje korisnika:\n{question}\n\n"
                        "Dostupan pravni kontekst:\n{context}\n\n"
                        "Odgovori stručno i sažeto. "
                        "Naglasak stavi na tumačenje i relevantne rizike."
                    ),
                ),
            ]
        )

        response = self._chat_model().invoke(
            prompt.format_messages(
                question=normalized_query,
                context="\n\n---\n\n".join(context_parts),
            )
        )
        return {"answer": str(response.content), "citations": citations}


rag_engine = SerbianRAGEngine()
