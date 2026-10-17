/*
 * Shiftwell swap-rules engine (PROTOTYPE).
 * Synthetic data only. NOT a production compliance system.
 *
 * Design rules:
 *  - Pure functions: a decision depends only on the request + account policy, never on today's date.
 *    (Only the audit timestamp uses the clock, and the clock is injectable for tests.)
 *  - Fail safe: anything missing, malformed or inconsistent can never auto-approve.
 *  - Hard compliance blocks have no override path.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ShiftwellEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- date / time helpers (UTC arithmetic, no local-timezone dependence) ----------
  var ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
  var HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

  /** Returns day number (days since 1970-01-01) for a strict, real calendar date, else null. */
  function dayNumber(s) {
    if (typeof s !== 'string') return null;
    var m = ISO_DATE.exec(s);
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var t = Date.UTC(y, mo - 1, d);
    var dt = new Date(t);
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null; // e.g. 2026-02-30
    return Math.round(t / 86400000);
  }
  function dayToISO(n) { return new Date(n * 86400000).toISOString().slice(0, 10); }
  /** Monday of the week containing day number n (Monday-to-Sunday weeks). 1970-01-01 was a Thursday. */
  function weekStartDay(n) { var dow = (n + 3) % 7; /* 0 = Monday */ return n - dow; }
  function minutesOfDay(s) { var m = typeof s === 'string' ? HHMM.exec(s) : null; return m ? (+m[1]) * 60 + (+m[2]) : null; }

  /** Parses a shift into absolute minutes. Overnight (end < start) rolls into the next day but is
   *  attributed to the week of the START date. Zero-length or malformed shifts are invalid (null). */
  function shiftSpan(sh) {
    if (!sh) return null;
    var d = dayNumber(sh.date), a = minutesOfDay(sh.start), b = minutesOfDay(sh.end);
    if (d === null || a === null || b === null || a === b) return null;
    var dur = b > a ? b - a : b + 1440 - a;
    var start = d * 1440 + a;
    return { day: d, start: start, end: start + dur, minutes: dur };
  }

  function fmtHours(mins) { var h = mins / 60; return (Math.round(h * 100) / 100).toString().replace(/\.0+$/, '') + 'h'; }

  // ---------- findings ----------
  // severity order (highest first): BLOCK > ESCALATE > REVIEW > PASS
  var RANK = { BLOCK: 3, ESCALATE: 2, REVIEW: 1, PASS: 0 };
  function F(rule, severity, code, message) { return { rule: rule, severity: severity, code: code, message: message }; }

  function missingOutcome(policyValue) { // 'BLOCK' | 'ESCALATE' | 'REVIEW'
    return RANK[policyValue] !== undefined ? policyValue : 'BLOCK';
  }

  // ---------- rule: role fit ----------
  function checkRole(policy, employee, shift) {
    var rule = 'ROLE_FIT';
    if (!shift || typeof shift.role !== 'string' || !shift.role) return [F(rule, missingOutcome(policy.onMissingQualificationData), 'DATA_MISSING', 'Shift role is missing, so role fit cannot be verified.')];
    if (!Array.isArray(employee && employee.roles) || employee.roles.length === 0) return [F(rule, missingOutcome(policy.onMissingQualificationData), 'DATA_MISSING', 'Employee role data is missing, so role fit cannot be verified.')];
    if (employee.roles.indexOf(shift.role) === -1) {
      return [F(rule, policy.onRoleMismatch, 'ROLE_MISMATCH', 'Employee is a ' + employee.roles.join('/') + '; this shift requires ' + shift.role + '.')];
    }
    return [F(rule, 'PASS', 'ROLE_OK', 'Role matches (' + shift.role + ').')];
  }

  // ---------- rule: qualifications / certificates ----------
  function requirementsFor(policy, shift) {
    var map = policy.requiredQualifications || {};
    var keys = [];
    if (shift && shift.role && map['role:' + shift.role]) keys = keys.concat(map['role:' + shift.role]);
    if (shift && shift.station && map['station:' + shift.station]) keys = keys.concat(map['station:' + shift.station]);
    return keys;
  }

  function checkQualifications(policy, employee, shift) {
    var out = [], rule = 'QUALIFICATION';
    var missing = missingOutcome(policy.onMissingQualificationData);
    var shiftDay = dayNumber(shift && shift.date);

    if (shiftDay === null) {
      return [F(rule, missing, 'DATA_MISSING', 'Shift date is missing or invalid, so credential validity on the shift date cannot be verified.')];
    }
    var reqs = requirementsFor(policy, shift);
    if (reqs.length === 0) return [F(rule, 'PASS', 'NO_REQUIREMENT', 'No qualification required for this role/station under this account\'s policy.')];

    if (!employee || !Array.isArray(employee.qualifications)) {
      return [F(rule, missing, 'DATA_MISSING', 'Qualification data is not on file for this employee; cannot verify ' + reqs.map(function (r) { return r.label; }).join(', ') + '.')];
    }
    reqs.forEach(function (req) {
      var rec = null;
      for (var i = 0; i < employee.qualifications.length; i++) if (employee.qualifications[i] && employee.qualifications[i].type === req.type) { rec = employee.qualifications[i]; break; }
      if (!rec) { out.push(F(rule, policy.onQualificationFailure, 'QUAL_NOT_ON_FILE', req.label + ' is required but no record is on file.')); return; }
      var hasExpiryField = rec.expires !== undefined && rec.expires !== null;
      if (req.expiryRequired && !hasExpiryField) { out.push(F(rule, missing, 'EXPIRY_MISSING', req.label + ' has no expiry date recorded; cannot verify it is valid on the shift date.')); return; }
      if (!hasExpiryField) { out.push(F(rule, 'PASS', 'QUAL_OK', req.label + ' on file (no expiry).')); return; }
      var expDay = dayNumber(rec.expires);
      if (expDay === null) { out.push(F(rule, missing, 'EXPIRY_INVALID', req.label + ' expiry date "' + rec.expires + '" is not a valid date; cannot verify.')); return; }
      var issuedDay = rec.issued ? dayNumber(rec.issued) : null;
      if (rec.issued && (issuedDay === null || issuedDay >= expDay)) { out.push(F(rule, missing, 'DATES_INCONSISTENT', req.label + ' issue/expiry dates are inconsistent; cannot verify.')); return; }
      // A credential qualifies only if it expires strictly AFTER the shift date.
      if (expDay <= shiftDay) {
        out.push(F(rule, policy.onQualificationFailure, 'QUAL_EXPIRED', req.label + ' ' + (expDay === shiftDay ? 'expires on the shift date (' : 'expired on ') + rec.expires + '; a credential expiring on or before the shift date does not qualify.')); return;
      }
      out.push(F(rule, 'PASS', 'QUAL_OK', req.label + ' valid through ' + rec.expires + ' (after shift date ' + shift.date + ').'));
    });
    return out;
  }

  // ---------- rule: weekly hours cap ----------
  function checkHours(policy, employee, shift, roster) {
    var rule = 'WEEKLY_HOURS';
    if (!policy.weeklyHoursCap) return null;
    var capMin = policy.weeklyHoursCap * 60;
    var unver = missingOutcome(policy.onMissingHoursData);
    var span = shiftSpan(shift);
    if (!span) return { finding: F(rule, unver, 'DATA_MISSING', 'Proposed shift date/time is missing or invalid; weekly hours cannot be verified.') };
    if (!Array.isArray(roster)) return { finding: F(rule, unver, 'DATA_MISSING', 'Employee\'s rostered hours for the week are unavailable; weekly hours cannot be verified.') };

    var wkStart = weekStartDay(span.day), wkEnd = wkStart + 6;
    var existing = 0, byLoc = {}, spans = [];
    for (var i = 0; i < roster.length; i++) {
      var r = roster[i], rs = shiftSpan(r);
      if (!rs) return { finding: F(rule, unver, 'DATA_MISSING', 'A rostered shift' + (r && r.id ? ' (' + r.id + ')' : '') + ' has a missing or invalid date/time; weekly hours cannot be verified.') };
      if (r.id && shift.id && r.id === shift.id) return { finding: F(rule, unver, 'DATA_INCONSISTENT', 'The proposed shift is already on this employee\'s roster; hours would be double counted.') };
      if (rs.start < span.end && span.start < rs.end) return { finding: F(rule, unver, 'DATA_INCONSISTENT', 'The proposed shift overlaps rostered shift ' + (r.id || '(unnamed)') + '.') };
      if (rs.day >= wkStart && rs.day <= wkEnd) { // week of the shift's START date
        existing += rs.minutes; var loc = r.location || 'unknown location'; byLoc[loc] = (byLoc[loc] || 0) + rs.minutes;
      }
    }
    var total = existing + span.minutes;
    var detail = Object.keys(byLoc).map(function (k) { return k + ' ' + fmtHours(byLoc[k]); });
    detail.push((shift.location || 'proposed shift') + ' ' + fmtHours(span.minutes) + ' (proposed)');
    var hours = { weekStart: dayToISO(wkStart), weekEnd: dayToISO(wkEnd), existingMinutes: existing, proposedMinutes: span.minutes, totalMinutes: total, capMinutes: capMin, byLocationMinutes: byLoc, detail: detail };
    var msg = 'Week ' + hours.weekStart + ' to ' + hours.weekEnd + ' (Mon-Sun), all locations: ' + detail.join(' + ') + ' = ' + fmtHours(total) + ' vs cap ' + policy.weeklyHoursCap + 'h.';
    if (total > capMin) return { hours: hours, finding: F(rule, missingOutcome(policy.onOverCap || 'ESCALATE'), 'OVER_CAP', msg + ' Exceeds the cap.'), overCap: true };
    return { hours: hours, finding: F(rule, 'PASS', total === capMin ? 'AT_CAP' : 'UNDER_CAP', msg + (total === capMin ? ' Exactly at the cap: allowed (only hours beyond the cap need approval).' : ' Within the cap.')) };
  }

  // ---------- approver routing for cap exceptions ----------
  function routeOvertime(policy, shift) {
    var region = (policy.locationRegion || {})[shift && shift.location];
    var ap = region && (policy.regionApprovers || {})[region];
    if (!ap) return { error: F('APPROVER_ROUTING', 'BLOCK', 'NO_APPROVER', 'Weekly-hours exception needs a named regional approver but none is configured for ' + (shift && shift.location ? shift.location : 'this location') + '. Blocked until an Admin configures one.') };
    return { approver: { id: ap.id, name: ap.name, role: 'REGIONAL_APPROVER', region: region } };
  }

  // ---------- engine factory ----------
  function createEngine(opts) {
    opts = opts || {};
    var policies = opts.policies || {};
    var now = opts.now || function () { return new Date().toISOString(); };
    var log = [], decisions = {}, seq = 0, logSeq = 0;

    function record(entry) {
      logSeq += 1;
      var e = { seq: logSeq, timestamp: now() };
      for (var k in entry) e[k] = entry[k];
      log.push(e); return e;
    }

    function evaluate(req) {
      req = req || {};
      var policy = policies[req.account];
      var action = req.action === 'ASSIGN' ? 'ASSIGN' : 'SWAP';
      seq += 1;
      var id = 'D-' + String(seq).padStart(3, '0');
      var findings = [], hours = null, approver = null;

      if (!policy) {
        findings.push(F('POLICY', 'BLOCK', 'POLICY_MISSING', 'No policy configured for account "' + req.account + '"; nothing can be approved.'));
      } else if (!req.employee || !req.shift) {
        findings.push(F('INPUT', 'BLOCK', 'INPUT_MISSING', 'Employee or shift is missing from the request.'));
      } else {
        findings = findings.concat(checkRole(policy, req.employee, req.shift));
        findings = findings.concat(checkQualifications(policy, req.employee, req.shift));
        var span = shiftSpan(req.shift);
        if (!span && !findings.some(function (f) { return f.code === 'DATA_MISSING'; })) {
          findings.push(F('INPUT', missingOutcome(policy.onMissingQualificationData), 'DATA_MISSING', 'Shift start/end time is missing, malformed, or zero-duration; shift cannot be verified.'));
        }
        var h = checkHours(policy, req.employee, req.shift, req.roster);
        if (h) {
          hours = h.hours || null;
          findings.push(h.finding);
          if (h.finding.severity === 'ESCALATE') {
            var rt = routeOvertime(policy, req.shift);
            if (rt.error) findings.push(rt.error); else approver = rt.approver;
          }
        }
      }

      var worst = findings.reduce(function (m, f) { return RANK[f.severity] > RANK[m] ? f.severity : m; }, 'PASS');
      var status;
      if (worst === 'BLOCK') status = 'BLOCKED';
      else if (worst === 'ESCALATE') status = 'ESCALATED';
      else if (worst === 'REVIEW') status = 'MANAGER_REVIEW';
      else if (action === 'ASSIGN') status = 'ALLOWED';
      else status = policy.autoApprove ? 'AUTO_APPROVED' : 'READY_FOR_MANAGER';
      if (status !== 'ESCALATED') approver = null; // only a live escalation has an approver

      var primary = findings.filter(function (f) { return f.severity === worst && worst !== 'PASS'; })[0] ||
        { rule: 'ALL_CHECKS', code: 'ALL_PASS', message: 'All required qualification, role and hours checks passed.' };
      var reasonPrefix = {
        BLOCKED: 'Blocked: ', ESCALATED: 'Escalated: ', MANAGER_REVIEW: 'Needs manager review: ',
        AUTO_APPROVED: 'Auto-approved: ', READY_FOR_MANAGER: 'Checks passed, manager sign-off required by policy: ', ALLOWED: 'Allowed: '
      }[status];
      var decision = {
        id: id, account: req.account, action: action, status: status,
        rule: primary.rule + ':' + primary.code, reason: reasonPrefix + primary.message,
        findings: findings, hours: hours, approver: approver,
        employeeId: req.employee && req.employee.id, shiftId: req.shift && req.shift.id,
        canOverride: status !== 'BLOCKED', final: status === 'AUTO_APPROVED' || status === 'ALLOWED' || status === 'BLOCKED' ? true : false,
        resolution: null
      };
      decisions[id] = decision;
      record({ decisionId: id, event: 'EVALUATED', account: decision.account, action: action, employeeId: decision.employeeId, shiftId: decision.shiftId,
        outcome: status, rule: decision.rule, reason: decision.reason, actor: 'rules-engine',
        allRules: findings.map(function (f) { return f.rule + ':' + f.code + ':' + f.severity; }) });
      return decision;
    }

    /** Human action on a pending decision. Hard blocks can never be approved; escalations only by the named approver. */
    function resolve(decisionId, args) {
      args = args || {};
      var d = decisions[decisionId], actor = args.actor || {}, outcome = args.outcome, reason = (args.reason || '').trim();
      function deny(code, msg) {
        record({ decisionId: decisionId, event: 'ACTION_DENIED', account: d && d.account, action: d && d.action, employeeId: d && d.employeeId, shiftId: d && d.shiftId,
          outcome: 'DENIED', rule: code, reason: msg, actor: (actor.name || actor.id || 'unknown') + ' [' + (actor.role || 'no role') + ']', attempted: outcome });
        return { ok: false, code: code, message: msg };
      }
      if (!d) return { ok: false, code: 'NOT_FOUND', message: 'Unknown decision.' };
      if (outcome !== 'APPROVE' && outcome !== 'REJECT') return deny('BAD_OUTCOME', 'Outcome must be APPROVE or REJECT.');
      if (d.resolution) return deny('ALREADY_RESOLVED', 'Decision already resolved as ' + d.resolution.outcome + '.');
      if (d.status === 'AUTO_APPROVED' || d.status === 'ALLOWED') return deny('NOTHING_TO_RESOLVE', 'This decision needs no human action.');
      if (outcome === 'APPROVE') {
        if (d.status === 'BLOCKED') return deny('HARD_BLOCK_NO_OVERRIDE', 'Hard compliance block cannot be overridden by anyone. Fix the underlying record (e.g. renew the credential, add the data, configure the approver) and re-run the check.');
        if (d.status === 'ESCALATED') {
          if (actor.id !== (d.approver && d.approver.id)) return deny('NOT_AUTHORIZED', 'Only the named approver (' + (d.approver && d.approver.name) + ') can approve this weekly-hours exception.');
          if (!reason) return deny('REASON_REQUIRED', 'A written reason is required to approve a weekly-hours exception.');
        }
        if (d.status === 'MANAGER_REVIEW') {
          if (actor.role !== 'LOCATION_MANAGER') return deny('NOT_AUTHORIZED', 'Only a Location Manager can approve a manual-review item.');
          if (!reason) return deny('REASON_REQUIRED', 'A written reason is required to approve a manual-review item.');
        }
        if (d.status === 'READY_FOR_MANAGER' && actor.role !== 'LOCATION_MANAGER') return deny('NOT_AUTHORIZED', 'Only a Location Manager can approve this swap.');
      }
      d.resolution = { outcome: outcome, by: actor.name || actor.id, reason: reason };
      d.final = true;
      record({ decisionId: decisionId, event: outcome === 'APPROVE' ? 'APPROVED_BY_HUMAN' : 'REJECTED_BY_HUMAN', account: d.account, action: d.action, employeeId: d.employeeId, shiftId: d.shiftId,
        outcome: outcome === 'APPROVE' ? 'APPROVED' : 'REJECTED', rule: d.rule, reason: reason || '(no reason given)', actor: (actor.name || actor.id) + ' [' + (actor.role || '') + ']' });
      return { ok: true, decision: d };
    }

    return { evaluate: evaluate, resolve: resolve, auditLog: function () { return log.map(function (e) { return JSON.parse(JSON.stringify(e)); }); }, clearLog: function () { log = []; logSeq = 0; }, getDecision: function (id) { return decisions[id]; } };
  }

  return { createEngine: createEngine, dayNumber: dayNumber, weekStartDay: weekStartDay, dayToISO: dayToISO, shiftSpan: shiftSpan, fmtHours: fmtHours };
});
