// Persistent, cross-session achievements — same localStorage pattern as
// highscores.js (try/catch-guarded, degrades to "no persistence" if
// unavailable rather than throwing). Purely a cosmetic/completionist track:
// unlocking one never grants score — the in-run bonuses already reward the
// run itself, this just remembers you've done it at least once, ever.
const STORAGE_KEY = "devops-platformer.achievements.v1";

export const ACHIEVEMENTS = [
  { id: "pacifist", name: "Pacifist", description: "Deploy to production without firing a single shot." },
  {
    id: "sharpshooter",
    name: "Sharpshooter",
    description: "Defeat every enemy by shooting them — no stomps, no Root Access.",
  },
  { id: "combo-master", name: "Combo Master", description: "Chain a 4x or bigger kill streak." },
  {
    id: "perfect-run",
    name: "Perfect Run",
    description: "Deploy to production flawlessly — no damage, no Root Access, everything cleared and collected.",
  },
  { id: "first-deploy", name: "First Deploy", description: "Deploy to production for the first time." },
  { id: "iron-will", name: "Iron Will", description: "Deploy to production with only one REDUNDANCY node left." },
  { id: "speedrunner", name: "Speedrunner", description: "Deploy to production in under 45 seconds." },
  { id: "flagpole-ace", name: "Rack Climber", description: "Grab the signal boost at the very top of the rack." },
  {
    id: "root-cause",
    name: "Root Cause",
    description: "Defeat 3 or more enemies during a single Root Access window.",
  },
  { id: "no-survivors", name: "No Survivors", description: "Defeat every enemy in the level, by any means." },
  { id: "comeback", name: "Comeback", description: "Recover from your last REDUNDANCY node and still deploy." },
];

export function loadUnlocked() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

// Marks `id` unlocked and persists it. Returns true only if this call is
// what newly unlocked it (false if it was already unlocked) — callers use
// that to decide whether to show an unlock toast.
export function unlock(id) {
  const unlocked = loadUnlocked();
  if (unlocked[id]) return false;
  unlocked[id] = true;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(unlocked));
  } catch {
    // Storage unavailable/full — the unlock still counts for this session's
    // toast, it just won't survive a refresh.
  }
  return true;
}
