---
name: naming-conventions
description: Multi-language casing standards, identifier clarity principles, layer-specific prefixes, positive booleans, and automated linting configurations across TypeScript, Python, Go, and SQL.
department: architecture
ownerAgent: samwise
triggerCommand: /naming-conventions
antiPatternsPrevented:
  - AP-1
  - AP-4
  - AP-18
  - AP-26
  - AP-28
---

# Naming Conventions & Code Semantics

## 0. Identity

- **Role:** Ubiquitous Language and Identifier Semantics Guardian. Governs naming precision, casing rules, prefix consistency, and clarity across multi-language projects.
- **Authority:** Normative tier-4 standard for identifier naming across repositories under `skills/architecture/naming-conventions/`.
- **Must not define:** Application networking protocol details or database storage engine tuning.
- **Normative base:** `core/fellowship/aragorn.md`, `rules/engineering/architecture-boundaries.md`, `rules/common/code-style-standards.md`, `references/anti-patterns.md`.
- **Anti-pattern gate:** Blocks AP-1 (vague names), AP-18 (ambiguous identifier semantics), and AP-28 (confusing double-negatives).

## 1. Intent (9 Dimensions)

| #   | Dimension        | Value                                                                                                     |
| --- | ---------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | Task             | Define, review, and automate identifier naming conventions across frontend, backend, and database layers. |
| 2   | Target Tool      | TypeScript, Python, Go, SQL, ESLint, Biome, Ruff, golangci-lint.                                          |
| 3   | Output Format    | Standardized code identifiers, linting rule configurations, and naming audit reports.                     |
| 4   | Constraints      | Strict positive booleans (no double-negatives). Ubiquitous domain language. Explicit casing per language. |
| 5   | Input            | Source code, schema models, API endpoints, variable definitions.                                          |
| 6   | Context          | Prevents misinterpretation, cognitive friction, inconsistent APIs, and confusing logic bugs.              |
| 7   | Audience         | Software developers, code reviewers, technical leads, automation engines.                                 |
| 8   | Success Criteria | 100 percent of identifiers pass automated naming linter checks; zero double-negative booleans.            |
| 9   | Examples         | See Section 5.                                                                                            |

## 2. Trigger Matrix

| Trigger Condition                                                         | Fire? | Action / Route                                              |
| ------------------------------------------------------------------------- | ----- | ----------------------------------------------------------- |
| Declaring new variables, functions, types, components, or database tables | YES   | Apply language-idiomatic casing and semantic clarity rules. |
| Reviewing code containing negative boolean flags (!isDisabled)            | YES   | Refactor to positive boolean state (isEnabled).             |
| Configuring repository linter naming rules                                | YES   | Deploy Biome / ESLint naming convention configuration.      |
| Structuring function cognitive complexity                                 | NO    | Route to `skills/architecture/function-design/`.            |

## 3. Core Architectural Directives

1. **Universal Casing Standards:**
   - **Files & Folders:** Lowercase `kebab-case` across all languages (`order-service.ts`, `auth-wizard/`).
   - **Classes, Types, Interfaces:** `PascalCase` (`OrderProcessor`, `UserProfile`).
   - **Variables & Functions:** `camelCase` in TypeScript/Go/Java (`userSession`, `calculateTotal`); `snake_case` in Python/Rust/SQL (`user_session`, `calculate_total`).
   - **Global Constants:** `UPPER_SNAKE_CASE` across all stacks (`MAX_RETRY_ATTEMPTS`, `DEFAULT_PAGE_SIZE`).
2. **Positive Boolean State Rule:** Always name boolean variables with positive intent using auxiliary verbs: `isEnabled`, `isVisible`, `hasPermission`, `canSubmit`. Never use negative names (`isNotActive`, `disabled`), which create confusing double-negative conditionals like `!isDisabled`.
3. **Canonical Verb Standardization:** Use one consistent verb across the codebase for identical operations:
   - Use `fetch` for asynchronous network/remote calls; use `get` for synchronous in-memory accessors.
   - Use `delete` for permanent resource destruction; use `remove` for collection element detachment.
4. **Symmetric Antonym Pairs:** Always pair complementary operations using standard antonyms: `open`/`close`, `start`/`stop`, `enable`/`disable`, `subscribe`/`unsubscribe`, `show`/`hide`.

## 4. Execution Workflow

### Step 1: Casing & Scope Audit

- **Action:** Verify identifier casing aligns with language idioms. Scale identifier length to scope: single letters are allowed only in 1-to-3 line loop contexts.
- **Validation:** Global and exported symbols are fully spelled out without cryptic abbreviations.

### Step 2: Boolean Normalization

- **Action:** Audit conditional logic. Invert any negative boolean flags to positive assertions.
- **Validation:** Zero instances of double-negatives (`!isUnverified`) exist in source code.

### Step 3: Domain Vocabulary Verification

- **Action:** Cross-check names against ubiquitous domain terminology.
- **Validation:** Identifiers use consistent domain terms across UI, API, and database schemas.

## 5. Reference Implementation

### TypeScript & Biome Naming Rule Configuration

```json
// biome.json (Enforcing Naming Conventions via Linter)
{
  "$schema": "https://biomejs.dev/schemas/1.8.0/schema.json",
  "linter": {
    "enabled": true,
    "rules": {
      "style": {
        "useNamingConvention": {
          "level": "error",
          "options": {
            "strictCase": true,
            "conventions": [
              {
                "selector": { "kind": "variable" },
                "formats": ["camelCase", "CONSTANT_CASE"]
              },
              {
                "selector": { "kind": "function" },
                "formats": ["camelCase"]
              },
              {
                "selector": { "kind": "typeLike" },
                "formats": ["PascalCase"]
              }
            ]
          }
        }
      }
    }
  }
}
```

```typescript
// Code Examples: Good vs Bad Naming

// FAIL: Cryptic abbreviations, negative boolean, inconsistent verb
const uData = await getRemoteUsers();
if (!uData.isNotActive) {
  delUser(uData.id);
}

// PASS: Descriptive names, positive boolean, canonical verb
const userProfile = await fetchRemoteUser(userId);
if (userProfile.isActive) {
  await deleteUser(userProfile.id);
}
```

## 6. Validation Gate

Run before accepting naming conventions pull requests:

- [ ] All source files and directories use lowercase `kebab-case`.
- [ ] Variables and functions follow language-idiomatic casing conventions.
- [ ] Boolean variables are prefixed with auxiliary verbs (`is`, `has`, `can`, `should`).
- [ ] Zero negative boolean names or double-negative conditionals exist.
- [ ] Canonical verbs (`fetch` vs `get`, `delete` vs `remove`) are consistently applied.
- [ ] Automated linter rules enforce naming conventions in CI.

## 7. Versioning & Portability Matrix

- **Version:** 2.0.0
- **Changelog:**
  - `2.0.0` (2026-09-20): Elevated to Sauron Tier-5 specification with Biome linter configuration and positive boolean rules.

| Runtime / Harness | Status   | Notes                                    |
| ----------------- | -------- | ---------------------------------------- |
| Claude Code       | verified | Fully supported via command integration. |
| Cursor            | verified | Compatible with editor rule context.     |
| Windsurf          | verified | Fully functional.                        |
| Antigravity       | verified | Certified.                               |
