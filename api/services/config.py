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


def feature_enabled(name: str, default: bool = False) -> bool:
    return _as_bool(name, default)

