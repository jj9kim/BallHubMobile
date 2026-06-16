import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import gamesRouter from './routes/games.js';
import standingsRouter from './routes/standings.js';
import teamsRouter from './routes/teams.js';
import playersRouter from './routes/players.js';
import { getStandings, getSchedule, getDraftClass, getAllHistoricalPlayers, getPlayerCareerStats, getPlayerGameLogs, getTeamRoster, existsDisk, getAllPlayerSeasonStats } from './services/nbaApiService.js';

const app = express();
const PORT = process.env.PORT ?? 5000;

app.use(cors());
app.use(express.json());

app.use('/api/games', gamesRouter);
app.use('/api/standings', standingsRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/players', playersRouter);

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

app.listen(PORT, async () => {
  console.log(`BallHub backend running on http://localhost:${PORT}`);

  // Pre-warm standings, schedule, and all 30 team rosters immediately
  const ALL_TEAMS = [
    'ATL','BOS','BKN','CHA','CHI','CLE','DAL','DEN','DET','GS',
    'HOU','IND','LAC','LAL','MEM','MIA','MIL','MIN','NO','NY',
    'OKC','ORL','PHI','PHO','POR','SAC','SA','TOR','UTAH','WSH',
  ];
  Promise.allSettled([
    getStandings(2025), getSchedule(2025),
    ...ALL_TEAMS.map(t => getTeamRoster(t)),
  ]).then(() => console.log('Cache warmed: standings + schedule + all rosters'));

  // Pre-warm draft classes then player profiles — sequential to avoid rate limits
  (async () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let y = currentYear; y >= 2001; y--) years.push(y);
    console.log(`Pre-warming ${years.length} draft classes...`);

    // Step 1: build all draft class caches
    const allNbaIds = new Set();
    let built = 0;
    for (const year of years) {
      try {
        const picks = await getDraftClass(year);
        picks.forEach(p => { if (p.NbaId) allNbaIds.add(p.NbaId); });
        built++;
        if (built % 5 === 0) console.log(`Draft cache: ${built}/${years.length}`);
      } catch {}
    }
    console.log(`Draft cache complete: ${built}/${years.length} — ${allNbaIds.size} unique players`);

    // Step 2: bulk-fetch ALL historical players in one call (no rate limit issues)
    try {
      await getAllHistoricalPlayers();
      console.log('Historical player map ready');
    } catch {}

    // Step 2b: pre-warm current season stats for all players (single API call)
    const now = new Date();
    const currentSeason = now.getMonth() + 1 >= 10 ? now.getFullYear() : now.getFullYear() - 1;
    try {
      await getAllPlayerSeasonStats(currentSeason);
      console.log(`Season stats cache ready (${currentSeason}-${String(currentSeason + 1).slice(2)})`);
    } catch { console.log('Season stats pre-warm skipped (NBA API unavailable)'); }

    // Step 3: cache every player profile + career stats individually (like draft classes)
    // Skips already-cached players so restarts pick up where they left off
    const allIds = [...allNbaIds];
    const uncachedIds = allIds.filter(id => !existsDisk(`player_${id}`) || !existsDisk(`career_seasons_${id}`));
    const alreadyCached = allIds.length - uncachedIds.length;

    console.log(`\n=== Player Profile Cache ===`);
    console.log(`Total players: ${allIds.length}`);
    console.log(`Already cached: ${alreadyCached}`);
    console.log(`To cache: ${uncachedIds.length}`);
    if (uncachedIds.length > 0) {
      const estMins = Math.ceil(uncachedIds.length * 1.2 / 60);
      console.log(`Estimated time: ~${estMins} minutes\n`);
    }

    let done = 0;
    let failed = 0;
    const startTime = Date.now();

    for (const id of uncachedIds) {
      let ok = true;
      if (!existsDisk(`player_${id}`)) {
        try { await getPlayerById(id); }
        catch { ok = false; failed++; }
      }
      if (!existsDisk(`career_seasons_${id}`)) {
        try { await getPlayerCareerStats(id); }
        catch { ok = false; }
      }
      if (!existsDisk(`gamelogs_nba_${id}_${currentSeason}`)) {
        try { await getPlayerGameLogs(currentSeason, id); }
        catch {}
      }
      done++;
      await new Promise(r => setTimeout(r, 800));

      // Log every 10 players
      if (done % 10 === 0 || done === uncachedIds.length) {
        const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
        const remaining = uncachedIds.length - done;
        const rate = done / ((Date.now() - startTime) / 1000);
        const etaMins = remaining > 0 ? Math.ceil(remaining / rate / 60) : 0;
        console.log(`[${done}/${uncachedIds.length}] cached | failed: ${failed} | elapsed: ${elapsed}m | eta: ~${etaMins}m`);
      }
    }

    console.log(`\n=== Player Profile Cache Complete ===`);
    console.log(`Cached: ${done} | Failed: ${failed} | Total: ${allIds.length}`);
  })();
});
