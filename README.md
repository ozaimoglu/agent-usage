<div align="center">
  <img src="build/icon.png" alt="Agent Usage robot" width="104" height="104">
  <h1>Agent Usage</h1>
  <p>Codex, Gemini, Qwen, OpenCode, Cursor, GitHub Copilot, Claude Code, and Z.ai in one compact menu bar and tray app.</p>

  <a href="https://github.com/ozaimoglu/agent-usage/actions/workflows/ci.yml"><img src="https://github.com/ozaimoglu/agent-usage/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/ozaimoglu/agent-usage/releases/latest"><img src="https://img.shields.io/github/v/release/ozaimoglu/agent-usage?include_prereleases&amp;sort=semver" alt="Latest release"></a>
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux-555?logo=apple&amp;logoColor=white" alt="Platform: macOS and Linux">
</div>

Agent Usage is a local-first desktop utility for checking AI coding-agent quotas without reopening every CLI. It provides a minimal, content-sized panel with reset times, stale-cache handling, provider controls, and Turkish/English localization.

> [!IMPORTANT]
> Agent Usage is an unofficial community project. It is not affiliated with, endorsed by, or sponsored by OpenAI, Anthropic, Google, Alibaba/Qwen, OpenCode, Cursor, GitHub, or Z.ai.

## Preview

<table>
  <tr>
    <td align="center"><strong>Detailed panel</strong></td>
    <td align="center"><strong>Quick tray menu</strong></td>
  </tr>
  <tr>
    <td><img src="docs/images/panel.png" alt="Agent Usage detailed provider panel" width="430"></td>
    <td><img src="docs/images/tray-menu.png" alt="Agent Usage quick tray menu with text bars" width="430"></td>
  </tr>
</table>

## Features

- One-click tray summary with consistently aligned text-based quota bars
- Compact usage panel that grows with its content, closes when focus moves away, and opens without preselecting an action
- Remaining percentages and human-readable reset times when providers expose reliable quota data
- Codex, Agy/Gemini, Gemini CLI, Qwen Code, OpenCode, Cursor CLI, GitHub Copilot CLI, Claude Code, and Z.ai adapters
- One-time automatic discovery that enables installed CLIs without overriding later user choices
- Automatic discovery of multiple local Codex profiles
- Individual provider enable/disable controls
- Five-minute background refresh with a local stale-cache fallback
- Optional start at login
- Turkish and English interface
- DMG and ZIP packages for Apple Silicon and Intel Macs
- Debian and AppImage packages for Ubuntu-compatible x64 systems
- No analytics, advertising, telemetry, or project-operated backend

## Install

Download the latest package from [GitHub Releases](https://github.com/ozaimoglu/agent-usage/releases/latest).

### macOS

Download the DMG matching your Mac:

- `arm64` for Apple Silicon (M1 or newer)
- `x64` for Intel Macs

Open the DMG and drag **Agent Usage** into **Applications**. Release builds are not currently notarized, so on first launch Control-click the app, choose **Open**, and confirm. The app then lives in the macOS menu bar rather than the Dock.

### Debian / Ubuntu

```bash
sudo apt install ./Agent-Usage-<version>-amd64.deb
```

Launch **Agent Usage** from the application menu after installation.

### AppImage

```bash
chmod +x Agent-Usage-<version>-x86_64.AppImage
./Agent-Usage-<version>-x86_64.AppImage
```

The application itself must run as the signed-in desktop user. Root access is only needed to install the Debian package.

## Connect your accounts

Agent Usage does not create accounts or bundle credentials. Install and sign in to each provider's normal CLI as the same desktop user, then start Agent Usage. Existing sessions are detected automatically.

| Provider | How usage is detected |
| --- | --- |
| **Codex** | Runs the installed `codex` CLI. Without an explicit `CODEX_HOME`, the default profile and top-level `~/.codex-*` sibling profiles are discovered. With `CODEX_HOME` set, only that profile is used. |
| **Agy / Gemini** | Runs the installed `agy` CLI and reads the limits returned for its current signed-in session. |
| **Gemini CLI** | Detects the installed `gemini` CLI. Gemini currently exposes quota details through its interactive `/stats model` view, so Agent Usage reports installation status without inventing a remaining percentage. |
| **Qwen Code** | Detects the installed `qwen` CLI. Qwen's interactive statistics are session/activity totals rather than a stable remaining-quota API, so Agent Usage reports installation status. |
| **OpenCode** | Detects the installed `opencode` CLI. Its `stats` command reports past token use and cost rather than remaining provider quota, so Agent Usage does not present that consumption as quota. |
| **Cursor CLI** | Detects the installed `cursor-agent` CLI and reports installation status without starting a session. |
| **GitHub Copilot CLI** | Detects the installed `copilot` CLI and reports installation status without starting a session. |
| **Claude Code** | When enabled, reads `CLAUDE_CONFIG_DIR/.credentials.json` or `~/.claude/.credentials.json` and requests Anthropic's usage endpoint. |
| **Z.ai** | After explicit consent, reads the Z.ai entry in `$XDG_DATA_HOME/opencode/auth.json` or `~/.local/share/opencode/auth.json`. |

Codex profile names are not hard-coded. For example, a custom `~/.codex-pro` directory is detected only if it exists on that user's computer; the displayed Pro/Plus plan comes from the Codex response itself. Model-specific buckets are filtered so they are not mistaken for separate accounts.

On startup, installed supported CLIs that have not been seen before are enabled automatically. If you later disable one, Agent Usage remembers that choice and does not turn it back on. Executables are searched in `PATH`, common user installation directories, NVM and Volta directories, standalone Gemini/Qwen/OpenCode directories, Apple Silicon Homebrew (`/opt/homebrew/bin`), Intel Homebrew (`/usr/local/bin`), MacPorts (`/opt/local/bin`), and standard Linux locations. Custom executable paths can be entered in Settings.

> [!WARNING]
> Do not launch Agent Usage with `sudo`. That would select root's home directory instead of the desktop user's CLI sessions.

## Settings

Open **Settings** from the tray menu or the detailed panel to:

- enable only the providers you currently use;
- configure custom CLI executable paths;
- grant or revoke Z.ai credential-file consent;
- choose Turkish, English, or the system language;
- enable or disable start at login.

Settings and cached snapshots are stored in Electron's per-user application-data directory.

## Privacy and security

- Credentials are never copied into the application package, settings, cache, screenshots, or logs.
- Codex and Agy control their own CLI network activity.
- Agent Usage contacts provider endpoints directly only for enabled Claude Code and consented Z.ai integrations.
- Disabling a provider prevents its adapter from refreshing.
- Authentication values are kept in process memory only for the relevant request.

See [PRIVACY.md](PRIVACY.md) for the exact local files and network behavior.

## Development

Requirements: Node.js 22+, npm, and macOS or an Ubuntu-compatible Linux desktop.

```bash
git clone git@github.com:ozaimoglu/agent-usage.git
cd agent-usage
npm ci
npm test
npm run typecheck
npm run dev
```

Build the renderer and Electron main process:

```bash
npm run build
```

Create artifacts for the current operating system:

```bash
npm run package
```

Or select a platform explicitly (macOS packages must be built on macOS):

```bash
npm run package:mac
npm run package:linux
```

Packages are written to `release/` and are intentionally excluded from Git.

### Architecture

The application uses Electron, React, TypeScript, typed IPC, provider adapters, and atomic local storage. Provider integrations are isolated behind a common adapter interface so additional operating systems and agents can be added without coupling them to the UI.

## Current scope

- macOS is packaged for Apple Silicon and Intel; Ubuntu-compatible Linux is packaged for x64.
- macOS release artifacts are not yet code-signed or notarized.
- Windows is not supported yet, although platform-specific behavior is isolated for a future implementation.
- Provider CLI output and private usage endpoints can change and may require adapter updates.
- This project is currently an early beta; please report regressions without attaching tokens, credentials, account identifiers, or private logs.

## Contributing

Bug reports and focused pull requests are welcome. Before opening a pull request, run:

```bash
npm test
npm run typecheck
npm run build
```

Use [GitHub Issues](https://github.com/ozaimoglu/agent-usage/issues) for bug reports and feature proposals.

## License

No open-source license has been selected yet. Unless a license is added, all rights are reserved.
