from __future__ import annotations

import os
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

        results = store.similarity_search_with_relevance_scores(normalized_query, k=4)
        if not results:
            return {
                "answer": "Nisam pronašao relevantne izvore za postavljeno pitanje.",
                "citations": [],
            }

        context_parts: list[str] = []
        citations: list[dict[str, Any]] = []
        for doc, raw_score in results:
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
