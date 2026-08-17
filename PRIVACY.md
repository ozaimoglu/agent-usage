# Privacy

Agent Usage is a local desktop utility. It does not include analytics, telemetry, advertising, or a project-operated backend.

## Local data

The application stores settings and cached usage snapshots in Electron's per-user application data directory. Provider credentials are not copied into this storage.

- Codex usage is requested through the locally installed Codex CLI.
- Agy/Gemini usage is requested through the locally installed Agy CLI.
- Gemini CLI, Qwen Code, OpenCode, Cursor CLI, and GitHub Copilot CLI discovery checks only whether their executables exist; it does not read their credentials, histories, or start an AI request.
- Claude Code credentials are read from `CLAUDE_CONFIG_DIR/.credentials.json` or `~/.claude/.credentials.json` only while the Claude Code provider is enabled.
- Z.ai credentials are read from `$XDG_DATA_HOME/opencode/auth.json` or `~/.local/share/opencode/auth.json` only after the user grants the corresponding consent.

## Network requests

Codex and Agy control their own network activity. Discovery for Gemini CLI, Qwen Code, OpenCode, Cursor CLI, and GitHub Copilot CLI does not make a provider request. Agent Usage directly requests the provider usage endpoint for enabled Claude Code and consented Z.ai integrations. Authentication values are held in process memory for the request and are not included in usage snapshots or sanitized error messages.

## Permissions

The application must run as the signed-in desktop user so it can find that user's provider CLI sessions. It should not be run as root. Disabling a provider in Settings prevents its adapter from refreshing; disabling Z.ai credential consent prevents the Z.ai credential file from being read.

## Reporting a privacy or security issue

Please open an issue at <https://github.com/ozaimoglu/agent-usage/issues> without including credentials, tokens, account identifiers, or private logs.
