---
name: playwright-visual-testing-fixtures
description: Hermetic browser automation fixtures, visual snapshot diffing, pixel tolerance thresholds, and animation stabilization.
department: quality
ownerAgent: merry
triggerCommand: /playwright-visual-testing-fixtures
antiPatternsPrevented:
  - AP-1
  - AP-6
  - AP-18
  - AP-26
---

# Playwright Visual Testing Fixtures

## 0. Identity

- **Role:** Visual QA Automation Lead. Implements pixel-accurate visual regression test suites and hermetic browser execution fixtures.
- **Authority:** Normative specification under `skills/quality/playwright-visual-testing-fixtures/`.
- **Must not define:** Backend database migrations.
- **Normative base:** `core/fellowship/merry.md`, `rules/engineering/architecture-boundaries.md`, `rules/common/code-style-standards.md`, `references/anti-patterns.md`, `context/core-domains/testing-strategy.md`.

## 1. Intent (9 Dimensions)

| #   | Dimension        | Value                                                                                         |
| --- | ---------------- | --------------------------------------------------------------------------------------------- |
| 1   | Task             | Automate screenshot comparison tests with deterministic font and animation stabilization.     |
| 2   | Target Tool      | Playwright Test runner, Chromium, WebKit, Firefox engines.                                    |
| 3   | Output Format    | Visual test scripts, snapshot baseline artifacts, and HTML diff reports.                      |
| 4   | Constraints      | Freeze all animations, disable caret blinking, and mock network APIs before snapshot capture. |
| 5   | Input            | Frontend component specifications, responsive design targets, viewport configurations.        |
| 6   | Context          | Prevents silent UI visual breakages, css regressions, and cross-browser visual discrepancies. |
| 7   | Audience         | Frontend engineers, design systems teams, and QA specialists.                                 |
| 8   | Success Criteria | Zero false-positive flaky snapshot diffs, sub-pixel rendering stability.                      |
| 9   | Examples         | See Section 5.                                                                                |

## 2. Visual Verification Directives

1. **Deterministic Environment:** Freeze CSS animations, caret blinking, and web fonts before capturing comparison screenshots.
2. **Tolerance Thresholds:** Configure max diff pixel ratio to <= 0.02% to catch real regressions while eliminating subpixel anti-aliasing noise.
3. **Network Isolation:** Mock external API calls via Playwright route interception to guarantee static component state.
4. **Viewport Matrices:** Test components across Mobile (375x667), Tablet (768x1024), and Desktop (1440x900) views.

## 3. Test Fixture Example

```typescript
import { test as base, expect } from "@playwright/test";

export const test = base.extend({
  page: async ({ page }, use) => {
    // Force consistent deterministic font rendering & freeze animations
    await page.addInitScript(() => {
      document.head.insertAdjacentHTML(
        "beforeend",
        `
        <style>
          *, *::before, *::after {
            animation-duration: 0s !important;
            transition-duration: 0s !important;
            caret-color: transparent !important;
          }
        </style>
      `,
      );
    });
    await use(page);
  },
});

test("checkout modal matches visual snapshot", async ({ page }) => {
  await page.goto("/checkout");
  await page.waitForSelector("[data-testid='checkout-card']");
  await expect(page.locator("[data-testid='checkout-card']")).toHaveScreenshot(
    "checkout-card.png",
    {
      maxDiffPixelRatio: 0.01,
    },
  );
});
```
