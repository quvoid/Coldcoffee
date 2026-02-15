import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import { convertHtmlToMarkdown } from '../lib/html-to-md';
import { getRandomUserAgent, defaultHeaders } from '../lib/user-agents';

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

    async scrape(url: string, mode: 'scrape' | 'map' = 'scrape'): Promise<ScrapeResult> {
        if (!this.browser) await this.init();


        const page = await this.browser!.newPage();
        try {
            // Advanced Anti-Bot: Rotate UA and set headers
            const ua = getRandomUserAgent();
            await page.setUserAgent(ua);
            await page.setExtraHTTPHeaders(defaultHeaders);

            // Hide webdriver
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => false,
                });
            });

            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

            // Wait for body
            await page.waitForSelector('body');

            const content = await page.content();

            // Extract links
            const links = await page.$$eval('a', (anchors) => anchors.map(a => a.href));
            const uniqueLinks = [...new Set(links)]; // Deduplicate

            if (mode === 'map') {
                return {
                    url,
                    markdown: '',
                    title: await page.title(),
                    html: '',
                    links: uniqueLinks,
                    metadata: {}
                };
            }

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
