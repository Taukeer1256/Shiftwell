# Five-minute interview outline: Shiftwell Q4 recommendation

Open with the answer, then prove it. Every figure below is traceable to Appendix A of the PDF.

| Time | Section | Say (in your own words) |
|---|---|---|
| 0:00-0:30 | **The call** | Build one reusable swap-rules engine in six sprints: CarePoint certificate block, FreshBowl auto-approval, UrbanMart 48-hour regional approval. Defer WhatsApp. Timings are provisional. |
| 0:30-1:20 | **Problem and evidence** | Every swap goes to a manager with no rules. All three requests are rules a machine could check first. 7 of 12 accounts approve under 50% of swaps in 24h (4 of 8 active = ₹1.60 Cr, 39.2% of ARR; 3 of 4 lost = ₹50L of ₹80L). Correlation, not proven cause: the loss reasons differ, and CarePoint is At risk at 71%. ₹1.84 Cr (45.1%) renews by Jan 2027. |
| 1:20-2:20 | **Requested vs needed** | FreshBowl asked for WhatsApp but needs speed: manager approves almost all, checks training and overtime; GreenLeaf's exit call said "not WhatsApp". CarePoint needs audit safety (one more finding = penalty). UrbanMart needs enforced overtime control (9% of wage bill). |
| 2:20-3:00 | **Prioritisation and trade-offs** | CarePoint first despite UrbanMart being 27% of ARR: renews Dec 2026 vs Aug 2027, At risk vs Healthy, legal exposure, cheapest item, and it is the foundation of the engine. UrbanMart is still built (sprints 4-5). WhatsApp deferred: 3 sprints is half capacity and does not remove manager latency; message cost is NOT the reason (₹24k-49k a year, assumed). |
| 3:00-3:50 | **Prototype demo** (see script) | Show the safety behaviour, not the UI. |
| 3:50-4:30 | **Roadmap, risks, contingency** | S1 certificate (brief: 1), S2 shared rules service (my assumption: 1), S3 FreshBowl auto-approval (assumption: 1), S4-5 UrbanMart (brief: 2), S6 buffer. If overrun: FreshBowl pilot slips, UrbanMart goes single-approver, CarePoint is never cut. Risks: dirty credential data, no shared person ID, approver bottleneck. |
| 4:30-5:00 | **Metrics and ask** | FreshBowl 38% to at least 65% decided in 24h (my target); CarePoint zero shifts with expired credentials; UrbanMart 100% of over-48h shifts with a regional approval record. Ask: engineering lead validates S2 and S3 estimates next week; CS verifies the UrbanMart "look at options" quote. |

## Demo script (about 50 seconds)
1. CarePoint, **CP3** (BLS expires on the shift date): BLOCKED. Click "Manager tries to approve anyway": denied and logged.
2. FreshBowl, **FB1** auto-approved; **FB3** (training data missing): manager review, never auto.
3. UrbanMart, **UM2** (exactly 48h): allowed. **UM4** (52h across two locations): escalated to the named approver. Location Manager approval is denied; the named approver succeeds.
4. Point at the audit log (decision, timestamp, rule, reason). Click "Run all scenarios": 25 of 25 match.
Say once: synthetic data, not a production compliance system.

## Questions to expect, and honest answers
- **"All three fit in six sprints. Why not build them?"** On paper 1+2+3 = 6 with zero buffer, on estimates engineering has not validated, and WhatsApp leaves the manager bottleneck in place. My plan is 5 planned + 1 buffer, but that saving rests on my unvalidated S2-S3 estimates, and I have a fallback if they are wrong.
- **"Is slow approval really why accounts leave?"** I cannot prove it. Four loss reasons differ; only one exit call speaks to cause. I use it to prioritise, not to claim causation, and the pilot metric tests it.
- **"Why not WhatsApp, since RotaPro has it?"** One of four lost accounts moved to RotaPro, and that customer said it was approval speed. Defer, with trigger criteria: revisit if after the pilot FreshBowl is still well under 65% in 24h, or if WhatsApp becomes a stated renewal condition.
- **"What if UrbanMart leaves?"** Their renewal is ten months out and the rule is in sprints 4-5. The "look at options" quote is second-hand; I would have CS verify it this week.
- **"Is auto-approval safe?"** Only when every check passes; missing or inconsistent data never auto-approves; hard blocks have no override path; every decision is logged.
- **"Why 65%?"** My proposal, anchored on healthy accounts at 64-80%. Not a supplied benchmark.
- **"Why is the 25-30 swaps a night quote not in your numbers?"** It conflicts with the pack's average of about 24 per location per month. I flagged it rather than choose.
- **"Did you test the prototype in a browser?"** No. 53 automated tests ran (engine plus a simulated DOM). Look at it in a real browser before the interview.
