/**
 * nbaApiService.js
 * Calls stats.nba.com directly (same endpoints as the nba_api Python library).
 * No API key needed. Player IDs are NBA.com IDs — headshots work natively.
 */

import axios from 'axios';
import NodeCache from 'node-cache';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(__dirname, '../../../cache_nba');
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const memCache = new NodeCache();

// ── NBA API client ────────────────────────────────────────────────────────────

const nbaClient = axios.create({
  baseURL: 'https://stats.nba.com',
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.nba.com/',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'x-nba-stats-origin': 'stats',
    'x-nba-stats-token': 'true',
    'Connection': 'keep-alive',
    'Host': 'stats.nba.com',
    'Origin': 'https://www.nba.com',
  },
});

const espnClient = axios.create({
  baseURL: 'https://site.api.espn.com',
  timeout: 10000,
});

// App abbreviation → ESPN team ID
const ESPN_TEAM_IDS = {
  ATL:1, BOS:2, NO:3, CHI:4, CLE:5, DAL:6, DEN:7, DET:8, GS:9,
  HOU:10, IND:11, LAC:12, LAL:13, MEM:29, MIA:14, MIL:15, MIN:16,
  BKN:17, NY:18, ORL:19, PHI:20, PHO:21, POR:22, SAC:23, SA:24,
  OKC:25, UTAH:26, WSH:27, TOR:28, CHA:30,
};

// ── Cache helpers ─────────────────────────────────────────────────────────────

function fileKey(key) {
  return key.replace(/[^a-zA-Z0-9]/g, '_') + '.json';
}

function readDisk(key, { allowStale = false } = {}) {
  const file = join(CACHE_DIR, fileKey(key));
  if (!existsSync(file)) return undefined;
  try {
    const { data, expires } = JSON.parse(readFileSync(file, 'utf8'));
    if (Date.now() < expires || allowStale) return data;
  } catch {}
  return undefined;
}

function writeDisk(key, data, ttl) {
  const file = join(CACHE_DIR, fileKey(key));
  try { writeFileSync(file, JSON.stringify({ data, expires: Date.now() + ttl * 1000 })); } catch {}
}

async function nbFetch(path, params = {}, ttl = 300, cacheKey = null) {
  const key = cacheKey ?? (path + JSON.stringify(params));

  const mem = memCache.get(key);
  if (mem !== undefined) return mem;

  const disk = readDisk(key);
  if (disk !== undefined) { memCache.set(key, disk, ttl); return disk; }

  try {
    const { data } = await nbaClient.get(path, { params });
    memCache.set(key, data, ttl);
    writeDisk(key, data, ttl);
    return data;
  } catch (err) {
    const stale = readDisk(key, { allowStale: true });
    if (stale !== undefined) { memCache.set(key, stale, 60); return stale; }
    throw err;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Parse NBA resultSet → array of objects
function parseRS(resultSets, name) {
  const rs = resultSets.find(r => r.name === name);
  if (!rs) return [];
  return rs.rowSet.map(row => {
    const obj = {};
    rs.headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

// "2025" or 2025 → "2025-26"
function toSeasonStr(season) {
  const y = parseInt(season);
  return `${y}-${String(y + 1).slice(2)}`;
}

// Current NBA season based on calendar date
function currentSeason() {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() + 1 >= 10 ? y : y - 1;
}

// NBA game ID is a 10-char zero-padded string e.g. "0022501234"
function fmtGameId(id) { return String(id).padStart(10, '0'); }

// Parse minutes "PT36M14.00S" or "36:14" → number
function parseMins(m) {
  if (!m) return 0;
  const pt = String(m).match(/PT(\d+)M/);
  if (pt) return parseInt(pt[1]);
  const colon = String(m).match(/^(\d+):/);
  if (colon) return parseInt(colon[1]);
  return parseFloat(m) || 0;
}

// Parse "W/L" record string "28-13" → { w, l }
function parseRecord(str) {
  if (!str) return { w: 0, l: 0 };
  const [w, l] = String(str).split('-').map(Number);
  return { w: w || 0, l: l || 0 };
}

// NBA tricode → frontend abbreviation (frontend uses NY, SA, PHO, GS)
const NBA_TO_APP = {
  NYK: 'NY', SAS: 'SA', PHX: 'PHO', GSW: 'GS',
};
function toAppAbbr(tricode) {
  return NBA_TO_APP[tricode] ?? tricode ?? '';
}

// Frontend abbreviation → NBA team ID
const TEAM_IDS = {
  ATL: 1610612737, BOS: 1610612738, BKN: 1610612751, CHA: 1610612766,
  CHI: 1610612741, CLE: 1610612739, DAL: 1610612742, DEN: 1610612743,
  DET: 1610612765, GS:  1610612744, GSW: 1610612744, HOU: 1610612745,
  IND: 1610612754, LAC: 1610612746, LAL: 1610612747, MEM: 1610612763,
  MIA: 1610612748, MIL: 1610612749, MIN: 1610612750, NOP: 1610612740,
  NY:  1610612752, OKC: 1610612760, ORL: 1610612753, PHI: 1610612755,
  PHO: 1610612756, POR: 1610612757, SAC: 1610612758, SA:  1610612759,
  TOR: 1610612761, UTA: 1610612762, WAS: 1610612764,
};

// NBA team ID → frontend abbreviation
const ID_TO_APP = Object.fromEntries(Object.entries(TEAM_IDS).map(([k, v]) => [v, k]));

function mapGameStatus(statusId, statusText) {
  if (statusId === 3 || String(statusText).toLowerCase().startsWith('final')) {
    return String(statusText).toLowerCase().includes('ot') ? 'F/OT' : 'Final';
  }
  if (statusId === 2) return 'InProgress';
  return 'Scheduled';
}

// ── ESPN API helpers ──────────────────────────────────────────────────────────

// ESPN team abbreviation → app abbreviation
const ESPN_TO_APP = {
  NYK: 'NY', SAS: 'SA', PHX: 'PHO', GSW: 'GS',
};
function espnToApp(abbr) { return ESPN_TO_APP[abbr] ?? abbr ?? ''; }

async function getEspnGamesByDate(date) {
  const espnDate = date.replace(/-/g, '');
  const cacheKey = `espn_scoreboard_${date}`;
  const isPast = new Date(date) < new Date(new Date().toDateString());
  const ttl = isPast ? 86400 * 30 : 60;

  const cached = readDisk(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const { data } = await espnClient.get(
      `/apis/site/v2/sports/basketball/nba/scoreboard`,
      { params: { dates: espnDate, limit: 20 } }
    );
    const events = data.events ?? [];
    const games = events.map(e => {
      const c = e.competitions?.[0] ?? {};
      const competitors = c.competitors ?? [];
      const away = competitors.find(t => t.homeAway === 'away');
      const home = competitors.find(t => t.homeAway === 'home');
      const statusType = c.status?.type ?? {};
      const isLive = statusType.state === 'in';
      const isFinal = statusType.completed === true;

      let status = 'Scheduled';
      if (isFinal) status = statusType.shortDetail?.toLowerCase().includes('ot') ? 'F/OT' : 'Final';
      else if (isLive) status = 'InProgress';

      const awayScore = away?.score != null ? parseInt(away.score) : null;
      const homeScore = home?.score != null ? parseInt(home.score) : null;

      const gameIdStr = e.id ?? '';
      // ESPN game IDs are numeric; use as-is for dedup but mark source
      return {
        GameID:               parseInt(gameIdStr) || 0,
        _espnId:              gameIdStr,
        _nbaId:               null,
        Season:               currentSeason(),
        SeasonType:           (e.season?.type === 3 || e.season?.type === 5) ? 3 : 1,
        Status:               status,
        Day:                  date,
        DateTime:             c.date ?? `${date}T00:00:00`,
        AwayTeam:             espnToApp(away?.team?.abbreviation ?? ''),
        HomeTeam:             espnToApp(home?.team?.abbreviation ?? ''),
        AwayTeamID:           away?.team?.id ? parseInt(away.team.id) : null,
        HomeTeamID:           home?.team?.id ? parseInt(home.team.id) : null,
        AwayTeamScore:        awayScore,
        HomeTeamScore:        homeScore,
        Quarter:              isLive ? String(c.status?.period ?? '') : null,
        TimeRemainingMinutes: null,
        TimeRemainingSeconds: null,
        Channel:              c.broadcasts?.[0]?.names?.[0] ?? null,
        Attendance:           null,
      };
    });

    if (games.length > 0 && (isFinalData(games) || isPast)) {
      writeDisk(cacheKey, games, ttl);
    }
    return games;
  } catch {
    return [];
  }
}

function isFinalData(games) {
  return games.length > 0 && games.every(g => g.Status === 'Final' || g.Status === 'F/OT');
}

// ESPN stat name → index in the stats array
const ESPN_STAT_NAMES = ['MIN','PTS','FG','3PT','FT','REB','AST','TO','STL','BLK','OREB','DREB','PF','+/-'];

function parseEspnStats(statsArr) {
  const idx = (name) => ESPN_STAT_NAMES.indexOf(name);
  const get = (arr, name) => arr[idx(name)] ?? '0';

  const parseFrac = (s) => {
    const [m, a] = String(s).split('-').map(Number);
    return { made: m || 0, att: a || 0 };
  };

  const fg  = parseFrac(get(statsArr, 'FG'));
  const tp  = parseFrac(get(statsArr, '3PT'));
  const ft  = parseFrac(get(statsArr, 'FT'));
  const mins = parseFloat(get(statsArr, 'MIN')) || 0;
  const pm = parseInt(get(statsArr, '+/-')) || 0;

  return {
    Minutes:                 mins,
    Points:                  parseInt(get(statsArr, 'PTS')) || 0,
    Rebounds:                parseInt(get(statsArr, 'REB')) || 0,
    OffensiveRebounds:       parseInt(get(statsArr, 'OREB')) || 0,
    DefensiveRebounds:       parseInt(get(statsArr, 'DREB')) || 0,
    Assists:                 parseInt(get(statsArr, 'AST')) || 0,
    Steals:                  parseInt(get(statsArr, 'STL')) || 0,
    BlockedShots:            parseInt(get(statsArr, 'BLK')) || 0,
    Turnovers:               parseInt(get(statsArr, 'TO')) || 0,
    PersonalFouls:           parseInt(get(statsArr, 'PF')) || 0,
    PlusMinus:               pm,
    FieldGoalsMade:          fg.made, FieldGoalsAttempted:     fg.att,
    FieldGoalsPercentage:    fg.att > 0 ? Math.round(fg.made / fg.att * 100) : 0,
    ThreePointersMade:       tp.made, ThreePointersAttempted:  tp.att,
    ThreePointersPercentage: tp.att > 0 ? Math.round(tp.made / tp.att * 100) : 0,
    FreeThrowsMade:          ft.made, FreeThrowsAttempted:     ft.att,
    FreeThrowsPercentage:    ft.att > 0 ? Math.round(ft.made / ft.att * 100) : 0,
    TrueShootingPercentage:  0, PlayerEfficiencyRating: 0, UsageRatePercentage: 0,
  };
}

export async function getEspnBoxScore(espnId) {
  const cacheKey = `espn_boxscore_${espnId}`;

  const cached = readDisk(cacheKey);
  if (cached !== undefined) return cached;

  const { data } = await espnClient.get(
    `/apis/site/v2/sports/basketball/nba/summary`,
    { params: { event: espnId } }
  );

  const bs = data.boxscore ?? {};
  const header = data.header ?? {};
  const comp = header.competitions?.[0] ?? {};
  const statusType = comp.status?.type ?? {};
  const isFinal = statusType.completed === true;
  const isLive  = statusType.state === 'in';

  let status = 'Scheduled';
  if (isFinal) status = statusType.shortDetail?.toLowerCase().includes('ot') ? 'F/OT' : 'Final';
  else if (isLive) status = 'InProgress';

  // Team info from boxscore
  const bsTeams = bs.teams ?? [];
  const awayBsTeam = bsTeams.find(t => t.homeAway === 'away') ?? bsTeams[0] ?? {};
  const homeBsTeam = bsTeams.find(t => t.homeAway === 'home') ?? bsTeams[1] ?? {};

  const awayAbbr = espnToApp(awayBsTeam.team?.abbreviation ?? '');
  const homeAbbr = espnToApp(homeBsTeam.team?.abbreviation ?? '');

  // Scores from header competitors
  const compTeams = comp.competitors ?? [];
  const awayComp = compTeams.find(t => t.homeAway === 'away') ?? {};
  const homeComp = compTeams.find(t => t.homeAway === 'home') ?? {};
  const awayScore = awayComp.score != null ? parseInt(awayComp.score) : null;
  const homeScore = homeComp.score != null ? parseInt(homeComp.score) : null;

  // Build team stats from totals row
  function buildTeamStats(bsTeam, abbr, score) {
    const statsGroup = bsTeam.statistics ?? [];
    const teamStats = {};
    statsGroup.forEach(stat => {
      const name = stat.name;
      const val = stat.displayValue ?? '';
      teamStats[name] = val;
    });
    const fg  = (teamStats['fieldGoalsMade-fieldGoalsAttempted'] ?? '0-0').split('-').map(Number);
    const tp  = (teamStats['threePointFieldGoalsMade-threePointFieldGoalsAttempted'] ?? '0-0').split('-').map(Number);
    const ft  = (teamStats['freeThrowsMade-freeThrowsAttempted'] ?? '0-0').split('-').map(Number);
    return {
      Team: abbr,
      Points:                  score != null ? score : (fg[0]*2 + tp[0] + ft[0]) || 0,
      FieldGoalsMade:          fg[0]||0, FieldGoalsAttempted: fg[1]||0,
      FieldGoalsPercentage:    fg[1]>0 ? Math.round(fg[0]/fg[1]*100) : 0,
      ThreePointersMade:       tp[0]||0, ThreePointersAttempted: tp[1]||0,
      ThreePointersPercentage: tp[1]>0 ? Math.round(tp[0]/tp[1]*100) : 0,
      FreeThrowsMade:          ft[0]||0, FreeThrowsAttempted: ft[1]||0,
      FreeThrowsPercentage:    ft[1]>0 ? Math.round(ft[0]/ft[1]*100) : 0,
      Rebounds:                parseInt(teamStats['totalRebounds'] ?? 0) || 0,
      OffensiveRebounds:       parseInt(teamStats['offensiveRebounds'] ?? 0) || 0,
      DefensiveRebounds:       parseInt(teamStats['defensiveRebounds'] ?? 0) || 0,
      Assists:                 parseInt(teamStats['assists'] ?? 0) || 0,
      Steals:                  parseInt(teamStats['steals'] ?? 0) || 0,
      BlockedShots:            parseInt(teamStats['blocks'] ?? 0) || 0,
      Turnovers:               parseInt(teamStats['turnovers'] ?? 0) || 0,
      PersonalFouls:           parseInt(teamStats['fouls'] ?? 0) || 0,
    };
  }

  // Build player stats
  const playerGroups = bs.players ?? [];
  const allPlayers = [];
  for (const group of playerGroups) {
    const teamAbbr = espnToApp(group.team?.abbreviation ?? '');
    const statsGroup = group.statistics?.[0] ?? {};
    const athletes = statsGroup.athletes ?? [];
    for (const a of athletes) {
      if (a.didNotPlay) continue;
      const stats = parseEspnStats(a.stats ?? []);
      if (stats.Minutes === 0) continue;
      const athlete = a.athlete ?? {};
      allPlayers.push({
        PlayerID:   athlete.id ? parseInt(athlete.id) : 0,
        Name:       athlete.displayName ?? '',
        PhotoUrl:   athlete.id ? `https://a.espncdn.com/i/headshots/nba/players/full/${athlete.id}.png` : null,
        Team:       teamAbbr,
        Position:   athlete.position?.abbreviation ?? '',
        Started:    a.starter ? 1 : 0,
        Games:      1,
        GameID:     parseInt(espnId),
        Opponent:   '',
        HomeOrAway: '',
        Day:        null,
        Season:     currentSeason(),
        DoubleDoubles: 0, TripleDoubles: 0,
        ...stats,
      });
    }
  }

  // Fill Opponent/HomeOrAway
  allPlayers.forEach(p => {
    p.Opponent   = p.Team === awayAbbr ? homeAbbr : awayAbbr;
    p.HomeOrAway = p.Team === homeAbbr ? 'HOME' : 'AWAY';
  });

  const gameDate = comp.date?.split('T')[0] ?? null;
  const seasonType = header.season?.type ?? 1;

  const result = {
    Game: {
      GameID: parseInt(espnId), _espnId: String(espnId),
      Status: status,
      Day: gameDate, DateTime: comp.date ?? null,
      AwayTeam: awayAbbr, HomeTeam: homeAbbr,
      AwayTeamScore: awayScore, HomeTeamScore: homeScore,
      Season: currentSeason(), SeasonType: (seasonType === 3 || seasonType === 5) ? 3 : 1,
      Quarter: null, TimeRemainingMinutes: null, TimeRemainingSeconds: null,
      Channel: null, Attendance: null,
    },
    PlayerGames: allPlayers,
    TeamGames:   [buildTeamStats(awayBsTeam, awayAbbr, awayScore), buildTeamStats(homeBsTeam, homeAbbr, homeScore)],
    HomeTeam:    { Team: homeAbbr, Players: allPlayers.filter(p => p.Team === homeAbbr) },
    AwayTeam:    { Team: awayAbbr, Players: allPlayers.filter(p => p.Team === awayAbbr) },
  };

  if (isFinal) writeDisk(cacheKey, result, 86400 * 30);
  return result;
}

// ── Games by date ─────────────────────────────────────────────────────────────

export async function getGamesByDate(date) {
  const isPast = new Date(date) < new Date(new Date().toDateString());

  // ESPN is primary source — reliable and not rate-limited
  const espnGames = await getEspnGamesByDate(date);
  if (espnGames.length > 0) {
    // Remove "Scheduled" games on past dates with no score (NotNecessary games)
    if (isPast) {
      return espnGames.filter(g => g.Status !== 'Scheduled' || g.AwayTeamScore != null);
    }
    return espnGames;
  }

  // For past dates, ESPN is authoritative — 0 games means it's a rest day
  if (isPast) return [];

  // Fallback to NBA scoreboardV2 if ESPN returns nothing (future dates only)
  const [scoreboardGames, playoffByDate] = await Promise.all([
    getScoreboardByDate(date),
    isPast ? getPlayoffGamesByDate(date) : Promise.resolve([]),
  ]);

  if (!isPast) return scoreboardGames;

  const merged = [...scoreboardGames];
  const seenIds = new Set(merged.map(g => g.GameID));
  for (const pg of playoffByDate) {
    if (!seenIds.has(pg.GameID)) {
      merged.push(pg);
    } else {
      const existing = merged.find(g => g.GameID === pg.GameID);
      if (existing && existing.AwayTeamScore == null && pg.AwayTeamScore != null) {
        existing.AwayTeamScore = pg.AwayTeamScore;
        existing.HomeTeamScore = pg.HomeTeamScore;
        existing.Status = 'Final';
      }
    }
  }

  const playoffIds = new Set(playoffByDate.map(g => g.GameID));
  return merged.filter(g => {
    if (g.Status !== 'Scheduled') return true;
    if (g.SeasonType !== 3) return true;
    return playoffIds.has(g.GameID);
  }).sort((a, b) => (a.DateTime ?? '').localeCompare(b.DateTime ?? ''));
}

// Build a date → playoff games lookup from the full season schedule
async function getPlayoffGamesByDate(date) {
  try {
    const season = currentSeason();
    const allPlayoff = await getSchedule(season);
    return allPlayoff.filter(g => g.Day === date);
  } catch {
    return [];
  }
}

async function getScoreboardByDate(date) {
  const [y, m, d] = date.split('-');
  const gameDate  = `${m}/${d}/${y}`;
  const cacheKey  = `scoreboard_${date}`;
  const isPast    = new Date(date) < new Date(new Date().toDateString());

  // Check if we have a stale "Scheduled" cache for a past date — delete it so we re-fetch
  if (isPast) {
    const cached = readDisk(cacheKey);
    if (cached) {
      const gh = cached.resultSets?.find(r => r.name === 'GameHeader');
      const allScheduled = gh?.rowSet?.every(row => row[3] === 1);
      if (allScheduled) {
        const cacheFile = join(CACHE_DIR, fileKey(cacheKey));
        if (existsSync(cacheFile)) unlinkSync(cacheFile);
        memCache.del(cacheKey);
      }
    }
  }

  const data = await nbFetch('/stats/scoreboardV2', {
    DayOffset: 0, GameDate: gameDate, LeagueID: '00',
  }, isPast ? 86400 * 30 : 60, cacheKey);

  // If past date still shows all Scheduled (NBA API not returning final scores), shorten TTL
  if (isPast) {
    const gh = data.resultSets?.find(r => r.name === 'GameHeader');
    const allScheduled = gh?.rowSet?.length > 0 && gh.rowSet.every(row => row[3] === 1);
    if (allScheduled) {
      memCache.set(cacheKey, data, 300);
      writeDisk(cacheKey, data, 300);
    }
  }

  const headers = parseRS(data.resultSets, 'GameHeader');
  const lines   = parseRS(data.resultSets, 'LineScore');

  const scoreMap = {};
  for (const l of lines) {
    if (!scoreMap[l.GAME_ID]) scoreMap[l.GAME_ID] = {};
    const hdr = headers.find(h => h.GAME_ID === l.GAME_ID);
    const isHome = Number(l.TEAM_ID) === Number(hdr?.HOME_TEAM_ID);
    scoreMap[l.GAME_ID][isHome ? 'home' : 'away'] = l.PTS;
  }

  return headers.map(h => {
    const scores  = scoreMap[h.GAME_ID] ?? {};
    const awayLine = lines.find(l => l.GAME_ID === h.GAME_ID && Number(l.TEAM_ID) === Number(h.VISITOR_TEAM_ID));
    const homeLine = lines.find(l => l.GAME_ID === h.GAME_ID && Number(l.TEAM_ID) === Number(h.HOME_TEAM_ID));
    const awayA = (awayLine ? toAppAbbr(awayLine.TEAM_ABBREVIATION) : null) ?? ID_TO_APP[Number(h.VISITOR_TEAM_ID)] ?? '';
    const homeA = (homeLine ? toAppAbbr(homeLine.TEAM_ABBREVIATION) : null) ?? ID_TO_APP[Number(h.HOME_TEAM_ID)] ?? '';

    let quarter = null, minsLeft = null, secsLeft = null;
    if (h.GAME_STATUS_ID === 2) {
      quarter = String(h.LIVE_PERIOD ?? '');
      const parts = String(h.LIVE_PC_TIME ?? '').match(/(\d+):(\d+)/);
      if (parts) { minsLeft = parseInt(parts[1]); secsLeft = parseInt(parts[2]); }
    }

    return {
      GameID:               parseInt(h.GAME_ID),
      _nbaId:               h.GAME_ID,
      Season:               parseInt(String(h.SEASON ?? currentSeason())),
      SeasonType:           h.GAME_ID.startsWith('004') || h.GAME_ID.startsWith('005') ? 3 : 1,
      Status:               mapGameStatus(h.GAME_STATUS_ID, h.GAME_STATUS_TEXT),
      Day:                  date,
      DateTime:             `${date}T00:00:00`,
      AwayTeam:             awayA,
      HomeTeam:             homeA,
      AwayTeamID:           Number(h.VISITOR_TEAM_ID),
      HomeTeamID:           Number(h.HOME_TEAM_ID),
      AwayTeamScore:        scores.away ?? null,
      HomeTeamScore:        scores.home ?? null,
      Quarter:              quarter,
      TimeRemainingMinutes: minsLeft,
      TimeRemainingSeconds: secsLeft,
      Channel:              h.NATL_TV_BROADCASTER_ABBREVIATION ?? null,
      Attendance:           null,
    };
  });
}

export async function getGameById(gameId) {
  // Try to find in today/yesterday/tomorrow scoreboard
  const today = new Date();
  for (let offset = 0; offset <= 3; offset++) {
    for (const sign of [0, -1, 1]) {
      const d = new Date(today);
      d.setDate(d.getDate() + sign * offset);
      const dateStr = d.toISOString().split('T')[0];
      try {
        const games = await getGamesByDate(dateStr);
        const found = games.find(g => g.GameID === Number(gameId));
        if (found) return found;
      } catch {}
    }
  }
  return null;
}

export async function getLiveGames() {
  const today = new Date().toISOString().split('T')[0];
  const games = await getGamesByDate(today);
  return games.filter(g => g.Status === 'InProgress');
}

async function getEspnTeamRegularSeason(appAbbr, espnSeason) {
  const espnId = ESPN_TEAM_IDS[appAbbr];
  if (!espnId) return [];
  const cacheKey = `espn_team_reg_${appAbbr}_${espnSeason}`;
  const cached = readDisk(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const { data } = await espnClient.get(
      `/apis/site/v2/sports/basketball/nba/teams/${espnId}/schedule`,
      { params: { season: espnSeason, seasontype: 2 } }
    );
    const events = data.events ?? [];
    const games = [];
    for (const e of events) {
      const c = e.competitions?.[0] ?? {};
      const competitors = c.competitors ?? [];
      const away = competitors.find(t => t.homeAway === 'away');
      const home = competitors.find(t => t.homeAway === 'home');
      const statusType = c.status?.type ?? {};
      const isFinal = statusType.completed === true;
      const isLive  = statusType.state === 'in';
      let status = 'Scheduled';
      if (isFinal) status = statusType.shortDetail?.toLowerCase().includes('ot') ? 'F/OT' : 'Final';
      else if (isLive) status = 'InProgress';
      const awayScore = away?.score != null ? parseInt(away.score) : null;
      const homeScore = home?.score != null ? parseInt(home.score) : null;
      const gameDate = c.date?.split('T')[0] ?? null;
      games.push({
        GameID:        parseInt(e.id) || 0,
        _espnId:       String(e.id),
        _nbaId:        null,
        Season:        espnSeason - 1,
        SeasonType:    1,
        Status:        status,
        Day:           gameDate,
        DateTime:      c.date ?? null,
        AwayTeam:      espnToApp(away?.team?.abbreviation ?? ''),
        HomeTeam:      espnToApp(home?.team?.abbreviation ?? ''),
        AwayTeamScore: awayScore,
        HomeTeamScore: homeScore,
        Quarter: null, TimeRemainingMinutes: null, TimeRemainingSeconds: null,
        Channel: null, Attendance: null,
      });
    }
    writeDisk(cacheKey, games, 86400 * 30);
    return games;
  } catch {
    return [];
  }
}

// ── Team schedule ─────────────────────────────────────────────────────────────

export async function getTeamSchedule(season, teamAbbr) {
  season = parseInt(season);
  const teamId = TEAM_IDS[teamAbbr];
  if (!teamId) return [];
  const seasonStr = toSeasonStr(season);
  const appAbbr = toAppAbbr(teamAbbr);

  // Regular season: use NBA API if cached, otherwise go straight to ESPN
  let reg = [];
  const regCacheKey = `schedule_reg_${teamAbbr}_${season}`;
  const hasNbaCache = readDisk(regCacheKey) !== undefined;
  if (hasNbaCache) try {
    const regData = await nbFetch('/stats/leaguegamefinder', {
      PlayerOrTeam: 'T', TeamID: teamId,
      Season: seasonStr, SeasonType: 'Regular Season', LeagueID: '00',
    }, 86400, `schedule_reg_${teamAbbr}_${season}`);

    const mapRow = (row) => {
      const isHome   = row.MATCHUP?.includes('vs.');
      const oppMatch = row.MATCHUP?.match(/(?:vs\.|@)\s+(\S+)/);
      const oppAbbr  = oppMatch ? toAppAbbr(oppMatch[1]) : '';
      const wl       = row.WL;
      const myScore  = row.PTS;
      const oppScore = wl === 'W' ? (myScore - (row.PLUS_MINUS ?? 0)) : (myScore + (row.PLUS_MINUS ?? 0));
      return {
        GameID: parseInt(row.GAME_ID), _nbaId: row.GAME_ID,
        Season: season, SeasonType: 1,
        Status: row.GAME_DATE ? 'Final' : 'Scheduled',
        Day: row.GAME_DATE ?? null,
        DateTime: row.GAME_DATE ? `${row.GAME_DATE}T00:00:00` : null,
        AwayTeam:      isHome ? oppAbbr : appAbbr,
        HomeTeam:      isHome ? appAbbr  : oppAbbr,
        AwayTeamScore: isHome ? oppScore : myScore,
        HomeTeamScore: isHome ? myScore  : oppScore,
        Quarter: null, TimeRemainingMinutes: null, TimeRemainingSeconds: null,
        Channel: null, Attendance: null,
      };
    };
    reg = parseRS(regData.resultSets, 'LeagueGameFinderResults').map(mapRow);
  } catch {}

  // If NBA API failed or returned nothing, fall back to ESPN team schedule
  if (reg.length === 0) {
    reg = await getEspnTeamRegularSeason(appAbbr, season + 1);
  }

  // Playoff + play-in: use ESPN-sourced schedule (accurate scores)
  const allPlayoff = await getSchedule(season).catch(() => []);
  const playoffs = allPlayoff.filter(g =>
    g.AwayTeam === appAbbr || g.HomeTeam === appAbbr
  );

  // Merge: prefer ESPN playoff data over any stale NBA reg-season playoff entries
  const playoffGameIds = new Set(playoffs.map(g => g.GameID));
  const regFiltered = reg.filter(g => !playoffGameIds.has(g.GameID));

  return [...regFiltered, ...playoffs].sort((a, b) => (a.Day ?? '').localeCompare(b.Day ?? ''));
}

// Build an array of YYYY-MM-DD strings for every day in [startDate, endDate]
function dateRange(startDate, endDate) {
  const dates = [];
  const cur = new Date(startDate + 'T12:00:00Z');
  const end = new Date(endDate + 'T12:00:00Z');
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

export async function getSchedule(season) {
  season = parseInt(season);
  // Build playoff + play-in schedule entirely from ESPN data.
  // ESPN is authoritative; NBA API has been returning stale/wrong data.
  const isCurrentSeason = season === currentSeason();

  // Playoff window: late April → mid-June
  const startDate = `${season + 1}-04-12`;
  const endDate   = isCurrentSeason
    ? new Date().toISOString().split('T')[0]
    : `${season + 1}-06-22`;

  const allDates = dateRange(startDate, endDate);

  // Fetch any dates not yet in ESPN cache, in parallel batches
  const missing = allDates.filter(date => readDisk(`espn_scoreboard_${date}`) === undefined);

  if (missing.length > 0) {
    // Fetch in parallel (ESPN handles it fine)
    await Promise.all(missing.map(date => getEspnGamesByDate(date).catch(() => [])));
  }

  // Scan all ESPN scoreboard cache files for this season's playoff/playin games
  const seen = new Set();
  const games = [];

  for (const date of allDates) {
    const cached = readDisk(`espn_scoreboard_${date}`);
    if (!cached) continue;
    for (const g of cached) {
      if (g.SeasonType !== 3) continue;          // only playoff/playin
      if (g.Status === 'Scheduled') continue;    // skip unplayed
      if (seen.has(g.GameID)) continue;
      seen.add(g.GameID);
      games.push(g);
    }
  }

  return games.sort((a, b) => (a.Day ?? '').localeCompare(b.Day ?? ''));
}

// ── Box score ─────────────────────────────────────────────────────────────────

export async function getBoxScore(gameId) {
  // ESPN IDs are 9 digits (e.g. 401859963); NBA IDs start with 002/004 (10 digits)
  // If the ID doesn't look like an NBA game ID, use ESPN box score
  const idStr = String(gameId);
  const looksLikeNba = idStr.length === 10 || idStr.startsWith('002') || idStr.startsWith('004') || idStr.startsWith('005');
  if (!looksLikeNba) {
    return getEspnBoxScore(gameId);
  }

  const nbaId = fmtGameId(gameId);
  const ttl = 86400 * 30; // final scores never change

  const params = {
    GameID: nbaId,
    StartPeriod: 1, EndPeriod: 10,
    StartRange: 0, EndRange: 0, RangeType: 0,
  };

  const data = await nbFetch('/stats/boxscoretraditionalv2', params, ttl, `boxscore_v2_${nbaId}`);

  const players  = parseRS(data.resultSets, 'PlayerStats');
  const teamRows = parseRS(data.resultSets, 'TeamStats');
  if (!players.length) throw new Error(`Box score not found for game ${gameId}`);

  // Map abbreviation from first player row
  const awayAbbr = toAppAbbr(players.find(p => p.TEAM_ABBREVIATION)?.TEAM_ABBREVIATION ?? '');
  const gameRow  = data.resultSets.find(r => r.name === 'GameSummary');
  const gameSummary = gameRow ? parseRS(data.resultSets, 'GameSummary')[0] : null;

  function mapPlayer(p) {
    const played = p.MIN && String(p.MIN).trim() !== '' && String(p.MIN) !== '0:00';
    const mins   = parseFloat(String(p.MIN ?? '').replace(':', '.')) || 0;
    const teamAbbr = toAppAbbr(p.TEAM_ABBREVIATION ?? '');
    return {
      PlayerID:                p.PLAYER_ID,
      Name:                    p.PLAYER_NAME ?? '',
      Team:                    teamAbbr,
      Position:                p.START_POSITION ?? '',
      Started:                 p.START_POSITION && p.START_POSITION.trim() !== '' ? 1 : 0,
      Games:                   played ? 1 : 0,
      Minutes:                 mins,
      Points:                  p.PTS  ?? 0,
      Rebounds:                p.REB  ?? 0,
      OffensiveRebounds:       p.OREB ?? 0,
      DefensiveRebounds:       p.DREB ?? 0,
      Assists:                 p.AST  ?? 0,
      Steals:                  p.STL  ?? 0,
      BlockedShots:            p.BLK  ?? 0,
      Turnovers:               p.TO   ?? 0,
      FieldGoalsMade:          p.FGM  ?? 0,
      FieldGoalsAttempted:     p.FGA  ?? 0,
      FieldGoalsPercentage:    p.FG_PCT ?? 0,
      ThreePointersMade:       p.FG3M ?? 0,
      ThreePointersAttempted:  p.FG3A ?? 0,
      ThreePointersPercentage: p.FG3_PCT ?? 0,
      FreeThrowsMade:          p.FTM  ?? 0,
      FreeThrowsAttempted:     p.FTA  ?? 0,
      FreeThrowsPercentage:    p.FT_PCT ?? 0,
      PlusMinus:               p.PLUS_MINUS ?? 0,
      PersonalFouls:           p.PF   ?? 0,
      TrueShootingPercentage:  0, PlayerEfficiencyRating: 0,
      GameID: parseInt(nbaId),
      Opponent: '',
      HomeOrAway: '',
      Day: null, Season: currentSeason(),
    };
  }

  function mapTeamStats(t) {
    const fgm = t.FGM ?? 0, fga = t.FGA ?? 0;
    const tpm = t.FG3M ?? 0, tpa = t.FG3A ?? 0;
    const ftm = t.FTM ?? 0, fta = t.FTA ?? 0;
    return {
      Team:                    toAppAbbr(t.TEAM_ABBREVIATION ?? ''),
      Points:                  t.PTS  ?? 0,
      FieldGoalsMade:          fgm, FieldGoalsAttempted:     fga,
      FieldGoalsPercentage:    fga > 0 ? Math.round(fgm / fga * 100) : 0,
      ThreePointersMade:       tpm, ThreePointersAttempted:  tpa,
      ThreePointersPercentage: tpa > 0 ? Math.round(tpm / tpa * 100) : 0,
      FreeThrowsMade:          ftm, FreeThrowsAttempted:     fta,
      FreeThrowsPercentage:    fta > 0 ? Math.round(ftm / fta * 100) : 0,
      Rebounds:                t.REB  ?? 0,
      OffensiveRebounds:       t.OREB ?? 0,
      DefensiveRebounds:       t.DREB ?? 0,
      Assists:                 t.AST  ?? 0,
      Steals:                  t.STL  ?? 0,
      BlockedShots:            t.BLK  ?? 0,
      Turnovers:               t.TO   ?? 0,
      PersonalFouls:           t.PF   ?? 0,
    };
  }

  const allPlayers = players.map(mapPlayer);
  const teamAbbrs  = [...new Set(allPlayers.map(p => p.Team))];
  const awayTeam   = teamAbbrs[0] ?? '';
  const homeTeam   = teamAbbrs[1] ?? '';

  // Fill in Opponent/HomeOrAway
  allPlayers.forEach(p => {
    p.Opponent   = p.Team === awayTeam ? homeTeam : awayTeam;
    p.HomeOrAway = p.Team === homeTeam ? 'HOME' : 'AWAY';
  });

  const awayScore = teamRows.find(t => toAppAbbr(t.TEAM_ABBREVIATION) === awayTeam)?.PTS ?? null;
  const homeScore = teamRows.find(t => toAppAbbr(t.TEAM_ABBREVIATION) === homeTeam)?.PTS ?? null;

  return {
    Game: {
      GameID:         parseInt(nbaId),
      Status:         awayScore != null ? 'Final' : 'Scheduled',
      Day:            null,
      DateTime:       null,
      AwayTeam:       awayTeam,
      HomeTeam:       homeTeam,
      AwayTeamScore:  awayScore,
      HomeTeamScore:  homeScore,
      Season:         currentSeason(),
      SeasonType:     nbaId.startsWith('004') ? 3 : 1,
      Quarter:        null, TimeRemainingMinutes: null, TimeRemainingSeconds: null,
      Channel: null, Attendance: null,
    },
    PlayerGames: allPlayers,
    TeamGames:   teamRows.map(mapTeamStats),
    HomeTeam:    { Team: homeTeam, Players: allPlayers.filter(p => p.Team === homeTeam) },
    AwayTeam:    { Team: awayTeam, Players: allPlayers.filter(p => p.Team === awayTeam) },
  };
}

// ── Standings ─────────────────────────────────────────────────────────────────

export async function getStandings(season = currentSeason()) {
  const seasonStr = toSeasonStr(season);
  const data = await nbFetch('/stats/leaguestandingsv3', {
    LeagueID: '00', Season: seasonStr, SeasonType: 'Regular Season',
  }, 900, `standings_${season}`);

  const rows = parseRS(data.resultSets, 'Standings');

  return rows.map(r => {
    const home  = parseRecord(r.HOME);
    const road  = parseRecord(r.ROAD);
    const l10   = parseRecord(r.L10);
    const streak = String(r.strCurrentStreak ?? '').replace(' ', ''); // "W 4" → "W4"

    return {
      Season:             season,
      TeamID:             r.TeamID,
      Key:                ID_TO_APP[r.TeamID] ?? toAppAbbr(r.TeamSlug?.toUpperCase() ?? ''),
      City:               r.TeamCity ?? '',
      Name:               r.TeamName ?? '',
      Conference:         r.Conference ?? '',
      Division:           r.Division ?? '',
      Wins:               r.WINS ?? 0,
      Losses:             r.LOSSES ?? 0,
      Percentage:         r.WinPCT ?? 0,
      GamesBack:          parseFloat(r.ConferenceGamesBack ?? 0),
      StreakDescription:  streak,
      PointsPerGameFor:   r.PointsPG ?? 0,
      PointsPerGameAgainst: r.OppPointsPG ?? 0,
      HomeWins:           home.w, HomeLosses: home.l,
      AwayWins:           road.w, AwayLosses: road.l,
      LastTenWins:        l10.w,  LastTenLosses: l10.l,
      ConferenceRank:     r.PlayoffRank ?? 0,
    };
  });
}

// ── Teams ─────────────────────────────────────────────────────────────────────

export async function getAllTeams() {
  const standings = await getStandings();
  return standings.map(t => ({
    TeamID:     t.TeamID,
    Key:        t.Key,
    City:       t.City,
    Name:       t.Name,
    Conference: t.Conference,
    Division:   t.Division,
    WikipediaLogoUrl: `https://cdn.nba.com/logos/nba/${t.TeamID}/global/L/logo.svg`,
  }));
}

export async function getTeamRoster(teamAbbr) {
  const teamId = TEAM_IDS[teamAbbr];
  if (!teamId) return [];
  const seasonStr = toSeasonStr(currentSeason());
  const data = await nbFetch('/stats/commonteamroster', {
    Season: seasonStr, TeamID: teamId,
  }, 86400, `roster_${teamAbbr}`);

  const rows = parseRS(data.resultSets, 'CommonTeamRoster');

  return rows.map(p => ({
    PlayerID:    p.PLAYER_ID,
    FirstName:   p.PLAYER?.split(' ')[0] ?? '',
    LastName:    p.PLAYER?.split(' ').slice(1).join(' ') ?? '',
    Team:        teamAbbr,
    TeamID:      teamId,
    Position:    p.POSITION ?? '',
    Jersey:      parseInt(p.NUM) || 0,
    Height:      parseHeight(p.HEIGHT),
    Weight:      parseInt(p.WEIGHT) || 0,
    BirthDate:   p.BIRTH_DATE ?? null,
    BirthCity:   '',
    BirthState:  '',
    BirthCountry: '',
    College:     p.SCHOOL ?? null,
    Experience:  parseInt(p.EXP) || 0,
    Salary:      0,
    Status:      'Active',
    PhotoUrl:    `https://cdn.nba.com/headshots/nba/latest/1040x760/${p.PLAYER_ID}.png`,
    UsaTodayHeadshotUrl: null,
    NbaDotComPlayerID: p.PLAYER_ID,
  }));
}

function parseHeight(h) {
  if (!h) return 0;
  const parts = String(h).split('-');
  if (parts.length === 2) return parseInt(parts[0]) * 12 + parseInt(parts[1]);
  return parseInt(h) || 0;
}

// ── Players ───────────────────────────────────────────────────────────────────

export async function getAllPlayers() {
  const seasonStr = toSeasonStr(currentSeason());
  const data = await nbFetch('/stats/commonallplayers', {
    LeagueID: '00', Season: seasonStr, IsOnlyCurrentSeason: 1,
  }, 86400, `allplayers_${currentSeason()}`);

  const rows = parseRS(data.resultSets, 'CommonAllPlayers');

  return rows.map(p => ({
    PlayerID:    p.PERSON_ID,
    FirstName:   p.DISPLAY_FIRST_LAST?.split(' ')[0] ?? '',
    LastName:    p.DISPLAY_FIRST_LAST?.split(' ').slice(1).join(' ') ?? '',
    Team:        toAppAbbr(p.TEAM_ABBREVIATION ?? ''),
    TeamID:      p.TEAM_ID ?? 0,
    Position:    '',
    Jersey:      0,
    Height:      0,
    Weight:      0,
    BirthDate:   null,
    College:     p.FROM_YEAR ? null : null,
    Experience:  0, Salary: 0,
    Status:      'Active',
    PhotoUrl:    `https://cdn.nba.com/headshots/nba/latest/1040x760/${p.PERSON_ID}.png`,
    NbaDotComPlayerID: p.PERSON_ID,
  }));
}

export async function getPlayerById(playerId) {
  const data = await nbFetch('/stats/commonplayerinfo', {
    PlayerID: playerId,
  }, 86400, `player_${playerId}`);

  const rows = parseRS(data.resultSets, 'CommonPlayerInfo');
  if (!rows.length) return null;
  const p = rows[0];

  return {
    PlayerID:    p.PERSON_ID,
    FirstName:   p.FIRST_NAME ?? '',
    LastName:    p.LAST_NAME ?? '',
    Team:        toAppAbbr(p.TEAM_ABBREVIATION ?? ''),
    TeamID:      p.TEAM_ID ?? 0,
    Position:    p.POSITION ?? '',
    Jersey:      parseInt(p.JERSEY) || 0,
    Height:      parseHeight(p.HEIGHT),
    Weight:      parseInt(p.WEIGHT) || 0,
    BirthDate:   p.BIRTHDATE?.split('T')[0] ?? null,
    BirthCity:   p.BIRTHCITY ?? '',
    BirthState:  p.BIRTHSTATE ?? '',
    BirthCountry: p.COUNTRY ?? '',
    College:     p.SCHOOL ?? null,
    Experience:  parseInt(p.SEASON_EXP) || 0,
    Salary:      0,
    Status:      p.ROSTERSTATUS ?? 'Active',
    PhotoUrl:    `https://cdn.nba.com/headshots/nba/latest/1040x760/${p.PERSON_ID}.png`,
    NbaDotComPlayerID: p.PERSON_ID,
  };
}

// ── Player game logs ──────────────────────────────────────────────────────────

export async function getPlayerGameLogs(season, playerId) {
  const seasonStr = toSeasonStr(season);
  const data = await nbFetch('/stats/playergamelog', {
    PlayerID: playerId, Season: seasonStr, SeasonType: 'Regular Season',
  }, 3600, `gamelogs_${playerId}_${season}`);

  const rows = parseRS(data.resultSets, 'PlayerGameLog');

  return rows.map(r => ({
    PlayerID:                playerId,
    Season:                  season,
    GameID:                  parseInt(r.Game_ID),
    Opponent:                r.MATCHUP?.split(' ').pop() ?? '',
    HomeOrAway:              r.MATCHUP?.includes('vs.') ? 'HOME' : 'AWAY',
    Day:                     r.GAME_DATE ?? null,
    Started:                 1,
    Games:                   1,
    Minutes:                 parseFloat(r.MIN) || 0,
    Points:                  r.PTS ?? 0,
    Rebounds:                r.REB ?? 0,
    Assists:                 r.AST ?? 0,
    Steals:                  r.STL ?? 0,
    BlockedShots:            r.BLK ?? 0,
    Turnovers:               r.TOV ?? 0,
    FieldGoalsMade:          r.FGM ?? 0,
    FieldGoalsAttempted:     r.FGA ?? 0,
    FieldGoalsPercentage:    r.FG_PCT ?? 0,
    ThreePointersMade:       r.FG3M ?? 0,
    ThreePointersAttempted:  r.FG3A ?? 0,
    ThreePointersPercentage: r.FG3_PCT ?? 0,
    FreeThrowsMade:          r.FTM ?? 0,
    FreeThrowsAttempted:     r.FTA ?? 0,
    FreeThrowsPercentage:    r.FT_PCT ?? 0,
    PlusMinus:               r.PLUS_MINUS ?? 0,
    TrueShootingPercentage:  0,
    PlayerEfficiencyRating:  0,
    DoubleDoubles:           0, TripleDoubles: 0,
  }));
}

// ── Player season stats ───────────────────────────────────────────────────────

export async function getPlayerSeasonStats(season, playerId) {
  const seasonStr = toSeasonStr(season);
  const data = await nbFetch('/stats/leaguedashplayerstats', {
    Season: seasonStr, SeasonType: 'Regular Season',
    PerMode: 'PerGame', LeagueID: '00',
  }, 3600, `seasonstats_all_${season}`);

  const rows = parseRS(data.resultSets, 'LeagueDashPlayerStats');
  const r = rows.find(p => p.PLAYER_ID === Number(playerId));
  if (!r) return null;

  return {
    PlayerID:                Number(playerId),
    Season:                  Number(season),
    Games:                   r.GP ?? 0,
    Minutes:                 r.MIN ?? 0,
    Points:                  r.PTS ?? 0,
    Rebounds:                r.REB ?? 0,
    Assists:                 r.AST ?? 0,
    Steals:                  r.STL ?? 0,
    BlockedShots:            r.BLK ?? 0,
    Turnovers:               r.TOV ?? 0,
    FieldGoalsPercentage:    r.FG_PCT ?? 0,
    ThreePointersPercentage: r.FG3_PCT ?? 0,
    FreeThrowsPercentage:    r.FT_PCT ?? 0,
    TrueShootingPercentage:  0,
    PlayerEfficiencyRating:  0,
    UsageRatePercentage:     0,
    PlusMinus:               r.PLUS_MINUS ?? 0,
    DoubleDoubles:           r.DD2 ?? 0,
    TripleDoubles:           r.TD3 ?? 0,
  };
}

export async function getAllPlayerSeasonStats(season) {
  const seasonStr = toSeasonStr(season);
  const data = await nbFetch('/stats/leaguedashplayerstats', {
    Season: seasonStr, SeasonType: 'Regular Season',
    PerMode: 'PerGame', LeagueID: '00',
  }, 3600, `seasonstats_all_${season}`);
  return parseRS(data.resultSets, 'LeagueDashPlayerStats');
}

// ── NBA ID map ────────────────────────────────────────────────────────────────
// NBA player IDs ARE NBA.com IDs — return identity map so headshots work natively

export async function getNbaIdMap() {
  const players = await getAllPlayers();
  const map = {};
  for (const p of players) {
    if (p.PlayerID) map[p.PlayerID] = p.PlayerID;
  }
  return map;
}

// ── Playoffs ──────────────────────────────────────────────────────────────────

export async function getPlayoffBracket(season = currentSeason()) {
  const [playoffGames, standingsData] = await Promise.all([
    getSchedule(season),
    getStandings(season),
  ]);

  const seedMap = {};
  const east = standingsData.filter(t => t.Conference === 'East').sort((a, b) => b.Percentage - a.Percentage);
  const west = standingsData.filter(t => t.Conference === 'West').sort((a, b) => b.Percentage - a.Percentage);
  east.forEach((t, i) => { seedMap[t.Key] = i + 1; seedMap[toAppAbbr(t.Key)] = i + 1; });
  west.forEach((t, i) => { seedMap[t.Key] = i + 1; seedMap[toAppAbbr(t.Key)] = i + 1; });

  const seriesMap = {};
  for (const g of playoffGames) {
    const key = [g.AwayTeam, g.HomeTeam].sort().join('-');
    if (!seriesMap[key]) {
      seriesMap[key] = { teams: [g.AwayTeam, g.HomeTeam].sort(), games: [], firstGameDate: g.Day, seeds: {} };
    }
    seriesMap[key].games.push(g);
    if (g.Day < seriesMap[key].firstGameDate) seriesMap[key].firstGameDate = g.Day;
    if (seedMap[g.AwayTeam]) seriesMap[key].seeds[g.AwayTeam] = seedMap[g.AwayTeam];
    if (seedMap[g.HomeTeam]) seriesMap[key].seeds[g.HomeTeam] = seedMap[g.HomeTeam];
  }

  const allSeriesList = Object.values(seriesMap);

  function isPlayIn(s) {
    const seedVals = Object.values(s.seeds);
    if (seedVals.length >= 2) return Math.min(...seedVals) >= 7;
    return s.games.length <= 2;
  }

  const playInSeriesList = allSeriesList.filter(s => isPlayIn(s));
  const filteredSeries   = allSeriesList.filter(s => !isPlayIn(s));

  const DONE     = ['Final', 'F/OT', 'F/2OT', 'F/3OT'];
  const EAST_SET = new Set(['ATL','BOS','BKN','CHA','CHI','CLE','DET','IND','MIA','MIL','NY','ORL','PHI','TOR','WAS']);

  function rawWinner(s) {
    const wins = {};
    s.teams.forEach(t => wins[t] = 0);
    for (const g of s.games) {
      if (!DONE.includes(g.Status)) continue;
      if (g.HomeTeamScore > g.AwayTeamScore) wins[g.HomeTeam] = (wins[g.HomeTeam] || 0) + 1;
      else wins[g.AwayTeam] = (wins[g.AwayTeam] || 0) + 1;
    }
    if (!s.games.some(g => DONE.includes(g.Status))) return null;
    const [t1, t2] = s.teams;
    return (wins[t1] ?? 0) >= (wins[t2] ?? 0) ? t1 : t2;
  }

  for (const conf of ['east', 'west']) {
    const confPI = playInSeriesList.filter(s =>
      conf === 'east' ? EAST_SET.has(s.teams[0]) : !EAST_SET.has(s.teams[0])
    );
    if (confPI.length < 2) continue;
    const byDate  = [...confPI].sort((a, b) => (a.firstGameDate ?? '').localeCompare(b.firstGameDate ?? ''));
    const decider = byDate[byDate.length - 1];
    const r1PI    = byDate.slice(0, byDate.length - 1);
    const minSeedOf = s => Math.min(...Object.values(s.seeds).filter(Boolean), 99);
    r1PI.sort((a, b) => minSeedOf(a) - minSeedOf(b));
    const w78  = r1PI[0]  ? rawWinner(r1PI[0])  : null;
    const wDec = decider   ? rawWinner(decider)   : null;
    if (w78)  seedMap[w78]  = 7;
    if (wDec) seedMap[wDec] = 8;
    for (const s of filteredSeries) {
      s.teams.forEach(t => { if (seedMap[t] != null) s.seeds[t] = seedMap[t]; });
    }
  }

  const playInSeries = playInSeriesList.map(s => {
    const wins = {};
    s.teams.forEach(t => wins[t] = 0);
    for (const g of s.games) {
      if (!DONE.includes(g.Status)) continue;
      if (g.HomeTeamScore > g.AwayTeamScore) wins[g.HomeTeam] = (wins[g.HomeTeam] || 0) + 1;
      else wins[g.AwayTeam] = (wins[g.AwayTeam] || 0) + 1;
    }
    const [t1, t2] = s.teams;
    return {
      teams: s.teams, wins, seeds: s.seeds, games: s.games,
      gamesPlayed: s.games.filter(g => DONE.includes(g.Status)).length,
      isComplete: s.games.some(g => DONE.includes(g.Status)),
      winner: (wins[t1] ?? 0) >= 1 ? t1 : t2,
      firstGameDate: s.firstGameDate, isPlayIn: true,
    };
  });

  const series = filteredSeries.map(s => {
    const wins = {};
    s.teams.forEach(t => wins[t] = 0);
    for (const g of s.games) {
      if (!DONE.includes(g.Status)) continue;
      if (g.HomeTeamScore > g.AwayTeamScore) wins[g.HomeTeam] = (wins[g.HomeTeam] || 0) + 1;
      else wins[g.AwayTeam] = (wins[g.AwayTeam] || 0) + 1;
    }
    const [t1, t2] = s.teams;
    const isComplete = wins[t1] >= 4 || wins[t2] >= 4;
    return {
      teams: s.teams, wins, seeds: s.seeds, games: s.games,
      gamesPlayed: s.games.filter(g => DONE.includes(g.Status)).length,
      isComplete, leader: wins[t1] >= wins[t2] ? t1 : t2,
      trailer: wins[t1] >= wins[t2] ? t2 : t1, firstGameDate: s.firstGameDate,
    };
  });

  const sorted = [...series].sort((a, b) => (a.firstGameDate ?? '').localeCompare(b.firstGameDate ?? ''));
  const rounds = [];
  let remaining = [...sorted];
  const roundSizes = [8, 4, 2, 1];
  const roundNames = ['First Round', 'Conference Semifinals', 'Conference Finals', 'NBA Finals'];
  for (let i = 0; i < roundSizes.length && remaining.length > 0; i++) {
    const chunk = remaining.splice(0, roundSizes[i]);
    if (chunk.length) rounds.push({ round: i + 1, name: roundNames[i], series: chunk });
  }

  return { rounds, playIn: playInSeries, totalSeries: series.length };
}
