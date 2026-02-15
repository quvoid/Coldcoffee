import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../lib/redis';
import { ScraperEngine } from './scraper';

export const scrapeQueue = new Queue('scrape-queue', {
    connection: {
        host: 'localhost',
        port: 6379
    }
});

const scraper = new ScraperEngine();

export const initWorker = () => {
    const worker = new Worker('scrape-queue', async (job: Job) => {
        console.log(`Processing job ${job.id}: ${job.name}`);

        try {
            const { url, mode } = job.data;

            if (mode === 'scrape') {
                const result = await scraper.scrape(url);
                return result;
            } else if (mode === 'crawl') {
                const { crawlId, depth, maxDepth, limit } = job.data;
                const visitedKey = `visited:${crawlId}`;
                const countKey = `count:${crawlId}`;

                // Check limit
                const count = await redis.scard(visitedKey);
                if (count >= limit) return { message: 'Limit reached' };

                // Check visited
                const isVisited = await redis.sismember(visitedKey, url);
                if (isVisited) return { message: 'Already visited' };

                await redis.sadd(visitedKey, url);

                // Scrape
                const result = await scraper.scrape(url);

                // Enqueue children if depth < maxDepth
                if (depth < maxDepth && result.links) {
                    const baseUrl = new URL(url);

                    const childJobs = result.links
                        .filter(link => {
                            try {
                                const linkUrl = new URL(link, url);
                                return linkUrl.hostname === baseUrl.hostname; // Internal links only
                            } catch { return false; }
                        })
                        .map(link => ({
                            name: 'crawl-job',
                            data: {
                                url: link,
                                mode: 'crawl',
                                crawlId,
                                depth: depth + 1,
                                maxDepth,
                                limit
                            }
                        }));

                    // Add unique links to queue (bulk add would be better but add loop is fine for now)
                    // Note: We don't check visited here to avoid race conditions, worker checks it.
                    for (const child of childJobs) {
                        await scrapeQueue.add(child.name, child.data);
                    }
                }

                return result;
            } else if (mode === 'map') {
                // Map mode: Crawl but return links only, no markdown
                const { crawlId, limit } = job.data;
                const visitedKey = `map:visited:${crawlId}`;

                // Check limit
                const count = await redis.scard(visitedKey);
                if (count >= limit) return { message: 'Limit reached' };

                await redis.sadd(visitedKey, url);

                // Scrape (Map mode)
                const result = await scraper.scrape(url, 'map');

                // For map, we want to discover *all* links on the domain
                if (result.links) {
                    const baseUrl = new URL(url);
                    const childJobs = result.links
                        .filter(link => {
                            try {
                                const linkUrl = new URL(link, url);
                                return linkUrl.hostname === baseUrl.hostname;
                            } catch { return false; }
                        })
                        .map(link => ({
                            name: 'map-job',
                            data: {
                                url: link,
                                mode: 'map',
                                crawlId,
                                limit
                            },
                            opts: { jobId: link } // Deduplication by ID
                        }));

                    for (const child of childJobs) {
                        // Check if already visited/queued
                        const isVisited = await redis.sismember(visitedKey, child.data.url);
                        if (!isVisited) {
                            await scrapeQueue.add(child.name, child.data, child.opts);
                        }
                    }
                }
                return { url, links: result.links };
            }

        } catch (error) {
            console.error(`Job ${job.id} failed:`, error);
            throw error;
        }
    }, {
        connection: {
            host: 'localhost',
            port: 6379
        }
    });

    worker.on('completed', (job: Job) => {
        if (job) console.log(`Job ${job.id} completed!`);
    });

    worker.on('failed', (job: Job | undefined, err: Error) => {
        if (job) console.log(`Job ${job.id} failed with ${err.message}`);
    });

    console.log('Worker initialized');
};
