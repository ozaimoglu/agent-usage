# Agent Usage

Agent Usage is an unofficial Linux tray application that displays usage limits for Codex, Agy/Gemini, Claude Code, and Z.ai Coding Plan in one compact panel.

> Agent Usage is not affiliated with, endorsed by, or sponsored by OpenAI, Anthropic, Google, or Z.ai. Product and company names belong to their respective owners.

## Status

Agent Usage is currently an early beta for Ubuntu-compatible x64 Linux desktops. The application runs as the signed-in desktop user; root access is only needed when installing the Debian package.

## Features

- Compact system-tray menu and detailed usage panel
- Codex, Agy/Gemini, Claude Code, and Z.ai providers
- Per-provider enable/disable controls
- Five-minute refresh with local stale-cache fallback
- Turkish and English interface
- Optional start at login
- Debian and AppImage packages

## Account detection

Agent Usage does not create or bundle provider accounts. Install and sign in to the provider CLI as the same desktop user before starting the application.

| Provider | Detection method |
| --- | --- |
| Codex | Runs the installed `codex` CLI using `CODEX_HOME` when explicitly set, otherwise the CLI's standard profile. |
| Agy/Gemini | Runs the installed `agy` CLI and uses its current signed-in session. |
| Claude Code | When enabled, reads the current user's `~/.claude/.credentials.json` and requests the Anthropic usage endpoint. |
| Z.ai | After explicit consent, reads the Z.ai entry from `~/.local/share/opencode/auth.json`. |

CLI executables are searched in `PATH`, common user installation directories, NVM directories, `/usr/local/bin`, `/usr/bin`, and `/snap/bin`. A custom executable path can be entered in Settings.

Do not run Agent Usage with `sudo`; doing so would use root's home directory instead of the desktop user's accounts.

## Install

Download a package from the Releases page.

Debian package:

```bash
sudo apt install ./Agent-Usage-0.1.0-amd64.deb
```

AppImage:

```bash
chmod +x Agent-Usage-0.1.0-x86_64.AppImage
./Agent-Usage-0.1.0-x86_64.AppImage
```

## Development

```bash
npm ci
npm test
npm run typecheck
npm run dev
```

Create Linux packages on Ubuntu:

```bash
npm run package
```

Artifacts are written to `release/` and are intentionally excluded from Git.

## Privacy

Agent Usage has no analytics or telemetry. Credentials are not copied into the application package or its settings. See [PRIVACY.md](PRIVACY.md) for the local files and network requests used by each provider.

## Known limitations

- Ubuntu-compatible x64 Linux is the only packaged platform today.
- Separate Codex profiles stored in different custom directories are not yet aggregated. Multiple limits returned by the active Codex profile are displayed.
- Provider CLI output and private APIs can change, requiring adapter updates.

## License

No license has been selected yet. Public source availability does not grant permission to copy, modify, or redistribute the project.
