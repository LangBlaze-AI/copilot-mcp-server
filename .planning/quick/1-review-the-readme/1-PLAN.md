---
task: 1
slug: review-the-readme
description: Review README.md for accuracy, completeness, and staleness against the actual source code. Fix identified issues.
mode: quick-full
date: 2026-02-20

must_haves:
  truths:
    - README accurately reflects the actual default model used in src/
    - All tool names and parameters in the README match the implemented handlers
    - Model list does not contain stale/incorrect model name versions
    - No Codex-era references remain
  artifacts:
    - README.md (updated)
  key_links:
    - README.md
    - src/index.ts
    - src/tools/handlers.ts
    - package.json
---

# Plan: Review the README

## Task 1 — Audit README accuracy against source code

**files:**
- README.md
- src/index.ts
- src/tools/handlers.ts
- package.json

**action:**
Read the source files and cross-check every claim in README.md:
1. Default model (`gpt-4.1`) — verify against `src/index.ts` or `handlers.ts`
2. Tool names (`ask`, `suggest`, `explain`, `ping`) and their parameters — verify against handler implementations
3. Model list (`claude-sonnet-4-5`, `claude-opus-4-5`, etc.) — note any version staleness (claude-sonnet-4-6 is current)
4. `npm install` package name (`@github/copilot`) — verify against any documented install path
5. Binary name (`copilot`) — verify matches what the code invokes
6. Node.js version requirement (22+) — verify against `package.json` `engines` field
7. Any remaining Codex-era references (tool IDs, binary names, URLs)

Produce a mismatch list.

**verify:** Mismatch list is complete; all claims checked against at least one source file.

**done:** Mismatch list written to task notes; no claim left unverified.

---

## Task 2 — Apply targeted fixes to README.md

**files:**
- README.md

**action:**
Apply only the fixes identified in Task 1:
- Update stale model names (e.g. `claude-sonnet-4-5` → `claude-sonnet-4-6` if confirmed stale)
- Correct any parameter names that don't match the implementation
- Fix any incorrect binary names, package names, or Node.js version requirements
- Remove or correct any Codex-era references
- Do NOT add large new sections (troubleshooting guides, badges) — scope is accuracy fixes only
- Minor clarity improvements are acceptable if found naturally during the review

Commit with: `fix(readme): correct stale model names and accuracy issues`

**verify:** `grep` README for any flagged mismatches; all resolved.

**done:** README.md committed; no known inaccuracies remain.
