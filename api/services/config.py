from __future__ import annotations

import os
from dataclasses import dataclass


def _as_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(slots=True)
class FeatureFlags:
    enable_legal_intake_agent: bool
    enable_query_preprocessor: bool
    enable_pis_on_demand_fetch: bool
    enable_legal_act_parser: bool
    enable_temporal_validity_check: bool
    enable_case_law_search: bool
    enable_research_logging: bool
    enable_post_answer_survey: bool
    enable_entity_recognition: bool
    enable_echr_check: bool


@dataclass(slots=True)
class RetrievalLimits:
    domestic_case_initial_k: int
    domestic_case_reranked_k: int
    domestic_case_analyze_k: int
    max_domestic_cases_in_answer: int
    serbia_hudoc_initial_k: int
    serbia_hudoc_reranked_k: int
    serbia_hudoc_analyze_k: int
    general_hudoc_initial_k: int
    general_hudoc_reranked_k: int
    general_hudoc_analyze_k: int
    max_echr_cases_in_answer: int


def _as_int(name: str, default: int, minimum: int = 1, maximum: int = 500) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        parsed = int(value)
    except ValueError:
        return default
    return max(minimum, min(parsed, maximum))


def get_feature_flags() -> FeatureFlags:
    return FeatureFlags(
        enable_legal_intake_agent=_as_bool("ENABLE_LEGAL_INTAKE_AGENT", True),
        enable_query_preprocessor=_as_bool("ENABLE_QUERY_PREPROCESSOR", True),
        enable_pis_on_demand_fetch=_as_bool("ENABLE_PIS_ON_DEMAND_FETCH", True),
        enable_legal_act_parser=_as_bool("ENABLE_LEGAL_ACT_PARSER", True),
        enable_temporal_validity_check=_as_bool("ENABLE_TEMPORAL_VALIDITY_CHECK", True),
        enable_case_law_search=_as_bool("ENABLE_CASE_LAW_SEARCH", True),
        enable_research_logging=_as_bool("ENABLE_RESEARCH_LOGGING", True),
        enable_post_answer_survey=_as_bool("ENABLE_POST_ANSWER_SURVEY", True),
        enable_entity_recognition=_as_bool("ENABLE_ENTITY_RECOGNITION", True),
        enable_echr_check=_as_bool("ENABLE_ECHR_CHECK", True),
    )


def get_retrieval_limits() -> RetrievalLimits:
    return RetrievalLimits(
        domestic_case_initial_k=_as_int("DOMESTIC_CASE_INITIAL_K", 50),
        domestic_case_reranked_k=_as_int("DOMESTIC_CASE_RERANKED_K", 10),
        domestic_case_analyze_k=_as_int("DOMESTIC_CASE_ANALYZE_K", 3),
        max_domestic_cases_in_answer=_as_int("MAX_DOMESTIC_CASES_IN_ANSWER", 3),
        serbia_hudoc_initial_k=_as_int("SERBIA_HUDOC_INITIAL_K", 20),
        serbia_hudoc_reranked_k=_as_int("SERBIA_HUDOC_RERANKED_K", 5),
        serbia_hudoc_analyze_k=_as_int("SERBIA_HUDOC_ANALYZE_K", 3),
        general_hudoc_initial_k=_as_int("GENERAL_HUDOC_INITIAL_K", 20),
        general_hudoc_reranked_k=_as_int("GENERAL_HUDOC_RERANKED_K", 5),
        general_hudoc_analyze_k=_as_int("GENERAL_HUDOC_ANALYZE_K", 3),
        max_echr_cases_in_answer=_as_int("MAX_ECHR_CASES_IN_ANSWER", 3),
    )


KConfig = RetrievalLimits


def get_topk_config() -> RetrievalLimits:
    return get_retrieval_limits()


DEFAULT_K_CONFIG = get_retrieval_limits()


def feature_enabled(name: str, default: bool = False) -> bool:
    return _as_bool(name, default)

