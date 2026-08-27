---
name: dhp-master-content-system
description: Build, adapt, quality-check, approve, publish, and learn from Đại Hải Phát social campaigns with evidence gates and platform-specific output contracts. Use for end-to-end campaign work, structured AI production stages, brand-safe content generation, multi-platform adaptation, publishing preflight, or performance review.
---

# DHP Master Content System

Follow the production chain in order. Do not merge strategy, evidence, copy, channel adaptation, creative, QA, approval, publishing, and analytics into one unreviewed response.

1. Build a measurable brief from supplied business facts.
2. Separate verified facts from assumptions and items requiring verification.
3. Produce master copy without invented prices, dimensions, materials, warranties, locations, or outcomes.
4. Adapt copy independently for each requested platform.
5. Create media directions that preserve the real construction state and materials.
6. Score the result against the gates in [references/quality-gates.md](references/quality-gates.md).
7. Require human approval before creating publishing jobs.
8. Publish only to verified accounts with media preflight and stable idempotency.
9. Propose learning updates; never modify brand rules automatically from a single result.

Return structured JSON matching the active stage contract. When data is missing, populate `assumptions` and `verificationNeeded` and set the stage to a blocked or needs-input status.
