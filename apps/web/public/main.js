// chalkboard web UI. Single page, vanilla JS, no build step.
//
// Flow: collect form → POST /generate → poll /jobs/:id → swap progress
// panel for a <video> when status == "done".
//
// API base defaults to same-origin (we're served by the chalkboard server),
// but can be overridden by setting window.CHALKBOARD_API = "http://...".

const API = window.CHALKBOARD_API || '';
const POLL_MS = 1500;

const el = (id) => /** @type {any} */ (document.getElementById(id));

const ui = {
  prompt: el('prompt'),
  lang: el('lang'),
  aspect: el('aspect'),
  llm: el('llm'),
  tts: el('tts'),
  go: el('go'),
  hint: el('hint'),
  progress: el('progress'),
  progressLog: el('progress-log'),
  result: el('result'),
  player: el('player'),
  download: el('download'),
  newBtn: el('new'),
  error: el('error'),
  errorMessage: el('error-message'),
};

let activeJobId = null;
let pollTimer = null;
let renderedProgressCount = 0;

ui.go.addEventListener('click', startJob);
ui.newBtn.addEventListener('click', resetForm);
ui.prompt.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    startJob();
  }
});

async function startJob() {
  const prompt = ui.prompt.value.trim();
  if (!prompt) {
    ui.hint.textContent = 'enter a topic first';
    return;
  }

  const body = {
    prompt,
    language: ui.lang.value || 'en',
    aspectRatio: ui.aspect.value || '16:9',
  };
  if (ui.llm.value) body.llm = { kind: ui.llm.value };
  if (ui.tts.value) body.tts = { kind: ui.tts.value };

  ui.go.disabled = true;
  ui.hint.textContent = 'submitting…';
  ui.error.classList.add('hidden');
  ui.result.classList.add('hidden');
  ui.progress.classList.remove('hidden');
  ui.progressLog.innerHTML = '';
  renderedProgressCount = 0;

  try {
    const response = await fetch(`${API}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    const data = await response.json();
    activeJobId = data.jobId;
    ui.hint.textContent = `job ${activeJobId.slice(0, 8)}…`;
    poll();
  } catch (err) {
    showError(err);
  }
}

function poll() {
  if (!activeJobId) return;
  clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => {
    try {
      const response = await fetch(`${API}/jobs/${activeJobId}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      renderProgress(data.progress || []);
      if (data.status === 'done') {
        showDone(data);
      } else if (data.status === 'error') {
        showError(new Error(data.error || 'job failed'));
      } else {
        poll();
      }
    } catch (err) {
      showError(err);
    }
  }, POLL_MS);
}

function renderProgress(events) {
  for (let i = renderedProgressCount; i < events.length; i++) {
    const ev = events[i];
    const li = document.createElement('li');
    const phase = document.createElement('span');
    phase.className = 'phase';
    phase.textContent = `[${ev.phase}]`;
    li.appendChild(phase);
    const body = document.createElement('span');
    body.textContent = describeEvent(ev);
    li.appendChild(body);
    // Mark previous "active" rows as done.
    Array.from(ui.progressLog.children).forEach((c) => c.classList.remove('active'));
    li.classList.add('active');
    ui.progressLog.appendChild(li);
  }
  ui.progressLog.scrollTop = ui.progressLog.scrollHeight;
  renderedProgressCount = events.length;
}

function describeEvent(ev) {
  switch (ev.phase) {
    case 'script':
      return ev.message;
    case 'narration':
      return `scene ${ev.sceneIndex + 1} of ${ev.sceneCount}`;
    case 'render':
      return ev.message;
    case 'mux':
      return ev.message;
    case 'done':
      return 'finished';
    default:
      return JSON.stringify(ev);
  }
}

function showDone(data) {
  ui.go.disabled = false;
  ui.hint.textContent = '';
  ui.progress.classList.add('hidden');
  ui.result.classList.remove('hidden');
  const url = `${API}${data.outputUrl}`;
  ui.player.src = url;
  ui.download.href = url;
  ui.download.download = `chalkboard-${activeJobId.slice(0, 8)}.mp4`;
}

function showError(err) {
  ui.go.disabled = false;
  ui.hint.textContent = '';
  ui.progress.classList.add('hidden');
  ui.error.classList.remove('hidden');
  ui.errorMessage.textContent = err && err.message ? err.message : String(err);
  activeJobId = null;
  clearTimeout(pollTimer);
}

function resetForm() {
  ui.result.classList.add('hidden');
  ui.error.classList.add('hidden');
  ui.player.removeAttribute('src');
  ui.player.load?.();
  activeJobId = null;
  clearTimeout(pollTimer);
  ui.prompt.focus();
}
