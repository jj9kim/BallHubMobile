import { Router } from 'express';
import { readdirSync } from 'fs';
import {
  getAllPlayers,
  getPlayerById,
  getPlayerSeasonStats,
  getPlayerPlayoffStats,
  getPlayerPlayoffStatsFromCache,
  getPlayerGameLogs,
  getAllPlayerSeasonStats,
  getNbaIdMap,
  getPlayerCareerStats,
  readDisk,
  existsDisk,
  CACHE_DIR,
} from '../services/nbaApiService.js';

const CURRENT_SEASON = (() => { const n = new Date(); return n.getMonth() + 1 >= 10 ? n.getFullYear() : n.getFullYear() - 1; })();

const router = Router();

// GET /api/players  — all players
router.get('/', async (req, res) => {
  try {
    const players = await getAllPlayers();
    res.json({ success: true, players, count: players.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/players/nba-id-map — maps SportsBlaze PlayerID → NbaDotComPlayerID
router.get('/nba-id-map', async (req, res) => {
  try {
    const map = await getNbaIdMap();
    res.json({ success: true, map });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/players/season-stats/:season  — all players' season averages
router.get('/season-stats/:season', async (req, res) => {
  try {
    const stats = await getAllPlayerSeasonStats(req.params.season);
    res.json({ success: true, stats, count: stats.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/players/league-stats/:season — must be before /:id wildcard
router.get('/league-stats/:season', async (req, res) => {
  try {
    const season = parseInt(req.params.season);
    const isPast = season < CURRENT_SEASON;
    const isPlayoffs = req.query.type === 'playoffs';
    const players = [];

    if (isPlayoffs) {
      const pattern = new RegExp(`^gamelogs_playoff_(\\d+)_${season}\\.json$`);
      const files = readdirSync(CACHE_DIR).filter(f => pattern.test(f));
      for (const fname of files) {
        const pid = parseInt(fname.match(pattern)?.[1]);
        if (!pid) continue;
        const stats = getPlayerPlayoffStatsFromCache(pid, season);
        if (!stats || !stats.Games) continue;
        const bio = await getPlayerById(pid);
        if (!bio) continue;
        players.push({
          PlayerID: pid, FirstName: bio.FirstName, LastName: bio.LastName,
          Team: bio.Team, Position: bio.Position,
          PhotoUrl: bio.PhotoUrl,
          stats,
        });
      }
    } else if (isPast) {
      const files = readdirSync(CACHE_DIR).filter(f => f.startsWith('career_seasons_') && f.endsWith('.json'));
      for (const fname of files) {
        const pid = parseInt(fname.replace('career_seasons_', '').replace('.json', ''));
        const career = readDisk(`career_seasons_${pid}`, { allowStale: true });
        if (!Array.isArray(career)) continue;
        const seasonRow = career.find(s => s.SeasonYear === season + 1);
        if (!seasonRow || !seasonRow.Games) continue;
        const bio = await getPlayerById(pid);
        if (!bio) continue;
        players.push({
          PlayerID: pid, FirstName: bio.FirstName, LastName: bio.LastName,
          Team: seasonRow.Team ?? bio.Team ?? '', Position: bio.Position,
          PhotoUrl: bio.PhotoUrl,
          stats: seasonRow,
        });
      }
    } else {
      const pattern = new RegExp(`^seasonstats_(\\d+)_${season}\\.json$`);
      const files = readdirSync(CACHE_DIR).filter(f => pattern.test(f));
      for (const fname of files) {
        const pid = parseInt(fname.match(pattern)?.[1]);
        if (!pid) continue;
        const stats = readDisk(`seasonstats_${pid}_${season}`);
        if (!stats || !stats.Games) continue;
        const bio = await getPlayerById(pid);
        if (!bio) continue;
        players.push({
          PlayerID: pid, FirstName: bio.FirstName, LastName: bio.LastName,
          Team: bio.Team, Position: bio.Position,
          PhotoUrl: bio.PhotoUrl,
          stats,
        });
      }
    }

    res.json({ success: true, players, count: players.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/players/:id
router.get('/:id', async (req, res) => {
  try {
    const player = await getPlayerById(req.params.id);
    if (!player) return res.status(404).json({ success: false, error: 'Player not found' });
    res.json({ success: true, player });
    // Pre-warm career stats in background so next profile load is instant
    getPlayerCareerStats(req.params.id).catch(() => {});
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/players/:id/stats/:season  — season averages for one player
router.get('/:id/stats/:season', async (req, res) => {
  try {
    const stats = await getPlayerSeasonStats(req.params.season, req.params.id);
    if (!stats) return res.status(404).json({ success: false, error: 'Stats not found' });
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/players/:id/playoff-stats/:season
router.get('/:id/playoff-stats/:season', async (req, res) => {
  try {
    const stats = await getPlayerPlayoffStats(req.params.season, req.params.id);
    if (!stats) return res.status(404).json({ success: false, error: 'No playoff stats found' });
    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/players/:id/gamelogs/:season  — full game log for a player
router.get('/:id/gamelogs/:season', async (req, res) => {
  try {
    const logs = await getPlayerGameLogs(req.params.season, req.params.id);
    res.json({ success: true, logs, count: logs.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/players/:id/career  — career season-by-season averages
router.get('/:id/career', async (req, res) => {
  try {
    const seasons = await getPlayerCareerStats(req.params.id);
    res.json({ success: true, seasons, count: seasons.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/players/league-stats/:season — all players with stats for that season
export default router;
