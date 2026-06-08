import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import gamesRouter from './routes/games.js';
import standingsRouter from './routes/standings.js';
import teamsRouter from './routes/teams.js';
import playersRouter from './routes/players.js';
import { getStandings, getSchedule, getDraftClass } from './services/nbaApiService.js';

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

  // Pre-warm standings + schedule immediately
  Promise.allSettled([getStandings(2025), getSchedule(2025)])
    .then(() => console.log('Cache warmed: standings + schedule'));

  // Pre-warm all draft classes in the background — sequential so we don't hammer APIs
  (async () => {
    const currentYear = new Date().getFullYear();
    const years = [];
    for (let y = currentYear; y >= 2001; y--) years.push(y);
    console.log(`Pre-warming ${years.length} draft classes in background...`);
    let built = 0;
    for (const year of years) {
      try {
        await getDraftClass(year);
        built++;
        if (built % 5 === 0) console.log(`Draft cache progress: ${built}/${years.length}`);
      } catch {}
    }
    console.log(`Draft cache complete: ${built}/${years.length} classes ready`);
  })();
});
