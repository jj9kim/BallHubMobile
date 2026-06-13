import { Router } from 'express';
import {
  getGamesByDate,
  getGameById,
  getLiveGames,
  getSchedule,
  getTeamSchedule,
  getBoxScore,
  getPlayoffBracket,
} from '../services/nbaApiService.js';

const router = Router();

// Helper: build playoff series info for a specific game
async function getSeriesInfoForGame(game, bracket) {
  const away = game.AwayTeam;
  const home = game.HomeTeam;
  const key = [away, home].sort().join('-');

  // Check play-in first
  const playInMatch = (bracket.playIn ?? []).find(s => [...s.teams].sort().join('-') === key);
  const allSeries = [
    ...(bracket.playIn ?? []).map(s => ({ ...s, roundName: 'Play-In' })),
    ...bracket.rounds.flatMap(r => r.series.map(s => ({ ...s, roundName: r.name }))),
  ];

  for (const series of allSeries) {
    if ([...series.teams].sort().join('-') !== key) continue;

    // Sort series games by date to find game number
    const completedStatuses = ['Final', 'F/OT', 'F/2OT', 'F/3OT'];
    const seriesGames = series.games
      .filter(g => completedStatuses.includes(g.Status) || g.Status === 'NotNecessary')
      .sort((a, b) => new Date(a.Day) - new Date(b.Day));

    // Find this game's index — tolerate ±1 day since ESPN dates may be UTC-shifted
    const thisGameDate = game.Day?.split('T')[0];
    const adjacentDates = (d) => {
      if (!d) return [];
      const base = new Date(d + 'T12:00:00Z');
      return [-1, 0, 1].map(offset => {
        const dt = new Date(base);
        dt.setUTCDate(dt.getUTCDate() + offset);
        return dt.toISOString().split('T')[0];
      });
    };
    const dates = new Set(adjacentDates(thisGameDate));
    const thisGameIdx = seriesGames.findIndex(g => {
      const d = g.Day?.split('T')[0];
      return dates.has(d) &&
        ((g.AwayTeam === away && g.HomeTeam === home) ||
         (g.AwayTeam === home && g.HomeTeam === away));
    });

    // Use SeriesInfo.GameNumber from SportsData if available (always accurate for future games too)
    const gameNumber = game.SeriesInfo?.GameNumber
      ?? (thisGameIdx >= 0 ? thisGameIdx + 1 : seriesGames.length + 1);

    // Count wins from games played BEFORE this game
    const gamesBeforeThis = seriesGames.slice(0, Math.max(0, thisGameIdx));
    let preAway = 0, preHome = 0;
    for (const g of gamesBeforeThis) {
      if (!completedStatuses.includes(g.Status)) continue;
      if (g.HomeTeamScore > g.AwayTeamScore) {
        if (g.HomeTeam === home) preHome++; else preAway++;
      } else {
        if (g.AwayTeam === away) preAway++; else preHome++;
      }
    }

    // Final series record
    const winsAway = series.wins[away] ?? 0;
    const winsHome = series.wins[home] ?? 0;

    // Series label ENTERING this game
    // For scheduled/future games, use overall series wins (pre-game counts are 0 since game isn't in completed list)
    const completedGame = completedStatuses.includes(game.Status);
    const labelAway = completedGame ? preAway : winsAway;
    const labelHome = completedGame ? preHome : winsHome;
    let seriesLabel;
    if (labelAway === labelHome) seriesLabel = `Series tied ${labelAway}-${labelHome}`;
    else if (labelAway > labelHome) seriesLabel = `${away} leads ${labelAway}-${labelHome}`;
    else seriesLabel = `${home} leads ${labelHome}-${labelAway}`;

    // Series record AFTER this game (pre + this game's result)
    const postAway = preAway + (completedGame && game.AwayTeamScore > game.HomeTeamScore ? 1 : 0);
    const postHome = preHome + (completedGame && game.HomeTeamScore > game.AwayTeamScore ? 1 : 0);
    const winThreshold = series.isPlayIn ? 1 : 4;

    let postSeriesLabel;
    if (postAway >= winThreshold) postSeriesLabel = `${away} advances ${postAway}-${postHome}`;
    else if (postHome >= winThreshold) postSeriesLabel = `${home} advances ${postHome}-${postAway}`;
    else if (postAway === postHome) postSeriesLabel = `Series tied ${postAway}-${postHome}`;
    else if (postAway > postHome) postSeriesLabel = `${away} leads ${postAway}-${postHome}`;
    else postSeriesLabel = `${home} leads ${postHome}-${postAway}`;

    return {
      roundName: series.roundName,
      gameNumber,
      seriesLabel,
      postSeriesLabel,
      winsAway,
      winsHome,
      isComplete: series.isComplete,
      leader: series.leader,
      isPlayIn: series.isPlayIn ?? false,
    };
  }
  return null;
}

// GET /api/games?date=YYYY-MM-DD
router.get('/', async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ success: false, error: 'date query param required (YYYY-MM-DD)' });
    const allGames = await getGamesByDate(date);
    // Filter out unplayed games (series already decided)
    const games = allGames.filter(g => g.Status !== 'NotNecessary');

    // Enrich playoff games with series info
    const playoffGames = games.filter(g => g.SeasonType === 3 && g.Status !== 'NotNecessary');
    if (playoffGames.length > 0) {
      const season = playoffGames[0].Season;
      const bracket = await getPlayoffBracket(season);
      for (const game of games) {
        if (game.SeasonType !== 3) continue;
        const info = await getSeriesInfoForGame(game, bracket);
        if (info) game.PlayoffInfo = info;
      }
    }

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

// GET /api/games/schedule/:season
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
    const boxscore = await getBoxScore(req.params.id, req.query.date ?? null, req.query.away ?? null, req.query.home ?? null);
    if (boxscore?.Game?.SeasonType === 3) {
      // Use date from query param if backend has no date (NBA.com boxscore doesn't include it)
      if (req.query.date && !boxscore.Game.Day) boxscore.Game.Day = req.query.date;
      const bracket = await getPlayoffBracket(boxscore.Game.Season);
      const info = await getSeriesInfoForGame(boxscore.Game, bracket);
      if (info) boxscore.PlayoffInfo = info;
    }
    res.json({ success: true, boxscore });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/games/:id/players
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
