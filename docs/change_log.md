# Change log and verification status (17 Oct 2026)

## Important notice
Your existing `Shiftwell_Q4_Recommendation.pdf` and the prototype source were **not attached**; only the case brief and your instruction file were. I could not review or preserve them. Everything was rebuilt from the brief and the recommendation you described. If you upload the old files, I can compare them line by line and carry over anything stronger.

## Corrections and additions built into this version
1. **Estimates separated.** Brief estimates (certificate 1, UrbanMart custom 2, WhatsApp 3) are labelled as such. The reusable engine and auto-approval (1 sprint each) are labelled assumptions. The brief's certificate estimate covers the field and *scheduling* block only; extending it to swaps is an extra assumption (A2).
2. **No confirmed dates.** Milestones are "illustrative", two-week sprints from 26 Oct, with a note that engineering has not validated them.
3. **Safety logic implemented and tested:** auto-approve only if every check passes; missing, invalid or inconsistent data never auto-approves; expired credentials block roster assignment and swaps; a credential expiring on or before the shift date does not qualify; UrbanMart hours are summed across locations in a Monday-Sunday week including the proposed shift; exactly 48h is allowed; over-cap shifts go to the named regional approver (no approver configured means blocked); hard blocks cannot be overridden by anyone; audit log records decision, timestamp, rule and reason; synthetic-data banner.
4. **Numbers recomputed by script** (`audit/audit_numbers.py`). All four headline claims you listed are correct: ₹4.08 Cr; 7 of 12; ₹50L of ₹80L; ₹90L and 65 locations. Added: renewing by Jan 2027 = ₹184L = 45.1% (24.5% if January is excluded).
5. **Qualifications added:** the 7-of-12 figure mixes time windows; the ₹50L share (62.5%) is correlation because loss reasons differ (StyleHub, budget cuts, had 60% approved); CarePoint is At risk at 71%.
6. **Data conflict flagged:** FreshBowl's manager quote (25-30 requests a night) conflicts with the pack's average (about 24 per location per month). Not used.
7. **WhatsApp cost corrected in framing:** it is ₹24,360-48,720 a year (assumes 2-4 messages per swap), about 0.3-0.6% of FreshBowl ARR. Cost is therefore not the reason to defer; the reason is 3 sprints of capacity and no effect on manager latency.
8. **Overtime "look at options" threat** is marked unverified: it appears only in the sales memo.
9. **Word and page limits** are checked by the PDF build script: CEO memo 2 pages; sales reply 164 words; build note 165 words.

## What was actually run
- Engine tests: 44 passed, 0 failed (Node test runner).
- UI smoke tests: 9 passed, 0 failed, in **jsdom (a simulated DOM, not a browser)**.
- Mutation check: I deliberately broke the "expires on shift date" rule and the "exactly 48h" rule; the tests failed as expected, then I restored the code.
- PDF pages were rendered to images and inspected by me for layout.

## Remaining unverified items (do not claim these in the interview)
- **Live URL:** not published; no deployment verified. The PDF contains a clearly marked blank until you give me the URL (I will rebuild it).
- **Real-browser testing:** a browser could not be installed here. Check layout and colours yourself (desktop and phone, light and dark).
- **Engineering estimates for S2 and S3:** assumptions until the engineering lead confirms.
- **Whether staff have a shared ID across locations**, whether station training data exists, and UrbanMart's regional approver list.
- **Whether MedAxis needs credential checks.**
- **Messages per WhatsApp swap (2-4)** and real WhatsApp template pricing.
- **Success-metric targets** (65% in 24h, 60-day window) are proposals, not supplied benchmarks.
- **Whether the 48h or credential rules match any statute:** not assessed.
- **AI chat link:** optional, not included.
