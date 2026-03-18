"""
Central constants for the BuilderAI agent service.
All magic strings and enums are defined here to avoid duplication across agents.
"""
from enum import Enum


class AgentName(str, Enum):
    ARCHITECT = "architect"
    FRONTEND = "frontend"
    BACKEND = "backend"
    INTEGRATOR = "integrator"
    QA = "qa"
    PACKAGER = "packager"


class LLMMode(str, Enum):
    CLI = "cli"
    API = "api"


class EventType(str, Enum):
    AGENT_START = "agent_start"
    AGENT_COMPLETE = "agent_complete"
    AGENT_ERROR = "agent_error"
    AGENT_RETRY = "agent_retry"
    TEXT = "text"
    FILES_UPDATE = "files_update"
    COMPLETE = "complete"
    ERROR = "error"


class ProjectStatus(str, Enum):
    DRAFT = "draft"
    BUILDING = "building"
    COMPLETE = "complete"
    FAILED = "failed"


# Pipeline execution order (matches LangGraph node sequence)
AGENT_ORDER = [
    AgentName.ARCHITECT,
    AgentName.FRONTEND,
    AgentName.BACKEND,
    AgentName.INTEGRATOR,
    AgentName.QA,
    AgentName.PACKAGER,
]
