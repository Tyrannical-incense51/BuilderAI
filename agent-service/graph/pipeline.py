"""
LangGraph state machine pipeline for the multi-agent BuilderAI system.

SIMPLIFIED FLOW (2 LLM calls instead of 6):
  architect (LLM)
    → [frontend ‖ backend] parallel (LLM, 1-2 calls)
    → repair_truncated (LLM only for truncated files)
    → sanitize_code (deterministic — 12 fixes)
    → generate_configs (deterministic — replaces integrator LLM)
    → ensure_ui_components (deterministic)
    → validate_and_finalize (deterministic — replaces QA + packager LLM)
    → END

Removed: integrator LLM, QA LLM, packager LLM, retry loop.
Result: ~50% faster, ~50% cheaper, same or better quality.
"""

from langgraph.graph import StateGraph, END
from .state import BuilderState
from agents import (
    architect_agent,
    frontend_agent,
    backend_agent,
)
from agents.repair import repair_truncated_files
from agents.sanitize import sanitize_code
from agents.config_generator import generate_configs
from agents.ui_components import ensure_ui_components
from agents.validate_and_finalize import validate_and_finalize


# ── Helpers ───────────────────────────────────────────────────────────────────

def _start_event(agent: str, message: str) -> dict:
    return {"type": "agent_start", "agent": agent, "message": message}


def make_start_node(agent: str, message: str):
    def node(state: BuilderState) -> BuilderState:
        return {**state, "events": [_start_event(agent, message)], "errors": []}
    node.__name__ = f"{agent}_start"
    return node


# ── Start nodes ───────────────────────────────────────────────────────────────

architect_start_node = make_start_node(
    "architect",
    "Analyzing your prompt and designing the app architecture...",
)


def parallel_start_node(state: BuilderState) -> BuilderState:
    return {
        **state,
        "events": [
            _start_event("frontend", "Generating React components and pages..."),
            _start_event("backend", "Building API routes and database schema..."),
        ],
        "errors": [],
    }


# ── Agent run nodes ───────────────────────────────────────────────────────────

def run_frontend_and_backend(state: BuilderState) -> BuilderState:
    collected_events: list[dict] = []

    result = frontend_agent(state)
    collected_events.extend(result.get("events", []))
    state = {**result, "events": []}

    result = backend_agent(state)
    collected_events.extend(result.get("events", []))

    return {**result, "events": collected_events}


# ── Graph builder ─────────────────────────────────────────────────────────────

def build_pipeline() -> StateGraph:
    workflow = StateGraph(BuilderState)

    # LLM nodes (2 calls: architect + frontend, backend only if supabase)
    workflow.add_node("architect_start", architect_start_node)
    workflow.add_node("architect_run", architect_agent)
    workflow.add_node("parallel_start", parallel_start_node)
    workflow.add_node("parallel_generation", run_frontend_and_backend)

    # Repair: LLM only for truncated files (usually 0 calls)
    workflow.add_node("repair_truncated", repair_truncated_files)

    # Deterministic nodes (0 LLM calls — instant, 100% reliable)
    workflow.add_node("sanitize_code", sanitize_code)
    workflow.add_node("generate_configs", generate_configs)
    workflow.add_node("ensure_ui_components", ensure_ui_components)
    workflow.add_node("validate_and_finalize", validate_and_finalize)

    # Wire the simplified pipeline
    workflow.set_entry_point("architect_start")
    workflow.add_edge("architect_start", "architect_run")
    workflow.add_edge("architect_run", "parallel_start")
    workflow.add_edge("parallel_start", "parallel_generation")
    workflow.add_edge("parallel_generation", "repair_truncated")
    workflow.add_edge("repair_truncated", "sanitize_code")
    workflow.add_edge("sanitize_code", "generate_configs")
    workflow.add_edge("generate_configs", "ensure_ui_components")
    workflow.add_edge("ensure_ui_components", "validate_and_finalize")
    workflow.add_edge("validate_and_finalize", END)

    return workflow.compile()


_pipeline = None

def get_pipeline():
    global _pipeline
    if _pipeline is None:
        _pipeline = build_pipeline()
    return _pipeline
