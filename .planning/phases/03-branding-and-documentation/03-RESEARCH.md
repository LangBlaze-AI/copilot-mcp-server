# Phase 3: Branding and Documentation - Research

**Researched:** 2026-02-20
**Domain:** Package metadata, README documentation, user-facing artifact branding (no TypeScript logic changes)
**Confidence:** HIGH

**Quorum status:** SEVERELY REDUCED — Codex, Gemini, and OpenCode MCP tools require MCP function call dispatch from the primary Claude instance and are not accessible in the spawned researcher agent context. Research findings presented as Claude-only review. This matches the documented precedent from Phase 2 research (`.planning/phases/02-error-handling-and-resilience/02-RESEARCH.md` line 510). Phase 3 scope is exclusively documentation and metadata — no logic changes — which reduces the risk of single-model assessment.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CLEAN-03 | Package name, server class name, and README are updated from Codex to Copilot branding | Server class `CopilotMcpServer` already done in Phase 1. Remaining: `package.json` `name`/`description`/`bin`/`keywords`, README header and body, `.mcp.json` server key |
| CLEAN-04 | Prerequisites documentation updated: `copilot` binary install + GitHub token auth (not `codex login`) | Official GitHub Docs confirm install commands and token auth methods; all documented in Standard Stack section below |
</phase_requirements>

---

## Summary

Phase 3 is a pure branding and documentation task with no TypeScript source changes required. The `src/` layer is already fully Copilot-branded from Phases 1 and 2: class is `CopilotMcpServer`, tools are `ask`/`suggest`/`explain`/`ping`, constants reference `COPILOT_*`. The remaining Codex residue is entirely in user-facing artifacts: `package.json` metadata, `README.md`, `.mcp.json`, and the `docs/` directory.

The planner needs to know three things. First, the canonical `copilot` binary install commands verified from official GitHub Docs: `npm install -g @github/copilot` (primary), `brew install copilot-cli` (macOS/Linux), `winget install GitHub.Copilot` (Windows), and `curl -fsSL https://gh.io/copilot-install | bash` (script). Node.js 22+ is the documented minimum. Second, the authentication token precedence order for the standalone binary: `COPILOT_GITHUB_TOKEN` (highest, added v0.0.354) → `GITHUB_TOKEN` → `GH_TOKEN` → `gh` CLI auth → device flow. The token requires the "Copilot Requests" permission. Third, a known blocker documented in STATE.md must appear in the README: some models (Claude, Gemini) require prior interactive activation before non-interactive `-p` mode works reliably — users must run `copilot` once interactively per model.

The `docs/` directory contains entirely Codex-era content that is factually wrong for the Copilot integration (wrong binary, wrong auth, wrong tools). It should be deleted in its entirety. The `docs/` folder is referenced from the README `## Documentation` section — that section must be removed or replaced.

**Primary recommendation:** Delete `docs/`, rewrite `README.md` from scratch with Copilot branding and accurate prerequisites, update `package.json` metadata, rename `.mcp.json` server key — no TypeScript files touched.

---

## Audit: What Needs to Change

### Files to Change (User-Facing Artifacts)

| File | Current State | Required Change |
|------|--------------|-----------------|
| `package.json` | `name: "codex-mcp-server"`, Codex description, Codex bin key, Codex keywords, Codex repo URLs | Rename to `copilot-mcp-server`, update all Codex references |
| `README.md` | Entirely Codex-branded; wrong install commands, wrong auth, wrong tools | Full rewrite with Copilot branding |
| `.mcp.json` | Server key named `"codex-cli"` | Rename to `"copilot-cli"` |
| `docs/TODO.md` | References Codex CLI v0.98.0 features | Delete (Codex-era content) |
| `docs/session-management.md` | Documents Codex session management (deleted in Phase 1) | Delete |
| `docs/codex-cli-integration.md` | Documents Codex CLI integration | Delete |
| `docs/api-reference.md` | Documents Codex tools (codex, review, help, listSessions) | Delete |
| `docs/plan.md` | Original Codex implementation plan | Delete |

### Files Already Correct (Do Not Touch)

| File | Status |
|------|--------|
| `src/server.ts` | `CopilotMcpServer` class — already Copilot-branded |
| `src/index.ts` | Imports `CopilotMcpServer`, `SERVER_CONFIG.name = 'Copilot MCP Server'` |
| `src/tools/handlers.ts` | All Copilot-branded, no Codex references |
| `src/tools/definitions.ts` | All Copilot-branded tool definitions |
| `src/types.ts` | `TOOLS.ASK/SUGGEST/EXPLAIN/PING`, `DEFAULT_COPILOT_MODEL` |
| `src/utils/command.ts` | Binary-agnostic execution layer; Codex references only in stale comments |
| `src/__tests__/*.ts` | All rewritten in Phases 1-2; no Codex references |
| `package-lock.json` | Will regenerate automatically on next `npm install` after `package.json` name change |

### Stale Comments in src/ (Optional Cleanup, Not CLEAN-03/04 Scope)

`src/utils/command.ts` contains two comments referencing `codex` (lines 186, 255). These are internal developer notes, not user-facing. They do not affect behavior. The requirements scope CLEAN-03/04 to "user-facing artifacts" — these comments are out of scope for this phase but may be cleaned up opportunistically.

---

## Standard Stack

This phase requires no new libraries. The work is file editing only.

### Core Tools

| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| Text editor (Write tool) | — | Edit `package.json`, `README.md`, `.mcp.json` | These are JSON and Markdown files |
| `npm install` | — | Regenerate `package-lock.json` after `package.json` name change | npm auto-updates lockfile on install |

### External Prerequisite for Docs (Verified Sources)

| Prerequisite | Install Command | Source |
|-------------|----------------|--------|
| `@github/copilot` npm package | `npm install -g @github/copilot` | [GitHub Docs](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli) |
| Homebrew (macOS/Linux) | `brew install copilot-cli` | [GitHub Docs](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli) |
| WinGet (Windows) | `winget install GitHub.Copilot` | [GitHub Docs](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli) |
| Script (macOS/Linux) | `curl -fsSL https://gh.io/copilot-install \| bash` | [GitHub Docs](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli) |
| Node.js 22+ | (system requirement) | [GitHub Docs](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli) |

---

## Architecture Patterns

### Pattern 1: package.json Naming Convention

**What:** npm package name must be `copilot-mcp-server` to match the project directory, binary name, and user-facing install command.

**Required changes to `package.json`:**
```json
{
  "name": "copilot-mcp-server",
  "description": "MCP server wrapper for GitHub Copilot CLI",
  "bin": {
    "copilot-mcp-server": "dist/index.js"
  },
  "keywords": [
    "mcp",
    "copilot",
    "github",
    "claude",
    "ai",
    "cli"
  ]
}
```

**Repository/bugs/homepage URLs:** Currently point to `github.com/tuannvm/codex-mcp-server`. These should be updated to point to the actual repository for this project. If the repository has been renamed or moved, use the correct URL. If unknown, remove these fields rather than leave wrong URLs.

**The `version` field:** Currently `1.4.0` in `package.json` but `0.0.6` in `src/index.ts` `SERVER_CONFIG`. This inconsistency predates Phase 3 and is not in scope for CLEAN-03/04 — do not change either value in this phase.

### Pattern 2: README Structure for a Tool-Wrapping MCP Server

**What:** The README must answer three questions for new users: (1) how to install the prerequisite binary, (2) how to authenticate, (3) how to add this server to their MCP client.

**Recommended README structure:**
```
# Copilot MCP Server

[Brief description — what it does]

## Prerequisites
- GitHub Copilot subscription (Pro, Pro+, Business, or Enterprise)
- Node.js 22+

## Install Copilot CLI
[npm / brew / winget / script commands]

## Authenticate
[Token env vars or /login interactive]

## Add to Claude Code / MCP Client
[claude mcp add command]

## Tools
[Table: ask, suggest, explain, ping]

## Model Selection
[--model examples; interactive activation note]

## Security Note: --allow-all-tools
[Explain what it means]

## Environment Variables
[COPILOT_BINARY_PATH, COPILOT_GITHUB_TOKEN, etc.]

## Development
[npm install / build / test]

## License
```

### Pattern 3: Authentication Documentation for Token-Based Auth

**What:** The copilot binary uses environment variables for headless/CI auth. The README must document this clearly since users coming from the old Codex server expect `codex login` — the copilot binary uses a different auth model.

**Verified token precedence (from official docs + DeepWiki source):**

```
Priority order (highest to lowest):
1. COPILOT_GITHUB_TOKEN  — recommended for CI/automation; added v0.0.354
2. GITHUB_TOKEN          — fallback; widely used in CI
3. GH_TOKEN              — fallback; used by gh CLI
4. gh CLI auth session   — fallback if gh CLI is installed and logged in
5. /login interactive    — device flow; first-run on fresh install
```

**Token permission requirement:** The PAT must have the **"Copilot Requests"** permission enabled. A token without this permission fails with an auth error.

**What to document in README:**
```bash
# Option A: Environment variable (recommended for MCP servers)
export COPILOT_GITHUB_TOKEN="ghp_your_token_here"

# Option B: Interactive (first-time setup)
copilot
# Type: /login
# Follow on-screen instructions
```

### Pattern 4: --allow-all-tools Security Note

**What:** The server hardcodes `--allow-all-tools` in every copilot invocation. This is a security-relevant flag that users must understand. The README must explain it.

**Text to include:**
> This server passes `--allow-all-tools` to every Copilot invocation. This permits Copilot's agent to execute shell commands, read files, and make network requests on your behalf. Only use this server in trusted environments and with prompts you control.

### Pattern 5: Model Selection and Interactive Activation

**What:** The copilot binary supports multiple models via `--model`. Some models (Claude, Gemini families) require prior interactive activation before non-interactive `-p` mode works.

**Known working without activation:** `gpt-4.1` (default), `gpt-4o`

**Models requiring prior interactive activation:**
- `claude-sonnet-4-5`, `claude-opus-4-5`, `claude-haiku-4-5` (Claude family)
- `gemini-3-pro-preview`, `gemini-2.0-flash` (Gemini family)

**What to document:**
> To use Claude or Gemini models, run `copilot` interactively once per model (type `/model` and select the model) before using it via the MCP server. The default model `gpt-4.1` works immediately without interactive activation.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tracking which Codex references remain | Manual string search | `grep -r "codex\|Codex\|CODEX" --include="*.json" --include="*.md" .` | Systematic, catches all instances |
| Re-documenting install steps | Writing from memory | Copy directly from [GitHub Docs install page](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli) | Official source; training data may be stale |
| Regenerating package-lock.json | Manual edit | `npm install` after `package.json` change | npm handles lockfile correctly |

**Key insight:** This phase has no complex logic. The risk is omission (leaving a Codex reference) or inaccuracy (wrong install command). The mitigation is a grep-based verification step at the end.

---

## Common Pitfalls

### Pitfall 1: Partial README Rewrite Leaving Old Codex Content

**What goes wrong:** Planner tasks update the README header but leave old Codex examples, old tools table (with `codex`, `review`, `help`, `listSessions`), or old requirements section (Codex CLI v0.75.0+, OpenAI API key).
**Why it happens:** README has many independent sections; easy to miss one.
**How to avoid:** Rewrite the README entirely rather than patching. No Codex content should survive.
**Warning signs:** Any occurrence of `codex`, `Codex`, `CODEX`, `openai/codex`, `codex login`, `codex-mcp-server` in the final README.

### Pitfall 2: Leaving docs/ Directory Intact

**What goes wrong:** The planner treats `docs/` as out-of-scope because CLEAN-03/04 mentions "README" specifically. But the README currently links to `docs/api-reference.md`, `docs/session-management.md`, `docs/codex-cli-integration.md` — all of which are Codex-era content. Leaving them creates a confusing state where the README is correct but linked docs are wrong.
**Why it happens:** REQUIREMENTS.md says "README" not "docs/".
**How to avoid:** Delete the entire `docs/` directory. The README's `## Documentation` section linking to these files must also be removed.
**Warning signs:** `docs/*.md` files remaining after the phase.

### Pitfall 3: Wrong Authentication Instructions

**What goes wrong:** README says to run `copilot login --api-key` (this is the old Codex CLI pattern) or `gh auth login` alone (this authenticates gh CLI, not the copilot binary's token path directly).
**Why it happens:** Muscle memory from the Codex server; or conflating `gh` CLI auth with copilot binary auth.
**How to avoid:** Document `COPILOT_GITHUB_TOKEN` env var as primary; `/login` interactive as fallback. Never mention `codex login`.
**Warning signs:** Any `codex login` or `--api-key` in the auth section.

### Pitfall 4: package.json bin Key Mismatch with npm Run Command

**What goes wrong:** The `bin` key in `package.json` is renamed to `copilot-mcp-server` but the README still shows `npx -y codex-mcp-server`.
**Why it happens:** The bin key and the README install command are changed in separate tasks without cross-checking.
**How to avoid:** The README's MCP add command must match the package name: `npx -y copilot-mcp-server`.
**Warning signs:** `codex-mcp-server` in any `npx` or `claude mcp add` command in the README.

### Pitfall 5: .mcp.json Left with Codex Server Key

**What goes wrong:** `.mcp.json` still uses `"codex-cli"` as the server key. This is user-visible in `claude mcp list` output and in MCP client UIs.
**Why it happens:** `.mcp.json` is a small config file that's easy to overlook.
**How to avoid:** Include `.mcp.json` in the branding task.
**Warning signs:** `"codex-cli"` key remaining in `.mcp.json`.

### Pitfall 6: Version Number Inconsistency (Pre-Existing, Not This Phase's Problem)

**What goes wrong:** `package.json` says `version: "1.4.0"` but `src/index.ts` `SERVER_CONFIG.version` says `"0.0.6"`. This inconsistency exists today.
**Why it happens:** These were never synced during the Codex-to-Copilot migration.
**How to avoid:** Leave both values unchanged in this phase. Syncing version numbers is not part of CLEAN-03 or CLEAN-04. Flag it for the user as a post-phase concern.
**Warning signs:** Touching `version` in `package.json` or `src/index.ts` during this phase.

---

## Code Examples

Verified patterns from official sources:

### package.json Target State (User-Facing Fields Only)
```json
// Source: package.json field semantics — npm docs; install commands from GitHub Docs
{
  "name": "copilot-mcp-server",
  "description": "MCP server wrapper for GitHub Copilot CLI",
  "bin": {
    "copilot-mcp-server": "dist/index.js"
  },
  "keywords": [
    "mcp",
    "copilot",
    "github",
    "claude",
    "ai",
    "cli"
  ]
}
```

### README: Install Copilot CLI Section
```markdown
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
```
Source: [GitHub Docs — Installing GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli)

### README: Authentication Section
```markdown
## Authenticate

**Option A: Environment variable (recommended)**

Set one of the following (highest priority first):
```bash
export COPILOT_GITHUB_TOKEN="ghp_your_token_here"  # recommended
# or
export GITHUB_TOKEN="ghp_your_token_here"
# or
export GH_TOKEN="ghp_your_token_here"
```

Your GitHub Personal Access Token must have the **Copilot Requests** permission enabled.

**Option B: Interactive (first-time setup)**
```bash
copilot
# Type: /login
# Follow the on-screen instructions
```

A **GitHub Copilot subscription** (Pro, Pro+, Business, or Enterprise) is required.
```
Source: [GitHub Docs — Installing GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli), [Authentication & Token Management (DeepWiki)](https://deepwiki.com/github/copilot-cli/6.7-authentication-and-token-management)

### README: Add to Claude Code Section
```markdown
## Add to Claude Code

```bash
claude mcp add copilot-cli -- npx -y copilot-mcp-server
```
```

### README: Model Selection Section
```markdown
## Model Selection

Pass the `model` parameter to `ask`, `suggest`, or `explain`:

```
Use ask with model "gpt-4o" to analyze this function
Use ask with model "claude-sonnet-4-5" to refactor this module
```

**Default model:** `gpt-4.1`

**Available models include:** `gpt-4.1`, `gpt-4o`, `claude-sonnet-4-5`, `claude-opus-4-5`, `gemini-2.0-flash`, and others accepted by the Copilot CLI.

> **Note:** Claude and Gemini models may require prior interactive activation. Run `copilot` interactively, select the model via `/model`, and confirm it works before using it via the MCP server.
```

### Verification Command (End of Task)
```bash
# Verify no Codex references remain in user-facing files
grep -r "codex\|Codex\|CODEX" \
  package.json README.md .mcp.json \
  2>/dev/null | grep -v "package-lock.json"
# Expected: zero results (or only CLAUDE.md references which are meta-policy, not product)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `codex login --api-key` | `COPILOT_GITHUB_TOKEN` env var or `/login` TUI | Oct 2025 (Codex deprecated) | Auth instructions in README must change entirely |
| `npm i -g @openai/codex` | `npm install -g @github/copilot` | Oct 2025 | Install section must change |
| Tools: `codex`, `review`, `help`, `listSessions`, `ping` | Tools: `ask`, `suggest`, `explain`, `ping` | Phase 1 | Tools table in README must be rewritten |
| MCP add: `claude mcp add codex-cli -- npx -y codex-mcp-server` | `claude mcp add copilot-cli -- npx -y copilot-mcp-server` | This phase | Quick Start must be updated |

**Deprecated/outdated in user-facing docs:**
- `@openai/codex` npm package: replaced by `@github/copilot`
- `codex login`: not a command in the standalone `copilot` binary; auth is via env var or `/login` TUI
- `gpt-5.2-codex` / `gpt-5.3-codex` model names: not valid in `copilot` binary; replaced by `gpt-4.1` default
- `codex-mcp-server` package name: being replaced by `copilot-mcp-server`
- `docs/` directory content: all predates Phase 1; describes Codex tools, sessions, and integration patterns that no longer exist

---

## Open Questions

1. **Repository URLs in package.json**
   - What we know: `repository`, `bugs`, `homepage` currently point to `github.com/tuannvm/codex-mcp-server`
   - What's unclear: What is the correct repository URL for this project now?
   - Recommendation: Ask the user for the correct GitHub repository URL before updating. If unknown, remove these three fields from `package.json` rather than leave wrong URLs.

2. **README badge URLs**
   - What we know: Current README has npm version/downloads/license badges for `codex-mcp-server` npm package
   - What's unclear: Will `copilot-mcp-server` be published to npm? If not, the badges would return 404.
   - Recommendation: Remove the badges (or update to `copilot-mcp-server`) in the rewritten README. If the package is not yet published, omit npm badges.

3. **One-Click Install badges (VS Code, Cursor)**
   - What we know: Current README has VS Code and Cursor install badges with encoded configs referencing `codex-mcp-server`
   - What's unclear: The encoded URLs contain `codex-mcp-server` — should these be updated to `copilot-mcp-server`?
   - Recommendation: Remove one-click badges for now. They can be re-added with correct URLs once the package is published under the new name.

---

## Sources

### Primary (HIGH confidence)
- [GitHub Docs — Installing GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/set-up/install-copilot-cli) — install commands (npm, brew, winget, script), Node.js 22+ requirement, subscription requirement, PAT "Copilot Requests" permission
- [github/copilot-cli GitHub repository](https://github.com/github/copilot-cli) — official source
- Codebase audit (direct file reads) — current state of all user-facing artifacts

### Secondary (MEDIUM confidence)
- [DeepWiki — Authentication & Token Management](https://deepwiki.com/github/copilot-cli/6.7-authentication-and-token-management) — `COPILOT_GITHUB_TOKEN` precedence order, added v0.0.354; cross-referenced with live CLI behavior documented in `.planning/research/STACK.md`
- `.planning/research/STACK.md` — live-tested copilot CLI behavior (verification of auth token precedence, `--allow-all-tools` requirement, stdout as primary response); verified by prior researcher in Phase 1 research

### Tertiary (LOW confidence)
- [DeepWiki — Authentication Methods](https://deepwiki.com/github/copilot-cli/4.1-authentication-methods) — full token priority list; DeepWiki sources from the copilot-cli codebase; corroborates MEDIUM source above

---

## Metadata

**Confidence breakdown:**
- Branding scope (what to change): HIGH — direct codebase audit via file reads; unambiguous
- Install commands: HIGH — verified from official GitHub Docs
- Token auth precedence: MEDIUM — verified from DeepWiki + confirmed by live testing in Phase 1 research; official docs mention GH_TOKEN and GITHUB_TOKEN but do not detail COPILOT_GITHUB_TOKEN precedence explicitly
- Interactive activation requirement: MEDIUM — documented in `.planning/STATE.md` as a confirmed blocker observed during Phase 2 testing; not explicitly in official docs

**Research date:** 2026-02-20
**Valid until:** 2026-03-22 (30 days — stable domain; install commands and auth methods unlikely to change)
