import axios from 'axios';
import NodeCache from 'node-cache';

const cache = new NodeCache();

const client = axios.create({
  baseURL: 'https://api.sportsdata.io/v3/nba',
  params: { key: process.env.SPORTS_DATA_KEY },
});

async function apiFetch(path, ttl = 300) {
  const hit = cache.get(path);
  if (hit !== undefined) return hit;
  const { data } = await client.get(path);
  cache.set(path, data, ttl);
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
  return apiFetch(`/scores/json/Games/${season}`, 3600);
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
  // Build date range: Apr 15 → Jun 25 of the season year
  // Season 2025 = games played in 2024-25, playoffs in spring 2025
  const year = season; // season 2025 = calendar year 2025 for playoffs
  const months = ['APR','MAY','JUN'];
  const monthDays = { APR: 30, MAY: 31, JUN: 25 };
  const startDay =  { APR: 15, MAY: 1,  JUN: 1 };

  const playoffGames = [];
  for (const month of months) {
    const start = startDay[month];
    const end   = monthDays[month];
    // Fetch every day — results are cached 24h so cost is paid once
    for (let day = start; day <= end; day++) {
      const dateStr = `${year}-${month}-${String(day).padStart(2,'0')}`;
      try {
        const games = await apiFetch(`/scores/json/GamesByDate/${dateStr}`, 86400);
        playoffGames.push(...games.filter(g => g.SeasonType === 3));
      } catch (e) { /* skip */ }
    }
  }
  return playoffGames;
}

export async function getPlayoffBracket(season = 2025) {
  const playoffGames = await fetchPlayoffGames(season);

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
      };
    }
    seriesMap[key].games.push(g);
    if (g.Day < seriesMap[key].firstGameDate) seriesMap[key].firstGameDate = g.Day;
  }

  // Filter out Play-In series (only 1-2 games = not a best-of-7 series)
  const filteredSeries = Object.values(seriesMap).filter(s => s.games.length >= 3);

  // Build series objects with wins, status, game #
  const series = filteredSeries.map(s => {
    const wins = {};
    s.teams.forEach(t => wins[t] = 0);
    for (const g of s.games) {
      if (g.Status !== 'Final') continue;
      if (g.HomeTeamScore > g.AwayTeamScore) wins[g.HomeTeam] = (wins[g.HomeTeam] || 0) + 1;
      else wins[g.AwayTeam] = (wins[g.AwayTeam] || 0) + 1;
    }
    const [t1, t2] = s.teams;
    const isComplete = wins[t1] >= 4 || wins[t2] >= 4;
    const leader = wins[t1] >= wins[t2] ? t1 : t2;
    const trailer = leader === t1 ? t2 : t1;
    return {
      teams: s.teams,
      wins,
      gamesPlayed: s.games.filter(g => g.Status === 'Final').length,
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

  return { rounds, totalSeries: series.length };
}
