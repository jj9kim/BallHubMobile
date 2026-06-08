import { Router } from 'express';
import {
  getAllPlayers,
  getPlayerById,
  getPlayerSeasonStats,
  getPlayerGameLogs,
  getAllPlayerSeasonStats,
  getNbaIdMap,
  getPlayerCareerStats,
} from '../services/nbaApiService.js';

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

export default router;
