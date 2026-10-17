(function () {
  'use strict';
  var Engine = window.ShiftwellEngine, Data = window.ShiftwellData;
  var POLICIES = Data.POLICIES, SCENARIOS = Data.SCENARIOS;
  var engine = Engine.createEngine({ policies: POLICIES });
  var account = 'CarePoint', activeKey = null, current = null;

  var LABELS = {
    BLOCKED: 'BLOCKED',
    ESCALATED: 'ESCALATED',
    MANAGER_REVIEW: 'MANAGER REVIEW',
    AUTO_APPROVED: 'AUTO-APPROVED',
    READY_FOR_MANAGER: 'READY: MANAGER SIGN-OFF',
    ALLOWED: 'ALLOWED',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    DENIED: 'DENIED'
  };

  var ICON = {
    BLOCKED: '⛔ ',
    ESCALATED: '↑ ',
    MANAGER_REVIEW: '✋ ',
    AUTO_APPROVED: '✓ ',
    READY_FOR_MANAGER: '○ ',
    ALLOWED: '✓ ',
    APPROVED: '✓ ',
    REJECTED: '✕ ',
    DENIED: '✕ '
  };

  var ACTORS = {
    manager: { id: 'LOCATION_MANAGER', name: 'Location Manager', role: 'LOCATION_MANAGER' },
    admin: { id: 'ADMIN', name: 'Head-office Admin', role: 'ADMIN' }
  };

  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === 'text') e.textContent = attrs[k];
        else if (k === 'class') e.className = attrs[k];
        else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]);
        else e.setAttribute(k, attrs[k]);
      }
    }
    (children || []).forEach(function (c) {
      if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  }

  function chip(status) {
    return el('span', { class: 'chip s-' + status, text: (ICON[status] || '') + (LABELS[status] || status) });
  }

  function clear(n) {
    while (n.firstChild) n.removeChild(n.firstChild);
  }

  function hrs(m) {
    return Engine.fmtHours(m);
  }

  // ── Stat Cards (Exact match to reference UI mockup) ──
  function renderStats() {
    var container = document.getElementById('statsCards');
    if (!container) return;
    clear(container);

    var ACCOUNT_META = {
      CarePoint: { arr: '₹60L', pct24: '71%', health: 'At risk', trendClass: 'positive', rule: 'Cert Expiry Block', ruleSub: 'Hard block • Zero override', locs: '40 clinics' },
      FreshBowl: { arr: '₹84L', pct24: '38%', health: 'At risk (<50%)', trendClass: 'negative', rule: 'Auto-Approval & Block', ruleSub: 'Role/training mismatch: Block', locs: '120 restaurants' },
      UrbanMart: { arr: '₹110L', pct24: '64%', health: 'Healthy (>50%)', trendClass: 'positive', rule: '48h Weekly Cap', ruleSub: 'Named approver: Meera Sen', locs: '200 supermarkets' }
    };
    var m = ACCOUNT_META[account] || ACCOUNT_META.CarePoint;
    var scenCount = SCENARIOS.filter(function (s) { return s.account === account; }).length;

    var cardsData = [
      {
        label: 'Account Scenarios',
        icon: '📋',
        value: scenCount + ' Tests',
        trend: '100% Deterministic',
        trendClass: 'positive',
        subtext: 'Fixed reproducible test suite'
      },
      {
        label: 'Enforced Rule',
        icon: '⚖️',
        value: m.rule,
        trend: account,
        trendClass: 'neutral',
        subtext: m.ruleSub
      },
      {
        label: '24h Approval Rate',
        icon: '⚡',
        value: m.pct24,
        trend: m.health,
        trendClass: m.trendClass,
        subtext: 'Historical baseline metric'
      },
      {
        label: 'Account Value & Scale',
        icon: '🏢',
        value: m.arr,
        trend: m.locs,
        trendClass: 'neutral',
        subtext: 'Annual recurring revenue'
      }
    ];

    cardsData.forEach(function (item) {
      var card = el('div', { class: 'stat-card' }, [
        el('div', { class: 'stat-card-header' }, [
          el('span', { class: 'stat-card-label', text: item.label }),
          el('span', { class: 'stat-card-icon' }, [document.createTextNode(item.icon)])
        ]),
        el('div', { class: 'stat-card-metric-row' }, [
          el('span', { class: 'stat-card-number', text: item.value }),
          el('span', { class: 'badge-trend ' + item.trendClass, text: item.trend })
        ]),
        el('div', { class: 'stat-card-sub', text: item.subtext })
      ]);
      container.appendChild(card);
    });
  }

  // ── Tabs (Account Selection) ──
  function renderTabs() {
    var t = document.getElementById('tabs');
    if (!t) return;
    clear(t);

    var accountIcons = {
      CarePoint: '🏥',
      FreshBowl: '🥗',
      UrbanMart: '🏬'
    };

    Object.keys(POLICIES).forEach(function (k) {
      t.appendChild(el('button', {
        class: 'tab',
        role: 'tab',
        'aria-selected': String(k === account),
        'data-account': k,
        onclick: function () {
          account = k;
          activeKey = null;
          current = null;
          renderAll();
        }
      }, [
        el('span', { style: 'font-size:15px;' }, [document.createTextNode(accountIcons[k] || '📁')]),
        el('span', { text: POLICIES[k].label })
      ]));
    });
  }

  // ── Account Policy ──
  function renderPolicy() {
    var p = POLICIES[account];
    var srcEl = document.getElementById('policySource');
    if (srcEl) srcEl.textContent = p.source;

    var ul = document.getElementById('policySummary');
    if (ul) {
      clear(ul);
      p.summary.forEach(function (s) {
        ul.appendChild(el('li', { text: '• ' + s }));
      });
    }
  }

  // ── Scenarios in Sidebar ──
  function renderScenarios() {
    var c = document.getElementById('scenarios');
    if (!c) return;
    clear(c);

    SCENARIOS.filter(function (s) { return s.account === account; }).forEach(function (s) {
      c.appendChild(el('button', {
        class: 'scen',
        'data-key': s.key,
        'aria-pressed': String(s.key === activeKey),
        onclick: function () { runScenario(s.key); }
      }, [
        el('strong', { text: s.key + '  ' + s.title }),
        el('small', { text: (s.action === 'ASSIGN' ? 'Roster assignment' : 'Swap request') + ' • ' + (s.shift && s.shift.date ? s.shift.date : '(date missing)') })
      ]));
    });
  }

  // ── Run Scenario ──
  function runScenario(key) {
    var s = SCENARIOS.filter(function (x) { return x.key === key; })[0];
    if (!s) return;
    activeKey = key;
    current = {
      scenario: s,
      decision: engine.evaluate({
        account: s.account,
        action: s.action,
        employee: s.employee,
        shift: s.shift,
        roster: s.roster,
        scenarioKey: s.key
      }),
      message: null
    };
    renderScenarios();
    renderResult();
    renderLog();

    // Scroll smoothly to result card if on small screens
    var resCard = document.getElementById('resultCard');
    if (resCard && typeof window !== 'undefined' && window.innerWidth < 900 && typeof resCard.scrollIntoView === 'function') {
      resCard.scrollIntoView({ behavior: 'smooth' });
    }
  }

  function inputsTable(s) {
    var rows = [];
    var emp = s.employee || {};
    rows.push(['Employee', (emp.name || emp.id || '?') + ' • roles: ' + (Array.isArray(emp.roles) ? emp.roles.join(', ') : '(missing)')]);
    rows.push(['Qualifications', Array.isArray(emp.qualifications) ? (emp.qualifications.length ? emp.qualifications.map(function (q) { return q.type + (q.expires ? ' (expires ' + q.expires + ')' : (q.expires === null ? '' : ' (no expiry date recorded)')); }).join('; ') : '(none on file)') : '(qualification data missing)']);
    var sh = s.shift || {};
    rows.push(['Proposed shift', (sh.date || '(date missing)') + ' ' + (sh.start || '?') + '-' + (sh.end || '?') + ' • ' + (sh.role || '?') + (sh.station ? ' / ' + sh.station : '') + ' • ' + (sh.location || '?')]);
    if (POLICIES[s.account].weeklyHoursCap) {
      rows.push(['Already rostered', s.roster === undefined ? '(roster data unavailable)' : (s.roster.length ? s.roster.map(function (r) { return (r.date || '(no date)') + ' ' + (r.start || '?') + '-' + (r.end || '?') + ' @ ' + (r.location || '?'); }).join(' | ') : 'nothing this week')]);
    }
    var t = el('table');
    var tb = el('tbody');
    rows.forEach(function (r) {
      tb.appendChild(el('tr', null, [
        el('th', { text: r[0], style: 'width:120px;font-size:11.5px;' }),
        el('td', { text: r[1] })
      ]));
    });
    t.appendChild(tb);
    return t;
  }

  function hoursBar(d) {
    if (!d.hours) return null;
    var h = d.hours,
      pct = Math.min(100, Math.round(100 * h.totalMinutes / (h.capMinutes * 1.25))),
      capPct = Math.round(100 * h.capMinutes / (h.capMinutes * 1.25));
    var bar = el('div', {
      class: 'bar' + (h.totalMinutes > h.capMinutes ? ' over' : ''),
      role: 'img',
      'aria-label': hrs(h.totalMinutes) + ' of ' + hrs(h.capMinutes) + ' cap'
    }, [
      el('i', { style: 'width:' + pct + '%' }),
      el('span', { class: 'cap', style: 'left:' + capPct + '%' })
    ]);
    return el('div', null, [
      el('div', { text: 'Weekly hours: ' + hrs(h.totalMinutes) + ' (cap ' + hrs(h.capMinutes) + ', week ' + h.weekStart + ' to ' + h.weekEnd + ')', style: 'font-size:12.5px;margin-top:8px;font-weight:500;' }),
      bar
    ]);
  }

  function actBtn(label, cls, fn) {
    return el('button', { class: 'act ' + (cls || ''), text: label, onclick: fn });
  }

  function doResolve(actor, outcome) {
    var reasonInput = document.getElementById('reasonInput');
    var reason = reasonInput ? reasonInput.value : '';
    var r = engine.resolve(current.decision.id, { actor: actor, outcome: outcome, reason: reason });
    current.message = r.ok
      ? { good: true, text: (outcome === 'APPROVE' ? 'Approved' : 'Rejected') + ' by ' + actor.name + '. Logged.' }
      : { good: false, text: 'Denied: ' + r.message + ' (logged)' };
    renderResult();
    renderLog();
  }

  function renderActions(d, wrap) {
    if (d.resolution) {
      wrap.appendChild(el('div', { class: 'msg good', text: 'Resolved: ' + d.resolution.outcome + ' by ' + d.resolution.by + (d.resolution.reason ? ' — "' + d.resolution.reason + '"' : '') }));
      return;
    }
    if (d.status === 'AUTO_APPROVED' || d.status === 'ALLOWED') {
      wrap.appendChild(el('p', { class: 'empty', text: 'No human action needed. Every required check passed.' }));
      return;
    }
    var needsReason = d.status === 'ESCALATED' || d.status === 'MANAGER_REVIEW';
    if (needsReason) {
      wrap.appendChild(el('input', { type: 'text', id: 'reasonInput', placeholder: 'Reason (required to approve an exception)', 'aria-label': 'Reason' }));
    }
    var a = el('div', { class: 'actions' });
    if (d.status === 'BLOCKED') {
      a.appendChild(actBtn('Manager tries to approve anyway', 'danger', function () { doResolve(ACTORS.manager, 'APPROVE'); }));
      a.appendChild(actBtn('Admin tries to approve anyway', 'danger', function () { doResolve(ACTORS.admin, 'APPROVE'); }));
    } else if (d.status === 'ESCALATED') {
      a.appendChild(actBtn('Approve as Location Manager', '', function () { doResolve(ACTORS.manager, 'APPROVE'); }));
      a.appendChild(actBtn('Approve as ' + d.approver.name, 'primary', function () { doResolve({ id: d.approver.id, name: d.approver.name, role: 'REGIONAL_APPROVER' }, 'APPROVE'); }));
    } else {
      a.appendChild(actBtn('Approve as Location Manager', 'primary', function () { doResolve(ACTORS.manager, 'APPROVE'); }));
    }
    a.appendChild(actBtn('Reject', '', function () { doResolve(ACTORS.manager, 'REJECT'); }));
    wrap.appendChild(a);
  }

  function renderResult() {
    var c = document.getElementById('resultCard');
    if (!c) return;
    clear(c);

    c.appendChild(el('div', { class: 'panel-header' }, [
      el('h3', { class: 'panel-title', text: 'Evaluation Result' })
    ]));

    if (!current) {
      c.appendChild(el('p', { class: 'empty', text: 'Choose a scenario on the left to run the rules.' }));
      return;
    }

    var d = current.decision, s = current.scenario;

    var headerRow = el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;' }, [
      chip(d.status),
      el('span', { class: 'rule', text: d.id + ' • ' + (d.action === 'ASSIGN' ? 'roster assignment' : 'swap request') })
    ]);
    c.appendChild(headerRow);

    c.appendChild(el('p', { id: 'reasonText', style: 'font-size:14px;font-weight:600;margin:6px 0;' }, [document.createTextNode(d.reason)]));
    c.appendChild(el('div', { class: 'rule', text: 'rule: ' + d.rule }));

    if (d.approver) {
      c.appendChild(el('div', { class: 'msg bad', text: 'Routed to named approver: ' + d.approver.name + '. Only this person can approve.' }));
    }

    var hb = hoursBar(d);
    if (hb) c.appendChild(hb);

    var f = el('div', { style: 'margin-top:12px' });
    d.findings.forEach(function (x) {
      f.appendChild(el('div', { class: 'finding' }, [
        el('span', { class: 'tag t-' + x.severity, text: x.severity }),
        el('span', { text: x.message })
      ]));
    });
    c.appendChild(el('h4', { text: 'Checks Run', style: 'font-size:12px;font-weight:700;text-transform:uppercase;margin-top:14px;color:var(--muted);' }));
    c.appendChild(f);

    var act = el('div');
    renderActions(d, act);
    if (current.message) {
      act.appendChild(el('div', { class: 'msg ' + (current.message.good ? 'good' : 'bad'), id: 'actionMsg', text: current.message.text }));
    }
    c.appendChild(el('h4', { text: 'Human Actions', style: 'font-size:12px;font-weight:700;text-transform:uppercase;margin-top:14px;color:var(--muted);' }));
    c.appendChild(act);

    c.appendChild(el('h4', { text: 'Scenario Inputs (synthetic)', style: 'font-size:12px;font-weight:700;text-transform:uppercase;margin-top:14px;color:var(--muted);' }));
    c.appendChild(inputsTable(s));

    var det = el('details', null, [
      el('summary', { text: 'Raw input JSON' }),
      el('pre', { text: JSON.stringify({ account: s.account, action: s.action, employee: s.employee, shift: s.shift, roster: s.roster }, null, 2) })
    ]);
    c.appendChild(det);
  }

  // ── Audit Log ──
  function renderLog() {
    var log = engine.auditLog();
    var tb = document.querySelector('#logTable tbody');
    if (!tb) return;
    clear(tb);

    log.slice().reverse().forEach(function (e) {
      var reqLabel = e.scenarioId ? (e.scenarioId + ' (' + e.decisionId + ')') : (e.decisionId || '');
      tb.appendChild(el('tr', null, [
        el('td', { text: String(e.seq) }),
        el('td', { text: e.timestamp.replace('T', ' ').slice(0, 19) }),
        el('td', { text: e.account || '' }),
        el('td', { class: 'rule', text: reqLabel }),
        el('td', { text: e.event }),
        el('td', null, [chip(e.outcome)]),
        el('td', { class: 'rule', text: e.rule }),
        el('td', { text: e.reason }),
        el('td', { text: e.actor })
      ]));
    });

    var emptyEl = document.getElementById('logEmpty');
    if (emptyEl) emptyEl.style.display = log.length ? 'none' : '';
  }

  // ── Run All Scenarios (Reproducibility) ──
  function runAll() {
    var eng = Engine.createEngine({
      policies: POLICIES,
      now: function () { return '2026-10-17T00:00:00.000Z'; }
    });
    var t = el('table', { id: 'allTable' });
    var head = el('thead', null, [
      el('tr', null, ['Key', 'Account', 'Scenario', 'Expected', 'Actual', 'Match'].map(function (h) {
        return el('th', { text: h });
      }))
    ]);
    var body = el('tbody'), pass = 0;
    SCENARIOS.forEach(function (s) {
      var d = eng.evaluate({
        account: s.account,
        action: s.action,
        employee: s.employee,
        shift: s.shift,
        roster: s.roster
      });
      var ok = d.status === s.expect;
      if (ok) pass++;
      body.appendChild(el('tr', null, [
        el('td', { text: s.key }),
        el('td', { text: s.account }),
        el('td', { text: s.title }),
        el('td', null, [chip(s.expect)]),
        el('td', null, [chip(d.status)]),
        el('td', { class: ok ? 'ok' : 'no', text: ok ? '✓ yes' : '✕ NO' })
      ]));
    });
    t.appendChild(head);
    t.appendChild(body);

    var w = document.getElementById('allWrap');
    if (w) {
      clear(w);
      w.appendChild(el('p', {
        id: 'allSummary',
        style: 'font-weight:600;margin-bottom:10px;color:#057A55;',
        text: pass + ' of ' + SCENARIOS.length + ' scenarios match their expected outcome.'
      }));
      w.appendChild(t);
    }

    var allCard = document.getElementById('allCard');
    if (allCard) {
      allCard.style.display = '';
      if (typeof allCard.scrollIntoView === 'function') {
        allCard.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }

  // ── Switch Account (Cycles Accounts) ──
  function cycleAccount() {
    var accs = Object.keys(POLICIES);
    var idx = accs.indexOf(account);
    account = accs[(idx + 1) % accs.length];
    activeKey = null;
    current = null;
    renderAll();
  }

  function renderAll() {
    renderStats();
    renderTabs();
    renderPolicy();
    renderScenarios();
    renderResult();
    renderLog();
  }

  // Wire up action listeners
  var resetDemoBtn = document.getElementById('resetDemoBtn');
  if (resetDemoBtn) {
    resetDemoBtn.addEventListener('click', function () {
      engine.clearLog();
      activeKey = null;
      current = null;
      renderAll();
    });
  }

  var runAllBtn = document.getElementById('runAll');
  if (runAllBtn) {
    runAllBtn.addEventListener('click', runAll);
  }

  var btnToggleAll = document.getElementById('btnToggleAll');
  if (btnToggleAll) {
    btnToggleAll.addEventListener('click', runAll);
  }

  var switchAccountBtn = document.getElementById('switchAccountBtn');
  if (switchAccountBtn) {
    switchAccountBtn.addEventListener('click', cycleAccount);
  }

  // Initial render
  renderAll();
})();
