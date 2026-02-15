import express from 'express';
import dotenv from 'dotenv';
import { router } from './api/routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Routes
app.use('/v1', router);

import { initWorker } from './core/queue';
initWorker();

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`Ghostcrawl running on http://localhost:${PORT}`);
});
