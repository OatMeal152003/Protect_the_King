---
name: caching-principles
description: High-performance caching principles covering HTTP Cache-Control, CDN edge caching, Redis cache-aside patterns, cache stampede locks, and invalidation strategies.
department: backend
ownerAgent: frodo
triggerCommand: /caching-principles
antiPatternsPrevented:
  - AP-1
  - AP-4
  - AP-18
  - AP-26
  - AP-28
---

# Caching Principles & Invalidation Strategies

## 0. Identity

- **Role:** High-Performance Distributed Caching Architect. Governs HTTP caching headers, CDN surrogate key invalidation, application cache-aside patterns, cache stampede prevention, and deterministic TTL policies.
- **Authority:** Normative tier-4 standard for caching strategies under `skills/backend/caching-principles/`.
- **Must not define:** Relational table DDL or client-side UI render trees.
- **Normative base:** `core/fellowship/frodo.md`, `rules/engineering/architecture-boundaries.md`, `rules/common/code-style-standards.md`, `references/anti-patterns.md`.
- **Anti-pattern gate:** Blocks AP-1 (unbounded cache lifecycles), AP-18 (unindexed cache keys), and AP-26 (leaking sensitive personal data into shared caches).

## 1. Intent (9 Dimensions)

| #   | Dimension        | Value                                                                                                  |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | Task             | Architect, implement, and benchmark multi-tier caching topologies and invalidation lifecycles.         |
| 2   | Target Tool      | Redis, Memcached, Cloudflare, Fastly, AWS CloudFront, Node.js, Go, Python.                             |
| 3   | Output Format    | Cache-aside wrappers, HTTP Cache-Control header middleware, and distributed lock scripts.              |
| 4   | Constraints      | Mandatory TTL on all cached entries. Jitter on expirations. Zero sensitive PII in public caches.       |
| 5   | Input            | Traffic profiles, read-to-write ratios, data volatility metrics, latency SLA targets.                  |
| 6   | Context          | Prevents origin database saturation, thundering herd failures, and stale read inconsistencies.         |
| 7   | Audience         | Backend engineers, distributed systems developers, platform reliability teams.                         |
| 8   | Success Criteria | 90 percent plus cache hit ratio; sub-2 millisecond cache read latency; zero database thundering herds. |
| 9   | Examples         | See Section 5.                                                                                         |

## 2. Trigger Matrix

| Trigger Condition                                         | Fire? | Action / Route                                                 |
| --------------------------------------------------------- | ----- | -------------------------------------------------------------- |
| Implementing in-memory caching for database query results | YES   | Apply Cache-Aside pattern with jittered TTL and stampede lock. |
| Configuring public HTTP static asset or API caching       | YES   | Emit RFC 9111 Cache-Control and ETag headers.                  |
| Purging CDN edge caches on content updates                | YES   | Implement surrogate-key or tag-based edge purge requests.      |
| Managing primary persistent database storage              | NO    | Route to `skills/backend/database-principles/`.                |

## 3. Core Architectural Directives

1. **Deterministic Cache-Aside Pattern:** Check cache first. On a cache miss, fetch from the database, populate the cache with an explicit time-to-live (TTL), and return the data. Never write to cache without a TTL.
2. **Cache Stampede (Thundering Herd) Mitigation:** On high-traffic key expiration, multiple parallel requests must not hit the origin simultaneously. Use distributed mutex locks (Redlock or `SETNX`) so only one worker refreshes the cache while other requests wait or return stale-while-revalidate content.
3. **Jittered Expiration Windows:** Add random variance (between 10 and 20 percent) to TTL durations to prevent synchronized mass expiration of keys populated at the same time.
4. **Zero PII in Shared Caches:** Never store passwords, authentication tokens, payment details, or personal information in shared CDN or multi-tenant Redis keys without tenant-isolated prefixes (`tenant:{id}:user:{id}`).
5. **HTTP Cache Header Discipline:**
   - Public, immutable assets: `Cache-Control: public, max-age=31536000, immutable`.
   - Dynamic authenticated responses: `Cache-Control: private, no-cache, must-revalidate`.
   - Semi-static API responses: `Cache-Control: public, max-age=300, stale-while-revalidate=60`.

## 4. Execution Workflow

### Step 1: Topology and TTL Determination

- **Action:** Evaluate data volatility. Assign TTL: 5 minutes for dynamic data, 1 hour for catalogs, 24 hours for reference data.
- **Validation:** Every cache key structure includes namespace, version, and unique entity identifier (`cache:users:v1:{id}`).

### Step 2: In-Memory Implementation & Locking

- **Action:** Implement cache-aside query function with a distributed lock fallback to protect origin storage.
- **Validation:** Parallel concurrent requests for the same expired key execute exactly one database query.

### Step 3: Invalidation Hook Registration

- **Action:** Wire write operations to delete or invalidate the corresponding cache key immediately upon database commit.
- **Validation:** Subsequent read immediately reflects updated persistent state.

## 5. Reference Implementation

### TypeScript (Cache-Aside with Mutex Stampede Protection)

```typescript
import { Redis } from "ioredis";

export class CacheService {
  constructor(
    private readonly redis: Redis,
    private readonly defaultTtlSeconds: number = 300,
  ) {}

  /**
   * Retrieves data from cache or executes loader with stampede protection.
   */
  async getOrSet<T>(
    key: string,
    loader: () => Promise<T>,
    ttlSeconds: number = this.defaultTtlSeconds,
  ): Promise<T> {
    const cached = await this.redis.get(key);
    if (cached) {
      return JSON.parse(cached) as T;
    }

    // Acquire distributed lock to prevent thundering herd
    const lockKey = `lock:${key}`;
    const acquired = await this.redis.set(lockKey, "locked", "EX", 5, "NX");

    if (!acquired) {
      // Wait briefly and retry reading from cache while winner computes
      await new Promise((resolve) => setTimeout(resolve, 50));
      return this.getOrSet(key, loader, ttlSeconds);
    }

    try {
      // Double-check cache in case another worker populated it
      const doubleCheck = await this.redis.get(key);
      if (doubleCheck) {
        return JSON.parse(doubleCheck) as T;
      }

      const freshData = await loader();
      // Apply 15% random jitter to TTL to prevent synchronized expiration
      const jitter = Math.floor(Math.random() * (ttlSeconds * 0.15));
      const finalTtl = ttlSeconds + jitter;

      await this.redis.setex(key, finalTtl, JSON.stringify(freshData));
      return freshData;
    } finally {
      await this.redis.del(lockKey);
    }
  }

  async invalidate(key: string): Promise<void> {
    await this.redis.del(key);
  }
}
```

## 6. Validation Gate

Run before deploying caching infrastructure:

- [ ] All cache keys are versioned and namespaced deterministically.
- [ ] Every stored key has an explicit positive TTL; zero unbounded keys exist.
- [ ] Jitter is applied to TTL values to eliminate synchronized mass expirations.
- [ ] Distributed locking or early recomputation protects against cache stampedes.
- [ ] Sensitive personal information and tokens are excluded from public caches.
- [ ] Write operations trigger deterministic cache invalidation upon transaction commit.

## 7. Versioning & Portability Matrix

- **Version:** 2.0.0
- **Changelog:**
  - `2.0.0` (2026-09-20): Elevated to Sauron Tier-5 specification with stampede mutex locks and jittered TTL implementation.

| Runtime / Harness | Status   | Notes                                    |
| ----------------- | -------- | ---------------------------------------- |
| Claude Code       | verified | Fully supported via command integration. |
| Cursor            | verified | Compatible with editor rule context.     |
| Windsurf          | verified | Fully functional.                        |
| Antigravity       | verified | Certified.                               |
