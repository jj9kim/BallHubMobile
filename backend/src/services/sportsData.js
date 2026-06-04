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
