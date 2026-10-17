#!/usr/bin/env python3
"""Builds the single-PDF submission. Every number is read from audit/audit.json (recomputed from the brief's tables);
test counts are read from audit/test-results.json (written from a real test run).
Usage: python3 pdf/build_pdf.py [--url https://your-live-prototype-url] [--out Shiftwell_Q4_Recommendation_FINAL.pdf]"""
import argparse, json, re, sys, os, tempfile
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.pdfgen import canvas

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
ap = argparse.ArgumentParser(); ap.add_argument('--url', default='https://prototype-dun-omega.vercel.app/'); ap.add_argument('--out', default=os.path.join(ROOT, 'Shiftwell_Q4_Recommendation_FINAL.pdf'))
args = ap.parse_args()
A = json.load(open(os.path.join(ROOT, 'audit/audit.json'), encoding='utf-8'))
T = json.load(open(os.path.join(ROOT, 'audit/test-results.json'), encoding='utf-8'))
assert T['fail'] == 0 and T['tests'] > 0, 'Refusing to build: tests have not all passed.'

# Discover DejaVu font path portably
FD = None
font_candidates = [
    '/usr/share/fonts/truetype/dejavu/',
    os.path.join(os.path.dirname(sys.executable), 'Lib', 'site-packages', 'matplotlib', 'mpl-data', 'fonts', 'ttf'),
    r'C:\Users\Taqueer Khan\AppData\Roaming\Python\Python312\site-packages\matplotlib\mpl-data\fonts\ttf',
]
for c in font_candidates:
    if os.path.exists(os.path.join(c, 'DejaVuSans.ttf')):
        FD = c; break

if not FD:
    try:
        import matplotlib
        m_dir = os.path.join(os.path.dirname(matplotlib.__file__), 'mpl-data', 'fonts', 'ttf')
        if os.path.exists(os.path.join(m_dir, 'DejaVuSans.ttf')):
            FD = m_dir
    except Exception:
        pass

assert FD, 'Could not find DejaVuSans font directory.'
pdfmetrics.registerFont(TTFont('DV', os.path.join(FD, 'DejaVuSans.ttf')))
pdfmetrics.registerFont(TTFont('DV-B', os.path.join(FD, 'DejaVuSans-Bold.ttf')))
pdfmetrics.registerFont(TTFont('DV-I', os.path.join(FD, 'DejaVuSans-Oblique.ttf')))
pdfmetrics.registerFont(TTFont('DV-BI', os.path.join(FD, 'DejaVuSans-BoldOblique.ttf')))
pdfmetrics.registerFontFamily('DV', normal='DV', bold='DV-B', italic='DV-I', boldItalic='DV-BI')

INK = colors.HexColor('#14181f'); MUTED = colors.HexColor('#556070'); ACC = colors.HexColor('#2b3fae'); LINE = colors.HexColor('#cfd5df'); SOFT = colors.HexColor('#eef1f7'); WARN = colors.HexColor('#fff3cd')
def S(name, **kw):
    base = dict(fontName='DV', fontSize=9.1, leading=12.4, textColor=INK, alignment=TA_LEFT, spaceAfter=0)
    base.update(kw); return ParagraphStyle(name, **base)
body = S('body'); small = S('small', fontSize=7.4, leading=9.6); cell = S('cell', fontSize=7.9, leading=10.1); cellb = S('cellb', fontName='DV-B', fontSize=7.9, leading=10.1)
h1 = S('h1', fontName='DV-B', fontSize=15, leading=18, textColor=ACC, spaceAfter=2)
h2 = S('h2', fontName='DV-B', fontSize=9.6, leading=12, textColor=ACC, spaceBefore=7, spaceAfter=2.5)
h2p = S('h2p', fontName='DV-B', fontSize=11.5, leading=14, textColor=ACC, spaceBefore=9, spaceAfter=4)
bul = S('bul', leftIndent=9, bulletIndent=0, spaceAfter=1.6)
bul_s = S('bul_s', fontSize=8, leading=10.6, leftIndent=9, bulletIndent=0, spaceAfter=1.2)
P = lambda t, st=body: Paragraph(t, st)
def B(t, st=bul): return Paragraph(t, st, bulletText='•')
def words(t): return len(re.findall(r"[\w₹%.,'’/\-–:]+", re.sub(r'<[^>]+>', ' ', t).replace('&amp;', '&')))

def lakh(x): return f"₹{x:g}L"
J = A['renew_by_jan27']; lt = A['lt50_active']; ll = A['lt50_lost']; cd = A['clinic_diag']; wc = A['whatsapp_cost']

def tbl(data, widths, header=True, zebra=True, extra=None, pad=2.6):
    t = Table(data, colWidths=widths, repeatRows=1 if header else 0)
    st = [('VALIGN', (0, 0), (-1, -1), 'TOP'), ('LINEBELOW', (0, 0), (-1, -1), 0.4, LINE), ('LEFTPADDING', (0, 0), (-1, -1), 3.2), ('RIGHTPADDING', (0, 0), (-1, -1), 3.2),
          ('TOPPADDING', (0, 0), (-1, -1), pad), ('BOTTOMPADDING', (0, 0), (-1, -1), pad)]
    if header: st += [('BACKGROUND', (0, 0), (-1, 0), ACC), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white)]
    if zebra:
        for r in range(1, len(data)):
            if r % 2 == 0: st.append(('BACKGROUND', (0, r), (-1, r), SOFT))
    t.setStyle(TableStyle(st + (extra or []))); return t
hdr = lambda t: Paragraph(f'<font color="white"><b>{t}</b></font>', cell)

# ============================== CEO MEMO (must be exactly <= 2 pages) ==============================
def memo_story():
    s = []
    s.append(P('Shiftwell: what we build this quarter', h1))
    s.append(tbl([[P('<b>To</b> CEO', cell), P('<b>From</b> Product (new joiner)', cell), P('<b>Date</b> 17 Oct 2026', cell), P('<b>Status</b> Decision requested; timings provisional', cell)]],
                 [30*mm, 48*mm, 34*mm, 64*mm], header=False, zebra=False))
    s.append(P('1. The call', h2))
    s.append(P(f'Build <b>one reusable swap-rules engine in six sprints</b> instead of three disconnected customer features. It delivers (1) <b>CarePoint</b>: certificate-expiry checks that block unsafe roster assignments and swaps; '
               '(2) <b>FreshBowl</b>: automatic approval when every required rule passes, exceptions routed to the manager; (3) <b>UrbanMart</b>: escalation to a named regional approver when a shift takes someone past 48 hours a week. '
               '<b>Defer WhatsApp-native approvals</b> until a pilot shows that faster in-app decisions do not fix FreshBowl\'s problem. '
               '<b>Confidence:</b> high on the diagnosis (it rests on the data pack); medium on timing, because only three estimates come from engineering (certificate 1 sprint, UrbanMart custom 2, WhatsApp 3). Every other estimate is my labelled assumption until the engineering lead returns.'))
    s.append(P('2. What is actually going on', h2))
    s.append(B(f'<b>One missing capability, three symptoms.</b> Today every swap goes to the Location Manager and there are no rules (hard-coded). FreshBowl\'s manager approves "almost all" after checking only station training and overtime; CarePoint\'s manager re-checks certificate expiry in Excel on every approval; UrbanMart wants an hours rule. Each is a rule a machine can check before a human has to.'))
    s.append(B(f'<b>Slow approvals travel with churn, but that is correlation.</b> {A["lt50_total_n"]} of {A["accounts_total_n"]} accounts (4 of 8 active, 3 of 4 lost) approve &lt;50% of swaps within 24h. The four active ones hold {lakh(lt["arr_lakh"])} ({lt["pct_of_arr"]}% of ARR); the three lost ones are {lakh(ll["arr_lakh"])} of the {lakh(A["lost_total_lakh"])} lost ({A["lost_lt50_share_pct"]}%). '
               'Recorded loss reasons are price, a WhatsApp competitor and a return to spreadsheets, so I do not claim slow approvals caused every loss. The one exit call (GreenLeaf) blames the approval backlog, "not WhatsApp". CarePoint is At risk with 71% approved in 24h, so speed is not the only driver. The two groups use different time windows.'))
    s.append(B(f'<b>The clock is short.</b> {lakh(J["arr_lakh"])} ({J["pct"]}% of ARR) renews by Jan 2027 (FitZone Oct, Brew &amp; Co Nov, CarePoint Dec, FreshBowl Jan), and CS rates all four At risk. FitZone and Brew &amp; Co renew before anything ships; CS must handle them.'))
    MON = {'01':'Jan','02':'Feb','03':'Mar','06':'Jun','08':'Aug','10':'Oct','11':'Nov','12':'Dec'}
    ask = {'FreshBowl':'WhatsApp approvals','CarePoint':'Certificate block','UrbanMart':'48h approval'}
    glance = [[hdr('Account (by renewal date)'), hdr('ARR'), hdr('Renews'), hdr('Swaps approved in 24h'), hdr('Mgr hrs/wk'), hdr('CS health'), hdr('Request')]]
    for a in A['accounts']:
        y, m = a['renewal'].split('-')
        glance.append([P(a['name'].replace('&','&amp;'), cell), P(f"₹{a['arr_lakh']}L", cell), P(f"{MON[m]} {y}", cell), P(f"{a['pct24']}%" + (' (below 50%)' if a['pct24'] < 50 else ''), cell), P(f"{a['mgr_hrs']:g}", cell), P(a['health'], cell), P(ask.get(a['name'], '-'), cell)])
    s.append(P('Data pack at a glance (September 2026)', S('gl', fontName='DV-B', fontSize=8.4, textColor=MUTED, spaceBefore=5, spaceAfter=2)))
    s.append(tbl(glance, [36*mm, 17*mm, 22*mm, 40*mm, 20*mm, 20*mm, 23*mm], pad=1.8))
    s.append(P('3. Why CarePoint comes before UrbanMart', h2))
    s.append(P(f'UrbanMart is the largest account (₹110L, {A["share_UrbanMart"]}% of ARR) but it is Healthy and renews in Aug 2027. CarePoint (₹60L, {A["share_CarePoint"]}%) renews in Dec 2026, is At risk and faces a regulatory penalty after one more finding: its risk is legal, not a preference. '
               'Its fix is the cheapest item (about 1 sprint, engineering estimate) and builds the qualification check that FreshBowl\'s training check reuses. UrbanMart is not dropped; its rule is scheduled in sprints 4-5. '
               f'Certificate tracking is not niche: clinics and diagnostics are {lakh(cd["arr_lakh"])} ({cd["pct_of_arr"]}% of ARR) across {cd["locations"]} locations (whether MedAxis needs the same checks is unverified).'))
    s.append(PageBreak())
    s.append(P('4. Account by account', h2))
    c = lambda t: P(t, cell); cb = lambda t: P(t, cellb)
    rows = [[hdr(''), hdr('FreshBowl (ARR ₹84L, renews Jan 2027)'), hdr('CarePoint Clinics (₹60L, Dec 2026)'), hdr('UrbanMart (₹110L, Aug 2027)')],
      [cb('Asked for'), c('WhatsApp swap requests and approvals (Ops Director).'), c('Block anyone being scheduled or swapped into a shift if a required certificate has expired (Head of Compliance).'), c('Regional manager approval for any shift past 48 hrs/week (VP HR).')],
      [cb('Underlying need'), c('Swaps decided in minutes, not a day. Staff agree swaps on WhatsApp, then wait; the line cook says half are done off-app.'), c('Pass the next audit and stop manual Excel expiry checks.'), c('Control overtime (9% of wage bill) with an enforced, auditable approval.')],
      [cb('Evidence'), c(f'38% approved within 24h; about {A["fb_swaps_not_24h"]:,} of 2,900 monthly swaps wait longer. Manager checks only training and overtime. GreenLeaf left over approval backlog and auto-approval of trained staff.'), c('Auditor found two shifts covered by lapsed-BLS nurses; one more finding means a penalty. Manager tracks expiry in Excel. At risk.'), c('VP quote on 9% overtime. Healthy. The "look at options" threat appears only in the sales memo, not in CS notes: unverified.')],
      [cb('We build'), c('Auto-approve when role, station-training and weekly-hours checks all pass; otherwise a manager queue showing why.'), c('Expiry date on required credentials; hard block on roster and swaps when it expires on or before the shift date; missing data blocks; audit log; no override.'), c('Weekly-hours rule across all locations (Mon-Sun, incl. the proposed shift); over 48h goes to a named regional approver; exactly 48h is allowed.')],
      [cb('Not now'), c(f'WhatsApp channel: 3 sprints is half our capacity and does not remove manager latency. Message cost is small (₹{wc["2"]["annual_rs"]/1000:.0f}k-{wc["4"]["annual_rs"]/1000:.0f}k/yr, 2-4 messages per swap, assumed), so cost is not the reason. Revisit after pilot.'), c('Expiry reminders, document uploads, auto-approval of CarePoint swaps (opt-in later), roles beyond nurses.'), c('Custom one-off build, multi-level approval chains, overtime analytics.')],
      [cb('Success metric (targets are my proposals)'), c('Swaps decided within 24h: 38% to at least 65% within 60 days of pilot (healthy accounts run 64-80%). Manager scheduling hours from 6.5 toward 4.'), c('Zero shifts rostered or swapped with an expired required credential (audit log); 100% of required credentials carry an expiry date; clean audit; renewal.'), c('100% of shifts over 48h carry a regional approval record. Overtime share of wage bill vs 9% baseline; target to be set with the VP, not assumed.')],
      [cb('Main risk and mitigation'), c('Station-training data may not exist; ops still wants WhatsApp. Back-fill training, show pilot results, and set explicit WhatsApp trigger criteria.'), c('Dirty credential data blocks valid shifts. Back-fill before enforcing, pilot a few clinics, and give a clear "fix the record" message.'), c('Needs a shared person ID across locations and a region-to-approver list. Confirm both with UrbanMart first; unverifiable hours escalate.')],
      [cb('What we tell them'), c('Instant rules-based approval comes first because managers are the bottleneck; WhatsApp follows if the pilot does not close the gap.'), c('Expired certificates will be blocked on rosters and swaps, with an audit trail. First release provisional, pending engineering confirmation.'), c('The 48-hour regional approval is in this quarter\'s plan (provisional). Please send your regional approver list.')]]
    s.append(tbl(rows, [21*mm, 53*mm, 53*mm, 53*mm]))
    s.append(P('5. Roadmap and contingency (provisional; engineering lead has not validated)', h2))
    rm = [[hdr('Sprint'), hdr('Scope'), hdr('Basis of estimate'), hdr('Illustrative finish*')],
      [c('S1'), c('Certificate-expiry field and roster block (CarePoint)'), c('Brief: about 1 sprint'), c('6 Nov')],
      [c('S2'), c('Shared rules service for roster and swap paths, swap block, audit log, per-account policy settings'), c('Assumption: 1 sprint, unvalidated'), c('20 Nov')],
      [c('S3'), c('FreshBowl auto-approval, manager exception queue, pilot'), c('Assumption: 1 sprint, unvalidated'), c('4 Dec')],
      [c('S4-S5'), c('UrbanMart weekly-hours rule, regional-approver role, cross-location hours'), c('Brief: custom build about 2 sprints; no saving assumed'), c('Early Jan')],
      [c('S6'), c('Contingency: hardening, data back-fill, pilot fixes'), c('Assumption: buffer'), c('Mid Jan')]]
    s.append(tbl(rm, [15*mm, 83*mm, 60*mm, 22*mm]))
    s.append(P('*Illustrative only: two-week sprints starting 26 Oct. No customer date is confirmed until the engineering lead validates. As supplied, the three requests use 1+2+3 = 6 sprints with no buffer; this plan uses 5 planned plus 1 buffer, and that difference rests on my unvalidated S2-S3 estimates.', small))
    s.append(P('<b>If estimates overrun:</b> (1) widen the FreshBowl pilot next quarter but keep the manager exception queue; (2) ship UrbanMart with a single approver per region and, as an interim, a weekly overtime report from the existing Admin overtime reporting (feasibility unconfirmed); (3) never cut the CarePoint block. '
               'If S2 and S3 together exceed about 3 sprints, fall back to the brief\'s custom builds (certificate 1 + UrbanMart 2) and move FreshBowl auto-approval to next quarter.', S('x', spaceBefore=3)))
    return s

# ============================== OTHER SECTIONS ==============================
SALES = ("Hi, you are right that UrbanMart (₹1.1 Cr, 27% of ARR) and RotaPro's WhatsApp launch are real threats. Here is how the plan handles both.\n"
 "UrbanMart's rule is in the plan, not dropped: a named regional approver for any shift past 48 hours, counted across locations, provisionally in sprints 4-5. Their renewal is August 2027; CarePoint's is December 2026 and an auditor has already found two lapsed-certificate shifts, so that ships first.\n"
 "Certificate tracking is not niche: clinics and diagnostics are ₹90 lakh, 22% of ARR, and the same qualification check lets FreshBowl approve swaps only for trained staff.\n"
 "On WhatsApp: GreenLeaf's own exit call blamed the approval backlog, not the channel, and FreshBowl's manager approves almost everything after checking training and overtime. Automating that attacks the 38% approved-in-24-hours rate directly. We revisit WhatsApp after the pilot if speed does not improve.\n"
 "Three asks: confirm the UrbanMart VP's exact words, get their regional approver list, and promise no dates until engineering validates next week.")

ASSUMPTIONS = [
 "<b>A1 Sprint length and start.</b> Two-week sprints, six sprints is roughly the quarter, start 26 Oct once the engineering lead is back. Dates are illustrative.",
 "<b>A2 Engine and swap path:</b> about 1 sprint, extending the certificate check from rostering to swaps, adding the audit log and per-account policies. The brief's 1-sprint estimate covers the field and scheduling block only. Not validated.",
 "<b>A3 FreshBowl auto-approval</b> and manager exception queue: about 1 sprint. Not validated.",
 "<b>A4 UrbanMart rule:</b> taken at the brief's 2-sprint custom estimate; I assume no saving from reuse. Includes a regional-approver role.",
 "<b>A5 'Past 48 hrs'</b> means strictly more than 48; exactly 48 is allowed. The week is Monday-Sunday; an overnight shift counts in the week it starts.",
 "<b>A6 Cross-location hours</b> need a person-level ID shared across locations; if hours cannot be verified the shift escalates. The approver is the one mapped to the shift's location.",
 "<b>A7 UrbanMart approvers</b> are named users supplied by UrbanMart's Admin. No approver configured means blocked, never routed to the Location Manager.",
 "<b>A8 FreshBowl overtime threshold</b> is not in the brief; I assume 48h with exceptions to the Location Manager. Station training does not exist today (only a role), so it is stored as a non-expiring qualification and back-filled.",
 "<b>A9 CarePoint:</b> required credentials for nurses are BLS and nursing council registration (from the brief), both with expiry dates. Other roles need none. Compliant swaps still go to the manager (auto-approval is opt-in later). Whether MedAxis needs checks is unverified.",
 f"<b>A10 WhatsApp cost:</b> ₹0.35 per message (brief), 2-4 messages per swap (my assumption), 2,900 swaps a month: ₹{wc['2']['annual_rs']:,}-₹{wc['4']['annual_rs']:,} a year ({wc['2']['pct_of_fb_arr']}-{wc['4']['pct_of_fb_arr']}% of FreshBowl ARR). Real WhatsApp template pricing may differ.",
 "<b>A11 Approval rates:</b> active-account figures are the September 2026 snapshot; lost-account figures cover the last 3 months before they left. They are not strictly comparable. I treat the % as the share of swap requests.",
 "<b>A12 Targets</b> (65% within 24h, 60-day pilot window) are my proposals, anchored on the healthy accounts' 64-80%; they are not supplied benchmarks.",
 "<b>A13 Data conflict:</b> FreshBowl's manager reports 25-30 requests a night, but the pack averages about 24 per location per month. Possibly an outlier store or off-app counting. I did not use the quote for any volume figure.",
 "<b>A14 Scope:</b> no legal advice. Whether 48h or credential rules match any statute is not assessed.",
]

BUILD = (
    "The prototype is a single web page using synthetic data; it is not a production compliance system. "
    "Pick an account, run a scenario, and inspect outcomes (auto-approved, manager review, regional escalation, or blocked) "
    "with rules, reasons and an audit log. "
    "Production audit integrity requires server-side storage and access controls. "
    "Credential and role mismatches hard-block without override; missing data never auto-approves; UrbanMart hours sum across locations (Mon-Sun). "
    f"{T['tests']} automated tests were run ({T['pass']} passed), testing unit edge cases, invariants, and simulated DOM checks beyond the {T['scenarios']} customer scenarios in the reproducibility suite. "
    "Plain JavaScript, zero runtime dependencies. "
    "I used Claude to draft code and text, recomputing numbers from the brief. "
    "Engineering needs: shared person IDs, rules service, approver routing, validated estimates, data back-fill."
)

assert words(SALES) <= 200, ('sales reply words', words(SALES))
assert words(BUILD) <= 200, ('build note words', words(BUILD))

def appendix_rows():
    c = lambda t: P(t, cell)
    return [[hdr('Claim'), hdr('Recalculated from the brief'), hdr('Result')],
     [c('Total ARR ₹4.08 Cr, 8 accounts'), c('110+84+60+48+36+30+22+18 = 408 lakh'), c('Confirmed')],
     [c('ARR renewing by Jan 2027'), c(f'FitZone 22 (Oct) + Brew &amp; Co 18 (Nov) + CarePoint 60 (Dec) + FreshBowl 84 (Jan) = {J["arr_lakh"]} lakh = {J["pct"]}% of 408. Excluding January: {A["renew_by_dec26"]["arr_lakh"]} lakh = {A["renew_by_dec26"]["pct"]}%.'), c('Confirmed; January is inclusive')],
     [c('7 of 12 accounts under 50% approved in 24h'), c('Active: FreshBowl 38, Spice Route 41, FitZone 35, Brew &amp; Co 29 (4 of 8). Lost: TandooriTown 22, GreenLeaf 31, PawsCare 33 (3 of 4; StyleHub 60 excluded).'), c('Confirmed; windows differ, correlation only')],
     [c('₹50L of ₹80L lost ARR'), c(f'25+16+9 = 50; 30+25+16+9 = 80; {A["lost_lt50_share_pct"]}%'), c('Confirmed; reasons recorded differ, so not all losses are attributable to slow approvals')],
     [c('Clinics + diagnostics ₹90L, 65 locations'), c(f'CarePoint 60 + MedAxis 30 = 90; 40 + 25 = 65; {cd["pct_of_arr"]}% of ARR'), c('Confirmed; MedAxis need unverified')],
     [c('FreshBowl WhatsApp cost'), c(f'2,900 swaps × ₹0.35 = ₹1,015 per message-per-swap per month. At 2 / 3 / 4 messages: ₹{wc["2"]["monthly_rs"]:,} / ₹{wc["3"]["monthly_rs"]:,} / ₹{wc["4"]["monthly_rs"]:,} a month; ₹{wc["2"]["annual_rs"]:,} / ₹{wc["3"]["annual_rs"]:,} / ₹{wc["4"]["annual_rs"]:,} a year.'), c('Depends on assumed messages per swap')],
     [c('Sprint capacity'), c('1 (certificate) + 2 (UrbanMart) + 3 (WhatsApp) = 6 = all capacity, no buffer. WhatsApp = 50% of capacity.'), c('Confirmed')],
     [c('Shares of ARR'), c(f'UrbanMart 110/408 = {A["share_UrbanMart"]}%; FreshBowl 84/408 = {A["share_FreshBowl"]}%; CarePoint 60/408 = {A["share_CarePoint"]}%; three requesters = {A["share_top3_requesters"]}%'), c('Confirmed')],
     [c('FreshBowl swaps waiting over 24h'), c(f'2,900 × (1 - 0.38) = {A["fb_swaps_not_24h"]:,}'), c('Approximate (assumes % applies to requests)')],
     [c('Managers\' time vs approval speed'), c(f'Across 8 accounts, scheduling hours per manager vs % approved in 24h: r = {A["corr_approval_vs_mgr_hours"]}'), c('Descriptive only, n = 8')],
     [c('FreshBowl manager: 25-30 requests a night'), c(f'Pack: 2,900 / 120 = {A["fb_swaps_per_location_month"]} per location per month; the quote implies about {A["fb_manager_quote_per_location_month_low"]}-{A["fb_manager_quote_per_location_month_high"]}'), c('Inconsistent; not used')],
     [c('UrbanMart VP "would look at options"'), c('Appears only in the sales memo; the VP\'s own quote in CS notes concerns overtime cost'), c('Unverified, second-hand')]]

# ============================== PAGE FURNITURE ==============================
class NumberedCanvas(canvas.Canvas):
    def __init__(self, *a, **k): super().__init__(*a, **k); self._saved = []
    def showPage(self): self._saved.append(dict(self.__dict__)); self._startPage()
    def save(self):
        n = len(self._saved)
        for st in self._saved:
            self.__dict__.update(st); self.setFont('DV', 7); self.setFillColor(MUTED)
            self.drawString(16*mm, 9*mm, 'Hubspark Product Intern 2027 case study: Shiftwell Q4 recommendation. Fictional company; prototype uses synthetic data.')
            self.drawRightString(A4[0] - 16*mm, 9*mm, f'Page {self._pageNumber} of {n}'); super().showPage()
        super().save()

def make_doc(path):
    d = BaseDocTemplate(path, pagesize=A4, leftMargin=16*mm, rightMargin=16*mm, topMargin=13*mm, bottomMargin=15*mm, title='Shiftwell Q4 Recommendation', author='Hubspark Product Intern 2027 candidate')
    d.addPageTemplates([PageTemplate(id='p', frames=[Frame(d.leftMargin, d.bottomMargin, d.width, d.height, id='f', leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)])]); return d

# --- memo page-count check (hard requirement: 2 pages) ---
temp_probe = os.path.join(tempfile.gettempdir(), '_memo_probe.pdf')
probe = make_doc(temp_probe); probe.build(memo_story(), canvasmaker=NumberedCanvas)
from pypdf import PdfReader
mp = len(PdfReader(temp_probe).pages)
try:
    os.remove(temp_probe)
except Exception:
    pass
print('CEO memo pages:', mp); assert mp <= 2, f'CEO memo is {mp} pages; must be 2 or fewer'

def tail_story():
    s = [PageBreak()]
    s.append(P('Reply to the sales head', h2p))
    for para in SALES.split('\n'): s.append(P(para, S('r', spaceAfter=4)))
    s.append(P(f'<font color="#556070">{words(SALES)} words (limit 200)</font>', small))
    s.append(P('Assumptions list', h2p))
    for a in ASSUMPTIONS: s.append(B(a, bul_s))
    s.append(PageBreak())
    s.append(P('Build note', h2p)); s.append(P(BUILD, S('bn', spaceAfter=3))); s.append(P(f'<font color="#556070">{words(BUILD)} words (limit 200)</font>', small))
    s.append(P('Working prototype', h2p))
    url = args.url or 'https://prototype-dun-omega.vercel.app/'
    s.append(P(f'Live URL: <link href="{url}" color="#2b3fae"><u><b>{url}</b></u></link>', body))
    s.append(P('The interactive prototype demonstrates the reusable swap-rules engine across CarePoint, FreshBowl and UrbanMart, including credential checks, role validation, missing-data handling, weekly-hours escalation and a reproducibility test suite. All demonstration records are synthetic; this is not a production compliance system. Production audit integrity requires server-side storage and access controls.', S('wp_desc', spaceBefore=2, spaceAfter=4)))
    s.append(P('Source code is in the prototype folder (src/engine.js, src/scenarios.js, src/app.js; tests in test/). Account policies and scenarios are fixed so every result is reproducible in an interview.', S('sc', spaceBefore=3)))
    s.append(P('AI disclosure', h2p))
    s.append(P(f'I used Claude (Anthropic) to structure the analysis, draft the memo, reply and build note, write the prototype and its tests, and produce this PDF. It did not supply customer data or benchmarks: every figure comes from the case-study tables and was recomputed by script (Appendix A). {T["tests"]} automated tests were run and {T["pass"]} passed (covering unit edge cases, safety invariants, and simulated DOM checks alongside the {T["scenarios"]} customer scenarios in the reproducibility suite); the page was exercised in a simulated DOM and live browser. I reviewed the content and can explain every number and claim. AI chat link: optional, not included.', body))
    s.append(PageBreak())
    s.append(P('Appendix A. Number audit (recomputed from the case-study data)', h2p))
    s.append(tbl(appendix_rows(), [48*mm, 88*mm, 42*mm]))
    s.append(P('No charts are used, so there are no chart labels to reconcile. All account renewal dates and ARR values in the memo match the September 2026 account table.', S('n', spaceBefore=4, fontSize=7.6)))
    return s

doc = make_doc(args.out)
doc.build(memo_story() + tail_story(), canvasmaker=NumberedCanvas)
n = len(PdfReader(args.out).pages)
print(f'Built {args.out} ({n} pages); sales words={words(SALES)}, build-note words={words(BUILD)}')
