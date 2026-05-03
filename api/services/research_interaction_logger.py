from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from api.core.processor import get_runtime_data_dir
from api.services.config import get_feature_flags


LOG_PATH = get_runtime_data_dir() / "interaction_logs.jsonl"


def append_jsonl_record(filename: str, payload: dict[str, Any]) -> None:
    path = get_runtime_data_dir() / filename
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload, ensure_ascii=False) + os.linesep)
    except OSError:
        pass


class ResearchInteractionLogger:
    def __init__(self) -> None:
        self.flags = get_feature_flags()

    def log(self, payload: dict[str, Any]) -> str:
        interaction_id = str(uuid4())
        self.flags = get_feature_flags()
        if not self.flags.enable_research_logging:
            return interaction_id

        record = {
            "interactionId": interaction_id,
            "timestamp": datetime.now(UTC).isoformat(),
            **payload,
        }

        try:
            LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
            with LOG_PATH.open("a", encoding="utf-8") as log_file:
                log_file.write(json.dumps(record, ensure_ascii=False) + os.linesep)
        except OSError:
            # Logging must never break chat flow.
            pass
        return interaction_id


interaction_logger = ResearchInteractionLogger()
