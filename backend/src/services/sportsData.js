import axios from 'axios';
import NodeCache from 'node-cache';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR  = join(__dirname, '../../../cache');
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const memCache = new NodeCache();

const client = axios.create({
  baseURL: 'https://api.sportsdata.io/v3/nba',
  params: { key: process.env.SPORTS_DATA_KEY },
});

// ── File cache helpers ────────────────────────────────────────────────────────

function fileKey(path) {
  return path.replace(/[^a-zA-Z0-9]/g, '_') + '.json';
}

function readDiskCache(path) {
  const file = join(CACHE_DIR, fileKey(path));
  if (!existsSync(file)) return undefined;
  try {
    const { data, expires } = JSON.parse(readFileSync(file, 'utf8'));
    if (Date.now() < expires) return data;
  } catch {}
  return undefined;
}

function writeDiskCache(path, data, ttl) {
  const file = join(CACHE_DIR, fileKey(path));
  try {
    writeFileSync(file, JSON.stringify({ data, expires: Date.now() + ttl * 1000 }));
  } catch {}
}

// ── API fetch with 2-layer cache (memory → disk → API) ───────────────────────

async function apiFetch(path, ttl = 300) {
  // 1. Memory cache (fastest)
  const memHit = memCache.get(path);
  if (memHit !== undefined) return memHit;

  // 2. Disk cache (survives server restarts)
  const diskHit = readDiskCache(path);
  if (diskHit !== undefined) {
    memCache.set(path, diskHit, ttl);
    return diskHit;
  }

  // 3. Real API call
  const { data } = await client.get(path);
  memCache.set(path, data, ttl);
  writeDiskCache(path, data, ttl);
  return data;
}

// Convert JS Date or YYYY-MM-DD string to SportsData date format (YYYY-MMM-DD)
export function toSportsDataDate(dateStr) {
  const d = new Date(dateStr);
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const mm = months[d.getUTCMonth()];
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

// ── Games ─────────────────────────────────────────────────────────────────────

export async function getGamesByDate(date) {
  // date: YYYY-MM-DD
  const sdDate = toSportsDataDate(date);
  return apiFetch(`/scores/json/GamesByDate/${sdDate}`, 120);
}

export async function getGameById(gameId) {
  return apiFetch(`/scores/json/Game/${gameId}`, 120);
}

export async function getLiveGames() {
  return apiFetch('/scores/json/LiveGamesByDate', 30);
}

export async function getSchedule(season) {
  return apiFetch(`/scores/json/Games/${season}`, 86400);
}

export async function getTeamSchedule(season, team) {
  // team is abbreviation e.g. "LAL"
  const games = await getSchedule(season);
  return games.filter(g => g.HomeTeam === team || g.AwayTeam === team);
}

// ── Boxscore ──────────────────────────────────────────────────────────────────

export async function getBoxScore(gameId) {
  return apiFetch(`/stats/json/BoxScore/${gameId}`, 120);
}

export async function getPlayerStatsByDate(date) {
  const sdDate = toSportsDataDate(date);
  return apiFetch(`/stats/json/PlayerGameStatsByDate/${sdDate}`, 120);
}

// ── Standings ─────────────────────────────────────────────────────────────────

export async function getStandings(season = 2025) {
  return apiFetch(`/scores/json/Standings/${season}`, 900);
}

// ── Teams ─────────────────────────────────────────────────────────────────────

export async function getAllTeams() {
  return apiFetch('/scores/json/Teams', 86400);
}

export async function getTeamRoster(team) {
  // team is abbreviation e.g. "LAL"
  return apiFetch(`/scores/json/Players/${team}`, 3600);
}

// ── Players ───────────────────────────────────────────────────────────────────

export async function getAllPlayers() {
  return apiFetch('/scores/json/Players', 86400);
}

export async function getPlayerById(playerId) {
  return apiFetch(`/scores/json/Player/${playerId}`, 3600);
}

export async function getPlayerSeasonStats(season, playerId) {
  const all = await apiFetch(`/stats/json/PlayerSeasonStats/${season}`, 900);
  return all.find(p => p.PlayerID === Number(playerId)) ?? null;
}

export async function getPlayerGameLogs(season, playerId) {
  return apiFetch(`/stats/json/PlayerGameStatsBySeason/${season}/${playerId}/all`, 900);
}

export async function getAllPlayerSeasonStats(season) {
  return apiFetch(`/stats/json/PlayerSeasonStats/${season}`, 900);
}

// ── Playoffs ──────────────────────────────────────────────────────────────────

async function fetchPlayoffGames(season) {
  // GamesByDate is the only endpoint that returns SeasonType=3 games.
  // We fetch Apr 12 → today only (not all the way to Jun 30).
  // Past dates are cached to disk for 30 days — effectively permanent during the season.
  // Today is cached for 5 min so live games stay fresh.
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const today  = new Date();
  const start  = new Date(season, 3, 12);  // Apr 12 of the season year
  const end    = new Date(Math.min(new Date(season, 5, 25).getTime(), today.getTime()));

  const playoffGames = [];
  const cur = new Date(start);
  while (cur <= end) {
    const mm  = MONTHS[cur.getMonth()];
    const dd  = String(cur.getDate()).padStart(2, '0');
    const key = `/scores/json/GamesByDate/${season}-${mm}-${dd}`;
    const isToday = cur.toDateString() === today.toDateString();
    const ttl = isToday ? 300 : 86400 * 30;  // past dates: 30-day cache
    try {
      const games = await apiFetch(key, ttl);
      playoffGames.push(...games.filter(g => g.SeasonType === 3));
    } catch {}
    cur.setDate(cur.getDate() + 1);
  }
  return playoffGames;
}

export async function getPlayoffBracket(season = 2025) {
  const [playoffGames, standingsData] = await Promise.all([
    fetchPlayoffGames(season),
    apiFetch(`/scores/json/Standings/${season}`, 86400),
  ]);

  // Build seed map from standings: teamAbbr → conference rank (= playoff seed)
  const seedMap = {};
  const east = standingsData.filter(t => t.Conference === 'Eastern').sort((a, b) => b.Percentage - a.Percentage);
  const west = standingsData.filter(t => t.Conference === 'Western').sort((a, b) => b.Percentage - a.Percentage);
  east.forEach((t, i) => { seedMap[t.Key] = i + 1; });
  west.forEach((t, i) => { seedMap[t.Key] = i + 1; });

  // Exclude Play-In games (series with only 1-2 games between same teams)
  // First group all games, then keep only series with 3+ games OR that look like real playoff series
  const seriesMap = {};
  for (const g of playoffGames) {
    const key = [g.AwayTeam, g.HomeTeam].sort().join('-');
    if (!seriesMap[key]) {
      seriesMap[key] = {
        teams: [g.AwayTeam, g.HomeTeam].sort(),
        games: [],
        firstGameDate: g.Day,
        seeds: {},
      };
    }
    seriesMap[key].games.push(g);
    if (g.Day < seriesMap[key].firstGameDate) seriesMap[key].firstGameDate = g.Day;
    // Populate seeds from standings-derived seedMap (game fields are always null)
    if (seedMap[g.AwayTeam]) seriesMap[key].seeds[g.AwayTeam] = seedMap[g.AwayTeam];
    if (seedMap[g.HomeTeam]) seriesMap[key].seeds[g.HomeTeam] = seedMap[g.HomeTeam];
  }

  const allSeriesList = Object.values(seriesMap);

  // Play-In involves only seeds 7-10 (min seed of the matchup >= 7).
  // Fall back to game count only when seed data isn't available.
  function isPlayIn(s) {
    const seedVals = Object.values(s.seeds);
    if (seedVals.length >= 2) return Math.min(...seedVals) >= 7;
    return s.games.length <= 2; // fallback
  }

  const playInSeriesList = allSeriesList.filter(s => isPlayIn(s));
  const filteredSeries   = allSeriesList.filter(s => !isPlayIn(s));

  // ── Fix Play-In seeds ─────────────────────────────────────────────────────
  // After Play-In: winner of 7v8 earns seed 7, winner of Decider earns seed 8.
  // Override standings-based seeds so R1 chips show the correct bracket position.
  const DONE = ['Final', 'F/OT', 'F/2OT', 'F/3OT'];
  const EAST_SET = new Set(['ATL','BOS','BKN','CHA','CHI','CLE','DET','IND','MIA','MIL','NY','ORL','PHI','TOR','WAS']);

  function rawWinner(s) {
    const wins = {};
    s.teams.forEach(t => wins[t] = 0);
    for (const g of s.games) {
      if (!DONE.includes(g.Status)) continue;
      if (g.HomeTeamScore > g.AwayTeamScore) wins[g.HomeTeam] = (wins[g.HomeTeam] || 0) + 1;
      else wins[g.AwayTeam] = (wins[g.AwayTeam] || 0) + 1;
    }
    const anyDone = s.games.some(g => DONE.includes(g.Status));
    if (!anyDone) return null;
    const [t1, t2] = s.teams;
    return (wins[t1] ?? 0) >= (wins[t2] ?? 0) ? t1 : t2;
  }

  for (const conf of ['east', 'west']) {
    const confPI = playInSeriesList.filter(s =>
      conf === 'east' ? EAST_SET.has(s.teams[0]) : !EAST_SET.has(s.teams[0])
    );
    if (confPI.length < 2) continue;

    // Latest game by date = Decider; earlier two = Round 1
    const byDate  = [...confPI].sort((a, b) => a.firstGameDate.localeCompare(b.firstGameDate));
    const decider = byDate[byDate.length - 1];
    const r1PI    = byDate.slice(0, byDate.length - 1);

    // Among Round 1 games, lowest min-seed = 7v8
    const minSeedOf = s => Math.min(...Object.values(s.seeds).filter(Boolean), 99);
    r1PI.sort((a, b) => minSeedOf(a) - minSeedOf(b));
    const game78 = r1PI[0];

    const w78  = game78 ? rawWinner(game78)  : null;
    const wDec = decider ? rawWinner(decider) : null;
    if (w78)  seedMap[w78]  = 7;   // winner of 7v8 → bracket seed 7
    if (wDec) seedMap[wDec] = 8;   // winner of decider → bracket seed 8

    // Only re-stamp seeds on R1 series — Play-In chips keep their original seeds
    for (const s of filteredSeries) {
      s.teams.forEach(t => { if (seedMap[t] != null) s.seeds[t] = seedMap[t]; });
    }
  }

  // Build play-in objects
  const playInSeries = playInSeriesList.map(s => {
    const completedStatuses = ['Final', 'F/OT', 'F/2OT', 'F/3OT'];
    const wins = {};
    s.teams.forEach(t => wins[t] = 0);
    for (const g of s.games) {
      if (!completedStatuses.includes(g.Status)) continue;
      if (g.HomeTeamScore > g.AwayTeamScore) wins[g.HomeTeam] = (wins[g.HomeTeam] || 0) + 1;
      else wins[g.AwayTeam] = (wins[g.AwayTeam] || 0) + 1;
    }
    const [t1, t2] = s.teams;
    const winner = (wins[t1] ?? 0) >= 1 ? t1 : t2;
    return {
      teams: s.teams,
      wins,
      seeds: s.seeds,
      games: s.games,
      gamesPlayed: s.games.filter(g => completedStatuses.includes(g.Status)).length,
      isComplete: s.games.some(g => g.Status === 'NotNecessary') || s.games.some(g => completedStatuses.includes(g.Status)),
      winner,
      firstGameDate: s.firstGameDate,
      isPlayIn: true,
    };
  });

  // Build series objects with wins, status, game #
  const series = filteredSeries.map(s => {
    const wins = {};
    s.teams.forEach(t => wins[t] = 0);
    const completedStatuses = ['Final', 'F/OT', 'F/2OT', 'F/3OT'];
    for (const g of s.games) {
      if (!completedStatuses.includes(g.Status)) continue;
      if (g.HomeTeamScore > g.AwayTeamScore) wins[g.HomeTeam] = (wins[g.HomeTeam] || 0) + 1;
      else wins[g.AwayTeam] = (wins[g.AwayTeam] || 0) + 1;
    }
    const [t1, t2] = s.teams;
    const isComplete = wins[t1] >= 4 || wins[t2] >= 4 ||
      s.games.some(g => g.Status === 'NotNecessary');
    const leader = wins[t1] >= wins[t2] ? t1 : t2;
    const trailer = leader === t1 ? t2 : t1;
    return {
      teams: s.teams,
      wins,
      seeds: s.seeds,
      games: s.games,
      gamesPlayed: s.games.filter(g => completedStatuses.includes(g.Status)).length,
      isComplete,
      leader,
      trailer,
      firstGameDate: s.firstGameDate,
    };
  });

  // Infer rounds by start date ordering (earliest = round 1)
  const sortedByDate = [...series].sort((a, b) => a.firstGameDate.localeCompare(b.firstGameDate));
  const rounds = [];
  let remaining = [...sortedByDate];
  const roundSizes = [8, 4, 2, 1];
  const roundNames = ['First Round', 'Conference Semifinals', 'Conference Finals', 'NBA Finals'];
  for (let i = 0; i < roundSizes.length && remaining.length > 0; i++) {
    const size = roundSizes[i];
    const chunk = remaining.splice(0, size);
    if (chunk.length > 0) rounds.push({ round: i + 1, name: roundNames[i], series: chunk });
  }

  return { rounds, playIn: playInSeries, totalSeries: series.length };
}
