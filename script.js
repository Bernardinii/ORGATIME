// configuracao firebase
const firebaseConfig = {
  apiKey: "AIzaSyDbBhsxdYcUApNySttQMNiUlOeeLHoD5eA",
  authDomain: "orgatime-b0dc6.firebaseapp.com",
  projectId: "orgatime-b0dc6",
  storageBucket: "orgatime-b0dc6.firebasestorage.app",
  messagingSenderId: "770475748052",
  appId: "1:770475748052:web:a884ea005ed87fa5b66941"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

// ---------- APP ----------
document.addEventListener("DOMContentLoaded", () => {
  /* ======= ELEMENTOS GERAIS ======= */

  const authWrapper = document.getElementById("auth-wrapper");
  const appRoot = document.getElementById("app-root");
  const userInfo = document.getElementById("user-info");
  const userEmailLabel = document.getElementById("user-email-label");
  const logoutBtn = document.getElementById("logout-btn");

  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const loginError = document.getElementById("login-error");
  const registerError = document.getElementById("register-error");

  const tabButtons = document.querySelectorAll(".tab-btn");
  const tabBoard = document.getElementById("tab-board");
  const tabStats = document.getElementById("tab-stats");

  let currentUser = null;

  /* ======= ESTADO: TAREFAS E ESTATÍSTICAS ======= */

  let tasks =
    JSON.parse(localStorage.getItem("tasks-board-v1") || "null") || [];

  let stats =
    JSON.parse(localStorage.getItem("pomodoro-stats-v1") || "null") || {
      totalSeconds: 0,
      byMode: {},
      byDay: {},
      sessions: [],
      pauseDuringFocusSec: 0,
      pauseDuringFocusByDay: {},
      pauseDuringFocusByTask: {}
    };

  if (!stats.byMode) stats.byMode = {};
  if (!stats.byDay) stats.byDay = {};
  if (!Array.isArray(stats.sessions)) stats.sessions = [];
  if (typeof stats.pauseDuringFocusSec !== "number") {
    stats.pauseDuringFocusSec = 0;
  }
  if (!stats.pauseDuringFocusByDay) stats.pauseDuringFocusByDay = {};
  if (!stats.pauseDuringFocusByTask) stats.pauseDuringFocusByTask = {};

  /* ======= (HORÁRIO LOCAL/BRASIL) ======= */

  function getLocalDayKey(date = new Date()) {
    const d = date;
    const year = d.getFullYear();
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    const day = d.getDate().toString().padStart(2, "0");
    return `${year}-${month}-${day}`; // YYYY-MM-DD no fuso local
  }

  /* ======= ELEMENTOS DO BOARD ======= */

  const form = document.getElementById("task-form");
  const titleInput = document.getElementById("task-title");
  const descInput = document.getElementById("task-desc");
  const columnSelect = document.getElementById("task-column");
  const prioritySelect = document.getElementById("task-priority");
  const estimateInput = document.getElementById("task-estimate");

  const columns = {
    todo: document.querySelector('[data-column="todo"] .column-body'),
    doing: document.querySelector('[data-column="doing"] .column-body'),
    done: document.querySelector('[data-column="done"] .column-body')
  };

  const counters = {
    todo: document.querySelector('[data-count="todo"]'),
    doing: document.querySelector('[data-count="doing"]'),
    done: document.querySelector('[data-count="done"]')
  };

  let currentTaskId = null;
  let taskTotalsAllTime = {}; // { taskId: {focusSec, breakSec} }

  /* ======= ELEMENTOS DO POMODORO ======= */

  const modeButtons = document.querySelectorAll("[data-mode]");
  const timerDisplay = document.getElementById("timer-display");
  const startBtn = document.getElementById("start-btn");
  const pauseBtn = document.getElementById("pause-btn");
  const resetBtn = document.getElementById("reset-btn");
  const phaseLabel = document.getElementById("phase-label");
  const cycleLabel = document.getElementById("cycle-label");

  const customInput = document.getElementById("custom-minutes");
  const customBtn = document.getElementById("apply-custom");

  const modeDot = document.getElementById("mode-dot");
  const modeLabel = document.getElementById("mode-label");
  const soundToggleEl = document.getElementById("sound-toggle");

  // Mini timer de pausa
  const pausedInfo = document.getElementById("paused-info");
  const pausedTimeEl = document.getElementById("paused-time");

  const durations = {
    focus: 25 * 60,
    short: 5 * 60,
    long: 15 * 60,
    custom: 0
  };

  let currentMode = "focus";
  let remainingTime = durations[currentMode];
  let timerInterval = null;
  let completedFocusSessions = 0;
  let soundEnabled = true;
  let soundAllowed = false;

  // Segmento contínuo (para logar foco/pausa parcial)
  let segmentStartRemaining = null;

  // Pausa em foco
  let pauseStart = null;
  let pausedModeAtStart = null;
  let pausedTaskIdAtStart = null;
  let pausedTimerInterval = null;

  /* ======= ELEMENTOS DAS ESTATÍSTICAS ======= */

  const statTotalFocusEl = document.getElementById("stat-total-focus");
  const statTotalAllEl = document.getElementById("stat-total-all");
  const statTotalSessionsEl = document.getElementById("stat-total-sessions");
  const statSessionsBody = document.getElementById("stat-sessions-body");
  const statByDayEl = document.getElementById("stat-byday");
  const statTasksBody = document.getElementById("stat-tasks-body");

  const statsDateInput = document.getElementById("stats-date");
  const statsClearBtn = document.getElementById("stats-clear");
  const statsFilterLabel = document.getElementById("stats-filter-label");

  let currentStatsFilterDay = null; // 'YYYY-MM-DD' ou null

  /* ======= FUNÇÕES AUXILIARES ======= */

  function saveLocal() {
    localStorage.setItem("tasks-board-v1", JSON.stringify(tasks));
    localStorage.setItem("pomodoro-stats-v1", JSON.stringify(stats));
  }

  function saveUserData() {
    if (!currentUser) return;
    db.collection("users")
      .doc(currentUser.uid)
      .set(
        {
          tasks,
          stats
        },
        { merge: true }
      )
      .catch((err) => console.error("Erro ao salvar no Firestore:", err));
  }

  async function loadUserData(user) {
    try {
      const snap = await db.collection("users").doc(user.uid).get();
      if (snap.exists) {
        const data = snap.data() || {};
        if (Array.isArray(data.tasks)) tasks = data.tasks;
        if (data.stats) {
          stats = {
            totalSeconds: 0,
            byMode: {},
            byDay: {},
            sessions: [],
            pauseDuringFocusSec: 0,
            pauseDuringFocusByDay: {},
            pauseDuringFocusByTask: {},
            ...data.stats
          };
          if (!stats.byMode) stats.byMode = {};
          if (!stats.byDay) stats.byDay = {};
          if (!Array.isArray(stats.sessions)) stats.sessions = [];
          if (!stats.pauseDuringFocusByDay) stats.pauseDuringFocusByDay = {};
          if (!stats.pauseDuringFocusByTask) stats.pauseDuringFocusByTask = {};
        }
      }
      recomputeStatsFromSessions();
    } catch (err) {
      console.error("Erro ao carregar do Firestore:", err);
    } finally {
      taskTotalsAllTime = computeTaskTotals(null);
      renderTasks();
      renderStats();
    }
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[c] || c));
  }

  function formatDurationMMSS(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m.toString().padStart(2, "0")}:${r
      .toString()
      .padStart(2, "0")}`;
  }

  function formatMinutes(seconds) {
    return Math.round((seconds || 0) / 60);
  }

  /* ======= RECOMPUTE STATS A PARTIR DAS SESSÕES ======= */

  function recomputeStatsFromSessions() {
    const all = Array.isArray(stats.sessions) ? stats.sessions : [];
    let totalSeconds = 0;
    const byMode = {};
    const byDay = {};
    let pauseDuringFocusSec = 0;
    const pauseDuringFocusByDay = {};
    const pauseDuringFocusByTask = {};

    all.forEach((s) => {
      const dur = s.durationSec || 0;
      const mode = s.mode || "focus";
      const ended = s.endedAt ? new Date(s.endedAt) : new Date();
      const dayKey = getLocalDayKey(ended);
      const taskId = s.taskId || null;

      totalSeconds += dur;
      byMode[mode] = (byMode[mode] || 0) + dur;
      byDay[dayKey] = (byDay[dayKey] || 0) + dur;

      if (mode === "pause_focus") {
        pauseDuringFocusSec += dur;
        pauseDuringFocusByDay[dayKey] =
          (pauseDuringFocusByDay[dayKey] || 0) + dur;
        if (taskId) {
          pauseDuringFocusByTask[taskId] =
            (pauseDuringFocusByTask[taskId] || 0) + dur;
        }
      }
    });

    stats.totalSeconds = totalSeconds;
    stats.byMode = byMode;
    stats.byDay = byDay;
    stats.pauseDuringFocusSec = pauseDuringFocusSec;
    stats.pauseDuringFocusByDay = pauseDuringFocusByDay;
    stats.pauseDuringFocusByTask = pauseDuringFocusByTask;
  }

  /* ======= TEMPO POR TAREFA ======= */

  function computeTaskTotals(filterDay) {
    const allSessions = Array.isArray(stats.sessions) ? stats.sessions : [];
    const map = {}; // taskId -> {focusSec, breakSec}

    allSessions.forEach((s) => {
      if (!s.taskId) return;
      const d = s.endedAt ? new Date(s.endedAt) : new Date();
      const dayKey = getLocalDayKey(d);
      if (filterDay && dayKey !== filterDay) return;

      const dur = s.durationSec || 0;
      if (!map[s.taskId]) {
        map[s.taskId] = { focusSec: 0, breakSec: 0 };
      }

      if (s.mode === "focus" || s.mode === "custom") {
        map[s.taskId].focusSec += dur;
      } else if (
        s.mode === "short" ||
        s.mode === "long" ||
        s.mode === "pause_focus"
      ) {
        map[s.taskId].breakSec += dur;
      }
    });

    return map;
  }

  /* ======= BOARD ======= */

  function createTaskElement(task, totalsPerTask) {
    const card = document.createElement("div");
    card.className = `task-card priority-${task.priority}`;
    card.draggable = true;
    card.dataset.id = task.id;

    const totals = totalsPerTask[task.id] || { focusSec: 0, breakSec: 0 };
    const focusText = formatDurationMMSS(totals.focusSec);
    const pauseText = formatDurationMMSS(totals.breakSec);

    const estimateMin = task.estimateMinutes
      ? `${task.estimateMinutes} min`
      : "—";

     let progressPercent = null;
      if (task.estimateMinutes && task.estimateMinutes > 0) {
      const estimatedSec = task.estimateMinutes * 60;
      progressPercent = Math.min(
      100,
      Math.round((totals.focusSec / estimatedSec) * 100)
      );
    } 

    card.innerHTML = `
      <div class="task-header">
        <span class="task-title">${escapeHtml(task.title)}</span>
        <button class="task-delete" title="Excluir tarefa">&times;</button>
      </div>
      ${
        task.description
          ? `<p class="task-desc">${escapeHtml(task.description)}</p>`
          : ""
      }
      <div class="task-meta">
        <span>${task.priority.toUpperCase()}</span>
        <span class="task-estimate">Estimado: ${estimateMin}</span>
      </div>
      <div class="task-time-summary">
        <span>Foco: ${focusText}</span>
        <span>Pausas: ${pauseText}</span>
        <span>Progresso: ${
          progressPercent != null ? progressPercent + "%" : "—"
        }</span>
      </div>
    `;

    card.addEventListener("click", (e) => {
      if (e.target.classList.contains("task-delete")) return;
      setCurrentTask(task.id);
      e.stopPropagation();
    });

    const deleteBtn = card.querySelector(".task-delete");
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteTask(task.id);
    });

    card.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/plain", task.id);
      card.classList.add("dragging");
    });

    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
    });

    return card;
  }

  function renderTasks() {
    Object.values(columns).forEach((col) => (col.innerHTML = ""));

    taskTotalsAllTime = computeTaskTotals(null);

    const counts = { todo: 0, doing: 0, done: 0 };

    tasks.forEach((task) => {
      const col = columns[task.column] || columns.todo;
      col.appendChild(createTaskElement(task, taskTotalsAllTime));
      if (counts[task.column] !== undefined) counts[task.column]++;
    });

    Object.keys(counters).forEach((k) => {
      counters[k].textContent = counts[k] || 0;
    });

    updateCurrentTaskLabel();
  }

  function deleteTask(id) {
    tasks = tasks.filter((t) => t.id !== id);
    if (currentTaskId === id) currentTaskId = null;
    saveLocal();
    saveUserData();
    renderTasks();
  }

  function setCurrentTask(id) {
    currentTaskId = id;
    updateCurrentTaskLabel();
  }

  function updateCurrentTaskLabel() {
    const label = document.getElementById("current-task-label");
    const allCards = document.querySelectorAll(".task-card");
    allCards.forEach((c) => c.classList.remove("active-task"));

    if (!currentTaskId) {
      label.textContent = "Nenhuma tarefa vinculada";
      return;
    }

    const task = tasks.find((t) => t.id === currentTaskId);
    if (!task) {
      currentTaskId = null;
      label.textContent = "Nenhuma tarefa vinculada";
      return;
    }

    label.textContent = task.title;
    const card = document.querySelector(`.task-card[data-id="${task.id}"]`);
    if (card) card.classList.add("active-task");
  }

  document.querySelectorAll(".column").forEach((columnEl) => {
    const colKey = columnEl.dataset.column;
    const body = columnEl.querySelector(".column-body");

    body.addEventListener("dragover", (e) => {
      e.preventDefault();
      body.classList.add("drag-over");
    });

    body.addEventListener("dragleave", () => {
      body.classList.remove("drag-over");
    });

    body.addEventListener("drop", (e) => {
      e.preventDefault();
      body.classList.remove("drag-over");
      const taskId = e.dataTransfer.getData("text/plain");
      const task = tasks.find((t) => t.id === taskId);
      if (task) {
        task.column = colKey;
        saveLocal();
        saveUserData();
        renderTasks();
      }
    });
  });

  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const title = titleInput.value.trim();
      if (!title) return;

      const description = descInput.value.trim();
      const column = columnSelect.value;
      const priority = prioritySelect.value;
      const estimateStr = estimateInput ? estimateInput.value.trim() : "";
      const estimateMinutes = estimateStr ? parseInt(estimateStr, 10) : null;

      const newTask = {
        id: Date.now().toString(),
        title,
        description,
        column,
        priority,
        estimateMinutes:
          !isNaN(estimateMinutes) && estimateMinutes > 0
            ? estimateMinutes
            : null
      };

      tasks.push(newTask);
      saveLocal();
      saveUserData();
      form.reset();
      columnSelect.value = "todo";
      prioritySelect.value = "normal";
      renderTasks();
    });
  }

  /* ======= POMODORO ======= */

  if (soundToggleEl) {
    soundToggleEl.addEventListener("change", () => {
      soundEnabled = soundToggleEl.checked;
    });
  }

  document.addEventListener(
    "click",
    () => {
      soundAllowed = true;
    },
    { once: true }
  );

  function setMode(mode, customSeconds) {
    // Cancela pausa em foco se houver (sem continuar contando)
    if (pauseStart) {
      // Ao mudar de modo durante pausa em foco, vamos contabilizar a pausa também:
      finalizePauseInFocus("change-mode");
    }

    // Se timer rodando, registra o segmento já usado antes de mudar
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    if (segmentStartRemaining !== null && segmentStartRemaining > remainingTime) {
      const seg = segmentStartRemaining - remainingTime;
      if (seg > 0) {
        logSession(currentMode, seg);
      }
      segmentStartRemaining = null;
    }

    if (mode === "custom") {
      if (typeof customSeconds === "number" && customSeconds > 0) {
        durations.custom = customSeconds;
      }
      if (durations.custom <= 0) return;
    }

    if (!durations[mode]) return;

    currentMode = mode;
    remainingTime = durations[mode];

    updateTimerDisplay();
    updateModeButtons();
    updatePhaseLabel();
    updateModeIndicator();
  }

  function updateTimerDisplay() {
    timerDisplay.textContent = formatDurationMMSS(remainingTime);
  }

  function updateModeButtons() {
    modeButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === currentMode);
    });
  }

  function updatePhaseLabel() {
    const text =
      currentMode === "focus"
        ? "Foco em andamento"
        : currentMode === "short"
        ? "Pausa curta"
        : currentMode === "long"
        ? "Pausa longa"
        : "Ciclo personalizado";
    phaseLabel.textContent = text;
  }

  function updateModeIndicator() {
    let text = "";
    let cls = "mode-dot ";

    if (currentMode === "focus") {
      text = `Modo: Foco (${formatMinutes(durations.focus)} min)`;
      cls += "mode-focus";
    } else if (currentMode === "short") {
      text = `Modo: Pausa curta (${formatMinutes(durations.short)} min)`;
      cls += "mode-short";
    } else if (currentMode === "long") {
      text = `Modo: Pausa longa (${formatMinutes(durations.long)} min)`;
      cls += "mode-long";
    } else if (currentMode === "custom") {
      text = `Modo: Personalizado (${formatMinutes(durations.custom)} min)`;
      cls += "mode-custom";
    }

    modeLabel.textContent = text;
    modeDot.className = cls;
  }

  /* === Mini timer de pausa em foco === */

  function startPausedDisplay() {
    if (!pausedInfo || !pausedTimeEl) return;
    if (pausedTimerInterval) return;

    pausedInfo.classList.remove("hidden");

    pausedTimerInterval = setInterval(() => {
      if (!pauseStart) return;
      const diffSec = Math.max(
        0,
        Math.floor((Date.now() - pauseStart) / 1000)
      );
      pausedTimeEl.textContent = formatDurationMMSS(diffSec);
    }, 500);
  }

  function stopPausedDisplay(resetText = true) {
    if (pausedTimerInterval) {
      clearInterval(pausedTimerInterval);
      pausedTimerInterval = null;
    }
    if (pausedInfo) {
      pausedInfo.classList.add("hidden");
    }
    if (resetText && pausedTimeEl) {
      pausedTimeEl.textContent = "00:00";
    }
  }

  /* === Finalizar pausa em foco (usado no start e no reset) === */

  function finalizePauseInFocus(reason) {
    if (
      !pauseStart ||
      !(pausedModeAtStart === "focus" || pausedModeAtStart === "custom")
    ) {
      pauseStart = null;
      pausedModeAtStart = null;
      pausedTaskIdAtStart = null;
      stopPausedDisplay();
      return;
    }

    const diffSec = Math.max(
      1,
      Math.floor((Date.now() - pauseStart) / 1000)
    );

    const now = new Date();
    const endedAt = now.toISOString();
    const taskIdForPause = pausedTaskIdAtStart || currentTaskId || null;

    if (!Array.isArray(stats.sessions)) {
      stats.sessions = [];
    }

    stats.sessions.unshift({
      mode: "pause_focus",
      durationSec: diffSec,
      endedAt,
      taskId: taskIdForPause
    });
    if (stats.sessions.length > 200) stats.sessions.pop();

    // Recalcula tudo a partir das sessões
    recomputeStatsFromSessions();
    taskTotalsAllTime = computeTaskTotals(null);

    saveLocal();
    saveUserData();

    // Atualiza UI imediatamente
    renderTasks();
    renderStats();

    // Limpa estado de pausa
    pauseStart = null;
    pausedModeAtStart = null;
    pausedTaskIdAtStart = null;
    stopPausedDisplay();
  }

  /* === Alarme + animação === */

  function playAlarm() {
    if (!soundEnabled || !soundAllowed) return;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);

      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);

      osc.start(now);
      osc.stop(now + 1.5);
    } catch (e) {
      console.warn("Áudio não pôde ser reproduzido:", e);
    }
  }

  function flashTimer() {
    timerDisplay.classList.remove("timer-finished");
    void timerDisplay.offsetWidth;
    timerDisplay.classList.add("timer-finished");
  }

  /* === Timer controles === */

  function startTimer() {
    if (timerInterval) return;

    // Se estava em pausa em foco, encerra essa pausa como sessão
    if (pauseStart) {
      finalizePauseInFocus("resume");
    }

    if (segmentStartRemaining === null) {
      segmentStartRemaining = remainingTime;
    }

    timerInterval = setInterval(() => {
      remainingTime--;
      if (remainingTime <= 0) {
        remainingTime = 0;
        updateTimerDisplay();
        clearInterval(timerInterval);
        timerInterval = null;
        handleTimerEnd();
      } else {
        updateTimerDisplay();
      }
    }, 1000);
  }

  function pauseTimer() {
    if (!timerInterval) return;

    clearInterval(timerInterval);
    timerInterval = null;

    // registra tempo parcial (foco ou pausa) até o momento
    if (segmentStartRemaining !== null && segmentStartRemaining > remainingTime) {
      const seg = segmentStartRemaining - remainingTime;
      if (seg > 0) {
        logSession(currentMode, seg);
      }
      segmentStartRemaining = null;
    }

    // inicia contagem de pausa em foco se estiver em foco/custom
    if (currentMode === "focus" || currentMode === "custom") {
      pauseStart = Date.now();
      pausedModeAtStart = currentMode;
      pausedTaskIdAtStart = currentTaskId || null;
      startPausedDisplay();
    }
  }

  function resetTimer() {
    // se timer rodando, registra segmento parcial
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;

      if (
        segmentStartRemaining !== null &&
        segmentStartRemaining > remainingTime
      ) {
        const seg = segmentStartRemaining - remainingTime;
        if (seg > 0) {
          logSession(currentMode, seg);
        }
      }
      segmentStartRemaining = null;
    }

    // se estava em pausa em foco, registra a pausa antes de resetar
    if (pauseStart) {
      finalizePauseInFocus("reset");
    }

    remainingTime = durations[currentMode];
    updateTimerDisplay();
  }

  function logSession(mode, durationSec) {
    if (!durationSec || durationSec <= 0) return;

    const now = new Date();
    const endedAt = now.toISOString();

    if (!Array.isArray(stats.sessions)) {
      stats.sessions = [];
    }

    stats.sessions.unshift({
      mode,
      durationSec,
      endedAt,
      taskId: currentTaskId || null
    });
    if (stats.sessions.length > 200) stats.sessions.pop();

    // Recalcula totais globais e por tarefa
    recomputeStatsFromSessions();
    taskTotalsAllTime = computeTaskTotals(null);

    // Salva e atualiza UI
    saveLocal();
    saveUserData();
    renderTasks();
    renderStats();
  }


  function handleTimerEnd() {
    flashTimer();
    playAlarm();

    if (segmentStartRemaining !== null && segmentStartRemaining > remainingTime) {
      const seg = segmentStartRemaining - remainingTime;
      if (seg > 0) {
        logSession(currentMode, seg);
      }
      segmentStartRemaining = null;
    }

    if (currentMode === "focus") {
      completedFocusSessions++;
      cycleLabel.textContent = `${completedFocusSessions} ciclo(s) de foco concluído(s)`;
      if (completedFocusSessions % 4 === 0) {
        setMode("long");
      } else {
        setMode("short");
      }
    } else if (currentMode === "custom") {
      setMode("focus");
    } else {
      setMode("focus");
    }

    renderTasks();
    renderStats();
  }

  modeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      setMode(btn.dataset.mode);
    });
  });

  if (startBtn) startBtn.addEventListener("click", startTimer);
  if (pauseBtn) pauseBtn.addEventListener("click", pauseTimer);
  if (resetBtn) resetBtn.addEventListener("click", resetTimer);

  if (customBtn) {
    customBtn.addEventListener("click", () => {
      const minutes = parseInt(customInput.value, 10);
      if (!isNaN(minutes) && minutes > 0 && minutes <= 180) {
        const seconds = minutes * 60;
        setMode("custom", seconds);
      }
    });

    customInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        customBtn.click();
      }
    });
  }

  /* ======= ESTATÍSTICAS: CÁLCULOS ======= */

  function computeAggregates(filterDay) {
    const allSessions = Array.isArray(stats.sessions) ? stats.sessions : [];
    const agg = {
      totalSec: 0,
      focusSec: 0,
      shortSec: 0,
      longSec: 0,
      pausedFocusSec: 0,
      sessions: []
    };

    allSessions.forEach((s, idx) => {
      const dur = s.durationSec || 0;
      const d = s.endedAt ? new Date(s.endedAt) : new Date();
      const dayKey = getLocalDayKey(d);
      if (filterDay && dayKey !== filterDay) return;

      agg.totalSec += dur;

      if (s.mode === "focus" || s.mode === "custom") {
        agg.focusSec += dur;
      } else if (s.mode === "short") {
        agg.shortSec += dur;
      } else if (s.mode === "long") {
        agg.longSec += dur;
      } else if (s.mode === "pause_focus") {
        agg.pausedFocusSec += dur;
      }

      agg.sessions.push({ ...s, _index: idx });
    });

    return agg;
  }

  /* ======= APAGAR SESSÃO ======= */

  function deleteSessionAtIndex(index) {
    if (!Array.isArray(stats.sessions)) return;
    if (index < 0 || index >= stats.sessions.length) return;

    stats.sessions.splice(index, 1);
    recomputeStatsFromSessions();
    saveLocal();
    saveUserData();

    taskTotalsAllTime = computeTaskTotals(null);
    renderTasks();
    renderStats();
  }

  /* ======= ESTATÍSTICAS: RENDER ======= */

  function renderStats() {
    if (!statTotalFocusEl) return;

    const {
      totalSec,
      focusSec,
      shortSec,
      longSec,
      pausedFocusSec,
      sessions
    } = computeAggregates(currentStatsFilterDay);

    if (statsFilterLabel) {
      statsFilterLabel.textContent = currentStatsFilterDay
        ? `Exibindo apenas o dia ${currentStatsFilterDay}`
        : "Exibindo todos os registros";
    }

    statTotalFocusEl.textContent = formatDurationMMSS(focusSec);
    statTotalAllEl.textContent = formatDurationMMSS(totalSec);
    statTotalSessionsEl.textContent = sessions.length || 0;

    const statTotalShortEl = document.getElementById("stat-total-short");
    const statTotalLongEl = document.getElementById("stat-total-long");
    const statPausedFocusEl = document.getElementById(
      "stat-total-paused-focus"
    );

    if (statTotalShortEl) {
      statTotalShortEl.textContent = formatDurationMMSS(shortSec);
    }
    if (statTotalLongEl) {
      statTotalLongEl.textContent = formatDurationMMSS(longSec);
    }
    if (statPausedFocusEl) {
      statPausedFocusEl.textContent = formatDurationMMSS(pausedFocusSec);
    }

    // Últimas sessões
    statSessionsBody.innerHTML = "";
    sessions.forEach((sWrap) => {
      const s = sWrap;
      const d = s.endedAt ? new Date(s.endedAt) : new Date();
      const modeLabel =
        s.mode === "focus"
          ? "Foco"
          : s.mode === "short"
          ? "Pausa curta"
          : s.mode === "long"
          ? "Pausa longa"
          : s.mode === "pause_focus"
          ? "Pausa em foco"
          : "Personalizado";

      const durText = formatDurationMMSS(s.durationSec || 0);

      const task =
        s.taskId && tasks.find((t) => t.id === s.taskId)
          ? tasks.find((t) => t.id === s.taskId)
          : null;
      const taskTitle = task ? task.title : "—";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      })}</td>
        <td>${modeLabel}</td>
        <td>${escapeHtml(taskTitle)}</td>
        <td>${durText}</td>
        <td>
          <button class="session-delete" data-index="${
            s._index
          }" title="Apagar registro">🗑</button>
        </td>
      `;
      statSessionsBody.appendChild(tr);
    });

    statSessionsBody.onclick = (e) => {
      const btn = e.target.closest(".session-delete");
      if (!btn) return;
      const idx = parseInt(btn.dataset.index, 10);
      if (isNaN(idx)) return;
      deleteSessionAtIndex(idx);
    };

    // Tempo por tarefa
    if (statTasksBody) {
      statTasksBody.innerHTML = "";
      const totalsForFilter = computeTaskTotals(currentStatsFilterDay);

      const rows = tasks
        .filter((t) => totalsForFilter[t.id])
        .map((t) => {
          const total = totalsForFilter[t.id];
          const focusSec = total.focusSec || 0;
          const breakSec = total.breakSec || 0;
          const totalSecTask = focusSec + breakSec;

          let progressPercent = null;
          if (t.estimateMinutes && t.estimateMinutes > 0) {
            const estimatedSec = t.estimateMinutes * 60;
            progressPercent = Math.min(
              100,
              Math.round((focusSec / estimatedSec) * 100)
            );
          }

          return {
            title: t.title,
            estimateMinutes: t.estimateMinutes ?? null,
            focusSec,
            breakSec,
            totalSecTask,
            progressPercent
          };
        })
        .sort((a, b) => b.totalSecTask - a.totalSecTask);

      rows.forEach((r) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(r.title)}</td>
          <td>${r.estimateMinutes != null ? r.estimateMinutes + " min" : "—"}</td>
          <td>${formatDurationMMSS(r.focusSec)}</td>
          <td>${formatDurationMMSS(r.breakSec)}</td>
          <td>${formatDurationMMSS(r.totalSecTask)}</td>
          <td>${r.progressPercent != null ? r.progressPercent + "%" : "—"}</td>
        `;
        statTasksBody.appendChild(tr);
      });

      if (rows.length === 0) {
        const tr = document.createElement("tr");
        tr.innerHTML =
          '<td colspan="6">Nenhum tempo registrado para tarefas neste filtro.</td>';
        statTasksBody.appendChild(tr);
      }
    }

    // Tempo por dia (usar byDay já calculado, que está no fuso local)
    statByDayEl.innerHTML = "";
    const byDay = stats.byDay || {};

    if (currentStatsFilterDay) {
      const sec = byDay[currentStatsFilterDay] || 0;
      const mins = Math.round(sec / 60);
      const row = document.createElement("div");
      row.className = "byday-row";
      row.innerHTML = `
        <span class="byday-date">${currentStatsFilterDay}</span>
        <div class="byday-bar">
          <div class="byday-bar-fill" style="width:100%;"></div>
        </div>
        <span class="byday-mins">${mins} min</span>
      `;
      statByDayEl.appendChild(row);
    } else {
      const entries = Object.entries(byDay).sort((a, b) =>
        a[0].localeCompare(b[0])
      );
      const maxSec =
        last.length > 0 ? Math.max(...last.map(([_, sec]) => sec)) : 0;

      last.forEach(([day, sec]) => {
        const mins = Math.round(sec / 60);
        const width = maxSec ? (sec / maxSec) * 100 : 0;
        const row = document.createElement("div");
        row.className = "byday-row";
        row.innerHTML = `
          <span class="byday-date">${day}</span>
          <div class="byday-bar">
            <div class="byday-bar-fill" style="width:${width}%;"></div>
          </div>
          <span class="byday-mins">${mins} min</span>
        `;
        statByDayEl.appendChild(row);
      });
    }
  }

  /* ======= FILTRO DE DATA ======= */

  if (statsDateInput) {
    statsDateInput.addEventListener("change", () => {
      currentStatsFilterDay = statsDateInput.value || null;
      renderStats();
    });
  }

  if (statsClearBtn) {
    statsClearBtn.addEventListener("click", () => {
      currentStatsFilterDay = null;
      if (statsDateInput) statsDateInput.value = "";
      renderStats();
    });
  }

  /* ======= TABS ======= */

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const tab = btn.dataset.tab;
      if (tab === "board") {
        tabBoard.classList.remove("hidden");
        tabStats.classList.add("hidden");
      } else {
        tabStats.classList.remove("hidden");
        tabBoard.classList.add("hidden");
        renderStats();
      }
    });
  });

  /* ======= AUTENTICAÇÃO ======= */

  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      loginError.textContent = "";
      const email = document.getElementById("login-email").value.trim();
      const senha = document
        .getElementById("login-password")
        .value.trim();

      auth
        .signInWithEmailAndPassword(email, senha)
        .catch((err) => {
          loginError.textContent =
            err.code === "auth/wrong-password" ||
            err.code === "auth/user-not-found"
              ? "E-mail ou senha inválidos."
              : "Erro ao entrar. Verifique os dados.";
          console.error(err);
        });
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", (e) => {
      e.preventDefault();
      registerError.textContent = "";
      const email = document
        .getElementById("register-email")
        .value.trim();
      const senha = document
        .getElementById("register-password")
        .value.trim();

      auth
        .createUserWithEmailAndPassword(email, senha)
        .catch((err) => {
          registerError.textContent =
            err.code === "auth/email-already-in-use"
              ? "E-mail já cadastrado."
              : "Erro ao cadastrar. Tente novamente.";
          console.error(err);
        });
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      auth.signOut().catch(console.error);
    });
  }

  auth.onAuthStateChanged(async (user) => {
    if (user) {
      currentUser = user;
      userEmailLabel.textContent = user.email || "";
      userInfo.classList.remove("hidden");
      authWrapper.classList.add("hidden");
      appRoot.classList.remove("hidden");
      await loadUserData(user);
    } else {
      currentUser = null;
      userInfo.classList.add("hidden");
      appRoot.classList.add("hidden");
      authWrapper.classList.remove("hidden");
    }
  });

  /* ======= INICIALIZAÇÃO ======= */

  recomputeStatsFromSessions();
  taskTotalsAllTime = computeTaskTotals(null);
  renderTasks();
  updateModeButtons();
  updatePhaseLabel();
  updateTimerDisplay();
  updateModeIndicator();
  renderStats();
});