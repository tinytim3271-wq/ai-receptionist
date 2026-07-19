let callId = null;

const DASHBOARD_TOKEN_KEY = 'ai_receptionist_dashboard_token';
const DASHBOARD_RANGE_KEY = 'ai_receptionist_dashboard_range';
const DASHBOARD_REFRESH_KEY = 'ai_receptionist_dashboard_refresh';

let dashboardRefreshTimer = null;
let dashboardCountdownTimer = null;
let dashboardRefreshPausedForInput = false;
let dashboardRefreshPeriodSeconds = 0;
let dashboardRefreshNextAt = 0;

const startPanel = document.getElementById('start-panel');
const callPanel = document.getElementById('call-panel');
const messagesEl = document.getElementById('messages');
const eventsEl = document.getElementById('events');
const phoneInput = document.getElementById('phone-input');
const messageInput = document.getElementById('message-input');
const startBtn = document.getElementById('start-btn');
const sendBtn = document.getElementById('send-btn');
const endBtn = document.getElementById('end-btn');
const callStatus = document.getElementById('call-status');

const tabSimulatorBtn = document.getElementById('tab-simulator');
const tabDashboardBtn = document.getElementById('tab-dashboard');
const simulatorView = document.getElementById('simulator-view');
const dashboardView = document.getElementById('dashboard-view');

const dashboardTokenInput = document.getElementById('dashboard-token');
const saveTokenBtn = document.getElementById('save-token-btn');
const refreshDashboardBtn = document.getElementById('refresh-dashboard-btn');
const dashboardStatus = document.getElementById('dashboard-status');
const dashboardStats = document.getElementById('dashboard-stats');
const trendTitle = document.getElementById('trend-title');
const trendRows = document.getElementById('trend-rows');
const recentCallsBody = document.getElementById('recent-calls-body');
const callbackQueueBody = document.getElementById('callback-queue-body');
const telephonyEventsBody = document.getElementById('telephony-events-body');
const dashboardRangeSelect = document.getElementById('dashboard-range');
const dashboardRefreshIntervalSelect = document.getElementById('dashboard-refresh-interval');
const autoRefreshIndicator = document.getElementById('auto-refresh-indicator');

function addMessage(role, text) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = text;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addEvent(event) {
  const div = document.createElement('div');
  div.className = `event ${event.type}`;
  div.textContent = event.detail;
  eventsEl.appendChild(div);
}

async function api(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

async function apiGet(path, token) {
  const headers = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(path, { method: 'GET', headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderEmptyRow(target, columns, label) {
  target.innerHTML = `<tr><td colspan="${columns}" class="empty">${escapeHtml(label)}</td></tr>`;
}

function renderSummary(summary) {
  const rangeLabel = dashboardRangeSelect.value === '7d' ? '7d' : '24h';
  const cards = [
    [`Calls (${rangeLabel})`, summary.callsInRange],
    ['Open callbacks', summary.openCallbacks],
    [`Auth denied (${rangeLabel})`, summary.authDeniedInRange],
    [`Blocked auto-book (${rangeLabel})`, summary.blockedAutobookInRange],
    [`AI fallbacks (${rangeLabel})`, summary.telephonyFallbacksInRange],
    [`Telephony events (${rangeLabel})`, summary.telephonyEventsInRange],
  ];
  dashboardStats.innerHTML = cards
    .map(
      ([label, value]) =>
        `<article class="stat-card"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></article>`
    )
    .join('');
}

function renderTrends(trends) {
  if (!trends.length) {
    trendRows.innerHTML = '<p class="empty">No guardrail events in the last 24 hours.</p>';
    return;
  }

  const maxTotal = Math.max(
    1,
    ...trends.map((t) => t.authDeniedCount + t.blockedAutobookCount + t.telephonyFallbackCount)
  );

  trendRows.innerHTML = trends
    .map((trend) => {
      const authPct = (trend.authDeniedCount / maxTotal) * 100;
      const blockedPct = (trend.blockedAutobookCount / maxTotal) * 100;
      const fallbackPct = (trend.telephonyFallbackCount / maxTotal) * 100;

      return `
        <div class="trend-row">
          <div class="trend-time">${escapeHtml(trend.hourUtc)}Z</div>
          <div class="trend-bars" title="auth ${trend.authDeniedCount}, blocked ${trend.blockedAutobookCount}, fallback ${trend.telephonyFallbackCount}">
            <span class="bar-auth" style="width:${authPct}%"></span>
            <span class="bar-blocked" style="width:${blockedPct}%"></span>
            <span class="bar-fallback" style="width:${fallbackPct}%"></span>
          </div>
        </div>`;
    })
    .join('');
}

function renderRecentCalls(calls) {
  if (!calls.length) {
    renderEmptyRow(recentCallsBody, 5, 'No call records yet.');
    return;
  }

  recentCallsBody.innerHTML = calls
    .map(
      (call) => `
      <tr>
        <td>${escapeHtml(formatDate(call.startedAt))}</td>
        <td>${escapeHtml(call.phoneNumber)}</td>
        <td>${escapeHtml(call.channel)}</td>
        <td>${escapeHtml(call.disposition || '-')}</td>
        <td>${escapeHtml(call.priorityScore ?? '-')}</td>
      </tr>`
    )
    .join('');
}

function renderCallbackQueue(queue) {
  if (!queue.length) {
    renderEmptyRow(callbackQueueBody, 5, 'No open callback tasks.');
    return;
  }

  callbackQueueBody.innerHTML = queue
    .map(
      (task) => `
      <tr>
        <td>${escapeHtml(task.priority)}</td>
        <td>${escapeHtml(task.queueName)}</td>
        <td>${escapeHtml(task.status)}</td>
        <td>${escapeHtml(task.reason)}</td>
        <td>${escapeHtml(formatDate(task.createdAt))}</td>
      </tr>`
    )
    .join('');
}

function renderTelephonyEvents(events) {
  if (!events.length) {
    renderEmptyRow(telephonyEventsBody, 5, 'No telephony events found.');
    return;
  }

  telephonyEventsBody.innerHTML = events
    .map(
      (event) => `
      <tr>
        <td>${escapeHtml(formatDate(event.createdAt))}</td>
        <td>${escapeHtml(event.provider)}</td>
        <td>${escapeHtml(event.eventKey)}</td>
        <td>${escapeHtml(event.callId || '-')}</td>
        <td>${escapeHtml(event.responseCode)}</td>
      </tr>`
    )
    .join('');
}

function setDashboardStatus(message, isError = false) {
  dashboardStatus.textContent = message;
  dashboardStatus.style.color = isError ? '#ff9d9d' : '';
}

function getRemainingCountdownSeconds() {
  if (!dashboardRefreshNextAt) return 0;
  const ms = Math.max(0, dashboardRefreshNextAt - Date.now());
  return Math.ceil(ms / 1000);
}

function bumpDashboardRefreshDeadline() {
  if (dashboardRefreshPeriodSeconds <= 0) return;
  dashboardRefreshNextAt = Date.now() + dashboardRefreshPeriodSeconds * 1000;
}

async function refreshDashboard() {
  const token = dashboardTokenInput.value.trim();
  const range = dashboardRangeSelect.value === '7d' ? '7d' : '24h';
  if (!token) {
    setDashboardStatus('Enter a bearer token to load metrics.', true);
    return;
  }

  refreshDashboardBtn.disabled = true;
  setDashboardStatus('Loading dashboard...');

  try {
    const limit = range === '7d' ? 14 : 24;
    const data = await apiGet(`/api/ai/dashboard?limit=${limit}&range=${range}`, token);
    renderSummary(data.summary || {});
    renderTrends(data.trends || []);
    renderRecentCalls(data.recentCalls || []);
    renderCallbackQueue(data.callbackQueue || []);
    renderTelephonyEvents(data.recentTelephonyEvents || []);
    trendTitle.textContent = `Guardrail Trend (${range === '7d' ? '7d' : '24h'})`;
    setDashboardStatus(`Updated ${formatDate(data.generatedAt)}`);
  } catch (err) {
    setDashboardStatus(`Dashboard error: ${err.message}`, true);
  } finally {
    refreshDashboardBtn.disabled = false;
    if (
      dashboardRefreshTimer !== null &&
      dashboardRefreshPeriodSeconds > 0 &&
      dashboardView.classList.contains('active') &&
      !dashboardRefreshPausedForInput
    ) {
      bumpDashboardRefreshDeadline();
      setDashboardRunningIndicator(dashboardRefreshPeriodSeconds);
    }
  }
}

function clearDashboardAutoRefresh() {
  dashboardRefreshPausedForInput = false;
  dashboardRefreshPeriodSeconds = 0;
  dashboardRefreshNextAt = 0;
  if (dashboardRefreshTimer !== null) {
    clearInterval(dashboardRefreshTimer);
    dashboardRefreshTimer = null;
  }
  if (dashboardCountdownTimer !== null) {
    clearInterval(dashboardCountdownTimer);
    dashboardCountdownTimer = null;
  }
  autoRefreshIndicator.textContent = 'Idle';
  autoRefreshIndicator.classList.remove('on');
}

function setDashboardPausedIndicator() {
  autoRefreshIndicator.textContent = 'Paused';
  autoRefreshIndicator.classList.remove('on');
}

function setDashboardRunningIndicator(seconds) {
  const remaining = getRemainingCountdownSeconds();
  autoRefreshIndicator.textContent = `On ${seconds}s (${remaining}s)`;
  autoRefreshIndicator.classList.add('on');
}

function startDashboardAutoRefresh() {
  clearDashboardAutoRefresh();
  const value = dashboardRefreshIntervalSelect.value;
  if (value === 'off') return;

  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return;

  dashboardRefreshPeriodSeconds = seconds;
  bumpDashboardRefreshDeadline();
  setDashboardRunningIndicator(seconds);

  dashboardCountdownTimer = setInterval(() => {
    if (!dashboardView.classList.contains('active')) return;
    if (dashboardRefreshPausedForInput) return;
    if (dashboardRefreshPeriodSeconds <= 0) return;
    setDashboardRunningIndicator(dashboardRefreshPeriodSeconds);
  }, 1000);

  dashboardRefreshTimer = setInterval(() => {
    if (!dashboardView.classList.contains('active')) return;
    if (dashboardRefreshPausedForInput) return;
    bumpDashboardRefreshDeadline();
    refreshDashboard();
  }, seconds * 1000);
}

function pauseDashboardAutoRefreshForTokenInput() {
  if (dashboardRefreshTimer === null) return;
  dashboardRefreshPausedForInput = true;
  setDashboardPausedIndicator();
}

function resumeDashboardAutoRefreshAfterTokenInput() {
  if (dashboardRefreshTimer === null) return;
  dashboardRefreshPausedForInput = false;
  if (dashboardRefreshPeriodSeconds > 0) {
    bumpDashboardRefreshDeadline();
    setDashboardRunningIndicator(dashboardRefreshPeriodSeconds);
  }
}

function setActiveTab(tab) {
  const dashboardActive = tab === 'dashboard';
  tabDashboardBtn.classList.toggle('active', dashboardActive);
  tabSimulatorBtn.classList.toggle('active', !dashboardActive);
  dashboardView.classList.toggle('active', dashboardActive);
  simulatorView.classList.toggle('active', !dashboardActive);

  if (dashboardActive) {
    startDashboardAutoRefresh();
    if (dashboardTokenInput.value.trim()) {
      refreshDashboard();
    }
  } else {
    clearDashboardAutoRefresh();
  }
}

startBtn.addEventListener('click', async () => {
  const phoneNumber = phoneInput.value.trim();
  if (!phoneNumber) return;
  startBtn.disabled = true;
  try {
    const data = await api('/api/chat/start', { phoneNumber });
    callId = data.callId;
    startPanel.classList.add('hidden');
    callPanel.classList.remove('hidden');
    messagesEl.innerHTML = '';
    eventsEl.innerHTML = '';
    addMessage('ai', data.greeting);
    messageInput.focus();
  } catch (err) {
    alert(err.message);
  } finally {
    startBtn.disabled = false;
  }
});

async function sendMessage() {
  const text = messageInput.value.trim();
  if (!text || !callId) return;
  addMessage('caller', text);
  messageInput.value = '';
  sendBtn.disabled = true;
  callStatus.textContent = 'AI thinking...';
  try {
    const data = await api(`/api/chat/${callId}/message`, { text });
    addMessage('ai', data.reply);
    (data.events || []).forEach(addEvent);
  } catch (err) {
    addMessage('error', `Error: ${err.message}`);
  } finally {
    sendBtn.disabled = false;
    callStatus.textContent = 'On call';
    messageInput.focus();
  }
}

sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendMessage();
});

endBtn.addEventListener('click', async () => {
  if (!callId) return;
  endBtn.disabled = true;
  try {
    await api(`/api/chat/${callId}/end`);
  } catch {
    // best effort; call ends locally regardless
  }
  callId = null;
  endBtn.disabled = false;
  callPanel.classList.add('hidden');
  startPanel.classList.remove('hidden');
});

tabSimulatorBtn.addEventListener('click', () => setActiveTab('simulator'));
tabDashboardBtn.addEventListener('click', () => setActiveTab('dashboard'));

saveTokenBtn.addEventListener('click', () => {
  const token = dashboardTokenInput.value.trim();
  localStorage.setItem(DASHBOARD_TOKEN_KEY, token);
  setDashboardStatus(token ? 'Token saved locally in this browser.' : 'Token cleared.');
  if (dashboardView.classList.contains('active') && token) {
    refreshDashboard();
  }
});

refreshDashboardBtn.addEventListener('click', refreshDashboard);

dashboardRangeSelect.addEventListener('change', () => {
  localStorage.setItem(DASHBOARD_RANGE_KEY, dashboardRangeSelect.value);
  refreshDashboard();
});

dashboardRefreshIntervalSelect.addEventListener('change', () => {
  localStorage.setItem(DASHBOARD_REFRESH_KEY, dashboardRefreshIntervalSelect.value);
  startDashboardAutoRefresh();
});

dashboardTokenInput.addEventListener('focus', pauseDashboardAutoRefreshForTokenInput);
dashboardTokenInput.addEventListener('blur', resumeDashboardAutoRefreshAfterTokenInput);

const savedToken = localStorage.getItem(DASHBOARD_TOKEN_KEY);
if (savedToken) {
  dashboardTokenInput.value = savedToken;
}

const savedRange = localStorage.getItem(DASHBOARD_RANGE_KEY);
if (savedRange === '24h' || savedRange === '7d') {
  dashboardRangeSelect.value = savedRange;
}

const savedRefresh = localStorage.getItem(DASHBOARD_REFRESH_KEY);
if (savedRefresh === 'off' || savedRefresh === '15' || savedRefresh === '30') {
  dashboardRefreshIntervalSelect.value = savedRefresh;
}
