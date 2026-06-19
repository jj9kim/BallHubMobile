@AGENTS.md

# BallHubMobile — Session Context

## What this app is
NBA stats mobile app built with **Expo/React Native** (TypeScript) + **Node.js/Express** backend on port 5001. Dark theme (#141414). Primary data sources: ESPN API + NBA.com stats API (many NBA.com endpoints are blocked — see gotchas).

## Running the app
```bash
# Backend (required first)
cd backend && npm start

# Frontend
npx expo start   # then press 'i' for iOS simulator or scan QR
```
**Always kill port 5001 before ending a session:** `lsof -ti:5001 | xargs kill -9`

## Project structure
```
src/
  screens/
    TeamScreen.tsx      # Teams tab — Overview, Roster, Matches, Stats, Contracts, Draft
    PlayerScreen.tsx    # Player profile — Stats tab + Game Log tab
    GameScreen.tsx      # Game detail — Facts, Lineup, Table, Stats tabs
    ScoresScreen.tsx    # Daily scores with date strip
    TeamsScreen.tsx     # Teams list with standings/playoffs/draft
  api/
    nbaService.ts       # All frontend API calls (base: http://localhost:5001)
  utils/
    teamMappings.ts     # Team abbrev → colors, names, ESPN logo slugs
  navigation/           # React Navigation stack + bottom tabs

backend/src/
  app.js                # Express entry + startup pre-warm logic
  routes/
    games.js            # /api/games/*
    teams.js            # /api/teams/*
    players.js          # /api/players/*
    standings.js        # /api/standings/*
  services/
    nbaApiService.js    # All data fetching + disk cache logic
```

## Cache system
- **Location:** `cache_nba/` at repo root
- **Format:** `{ data: <value>, expires: <epoch_ms> }` JSON files
- **Key TTLs:**
  - Player bio (`player_*`): 30 days
  - Career raw (`career_raw_*`): 7 days
  - Career seasons (`career_seasons_*`): forever if retired, 7 days if active
  - Season stats per player (`seasonstats_<id>_<season>`): forever if past season, 1 day if active
  - Game logs (`gamelogs_nba_*`, `gamelogs_playoff_*`): forever if past season, 1 day if active
  - Team stats ESPN (`teamstats_espn_<team>_v2`): 1 day
  - Scoreboard (`espn_scoreboard_<date>`): permanent for past dates
- **Retired vs active:** determined by `activeSeasonYear()` in nbaApiService.js — returns null Jul-Sep (offseason) so everything caches permanently during offseason
- **Re-stamp expired files** if needed: `python3 scripts/restamp_cache.py` (or run inline)

## Startup pre-warm (app.js)
On every backend start:
1. Immediately writes `seasonstats_all_<season> = null` sentinel → prevents 12s NBA.com timeout
2. Warms standings, schedule, all 30 rosters in parallel
3. Warms all draft classes (2001–present)
4. Computes `seasonstats_<id>_<season>` from cached game logs for all players with logs (no network)
5. Fills any remaining uncached player bios + career stats + game logs (sequential, 800ms delay)

## Known NBA.com blocked endpoints
These always return 500 — do NOT use them:
- `/stats/leaguedashplayerstats` (all-player season stats)
- `/stats/leaguedashteamstats` (all-team stats)
- `/stats/teamdashboardbygeneralsplits`

**Workarounds in place:**
- Player season stats → computed from cached game logs (`seasonstats_<id>_<season>`)
- Team stats → ESPN `/apis/site/v2/sports/basketball/nba/teams/<slug>/statistics?seasontype=2|3`

## Key design decisions
- **PlayerScreen style** is the design reference — all new cards should match its `#1e1e1e` card, `sectionLabel`, `bigStatBox`, `psRow`/`psLabel`/`psValue`, and `divider` patterns
- **TeamScreen Overview tab** has: Team Form (last 5 games), Next Match, Season Stats, Last Starting 5 (half-court SVG), League Standings
- **TeamScreen Stats tab** has: team stats cards (Big 4, Shooting, Rebounds, Defense) + player stats table (sortable, tappable rows → PlayerProfile)
- **Half-court viz**: `courtW = window.width - 36`, pins are 120px wide containers centered on player position, name pill auto-sizes to text
- **Player name on pins**: `fullName.split(' ').slice(1).join(' ')` to get last name (handles "Jones Jr.", "Gilgeous-Alexander")

## Navigation stack
```
MainTabs (bottom bar: Scores | Teams | Players)
  → Game        { gameId, gameDate, awayTeam, homeTeam }
  → TeamProfile { teamKey, teamCity, teamName }
  → PlayerProfile { playerId }
  → Draft       { year }
```

## Common gotchas
- `g.Day` from schedule is a full ISO string — always `.split('T')[0]` before passing as `gameDate`
- ESPN game IDs are 9 digits; NBA.com IDs are 10 digits (padded with leading zeros). `fmtGameId()` handles padding
- Boxscore fallback: if NBA.com returns empty players, falls back to ESPN via `getEspnBoxScore()` using live-fetched scoreboard (not just disk cache)
- Team abbrev variants: NOP=NO, UTA=UTAH, WAS=WSH, GSW=GS — handled by `ESPN_TEAM_ALIASES` and `TEAM_ABBR_VARIANTS`
- `getNbaIdMap()` returns identity map (PlayerID→PlayerID) — only useful as a validity check, not for ID translation
- Player navigation from half-court pins: `PlayerID` is resolved via name-matching against roster (`normalize()` strips all non-alphanumeric), falls back to null (pin won't navigate)

## Current season
Default season param = **2025** (2024-25 season). Update `currentSeason()` in nbaApiService.js and `CURRENT_SEASON_YEAR` comment when new season starts (October).

## Recent work completed
- Season Stats + Last Starting 5 in Overview tab redesigned to match PlayerScreen style
- Half-court player pins: glow ring, team-color border, auto-sizing name pill
- Boxscore 500 errors fixed (stale empty cache busted, ESPN scoreboard live-fetched)
- Player cache TTLs: retired=10yr, active=7d/30d; offseason=all permanent
- Team Stats tab: real data from ESPN, includes Regular Season + Playoffs toggle
- Player stats table added to Team Stats tab (sortable, tappable)
- 15s player load eliminated: leaguedashplayerstats sentinel + seasonstats pre-warm at startup
