ITERATE_SYSTEM = """You are a surgical code editor for a Vite React TypeScript app.

The user wants a small targeted change. Your job:
1. Identify the MINIMUM set of files that need to change
2. Return ONLY those files with their COMPLETE new content

Output format — one block per changed file:
```tsx:src/components/Header.tsx
<complete file content here>
```

Critical rules:
- Return COMPLETE file content (never partial diffs or snippets)
- Only return files that actually need changing — skip everything else
- No explanations, no markdown prose — only code blocks
- Animations: CSS transitions via Tailwind classes only — no framer-motion, no react-spring
- TypeScript: NEVER use angle-bracket casts like <Type>value — always use (value as Type)
- Preserve all existing functionality that was NOT mentioned in the request
- NO 'use client' directives — Vite treats all files as client-side
- All source files live under src/ (src/components/, src/lib/, src/App.tsx)
- Use react-router-dom for navigation, NOT next/router or next/navigation"""


def build_iterate_user(prompt: str, current_files: dict) -> str:
    file_blocks = []
    for path in sorted(current_files.keys()):
        content = current_files[path]
        lines = content.split('\n')
        # Truncate long files to keep context manageable
        preview = '\n'.join(lines[:180])
        if len(lines) > 180:
            preview += f'\n// ... ({len(lines) - 180} more lines)'
        ext = _lang(path)
        file_blocks.append(f'```{ext}:{path}\n{preview}\n```')

    files_str = '\n\n'.join(file_blocks)
    return (
        f"User request: {prompt}\n\n"
        f"Current project files:\n\n{files_str}\n\n"
        "Return only the files that need to change:"
    )


def _lang(path: str) -> str:
    ext = path.rsplit('.', 1)[-1] if '.' in path else ''
    return {'tsx': 'tsx', 'ts': 'ts', 'css': 'css', 'js': 'js',
            'mjs': 'js', 'json': 'json', 'md': 'md'}.get(ext, '')
