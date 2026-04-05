# TODO — Revisit after Marketing Campaigns 2.0 rollout

**Created:** 2026-04-05
**Revisit by:** 2026-07-05 (3 months from creation)
**Trigger:** Twilio Support (Jennifer Anne R.) confirmed MC 2.0 rollout window is **March–June 2026** for EU accounts. DAGO Express (User ID 55966927) was flagged for early-adopter consideration.

## Context

On 2026-04-05 we ran into the SendGrid 10-step API activation limit documented in [`SENDGRID_API_10_STEP_LIMIT.md`](./SENDGRID_API_10_STEP_LIMIT.md). We worked around it with the **split-and-chain pattern** — breaking long automations into sequential ≤10-step chunks linked by time-offset bridge segments.

When MC 2.0 (the new Automation Builder UI / backend) becomes available on the account, two things change:

1. The 10-step activation limit **is expected to go away** — activating a 24/28-step automation becomes a normal UI click, no 502 errors.
2. The split-and-chain workaround **becomes unnecessary** — we can consolidate chunks back into single automations.

This TODO lists exactly what to revisit.

## Signal: has MC 2.0 arrived?

Check any of these:
- **Email notification** from SendGrid saying "Your account is scheduled for Marketing Campaigns migration on …" (they send one ~1 month before migration)
- **UI change** at `mc.sendgrid.com/automations` — new Automation Builder appears instead of legacy list view, or an "Activate" button appears on the automation detail page
- **API test**: try `POST /v3/marketing/automations` with `status: "live"` and 15 steps. If returns 201 instead of 502 → MC 2.0 is live. Script snippet:
  ```bash
  curl -X POST https://api.sendgrid.com/v3/marketing/automations \
    -H "Authorization: Bearer $SG" -H "Content-Type: application/json" \
    -d '{"name":"TEST","type":"triggered","status":"live","steps":[...15 step stubs...]}'
  ```

If any of the above is true → start the cleanup below.

## Cleanup tasks

### 1. Finish 13 half-split Registriert flows

These drafts blocked on segment limit (200/200) after partial split. They have **Part 1 live only**, Parts 2–3 missing:

| Draft ID (at time of split attempt) | Language | Status |
|---|---|---|
| `4390e2f9-5b40-4825-acb6-bf845886569a` | PT | Part 1 live, Parts 2–3 TODO |
| `2f92680c-1f32-44f8-89d9-ad7e2dd6521d` | NB | Part 1 live, Parts 2–3 TODO |
| `14dbe1e2-4a0e-42ad-84dc-d70b3f666d77` | HU | Part 1 live, Parts 2–3 TODO |
| `1d4d1947-294b-4f17-8efd-1713a4a0c478` | LT | Part 1 live, Parts 2–3 TODO |
| `fff6ea32-155e-40b1-a146-ee6fceeb63c8` | LV | Part 1 live, Parts 2–3 TODO |
| `54e53c14-5184-4b08-80d3-1de25d1d26b9` | HR | Part 1 live, Parts 2–3 TODO |
| `5cdb9d0c-71a6-4d53-8fb7-93d272aed85c` | ET | Part 1 live, Parts 2–3 TODO |
| `1ff56787-74b0-40fd-8184-78d5c3f8e5c8` | ZH | Part 1 live, Parts 2–3 TODO |
| `bda639ec-f4f3-4575-8fa0-cbc6eca89d57` | AR | Part 1 live, Parts 2–3 TODO |
| `fcfa6b7f-d335-4497-9b8a-c38d9f5aa2b4` | BG | Part 1 live, Parts 2–3 TODO |
| `ec6618e3-dd05-4cc5-80a3-eed7cc7761fd` | DA | Part 1 live, Parts 2–3 TODO |
| `31f5588b-0fb3-4eea-95e0-d10684e361c5` | UK | Part 1 live, Parts 2–3 TODO |
| `652ed47b-9064-47cc-9976-e7fd6bb82190` | RO | Part 1 live, Parts 2–3 TODO |

**Action after MC 2.0:**
Option A (preferred) — delete the 13 Part 1 automations + their entry segments (or reuse), recreate each as a single 24-step automation through the new Automation Builder. Templates already exist.
Option B — finish splitting by creating Parts 2 and 3 for each (requires freeing ~26 segment slots, which is still gated by the 200 platform cap).

### 2. Finish CH FOBiz (Newsletter First Order Business CH) Part 2

- **Current:** `Newsletter::Europe::First Order::Business::CH:: — Part 1/2` live with first 8 of 12 steps.
- **Missing:** Part 2 with last 4 steps (5 templates already cloned with CHF patching, ready to use).
- **Action after MC 2.0:** delete Part 1, recreate as single 12-step automation. Templates already cloned from DE source in Phase 2 of 2026-04-05 session.

### 3. Consolidate Winback + Registriert splits into single automations

All 20-language Winback flows are currently split into 3–4 chunks each. Similarly for 7 fully-split Registriert languages (RU/EL/CS/SV/FI/SL/SK). When MC 2.0 lets us activate long automations normally, consolidate:

- **20 Winback splits** (each 3–4 chunks, 28 total steps) → **20 single automations** of 28 steps each.
  Affected flows: `Winback 100€ / 2.500 CZK / 1.100 SEK / 1.100 NOK / 38.000 HUF / 750 DKK` for ZH, AR, BG, UK, RU, EL, CS, SV, FI, SL, SK, RO, PT, NB, HU, LT, LV, HR, ET, DA.

- **7 Registriert fully-split** (3 chunks × 8 steps = 24 steps) → **7 single automations** of 24 steps each.
  Languages: RU, EL, CS, SV, FI, SL, SK.

- **5 CH automations** currently split (Reg 3×8, Winback 3×10+8, FOBiz 2×8) → **3 single automations** (Reg 24, Winback 28, FOBiz 12). CH FOPers (3) and CH DF (8) are already single-chunk.

**Consolidation saves:**
- ~90 automations deleted (keeping only the consolidated ones)
- ~70 bridge segments deleted → frees **70 segment slots**, dropping usage from 200/200 to ~130/200 — huge relief.
- Maintenance burden: editing a flow becomes 1 template edit instead of 3–4.

### 4. Delete all `— Part N/M` bridge segments after consolidation

Look for segments matching pattern `^Europe::[A-Z]{2}::.+ — Part \d+$` and delete any that no longer have a matching `— Part N/M` automation referencing them. Script sketch:

```javascript
// Pseudocode
const segs = await fetchAllSegments();
const autos = await fetchAllAutomationsWithDetails(); // includes entrance_criteria.id
const used = new Set(autos.map(a => a.entrance_criteria?.id).filter(Boolean));
const orphan = segs.filter(s => / — Part \d+$/.test(s.name) && !used.has(s.id));
for (const s of orphan) await deleteSegment(s.id);
```

## What NOT to change

- **Original 8 core live flows** (DE / EN / FR / NL / IT / ES / PL / EN-GB Winback + Registriert + Newsletters) — untouched during the 2026-04-05 session. They were already correctly configured with single 24/28-step automations. Leave them alone.
- **16 CH templates cloned from DE source** — keep them, they are the content for CH flows and will be reused when consolidating CH automations into single-chunk form.

## Session artifacts

Everything needed to resume is stored in `C:/Users/damia/dago_sg_analysis/`:

- `ch_de_data.json` — DE automation structures + segments used as cloning source
- `ch_template_mapping.json` — DE template ID → CH cloned template ID mapping
- `ch_segment_mapping.json` — DE segment ID → CH segment ID mapping
- `split_results.json` — 20-language split outcomes
- `draft_details/*.json` — original 44 draft automation backups
- `scan_codes.json` — which codes are referenced in which templates

## Related docs

- [`SENDGRID_API_10_STEP_LIMIT.md`](./SENDGRID_API_10_STEP_LIMIT.md) — full explanation of the 10-step bug and split-and-chain pattern
- Support ticket with Jennifer Anne R. (Twilio SendGrid Support) — MC 2.0 rollout timeline confirmation

## Reminder cadence

Set a calendar reminder for **2026-07-05** and **2026-08-05** to check this file. If by August 2026 MC 2.0 hasn't arrived on the account, reach back out to Twilio Support referencing the original ticket.
