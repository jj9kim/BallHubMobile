import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import gamesRouter from './routes/games.js';
import standingsRouter from './routes/standings.js';
import teamsRouter from './routes/teams.js';
import playersRouter from './routes/players.js';
import { getStandings, getSchedule, getDraftClass, getAllHistoricalPlayers, getPlayerById, getPlayerCareerStats, getPlayerGameLogs, getTeamRoster, getHistoricalRoster, existsDisk, getAllPlayerSeasonStats, getPlayerSeasonStats, writeDisk, CACHE_DIR } from './services/nbaApiService.js';

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

  // Immediately mark leaguedashplayerstats as unavailable so player loads never
  // wait 12s for its timeout. getPlayerSeasonStats checks this sentinel first.
  const _now = new Date();
  const _season = _now.getMonth() + 1 >= 10 ? _now.getFullYear() : _now.getFullYear() - 1;
  writeDisk(`seasonstats_all_${_season}`, null, 86400);

  // Pre-warm standings, schedule, and all 30 team rosters immediately
  const ALL_TEAMS = [
    'ATL','BOS','BKN','CHA','CHI','CLE','DAL','DEN','DET','GS',
    'HOU','IND','LAC','LAL','MEM','MIA','MIL','MIN','NO','NY',
    'OKC','ORL','PHI','PHO','POR','SAC','SA','TOR','UTAH','WSH',
  ];
  Promise.allSettled([
    getStandings(2025), getSchedule(2025),
    ...ALL_TEAMS.map(t => getTeamRoster(t)),
  ]).then(async () => {
    console.log('Cache warmed: standings + schedule + all rosters');

    // Pre-warm EVERYTHING for every active roster player — bio, career, game logs, seasonstats.
    // Roster is the source of truth for "active players". Draft class data misses undrafted
    // players, 2nd-round picks with limited data, recent call-ups, etc.
    const season = _season;
    const allRosters = await Promise.allSettled(ALL_TEAMS.map(t => getTeamRoster(t)));
    const rosterPlayers = allRosters
      .flatMap(r => r.status === 'fulfilled' ? (Array.isArray(r.value) ? r.value : r.value.players ?? []) : []);
    const uniqueIds = [...new Set(rosterPlayers.map(p => p.PlayerID).filter(Boolean))];

    let rWarmed = 0, rSkipped = 0;
    for (const id of uniqueIds) {
      const needsBio    = !existsDisk(`player_${id}`);
      const needsCareer = !existsDisk(`career_seasons_${id}`);
      const needsLogs   = !existsDisk(`gamelogs_nba_${id}_${season}`);
      const needsStats  = !existsDisk(`seasonstats_${id}_${season}`);

      if (!needsBio && !needsCareer && !needsLogs && !needsStats) { rSkipped++; continue; }

      if (needsBio)    await getPlayerById(id).catch(() => {});
      if (needsCareer) await getPlayerCareerStats(id).catch(() => {});
      // Skip expensive warming if cache is >95% complete — already warmed
      const cacheRatio = rSkipped / uniqueIds.length;
      if (cacheRatio > 0.95) {
        console.log(`Roster cache ${(cacheRatio * 100).toFixed(0)}% complete — skipping expensive pre-warm`);
        break;
      }
      if (needsLogs)   await getPlayerGameLogs(season, id).catch(() => {});
      if (needsStats)  await getPlayerSeasonStats(season, id).catch(() => {});
      rWarmed++;
      await new Promise(r => setTimeout(r, 200));
    }
    console.log(`Roster pre-warm: ${rWarmed} players fully cached, ${rSkipped} already complete`);
  });

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

    // Step 2b: pre-warm seasonstats from already-cached game logs.
    // Pure disk computation — no network calls. Skips players already cached.
    const now = new Date();
    const currentSeason = now.getMonth() + 1 >= 10 ? now.getFullYear() : now.getFullYear() - 1;
    const { readdirSync } = await import('fs');
    const logPattern = /^gamelogs_nba_(\d+)_(\d+)\.json$/;
    const toPrewarm = readdirSync(CACHE_DIR)
      .map(f => f.match(logPattern))
      .filter(Boolean)
      .filter(m => !existsDisk(`seasonstats_${m[1]}_${m[2]}`))
      .map(m => ({ id: Number(m[1]), season: Number(m[2]) }));

    console.log(`Pre-warming seasonstats for ${toPrewarm.length} players from cached game logs...`);
    let swDone = 0;
    for (const { id, season } of toPrewarm) {
      await getPlayerSeasonStats(season, id).catch(() => {});
      swDone++;
    }
    console.log(`Season stats pre-warm complete: ${swDone} players`);

    // Step 3: cache every player profile + career stats individually (like draft classes)
    // Skips already-cached players so restarts pick up where they left off
    const allIds = [...allNbaIds];
    const uncachedIds = allIds.filter(id => !existsDisk(`player_${id}`) || !existsDisk(`career_seasons_${id}`));
    const alreadyCached = allIds.length - uncachedIds.length;

    console.log(`\n=== Player Profile Cache ===`);
    console.log(`Total players: ${allIds.length}`);
    console.log(`Already cached: ${alreadyCached}`);
    console.log(`To cache: ${uncachedIds.length}`);

    // If >95% cached, skip expensive player profile caching — cache already warm
    if (alreadyCached / allIds.length > 0.95) {
      console.log(`✓ Cache ${(alreadyCached / allIds.length * 100).toFixed(0)}% complete — skipping player profile pre-warm\n`);
    } else {

    if (uncachedIds.length > 0) {
      const estMins = Math.ceil(uncachedIds.length * 1.2 / 60);
      console.log(`Estimated time: ~${estMins} minutes\n`);
    }

    let done = 0;
    let failed = 0;
    const startTime = Date.now();

    for (const id of uncachedIds) {
      let ok = true;
      // Only fetch if not already cached — skip duplicates
      if (!existsDisk(`player_${id}`)) {
        try { await getPlayerById(id).catch(() => { failed++; }); }
        catch { ok = false; }
      }
      if (!existsDisk(`career_seasons_${id}`)) {
        try { await getPlayerCareerStats(id).catch(() => {}); }
        catch { ok = false; }
      }
      // Skip game logs to save time — season stats will auto-compute from already-cached logs
      done++;
      await new Promise(r => setTimeout(r, 300)); // Reduced from 800ms for faster caching

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
    } // end else (player profile pre-warm)

    // ── Step 4: Full game log + season stats cache for ALL active players ──────
    // Skips retired players (last career season < currentSeason) and players
    // already cached. Runs once and writes to disk permanently (10-year TTL).
    // On subsequent restarts this whole block is skipped instantly.
    const { readFileSync, readdirSync: rds } = await import('fs');
    const { join } = await import('path');

    // Build set of player IDs that need game logs
    const allPlayerFiles = rds(CACHE_DIR).filter(f => f.startsWith('player_') && f !== 'player_map.json');
    const needingLogs = [];

    for (const fname of allPlayerFiles) {
      const pid = fname.replace('player_', '').replace('.json', '');
      if (existsDisk(`gamelogs_nba_${pid}_${currentSeason}`) &&
          existsDisk(`seasonstats_${pid}_${currentSeason}`)) continue;

      // Skip retired players — check career_seasons_ last year
      const careerFile = join(CACHE_DIR, `career_seasons_${pid}.json`);
      try {
        const { data: seasons } = JSON.parse(readFileSync(careerFile, 'utf8'));
        if (Array.isArray(seasons) && seasons.length > 0) {
          const lastYear = Math.max(...seasons.map(s => s.SeasonYear ?? 0));
          if (lastYear < currentSeason) continue; // retired, skip
        }
      } catch { continue; } // no career data, skip

      needingLogs.push(Number(pid));
    }

    if (needingLogs.length === 0) {
      console.log('\n✓ All active players already fully cached — instant loads guaranteed');
      return;
    }

    const estMins2 = Math.ceil(needingLogs.length * 1.5 / 60);
    console.log(`\n=== Full Player Cache Warm ===`);
    console.log(`Active players needing game logs: ${needingLogs.length}`);
    console.log(`Estimated time: ~${estMins2} minutes (runs once, cached forever)\n`);

    let gl = 0, glFail = 0;
    const glStart = Date.now();

    for (const id of needingLogs) {
      if (!existsDisk(`gamelogs_nba_${id}_${currentSeason}`)) {
        try { await getPlayerGameLogs(currentSeason, id); }
        catch { glFail++; }
      }
      if (!existsDisk(`seasonstats_${id}_${currentSeason}`)) {
        await getPlayerSeasonStats(currentSeason, id).catch(() => {});
      }
      gl++;
      await new Promise(r => setTimeout(r, 600));

      if (gl % 25 === 0 || gl === needingLogs.length) {
        const mins = ((Date.now() - glStart) / 60000).toFixed(1);
        const eta  = Math.ceil((needingLogs.length - gl) * 1.5 / 60);
        console.log(`[Game logs ${gl}/${needingLogs.length}] failed: ${glFail} | ${mins}m elapsed | ~${eta}m left`);
      }
    }

    console.log(`\n✓ Full cache warm complete — all active players now load instantly forever`);

    // ── Historical seasons pre-warm (2016–2024) ──────────────────────────────
    // For each past season: cache historical roster + career stats for every player.
    // Career stats cover all seasons so one fetch per player covers everything.
    // Past season data never changes — cached forever. Runs once, silently.
    const HIST_SEASONS = [2024,2023,2022,2021,2020,2019,2018,2017,2016];
    const HIST_TEAMS   = [
      'ATL','BOS','BKN','CHA','CHI','CLE','DAL','DEN','DET','GSW',
      'HOU','IND','LAC','LAL','MEM','MIA','MIL','MIN','NOP','NY',
      'OKC','ORL','PHI','PHO','POR','SAC','SA','TOR','UTA','WAS',
    ];

    console.log('\n=== Historical Stats Pre-warm (2016–2024) ===');
    const seenPlayers = new Set();
    let hRosters = 0, hPlayers = 0;

    for (const season of HIST_SEASONS) {
      for (const team of HIST_TEAMS) {
        try {
          const roster = await getHistoricalRoster(team, season);
          hRosters++;
          for (const p of roster) {
            if (seenPlayers.has(p.PlayerID)) continue;
            seenPlayers.add(p.PlayerID);
            if (!existsDisk(`career_seasons_${p.PlayerID}`)) {
              await getPlayerCareerStats(p.PlayerID).catch(() => {});
              await new Promise(r => setTimeout(r, 400));
              hPlayers++;
            }
          }
        } catch {}
      }
      console.log(`Historical ${season}-${String(season+1).slice(2)}: rosters cached`);
    }
    console.log(`✓ Historical pre-warm complete — ${hRosters} rosters, ${hPlayers} new career stat fetches`);
  })();
});
