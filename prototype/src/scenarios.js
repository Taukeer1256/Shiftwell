/*
 * SYNTHETIC DATA ONLY. Names, IDs, dates, locations and approvers are invented for the demo.
 * Account policies below encode the case-study requests plus labelled assumptions.
 * Reference week used by all scenarios: Mon 2026-11-09 to Sun 2026-11-15 (shift date Thu 2026-11-12).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ShiftwellData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var POLICIES = {
    CarePoint: {
      label: 'CarePoint Clinics',
      source: 'Request (brief): block anyone being scheduled or swapped into a shift if a certificate their role requires has expired. Nurses need valid BLS + nursing council registration.',
      summary: [
        'FACT (Brief): Staff Nurse shifts require BLS and Nursing Council registration, each with an expiry date.',
        'FACT (Brief): A credential that expires on or before the shift date does not qualify. Applies to BOTH roster assignment and swaps.',
        'FACT (Brief): Expired, missing, invalid, or role-mismatched mandatory credentials must be hard-blocked. Zero override.',
        'ASSUMPTION: Compliant CarePoint swaps still require Location Manager sign-off (auto-approval is disabled).'
      ],
      requiredQualifications: {
        'role:Staff Nurse': [
          { type: 'BLS', label: 'BLS certificate', expiryRequired: true },
          { type: 'NURSING_COUNCIL_REG', label: 'Nursing council registration', expiryRequired: true }
        ]
      },
      onQualificationFailure: 'BLOCK', onMissingQualificationData: 'BLOCK', onRoleMismatch: 'BLOCK',
      weeklyHoursCap: null, autoApprove: false
    },
    FreshBowl: {
      label: 'FreshBowl',
      source: 'Request (brief): WhatsApp swaps/approvals. Underlying need (interviews): faster approvals; manager only checks station training and overtime.',
      summary: [
        'FACT (Brief): Auto-approve a swap only when role, station training, and weekly-hours checks ALL pass.',
        'FACT (Brief): Confirmed employee role or station training mismatch must be BLOCKED (hard safety block, no override).',
        'FACT (Brief): Missing or unverifiable training data or roster hours routes to manual manager review (never auto-approves).',
        'ASSUMPTION: Overtime threshold is 48h/week; station training stored as a non-expiring qualification.'
      ],
      requiredQualifications: {
        'station:Grill': [{ type: 'STATION_GRILL', label: 'Grill station training', expiryRequired: false }]
      },
      onQualificationFailure: 'BLOCK', onMissingQualificationData: 'REVIEW', onRoleMismatch: 'BLOCK',
      weeklyHoursCap: 48, onOverCap: 'REVIEW', onMissingHoursData: 'REVIEW', autoApprove: true
    },
    UrbanMart: {
      label: 'UrbanMart',
      source: 'Request (brief): any shift that takes someone past 48 hrs/week must need regional manager approval.',
      summary: [
        'FACT (Brief): Weekly hours calculated across ALL store locations in the Mon-Sun week + the proposed shift.',
        'FACT (Brief): More than 48h requires regional manager approval. Exactly 48h does not trigger the past-48-hours rule.',
        'FACT (Brief): Applies to both roster assignment and swaps. Unverifiable hours escalate to regional approver.',
        'ASSUMPTION: No approver configured for location hard-blocks until configured. Compliant swaps need Location Manager sign-off.'
      ],
      requiredQualifications: {},
      onQualificationFailure: 'REVIEW', onMissingQualificationData: 'REVIEW', onRoleMismatch: 'REVIEW',
      weeklyHoursCap: 48, onOverCap: 'ESCALATE', onMissingHoursData: 'ESCALATE', autoApprove: false,
      locationRegion: { 'UM-Patna-03': 'East', 'UM-Ranchi-01': 'East', 'UM-Kolkata-02': 'East', 'UM-Goa-01': 'West' },
      regionApprovers: { East: { id: 'RA-EAST', name: 'Meera Sen (Regional Manager, East)' } } // West intentionally has none
    }
  };

  // ---- builders ----
  function sh(id, date, start, end, location) { return { id: id, date: date, start: start, end: end, location: location }; }
  function r8(id, date, location) { return sh(id, date, '09:00', '17:00', location); }
  function nurse(extra) { var e = { id: 'EMP-1001', name: 'Asha (synthetic)', roles: ['Staff Nurse'] }; for (var k in extra) e[k] = extra[k]; return e; }
  var CP_SHIFT = { id: 'SH-CP-01', date: '2026-11-12', start: '08:00', end: '16:00', role: 'Staff Nurse', location: 'CP-Clinic-07' };
  var FB_SHIFT = { id: 'SH-FB-01', date: '2026-11-12', start: '18:00', end: '23:00', role: 'Line Cook', station: 'Grill', location: 'FB-Store-12' };
  var UM_SHIFT = { id: 'SH-UM-01', date: '2026-11-12', start: '14:00', end: '22:00', role: 'Store Associate', location: 'UM-Patna-03' };
  var goodQuals = [{ type: 'BLS', expires: '2027-03-31' }, { type: 'NURSING_COUNCIL_REG', expires: '2027-06-30' }];
  function cook(quals) { return { id: 'EMP-2001', name: 'Ravi (synthetic)', roles: ['Line Cook'], qualifications: quals }; }
  function assoc() { return { id: 'EMP-3001', name: 'Kiran (synthetic)', roles: ['Store Associate'] }; }
  function copy(o, patch) { var c = JSON.parse(JSON.stringify(o)); for (var k in patch) c[k] = patch[k]; return c; }

  var SCENARIOS = [
    // ---------------- CarePoint ----------------
    { key: 'CP1', account: 'CarePoint', title: 'Valid credentials (swap)', expect: 'READY_FOR_MANAGER', action: 'SWAP', employee: nurse({ qualifications: goodQuals }), shift: CP_SHIFT },
    { key: 'CP2', account: 'CarePoint', title: 'BLS expired (swap)', expect: 'BLOCKED', action: 'SWAP', employee: nurse({ qualifications: [{ type: 'BLS', expires: '2026-10-31' }, goodQuals[1]] }), shift: CP_SHIFT },
    { key: 'CP3', account: 'CarePoint', title: 'BLS expires ON the shift date (swap)', expect: 'BLOCKED', action: 'SWAP', employee: nurse({ qualifications: [{ type: 'BLS', expires: '2026-11-12' }, goodQuals[1]] }), shift: CP_SHIFT },
    { key: 'CP4', account: 'CarePoint', title: 'BLS expires the day AFTER the shift (swap)', expect: 'READY_FOR_MANAGER', action: 'SWAP', employee: nurse({ qualifications: [{ type: 'BLS', expires: '2026-11-13' }, goodQuals[1]] }), shift: CP_SHIFT },
    { key: 'CP5', account: 'CarePoint', title: 'Expired BLS, roster assignment (not a swap)', expect: 'BLOCKED', action: 'ASSIGN', employee: nurse({ qualifications: [{ type: 'BLS', expires: '2026-09-01' }, goodQuals[1]] }), shift: CP_SHIFT },
    { key: 'CP6', account: 'CarePoint', title: 'Role mismatch: Clinic Assistant into nurse shift', expect: 'BLOCKED', action: 'SWAP', employee: { id: 'EMP-1002', name: 'Dev (synthetic)', roles: ['Clinic Assistant'], qualifications: goodQuals }, shift: CP_SHIFT },
    { key: 'CP7', account: 'CarePoint', title: 'Registration has no expiry date recorded', expect: 'BLOCKED', action: 'SWAP', employee: nurse({ qualifications: [goodQuals[0], { type: 'NURSING_COUNCIL_REG' }] }), shift: CP_SHIFT },
    { key: 'CP8', account: 'CarePoint', title: 'No qualification data on file at all', expect: 'BLOCKED', action: 'SWAP', employee: nurse({}), shift: CP_SHIFT },
    { key: 'CP9', account: 'CarePoint', title: 'Shift date missing', expect: 'BLOCKED', action: 'SWAP', employee: nurse({ qualifications: goodQuals }), shift: copy(CP_SHIFT, { date: '' }) },
    { key: 'CP10', account: 'CarePoint', title: 'Expired BLS, but the role does not require BLS', expect: 'ALLOWED', action: 'ASSIGN', employee: { id: 'EMP-1002', name: 'Dev (synthetic)', roles: ['Clinic Assistant'], qualifications: [{ type: 'BLS', expires: '2026-01-01' }] }, shift: copy(CP_SHIFT, { id: 'SH-CP-02', role: 'Clinic Assistant' }) },

    // ---------------- FreshBowl ----------------
    { key: 'FB1', account: 'FreshBowl', title: 'Trained, under weekly cap', expect: 'AUTO_APPROVED', action: 'SWAP', employee: cook([{ type: 'STATION_GRILL' }]), shift: FB_SHIFT,
      roster: [r8('R1', '2026-11-09', 'FB-Store-12'), r8('R2', '2026-11-10', 'FB-Store-12'), r8('R3', '2026-11-11', 'FB-Store-12')] },
    { key: 'FB2', account: 'FreshBowl', title: 'Not trained for the Grill station', expect: 'BLOCKED', action: 'SWAP', employee: cook([{ type: 'STATION_FRYER' }]), shift: FB_SHIFT, roster: [] },
    { key: 'FB3', account: 'FreshBowl', title: 'Training data missing', expect: 'MANAGER_REVIEW', action: 'SWAP', employee: cook(undefined), shift: FB_SHIFT, roster: [] },
    { key: 'FB4', account: 'FreshBowl', title: 'Exactly 48h this week', expect: 'AUTO_APPROVED', action: 'SWAP', employee: cook([{ type: 'STATION_GRILL' }]), shift: FB_SHIFT,
      roster: [sh('R1', '2026-11-09', '08:00', '19:00', 'FB-Store-12'), sh('R2', '2026-11-10', '08:00', '19:00', 'FB-Store-12'), sh('R3', '2026-11-11', '08:00', '19:00', 'FB-Store-12'), sh('R4', '2026-11-13', '08:00', '18:00', 'FB-Store-12')] }, // 11+11+11+10 = 43 + 5 = 48
    { key: 'FB5', account: 'FreshBowl', title: 'Overtime: 49h this week', expect: 'MANAGER_REVIEW', action: 'SWAP', employee: cook([{ type: 'STATION_GRILL' }]), shift: FB_SHIFT,
      roster: [sh('R1', '2026-11-09', '08:00', '19:00', 'FB-Store-12'), sh('R2', '2026-11-10', '08:00', '19:00', 'FB-Store-12'), sh('R3', '2026-11-11', '08:00', '19:00', 'FB-Store-12'), sh('R4', '2026-11-13', '08:00', '19:00', 'FB-Store-12')] }, // 44 + 5 = 49
    { key: 'FB6', account: 'FreshBowl', title: 'Roster hours unavailable', expect: 'MANAGER_REVIEW', action: 'SWAP', employee: cook([{ type: 'STATION_GRILL' }]), shift: FB_SHIFT /* roster omitted */ },
    { key: 'FB7', account: 'FreshBowl', title: 'Role mismatch: Cashier into Line Cook shift', expect: 'BLOCKED', action: 'SWAP', employee: { id: 'EMP-2002', name: 'Sana (synthetic)', roles: ['Cashier'], qualifications: [{ type: 'STATION_GRILL' }] }, shift: FB_SHIFT, roster: [] },

    // ---------------- UrbanMart ----------------
    { key: 'UM1', account: 'UrbanMart', title: 'Below cap: 40h total', expect: 'READY_FOR_MANAGER', action: 'SWAP', employee: assoc(), shift: UM_SHIFT,
      roster: [r8('R1', '2026-11-09', 'UM-Patna-03'), r8('R2', '2026-11-10', 'UM-Patna-03'), r8('R3', '2026-11-11', 'UM-Patna-03'), r8('R4', '2026-11-13', 'UM-Patna-03')] },
    { key: 'UM2', account: 'UrbanMart', title: 'Exactly 48h: allowed', expect: 'READY_FOR_MANAGER', action: 'SWAP', employee: assoc(), shift: UM_SHIFT,
      roster: [r8('R1', '2026-11-09', 'UM-Patna-03'), r8('R2', '2026-11-10', 'UM-Patna-03'), r8('R3', '2026-11-11', 'UM-Patna-03'), r8('R4', '2026-11-13', 'UM-Patna-03'), r8('R5', '2026-11-14', 'UM-Patna-03')] }, // 40 + 8
    { key: 'UM3', account: 'UrbanMart', title: 'Over 48h: 49h, escalate to regional approver', expect: 'ESCALATED', action: 'SWAP', employee: assoc(), shift: UM_SHIFT,
      roster: [r8('R1', '2026-11-09', 'UM-Patna-03'), r8('R2', '2026-11-10', 'UM-Patna-03'), r8('R3', '2026-11-11', 'UM-Patna-03'), r8('R4', '2026-11-13', 'UM-Patna-03'), sh('R5', '2026-11-14', '09:00', '18:00', 'UM-Patna-03')] }, // 41 + 8
    { key: 'UM4', account: 'UrbanMart', title: 'Across two locations: 52h total', expect: 'ESCALATED', action: 'SWAP', employee: assoc(), shift: UM_SHIFT,
      roster: [sh('R1', '2026-11-09', '09:00', '21:00', 'UM-Patna-03'), sh('R2', '2026-11-10', '09:00', '21:00', 'UM-Patna-03'), sh('R3', '2026-11-11', '09:00', '19:00', 'UM-Ranchi-01'), sh('R4', '2026-11-13', '09:00', '19:00', 'UM-Ranchi-01')] }, // 12+12 at Patna, 10+10 at Ranchi = 44 + 8 = 52; Patna alone = 32
    { key: 'UM5', account: 'UrbanMart', title: 'Neighbouring weeks are not counted', expect: 'READY_FOR_MANAGER', action: 'SWAP', employee: assoc(), shift: UM_SHIFT,
      roster: [sh('P1', '2026-11-08', '08:00', '20:00', 'UM-Patna-03'), r8('R1', '2026-11-09', 'UM-Patna-03'), r8('R2', '2026-11-10', 'UM-Patna-03'), r8('R3', '2026-11-11', 'UM-Patna-03'), r8('R4', '2026-11-13', 'UM-Patna-03'), sh('N1', '2026-11-16', '08:00', '20:00', 'UM-Patna-03')] }, // in-week 32 + 8 = 40; Sun 8th and Mon 16th excluded
    { key: 'UM6', account: 'UrbanMart', title: 'Roster assignment pushing over 48h', expect: 'ESCALATED', action: 'ASSIGN', employee: assoc(), shift: UM_SHIFT,
      roster: [r8('R1', '2026-11-09', 'UM-Patna-03'), r8('R2', '2026-11-10', 'UM-Patna-03'), r8('R3', '2026-11-11', 'UM-Patna-03'), r8('R4', '2026-11-13', 'UM-Patna-03'), sh('R5', '2026-11-14', '09:00', '18:00', 'UM-Patna-03')] },
    { key: 'UM7', account: 'UrbanMart', title: 'A rostered shift has a missing date', expect: 'ESCALATED', action: 'SWAP', employee: assoc(), shift: UM_SHIFT,
      roster: [r8('R1', '2026-11-09', 'UM-Patna-03'), { id: 'R2', date: '', start: '09:00', end: '17:00', location: 'UM-Ranchi-01' }] },
    { key: 'UM8', account: 'UrbanMart', title: 'Over 48h at a location with no approver configured', expect: 'BLOCKED', action: 'SWAP', employee: assoc(), shift: copy(UM_SHIFT, { location: 'UM-Goa-01' }),
      roster: [sh('R1', '2026-11-09', '08:00', '20:00', 'UM-Goa-01'), sh('R2', '2026-11-10', '08:00', '20:00', 'UM-Goa-01'), sh('R3', '2026-11-11', '08:00', '20:00', 'UM-Goa-01'), sh('R4', '2026-11-13', '08:00', '20:00', 'UM-Goa-01')] }
  ];

  return { POLICIES: POLICIES, SCENARIOS: SCENARIOS };
});
