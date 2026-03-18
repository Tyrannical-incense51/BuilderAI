from typing import TypedDict, Optional, Annotated
import operator


class BuilderState(TypedDict):
    """Shared state for the multi-agent LangGraph pipeline."""
    # Input
    project_id: str
    user_prompt: str
    conversation_history: list[dict]

    # Iteration — previous build context (None for first build)
    previous_files: Optional[dict[str, str]]
    previous_blueprint: Optional[dict]

    # LLM settings — passed from frontend per-request
    llm_mode: str                  # "cli" or "api"
    llm_model: Optional[str]       # model override (API mode only)

    # Agent outputs
    blueprint: Optional[dict]
    frontend_files: Optional[dict[str, str]]
    backend_files: Optional[dict[str, str]]
    integrated_files: Optional[dict[str, str]]
    final_files: Optional[dict[str, str]]
    _frontend_raw_output: Optional[str]  # raw LLM output for plan cross-check

    # QA
    qa_result: Optional[dict]   # {"passed": bool, "issues": list, "failed_agent": str}
    qa_feedback: Optional[dict] # QA context passed to retry agents (issues + failed_agent)
    retry_count: int
    max_retries: int

    # Status tracking
    current_agent: str
    errors: Annotated[list[str], operator.add]

    # SSE events to stream back
    events: Annotated[list[dict], operator.add]
