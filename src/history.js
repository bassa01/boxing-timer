import { getHistory, getMenus, saveHistory, saveMenus } from "./storage.js";
import { localDate, uid } from "./menu.js";

export function addTrainingHistory(menu, startedAt, status, memo = "", sessions = []) {
  const endedAt = new Date().toISOString();
  const item = {
    id: uid("history"),
    performedDate: localDate(new Date(endedAt)),
    startedAt,
    endedAt,
    menuId: menu.id,
    menuName: menu.name,
    roundCount: menu.rounds.length,
    snapshot: structuredClone(menu),
    sessions: structuredClone(sessions),
    memo,
    status
  };
  const history = getHistory();
  history.unshift(item);
  saveHistory(history);

  const menus = getMenus();
  const index = menus.findIndex((entry) => entry.id === menu.id);
  if (index >= 0) {
    menus[index] = {
      ...menus[index],
      lastPerformedAt: endedAt,
      performedCount: Number(menus[index].performedCount || 0) + (status === "完了" ? 1 : 0),
      updatedAt: new Date().toISOString()
    };
    saveMenus(menus);
  }
  return item;
}

export function groupHistoryByDate(history) {
  return history.reduce((groups, item) => {
    groups[item.performedDate] ||= [];
    groups[item.performedDate].push(item);
    return groups;
  }, {});
}

export function deleteTrainingHistory(historyId) {
  const history = getHistory();
  const nextHistory = history.filter((item) => item.id !== historyId);
  if (nextHistory.length === history.length) return false;
  saveHistory(nextHistory);
  return true;
}
