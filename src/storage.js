export const STORAGE_KEYS = {
  version: "kb_app_version",
  menus: "kb_menus",
  todayMenu: "kb_today_menu",
  history: "kb_history",
  customTechniques: "kb_custom_techniques",
  settings: "kb_settings"
};

export const APP_VERSION = "1";

export const DEFAULT_SETTINGS = {
  soundEnabled: true,
  speechEnabled: false,
  defaultRoundSeconds: 180,
  defaultRestSeconds: 30
};

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function initializeStorage() {
  if (!localStorage.getItem(STORAGE_KEYS.version)) {
    localStorage.setItem(STORAGE_KEYS.version, APP_VERSION);
  }
  if (!localStorage.getItem(STORAGE_KEYS.menus)) writeJson(STORAGE_KEYS.menus, []);
  if (!localStorage.getItem(STORAGE_KEYS.history)) writeJson(STORAGE_KEYS.history, []);
  if (!localStorage.getItem(STORAGE_KEYS.customTechniques)) writeJson(STORAGE_KEYS.customTechniques, []);
  if (!localStorage.getItem(STORAGE_KEYS.settings)) writeJson(STORAGE_KEYS.settings, DEFAULT_SETTINGS);
}

export function getMenus() {
  return readJson(STORAGE_KEYS.menus, []);
}

export function saveMenus(menus) {
  writeJson(STORAGE_KEYS.menus, menus);
}

export function getHistory() {
  return readJson(STORAGE_KEYS.history, []);
}

export function saveHistory(history) {
  writeJson(STORAGE_KEYS.history, history);
}

export function getCustomTechniques() {
  return readJson(STORAGE_KEYS.customTechniques, []);
}

export function saveCustomTechniques(techniques) {
  writeJson(STORAGE_KEYS.customTechniques, [...new Set(techniques.filter(Boolean))]);
}

export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...readJson(STORAGE_KEYS.settings, {}) };
}

export function saveSettings(settings) {
  writeJson(STORAGE_KEYS.settings, { ...DEFAULT_SETTINGS, ...settings });
}

export function getTodayMenuId() {
  return localStorage.getItem(STORAGE_KEYS.todayMenu);
}

export function setTodayMenuId(id) {
  if (id) localStorage.setItem(STORAGE_KEYS.todayMenu, id);
  else localStorage.removeItem(STORAGE_KEYS.todayMenu);
}

export function exportData() {
  return {
    version: localStorage.getItem(STORAGE_KEYS.version) || APP_VERSION,
    menus: getMenus(),
    todayMenu: getTodayMenuId(),
    history: getHistory(),
    customTechniques: getCustomTechniques(),
    settings: getSettings(),
    exportedAt: new Date().toISOString()
  };
}

export function importData(data) {
  if (!data || !Array.isArray(data.menus) || !Array.isArray(data.history)) {
    throw new Error("未対応のJSON形式です");
  }
  localStorage.setItem(STORAGE_KEYS.version, String(data.version || APP_VERSION));
  saveMenus(data.menus);
  saveHistory(data.history);
  saveCustomTechniques(Array.isArray(data.customTechniques) ? data.customTechniques : []);
  saveSettings(data.settings || DEFAULT_SETTINGS);
  if (data.todayMenu) setTodayMenuId(data.todayMenu);
}
