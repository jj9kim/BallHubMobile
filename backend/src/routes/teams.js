import { Router } from 'express';
import { getAllTeams, getTeamRoster, getTeamSchedule, getDraftClass, getTeamSalaries, getTeamSeasonStats, getPlayerSeasonStats, ESPN_TEAM_ALIASES } from '../services/nbaApiService.js';

const router = Router();

// GET /api/teams
router.get('/', async (req, res) => {
  try {
    const teams = await getAllTeams();
    res.json({ success: true, teams, count: teams.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/teams/:team  — team abbreviation e.g. LAL
router.get('/:team', async (req, res) => {
  try {
    const teams = await getAllTeams();
    const team = teams.find(t => t.Key === req.params.team.toUpperCase());
    if (!team) return res.status(404).json({ success: false, error: 'Team not found' });
    res.json({ success: true, team });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/teams/:team/roster
router.get('/:team/roster', async (req, res) => {
  try {
    const players = await getTeamRoster(req.params.team.toUpperCase());
    res.json({ success: true, players, count: players.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/teams/:team/schedule/:season  e.g. /api/teams/LAL/schedule/2025
router.get('/:team/schedule/:season', async (req, res) => {
  try {
    const games = await getTeamSchedule(req.params.season, req.params.team.toUpperCase());
    res.json({ success: true, games, count: games.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/teams/:team/stats/:season
router.get('/:team/stats/:season', async (req, res) => {
  try {
    const data = await getTeamSeasonStats(req.params.season, req.params.team.toUpperCase());
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/teams/:team/player-stats/:season  — all roster players' season averages
router.get('/:team/player-stats/:season', async (req, res) => {
  try {
    const team   = req.params.team.toUpperCase();
    const season = req.params.season;
    const roster = await getTeamRoster(team);
    const players = Array.isArray(roster) ? roster : (roster.players ?? []);
    const playerStats = await Promise.all(
      players.map(async p => {
        const stats = await getPlayerSeasonStats(season, p.PlayerID).catch(() => null);
        return { player: p, stats };
      })
    );
    res.json({ success: true, players: playerStats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/teams/:team/salaries
router.get('/:team/salaries', async (req, res) => {
  try {
    const data = await getTeamSalaries(req.params.team.toUpperCase());
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/teams/draft/:year  e.g. /api/teams/draft/2024
router.get('/draft/:year', async (req, res) => {
  try {
    const picks = await getDraftClass(req.params.year);
    res.json({ success: true, picks, count: picks.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/teams/:team/draftpicks  — all picks by a team across all draft years
router.get('/:team/draftpicks', async (req, res) => {
  try {
    const teamAbbr = req.params.team.toUpperCase();
    const START_YEAR = 2001;
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: currentYear - START_YEAR + 1 }, (_, i) => START_YEAR + i);

    const aliases = ESPN_TEAM_ALIASES[teamAbbr] ?? [teamAbbr];
    const picksWithYear = (await Promise.all(
      years.map(async y => {
        const picks = await getDraftClass(y).catch(() => []);
        return picks.filter(p => aliases.includes(p.Team)).map(p => ({ ...p, DraftYear: y }));
      })
    )).flat();

    picksWithYear.sort((a, b) => b.DraftYear - a.DraftYear || a.Overall - b.Overall);
    res.json({ success: true, picks: picksWithYear, count: picksWithYear.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
