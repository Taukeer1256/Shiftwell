'use strict';
// Run: node --test prototype/test/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const E = require('../src/engine.js');
const { POLICIES, SCENARIOS } = require('../src/scenarios.js');

const FIXED = '2026-10-17T00:00:00.000Z';
const mk = () => E.createEngine({ policies: POLICIES, now: () => FIXED });
const scen = (k) => SCENARIOS.find((s) => s.key === k);
const run = (eng, k) => { const s = scen(k); return eng.evaluate({ account: s.account, action: s.action, employee: s.employee, shift: s.shift, roster: s.roster }); };
const hasCode = (d, code) => d.findings.some((f) => f.code === code);

// ---- date helpers ----
test('dates: strict calendar validation and Monday-Sunday weeks', () => {
  assert.equal(E.dayNumber('2026-02-30'), null);
  assert.equal(E.dayNumber('2026-13-01'), null);
  assert.equal(E.dayNumber(''), null);
  assert.equal(E.dayNumber(undefined), null);
  assert.equal(E.dayNumber('12/11/2026'), null);
  assert.equal(E.dayToISO(E.weekStartDay(E.dayNumber('2026-11-12'))), '2026-11-09'); // Thu -> Mon
  assert.equal(E.dayToISO(E.weekStartDay(E.dayNumber('2026-11-09'))), '2026-11-09'); // Mon -> itself
  assert.equal(E.dayToISO(E.weekStartDay(E.dayNumber('2026-11-15'))), '2026-11-09'); // Sun -> previous Mon
  assert.equal(E.dayToISO(E.weekStartDay(E.dayNumber('2026-11-16'))), '2026-11-16'); // next Mon
});

test('shift span: overnight rolls over, zero-length and malformed are invalid', () => {
  assert.equal(E.shiftSpan({ date: '2026-11-12', start: '22:00', end: '06:00' }).minutes, 480);
  assert.equal(E.shiftSpan({ date: '2026-11-12', start: '08:00', end: '08:00' }), null);
  assert.equal(E.shiftSpan({ date: '2026-11-12', start: '8:00', end: '16:00' }), null);
  assert.equal(E.shiftSpan({ date: '', start: '08:00', end: '16:00' }), null);
});

// ---- credentials ----
test('valid credentials: swap passes checks, goes to manager (CarePoint auto-approve is off)', () => {
  const d = run(mk(), 'CP1'); assert.equal(d.status, 'READY_FOR_MANAGER');
});
test('expired credential blocks a swap', () => {
  const d = run(mk(), 'CP2'); assert.equal(d.status, 'BLOCKED'); assert.ok(hasCode(d, 'QUAL_EXPIRED'));
});
test('credential expiring ON the shift date does not qualify', () => {
  const d = run(mk(), 'CP3'); assert.equal(d.status, 'BLOCKED'); assert.ok(hasCode(d, 'QUAL_EXPIRED'));
  assert.match(d.reason, /on the shift date/);
});
test('credential expiring the day AFTER the shift qualifies', () => {
  const d = run(mk(), 'CP4'); assert.equal(d.status, 'READY_FOR_MANAGER');
});
test('expired credential also blocks roster ASSIGNMENT (not only swaps)', () => {
  const d = run(mk(), 'CP5'); assert.equal(d.status, 'BLOCKED'); assert.equal(d.action, 'ASSIGN');
});
test('role mismatch blocks at CarePoint', () => {
  const d = run(mk(), 'CP6'); assert.equal(d.status, 'BLOCKED'); assert.ok(hasCode(d, 'ROLE_MISMATCH'));
});
test('missing expiry date blocks (cannot verify)', () => {
  const d = run(mk(), 'CP7'); assert.equal(d.status, 'BLOCKED'); assert.ok(hasCode(d, 'EXPIRY_MISSING'));
});
test('missing qualification data entirely blocks', () => {
  const d = run(mk(), 'CP8'); assert.equal(d.status, 'BLOCKED'); assert.ok(hasCode(d, 'DATA_MISSING'));
});
test('missing shift date blocks (credential validity on the shift date cannot be verified)', () => {
  const d = run(mk(), 'CP9'); assert.equal(d.status, 'BLOCKED'); assert.ok(hasCode(d, 'DATA_MISSING'));
});
test('invalid calendar date for expiry is treated as missing/invalid, not valid', () => {
  const eng = mk(); const s = scen('CP1');
  const emp = JSON.parse(JSON.stringify(s.employee)); emp.qualifications[0].expires = '2027-02-30';
  const d = eng.evaluate({ account: 'CarePoint', action: 'SWAP', employee: emp, shift: s.shift });
  assert.equal(d.status, 'BLOCKED'); assert.ok(hasCode(d, 'EXPIRY_INVALID'));
});
test('inconsistent issue/expiry dates are unverifiable -> block', () => {
  const eng = mk(); const s = scen('CP1');
  const emp = JSON.parse(JSON.stringify(s.employee)); emp.qualifications[0].issued = '2028-01-01';
  const d = eng.evaluate({ account: 'CarePoint', action: 'SWAP', employee: emp, shift: s.shift });
  assert.equal(d.status, 'BLOCKED'); assert.ok(hasCode(d, 'DATES_INCONSISTENT'));
});
test('credential not required for the role does not block (affected role only)', () => {
  const d = run(mk(), 'CP10'); assert.equal(d.status, 'ALLOWED');
});
test('every one of the two required credentials is needed: one expired among two valid still blocks', () => {
  const eng = mk(); const s = scen('CP1');
  const emp = JSON.parse(JSON.stringify(s.employee)); emp.qualifications[1].expires = '2026-11-01';
  assert.equal(eng.evaluate({ account: 'CarePoint', action: 'SWAP', employee: emp, shift: s.shift }).status, 'BLOCKED');
});

// ---- hours ----
test('hours below cap (UrbanMart 40h) -> no escalation', () => {
  const d = run(mk(), 'UM1'); assert.equal(d.status, 'READY_FOR_MANAGER'); assert.equal(d.hours.totalMinutes, 40 * 60);
});
test('exactly 48h is allowed, not escalated', () => {
  const d = run(mk(), 'UM2'); assert.equal(d.status, 'READY_FOR_MANAGER'); assert.equal(d.hours.totalMinutes, 48 * 60); assert.ok(hasCode(d, 'AT_CAP'));
});
test('49h exceeds the cap -> escalated to the named regional approver', () => {
  const d = run(mk(), 'UM3'); assert.equal(d.status, 'ESCALATED'); assert.equal(d.hours.totalMinutes, 49 * 60);
  assert.equal(d.approver.id, 'RA-EAST'); assert.equal(d.approver.role, 'REGIONAL_APPROVER');
});
test('one minute over 48h escalates', () => {
  const eng = mk(); const s = scen('UM2');
  const sh = Object.assign({}, s.shift, { end: '22:01' });
  assert.equal(eng.evaluate({ account: 'UrbanMart', action: 'SWAP', employee: s.employee, shift: sh, roster: s.roster }).status, 'ESCALATED');
});
test('hours are summed across locations (52h), not just the home location (32h)', () => {
  const d = run(mk(), 'UM4'); assert.equal(d.status, 'ESCALATED'); assert.equal(d.hours.totalMinutes, 52 * 60);
  assert.equal(d.hours.byLocationMinutes['UM-Patna-03'], 24 * 60); assert.equal(d.hours.byLocationMinutes['UM-Ranchi-01'], 20 * 60);
});
test('week is Monday-Sunday: Sunday before and Monday after are excluded', () => {
  const d = run(mk(), 'UM5'); assert.equal(d.status, 'READY_FOR_MANAGER'); assert.equal(d.hours.totalMinutes, 40 * 60);
  assert.equal(d.hours.weekStart, '2026-11-09'); assert.equal(d.hours.weekEnd, '2026-11-15');
});
test('Sunday-night overnight shift is counted in the week it STARTS in', () => {
  const eng = mk();
  const roster = [0, 1, 2, 3, 4].map((i) => ({ id: 'R' + i, date: '2026-11-' + (9 + i < 10 ? '0' : '') + (9 + i), start: '09:00', end: '17:00', location: 'UM-Patna-03' })); // Mon-Fri 40h
  const sunNight = { id: 'N1', date: '2026-11-15', start: '22:00', end: '06:00', location: 'UM-Patna-03' }; // Sun 22:00 -> Mon 06:00, 8h
  const d = eng.evaluate({ account: 'UrbanMart', action: 'SWAP', employee: { id: 'E', roles: ['Store Associate'] }, shift: Object.assign({ role: 'Store Associate' }, sunNight), roster });
  assert.equal(d.hours.totalMinutes, 48 * 60); assert.equal(d.status, 'READY_FOR_MANAGER');
});
test('roster ASSIGNMENT pushing past 48h also escalates', () => {
  const d = run(mk(), 'UM6'); assert.equal(d.status, 'ESCALATED'); assert.equal(d.action, 'ASSIGN');
});
test('unverifiable roster (missing date) fails toward escalation at UrbanMart', () => {
  const d = run(mk(), 'UM7'); assert.equal(d.status, 'ESCALATED'); assert.ok(hasCode(d, 'DATA_MISSING'));
});
test('roster not provided -> unverifiable hours, never "under cap"', () => {
  const eng = mk(); const s = scen('UM1');
  const d = eng.evaluate({ account: 'UrbanMart', action: 'SWAP', employee: s.employee, shift: s.shift });
  assert.equal(d.status, 'ESCALATED'); assert.equal(d.hours, null);
});
test('overlapping shift is inconsistent data -> not silently counted', () => {
  const eng = mk(); const s = scen('UM1');
  const roster = [{ id: 'X', date: '2026-11-12', start: '10:00', end: '18:00', location: 'UM-Ranchi-01' }];
  const d = eng.evaluate({ account: 'UrbanMart', action: 'SWAP', employee: s.employee, shift: s.shift, roster });
  assert.equal(d.status, 'ESCALATED'); assert.ok(hasCode(d, 'DATA_INCONSISTENT'));
});
test('proposed shift already on the roster is flagged (no double counting)', () => {
  const eng = mk(); const s = scen('UM1');
  const roster = [Object.assign({}, s.shift)];
  assert.ok(hasCode(eng.evaluate({ account: 'UrbanMart', action: 'SWAP', employee: s.employee, shift: s.shift, roster }), 'DATA_INCONSISTENT'));
});
test('no approver configured for the location -> BLOCKED, never silently routed to the manager', () => {
  const d = run(mk(), 'UM8'); assert.equal(d.status, 'BLOCKED'); assert.ok(hasCode(d, 'NO_APPROVER')); assert.equal(d.approver, null);
});

// ---- FreshBowl auto-approval safety ----
test('FreshBowl: auto-approves only when every check passes', () => {
  assert.equal(run(mk(), 'FB1').status, 'AUTO_APPROVED');
  assert.equal(run(mk(), 'FB4').status, 'AUTO_APPROVED'); // exactly 48h
  assert.equal(run(mk(), 'FB1').resolution, null);
});
test('FreshBowl: confirmed role/training mismatch is BLOCKED (hard block)', () => {
  const d2 = run(mk(), 'FB2');
  assert.equal(d2.status, 'BLOCKED');
  assert.ok(hasCode(d2, 'QUAL_NOT_ON_FILE'));

  const d7 = run(mk(), 'FB7');
  assert.equal(d7.status, 'BLOCKED');
  assert.ok(hasCode(d7, 'ROLE_MISMATCH'));
});
test('FreshBowl: missing data, overtime, missing roster -> manager review (never auto)', () => {
  for (const k of ['FB3', 'FB5', 'FB6']) assert.equal(run(mk(), k).status, 'MANAGER_REVIEW', k);
});
test('FreshBowl: confirmed mismatch hard block cannot be overridden by manager or admin', () => {
  const eng = mk();
  const d = run(eng, 'FB2');
  assert.equal(eng.resolve(d.id, { actor: { id: 'LM-2', name: 'FB Mgr', role: 'LOCATION_MANAGER' }, outcome: 'APPROVE', reason: 'override' }).code, 'HARD_BLOCK_NO_OVERRIDE');
  assert.equal(eng.resolve(d.id, { actor: { id: 'ADM', name: 'Head Office', role: 'ADMIN' }, outcome: 'APPROVE', reason: 'override' }).code, 'HARD_BLOCK_NO_OVERRIDE');
});

// ---- no scenario ever auto-approves with a failing or unverifiable check ----
test('invariant: AUTO_APPROVED/ALLOWED/READY implies every finding is PASS', () => {
  const eng = mk();
  for (const s of SCENARIOS) {
    const d = eng.evaluate({ account: s.account, action: s.action, employee: s.employee, shift: s.shift, roster: s.roster });
    if (['AUTO_APPROVED', 'ALLOWED', 'READY_FOR_MANAGER'].includes(d.status)) assert.ok(d.findings.every((f) => f.severity === 'PASS'), s.key);
  }
});
test('invariant: every scenario returns its declared expected status', () => {
  const eng = mk();
  for (const s of SCENARIOS) {
    const d = eng.evaluate({ account: s.account, action: s.action, employee: s.employee, shift: s.shift, roster: s.roster });
    assert.equal(d.status, s.expect, s.key + ' ' + s.title);
  }
});
test('unknown account, missing employee/shift -> blocked', () => {
  const eng = mk();
  assert.equal(eng.evaluate({ account: 'Nope', employee: {}, shift: {} }).status, 'BLOCKED');
  assert.equal(eng.evaluate({ account: 'CarePoint' }).status, 'BLOCKED');
  assert.equal(eng.evaluate().status, 'BLOCKED');
});

// ---- determinism ----
test('deterministic: same input gives identical findings and status (no dependence on today)', () => {
  const a = mk(), b = mk();
  for (const s of SCENARIOS) {
    const x = a.evaluate({ account: s.account, action: s.action, employee: s.employee, shift: s.shift, roster: s.roster });
    const y = b.evaluate({ account: s.account, action: s.action, employee: s.employee, shift: s.shift, roster: s.roster });
    assert.deepEqual([x.status, x.rule, x.reason, x.findings, x.hours], [y.status, y.rule, y.reason, y.findings, y.hours], s.key);
  }
});

// ---- overrides and authorization ----
test('hard block cannot be approved by a manager: denied and logged', () => {
  const eng = mk(); const d = run(eng, 'CP2');
  const r = eng.resolve(d.id, { actor: { id: 'LM-1', name: 'Clinic Manager', role: 'LOCATION_MANAGER' }, outcome: 'APPROVE', reason: 'short staffed tonight' });
  assert.equal(r.ok, false); assert.equal(r.code, 'HARD_BLOCK_NO_OVERRIDE');
  const last = eng.auditLog().slice(-1)[0]; assert.equal(last.event, 'ACTION_DENIED'); assert.equal(last.rule, 'HARD_BLOCK_NO_OVERRIDE');
  assert.equal(eng.getDecision(d.id).resolution, null);
});
test('hard block cannot be approved by an Admin either', () => {
  const eng = mk(); const d = run(eng, 'CP3');
  assert.equal(eng.resolve(d.id, { actor: { id: 'ADM', name: 'Head Office', role: 'ADMIN' }, outcome: 'APPROVE', reason: 'x' }).code, 'HARD_BLOCK_NO_OVERRIDE');
});
test('escalation: Location Manager cannot approve the weekly-hours exception', () => {
  const eng = mk(); const d = run(eng, 'UM3');
  const r = eng.resolve(d.id, { actor: { id: 'LM-3', name: 'Store Mgr', role: 'LOCATION_MANAGER' }, outcome: 'APPROVE', reason: 'ok' });
  assert.equal(r.ok, false); assert.equal(r.code, 'NOT_AUTHORIZED');
});
test('escalation: wrong region approver is denied; named approver needs a reason, then succeeds', () => {
  const eng = mk(); const d = run(eng, 'UM3');
  assert.equal(eng.resolve(d.id, { actor: { id: 'RA-WEST', name: 'Other', role: 'REGIONAL_APPROVER' }, outcome: 'APPROVE', reason: 'ok' }).code, 'NOT_AUTHORIZED');
  assert.equal(eng.resolve(d.id, { actor: { id: 'RA-EAST', name: 'Meera Sen', role: 'REGIONAL_APPROVER' }, outcome: 'APPROVE', reason: '  ' }).code, 'REASON_REQUIRED');
  const ok = eng.resolve(d.id, { actor: { id: 'RA-EAST', name: 'Meera Sen', role: 'REGIONAL_APPROVER' }, outcome: 'APPROVE', reason: 'festival cover, rest day guaranteed' });
  assert.equal(ok.ok, true); assert.equal(eng.getDecision(d.id).resolution.outcome, 'APPROVE');
  assert.equal(eng.resolve(d.id, { actor: { id: 'RA-EAST', name: 'Meera Sen', role: 'REGIONAL_APPROVER' }, outcome: 'REJECT' }).code, 'ALREADY_RESOLVED');
});
test('anyone may reject a blocked/escalated request (safe direction)', () => {
  const eng = mk(); const d = run(eng, 'CP2');
  assert.equal(eng.resolve(d.id, { actor: { id: 'LM-1', name: 'Mgr', role: 'LOCATION_MANAGER' }, outcome: 'REJECT', reason: 'noted' }).ok, true);
});
test('manager review: manager can approve with a reason; reason is mandatory', () => {
  const eng = mk(); const d = run(eng, 'FB3');
  assert.equal(eng.resolve(d.id, { actor: { id: 'LM-2', name: 'FB Mgr', role: 'LOCATION_MANAGER' }, outcome: 'APPROVE' }).code, 'REASON_REQUIRED');
  assert.equal(eng.resolve(d.id, { actor: { id: 'LM-2', name: 'FB Mgr', role: 'LOCATION_MANAGER' }, outcome: 'APPROVE', reason: 'training record verified manually on paper' }).ok, true);
});
test('auto-approved decision needs no human action', () => {
  const eng = mk(); const d = run(eng, 'FB1');
  assert.equal(eng.resolve(d.id, { actor: { id: 'LM-2', role: 'LOCATION_MANAGER' }, outcome: 'APPROVE' }).code, 'NOTHING_TO_RESOLVE');
});
test('safety invariant: missing shift dates, missing roster hours, and invalid inputs never auto-approve', () => {
  const eng = mk();
  const s1 = scen('FB1');
  // Missing shift date
  const d1 = eng.evaluate({ account: 'FreshBowl', action: 'SWAP', employee: s1.employee, shift: Object.assign({}, s1.shift, { date: '' }), roster: s1.roster });
  assert.notEqual(d1.status, 'AUTO_APPROVED');
  assert.notEqual(d1.status, 'ALLOWED');

  // Invalid calendar date
  const d2 = eng.evaluate({ account: 'FreshBowl', action: 'SWAP', employee: s1.employee, shift: Object.assign({}, s1.shift, { date: '2026-02-30' }), roster: s1.roster });
  assert.notEqual(d2.status, 'AUTO_APPROVED');
  assert.notEqual(d2.status, 'ALLOWED');

  // Missing roster hours on account with weekly hours cap
  const d3 = eng.evaluate({ account: 'FreshBowl', action: 'SWAP', employee: s1.employee, shift: s1.shift });
  assert.notEqual(d3.status, 'AUTO_APPROVED');
  assert.notEqual(d3.status, 'ALLOWED');
  assert.equal(d3.status, 'MANAGER_REVIEW');

  // Missing employee roles
  const d4 = eng.evaluate({ account: 'FreshBowl', action: 'SWAP', employee: { id: 'EMP-99', roles: [] }, shift: s1.shift, roster: s1.roster });
  assert.notEqual(d4.status, 'AUTO_APPROVED');
  assert.notEqual(d4.status, 'ALLOWED');

  // Zero-length or malformed shift time
  const d5 = eng.evaluate({ account: 'FreshBowl', action: 'SWAP', employee: s1.employee, shift: Object.assign({}, s1.shift, { start: '08:00', end: '08:00' }), roster: s1.roster });
  assert.notEqual(d5.status, 'AUTO_APPROVED');
  assert.notEqual(d5.status, 'ALLOWED');
});

// ---- audit log ----
test('audit log records decision, timestamp, rule and reason for every evaluation', () => {
  const eng = mk(); for (const s of SCENARIOS) eng.evaluate({ account: s.account, action: s.action, employee: s.employee, shift: s.shift, roster: s.roster });
  const log = eng.auditLog(); assert.equal(log.length, SCENARIOS.length);
  for (const e of log) {
    assert.ok(e.outcome, 'decision'); assert.equal(e.timestamp, FIXED); assert.ok(e.rule && e.rule.includes(':'), 'rule'); assert.ok(e.reason && e.reason.length > 10, 'reason');
    assert.ok(e.account && e.decisionId && e.event === 'EVALUATED');
  }
  assert.deepEqual(log.map((e) => e.seq), log.map((_, i) => i + 1));
});
test('audit log copies are immutable to callers', () => {
  const eng = mk(); run(eng, 'CP1'); const l = eng.auditLog(); l[0].outcome = 'TAMPERED';
  assert.equal(eng.auditLog()[0].outcome, 'READY_FOR_MANAGER');
});

// ---- UI-source guard: disclaimer present in the shipped page template ----
test('prototype template contains the synthetic-data / not-production disclaimer', () => {
  const html = fs.readFileSync(path.join(__dirname, '../src/index.template.html'), 'utf8');
  assert.match(html, /synthetic data/i); assert.match(html, /not a production compliance system/i);
});
