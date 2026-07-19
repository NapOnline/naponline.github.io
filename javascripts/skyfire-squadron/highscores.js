// Top-5 local high score list, persisted in localStorage. Every call is
// try/catch-guarded so private browsing / storage-disabled environments
// degrade to "no persistence" instead of throwing and breaking the game.
// Own storage key (distinct from the platformer's devops-platformer.* keys)
// so the two games' high scores never mix.
const STORAGE_KEY = "skyfire-squadron.highscores.v1";
const MAX_ENTRIES = 5;

export function loadHighScores() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// stage is optional (defaults to 1) so existing v1 entries without it still
// load/sort/render fine — "stage reached" is the natural endless-mode
// bragging metric alongside score, see main.js's renderHighScores().
export function submitHighScore(score, stage = 1) {
  const list = loadHighScores();
  const entry = { score, stage, date: new Date().toISOString() };
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  list.length = Math.min(list.length, MAX_ENTRIES);
  const rank = list.indexOf(entry);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable/full — the run still counts for this session's
    // display, it just won't survive a refresh.
  }
  return { list, rank: rank === -1 ? null : rank + 1 };
}

export function getTopScore() {
  return loadHighScores()[0]?.score ?? 0;
}
