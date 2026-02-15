import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import { convertHtmlToMarkdown } from '../lib/html-to-md';

puppeteer.use(StealthPlugin());

export interface ScrapeResult {
    url: string;
    markdown: string;
    title: string;
    metadata: any;
    html: string;
    links: string[];
}

export class ScraperEngine {
    private browser: Browser | null = null;

    async init() {
        if (!this.browser) {
            this.browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            });
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    async scrape(url: string): Promise<ScrapeResult> {
        if (!this.browser) await this.init();

        const page = await this.browser!.newPage();
        try {
            // Random User Agent
            const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
            await page.setUserAgent(ua);

            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

            // Wait for body
            await page.waitForSelector('body');

            const content = await page.content();

            // Extract links
            const links = await page.$$eval('a', (anchors) => anchors.map(a => a.href));
            const uniqueLinks = [...new Set(links)]; // Deduplicate

            // Convert to Markdown
            const extracted = convertHtmlToMarkdown(content, url);

            return {
                url,
                markdown: extracted.markdown,
                title: extracted.title || '',
                html: extracted.content,
                links: uniqueLinks,
                metadata: {
                    excerpt: extracted.excerpt,
                    byline: extracted.byline,
                    language: 'en', // todo: detect language
                }
            };

        } catch (error) {
            console.error(`Error scraping ${url}:`, error);
            throw error;
        } finally {
            await page.close();
        }
    }
}
