from __future__ import annotations

import json
import os
from urllib import error as urllib_error
from urllib import request as urllib_request
from typing import Any

from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import FAISS
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

from api.core.processor import StoredDocument, get_runtime_data_dir, normalize_serbian_text


class SerbianRAGEngine:
    def __init__(self) -> None:
        self.index_path = get_runtime_data_dir() / "index"
        self.index_path.mkdir(parents=True, exist_ok=True)
        self.retrieval_k = max(int(os.getenv("RAG_RETRIEVAL_K", "12")), 4)
        self.answer_top_k = max(int(os.getenv("RAG_ANSWER_TOP_K", "4")), 1)
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
            "Ako podaci nisu dostupni u priloženim izvorima, to jasno naglasi."
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
        return len(langchain_docs)

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
        selected_results = ranked_results[: self.answer_top_k]

        context_parts: list[str] = []
        citations: list[dict[str, Any]] = []
        for doc, raw_score in selected_results:
            confidence = round(max(0.0, min(float(raw_score), 1.0)), 3)
            context_parts.append(doc.page_content)
            citations.append(
                {
                    "source": doc.metadata.get("source", "Nepoznati dokument"),
                    "chunk": doc.metadata.get("chunk", 0),
                    "confidence": confidence,
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
