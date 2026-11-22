import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { rebuildOfficialVectorIndexSync } from '../src/services/uplandFaqService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MARKDOWN_DIR = path.join(__dirname, '../src/data/upland/markdown');
const MAX_EVENT_PAGES = Number(process.env.MAX_EVENT_PAGES) || 35;
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS) || 15000;

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
};

function normalizeUrl(rawUrl) {
    try {
        const parsed = new URL(rawUrl, 'https://www.upland.me');
        const host = parsed.hostname.toLowerCase() === 'upland.me' ? 'www.upland.me' : parsed.hostname.toLowerCase();
        const cleanPath = parsed.pathname.replace(/\/+$/, '') || '/';
        return `https://${host}${cleanPath}`;
    } catch {
        return null;
    }
}

function isEventUrl(url) {
    if (!url) return false;
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        if (host !== 'www.upland.me' && host !== 'upland.me') return false;
        const lowerPath = parsed.pathname.toLowerCase();
        if (!lowerPath.startsWith('/events')) return false;
        return !/\.(png|jpg|jpeg|gif|svg|pdf|zip|mp4|css|js|webp)$/i.test(lowerPath);
    } catch {
        return false;
    }
}

function decodeHtmlEntities(text) {
    return String(text || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function htmlToMarkdown(html, baseUrl) {
    let cleaned = String(html || '');

    // Extract title & meta description before stripping head
    const titleMatch = cleaned.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const h1Match = cleaned.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const metaDescMatch =
        cleaned.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
        cleaned.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);

    const title = decodeHtmlEntities((titleMatch?.[1] || h1Match?.[1] || baseUrl).replace(/<[^>]+>/g, '').trim());
    const metaDesc = decodeHtmlEntities((metaDescMatch?.[1] || '').trim());

    // Focus on <article> or <main> if available
    const articleMatch = cleaned.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
    const mainMatch = cleaned.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
    let bodyHtml = articleMatch?.[1] || mainMatch?.[1] || cleaned;

    // Remove non-content tags
    bodyHtml = bodyHtml
        .replace(/<(script|style|noscript|svg|iframe|nav|header|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');

    // Convert links and headings to Markdown
    bodyHtml = bodyHtml
        .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
            const label = text.replace(/<[^>]+>/g, '').trim();
            if (!label) return '';
            const abs = normalizeUrl(href) || href;
            return `[${label}](${abs})`;
        })
        .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n\n# $1\n\n')
        .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n## $1\n\n')
        .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n\n### $1\n\n')
        .replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, '\n\n#### $1\n\n')
        .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
        .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
        .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|section|tr|blockquote)>/gi, '\n\n');

    // Strip remaining HTML tags and collapse whitespace
    let markdown = decodeHtmlEntities(bodyHtml.replace(/<[^>]+>/g, ' '))
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n[ \t]+/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    if (metaDesc && !markdown.includes(metaDesc)) {
        markdown = `${metaDesc}\n\n${markdown}`;
    }

    const header = [
        `# ${title}`,
        '',
        `**Source:** ${baseUrl}`,
        '',
        '---',
        '',
    ].join('\n');

    return {
        title,
        url: baseUrl,
        content: `${header}${markdown}`.trim(),
    };
}

function makeFilename(url) {
    const parsed = new URL(url);
    const slug = parsed.pathname
        .replace(/^\/+|\/+$/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 60) || 'events';
    const hash = crypto.createHash('md5').update(url).digest('hex').slice(0, 6);
    return `${slug}_${hash}.md`;
}

async function fetchText(url) {
    const res = await fetch(url, {
        headers: HEADERS,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }
    return await res.text();
}

async function discoverEventUrls() {
    const ordered = [];
    const seen = new Set();

    const addUrl = (raw) => {
        const norm = normalizeUrl(raw);
        if (norm && isEventUrl(norm) && !seen.has(norm)) {
            seen.add(norm);
            ordered.push(norm);
        }
    };

    // 1. Seed from https://www.upland.me/events/ (featured / newest events appear first)
    addUrl('https://www.upland.me/events/');
    try {
        const eventsHtml = await fetchText('https://www.upland.me/events/');
        for (const match of eventsHtml.matchAll(/href=["']([^"'#?]+)["']/gi)) {
            addUrl(match[1]);
        }
        console.log(`[Events Page] Discovered ${ordered.length} event URL(s) from /events/`);
    } catch (err) {
        console.warn(`[Events Page] Failed to fetch /events/: ${err.message}`);
    }

    // 2. Also check sitemap.xml (and nested sitemaps if any)
    try {
        const sitemapXml = await fetchText('https://www.upland.me/sitemap.xml');
        const locs = [...sitemapXml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
        for (const loc of locs) {
            if (loc.endsWith('.xml')) {
                try {
                    const childXml = await fetchText(loc);
                    for (const childLoc of childXml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
                        addUrl(childLoc[1]);
                    }
                } catch {
                    // ignore unreachable sub-sitemap
                }
            } else {
                addUrl(loc);
            }
        }
        console.log(`[Sitemap] Total unique /events/ URL(s) after sitemap: ${ordered.length}`);
    } catch (err) {
        console.warn(`[Sitemap] Could not fetch sitemap.xml: ${err.message}`);
    }

    return ordered.slice(0, MAX_EVENT_PAGES);
}

async function main() {
    fs.mkdirSync(MARKDOWN_DIR, { recursive: true });
    const urls = await discoverEventUrls();

    if (urls.length === 0) {
        console.error('[Scraper] No event URLs discovered.');
        process.exit(1);
    }

    let savedCount = 0;
    let failedCount = 0;

    for (const url of urls) {
        try {
            const html = await fetchText(url);
            const doc = htmlToMarkdown(html, url);
            if (doc.content.split(/\s+/).length < 25) {
                console.log(`[Skip] Too little text on ${url}`);
                continue;
            }
            const fileName = makeFilename(url);
            const filePath = path.join(MARKDOWN_DIR, fileName);
            fs.writeFileSync(filePath, doc.content, 'utf8');
            savedCount += 1;
            console.log(`[Saved] ${fileName} (${doc.title.slice(0, 60)})`);
        } catch (err) {
            failedCount += 1;
            console.warn(`[Error] ${url}: ${err.message}`);
        }
    }

    console.log(`\n[Index] Rebuilding vector_index.json from all Upland markdown docs...`);
    const chunks = rebuildOfficialVectorIndexSync();
    console.log(`[Done] Saved/updated ${savedCount} event doc(s) (${failedCount} failed). Total vector chunks: ${chunks.length}`);
}

main().catch((err) => {
    console.error('[Fatal]', err);
    process.exit(1);
});
