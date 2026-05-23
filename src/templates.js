export const TECHNIQUE_TEMPLATES = {
  パンチ: ["ジャブ", "ストレート", "ワンツー", "フック", "アッパー"],
  キック: ["右ロー", "左ロー", "右ミドル", "左ミドル", "前蹴り"],
  膝: ["右膝", "左膝", "首相撲から膝"],
  防御: ["ガード", "パーリング", "スリップ", "バックステップ", "カット"],
  フットワーク: ["前進", "後退", "左右移動", "角度変更"],
  コンビネーション: ["ワンツー右ロー", "ジャブ右ミドル", "ワンツーフック右ロー"]
};

export function allDefaultTechniques() {
  return Object.values(TECHNIQUE_TEMPLATES).flat();
}
