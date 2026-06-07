import axios from 'axios';
import NodeCache from 'node-cache';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR    = join(__dirname, '../../../cache_sb');
const OLD_CACHE_DIR = join(__dirname, '../../../cache');
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

// ── Name → NbaDotComPlayerID map (built from old SportsData cache) ────────────
// Gives us NBA.com headshot URLs even though SportsBlaze doesn't provide IDs.

let _nameToNbaId = null;

function getNameToNbaIdMap() {
  if (_nameToNbaId) return _nameToNbaId;
  const map = {};
  try {
    const file = join(OLD_CACHE_DIR, '_scores_json_Players.json');
    if (existsSync(file)) {
      const { data } = JSON.parse(readFileSync(file, 'utf8'));
      for (const p of (data ?? [])) {
        if (p.NbaDotComPlayerID) {
          const key = `${p.FirstName} ${p.LastName}`.toLowerCase().trim();
          map[key] = p.NbaDotComPlayerID;
        }
      }
    }
  } catch {}
  _nameToNbaId = map;
  return map;
}

const memCache = new NodeCache();

const client = axios.create({
  baseURL: 'https://api.sportsblaze.com',
  params: { key: process.env.SPORT_BLAZE_KEY },
});

// ── Cache helpers (same pattern as sportsData.js) ─────────────────────────────

function fileKey(path) {
  return path.replace(/[^a-zA-Z0-9]/g, '_') + '.json';
}

function readDiskCache(path, { allowStale = false } = {}) {
  const file = join(CACHE_DIR, fileKey(path));
  if (!existsSync(file)) return undefined;
  try {
    const { data, expires } = JSON.parse(readFileSync(file, 'utf8'));
    if (Date.now() < expires || allowStale) return data;
  } catch {}
  return undefined;
}

function writeDiskCache(path, data, ttl) {
  const file = join(CACHE_DIR, fileKey(path));
  try {
    writeFileSync(file, JSON.stringify({ data, expires: Date.now() + ttl * 1000 }));
  } catch {}
}

// Past dates have final scores that never change — cache forever
function ttlForPath(path, baseTtl) {
  const dateMatch = path.match(/\/boxscores\/daily\/(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    const gameDate = new Date(dateMatch[1] + 'T12:00:00Z');
    const yesterday = new Date(Date.now() - 86400 * 1000);
    if (gameDate < yesterday) return 86400 * 30; // past date → 30-day cache
  }
  return baseTtl;
}

async function sbFetch(path, ttl = 300) {
  const effectiveTtl = ttlForPath(path, ttl);

  const memHit = memCache.get(path);
  if (memHit !== undefined) return memHit;

  const diskHit = readDiskCache(path);
  if (diskHit !== undefined) {
    memCache.set(path, diskHit, effectiveTtl);
    return diskHit;
  }

  try {
    const { data } = await client.get(path);

    // SportsBlaze sends rate-limit errors as HTTP 200 with {error: "Too many requests"}
    if (data?.error) {
      const isRateLimit = /too many|quota|rate/i.test(data.error);
      if (isRateLimit) {
        const stale = readDiskCache(path, { allowStale: true });
        if (stale !== undefined) {
          memCache.set(path, stale, 30); // retry quickly
          return stale;
        }
      }
      throw new Error(data.error);
    }

    memCache.set(path, data, effectiveTtl);
    writeDiskCache(path, data, effectiveTtl);
    return data;
  } catch (err) {
    const status = err?.response?.status;
    // 404 on a daily boxscore = no games that day
    if (status === 404 && path.includes('/boxscores/daily/')) {
      const empty = { games: [] };
      memCache.set(path, empty, 300);
      return empty;
    }
    // HTTP-level quota/server errors — fall back to stale disk cache
    if (status === 403 || status === 429 || status >= 500) {
      const stale = readDiskCache(path, { allowStale: true });
      if (stale !== undefined) {
        memCache.set(path, stale, 30);
        return stale;
      }
    }
    throw err;
  }
}

// ── ID helpers ────────────────────────────────────────────────────────────────

// Deterministic UUID → 32-bit int
function uuidToInt(uuid) {
  if (!uuid) return 0;
  return parseInt(uuid.replace(/-/g, '').slice(0, 8), 16);
}

// ── Team name → abbreviation map (built once from standings) ─────────────────

let _teamNameToAbbr = null;
let _teamAbbrInfo   = null;  // abbr → { id, city, nickname, conference, division, logo }

async function getTeamMaps() {
  if (_teamNameToAbbr) return { nameToAbbr: _teamNameToAbbr, abbrInfo: _teamAbbrInfo };
  const data = await sbFetch('/nba/v1/standings/2025.json', 86400);
  const nameToAbbr = {};
  const abbrInfo   = {};
  for (const t of (data.teams ?? [])) {
    nameToAbbr[t.name] = t.abbreviation;
    abbrInfo[t.abbreviation] = {
      id: t.id, city: t.location, nickname: t.nickname,
      conference: t.conference, division: t.division, logo: t.logo,
    };
  }
  _teamNameToAbbr = nameToAbbr;
  _teamAbbrInfo   = abbrInfo;
  return { nameToAbbr, abbrInfo };
}

// ── Field mappers ─────────────────────────────────────────────────────────────

function mapStatus(s) {
  if (!s) return 'Scheduled';
  const l = s.toLowerCase().replace(/[\s_-]/g, '');
  if (l === 'final' || l.startsWith('f/')) return 'Final';
  if (l === 'inprogress' || l === 'live') return 'InProgress';
  if (l === 'unnecessary' || l === 'notnecessary') return 'NotNecessary';
  if (l === 'scheduled') return 'Scheduled';
  return s;
}

function mapSeasonType(type) {
  if (!type) return 1;
  const l = type.toLowerCase();
  if (l.includes('playoff')) return 3;
  if (l.includes('pre'))     return 2;
  return 1;
}

function utcToLocalDate(isoStr) {
  // SportsBlaze timestamps are UTC. Evening US games (e.g. 19:00 ET = 23:00/00:00 UTC)
  // end up on the next UTC date. Convert to US/Eastern approximate local date instead.
  if (!isoStr) return null;
  // Shift back 5 hours (ET) to get the "game day" as the US viewer sees it
  const d = new Date(new Date(isoStr).getTime() - 5 * 60 * 60 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mapGame(g, nameToAbbr) {
  const awayAbbr = nameToAbbr[g.teams?.away?.name] ?? g.teams?.away?.name ?? '';
  const homeAbbr = nameToAbbr[g.teams?.home?.name] ?? g.teams?.home?.name ?? '';
  const awayScore = g.scores?.total?.away?.points ?? null;
  const homeScore = g.scores?.total?.home?.points ?? null;

  // Current quarter from periods
  const periods = g.scores?.periods ?? [];

  return {
    GameID:               uuidToInt(g.id),
    _uuid:                g.id,
    Season:               g.season?.year ?? 2025,
    SeasonType:           mapSeasonType(g.season?.type),
    Status:               mapStatus(g.status),
    Day:                  utcToLocalDate(g.date),
    DateTime:             g.date ?? null,
    AwayTeam:             awayAbbr,
    HomeTeam:             homeAbbr,
    AwayTeamID:           uuidToInt(g.teams?.away?.id),
    HomeTeamID:           uuidToInt(g.teams?.home?.id),
    AwayTeamScore:        awayScore,
    HomeTeamScore:        homeScore,
    Quarter:              mapStatus(g.status) === 'InProgress' ? String(periods.length) : null,
    TimeRemainingMinutes: null,
    TimeRemainingSeconds: null,
    Channel:              Array.isArray(g.broadcasts)
                            ? (typeof g.broadcasts[0] === 'string' ? g.broadcasts[0] : g.broadcasts[0]?.name ?? null)
                            : null,
    Attendance:           g.venue?.attendance ?? null,
    // SeriesInfo not provided by SportsBlaze — computed by bracket logic
  };
}

function mapStanding(t) {
  const reg     = t.records?.find(r => r.split === 'Regular Season') ?? t.records?.[0] ?? {};
  const confRank = t.standings?.find(s => s.name === 'Conference')?.sequence ?? 0;
  return {
    Season:             2025,
    TeamID:             uuidToInt(t.id),
    Key:                t.abbreviation,
    City:               t.location,
    Name:               t.nickname,
    Conference:         t.conference,
    Division:           t.division,
    Wins:               reg.wins    ?? 0,
    Losses:             reg.losses  ?? 0,
    Percentage:         reg.pct     ?? 0,
    GamesBack:          0,           // not provided
    StreakDescription:  '',          // not provided — computed below if possible
    PointsPerGameFor:   0,
    PointsPerGameAgainst: 0,
    HomeWins:           0,
    HomeLosses:         0,
    AwayWins:           0,
    AwayLosses:         0,
    LastTenWins:        0,
    LastTenLosses:      0,
    ConferenceRank:     confRank,
  };
}

function mapPlayer(p, teamAbbr, teamUuid) {
  return {
    PlayerID:           uuidToInt(p.id),
    _uuid:              p.id,
    FirstName:          p.first  ?? p.name?.split(' ')[0] ?? '',
    LastName:           p.last   ?? p.name?.split(' ').slice(1).join(' ') ?? '',
    Team:               teamAbbr,
    TeamID:             uuidToInt(teamUuid),
    Position:           p.position ?? '',
    Jersey:             parseInt(p.number) || 0,
    Height:             p.height ?? 0,   // already in inches
    Weight:             p.weight ?? 0,
    BirthDate:          p.birthdate ?? null,
    BirthCity:          '',
    BirthState:         '',
    BirthCountry:       '',
    College:            null,
    Experience:         0,
    Salary:             0,
    Status:             'Active',
    PhotoUrl:           null,
    UsaTodayHeadshotUrl: null,
    NbaDotComPlayerID:  null,
  };
}

function mapPlayerGameStats(p, game, side, teamAbbr) {
  const s = p.stats ?? {};
  return {
    PlayerID:                 uuidToInt(p.id),
    _uuid:                    p.id,
    Name:                     p.name ?? '',
    Team:                     teamAbbr,
    Position:                 p.position ?? '',
    Season:                   game.Season,
    GameID:                   game.GameID,
    Opponent:                 side === 'away' ? game.HomeTeam : game.AwayTeam,
    HomeOrAway:               side === 'home' ? 'HOME' : 'AWAY',
    Day:                      game.Day,
    Started:                  p.started ? 1 : 0,
    Games:                    p.played ? 1 : 0,
    Minutes:                  s.minutes             ?? 0,
    Points:                   s.points              ?? 0,
    Rebounds:                 s.rebounds            ?? 0,
    Assists:                  s.assists             ?? 0,
    Steals:                   s.steals              ?? 0,
    BlockedShots:             s.blocks              ?? 0,
    Turnovers:                s.turnovers           ?? 0,
    FieldGoalsPercentage:     s.field_goals_pct     ?? 0,
    ThreePointersPercentage:  s.three_pointers_pct  ?? 0,
    FreeThrowsPercentage:     s.free_throws_pct     ?? 0,
    TrueShootingPercentage:   0,
    PlayerEfficiencyRating:   0,
    UsageRatePercentage:      0,
    PlusMinus:                s.plus_minus          ?? 0,
    DoubleDoubles:            0,
    TripleDoubles:            0,
  };
}

// ── Games ─────────────────────────────────────────────────────────────────────

export async function getGamesByDate(date) {
  // date: YYYY-MM-DD
  const { nameToAbbr } = await getTeamMaps();
  const data = await sbFetch(`/nba/v1/boxscores/daily/${date}.json`, 120);
  return (data.games ?? []).map(g => {
    const mapped = mapGame(g, nameToAbbr);
    // Pull live quarter info from boxscore
    if (mapped.Status === 'InProgress') {
      const periods = g.scores?.periods ?? [];
      mapped.Quarter = String(periods.length);
    }
    return mapped;
  });
}

export async function getGameById(gameId) {
  const all = await getSchedule(2025);
  return all.find(g => g.GameID === Number(gameId)) ?? null;
}

export async function getLiveGames() {
  const today = new Date().toISOString().split('T')[0];
  const games = await getGamesByDate(today);
  return games.filter(g => g.Status === 'InProgress');
}

export async function getSchedule(season) {
  const { nameToAbbr } = await getTeamMaps();
  const data = await sbFetch(`/nba/v1/schedule/season/${season}.json`, 86400);
  return (data.games ?? []).map(g => mapGame(g, nameToAbbr));
}

export async function getTeamSchedule(season, team) {
  const games = await getSchedule(season);
  return games.filter(g => g.HomeTeam === team || g.AwayTeam === team);
}

// ── Box score ─────────────────────────────────────────────────────────────────

function shiftDate(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

export async function getBoxScore(gameId) {
  const { nameToAbbr } = await getTeamMaps();

  // Find which date this game was played
  const schedule = await getSchedule(2025);
  let game = schedule.find(g => g.GameID === Number(gameId));
  if (!game) {
    const prev = await getSchedule(2024);
    game = prev.find(g => g.GameID === Number(gameId));
  }
  if (!game) throw new Error(`Game ${gameId} not found in schedule`);

  const ttl = game.Status === 'Final' ? 86400 * 30 : 120;

  // Try game day, then ±1 day to handle UTC offset edge cases
  const datesToTry = [game.Day, shiftDate(game.Day, 1), shiftDate(game.Day, -1)];
  let boxGame = null;
  for (const date of datesToTry) {
    const data = await sbFetch(`/nba/v1/boxscores/daily/${date}.json`, ttl);
    boxGame = (data.games ?? []).find(g => uuidToInt(g.id) === Number(gameId));
    if (boxGame) break;
  }
  if (!boxGame) throw new Error(`Box score not found for game ${gameId}`);

  const mapped = mapGame(boxGame, nameToAbbr);

  const awayPlayers = (boxGame.rosters?.away ?? []).map(p =>
    mapPlayerGameStats(p, mapped, 'away', mapped.AwayTeam)
  );
  const homePlayers = (boxGame.rosters?.home ?? []).map(p =>
    mapPlayerGameStats(p, mapped, 'home', mapped.HomeTeam)
  );

  // Build TeamGames from SportsBlaze team stats (used by FactsTab)
  function mapTeamStats(sbStats, teamAbbr) {
    if (!sbStats) return null;
    const s = sbStats;
    return {
      Team:                    teamAbbr,
      Points:                  s.points               ?? 0,
      FieldGoalsMade:          s.field_goals_made      ?? 0,
      FieldGoalsAttempted:     s.field_goals_attempts  ?? 0,
      FieldGoalsPercentage:    s.field_goals_pct != null ? Math.round(s.field_goals_pct * 100) : 0,
      ThreePointersMade:       s.three_pointers_made   ?? 0,
      ThreePointersAttempted:  s.three_pointers_attempts ?? 0,
      ThreePointersPercentage: s.three_pointers_pct != null ? Math.round(s.three_pointers_pct * 100) : 0,
      FreeThrowsMade:          s.free_throws_made      ?? 0,
      FreeThrowsAttempted:     s.free_throws_attempts  ?? 0,
      FreeThrowsPercentage:    s.free_throws_pct != null ? Math.round(s.free_throws_pct * 100) : 0,
      Rebounds:                s.rebounds              ?? 0,
      OffensiveRebounds:       s.rebounds_offensive    ?? 0,
      DefensiveRebounds:       s.rebounds_defensive    ?? 0,
      Assists:                 s.assists               ?? 0,
      Steals:                  s.steals                ?? 0,
      BlockedShots:            s.blocks                ?? 0,
      Turnovers:               s.turnovers             ?? 0,
      PersonalFouls:           s.fouls_personal        ?? 0,
      PointsInThePaint:        s.points_in_the_paint   ?? 0,
      FastBreakPoints:         s.points_fast_break     ?? 0,
      PointsOffTurnovers:      s.points_from_turnovers ?? 0,
    };
  }

  const awayTeamStats = mapTeamStats(boxGame.stats?.away, mapped.AwayTeam);
  const homeTeamStats = mapTeamStats(boxGame.stats?.home, mapped.HomeTeam);
  const teamGames = [awayTeamStats, homeTeamStats].filter(Boolean);

  return {
    Game:        mapped,
    PlayerGames: [...awayPlayers, ...homePlayers],
    TeamGames:   teamGames,
    HomeTeam:    { Team: mapped.HomeTeam, Players: homePlayers },
    AwayTeam:    { Team: mapped.AwayTeam, Players: awayPlayers },
  };
}

// ── Standings ─────────────────────────────────────────────────────────────────

export async function getStandings(season = 2025) {
  const data = await sbFetch(`/nba/v1/standings/${season}.json`, 900);
  const standings = (data.teams ?? []).map(mapStanding);

  // Enrich with home/away/L10/streak by scanning cached schedule if available
  try {
    const schedule = await getSchedule(season);
    const FINAL = ['Final'];
    for (const st of standings) {
      const teamGames = schedule.filter(
        g => (g.HomeTeam === st.Key || g.AwayTeam === st.Key) && FINAL.includes(g.Status)
      ).sort((a, b) => (a.Day ?? '').localeCompare(b.Day ?? ''));

      let hw = 0, hl = 0, aw = 0, al = 0;
      const last10 = teamGames.slice(-10);
      let l10w = 0, l10l = 0;
      let streak = 0;
      let streakType = '';

      for (const g of teamGames) {
        const isHome = g.HomeTeam === st.Key;
        const myPts  = isHome ? g.HomeTeamScore : g.AwayTeamScore;
        const oppPts = isHome ? g.AwayTeamScore : g.HomeTeamScore;
        const won    = myPts > oppPts;
        if (isHome) won ? hw++ : hl++;
        else        won ? aw++ : al++;
      }
      for (const g of last10) {
        const isHome = g.HomeTeam === st.Key;
        const won = (isHome ? g.HomeTeamScore : g.AwayTeamScore) > (isHome ? g.AwayTeamScore : g.HomeTeamScore);
        won ? l10w++ : l10l++;
      }
      // Build streak from most recent games
      for (let i = teamGames.length - 1; i >= 0; i--) {
        const g = teamGames[i];
        const isHome = g.HomeTeam === st.Key;
        const won = (isHome ? g.HomeTeamScore : g.AwayTeamScore) > (isHome ? g.AwayTeamScore : g.HomeTeamScore);
        const type = won ? 'W' : 'L';
        if (!streakType) streakType = type;
        if (type !== streakType) break;
        streak++;
      }

      st.HomeWins    = hw;
      st.HomeLosses  = hl;
      st.AwayWins    = aw;
      st.AwayLosses  = al;
      st.LastTenWins = l10w;
      st.LastTenLosses = l10l;
      st.StreakDescription = streakType ? `${streakType}${streak}` : '';
    }
  } catch {}

  return standings;
}

// ── Teams ─────────────────────────────────────────────────────────────────────

export async function getAllTeams() {
  const data = await sbFetch('/nba/v1/standings/2025.json', 86400);
  return (data.teams ?? []).map(t => ({
    TeamID:           uuidToInt(t.id),
    Key:              t.abbreviation,
    City:             t.location,
    Name:             t.nickname,
    FullName:         t.name,
    Conference:       t.conference,
    Division:         t.division,
    WikipediaLogoUrl: t.logo,
  }));
}

export async function getTeamRoster(team) {
  const data = await sbFetch('/nba/v1/players.json', 3600);
  const teamData = (data.teams ?? []).find(t => t.abbreviation === team);
  if (!teamData) return [];
  return (teamData.players ?? []).map(p => mapPlayer(p, teamData.abbreviation, teamData.id));
}

// ── Players ───────────────────────────────────────────────────────────────────

export async function getAllPlayers() {
  const data = await sbFetch('/nba/v1/players.json', 86400);
  const players = [];
  for (const t of (data.teams ?? [])) {
    for (const p of (t.players ?? [])) {
      players.push(mapPlayer(p, t.abbreviation, t.id));
    }
  }
  return players;
}

export async function getPlayerById(playerId) {
  const all = await getAllPlayers();
  return all.find(p => p.PlayerID === Number(playerId)) ?? null;
}

// ── Player game logs (aggregated from season box scores) ─────────────────────

export async function getPlayerGameLogs(season, playerId) {
  const cacheKey = `_sb_player_logs_${season}_${playerId}`;
  const mem = memCache.get(cacheKey);
  if (mem !== undefined) return mem;
  const disk = readDiskCache(cacheKey);
  if (disk !== undefined) { memCache.set(cacheKey, disk, 900); return disk; }

  const schedule = await getSchedule(season);
  const dates = [...new Set(
    schedule
      .filter(g => g.Status === 'Final' && g.Day)
      .map(g => g.Day)
  )].sort();

  const { nameToAbbr } = await getTeamMaps();
  const logs = [];

  for (const date of dates) {
    try {
      const data = await sbFetch(`/nba/v1/boxscores/daily/${date}.json`, 86400 * 30);
      for (const boxGame of (data.games ?? [])) {
        const mapped = mapGame(boxGame, nameToAbbr);
        for (const side of ['away', 'home']) {
          const players  = boxGame.rosters?.[side] ?? [];
          const teamAbbr = side === 'away' ? mapped.AwayTeam : mapped.HomeTeam;
          for (const p of players) {
            if (uuidToInt(p.id) === Number(playerId)) {
              logs.push(mapPlayerGameStats(p, mapped, side, teamAbbr));
            }
          }
        }
      }
    } catch {}
  }

  writeDiskCache(cacheKey, logs, 3600);
  memCache.set(cacheKey, logs, 900);
  return logs;
}

// ── Player season stats (aggregated from game logs) ───────────────────────────

export async function getPlayerSeasonStats(season, playerId) {
  const logs = await getPlayerGameLogs(season, playerId);
  if (!logs.length) return null;

  const played = logs.filter(l => l.Games > 0);
  const n = played.length || 1;
  const avg = field => played.reduce((a, l) => a + (l[field] ?? 0), 0) / n;

  return {
    PlayerID:                Number(playerId),
    Season:                  Number(season),
    Games:                   played.length,
    Minutes:                 avg('Minutes'),
    Points:                  avg('Points'),
    Rebounds:                avg('Rebounds'),
    Assists:                 avg('Assists'),
    Steals:                  avg('Steals'),
    BlockedShots:            avg('BlockedShots'),
    Turnovers:               avg('Turnovers'),
    FieldGoalsPercentage:    avg('FieldGoalsPercentage'),
    ThreePointersPercentage: avg('ThreePointersPercentage'),
    FreeThrowsPercentage:    avg('FreeThrowsPercentage'),
    TrueShootingPercentage:  0,
    PlayerEfficiencyRating:  0,
    UsageRatePercentage:     0,
    PlusMinus:               avg('PlusMinus'),
    DoubleDoubles: played.filter(l => {
      const cats = [l.Points, l.Rebounds, l.Assists].filter(v => v >= 10);
      return cats.length >= 2;
    }).length,
    TripleDoubles: played.filter(l => {
      const cats = [l.Points, l.Rebounds, l.Assists].filter(v => v >= 10);
      return cats.length >= 3;
    }).length,
  };
}

export async function getAllPlayerSeasonStats(season) {
  const all = await getAllPlayers();
  return Promise.all(all.map(p => getPlayerSeasonStats(season, p.PlayerID)));
}

// ── NbaDotCom ID map (headshots) ──────────────────────────────────────────────
// Maps SportsBlaze PlayerID (hashed UUID) → NbaDotComPlayerID
// Matched by player name from the old SportsData cache file.

export async function getNbaIdMap() {
  const nameToNbaId = getNameToNbaIdMap();
  const all = await getAllPlayers();
  const map = {};
  for (const p of all) {
    const key = `${p.FirstName} ${p.LastName}`.toLowerCase().trim();
    const nbaId = nameToNbaId[key];
    if (nbaId) map[p.PlayerID] = nbaId;
  }
  return map;
}

// ── Playoffs ──────────────────────────────────────────────────────────────────

async function fetchPlayoffGames(season) {
  // SportsBlaze season schedule includes all season types — filter for Playoffs
  const all = await getSchedule(season);
  return all.filter(g => g.SeasonType === 3);
}

export async function getPlayoffBracket(season = 2025) {
  const [playoffGames, standingsData] = await Promise.all([
    fetchPlayoffGames(season),
    getStandings(season),
  ]);

  const seedMap = {};
  const east = standingsData.filter(t => t.Conference === 'Eastern').sort((a, b) => b.Percentage - a.Percentage);
  const west = standingsData.filter(t => t.Conference === 'Western').sort((a, b) => b.Percentage - a.Percentage);
  east.forEach((t, i) => { seedMap[t.Key] = i + 1; });
  west.forEach((t, i) => { seedMap[t.Key] = i + 1; });

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
    const byDate  = [...confPI].sort((a, b) => a.firstGameDate.localeCompare(b.firstGameDate));
    const decider = byDate[byDate.length - 1];
    const r1PI    = byDate.slice(0, byDate.length - 1);
    const minSeedOf = s => Math.min(...Object.values(s.seeds).filter(Boolean), 99);
    r1PI.sort((a, b) => minSeedOf(a) - minSeedOf(b));
    const game78 = r1PI[0];
    const w78  = game78  ? rawWinner(game78)  : null;
    const wDec = decider ? rawWinner(decider) : null;
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
    const winner = (wins[t1] ?? 0) >= 1 ? t1 : t2;
    return {
      teams: s.teams, wins, seeds: s.seeds, games: s.games,
      gamesPlayed: s.games.filter(g => DONE.includes(g.Status)).length,
      isComplete: s.games.some(g => DONE.includes(g.Status)),
      winner, firstGameDate: s.firstGameDate, isPlayIn: true,
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
    const isComplete = wins[t1] >= 4 || wins[t2] >= 4 ||
      s.games.some(g => g.Status === 'NotNecessary' || g.Status === 'Unnecessary');
    const leader  = wins[t1] >= wins[t2] ? t1 : t2;
    const trailer = leader === t1 ? t2 : t1;
    return {
      teams: s.teams, wins, seeds: s.seeds, games: s.games,
      gamesPlayed: s.games.filter(g => DONE.includes(g.Status)).length,
      isComplete, leader, trailer, firstGameDate: s.firstGameDate,
    };
  });

  const sortedByDate = [...series].sort((a, b) => a.firstGameDate.localeCompare(b.firstGameDate));
  const rounds = [];
  let remaining = [...sortedByDate];
  const roundSizes = [8, 4, 2, 1];
  const roundNames = ['First Round', 'Conference Semifinals', 'Conference Finals', 'NBA Finals'];
  for (let i = 0; i < roundSizes.length && remaining.length > 0; i++) {
    const chunk = remaining.splice(0, roundSizes[i]);
    if (chunk.length > 0) rounds.push({ round: i + 1, name: roundNames[i], series: chunk });
  }

  return { rounds, playIn: playInSeries, totalSeries: series.length };
}
