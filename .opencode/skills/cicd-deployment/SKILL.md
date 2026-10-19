---
name: cicd-deployment
description: Continuous Integration and Continuous Deployment (CI/CD) standards covering fast-feedback loops, build security, artifact provenance, blue-green deployments, canary rollouts, and automated health-gated rollbacks.
department: devops
ownerAgent: samwise
triggerCommand: /cicd-deployment
antiPatternsPrevented:
  - AP-1
  - AP-4
  - AP-18
  - AP-26
  - AP-28
  - AP-44
---

# CI/CD & Progressive Deployment Principles

## 0. Identity

- **Role:** Principal Release Engineer and CI/CD Architect. Governs pipeline automation, cryptographic artifact provenance, container image immutability, canary rollouts, and automated rollback health gates.
- **Authority:** Normative tier-4 standard for deployment pipelines under `skills/devops/cicd-deployment/`.
- **Must not define:** Application UI components or database table DDL.
- **Normative base:** `core/fellowship/samwise.md`, `rules/engineering/architecture-boundaries.md`, `rules/common/code-style-standards.md`, `references/anti-patterns.md`.
- **Anti-pattern gate:** Blocks AP-1 (unbounded pipeline steps), AP-4 (unverified production deployments), and AP-44 (unlocked deployment pipelines).

## 1. Intent (9 Dimensions)

| #   | Dimension        | Value                                                                                                         |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------- |
| 1   | Task             | Architect, configure, and automate continuous integration, deployment pipelines, and release gates.           |
| 2   | Target Tool      | GitHub Actions, GitLab CI, ArgoCD, Tekton, Docker Buildx, Cosign, Sigstore.                                   |
| 3   | Output Format    | Declarative CI/CD pipeline workflows, deployment manifests, and automated health checks.                      |
| 4   | Constraints      | Pipeline execution under 10 minutes. Zero hardcoded secrets. Pin all actions to commit SHAs.                  |
| 5   | Input            | Git commits, pull requests, container specifications, deployment targets, health metrics.                     |
| 6   | Context          | Prevents broken builds reaching production, deployment downtime, security leaks, and manual release friction. |
| 7   | Audience         | DevOps engineers, site reliability engineers, software developers, security teams.                            |
| 8   | Success Criteria | 100 percent of PRs validated by automated CI; zero-downtime releases; automated rollback on health failure.   |
| 9   | Examples         | See Section 5.                                                                                                |

## 2. Trigger Matrix

| Trigger Condition                                                 | Fire? | Action / Route                                                     |
| ----------------------------------------------------------------- | ----- | ------------------------------------------------------------------ |
| Configuring CI pipeline for linting, testing, and building code   | YES   | Implement fast-feedback pipeline with parallelized test jobs.      |
| Deploying software releases to staging or production environments | YES   | Enforce canary or blue-green strategy with automated health gates. |
| Pipeline failure or post-deployment error rate spike              | YES   | Trigger automated rollback to previous verified artifact tag.      |
| Authoring raw container Dockerfiles                               | NO    | Route to `skills/devops/docker-principles/`.                       |

## 3. Core Architectural Directives

1. **Fast-Feedback Pipeline Loops:** Total CI execution time must remain under 10 minutes. Run static analysis (linting, type-checking) first in parallel with unit tests. Cache dependency directories deterministically.
2. **Immutable Artifact Promotion:** Build deployment artifacts (container images, binaries) exactly once per git commit SHA. Never recompile code between staging and production environments. Promote the identical artifact digest.
3. **Supply Chain Security & Pinning:** Pin all third-party CI actions and container base images to full immutable commit SHAs or image digests, not mutable tags like `@v4` or `:latest`. Generate Software Bill of Materials (SBOM) and sign artifacts using Cosign.
4. **Zero-Downtime Deployment Patterns:** Deploy applications using Canary or Blue/Green rollouts. Container processes must declare readiness and liveness probes. In-flight HTTP requests must drain gracefully upon process termination.
5. **Automated Health-Gated Rollbacks:** Continuously measure HTTP 5xx error rates and latency during canary rollouts. If error rates exceed 0.5 percent or readiness probes fail, trigger immediate automated rollback to the previous artifact tag without human intervention.

## 4. Execution Workflow

### Step 1: Static Verification & Fast Failure

- **Action:** Execute formatting checks, linter audits, and type verification.
- **Stop Condition:** Halt immediately if static checks fail; do not launch downstream build or test jobs.
- **Validation:** Clean syntax and type check execution.

### Step 2: Parallelized Testing & Build

- **Action:** Run unit and integration tests across parallel matrix runners. Build and sign container image.
- **Validation:** Test suite green; signed container image pushed to immutable registry.

### Step 3: Progressive Rollout & Health Evaluation

- **Action:** Deploy to 10 percent canary ring. Monitor error rate telemetry for 5 minutes.
- **Validation:** Telemetry confirms zero error regressions before promoting to 100 percent traffic.

## 5. Reference Implementation

### Declarative GitHub Actions Production Workflow Pattern

```yaml
name: Continuous Integration & Secure Delivery

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Source
        uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11 # v4.1.1

      - name: Setup Node Runtime
        uses: actions/setup-node@60edb5dd545a775178f5252478332d79620ca029 # v4.0.2
        with:
          node-version: 20
          cache: "npm"

      - name: Install Dependencies
        run: npm ci

      - name: Static Verification & Lint
        run: npm run lint

      - name: Execute Test Suite
        run: npm test -- --coverage

  build-and-sign:
    needs: verify
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    permissions:
      contents: read
      packages: write
      id-token: write
    steps:
      - name: Checkout Source
        uses: actions/checkout@b4ffde65f46336ab88eb53be808477a3936bae11

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@f95db51fddba0c2d1ec667646a06c2ce06100226 # v3.0.0

      - name: Build and Push Container Image
        uses: docker/build-push-action@4a13e500e05cf64e7086facca5d66107a6aa6182 # v5.1.0
        with:
          push: true
          tags: ghcr.io/sauron/core-api:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
```

## 6. Validation Gate

Run before certifying deployment pipelines:

- [ ] CI pipeline executes to completion in under 10 minutes.
- [ ] All external actions are pinned to immutable 40-character commit SHAs.
- [ ] Artifacts are built once and tagged with commit SHA or semantic version.
- [ ] Zero secrets or private credentials exist in pipeline definition files.
- [ ] Deployment manifests include liveness and readiness probes.
- [ ] Automated rollback logic is configured for canary regressions.

## 7. Versioning & Portability Matrix

- **Version:** 2.0.0
- **Changelog:**
  - `2.0.0` (2026-09-20): Elevated to Sauron Tier-5 specification with action pinning, artifact signing, and canary health gates.

| Runtime / Harness | Status   | Notes                                    |
| ----------------- | -------- | ---------------------------------------- |
| Claude Code       | verified | Fully supported via command integration. |
| Cursor            | verified | Compatible with editor rule context.     |
| Windsurf          | verified | Fully functional.                        |
| Antigravity       | verified | Certified.                               |
