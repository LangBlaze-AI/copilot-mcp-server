# Copilot MCP Server

An MCP (Model Context Protocol) server that wraps the GitHub Copilot CLI, letting coding agents invoke `ask`, `suggest`, and `explain` capabilities over MCP with zero friction.

## Prerequisites

- **GitHub Copilot subscription** (Pro, Pro+, Business, or Enterprise)
- **Node.js 22+**

## Install Copilot CLI

**npm (all platforms, requires Node.js 22+):**
```bash
npm install -g @github/copilot
```

**macOS / Linux (Homebrew):**
```bash
brew install copilot-cli
```

**Windows (WinGet):**
```bash
winget install GitHub.Copilot
```

**Script (macOS / Linux):**
```bash
curl -fsSL https://gh.io/copilot-install | bash
```

After installing, verify the binary is available:
```bash
copilot --version
```

## Authenticate

**Option A: Environment variable (recommended for MCP servers)**

Set one of the following (highest priority first):
```bash
export COPILOT_GITHUB_TOKEN="ghp_your_token_here"  # recommended
# or
export GITHUB_TOKEN="ghp_your_token_here"
# or
export GH_TOKEN="ghp_your_token_here"
```

Your GitHub Personal Access Token must have the **Copilot Requests** permission enabled.

**Option B: Interactive login (first-time setup)**
```bash
copilot
# Type: /login
# Follow the on-screen instructions
```

## Add to Claude Code

```bash
claude mcp add copilot-cli -- npx -y copilot-mcp-server
```

Or add manually to your MCP config:
```json
{
  "mcpServers": {
    "copilot-cli": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "copilot-mcp-server"]
    }
  }
}
```

## Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `ask` | Ask a natural language question and receive a Copilot agent response | `prompt` (required), `model` (optional), `addDir` (optional) |
| `suggest` | Get a command suggestion for a task description | `prompt` (required), `target` (`shell`\|`git`\|`gh`, optional), `model` (optional), `addDir` (optional) |
| `explain` | Get a plain-language explanation of a shell command | `command` (required), `model` (optional), `addDir` (optional) |
| `ping` | Verify the MCP server is running | none |

## Model Selection

Pass the `model` parameter to `ask`, `suggest`, or `explain`:

```
Use ask with model "gpt-4o" to analyze this function
Use ask with model "claude-sonnet-4-5" to refactor this module
```

**Default model:** `gpt-4.1`

**Available models include:** `gpt-4.1`, `gpt-4o`, `claude-sonnet-4-5`, `claude-opus-4-5`, `gemini-2.0-flash`, and others accepted by the Copilot CLI.

> **Note:** Claude and Gemini models may require prior interactive activation. Run `copilot` interactively, select the model via `/model`, and confirm it works before using it via the MCP server. The default model `gpt-4.1` works immediately without activation.

## Additional Directories

Pass the `addDir` parameter to expose additional filesystem paths to the Copilot agent:

```
Use ask with addDir "/path/to/project" to answer questions about that project
```

## Security Note: --allow-all-tools

This server passes `--allow-all-tools` to every Copilot invocation. This flag permits the Copilot agent to execute shell commands, read files, and make network requests on your behalf. Only use this server in trusted environments and with prompts you control.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `COPILOT_GITHUB_TOKEN` | GitHub PAT for authentication (highest priority, requires Copilot Requests permission) |
| `GITHUB_TOKEN` | GitHub token fallback |
| `GH_TOKEN` | GitHub token fallback (used by gh CLI) |
| `COPILOT_BINARY_PATH` | Override the default `copilot` binary location (for non-PATH installs) |

## Known Limitations

- **Interactive activation required for some models:** Claude and Gemini model families must be activated interactively (via `copilot` TUI) before they work reliably in non-interactive `-p` mode.
- **Auth token fallback behavior:** When `COPILOT_GITHUB_TOKEN` is set to an invalid value, the CLI may silently fall through to stored keyring credentials rather than failing immediately. Verify authentication by running `copilot` interactively if unexpected behavior occurs.
- **`--allow-all-tools` is hardcoded:** The security flag cannot be disabled from the MCP interface. See Security Note above.

## Development

```bash
npm install
npm run build
npm test
```

## License

ISC
