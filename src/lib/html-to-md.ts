import TurndownService from 'turndown';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
});

export function convertHtmlToMarkdown(html: string, url: string) {
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();

    if (!article) {
        throw new Error('Failed to parse article content');
    }

    const markdown = turndownService.turndown(article.content || '');

    return {
        title: article.title || 'No Title',
        content: article.content || '',
        textContent: article.textContent || '',
        markdown,
        excerpt: article.excerpt || '',
        byline: article.byline || '',
        dir: article.dir || '',
        siteName: article.siteName || '',
    };
}
