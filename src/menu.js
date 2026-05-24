import { getHistory, getMenus, getSettings, getTodayMenuId, saveMenus, setTodayMenuId } from "./storage.js";
import { DEFAULT_BEGINNER_RESTS, DEFAULT_BEGINNER_ROUNDS } from "./templates.js";

export function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function previousDate(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  date.setDate(date.getDate() - 1);
  return localDate(date);
}

export function createMenu(source = {}) {
  const settings = getSettings();
  const roundCount = Number(source.roundCount || source.rounds?.length || 3);
  const now = new Date().toISOString();
  const menu = {
    id: uid("menu"),
    name: source.name || "今日のキック練習",
    menuDate: source.menuDate || localDate(),
    roundSeconds: Number(source.roundSeconds || settings.defaultRoundSeconds),
    restSeconds: Number(source.restSeconds ?? settings.defaultRestSeconds),
    rounds: [],
    rests: [],
    memo: source.memo || "",
    createdAt: now,
    updatedAt: now,
    lastPerformedAt: null,
    performedCount: 0
  };
  syncMenuShape(menu, roundCount);
  if (source.rounds) {
    menu.rounds = menu.rounds.map((round, index) => ({ ...round, ...source.rounds[index], number: index + 1, title: `Round ${index + 1}` }));
  } else {
    menu.rounds = menu.rounds.map((round, index) => ({
      ...round,
      items: DEFAULT_BEGINNER_ROUNDS[index]?.items || [],
      memo: DEFAULT_BEGINNER_ROUNDS[index]?.memo || ""
    }));
  }
  if (source.rests) {
    menu.rests = menu.rests.map((rest, index) => ({ ...rest, ...source.rests[index], afterRound: index + 1 }));
  } else {
    menu.rests = menu.rests.map((rest, index) => ({
      ...rest,
      items: DEFAULT_BEGINNER_RESTS[index] || []
    }));
  }
  return menu;
}

export function syncMenuShape(menu, roundCount) {
  const count = Math.max(1, Number(roundCount || menu.rounds.length || 3));
  menu.rounds = Array.from({ length: count }, (_, index) => {
    const existing = menu.rounds?.[index] || {};
    return {
      number: index + 1,
      title: `Round ${index + 1}`,
      items: Array.isArray(existing.items) ? existing.items : [],
      memo: existing.memo || ""
    };
  });
  menu.rests = Array.from({ length: Math.max(0, count - 1) }, (_, index) => {
    const existing = menu.rests?.[index] || {};
    return {
      afterRound: index + 1,
      items: Array.isArray(existing.items) ? existing.items : []
    };
  });
  return menu;
}

export function upsertMenu(menu) {
  const menus = getMenus();
  const now = new Date().toISOString();
  const index = menus.findIndex((item) => item.id === menu.id);
  const saved = { ...menu, updatedAt: now };
  if (index >= 0) menus[index] = saved;
  else menus.unshift(saved);
  saveMenus(menus);
  return saved;
}

export function getTodayMenu() {
  const menus = getMenus();
  const today = localDate();
  return menus.find((menu) => menu.id === getTodayMenuId() && menu.menuDate === today) || menus.find((menu) => menu.menuDate === today) || null;
}

export function ensureTodayMenu() {
  const today = localDate();
  const menus = getMenus();
  const existing = menus.find((menu) => menu.menuDate === today);
  if (existing) {
    setTodayMenuId(existing.id);
    return existing;
  }

  const yesterday = previousDate(today);
  const histories = getHistory()
    .filter((item) => item.performedDate === yesterday)
    .sort((a, b) => String(b.endedAt).localeCompare(String(a.endedAt)));
  const source = histories[0]?.snapshot || menus
    .filter((menu) => menu.menuDate === yesterday)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];

  if (!source) return null;
  const copied = createMenu({
    ...structuredClone(source),
    name: source.name || source.menuName || "今日のキック練習",
    menuDate: today
  });
  copied.memo = source.memo || "";
  const saved = upsertMenu(copied);
  setTodayMenuId(saved.id);
  return saved;
}
