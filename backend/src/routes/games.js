import { Router } from 'express';
import {
  getGamesByDate,
  getGameById,
  getLiveGames,
  getSchedule,
  getTeamSchedule,
  getBoxScore,
  getPlayerStatsByDate,
  getPlayoffBracket,
} from '../services/sportsData.js';

const router = Router();

// GET /api/games?date=YYYY-MM-DD
router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ success: false, error: 'date query param required (YYYY-MM-DD)' });
    const games = await getGamesByDate(date);
    res.json({ success: true, games, count: games.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/games/live
router.get('/live', async (req, res) => {
  try {
    const games = await getLiveGames();
    res.json({ success: true, games, count: games.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/games/schedule/:season  e.g. /api/games/schedule/2025
router.get('/schedule/:season', async (req, res) => {
  try {
    const games = await getSchedule(req.params.season);
    res.json({ success: true, games, count: games.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/games/:id
router.get('/:id', async (req, res) => {
  try {
    const game = await getGameById(req.params.id);
    if (!game) return res.status(404).json({ success: false, error: 'Game not found' });
    res.json({ success: true, game });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/games/:id/boxscore
router.get('/:id/boxscore', async (req, res) => {
  try {
    const boxscore = await getBoxScore(req.params.id);
    // If playoff game, calculate series record
    if (boxscore?.Game?.SeasonType === 3) {
      const bracket = await getPlayoffBracket(boxscore.Game.Season);
      const away = boxscore.Game.AwayTeam;
      const home = boxscore.Game.HomeTeam;
      const key = [away, home].sort().join('-');
      let seriesWins = null;
      for (const round of bracket.rounds) {
        const s = round.series.find(s => s.teams.sort().join('-') === key);
        if (s) { seriesWins = s.wins; break; }
      }
      if (seriesWins) boxscore.SeriesWins = seriesWins;
    }
    res.json({ success: true, boxscore });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/games/:id/players  — all player stats for a game
router.get('/:id/players', async (req, res) => {
  try {
    const boxscore = await getBoxScore(req.params.id);
    const players = boxscore?.PlayerGames ?? [];
    res.json({ success: true, players, count: players.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/games/playoffs/:season
router.get('/playoffs/:season', async (req, res) => {
  try {
    const data = await getPlayoffBracket(Number(req.params.season));
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
