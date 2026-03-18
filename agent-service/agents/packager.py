import time
from graph.state import BuilderState
from prompts.packager_prompt import PACKAGER_SYSTEM, PACKAGER_USER
from utils.code_parser import parse_file_blocks
from utils.file_builder import add_project_metadata
from utils.llm_provider import call_llm


def packager_agent(state: BuilderState) -> BuilderState:
    """
    Packager Agent: Finalizes the project for delivery.
    Adds README, .env.example, ensures all config files are present.
    """
    start_time = time.time()
    blueprint = state.get("blueprint", {})
    integrated_files = state.get("integrated_files", {}) or {}

    CONFIG_FILES = {
        'package.json', 'tsconfig.json', 'next.config.js', 'next.config.ts', 'next.config.mjs',
        'tailwind.config.js', 'tailwind.config.ts', 'postcss.config.js', 'postcss.config.mjs',
        '.env.example', '.env.local', 'README.md', 'globals.css', 'app/globals.css',
        'src/app/globals.css', 'app/layout.tsx', 'src/app/layout.tsx',
    }
    config_parts = []
    file_listing = []
    for path, content in integrated_files.items():
        basename = path.split('/')[-1] if '/' in path else path
        if path in CONFIG_FILES or basename in CONFIG_FILES:
            config_parts.append(f"### {path}\n```\n{content}\n```")
        else:
            file_listing.append(path)

    files_summary = "\n\n".join(config_parts)
    if file_listing:
        files_summary += f"\n\n### OTHER FILES ({len(file_listing)} files)\n" + "\n".join(f"- {p}" for p in file_listing)

    user_message = PACKAGER_USER.format(
        files_summary=files_summary,
        blueprint=str(blueprint),
    )

    try:
        llm_response = call_llm(
            system_prompt=PACKAGER_SYSTEM,
            user_message=user_message,
            agent_name="packager",
            llm_mode=state.get("llm_mode"),
            llm_model=state.get("llm_model"),
        )

        raw_output = llm_response.content
        packager_updates = parse_file_blocks(raw_output)

        final_files = {**integrated_files, **packager_updates}

        app_name = blueprint.get("app_name", "My App")
        final_files = add_project_metadata(final_files, app_name)

        duration_ms = int((time.time() - start_time) * 1000)
        total_files = len(final_files)

        events = [
            {
                "type": "agent_complete",
                "agent": "packager",
                "message": f"Project packaged: {total_files} files ready",
                "duration_ms": duration_ms,
            },
            {
                "type": "text",
                "content": f"Packager Agent finalized **{total_files} files**. Your app is ready!\n\nRun `npm install && npm run dev` to start your app.\n",
            },
            {
                "type": "complete",
                "files": final_files,
                "blueprint": blueprint,
                "message": "Build complete!",
            },
        ]
        if llm_response.usage:
            input_t = llm_response.usage.get("input_tokens", 0)
            output_t = llm_response.usage.get("output_tokens", 0)
            events.append({
                "type": "usage",
                "agent": "packager",
                "input_tokens": input_t,
                "output_tokens": output_t,
                "cost_usd": round((input_t * 3.0 + output_t * 15.0) / 1_000_000, 6),
            })

        return {
            **state,
            "final_files": final_files,
            "current_agent": "complete",
            "events": events,
        }
    except Exception as e:
        app_name = blueprint.get("app_name", "My App")
        final_files = add_project_metadata(integrated_files, app_name)

        return {
            **state,
            "final_files": final_files,
            "current_agent": "complete",
            "errors": [f"Packager error: {str(e)}"],
            "events": [
                {
                    "type": "complete",
                    "files": final_files,
                    "blueprint": blueprint,
                    "message": "Build complete (with packager fallback).",
                }
            ],
        }
