let callId = null;

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
