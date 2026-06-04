import { Router } from 'express';
import { getStandings } from '../services/sportsData.js';

const router = Router();

// GET /api/standings/:season  e.g. /api/standings/2025
// GET /api/standings  — defaults to 2025
router.get('/:season?', async (req, res) => {
  try {
    const season = req.params.season ?? 2025;
    const standings = await getStandings(season);
    res.json({ success: true, standings, count: standings.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
