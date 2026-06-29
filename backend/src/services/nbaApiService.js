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
export const CACHE_DIR = join(__dirname, '../../../cache_nba');

function decodeHtml(str) {
  if (!str || !str.includes('&')) return str;
  return str.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));
}
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const memCache = new NodeCache();


// ── NBA API client ────────────────────────────────────────────────────────────

const NBA_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.nba.com/',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
  'Connection': 'keep-alive',
  'Host': 'stats.nba.com',
  'Origin': 'https://www.nba.com',
};

// Fast client for live/real-time data (games, standings, rosters)
const nbaClient = axios.create({ baseURL: 'https://stats.nba.com', timeout: 12000, headers: NBA_HEADERS });

// Slow client for static player/career data that needs more time
const nbaSlowClient = axios.create({ baseURL: 'https://stats.nba.com', timeout: 45000, headers: NBA_HEADERS });

const espnClient = axios.create({
  baseURL: 'https://site.api.espn.com',
  timeout: 10000,
});

// App abbreviation → ESPN team ID
const ESPN_TEAM_IDS = {
  ATL:1, BOS:2, NO:3, CHI:4, CLE:5, DAL:6, DEN:7, DET:8, GS:9, GSW:9,
  HOU:10, IND:11, LAC:12, LAL:13, MEM:29, MIA:14, MIL:15, MIN:16,
  BKN:17, NY:18, ORL:19, PHI:20, PHO:21, POR:22, SAC:23, SA:24,
  OKC:25, UTAH:26, WSH:27, TOR:28, CHA:30,
  // App abbreviation aliases — listed last so ESPN_ID_TO_APP resolves to these
  NOP:3, UTA:26, WAS:27,
};

// Legacy ESPN abbreviations that exist in cached draft data
export const ESPN_TEAM_ALIASES = { NOP: ['NOP','NO'], UTA: ['UTA','UTAH'], WAS: ['WAS','WSH'], GSW: ['GSW','GS'] };

// ── Cache helpers ─────────────────────────────────────────────────────────────

function fileKey(key) {
  return key.replace(/[^a-zA-Z0-9]/g, '_') + '.json';
}

export function readDisk(key, { allowStale = false } = {}) {
  const file = join(CACHE_DIR, fileKey(key));
  if (!existsSync(file)) return undefined;
  try {
    const { data, expires } = JSON.parse(readFileSync(file, 'utf8'));
    if (Date.now() < expires || allowStale) return data;
  } catch {}
  return undefined;
}

export function writeDisk(key, data, ttl) {
  const file = join(CACHE_DIR, fileKey(key));
  try { writeFileSync(file, JSON.stringify({ data, expires: Date.now() + ttl * 1000 })); } catch {}
}

export function existsDisk(key) {
  return existsSync(join(CACHE_DIR, fileKey(key)));
}

const SLOW_PATHS = ['/stats/commonplayerinfo', '/stats/playercareerstats', '/stats/commonallplayers'];

async function nbFetch(path, params = {}, ttl = 300, cacheKey = null) {
  const key = cacheKey ?? (path + JSON.stringify(params));

  const mem = memCache.get(key);
  if (mem !== undefined) return mem;

  const disk = readDisk(key);
  if (disk !== undefined) { memCache.set(key, disk, ttl); return disk; }

  // If fresh cache miss but stale cache exists, return stale immediately + update async
  const stale = readDisk(key, { allowStale: true });
  if (stale !== undefined) {
    memCache.set(key, stale, 60);
    // Fetch fresh data in background without waiting
    setImmediate(async () => {
      const client = SLOW_PATHS.some(p => path.startsWith(p)) ? nbaSlowClient : nbaClient;
      try {
        const { data } = await client.get(path, { params });
        memCache.set(key, data, ttl);
        writeDisk(key, data, ttl);
      } catch {}
    });
    return stale;
  }

  const client = SLOW_PATHS.some(p => path.startsWith(p)) ? nbaSlowClient : nbaClient;
  try {
    const { data } = await client.get(path, { params });
    memCache.set(key, data, ttl);
    writeDisk(key, data, ttl);
    return data;
  } catch (err) {
    throw err;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Parse NBA resultSet → array of objects
// Convert NBA.com date "Apr 12, 2026" or "OCT 24, 2024" → ISO "2026-04-12"
const MONTH_MAP = { JAN:'01',FEB:'02',MAR:'03',APR:'04',MAY:'05',JUN:'06',JUL:'07',AUG:'08',SEP:'09',OCT:'10',NOV:'11',DEC:'12' };
function parseNbaDate(str) {
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str; // already ISO
  const m = str.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})$/);
  if (!m) return str;
  return `${m[3]}-${MONTH_MAP[m[1].toUpperCase()] ?? '01'}-${m[2].padStart(2,'0')}`;
}

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
  UTAH: 'UTA', WSH: 'WAS',
};
function espnToApp(abbr) { return ESPN_TO_APP[abbr] ?? abbr ?? ''; }

async function getEspnGamesByDate(date) {
  const espnDate = date.replace(/-/g, '');
  const cacheKey = `espn_scoreboard_${date}`;
  const isPast = new Date(date) < new Date(new Date().toDateString());

  const cached = readDisk(cacheKey);
  if (cached !== undefined) {
    // Bust stale cache for past dates where all games are still Scheduled (no scores)
    if (isPast && Array.isArray(cached) && cached.length > 0 && cached.every(g => g.Status === 'Scheduled' && !g.AwayTeamScore)) {
      const cacheFile = join(CACHE_DIR, fileKey(cacheKey));
      if (existsSync(cacheFile)) unlinkSync(cacheFile);
      memCache.del(cacheKey);
    } else {
      return cached;
    }
  }

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

    if (games.length > 0) {
      const allFinal = isFinalData(games);
      const ttl = allFinal ? 86400 * 30 : isPast ? 300 : 60;
      if (allFinal || !isPast) writeDisk(cacheKey, games, ttl);
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

function enrichNullScores(games) {
  const todayStr = new Date().toISOString().split('T')[0];
  for (const g of games) {
    if (!g.Day || g.Day >= todayStr || g.AwayTeamScore != null) continue;
    for (const offset of [0, -1, 1]) {
      const d = new Date(g.Day + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() + offset);
      const adjDate = d.toISOString().split('T')[0];
      const sbCache = readDisk(`espn_scoreboard_${adjDate}`);
      const sbGames = Array.isArray(sbCache) ? sbCache : [];
      const match = sbGames.find(sb =>
        (sb.AwayTeam === g.AwayTeam && sb.HomeTeam === g.HomeTeam) ||
        (sb.AwayTeam === g.HomeTeam && sb.HomeTeam === g.AwayTeam)
      );
      if (match && match.AwayTeamScore != null) {
        g.AwayTeamScore = match.AwayTeam === g.AwayTeam ? match.AwayTeamScore : match.HomeTeamScore;
        g.HomeTeamScore = match.AwayTeam === g.AwayTeam ? match.HomeTeamScore : match.AwayTeamScore;
        g.Status = match.Status;
        break;
      }
    }
  }
  return games;
}

async function getEspnTeamRegularSeason(appAbbr, espnSeason) {
  const espnId = ESPN_TEAM_IDS[appAbbr];
  if (!espnId) return [];
  const cacheKey = `espn_team_reg_${appAbbr}_${espnSeason}`;

  const cached = readDisk(cacheKey);
  if (cached !== undefined) {
    // Re-enrich on cache hit in case new scoreboard caches have been added since
    const enriched = enrichNullScores([...cached]);
    const wasEnriched = enriched.some((g, i) => g.AwayTeamScore !== cached[i]?.AwayTeamScore);
    if (wasEnriched) {
      const hasNullFinals = enriched.some(g => g.Status === 'Final' && g.AwayTeamScore == null);
      writeDisk(cacheKey, enriched, hasNullFinals ? 3600 : 86400 * 30);
    }
    return enriched;
  }

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
    enrichNullScores(games);
    const hasNullFinals = games.some(g => g.Status === 'Final' && g.AwayTeamScore == null);
    writeDisk(cacheKey, games, hasNullFinals ? 3600 : 86400 * 30);
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

  // Check full schedule cache first (includes both reg season + playoffs)
  const fullCacheKey = `schedule_full_${teamAbbr}_${season}`;
  const cached = readDisk(fullCacheKey);
  if (cached !== undefined) return cached;

  // Regular season: always try NBA API first (it includes final scores via PTS/PLUS_MINUS)
  let reg = [];
  const regCacheKey = `schedule_reg_${teamAbbr}_${season}`;
  try {
    const ttl = adjustTtlForOffseason(86400); // 24h during season, forever during offseason
    const regData = await nbFetch('/stats/leaguegamefinder', {
      PlayerOrTeam: 'T', TeamID: teamId,
      Season: seasonStr, SeasonType: 'Regular Season', LeagueID: '00',
    }, ttl, `schedule_reg_${teamAbbr}_${season}`);

    const mapRow = (row) => {
      const isHome   = row.MATCHUP?.includes('vs.');
      const oppMatch = row.MATCHUP?.match(/(?:vs\.|@)\s+(\S+)/);
      const oppAbbr  = oppMatch ? toAppAbbr(oppMatch[1]) : '';
      const wl       = row.WL;
      const myScore  = row.PTS;
      const oppScore = myScore - (row.PLUS_MINUS ?? 0); // PLUS_MINUS signed: +10=won by 10, -10=lost by 10
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

  const result = [...regFiltered, ...playoffs].sort((a, b) => (a.Day ?? '').localeCompare(b.Day ?? ''));

  // Cache full schedule so it doesn't re-fetch individual dates next time
  const fullTtl = adjustTtlForOffseason(86400);
  writeDisk(fullCacheKey, result, fullTtl);

  return result;
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

  // During offseason, don't re-fetch ESPN — just return what's cached
  if (isOffseason()) {
    const seen = new Set();
    const games = [];
    for (const date of allDates) {
      const cached = readDisk(`espn_scoreboard_${date}`);
      if (!cached) continue;
      for (const g of cached) {
        if (g.SeasonType !== 3) continue;
        if (seen.has(g.GameID)) continue;
        seen.add(g.GameID);
        games.push(g);
      }
    }
    return games.sort((a, b) => (a.Day ?? '').localeCompare(b.Day ?? ''));
  }

  // Fetch any dates not yet in ESPN cache, in parallel batches
  const missing = allDates.filter(date => readDisk(`espn_scoreboard_${date}`) === undefined);

  // If >80% already cached, return immediately (fast UX) and fetch rest in background
  const cacheRatio = missing.length / (allDates.length || 1);
  if (missing.length > 0 && cacheRatio < 0.2) {
    // Return with cached data, fetch updates async in background
    setImmediate(() => {
      Promise.all(missing.map(date => getEspnGamesByDate(date).catch(() => []))).catch(() => {});
    });
  } else if (missing.length > 0) {
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

export async function getBoxScore(gameId, gameDate = null, awayHint = null, homeHint = null) {
  // ESPN IDs are 9 digits (e.g. 401859963); NBA IDs start with 002/004 (10 digits)
  // If the ID doesn't look like an NBA game ID, use ESPN box score
  const idStr = String(gameId);
  // NBA regular season IDs: 10 digits starting with 002/005
  // NBA playoff IDs: 10 digits starting with 004 (stripped to 8 digits starting with 4)
  // ESPN IDs: 9 digits starting with 4
  const looksLikeNba = /^\d+$/.test(idStr) && (
    idStr.length === 10 ||
    (idStr.length === 8 && idStr.startsWith('4')) || // playoff: 0042500151 → 42500151
    (idStr.length <= 8)
  ) && idStr.length !== 9;
  if (!looksLikeNba) {
    return getEspnBoxScore(gameId);
  }

  const nbaId = fmtGameId(gameId);
  const ttl = 86400 * 30; // final scores never change
  const cacheKey = `boxscore_v2_${nbaId}`;

  // Check cache first (both fresh and stale)
  const cached = readDisk(cacheKey);
  if (cached !== undefined) return cached;

  const stale = readDisk(cacheKey, { allowStale: true });
  if (stale !== undefined) {
    // Return stale cache immediately, fetch fresh in background
    setImmediate(async () => {
      const params = { GameID: nbaId, StartPeriod: 1, EndPeriod: 10, StartRange: 0, EndRange: 0, RangeType: 0 };
      try { await nbFetch('/stats/boxscoretraditionalv2', params, ttl, cacheKey); } catch {}
    });
    return stale;
  }

  const params = {
    GameID: nbaId,
    StartPeriod: 1, EndPeriod: 10,
    StartRange: 0, EndRange: 0, RangeType: 0,
  };

  // Use timeout: if boxscore fetch takes >3s, return empty rather than wait 12s
  // This prevents team overview from being blocked. Boxscore will be cached for next visit.
  let data;
  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Boxscore fetch timeout')), 3000)
    );
    data = await Promise.race([
      nbFetch('/stats/boxscoretraditionalv2', params, ttl, cacheKey),
      timeoutPromise
    ]);
  } catch (err) {
    if (err.message === 'Boxscore fetch timeout') {
      // Timeout: return empty boxscore so team page doesn't block
      return { Game: {}, PlayerGames: [], TeamGames: [] };
    }
    throw err;
  }

  const players  = parseRS(data.resultSets, 'PlayerStats');
  const teamRows = parseRS(data.resultSets, 'TeamStats');
  if (!players.length) {
    // Bust stale empty cache so next request re-fetches
    const cacheFile = join(CACHE_DIR, fileKey(`boxscore_v2_${nbaId}`));
    if (existsSync(cacheFile)) { try { unlinkSync(cacheFile); } catch {} }

    // NBA API returned empty — find ESPN game ID from daily scoreboard by matching teams
    if (gameDate) {
      // Get the two teams from the NBA game summary
      const gameSummaryRows = parseRS(data.resultSets, 'GameSummary');
      const summaryRow = gameSummaryRows[0];
      const homeId = summaryRow?.HOME_TEAM_ID;
      const visitorId = summaryRow?.VISITOR_TEAM_ID;
      const homeAbbr = homeId ? (ID_TO_APP[parseInt(homeId)] ?? '') : '';
      const awayAbbr = visitorId ? (ID_TO_APP[parseInt(visitorId)] ?? '') : '';

      const aliases = ESPN_TEAM_ALIASES;
      const matchesTeam = (sbTeam, key) => {
        if (!key) return false;
        const possible = aliases[key] ?? [key];
        return possible.includes(sbTeam);
      };
      for (const offset of [0, -1, 1]) {
        const d = new Date(gameDate + 'T12:00:00Z');
        d.setUTCDate(d.getUTCDate() + offset);
        const adjDate = d.toISOString().split('T')[0];
        // Use live fetch so we don't fail when the scoreboard was never cached for that date
        const sbGames = await getEspnGamesByDate(adjDate).catch(() => []);
        const match = sbGames.find(g =>
          (homeId && g.HomeTeamID === parseInt(homeId) && g.AwayTeamID === parseInt(visitorId)) ||
          (homeAbbr && matchesTeam(g.HomeTeam, homeAbbr) && matchesTeam(g.AwayTeam, awayAbbr)) ||
          (homeHint && matchesTeam(g.HomeTeam, homeHint) && awayHint && matchesTeam(g.AwayTeam, awayHint))
        );
        if (match?._espnId) return getEspnBoxScore(match._espnId);
      }
    }
    throw new Error(`Box score not found for game ${gameId}`);
  }

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
      Day:            gameSummary?.GAME_DATE_EST?.split('T')[0] ?? null,
      DateTime:       null,
      AwayTeam:       awayTeam,
      HomeTeam:       homeTeam,
      AwayTeamScore:  awayScore,
      HomeTeamScore:  homeScore,
      Season:         currentSeason(),
      SeasonType:     (nbaId.startsWith('004') || nbaId.startsWith('005')) ? 3 : 1,
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
  const ttl = adjustTtlForOffseason(86400); // 24h during season, forever during offseason
  const data = await nbFetch('/stats/leaguestandingsv3', {
    LeagueID: '00', Season: seasonStr, SeasonType: 'Regular Season',
  }, ttl, `standings_${season}`);

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

export async function getTeamSalaries(teamAbbr) {
  const espnTeamId = ESPN_TEAM_IDS[teamAbbr];
  if (!espnTeamId) throw new Error(`Unknown team: ${teamAbbr}`);
  const cacheKey = `salaries_${teamAbbr}`;
  const cached = readDisk(cacheKey);
  if (cached !== undefined) return cached;

  const { data } = await espnClient.get(`/apis/site/v2/sports/basketball/nba/teams/${espnTeamId}/roster`);
  const OPTION_LABELS = { 0: null, 1: 'Player Option', 2: 'Team Option', 3: 'Two-Way', 4: 'Two-Way' };
  const CURRENT_YEAR = new Date().getFullYear();
  const coreClient = axios.create({ baseURL: 'https://sports.core.api.espn.com', timeout: 10000 });

  // Build base player list from roster
  const basePlayers = (data.athletes ?? []).map(a => ({
    EspnId:         a.id,
    Name:           a.fullName ?? a.displayName ?? '',
    PhotoUrl:       a.headshot?.href ?? null,
    Jersey:         a.jersey ?? null,
    Position:       a.position?.abbreviation ?? '',
    Salary:         a.contract?.salary ?? 0,
    YearsRemaining: a.contract?.yearsRemaining ?? 0,
    OptionType:     OPTION_LABELS[a.contract?.optionType] ?? null,
    SalaryByYear:   [],
  }));

  // Fetch year-by-year contracts from ESPN core API for each player in parallel batches
  for (let i = 0; i < basePlayers.length; i += 5) {
    await Promise.all(basePlayers.slice(i, i + 5).map(async p => {
      try {
        const { data: cList } = await coreClient.get(
          `/v2/sports/basketball/leagues/nba/athletes/${p.EspnId}/contracts?limit=20&lang=en&region=us`
        );
        // Fetch each year's contract in parallel
        // Extract year from ref URL: .../contracts/2027?...
        const refs = (cList.items ?? [])
          .map(item => ({ ref: item['$ref'], year: parseInt(item['$ref']?.match(/contracts\/(\d{4})/)?.[1] ?? '0') }))
          .filter(r => r.ref && r.year >= CURRENT_YEAR);

        const yearData = await Promise.all(refs.map(({ ref, year }) =>
          coreClient.get(ref.replace('http://', 'https://')).then(r => ({ year, data: r.data })).catch(() => null)
        ));
        p.SalaryByYear = yearData
          .filter(d => d && d.data?.salary)
          .map(d => ({
            year:       d.year,
            salary:     d.data.salary,
            optionType: OPTION_LABELS[d.data.optionType] ?? null,
          }))
          .sort((a, b) => a.year - b.year);
      } catch {}
    }));
  }

  const players = basePlayers.sort((a, b) => b.Salary - a.Salary);
  const totalSalary = players.reduce((s, p) => s + p.Salary, 0);
  const result = { players, totalSalary, teamAbbr };
  writeDisk(cacheKey, result, 86400);
  return result;
}

export async function getTeamRoster(teamAbbr) {
  const teamId = TEAM_IDS[teamAbbr];
  if (!teamId) return [];
  const seasonStr = toSeasonStr(currentSeason());
  const ttl = adjustTtlForOffseason(86400); // 24h during season, forever during offseason
  const data = await nbFetch('/stats/commonteamroster', {
    Season: seasonStr, TeamID: teamId,
  }, ttl, `roster_${teamAbbr}`);

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

export async function getAllHistoricalPlayers() {
  const seasonStr = toSeasonStr(currentSeason());
  const data = await nbFetch('/stats/commonallplayers', {
    LeagueID: '00', Season: seasonStr, IsOnlyCurrentSeason: 0,
  }, 86400 * 7, `allplayers_historical_${currentSeason()}`);
  const rows = parseRS(data.resultSets, 'CommonAllPlayers');
  return rows.map(p => ({
    PlayerID:  p.PERSON_ID,
    FirstName: p.DISPLAY_FIRST_LAST?.split(' ')[0] ?? '',
    LastName:  p.DISPLAY_FIRST_LAST?.split(' ').slice(1).join(' ') ?? '',
    Team:      toAppAbbr(p.TEAM_ABBREVIATION ?? ''),
    TeamID:    p.TEAM_ID ?? 0,
    Status:    p.ROSTERSTATUS === '1' ? 'Active' : 'Inactive',
    PhotoUrl:  `https://cdn.nba.com/headshots/nba/latest/1040x760/${p.PERSON_ID}.png`,
    FromYear:  p.FROM_YEAR ?? null,
    ToYear:    p.TO_YEAR ?? null,
  }));
}

// Build a map of PlayerID → historical player for fast lookup
let _historicalMap = null;
async function getHistoricalPlayerMap() {
  if (_historicalMap) return _historicalMap;
  const players = await getAllHistoricalPlayers();
  _historicalMap = new Map(players.map(p => [p.PlayerID, p]));
  return _historicalMap;
}

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
  try {
    const data = await nbFetch('/stats/commonplayerinfo', { PlayerID: playerId }, 86400 * 30, `player_${playerId}`);
    const rows = parseRS(data.resultSets, 'CommonPlayerInfo');
    if (!rows.length) throw new Error('empty');
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
      DraftYear:   p.DRAFT_YEAR ? parseInt(p.DRAFT_YEAR) : null,
      DraftRound:  p.DRAFT_ROUND ? parseInt(p.DRAFT_ROUND) : null,
      DraftPick:   p.DRAFT_NUMBER ? parseInt(p.DRAFT_NUMBER) : null,
    };
  } catch {
    // Fall back to bulk historical data — always available, no rate limiting
    const map = await getHistoricalPlayerMap();
    const p = map.get(parseInt(playerId));
    if (!p) return null;
    return {
      PlayerID:    p.PlayerID,
      FirstName:   p.FirstName,
      LastName:    p.LastName,
      Team:        p.Team,
      TeamID:      p.TeamID,
      Position:    '',
      Jersey:      0,
      Height:      0,
      Weight:      0,
      BirthDate:   null,
      BirthCity:   '',
      BirthState:  '',
      BirthCountry: '',
      College:     null,
      Experience:  0,
      Salary:      0,
      Status:      p.Status,
      PhotoUrl:    p.PhotoUrl,
      NbaDotComPlayerID: p.PlayerID,
      DraftYear:   null, DraftRound: null, DraftPick: null,
    };
  }
}

// ── Player game logs ──────────────────────────────────────────────────────────

// Resolve NBA player ID → ESPN athlete ID via ESPN team roster
async function getEspnAthleteId(nbaPlayerId) {
  const cacheKey = `espn_athlete_id_${nbaPlayerId}`;
  const cached = readDisk(cacheKey);
  if (cached !== undefined) return cached;

  // Get player info to find their team
  let player = null;
  try { player = await getPlayerById(nbaPlayerId); } catch {}
  if (!player?.Team) return null;

  const espnTeamId = ESPN_TEAM_IDS[player.Team];
  if (!espnTeamId) return null;

  try {
    const { data } = await espnClient.get(
      `/apis/site/v2/sports/basketball/nba/teams/${espnTeamId}/roster`
    );
    const athletes = data.athletes ?? [];
    // Match by full name (case-insensitive)
    const fullName = `${player.FirstName} ${player.LastName}`.toLowerCase();
    const match = athletes.find(a =>
      (a.fullName ?? '').toLowerCase() === fullName ||
      (a.displayName ?? '').toLowerCase() === fullName
    );
    const espnId = match?.id ?? null;
    if (espnId) writeDisk(cacheKey, espnId, 86400 * 30);
    return espnId;
  } catch {
    return null;
  }
}

// ESPN stat label positions
const ESPN_GL_LABELS = ['MIN','FG','FG%','3PT','3P%','FT','FT%','REB','AST','BLK','STL','PF','TO','PTS'];

export async function getPlayerGameLogs(season, playerId) {
  season = parseInt(season);
  return getNbaGameLogs(season, playerId);
}

// Original NBA API game log fallback
async function getNbaGameLogs(season, playerId) {
  const seasonStr = toSeasonStr(season);
  const mapRow = (r, isPlayoff = false) => ({
    PlayerID: playerId, Season: season,
    GameID: parseInt(r.Game_ID) || 0,
    Opponent: r.MATCHUP?.split(' ').pop() ?? '',
    HomeOrAway: r.MATCHUP?.includes('vs.') ? 'HOME' : 'AWAY',
    Day: parseNbaDate(r.GAME_DATE), WinLoss: r.WL ?? '',
    TeamScore: null, OpponentScore: null,
    IsPlayoff: isPlayoff,
    Started: 1, Games: 1,
    Minutes: parseFloat(r.MIN) || 0,
    Points: r.PTS ?? 0, Rebounds: r.REB ?? 0, Assists: r.AST ?? 0,
    Steals: r.STL ?? 0, BlockedShots: r.BLK ?? 0, Turnovers: r.TOV ?? 0,
    PersonalFouls: 0,
    FieldGoalsMade: r.FGM ?? 0, FieldGoalsAttempted: r.FGA ?? 0,
    FieldGoalsPercentage: r.FG_PCT ?? 0,
    ThreePointersMade: r.FG3M ?? 0, ThreePointersAttempted: r.FG3A ?? 0,
    ThreePointersPercentage: r.FG3_PCT ?? 0,
    FreeThrowsMade: r.FTM ?? 0, FreeThrowsAttempted: r.FTA ?? 0,
    FreeThrowsPercentage: r.FT_PCT ?? 0,
    PlusMinus: r.PLUS_MINUS ?? 0, TrueShootingPercentage: 0,
    PlayerEfficiencyRating: 0, DoubleDoubles: 0, TripleDoubles: 0,
  });

  // Past seasons never change — cache forever. Current season refreshes daily.
  const logTtl = isSeasonComplete(season) ? TTL_FOREVER : TTL_SEASON;

  const [regularData, playoffData, playInData] = await Promise.allSettled([
    nbFetch('/stats/playergamelog', { PlayerID: playerId, Season: seasonStr, SeasonType: 'Regular Season' }, logTtl, `gamelogs_nba_${playerId}_${season}`),
    nbFetch('/stats/playergamelog', { PlayerID: playerId, Season: seasonStr, SeasonType: 'Playoffs' }, logTtl, `gamelogs_playoff_${playerId}_${season}`),
    nbFetch('/stats/playergamelog', { PlayerID: playerId, Season: seasonStr, SeasonType: 'PlayIn' }, logTtl, `gamelogs_playin_${playerId}_${season}`),
  ]);

  const regular  = regularData.status  === 'fulfilled' ? parseRS(regularData.value.resultSets,  'PlayerGameLog').map(r => mapRow(r, false)) : [];
  const playoffs = playoffData.status  === 'fulfilled' ? parseRS(playoffData.value.resultSets,  'PlayerGameLog').map(r => mapRow(r, true))  : [];
  const playIn   = playInData.status   === 'fulfilled' ? parseRS(playInData.value.resultSets,   'PlayerGameLog').map(r => mapRow(r, true))  : [];

  // Merge and sort by date descending (most recent first)
  return [...regular, ...playoffs, ...playIn].sort((a, b) => (b.Day ?? '').localeCompare(a.Day ?? ''));
}

// ── Team season stats ─────────────────────────────────────────────────────────

// ESPN team slug overrides (mirrors frontend teamMappings.ts)
const ESPN_TEAM_SLUGS = { UTA:'utah', NOP:'no', GSW:'gs', NY:'ny', SA:'sa' };
function espnTeamSlug(abbr) { return ESPN_TEAM_SLUGS[abbr] ?? abbr.toLowerCase(); }

const ALL_NBA_TEAMS = [
  'ATL','BOS','BKN','CHA','CHI','CLE','DAL','DEN','DET','GSW',
  'HOU','IND','LAC','LAL','MEM','MIA','MIL','MIN','NOP','NY',
  'OKC','ORL','PHI','PHO','POR','SAC','SA','TOR','UTA','WAS',
];

function parseTeamStats(data, maxGP = Infinity) {
  const cats = data?.results?.stats?.categories ?? [];
  function getStat(cat, name) {
    const c = cats.find(c2 => c2.name === cat);
    return c?.stats.find(s => s.name === name)?.value ?? 0;
  }
  const gp = getStat('general', 'gamesPlayed') || 0;
  // For playoffs (maxGP=28): if ESPN returns ≥30 GP it's regular season fallback data — ignore
  if (!gp || gp > maxGP) return null;
  return {
    GP:    gp,
    PTS:   getStat('offensive', 'avgPoints'),
    REB:   getStat('general',   'avgRebounds'),
    AST:   getStat('offensive', 'avgAssists'),
    TOV:   getStat('offensive', 'avgTurnovers'),
    STL:   getStat('defensive', 'avgSteals'),
    BLK:   getStat('defensive', 'avgBlocks'),
    OREB:  getStat('offensive', 'avgOffensiveRebounds'),
    DREB:  getStat('defensive', 'avgDefensiveRebounds'),
    FGPct: getStat('offensive', 'fieldGoalPct') / 100,
    TPPct: getStat('offensive', 'threePointFieldGoalPct') / 100,
    FTPct: getStat('offensive', 'freeThrowPct') / 100,
  };
}

// Fetch all 30 teams, compute per-stat rankings (1=best), cache result
async function getLeagueTeamRankings(seasonType = 2) {
  const cacheKey = `league_team_rankings_st${seasonType}`;
  const cached = readDisk(cacheKey);
  if (cached !== undefined) return cached;

  const results = await Promise.allSettled(
    ALL_NBA_TEAMS.map(async abbr => {
      const slug = espnTeamSlug(abbr);
      const { data } = await espnClient.get(
        `/apis/site/v2/sports/basketball/nba/teams/${slug}/statistics`,
        { params: { seasontype: seasonType } }
      );
      const maxGP = seasonType === 3 ? 28 : Infinity;
      return { abbr, stats: parseTeamStats(data, maxGP) };
    })
  );

  const teams = results
    .filter(r => r.status === 'fulfilled' && r.value.stats && r.value.stats.GP > 0)
    .map(r => r.value);

  // For each stat, rank all teams (lower TOV = better rank, higher everything else)
  const LOWER_IS_BETTER = new Set(['TOV']);
  const STAT_KEYS = ['PTS','REB','AST','TOV','STL','BLK','OREB','DREB','FGPct','TPPct','FTPct'];

  const rankings = {}; // { abbr: { PTS: 3, REB: 12, ... } }
  for (const key of STAT_KEYS) {
    const sorted = [...teams].sort((a, b) =>
      LOWER_IS_BETTER.has(key)
        ? a.stats[key] - b.stats[key]   // ascending: lower = rank 1
        : b.stats[key] - a.stats[key]   // descending: higher = rank 1
    );
    sorted.forEach((t, i) => {
      if (!rankings[t.abbr]) rankings[t.abbr] = {};
      rankings[t.abbr][key] = i + 1;
    });
  }

  writeDisk(cacheKey, rankings, TTL_SEASON);
  return rankings;
}

export async function getTeamSeasonStats(season, teamAbbr) {
  const appAbbr  = teamAbbr.toUpperCase();
  const slug     = espnTeamSlug(appAbbr);
  const cacheKey = `teamstats_espn_${appAbbr}_v2`;

  const [statsRes, regRankings, poRankings] = await Promise.allSettled([
    (async () => {
      const cached = readDisk(cacheKey);
      if (cached !== undefined) return cached;
      const [regRes, poRes] = await Promise.allSettled([
        espnClient.get(`/apis/site/v2/sports/basketball/nba/teams/${slug}/statistics`, { params: { seasontype: 2 } }),
        espnClient.get(`/apis/site/v2/sports/basketball/nba/teams/${slug}/statistics`, { params: { seasontype: 3 } }),
      ]);
      const result = {
        regular:  regRes.status === 'fulfilled' ? parseTeamStats(regRes.value.data)       : null,
        playoffs: poRes.status  === 'fulfilled' ? parseTeamStats(poRes.value.data, 28)   : null,
      };
      writeDisk(cacheKey, result, TTL_SEASON);
      return result;
    })(),
    getLeagueTeamRankings(2),
    getLeagueTeamRankings(3),
  ]);

  const stats    = statsRes.status === 'fulfilled' ? statsRes.value : { regular: null, playoffs: null };
  const regRanks = regRankings.status === 'fulfilled' ? (regRankings.value[appAbbr] ?? {}) : {};
  const poRanks  = poRankings.status  === 'fulfilled' ? (poRankings.value[appAbbr]  ?? {}) : {};

  return {
    regular:        stats.regular,
    playoffs:       stats.playoffs,
    regularRanks:   regRanks,
    playoffRanks:   poRanks,
  };
}

// ── Player season stats ───────────────────────────────────────────────────────

export async function getPlayerSeasonStats(season, playerId) {
  season = parseInt(season);
  const perPlayerKey = `seasonstats_${playerId}_${season}`;

  // Check per-player cache first — avoids re-computing from game logs every time
  const cached = readDisk(perPlayerKey);
  if (cached !== undefined) return cached;

  const seasonStr = toSeasonStr(season);
  const allStatsKey = `seasonstats_all_${season}`;

  // Only try the NBA league-wide API if we haven't already confirmed it's unavailable.
  // Cache a null sentinel on failure so we skip it for the next 24h instead of
  // waiting 12s for the timeout on every single player load.
  const allStatsKnownBad = readDisk(allStatsKey) === null;
  if (!allStatsKnownBad) {
    try {
      const data = await nbFetch('/stats/leaguedashplayerstats', {
        Season: seasonStr, SeasonType: 'Regular Season',
        PerMode: 'PerGame', LeagueID: '00',
      }, TTL_SEASON, allStatsKey);
      const rows = parseRS(data.resultSets, 'LeagueDashPlayerStats');
      const r = rows.find(p => p.PLAYER_ID === Number(playerId));
      if (r) {
        const result = {
          PlayerID: Number(playerId), Season: season,
          Games: r.GP ?? 0, Minutes: r.MIN ?? 0,
          Points: r.PTS ?? 0, Rebounds: r.REB ?? 0, Assists: r.AST ?? 0,
          Steals: r.STL ?? 0, BlockedShots: r.BLK ?? 0, Turnovers: r.TOV ?? 0,
          FieldGoalsPercentage: r.FG_PCT ?? 0, ThreePointersPercentage: r.FG3_PCT ?? 0,
          FreeThrowsPercentage: r.FT_PCT ?? 0, TrueShootingPercentage: 0,
          PlayerEfficiencyRating: 0, UsageRatePercentage: 0,
          PlusMinus: r.PLUS_MINUS ?? 0, DoubleDoubles: r.DD2 ?? 0, TripleDoubles: r.TD3 ?? 0,
        };
        writeDisk(perPlayerKey, result, TTL_SEASON);
        return result;
      }
    } catch {
      // Mark as unavailable for 24h so subsequent calls skip the 12s timeout wait
      writeDisk(allStatsKey, null, TTL_SEASON);
    }
  }

  // Fallback: compute averages from regular season game logs only
  const allLogs = await getPlayerGameLogs(season, playerId).catch(() => []);
  const logs = allLogs.filter(g => !g.IsPlayoff);
  if (!logs.length) return null;

  const avg = (key) => logs.reduce((s, g) => s + (g[key] ?? 0), 0) / logs.length;
  const fgm = logs.reduce((s, g) => s + (g.FieldGoalsMade ?? 0), 0);
  const fga = logs.reduce((s, g) => s + (g.FieldGoalsAttempted ?? 0), 0);
  const tpm = logs.reduce((s, g) => s + (g.ThreePointersMade ?? 0), 0);
  const tpa = logs.reduce((s, g) => s + (g.ThreePointersAttempted ?? 0), 0);
  const ftm = logs.reduce((s, g) => s + (g.FreeThrowsMade ?? 0), 0);
  const fta = logs.reduce((s, g) => s + (g.FreeThrowsAttempted ?? 0), 0);

  const result = {
    PlayerID: Number(playerId), Season: season,
    Games:    logs.length,
    Minutes:  avg('Minutes'),
    Points:   avg('Points'),   Rebounds: avg('Rebounds'), Assists: avg('Assists'),
    Steals:   avg('Steals'),   BlockedShots: avg('BlockedShots'), Turnovers: avg('Turnovers'),
    FieldGoalsPercentage:    fga > 0 ? fgm / fga : 0,
    ThreePointersPercentage: tpa > 0 ? tpm / tpa : 0,
    FreeThrowsPercentage:    fta > 0 ? ftm / fta : 0,
    TrueShootingPercentage:  0, PlayerEfficiencyRating: 0, UsageRatePercentage: 0,
    PlusMinus: avg('PlusMinus'), DoubleDoubles: 0, TripleDoubles: 0,
  };

  // Cache per-player: past seasons are permanent, current season refreshes daily
  writeDisk(perPlayerKey, result, isSeasonComplete(season) ? TTL_FOREVER : TTL_SEASON);
  return result;
}

export async function getPlayerPlayoffStats(season, playerId) {
  const allLogs = await getPlayerGameLogs(season, playerId).catch(() => []);
  const logs = allLogs.filter(g => g.IsPlayoff);
  if (!logs.length) return null;
  const avg = (key) => logs.reduce((s, g) => s + (g[key] ?? 0), 0) / logs.length;
  const sum = (key) => logs.reduce((s, g) => s + (g[key] ?? 0), 0);
  const fgm = sum('FieldGoalsMade'), fga = sum('FieldGoalsAttempted');
  const tpm = sum('ThreePointersMade'), tpa = sum('ThreePointersAttempted');
  const ftm = sum('FreeThrowsMade'), fta = sum('FreeThrowsAttempted');
  return {
    PlayerID: Number(playerId), Season: Number(season),
    Games: logs.length, Minutes: avg('Minutes'),
    Points: avg('Points'), Rebounds: avg('Rebounds'), Assists: avg('Assists'),
    Steals: avg('Steals'), BlockedShots: avg('BlockedShots'), Turnovers: avg('Turnovers'),
    FieldGoalsPercentage:    fga > 0 ? fgm / fga : 0,
    ThreePointersPercentage: tpa > 0 ? tpm / tpa : 0,
    FreeThrowsPercentage:    fta > 0 ? ftm / fta : 0,
    TrueShootingPercentage: 0, PlayerEfficiencyRating: 0, UsageRatePercentage: 0,
    PlusMinus: avg('PlusMinus'), DoubleDoubles: 0, TripleDoubles: 0,
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

// ── Player career stats ───────────────────────────────────────────────────────

export async function getPlayerCareerStats(playerId) {
  const cacheKey = `career_seasons_${playerId}`;
  const cached = readDisk(cacheKey);
  if (cached !== undefined) return cached;

  try {
    // Use NBA.com playercareerstats — works for active AND retired players
    // Use a separate raw cache key so nbFetch doesn't collide with our processed result
    const data = await nbFetch('/stats/playercareerstats', { PlayerID: playerId, PerMode: 'PerGame' }, 86400 * 7, `career_raw_${playerId}`);
    const rows = parseRS(data.resultSets, 'SeasonTotalsRegularSeason');
    if (!rows.length) return [];

    const seasons = rows.map(r => {
      const seasonId = r.SEASON_ID ?? '';
      // SEASON_ID is like "2017-18" — ending year for SeasonYear
      const endYear = parseInt(seasonId.split('-')[0] ?? '0') + 1;
      const gp = r.GP ?? 0;
      return {
        Season:                  seasonId,
        SeasonYear:              endYear,
        Team:                    toAppAbbr(r.TEAM_ABBREVIATION ?? ''),
        Games:                   gp,
        Minutes:                 parseFloat(r.MIN)  || 0,
        Points:                  parseFloat(r.PTS)  || 0,
        Rebounds:                parseFloat(r.REB)  || 0,
        Assists:                 parseFloat(r.AST)  || 0,
        Steals:                  parseFloat(r.STL)  || 0,
        BlockedShots:            parseFloat(r.BLK)  || 0,
        Turnovers:               parseFloat(r.TOV)  || 0,
        FieldGoalsMade:          r.FGM ?? 0,
        FieldGoalsAttempted:     r.FGA ?? 0,
        FieldGoalsPercentage:    parseFloat(r.FG_PCT)  || 0,
        ThreePointersMade:       r.FG3M ?? 0,
        ThreePointersAttempted:  r.FG3A ?? 0,
        ThreePointersPercentage: parseFloat(r.FG3_PCT) || 0,
        FreeThrowsMade:          r.FTM ?? 0,
        FreeThrowsAttempted:     r.FTA ?? 0,
        FreeThrowsPercentage:    parseFloat(r.FT_PCT)  || 0,
      };
    }).sort((a, b) => a.SeasonYear - b.SeasonYear);

    // Career stats are pure history — never change, cache forever
    writeDisk(cacheKey, seasons, TTL_FOREVER);
    return seasons;
  } catch {
    return [];
  }
}

// ── NBA ID map ────────────────────────────────────────────────────────────────
// ── Retired vs active TTL helper ─────────────────────────────────────────────
// Dynamically compute the "active" season year.
// NBA season runs Oct→Jun. Season year = the calendar year it ENDS.
// Jul-Sep = offseason: no active season, cache everything as permanent.
const TTL_FOREVER  = 86400 * 365 * 10; // 10 years — effectively permanent
const TTL_BIO      = 86400 * 60;       // 60 days for player bio (physical data rarely changes)
const TTL_CAREER   = 86400 * 365;      // 1 year (mostly unused, career stats cache forever)
const TTL_SEASON   = 86400 * 7;        // 7 days for active season stats / game logs

// A season (e.g. 2025 = 2024-25) is complete once we're past its end year.
// season 2025 ends June 2025 → complete any time in 2026+
// season 2026 ends June 2026 → complete from July 2026 onwards
function isSeasonComplete(season) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1-12
  if (y > season) return true;          // clearly past
  if (y === season && m >= 8) return true; // Aug+ of end year = offseason
  return false;
}

// Keep for retired-player check
function activeSeasonYear() {
  const m = new Date().getMonth() + 1;
  const y = new Date().getFullYear();
  if (m >= 10) return y + 1;
  if (m <= 6)  return y;
  return null;
}
const CURRENT_SEASON_YEAR = activeSeasonYear() ?? 9999;

// Check if we're in offseason (July-Sep: no games, cache everything forever)
function isOffseason() {
  const m = new Date().getMonth() + 1;
  return m >= 7 && m <= 9;
}

// Adjust TTL based on offseason — during July-Sep, cache everything forever
function adjustTtlForOffseason(ttl) {
  return isOffseason() ? TTL_FOREVER : ttl;
}

function isRetiredFromCareer(seasons) {
  if (!seasons?.length) return false;
  const lastYear = Math.max(...seasons.map(s => s.SeasonYear ?? 0));
  return lastYear < CURRENT_SEASON_YEAR;
}

// ── Draft history ─────────────────────────────────────────────────────────────

// Reverse ESPN team ID → app abbreviation
const ESPN_ID_TO_APP = Object.fromEntries(Object.entries(ESPN_TEAM_IDS).map(([k, v]) => [v, k]));

export async function getDraftClass(year) {
  year = parseInt(year);
  const espnSeason = year; // ESPN uses same year as the draft (2024 = 2024 draft)
  const cacheKey = `draft_class_${year}`;

  const cached = readDisk(cacheKey);
  if (cached !== undefined) {
    // Fix stats in background using career_seasons_ cache as ground truth (corrects wrong ESPN data)
    const fixablePicks = cached.filter(p => p.NbaId && existsDisk(`career_seasons_${p.NbaId}`));
    let needsSave = false;
    for (const pick of fixablePicks) {
      const seasons = readDisk(`career_seasons_${pick.NbaId}`);
      if (!seasons?.length) continue;
      // Aggregate career totals from the verified career_seasons data
      const byYear = new Map();
      for (const s of seasons) {
        const yr = s.Season;
        if (!byYear.has(yr) || s.Games > (byYear.get(yr).Games ?? 0)) byYear.set(yr, s);
      }
      let totalGP = 0, sumPTS = 0, sumREB = 0, sumAST = 0;
      for (const s of byYear.values()) {
        totalGP += s.Games; sumPTS += s.Points * s.Games; sumREB += s.Rebounds * s.Games; sumAST += s.Assists * s.Games;
      }
      if (!totalGP) continue;
      const correct = { GP: totalGP, PTS: Math.round(sumPTS/totalGP*10)/10, REB: Math.round(sumREB/totalGP*10)/10, AST: Math.round(sumAST/totalGP*10)/10 };
      // Only update if different (fixes wrong ESPN data like Tito Maddox 583 GP)
      if (!pick.Stats || pick.Stats.GP !== correct.GP) { pick.Stats = correct; needsSave = true; }
    }
    if (needsSave) writeDisk(cacheKey, cached, 86400 * 365);
    return cached;
  }

  const coreClient = axios.create({ baseURL: 'https://sports.core.api.espn.com', timeout: 12000 });

  // Step 1: get all athlete $refs — paginate (cap at 5 pages; some years have anomalous counts)
  const athleteRefs = [];
  let page = 1;
  while (page <= 5) {
    const { data: listData } = await coreClient.get(
      `/v2/sports/basketball/leagues/nba/seasons/${espnSeason}/draft/athletes?limit=60&page=${page}&lang=en&region=us`
    );
    const items = (listData.items ?? []).map(i => i['$ref']).filter(Boolean);
    athleteRefs.push(...items);
    if (page >= (listData.pageCount ?? 1) || items.length === 0) break;
    page++;
  }
  if (!athleteRefs.length) return [];

  // Batched parallel fetch helper — avoids overwhelming connection pool
  async function batchFetch(urls, batchSize = 20, customClient = null) {
    const client = customClient ?? coreClient;
    const results = [];
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(url => url === '__skip__'
          ? Promise.resolve(null)
          : client.get(url).then(r => r.data).catch(() => null)
        )
      );
      results.push(...batchResults);
    }
    return results;
  }

  // Step 2: fetch all athlete details in batches
  const athleteDetails = await batchFetch(athleteRefs);
  const validAthletes = athleteDetails.filter(a => a && a.pick?.['$ref']); // only actual draftees

  // Extract pick $refs to fetch team assignments
  const pickRefs = validAthletes.map(a => a.pick['$ref']);
  const pickDetails = await batchFetch(pickRefs);

  // Build pick map: athleteId → { overall, team }
  const pickByRef = {};
  validAthletes.forEach((a, i) => {
    const pickRef = a.pick?.['$ref'];
    if (pickRef && pickDetails[i]) {
      pickByRef[pickRef] = pickDetails[i];
    }
  });

  const picks = validAthletes.map(a => {
    const pickRef  = a.pick?.['$ref'] ?? '';
    const pickData = pickByRef[pickRef] ?? {};
    const m        = pickRef.match(/rounds\/(\d+)\/picks\/(\d+)/);
    const round    = m ? parseInt(m[1]) : null;
    const teamRef  = pickData.team?.['$ref'] ?? '';
    const teamEspnId = teamRef.match(/\/teams\/(\d+)/)?.[1];
    const teamAbbr = teamEspnId ? (ESPN_ID_TO_APP[parseInt(teamEspnId)] ?? null) : null;

    // Draft athlete ID from $ref (for headshot)
    const draftId    = a.id ?? '';
    const athleteRef = a.athlete?.['$ref'] ?? '';
    // NBA athlete ref: /nba/athletes/ID  — use directly
    // College athlete ref: /mens-college-basketball/athletes/ID — same ID works for NBA headshot
    const espnId = athleteRef.match(/\/athletes\/(\d+)/)?.[1];
    const rawHref = espnId
      ? `//a.espncdn.com/i/headshots/nba/players/full/${espnId}.png`
      : (a.headshot?.href || `//a.espncdn.com/i/headshots/nbadraft/players/full/${draftId}.png`);
    const headshotUrl = rawHref.startsWith('//') ? `https:${rawHref}` : rawHref;

    return {
      Overall:   pickData.overall ?? null,
      Round:     round,
      Pick:      pickData.pick ?? null,
      Name:      decodeHtml(a.fullName ?? a.displayName ?? ''),
      Position:  a.position?.abbreviation ?? '',
      Team:      teamAbbr,
      College:   a.leagueAffiliation ?? '',
      PhotoUrl:  headshotUrl,
      DraftId:   draftId,
      EspnId:    espnId,   // keep for stats lookup
    };
  }).filter(p => p.Overall).sort((a, b) => a.Overall - b.Overall);

  // Resolve missing ESPN IDs via team roster (for newly-drafted players whose
  // draft record has no athlete.$ref yet)
  const missingIdx = picks.map((p, i) => (!p.EspnId && p.Team) ? i : -1).filter(i => i >= 0);
  if (missingIdx.length > 0) {
    // Build team → roster map (fetch each unique team once)
    const teams = [...new Set(missingIdx.map(i => picks[i].Team))];
    const rosterMap = {};
    await Promise.all(teams.map(async team => {
      const espnTeamId = ESPN_TEAM_IDS[team];
      if (!espnTeamId) return;
      try {
        const { data } = await espnClient.get(`/apis/site/v2/sports/basketball/nba/teams/${espnTeamId}/roster`);
        rosterMap[team] = data.athletes ?? [];
      } catch {}
    }));

    // Normalize name for fuzzy matching (strip accents, lowercase, collapse spaces)
    const normalize = str => str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g,' ').trim();

    missingIdx.forEach(i => {
      const pick = picks[i];
      const roster = rosterMap[pick.Team] ?? [];
      const normPickName = normalize(pick.Name);
      const match = roster.find(a => normalize(a.fullName ?? '') === normPickName || normalize(a.displayName ?? '') === normPickName);
      if (match?.id) {
        pick.EspnId = match.id;
        // Update headshot too
        pick.PhotoUrl = `https://a.espncdn.com/i/headshots/nba/players/full/${match.id}.png`;
      }
    });
  }

  // Batch-fetch ESPN career stats for all picks that have an EspnId
  const statsClient = axios.create({ baseURL: 'https://site.web.api.espn.com', timeout: 10000 });
  const statsResults = await batchFetch(
    picks.map(p => p.EspnId
      ? `https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${p.EspnId}/stats`
      : '__skip__'),
    15, statsClient
  );

  picks.forEach((pick, i) => {
    const statsData = statsResults[i];
    if (!statsData || statsData.code) { pick.Stats = null; return; }
    const avgCat = (statsData.categories ?? []).find(c => (c.displayName ?? '').includes('Regular Season Averages'));
    if (!avgCat?.statistics?.length) { pick.Stats = null; return; }
    const labels = avgCat.labels ?? [];
    const idxOf  = (l) => labels.indexOf(l);
    const byYear = new Map();
    for (const season of avgCat.statistics) {
      const yr = season.season?.year ?? season.season?.displayName ?? 'unknown';
      const gpIdx = idxOf('GP');
      const gp = parseFloat((season.stats ?? [])[gpIdx]) || 0;
      const existing = byYear.get(yr);
      const existingGp = existing ? parseFloat((existing.stats ?? [])[gpIdx]) || 0 : -1;
      if (!existing || gp > existingGp) byYear.set(yr, season);
    }
    let totalGP = 0, sumPTS = 0, sumREB = 0, sumAST = 0;
    for (const season of byYear.values()) {
      const arr = season.stats ?? [];
      const gp = parseFloat(arr[idxOf('GP')]) || 0;
      if (!gp) continue;
      totalGP += gp;
      sumPTS  += (parseFloat(arr[idxOf('PTS')]) || 0) * gp;
      sumREB  += (parseFloat(arr[idxOf('REB')]) || 0) * gp;
      sumAST  += (parseFloat(arr[idxOf('AST')]) || 0) * gp;
    }
    if (!totalGP) { pick.Stats = null; return; }
    pick.Stats = {
      GP:  totalGP,
      PTS: Math.round(sumPTS / totalGP * 10) / 10,
      REB: Math.round(sumREB / totalGP * 10) / 10,
      AST: Math.round(sumAST / totalGP * 10) / 10,
    };
    delete pick.EspnId;
  });

  // Resolve NBA.com player IDs — use full historical list so retired/inactive players resolve too
  try {
    const allPlayers = await getAllHistoricalPlayers();
    const norm = str => str.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

    // Known ESPN display name → NBA.com display name mismatches (nicknames, Jr. omissions, etc.)
    const ALIASES = {
      'edrice adebayo':        'bam adebayo',
      'guillermo hernangomez': 'willy hernangomez',
      'dennis smith':          'dennis smith jr.',
      'gary trent':            'gary trent jr.',
      'wendell carter':        'wendell carter jr.',
      'larry nance':           'larry nance jr.',
      'tim hardaway':          'tim hardaway jr.',
      'kelly oubre':           'kelly oubre jr.',
      'otto porter':           'otto porter jr.',
      'reggie bullock':        'reggie bullock jr.',
      'ron holland':           'ronald holland ii',
    };

    const fullMap = new Map(allPlayers.map(p => [norm(`${p.FirstName} ${p.LastName}`), p.PlayerID]));

    // Build init map but track collisions — don't use init key if multiple players share it
    const initCount = new Map();
    const initMap   = new Map();
    for (const p of allPlayers) {
      const key = norm(`${p.FirstName[0] ?? ''} ${p.LastName}`);
      initCount.set(key, (initCount.get(key) ?? 0) + 1);
      initMap.set(key, p.PlayerID);
    }

    picks.forEach(pick => {
      const normName = norm(pick.Name);
      const lookupName = ALIASES[normName] ?? normName;

      if (fullMap.has(lookupName)) {
        pick.NbaId = fullMap.get(lookupName);
      } else {
        // Try adding/removing generational suffixes — ESPN and NBA.com often disagree
        const SUFFIXES = [' jr.', ' sr.', ' ii', ' iii', ' iv'];
        const stripped = SUFFIXES.reduce((n, s) => n.endsWith(s) ? n.slice(0, -s.length).trim() : n, lookupName);
        // Try each suffix appended, or try the stripped version
        const suffixMatch = stripped !== lookupName
          ? fullMap.get(stripped)
          : SUFFIXES.map(s => fullMap.get(lookupName + s)).find(Boolean);
        if (suffixMatch) { pick.NbaId = suffixMatch; }
        else {
          const parts = lookupName.split(' ');
          const initKey = `${parts[0]?.[0] ?? ''} ${parts.slice(1).join(' ')}`;
          pick.NbaId = (initCount.get(initKey) === 1) ? (initMap.get(initKey) ?? null) : null;
        }
      }

      // Use NBA.com CDN headshot for any pick with a resolved NbaId — more reliable than ESPN for old/invalid IDs
      if (pick.NbaId) {
        pick.PhotoUrl = `https://cdn.nba.com/headshots/nba/latest/1040x760/${pick.NbaId}.png`;
      }
    });
  } catch {}

  // NBA.com fallback for picks where ESPN returned no stats — batched to avoid rate limiting
  const nullStatPicks = picks.filter(p => p.Stats === null && p.NbaId);
  for (let i = 0; i < nullStatPicks.length; i += 5) {
    await Promise.all(nullStatPicks.slice(i, i + 5).map(async pick => {
      try {
        const data = await nbFetch('/stats/playercareerstats', { PlayerID: pick.NbaId, PerMode: 'PerGame' }, 86400 * 30, `career_pg_${pick.NbaId}`);
        const rows = parseRS(data.resultSets, 'SeasonTotalsRegularSeason');
        if (!rows.length) return;
        const byYear = new Map();
        for (const r of rows) {
          const yr = r.SEASON_ID;
          const gp = r.GP ?? 0;
          if (!byYear.has(yr) || gp > (byYear.get(yr).GP ?? 0)) byYear.set(yr, { GP: gp, PTS: r.PTS ?? 0, REB: r.REB ?? 0, AST: r.AST ?? 0 });
        }
        let totalGP = 0, sumPTS = 0, sumREB = 0, sumAST = 0;
        for (const s of byYear.values()) {
          totalGP += s.GP;
          sumPTS  += s.PTS * s.GP;
          sumREB  += s.REB * s.GP;
          sumAST  += s.AST * s.GP;
        }
        if (!totalGP) return;
        pick.Stats = {
          GP:  totalGP,
          PTS: Math.round(sumPTS / totalGP * 10) / 10,
          REB: Math.round(sumREB / totalGP * 10) / 10,
          AST: Math.round(sumAST / totalGP * 10) / 10,
        };
      } catch {}
    }));
  }

  // Cache for a long time — draft data never changes
  writeDisk(cacheKey, picks, 86400 * 365);
  return picks;
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
