# SendGrid Marketing Automations — 10-step activation limit

**Discovered:** 2026-04-05
**Confirmed by:** Twilio SendGrid support (Jennifer Anne Redulfin, ticket reference)
**Status:** Undocumented platform limitation, no self-service workaround

## TL;DR

SendGrid's `/v3/marketing/automations` API **silently fails with HTTP 502 Internal server error** when you try to activate (`status: "live"`) any automation containing **more than 10 steps**. The UI has no Activate button for these automations either, so legacy accounts are completely stuck.

If you're hitting `HTTP 502 {"message": "Internal server error"}` when calling:

```http
PUT /v3/marketing/automations/{id}
Content-Type: application/json

{ "name": "...", "type": "triggered", "status": "live", "steps": [... >10 steps ...] }
```

or

```http
POST /v3/marketing/automations
{ ..., "status": "live", "steps": [... >10 steps ...] }
```

…this document explains why and how to work around it.

---

## Symptoms

- `POST /v3/marketing/automations` with `status: "live"` and **≤ 10 steps** → returns **HTTP 201** and automation goes live.
- Same endpoint with **≥ 12 steps** → returns **HTTP 502** `{"message": "Internal server error"}`.
- **11 steps is flaky** — sometimes works, sometimes 502. Treat 10 as the hard safe limit.
- `PUT /v3/marketing/automations/{id}` with `status: "live"` has the same limit, even on automations you created fresh with > 10 steps.
- `PUT` with `status: "draft"` works fine at any step count — only the `"live"` transition is broken.
- Creating the automation as draft (any number of steps) works; you just can never activate it via API if you stay above 10 steps.
- The legacy Marketing Campaigns UI at `mc.sendgrid.com/automations` displays these automations but the edit page offers only **"Save"** and **"Automation Options → Duplicate"** — **no Activate button**. The kebab menu on each row has only **Edit** and **Delete**. You cannot activate via UI either.
- The account in question only had access to Legacy Marketing Campaigns UI; the new Marketing Campaigns v2 Automation Builder was not enabled. SendGrid support confirmed it is "being rolled out" but could not give an ETA for individual accounts.

## Why this matters

Typical Winback (28-step) and Welcome-flow (24-step) automations built through a bulk onboarding process — or cloned from existing live flows — exceed the 10-step threshold and become silently un-activatable via API.

On legacy accounts (only Legacy MC UI), there is **literally no way to activate these drafts** without SendGrid's backend team doing it for you, and backend/manual activation is **not available as a self-service option** per the support ticket response.

## What we tried (all failed)

All of these returned `HTTP 502 Internal server error`:

1. `PUT` with the full payload from a fresh `GET` of the draft (preserving every field).
2. `PUT` with a minimal payload: `name`, `type`, `status: live`, `entrance_criteria`, `exit_criteria`, `steps`, `suppression_group_id`.
3. `PUT` with `suppression_group_id: -1` (global unsubscribe, same as working automations) and `custom_unsubscribe_url` omitted entirely.
4. Two-phase: first `PUT` with `status: draft` to set `suppression_group_id`, then second `PUT` with `status: live`.
5. `POST` a brand-new clone automation with `status: live` and all 24 steps.
6. Incremental: create a live 10-step automation via `POST`, then `PUT`-expand to 24 steps while already live.
7. Alternative activation endpoints: `POST /v3/marketing/automations/{id}/activate`, `/publish`, `/enable`, `:activate` — all **HTTP 404** (endpoints don't exist).
8. Changing `exit_criteria` from `"stops_matching"` to `"all_messages"` → still 502.
9. Waiting and retrying (ruling out transient infrastructure flakiness) → still 502.
10. Stripping `template_hash` fields from step messages → still 502.

The problem is **not** with payload structure, missing fields, template validity, or transient errors. It is a hard backend limitation triggered purely by step count.

## Binary search for the limit

```text
POST /v3/marketing/automations with status: "live"

  N = 3   →  HTTP 201  ✅
  N = 5   →  HTTP 201  ✅
  N = 10  →  HTTP 201  ✅
  N = 11  →  HTTP 201  ✅  (sometimes 502 — flaky)
  N = 12  →  HTTP 502  ❌
  N = 14  →  HTTP 502  ❌
  N = 18  →  HTTP 502  ❌
  N = 22  →  HTTP 502  ❌
  N = 24  →  HTTP 502  ❌
```

**Safe boundary: 10 steps or fewer.**

## Workaround — Split-and-Chain pattern

Break each long automation into a chain of ≤ 10-step automations linked together by time-based "bridge segments" that use existing contact fields as the clock.

### Pattern

```
Original draft (24–28 steps, blocked):
  Entry = segment X
  Steps 1→28 spanning ~180 days

Becomes chain of 3 live automations:

  Part 1/3: entry = segment X (original)
            steps 1–10, days 0–30
            exit_criteria: stops_matching

  Part 2/3: entry = segment X AND <time-based predicate advances 30 days>
            steps 11–20, days 30–90 (relative to contact entering Part 2)
            exit_criteria: stops_matching

  Part 3/3: entry = segment X AND <time-based predicate advances 90 days>
            steps 21–28, days 90–180
            exit_criteria: stops_matching
```

### Why it works

- Each Part is ≤ 10 steps → API activates without 502.
- Each Part has `exit_criteria: stops_matching` + an additional segment predicate that checks a timestamp field (e.g. `last_finished_order_date_company` or `account_registration_data`).
- When a contact matches the next Part's entry condition (because enough time passed), SendGrid automatically moves them. No manual bridge, no race condition — the clock is the DB field that ticks forward by itself.
- If a contact purchases in the middle of any Part, the `c_amount_of_booked_orders_contact` field increments and the segment predicate no longer matches → contact drops out naturally.

### Concrete example for DAGO Express Winback flow

Using the custom fields present on the account (`preferred_language`, `c_amount_of_booked_orders_contact`, `last_finished_order_date_company`):

```sql
-- Part 1/3 entry segment (original — "6 months no order")
SELECT contact_id, updated_at FROM contact_data
WHERE preferred_language = 'cs'
  AND last_finished_order_date_company <= now() - 180 days
  AND c_amount_of_booked_orders_contact = 0

-- Part 2/3 entry segment — same language, 30 more days passed
SELECT contact_id, updated_at FROM contact_data
WHERE preferred_language = 'cs'
  AND last_finished_order_date_company <= now() - 210 days
  AND c_amount_of_booked_orders_contact = 0

-- Part 3/3 entry segment — 90 more days passed
SELECT contact_id, updated_at FROM contact_data
WHERE preferred_language = 'cs'
  AND last_finished_order_date_company <= now() - 270 days
  AND c_amount_of_booked_orders_contact = 0
```

Step `send_timing` values in each Part are reset to be relative to that Part's entry (Part 2 starts at `PT0S`, not `P30D`).

### Code sketch

```javascript
// Pseudocode for the splitter, given an original draft automation
async function splitAndActivate(draft) {
  const CHUNK_SIZE = 10;
  const chunks = [];
  for (let i = 0; i < draft.steps.length; i += CHUNK_SIZE) {
    chunks.push(draft.steps.slice(i, i + CHUNK_SIZE));
  }

  // Sum of send_timing days for each chunk, used to offset the next chunk's entry segment
  const cumulativeDays = [0];
  for (const chunk of chunks) {
    cumulativeDays.push(cumulativeDays.at(-1) + sumDays(chunk));
  }

  for (let i = 0; i < chunks.length; i++) {
    // Build bridge segment for chunk i
    const segDsl = i === 0
      ? original.query_dsl
      : rewriteWithDaysOffset(original.query_dsl, cumulativeDays[i]);

    const newSeg = await POST('/v3/marketing/segments/2.0', {
      name: `${draft.name} — Part ${i + 1}/${chunks.length}`,
      query_dsl: segDsl,
    });

    // Normalize each chunk's step timings to start at PT0S
    const normalizedSteps = resetTimingRelative(chunks[i]);

    // Create as live directly — POST supports status: live for ≤10 steps
    await POST('/v3/marketing/automations', {
      name: `${draft.name} — Part ${i + 1}/${chunks.length}`,
      type: 'triggered',
      status: 'live',
      entrance_criteria: { occurs: 'first', id: newSeg.id, type: 'segment' },
      exit_criteria: 'all_messages',
      suppression_group_id: -1,
      goal: { query_dsl: '', query_json: null },
      steps: normalizedSteps,
    });
  }

  // After all chunks live, delete the original blocked draft
  await DELETE('/v3/marketing/automations/' + draft.id);
}
```

### Downsides of the workaround

- **Count inflation:** 44 drafts × ~3 chunks = ~130 live automations to maintain.
- **Content changes:** editing one message in the original flow becomes editing the corresponding chunk — easy to miss.
- **Sequential segments:** you now own ~90 new "bridge segments" that must be kept in sync with any logic changes.
- **Time-drift edge cases:** contacts whose `last_finished_order_date_company` updates during a Part can jump out and back in. `exit_criteria: stops_matching` handles most of this, but watch for odd re-entry patterns.

## Detection — how to know you're hitting this bug

If you see **all three** of these, you are hitting the 10-step limit and not something else:

1. `POST` or `PUT` to `/v3/marketing/automations(/{id})` with `status: "live"` returns `HTTP 502 {"message": "Internal server error"}`.
2. The same request with `steps.slice(0, 10)` succeeds.
3. Activating the identical automation in the UI either doesn't offer an Activate button (legacy MC) or is also broken (new MC, rare).

Alternate detection: make a minimal `PUT` like this and watch for the 400 response:

```json
{ "name": "...", "type": "triggered", "status": "live",
  "entrance_criteria": {...}, "exit_criteria": "all_messages" }
```

If you get:

```json
{"errors":[{"field":"custom_unsubscribe_url, suppression_group_id","message":"one must be present before status can be live"},
           {"field":"steps","message":"must be present before status can be live"}]}
```

…then include those fields, retry the full payload, and if you now get `502` instead of `400`, you are past the validation layer and hitting the step-count bug.

## Related quirks discovered during investigation

- `suppression_group_id` must be set to either a valid ID (from `/v3/asm/groups`) or `-1` (global unsubscribe). Sending `null`, empty string, or omitting it entirely returns `400 "one must be present before status can be live"`.
- You cannot set **both** `suppression_group_id` and `custom_unsubscribe_url`. If `custom_unsubscribe_url` is `""` (empty string), SendGrid treats it as set and rejects with `"not both"`. Omit the field entirely if using a group ID.
- `exit_criteria: "all_messages"` works on activation; `exit_criteria: "stops_matching"` does too — both are valid, just need to be explicitly present.
- Automations created with multi-language handlebars templates (one template with `{{#equals preferred_language "xx"}}` branches for 20 languages) use **52 unique templates** for 44 × 24/28-step automations because each step's template is shared across all languages. Live per-language automations (DE, EN, FR, etc.) use ~580 single-language templates for 41 automations — a very different architecture.

## References

- SendGrid Marketing Campaigns API: <https://www.twilio.com/docs/sendgrid/api-reference/marketing-campaigns-automations>
- Related SendGrid docs (linked by support): "Get started with Automation and Marketing Campaigns — How to Edit an Automation, Limitations and Workarounds"
- Support ticket: 2026-04-05 exchange with Jennifer Anne R. (Twilio Support, confirmed as backend limitation with no self-service workaround)

## License

This document is part of the [dago-sendgrid](https://github.com/Damian-Golunski/dago-sendgrid) project, published under the same license, so future maintainers (human or AI agents) can find it when they hit the same 502 wall.
