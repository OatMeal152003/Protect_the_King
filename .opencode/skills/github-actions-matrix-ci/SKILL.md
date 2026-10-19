---
name: github-actions-matrix-ci
description: Reusable GitHub Actions workflows, matrix test suites across runtimes, deterministic cache pinning, and pipeline gates.
department: devops
ownerAgent: samwise
triggerCommand: /github-actions-matrix-ci
antiPatternsPrevented:
  - AP-1
  - AP-6
  - AP-18
  - AP-26
---

# GitHub Actions Matrix CI

## 0. Identity

- **Role:** Continuous Integration Architect. Designs parallel execution matrices, deterministic dependency caching, and fail-fast pipeline policies.
- **Authority:** Normative specification under `skills/devops/github-actions-matrix-ci/`.
- **Must not define:** Application business logic.
- **Normative base:** `core/fellowship/samwise.md`, `rules/engineering/architecture-boundaries.md`, `rules/common/code-style-standards.md`, `references/anti-patterns.md`.

## 1. Intent (9 Dimensions)

| #   | Dimension        | Value                                                                                         |
| --- | ---------------- | --------------------------------------------------------------------------------------------- |
| 1   | Task             | Construct hermetic, parallel CI matrices across Node, Go, Python, and OS environments.        |
| 2   | Target Tool      | GitHub Actions, GitHub Runners, action-cache, docker buildx.                                  |
| 3   | Output Format    | Clean YAML workflow files (`.github/workflows/*.yml`).                                        |
| 4   | Constraints      | Pin all external actions by full 40-character commit SHA. Prohibit mutable tags.              |
| 5   | Input            | Test suites, linting rules, build scripts, deployment environments.                           |
| 6   | Context          | Prevents supply-chain attacks, slow un-cached builds, and platform compatibility regressions. |
| 7   | Audience         | DevOps engineers and developer productivity leads.                                            |
| 8   | Success Criteria | Total pipeline completion under 5 minutes, 100% SHA pinning, zero flaky cache misses.         |
| 9   | Examples         | See Section 5.                                                                                |

## 2. CI Pipeline Directives

1. **Deterministic Lockfile Pinning:** Use strict hash verification for runner tool installations and dependency lockfiles.
2. **Hermetic Matrix Partitioning:** Separate unit tests, integration tests, and static linting into independent parallel jobs.
3. **Security Perimeter:** Pin all third-party GitHub Actions to full commit SHA hashes rather than mutable branch tags.
4. **Fail-Fast Strategy:** Configure `fail-fast: false` when running multi-version matrix audits to view full failure diagnostic trees.

## 3. Workflow Manifest Example

```yaml
name: Continuous Integration

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

permissions:
  contents: read

jobs:
  test-matrix:
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
        node-version: [20.x, 22.x]

    steps:
      - name: Checkout Code
        uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1

      - name: Setup Node
        uses: actions/setup-node@60edb5dd545a775178f525247059d6172fe8d310 # v4.0.2
        with:
          node-version: ${{ matrix.node-version }}
          cache: "npm"

      - name: Install Dependencies
        run: npm ci

      - name: Execute Tests
        run: npm test
```
