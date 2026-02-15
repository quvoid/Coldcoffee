import { Router, Request, Response } from 'express';
import { scrapeQueue } from '../core/queue';
import { z } from 'zod';
import crypto from 'crypto';

export const router = Router();

// Validation schema
const ScrapeSchema = z.object({
    url: z.string().url(),
});

router.post('/scrape', async (req: Request, res: Response) => {
    try {
        const { url } = ScrapeSchema.parse(req.body);

        const job = await scrapeQueue.add('scrape-job', {
            url,
            mode: 'scrape'
        });

        res.json({
            success: true,
            jobId: job.id,
            message: 'Scrape job started'
        });
    } catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
});

router.get('/job/:id', async (req: Request, res: Response) => {
    const jobId = req.params.id as string;
    const job = await scrapeQueue.getJob(jobId);

    if (!job) {
        return res.status(404).json({ error: 'Job not found' });
    }

    const state = await job.getState();
    const result = job.returnvalue;

    res.json({
        id: job.id,
        state,
        result,
        error: job.failedReason
    });
});

const CrawlSchema = z.object({
    url: z.string().url(),
    maxDepth: z.number().min(1).max(10).default(2),
    limit: z.number().min(1).max(100).default(10),
});

router.post('/crawl', async (req: Request, res: Response) => {
    try {
        const { url, maxDepth, limit } = CrawlSchema.parse(req.body);
        const crawlId = crypto.randomUUID();

        const job = await scrapeQueue.add('crawl-job', {
            url,
            mode: 'crawl',
            crawlId,
            depth: 0,
            maxDepth,
            limit
        });

        res.json({
            success: true,
            crawlId,
            jobId: job.id,
            message: 'Crawl job started'
        });
    } catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' });
    }
});
