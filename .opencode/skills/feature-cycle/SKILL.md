# Feature Cycle Skill

Use this process for EVERY feature addition, one feature per cycle. Do not skip phases. Do not batch multiple features into one implement step.

## The cycle (5 phases, in order)

### 1. PLAN
Write a short plan first and show it to the user before coding. The plan must contain:
- Goal (one feature only) + scope boundaries (what is explicitly OUT).
- Contract: new types, state fields, socket events, validation rules, error codes.
- UI changes per screen (Host / Phone), including empty/loading/error states.
- Test plan: build steps + live smoke scenario with expected PASS lines.
Keep it under ~30 lines. Stop and wait for correction if the user objects.

### 2. REVIEW THE PLAN (senior staff engineer lens)
Before implementing, review the plan AS a senior staff engineer whose job is keeping this codebase maintainable for years. Be skeptical of the plan, not supportive. Output these 3 sections:
- `Refactor first`: duplication to kill, god-functions/files to split, unsafe casts/validation to centralize, naming that will confuse future readers. These items are mandatory work inside the implement phase, not optional.
- `Risks`: stale offers/state, race conditions, money-integrity paths (NaN/negative), turn/auth bypasses, reconnect and expiry edges. For each: how the plan already handles it or what must change.
- `Simplify`: what can be cut or reused (existing events/state/helpers) so the feature lands as the smallest long-lived diff. Prefer deleting code over adding it; prefer one clear mechanism over two clever ones.

### 3. IMPLEMENT
- Smallest diff that satisfies the contract. No drive-by features.
- Server is authoritative: validate turn, ownership, funds, status, and tile kinds. Never trust client math.
- Money must never become NaN: validate every price/amount is a finite number before arithmetic.
- Clear or expire any pending offers when turns advance, players bankrupt, or games restart.
- Reuse `friendlyError` codes on the client for every new server error.

### 4. REVIEW THE IMPLEMENTATION (senior staff engineer lens)
After coding, review the diff AS a senior staff engineer guarding long-term maintainability, then verify. Refuse to mark the cycle complete if the code works but is hard to own.
1. Maintainability pass: would a new joiner understand this in one read? Flag duplicated logic to extract, helpers with unclear names/contracts, files doing two jobs, error paths that stay silent, and any cleverness worth replacing with boring obvious code. Simplify first, then re-verify.
2. `npm run build` for shared → server → client (fix all errors).
3. Run a live Socket.IO smoke test covering the new happy path + one abuse path (wrong turn, stale offer, insufficient funds).
4. Report: `PLAN vs BUILT` deltas, files changed, test results as PASS lines.
If any check fails, fix and re-run — never mark the cycle complete on a red build or a diff you would not want to maintain.

### 5. QUEUE NEXT
End each cycle with the ordered backlog and the proposed next single feature. Never start it without a new PLAN phase.
