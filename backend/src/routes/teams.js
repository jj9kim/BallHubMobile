import { Router } from 'express';
import { getAllTeams, getTeamRoster, getTeamSchedule, getDraftClass, getTeamSalaries } from '../services/nbaApiService.js';

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

export default router;
