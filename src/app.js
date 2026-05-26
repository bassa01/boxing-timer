import { addTrainingHistory, deleteTrainingHistory, groupHistoryByDate } from "./history.js";
import { createMenu, ensureTodayMenu, getTodayMenu, syncMenuShape, upsertMenu } from "./menu.js";
import { registerServiceWorker, setupInstallButton } from "./pwa.js";
import {
  exportData,
  getCustomTechniques,
  getHistory,
  getMenus,
  getSettings,
  importData,
  initializeStorage,
  saveCustomTechniques,
  saveSettings,
  setTodayMenuId
} from "./storage.js";
import { SOUTHPAW_TWO_HOUR_PRESET, TECHNIQUE_TEMPLATES } from "./templates.js";
import { buildSessions, formatTime, TrainingTimer } from "./timer.js";

const app = document.querySelector("#app");
const tabs = [...document.querySelectorAll(".tab-button")];
const EQUIPMENT_ITEMS = new Set(["床・空きスペース", "床", "縄跳び", "ラダー", "シャドー", "ミット", "サンドバッグ", "ケトルベル", "メディシンボール"]);
const state = {
  view: "home",
  editingMenu: null,
  runningMenu: null,
  selectedHistory: null,
  sessionLog: [],
  timer: null,
  startedAt: null,
  wakeLock: null
};

initializeStorage();
ensureTodayMenu();
registerServiceWorker();
setupInstallButton(document.querySelector("#installButton"));
render("home");

tabs.forEach((button) => {
  button.addEventListener("click", () => render(button.dataset.view));
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.timer?.running) requestWakeLock();
});

if ("speechSynthesis" in window) {
  speechSynthesis.getVoices();
  speechSynthesis.addEventListener?.("voiceschanged", () => {
    speechSynthesis.getVoices();
  });
}

function cloneTemplate(id) {
  return document.querySelector(`#${id}`).content.cloneNode(true);
}

function render(view) {
  state.view = view;
  document.body.classList.toggle("is-running-view", view === "run");
  document.body.classList.toggle("is-share-view", view === "share-card");
  tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === view));
  if (state.timer && view !== "run") {
    state.timer.stop();
    state.timer = null;
    releaseWakeLock();
  }
  if (view === "home") renderHome();
  if (view === "menus") renderMenus();
  if (view === "edit") renderEdit();
  if (view === "run") renderRun();
  if (view === "history") renderHistory();
  if (view === "history-detail") renderHistoryDetail();
  if (view === "share-card") renderShareCard();
  if (view === "settings") renderSettings();
}

function renderHome() {
  app.replaceChildren(cloneTemplate("homeView"));
  const today = getTodayMenu();
  app.querySelector("[data-today-title]").textContent = today?.name || "今日のメニューなし";
  app.querySelector("[data-today-summary]").textContent = today ? summary(today) : "新規作成から今日の練習を作成します";
  app.querySelector("[data-action='start-today']").disabled = !today;
  app.querySelector("[data-action='start-today']").addEventListener("click", () => startMenu(today));
  app.querySelector("[data-action='new-menu']").addEventListener("click", () => editMenu(createMenu()));
  app.querySelector("[data-action='edit-today']").addEventListener("click", () => editMenu(today || createMenu()));
  renderRecentHistory(app.querySelector("[data-recent-history]"));
}

function renderMenus() {
  app.replaceChildren(cloneTemplate("menusView"));
  app.querySelector("[data-action='new-menu']").addEventListener("click", () => editMenu(createMenu()));
  const presetButton = app.querySelector("[data-action='preset-two-hour']");
  const list = app.querySelector("[data-menu-list]");
  const menus = getMenus();
  if (hasPresetMenu(menus, SOUTHPAW_TWO_HOUR_PRESET.presetId)) {
    presetButton.remove();
  } else {
    presetButton.addEventListener("click", () => editMenu(createMenu(SOUTHPAW_TWO_HOUR_PRESET)));
  }
  if (!menus.length) {
    list.append(emptyCard("メニューがありません"));
    return;
  }
  menus.forEach((menu) => list.append(menuCard(menu)));
}

function hasPresetMenu(menus, presetId) {
  return menus.some((menu) => {
    return menu.presetId === presetId ||
      (menu.name === SOUTHPAW_TWO_HOUR_PRESET.name &&
        menu.rounds?.length === SOUTHPAW_TWO_HOUR_PRESET.roundCount &&
        Number(menu.roundSeconds) === SOUTHPAW_TWO_HOUR_PRESET.roundSeconds &&
        Number(menu.restSeconds) === SOUTHPAW_TWO_HOUR_PRESET.restSeconds);
  });
}

function renderEdit() {
  const menu = state.editingMenu || createMenu();
  app.replaceChildren(cloneTemplate("editView"));
  const form = app.querySelector("[data-menu-form]");
  form.name.value = menu.name;
  form.roundCount.value = menu.rounds.length;
  form.roundSeconds.value = menu.roundSeconds;
  form.restSeconds.value = menu.restSeconds;
  form.memo.value = menu.memo || "";
  form.roundCount.addEventListener("change", () => {
    syncMenuShape(menu, Number(form.roundCount.value));
    readBaseForm(menu, form);
    state.editingMenu = menu;
    renderEdit();
  });
  renderRoundEditor(menu, app.querySelector("[data-round-editor]"));
  app.querySelector("[data-action='add-round']").addEventListener("click", () => {
    readMenuForm(menu, form);
    syncMenuShape(menu, menu.rounds.length + 1);
    state.editingMenu = menu;
    renderEdit();
  });
  app.querySelector("[data-action='back']").addEventListener("click", () => render("menus"));
  app.querySelector("[data-action='save-menu']").addEventListener("click", () => {
    readMenuForm(menu, form);
    const saved = upsertMenu(menu);
    if (saved.menuDate === todayText()) setTodayMenuId(saved.id);
    state.editingMenu = null;
    render("menus");
  });
}

function renderRun() {
  const menu = state.runningMenu;
  app.replaceChildren(cloneTemplate("runView"));
  const sessions = buildSessions(menu);
  state.startedAt = new Date().toISOString();
  state.sessionLog = [];
  state.timer = new TrainingTimer({
    sessions,
    onSession: (session) => {
      startSessionRecord(session);
      playCue(session.type);
      speak(sessionSpeechText(session));
    },
    onTick: updateRunView,
    onComplete: () => {
      finishCurrentSessionRecord();
      releaseWakeLock();
      playCue("end");
      addTrainingHistory(menu, state.startedAt, "完了", "", state.sessionLog);
      alert("練習を完了しました");
      render("history");
    }
  });
  app.querySelector("[data-action='toggle-run']").addEventListener("click", () => {
    state.timer.toggle();
    if (state.timer.running) requestWakeLock();
    else releaseWakeLock();
    app.querySelector("[data-action='toggle-run']").textContent = state.timer.running ? "一時停止" : "再開";
  });
  app.querySelector("[data-action='skip-run']").addEventListener("click", () => state.timer.skip());
  app.querySelector("[data-action='end-run']").addEventListener("click", () => {
    if (!confirm("練習を終了しますか？")) return;
    finishCurrentSessionRecord();
    state.timer.stop();
    releaseWakeLock();
    const memo = prompt("練習メモを残しますか？", "") || "";
    addTrainingHistory(menu, state.startedAt, "途中終了", memo, state.sessionLog);
    render("history");
  });
  updateRunView(state.timer.current(), state.timer.next(), state.timer.remaining, "view");
}

function renderHistory() {
  app.replaceChildren(cloneTemplate("historyView"));
  const list = app.querySelector("[data-history-list]");
  const groups = groupHistoryByDate(getHistory());
  const dates = Object.keys(groups).sort().reverse();
  if (!dates.length) {
    list.append(emptyCard("履歴がありません"));
    return;
  }
  dates.forEach((date) => {
    const section = document.createElement("section");
    section.className = "view-stack";
    section.innerHTML = `<h3 class="section-title">${date}</h3>`;
    groups[date].forEach((item) => section.append(historyCard(item)));
    list.append(section);
  });
}

function renderSettings() {
  app.replaceChildren(cloneTemplate("settingsView"));
  const settings = getSettings();
  app.querySelectorAll("[data-setting]").forEach((input) => {
    const key = input.dataset.setting;
    if (input.type === "checkbox") input.checked = Boolean(settings[key]);
    else input.value = settings[key];
    input.addEventListener("change", () => {
      const next = getSettings();
      next[key] = input.type === "checkbox" ? input.checked : Number(input.value);
      saveSettings(next);
    });
  });
  app.querySelector("[data-action='export-json']").addEventListener("click", exportJson);
  app.querySelector("[data-action='import-json']").addEventListener("change", importJson);
  const tags = app.querySelector("[data-custom-techniques]");
  getCustomTechniques().forEach((technique) => {
    const tag = document.createElement("span");
    tag.className = "tech-chip";
    tag.textContent = technique;
    tags.append(tag);
  });
  if (!tags.children.length) tags.append(emptyCard("追加技はまだありません"));
}

function editMenu(menu) {
  state.editingMenu = structuredClone(menu);
  render("edit");
}

function startMenu(menu) {
  state.runningMenu = structuredClone(menu);
  render("run");
}

function menuCard(menu) {
  const card = document.createElement("article");
  card.className = "item-card";
  card.innerHTML = `<h3>${escapeHtml(menu.name)}</h3><p class="item-meta">${summary(menu)}</p>`;
  const actions = document.createElement("div");
  actions.className = "card-actions action-stack";
  actions.append(actionButton("このメニューで開始", "primary-button small full-width", () => startMenu(menu)));
  const secondaryActions = document.createElement("div");
  secondaryActions.className = "secondary-actions";
  secondaryActions.append(actionButton("編集", "secondary-button small", () => editMenu(menu)));
  secondaryActions.append(actionButton("今日のメニューにする", "ghost-button small", () => {
    setTodayMenuId(menu.id);
    render("home");
  }));
  actions.append(secondaryActions);
  card.append(actions);
  return card;
}

function historyCard(item) {
  const card = document.createElement("article");
  card.className = "item-card";
  card.innerHTML = `<h3>${escapeHtml(item.menuName)}</h3><p class="item-meta">${item.status} / ${item.roundCount}R / ${timeOnly(item.startedAt)}-${timeOnly(item.endedAt)}</p>`;
  if (item.memo) {
    const memo = document.createElement("p");
    memo.className = "muted";
    memo.textContent = item.memo;
    card.append(memo);
  }
  const actions = document.createElement("div");
  actions.className = "card-actions action-stack";
  actions.append(actionButton("練習内容を見る", "primary-button small full-width", () => {
    state.selectedHistory = item;
    render("history-detail");
  }));
  actions.append(actionButton("スクショ用に表示", "secondary-button small full-width", () => {
    state.selectedHistory = item;
    render("share-card");
  }));
  actions.append(actionButton("この履歴を削除", "danger-button small danger-inline", () => {
    const ok = confirm(`${item.performedDate} の「${item.menuName}」の履歴を削除しますか？\nこの操作は元に戻せません。`);
    if (!ok) return;
    deleteTrainingHistory(item.id);
    render(state.view);
  }));
  card.append(actions);
  return card;
}

function renderHistoryDetail() {
  const item = state.selectedHistory;
  if (!item) {
    render("history");
    return;
  }
  const root = document.createElement("section");
  root.className = "view-stack";

  const toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  toolbar.append(actionButton("戻る", "ghost-button small", () => render("history")));
  toolbar.append(actionButton("スクショ用", "secondary-button small", () => render("share-card")));
  toolbar.append(actionButton("この履歴を削除", "danger-button small", () => {
    const ok = confirm(`${item.performedDate} の「${item.menuName}」の履歴を削除しますか？\nこの操作は元に戻せません。`);
    if (!ok) return;
    deleteTrainingHistory(item.id);
    state.selectedHistory = null;
    render("history");
  }));

  const header = document.createElement("article");
  header.className = "item-card";
  header.innerHTML = `
    <p class="eyebrow">${escapeHtml(item.performedDate)}</p>
    <h2 class="history-detail-title">${escapeHtml(item.menuName)}</h2>
    <p class="item-meta">${escapeHtml(item.status)} / ${item.roundCount}R / ${timeOnly(item.startedAt)}-${timeOnly(item.endedAt)}</p>
  `;
  if (item.memo) {
    const memo = document.createElement("p");
    memo.className = "muted";
    memo.textContent = item.memo;
    header.append(memo);
  }

  root.append(toolbar, header);
  const performedSessions = item.sessions || [];
  if (performedSessions.length) {
    performedSessions.forEach((session) => root.append(historySessionBlock(session)));
  } else if (item.status === "完了") {
    const menu = item.snapshot || {};
    (menu.rounds || []).forEach((round, index) => {
      root.append(detailBlock(`Round ${index + 1}`, round.items || [], round.memo || ""));
      const rest = menu.rests?.[index];
      if (rest) root.append(detailBlock(`Rest ${index + 1}`, rest.items || [], ""));
    });
  } else {
    root.append(emptyCard("この履歴には実施した区間の記録がありません"));
  }
  app.replaceChildren(root);
}

function renderShareCard() {
  const item = state.selectedHistory;
  if (!item) {
    render("history");
    return;
  }
  const sessions = shareSessions(item);
  const totalSeconds = elapsedSeconds(item.startedAt, item.endedAt);
  const root = document.createElement("section");
  root.className = "share-screen";

  const card = document.createElement("article");
  card.className = "share-card";
  card.innerHTML = `
    <div class="share-header">
      <p>KICKBOXING LOG</p>
      <strong>${escapeHtml(item.performedDate)}</strong>
    </div>
    <div class="share-title-block">
      <h2>${escapeHtml(item.menuName)}</h2>
      <p>${escapeHtml(item.status)} / ${timeOnly(item.startedAt)}-${timeOnly(item.endedAt)}</p>
    </div>
    <div class="share-total">
      <span>実施時間</span>
      <strong>${formatTime(totalSeconds)}</strong>
    </div>
  `;

  const list = document.createElement("div");
  list.className = "share-session-list";
  sessions.forEach((session) => {
    const row = document.createElement("div");
    row.className = "share-session-row";
    row.innerHTML = `
      <span>${escapeHtml(session.label)}</span>
      <strong>${escapeHtml(shareSessionText(session))}</strong>
      <em>${formatTime(sessionDurationSeconds(session))}</em>
    `;
    list.append(row);
  });
  card.append(list);

  const footer = document.createElement("p");
  footer.className = "share-footer";
  footer.textContent = "Kickboxing Training";
  card.append(footer);

  const actions = document.createElement("div");
  actions.className = "share-actions";
  actions.append(actionButton("戻る", "ghost-button small", () => {
    render("history-detail");
  }));
  actions.append(actionButton("履歴へ", "secondary-button small", () => {
    render("history");
  }));
  root.append(card, actions);
  app.replaceChildren(root);
}

function startSessionRecord(session) {
  finishCurrentSessionRecord();
  state.sessionLog.push({
    type: session.type,
    label: session.label,
    items: structuredClone(session.items || []),
    memo: session.memo || "",
    plannedSeconds: session.seconds,
    startedAt: new Date().toISOString(),
    endedAt: null,
    durationSeconds: 0
  });
}

function finishCurrentSessionRecord() {
  const current = state.sessionLog.at(-1);
  if (!current || current.endedAt) return;
  const endedAt = new Date();
  current.endedAt = endedAt.toISOString();
  current.durationSeconds = Math.max(0, Math.round((endedAt.getTime() - new Date(current.startedAt).getTime()) / 1000));
}

function historySessionBlock(session) {
  const items = session.type === "rest" && !session.items?.length ? ["休憩"] : (session.items || []);
  const card = detailBlock(session.label, items, session.memo || "");
  const meta = document.createElement("p");
  meta.className = "item-meta";
  const endText = session.endedAt ? timeOnly(session.endedAt) : "実施中";
  meta.textContent = `${timeOnly(session.startedAt)}-${endText} / ${formatTime(sessionDurationSeconds(session))}`;
  card.prepend(meta);
  return card;
}

function shareSessions(item) {
  if (item.sessions?.length) return item.sessions.filter((session) => session.type !== "rest");
  const menu = item.snapshot || {};
  return (menu.rounds || []).map((round, index) => ({
    label: `Round ${index + 1}`,
    items: round.items || [],
    durationSeconds: menu.roundSeconds || 0
  }));
}

function shareSessionText(session) {
  if (session.type === "rest") return "休憩";
  const items = session.items || [];
  return items.length ? items.join("、") : "自由練習";
}

function sessionDurationSeconds(session) {
  if (session.startedAt && session.endedAt) return elapsedSeconds(session.startedAt, session.endedAt);
  return Number(session.durationSeconds || 0);
}

function elapsedSeconds(startedAt, endedAt) {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / 1000);
}

function detailBlock(title, items, memo) {
  const card = document.createElement("article");
  card.className = "item-card history-detail-card";
  const list = items.length ? items : ["記録なし"];
  card.innerHTML = `<h3>${escapeHtml(title)}</h3><p>${escapeHtml(list.join("、"))}</p>`;
  if (memo) {
    const memoText = document.createElement("p");
    memoText.className = "muted";
    memoText.textContent = memo;
    card.append(memoText);
  }
  return card;
}

function renderRecentHistory(container) {
  const recent = getHistory().slice(0, 3);
  if (!recent.length) {
    container.append(emptyCard("まだ履歴がありません"));
    return;
  }
  recent.forEach((item) => container.append(historyCard(item)));
}

function renderRoundEditor(menu, container) {
  const custom = getCustomTechniques();
  menu.rounds.forEach((round, index) => {
    const card = document.createElement("details");
    card.className = "editor-card";
    if (index === 0) card.open = true;
    card.innerHTML = `<summary><span>Round ${index + 1}</span><span class="round-summary-text">${round.items.length ? escapeHtml(round.items.join("、")) : "未設定"}</span></summary>`;
    const body = document.createElement("div");
    body.className = "round-editor-body";
    const selected = inputArea("内容", round.items.join("、"));
    const memo = inputArea("意識する点", round.memo);
    const free = textInput("自由入力して追加", "");
    const chips = document.createElement("div");
    chips.className = "tech-category-stack";
    Object.entries(TECHNIQUE_TEMPLATES).forEach(([category, techniques]) => {
      chips.append(techniqueCategory(category, techniques, selected));
    });
    if (custom.length) chips.append(techniqueCategory("ユーザー追加", custom, selected));
    free.querySelector("input").addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      const value = event.currentTarget.value.trim();
      if (!value) return;
      const items = splitItems(selected.querySelector("textarea").value);
      if (!items.includes(value)) items.push(value);
      selected.querySelector("textarea").value = items.join("、");
      saveCustomTechniques([...getCustomTechniques(), value]);
      event.currentTarget.value = "";
    });
    selected.querySelector("textarea").addEventListener("input", () => { round.items = splitItems(selected.querySelector("textarea").value); });
    memo.querySelector("textarea").addEventListener("input", () => { round.memo = memo.querySelector("textarea").value; });
    body.append(selected, memo, chips, free);
    card.append(body);
    container.append(card);
  });
}

function techniqueCategory(category, techniques, selected) {
  const section = document.createElement("div");
  section.className = "tech-category";
  const heading = document.createElement("h4");
  heading.textContent = category;
  const grid = document.createElement("div");
  grid.className = "tech-grid";
  [...new Set(techniques)].forEach((technique) => {
    grid.append(actionButton(technique, "tech-chip", () => {
      const textarea = selected.querySelector("textarea");
      const items = splitItems(textarea.value);
      if (!items.includes(technique)) items.push(technique);
      textarea.value = items.join("、");
    }));
  });
  section.append(heading, grid);
  return section;
}

function readBaseForm(menu, form) {
  menu.name = form.name.value.trim() || "今日のキック練習";
  menu.roundSeconds = Number(form.roundSeconds.value || 180);
  menu.restSeconds = Number(form.restSeconds.value || 30);
  menu.memo = form.memo.value;
}

function readMenuForm(menu, form) {
  readBaseForm(menu, form);
  syncMenuShape(menu, Number(form.roundCount.value));
  const roundCards = [...app.querySelectorAll("[data-round-editor] .editor-card")];
  roundCards.forEach((card, index) => {
    const textareas = card.querySelectorAll("textarea");
    menu.rounds[index].items = splitItems(textareas[0].value);
    menu.rounds[index].memo = textareas[1].value;
  });
}

function updateRunView(session, next, remaining, eventName) {
  if (!session) return;
  const current = splitSessionContent(session);
  const equipment = app.querySelector("[data-run-equipment]");
  app.querySelector("[data-run-state]").textContent = session.type === "round" ? "ラウンド中" : "休憩中";
  app.querySelector("[data-run-number]").textContent = session.label;
  app.querySelector("[data-run-time]").textContent = formatTime(remaining);
  equipment.textContent = current.equipment;
  equipment.hidden = !current.equipment;
  app.querySelector("[data-run-current]").textContent = current.content;
  app.querySelector("[data-run-next]").textContent = next ? `${next.label}: ${describeSession(next)}` : "終了";
  if (eventName === "warning") playCue("warning");
}

function actionButton(text, className, handler) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  button.addEventListener("click", handler);
  return button;
}

function inputArea(labelText, value) {
  const label = document.createElement("label");
  label.innerHTML = `<span>${labelText}</span><textarea rows="3"></textarea>`;
  label.querySelector("textarea").value = value || "";
  return label;
}

function textInput(labelText, value) {
  const label = document.createElement("label");
  label.innerHTML = `<span>${labelText}</span><input type="text">`;
  label.querySelector("input").value = value || "";
  return label;
}

function emptyCard(text) {
  const card = document.createElement("div");
  card.className = "item-card muted";
  card.textContent = text;
  return card;
}

function splitItems(value) {
  return value.split(/[、,\n]/).map((item) => item.trim()).filter(Boolean);
}

function describeSession(session) {
  if (session.type === "rest") return "休憩";
  const items = session.items?.length ? session.items.join("、") : "自由練習";
  return items;
}

function splitSessionContent(session) {
  if (session.type === "rest") return { equipment: "", content: "休憩" };
  const items = session.items?.length ? session.items : ["自由練習"];
  const [first, ...rest] = items;
  if (rest.length && EQUIPMENT_ITEMS.has(first)) {
    return { equipment: first, content: rest.join("、") };
  }
  return { equipment: "", content: items.join("、") };
}

function sessionSpeechText(session) {
  if (session.type === "rest") return "Rest";
  const number = Number(session.label.replace("Round ", ""));
  return `Round ${englishNumber(number)}`;
}

function summary(menu) {
  return `${menu.rounds.length}R / ${formatTime(menu.roundSeconds)} / 休憩${formatTime(menu.restSeconds)} / 実施${menu.performedCount || 0}回`;
}

function todayText() {
  return new Date().toLocaleDateString("sv-SE");
}

function timeOnly(value) {
  return new Date(value).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

function playCue(type) {
  if (!getSettings().soundEnabled) return;
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const frequencies = { round: 660, rest: 420, warning: 880, end: 220 };
  oscillator.frequency.value = frequencies[type] || 520;
  oscillator.type = "triangle";
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.76, context.currentTime + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.32);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.34);
}

function speak(text) {
  const settings = getSettings();
  if (!settings.speechEnabled || !("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  speechSynthesis.resume?.();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  const voice = findJapaneseVoice();
  if (voice) utterance.voice = voice;
  utterance.volume = 1;
  utterance.rate = 0.92;
  speechSynthesis.speak(utterance);
}

function findJapaneseVoice() {
  const voices = speechSynthesis.getVoices();
  return voices
    .filter((voice) => {
      const lang = String(voice.lang || "").toLowerCase();
      const name = String(voice.name || "").toLowerCase();
      return lang === "ja-jp" ||
        lang.startsWith("ja") ||
        name.includes("japanese") ||
        name.includes("kyoko") ||
        name.includes("otoya");
    })
    .sort((a, b) => japaneseVoiceScore(b) - japaneseVoiceScore(a))[0] || null;
}

function japaneseVoiceScore(voice) {
  const lang = String(voice.lang || "").toLowerCase();
  const name = String(voice.name || "").toLowerCase();
  let score = 0;
  if (lang === "ja-jp") score += 100;
  if (lang.startsWith("ja")) score += 80;
  if (name.includes("japanese")) score += 30;
  if (name.includes("kyoko") || name.includes("otoya")) score += 20;
  if (voice.localService) score += 5;
  return score;
}

function englishNumber(number) {
  const words = [
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
    "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
    "seventeen", "eighteen", "nineteen", "twenty"
  ];
  if (number <= 20) return words[number];
  if (number < 30) return `twenty ${words[number - 20]}`;
  if (number === 30) return "thirty";
  return String(number);
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator) || state.wakeLock) return;
  try {
    state.wakeLock = await navigator.wakeLock.request("screen");
    state.wakeLock.addEventListener("release", () => {
      state.wakeLock = null;
    });
  } catch {
    state.wakeLock = null;
  }
}

function releaseWakeLock() {
  if (!state.wakeLock) return;
  const lock = state.wakeLock;
  state.wakeLock = null;
  lock.release().catch(() => {});
}

function exportJson() {
  const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `kickboxing-training-${todayText()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function importJson(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!confirm("現在のデータを読み込んだJSONで置き換えますか？")) return;
    importData(data);
    alert("読み込みました");
    render("home");
  } catch (error) {
    alert(error.message || "JSONを読み込めませんでした");
  } finally {
    event.target.value = "";
  }
}
