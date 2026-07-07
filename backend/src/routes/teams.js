import { Router } from 'express';
import { getAllTeams, getTeamRoster, getHistoricalRoster, getTeamSchedule, getDraftClass, getTeamSalaries, getTeamSeasonStats, getAllLeagueTeamStats, getPlayerSeasonStats, getPlayerCareerStats, existsDisk, readDisk, ESPN_TEAM_ALIASES } from '../services/nbaApiService.js';

const CURRENT_SEASON = (() => { const n = new Date(); return n.getMonth() + 1 >= 10 ? n.getFullYear() : n.getFullYear() - 1; })();

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

// GET /api/teams/league-stats/:season/:seasontype
router.get('/league-stats/:season/:seasontype', async (req, res) => {
  try {
    const teams = await getAllLeagueTeamStats(req.params.season, parseInt(req.params.seasontype));
    res.json({ success: true, teams });
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

// GET /api/teams/:team/player-stats/:season
router.get('/:team/player-stats/:season', async (req, res) => {
  try {
    const team   = req.params.team.toUpperCase();
    const season = parseInt(req.params.season);
    const isPast = season < CURRENT_SEASON;

    // Use historical roster for past seasons, current roster for current season
    let players;
    if (isPast) {
      players = await getHistoricalRoster(team, season);
    } else {
      const roster = await getTeamRoster(team);
      players = Array.isArray(roster) ? roster : (roster.players ?? []);
    }

    const playerStats = players.map(p => {
      if (isPast) {
        // allowStale: past season data never changes, expired cache is still valid
        const careerSeasons = readDisk(`career_seasons_${p.PlayerID}`, { allowStale: true });
        // Career stats use end-year convention: 2020-21 season → SeasonYear=2021
        // Our season param uses start-year: season=2020 means 2020-21
        const stats = careerSeasons?.find(s => s.SeasonYear === season + 1) ?? null;
        return { player: p, stats };
      } else {
        return { player: p, stats: readDisk(`seasonstats_${p.PlayerID}_${season}`) ?? null };
      }
    });

    res.json({ success: true, players: playerStats });

    // Background: fill any missing career stats for past seasons
    if (isPast) {
      for (const p of players) {
        if (!existsDisk(`career_seasons_${p.PlayerID}`)) {
          getPlayerCareerStats(p.PlayerID).catch(() => {});
        }
      }
    } else {
      for (const p of players) {
        if (!existsDisk(`seasonstats_${p.PlayerID}_${season}`)) {
          getPlayerSeasonStats(season, p.PlayerID).catch(() => {});
        }
      }
    }
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
