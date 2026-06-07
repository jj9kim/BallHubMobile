import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import gamesRouter from './routes/games.js';
import standingsRouter from './routes/standings.js';
import teamsRouter from './routes/teams.js';
import playersRouter from './routes/players.js';
import { getStandings, getSchedule } from './services/nbaApiService.js';

const app = express();
const PORT = process.env.PORT ?? 5000;

app.use(cors());
app.use(express.json());

app.use('/api/games', gamesRouter);
app.use('/api/standings', standingsRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/players', playersRouter);

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`BallHub backend running on http://localhost:${PORT}`);
  // Pre-warm the most-used caches so first user requests are instant
  Promise.allSettled([
    getStandings(2025),
    getSchedule(2025),
  ]).then(() => console.log('Cache warmed: standings + schedule'));
});
