---
name: function-design
description: Function architecture rules covering cognitive complexity limits, single responsibility, pure functions, side-effect honesty, guard clauses, and JSDoc contracts.
department: architecture
ownerAgent: legolas
triggerCommand: /function-design
antiPatternsPrevented:
  - AP-1
  - AP-4
  - AP-18
  - AP-26
  - AP-28
---

# Function Design Principles

## 0. Identity

- **Role:** Code Craftsmanship and Functional Architecture Specialist. Governs cognitive complexity, function size, pure function composition, parameter immutability, and guard clause patterns.
- **Authority:** Normative tier-4 standard for function architecture across repositories under `skills/architecture/function-design/`.
- **Must not define:** Global network topology or database server configuration.
- **Normative base:** `core/fellowship/aragorn.md`, `rules/engineering/architecture-boundaries.md`, `rules/common/code-style-standards.md`, `references/anti-patterns.md`.
- **Anti-pattern gate:** Blocks AP-1 (unbounded function responsibilities) and AP-28 (unbounded nested logic loops).

## 1. Intent (9 Dimensions)

| #   | Dimension        | Value                                                                                                    |
| --- | ---------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | Task             | Shape, refactor, and document functions to achieve minimal cognitive complexity and maximum readability. |
| 2   | Target Tool      | TypeScript, JavaScript, Python, Go, Rust, Biome, SonarQube, ESLint.                                      |
| 3   | Output Format    | Refactored, testable functions with explicit JSDoc contracts and early-return guard clauses.             |
| 4   | Constraints      | Maximum cognitive complexity of 15. Maximum 2 positional parameters (use options object). No mutations.  |
| 5   | Input            | Raw function implementations, complex legacy methods, code review diffs.                                 |
| 6   | Context          | Prevents tangled logic, hidden side effects, unmaintainable nested conditionals, and fragile tests.      |
| 7   | Audience         | Software engineers, code reviewers, automated quality gates.                                             |
| 8   | Success Criteria | 100 percent of functions pass complexity gates; zero parameter reassignments; zero hidden mutations.     |
| 9   | Examples         | See Section 5.                                                                                           |

## 2. Trigger Matrix

| Trigger Condition                                           | Fire? | Action / Route                                                   |
| ----------------------------------------------------------- | ----- | ---------------------------------------------------------------- |
| Writing or refactoring complex business logic functions     | YES   | Apply single responsibility, early returns, and pure extraction. |
| Cognitive complexity exceeds 15 or nesting exceeds 3 levels | YES   | Decompose into focused step-down functions.                      |
| Function requires 3 or more arguments                       | YES   | Refactor to single structured options parameter object.          |
| Designing whole system module layout and import graphs      | NO    | Route to `skills/architecture/module-organization/`.             |

## 3. Core Architectural Directives

1. **Cognitive Complexity Ceiling:** Maintain cognitive complexity at or below 15 per function. If a function contains nested conditionals or multiple branching loops, decompose it into private helper functions.
2. **Early Return Guard Clauses:** Validate preconditions and handle error scenarios at the top of the function with immediate returns. Avoid wrapping the primary execution path in deep `if`/`else` blocks.
3. **Pure Functions and Parameter Immutability:** Functions must treat input parameters as read-only references. Never reassign incoming parameters or mutate external global state. Return new immutable data copies.
4. **Command Query Separation (CQS):** A function must either perform a state-changing mutation (command) or compute and return a value (query), never both simultaneously.

## 4. Execution Workflow

### Step 1: Precondition Guarding

- **Action:** Convert nested validation logic into flat early-return guard clauses at the function entry.
- **Validation:** Happy path runs at the lowest indentation level.

### Step 2: Parameter Normalization

- **Action:** Bundle functions taking 3 or more parameters into a single typed options object.
- **Validation:** Parameter count reduced to 1 or 2.

### Step 3: Pure Extraction & Complexity Audit

- **Action:** Extract nested sub-loops into pure helper functions.
- **Validation:** Cognitive complexity measured at or below 15.

## 5. Reference Implementation

### Before vs After: Refactoring Nested Legacy Logic to Pure Function Architecture

```typescript
// BEFORE: High cognitive complexity (Score: 22), deep nesting, parameter mutation
function processTransactionsBad(
  orders: any[],
  filterStatus: string,
  applyDiscount: boolean,
) {
  let result = [];
  if (orders && orders.length > 0) {
    for (let i = 0; i < orders.length; i++) {
      if (orders[i].status === filterStatus) {
        if (orders[i].amount > 0) {
          if (applyDiscount) {
            orders[i].amount = orders[i].amount * 0.9; // MUTATION!
          }
          result.push(orders[i]);
        }
      }
    }
  }
  return result;
}

// AFTER: Cognitive complexity (Score: 3), pure, early returns, immutable
export interface ProcessOrderOptions {
  readonly status: string;
  readonly applyDiscount: boolean;
}

export interface OrderRecord {
  readonly id: string;
  readonly status: string;
  readonly amount: number;
}

/**
 * Filters and transforms orders immutably based on processing criteria.
 *
 * @param orders - The list of candidate order records.
 * @param options - Filtering and discount parameters.
 * @returns A fresh list of processed orders.
 */
export function processOrders(
  orders: readonly OrderRecord[],
  options: ProcessOrderOptions,
): OrderRecord[] {
  if (!orders || orders.length === 0) {
    return [];
  }

  return orders
    .filter((order) => order.status === options.status && order.amount > 0)
    .map((order) => transformOrder(order, options.applyDiscount));
}

function transformOrder(
  order: OrderRecord,
  applyDiscount: boolean,
): OrderRecord {
  if (!applyDiscount) {
    return order;
  }
  return {
    ...order,
    amount: order.amount * 0.9,
  };
}
```

## 6. Validation Gate

Run before accepting function implementations:

- [ ] Cognitive complexity is verified at or below 15.
- [ ] Early-return guard clauses eliminate deep nesting (maximum 2 levels).
- [ ] Functions taking 3 or more arguments are refactored to an options object.
- [ ] Input arguments are treated as immutable; zero parameter mutations exist.
- [ ] JSDoc contracts document parameters, return values, and expected exceptions.

## 7. Versioning & Portability Matrix

- **Version:** 2.0.0
- **Changelog:**
  - `2.0.0` (2026-09-20): Elevated to Sauron Tier-5 specification with concrete before-and-after refactoring patterns.

| Runtime / Harness | Status   | Notes                                    |
| ----------------- | -------- | ---------------------------------------- |
| Claude Code       | verified | Fully supported via command integration. |
| Cursor            | verified | Compatible with editor rule context.     |
| Windsurf          | verified | Fully functional.                        |
| Antigravity       | verified | Certified.                               |
