import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { rebuildOfficialVectorIndexSync } from '../src/services/uplandFaqService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MARKDOWN_DIR = path.join(__dirname, '../src/data/upland/markdown');
const MAX_GUIDE_PAGES = Number(process.env.MAX_GUIDE_PAGES) || 80;
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS) || 15000;

const PRIORITY_GUIDE_URLS = [
    'https://upland-guide.com/',
    'https://upland-guide.com/uppies/troves/',
    'https://upland-guide.com/uppies/troves/recipes/',
    'https://upland-guide.com/uppies/',
    'https://upland-guide.com/getting-started/',
    'https://upland-guide.com/fundamentals/',
];

const GUIDE_SITEMAPS = [
    'https://upland-guide.com/page-sitemap.xml',
    'https://upland-guide.com/post-sitemap.xml',
];

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
};

function normalizeGuideUrl(rawUrl) {
    try {
        const parsed = new URL(rawUrl, 'https://upland-guide.com');
        const host = parsed.hostname.toLowerCase();
        if (host !== 'upland-guide.com' && host !== 'www.upland-guide.com') return null;
        const cleanPath = parsed.pathname.replace(/\/+$/, '') || '/';
        if (/\/(feed|comments|wp-json|wp-content|wp-admin|registration|reset-password)(\/|$)/i.test(cleanPath)) return null;
        if (/\.(png|jpg|jpeg|gif|svg|pdf|zip|mp4|css|js|webp|xml)$/i.test(cleanPath)) return null;
        return `https://upland-guide.com${cleanPath}`;
    } catch {
        return null;
    }
}

function decodeHtmlEntities(text) {
    return String(text || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;|&#8217;|&#8216;/g, "'")
        .replace(/&#8220;|&#8221;/g, '"')
        .replace(/&#8211;|&#8212;/g, '-')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function htmlToMarkdown(html, baseUrl) {
    const raw = String(html || '');

    const titleMatch = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const h1Match = raw.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const metaDescMatch =
        raw.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
        raw.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i);

    const title = decodeHtmlEntities((titleMatch?.[1] || h1Match?.[1] || baseUrl).replace(/<[^>]+>/g, '').trim());
    const metaDesc = decodeHtmlEntities((metaDescMatch?.[1] || '').trim());

    const entryMatch = raw.match(/<div[^>]+class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*(?:<footer|<div[^>]+class=["'][^"']*(?:sharedaddy|post-tags|comments))/i);
    const articleMatch = raw.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
    const mainMatch = raw.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
    let bodyHtml = entryMatch?.[1] || articleMatch?.[1] || mainMatch?.[1] || raw;

    bodyHtml = bodyHtml
        .replace(/<(script|style|noscript|svg|iframe|nav|header|footer|aside|form)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '');

    bodyHtml = bodyHtml
        .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
            const label = text.replace(/<[^>]+>/g, '').trim();
            if (!label) return '';
            const abs = normalizeGuideUrl(href) || href;
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
        .slice(0, 60) || 'home';
    const hash = crypto.createHash('md5').update(url).digest('hex').slice(0, 6);
    return `guide_${slug}_${hash}.md`;
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

async function discoverGuideUrls() {
    const ordered = [];
    const seen = new Set();

    const addUrl = (raw) => {
        const norm = normalizeGuideUrl(raw);
        if (norm && !seen.has(norm)) {
            seen.add(norm);
            ordered.push(norm);
        }
    };

    for (const pUrl of PRIORITY_GUIDE_URLS) {
        addUrl(pUrl);
    }

    // Discover links from homepage
    try {
        const homeHtml = await fetchText('https://upland-guide.com/');
        for (const match of homeHtml.matchAll(/href=["']([^"'#?]+)["']/gi)) {
            addUrl(match[1]);
        }
        console.log(`[Homepage] Discovered ${ordered.length} URL(s) from upland-guide.com`);
    } catch (err) {
        console.warn(`[Homepage] Failed: ${err.message}`);
    }

    // Parse Yoast sitemaps sorted by newest lastmod
    const entries = [];
    for (const smUrl of GUIDE_SITEMAPS) {
        try {
            const xml = await fetchText(smUrl);
            for (const block of xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)) {
                const loc = block[1].match(/<loc>\s*([^<\s]+)\s*<\/loc>/i)?.[1];
                const lastmod = block[1].match(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/i)?.[1] || '';
                const norm = normalizeGuideUrl(loc);
                if (norm) {
                    entries.push({ loc: norm, lastmod });
                }
            }
        } catch (err) {
            console.warn(`[Sitemap] Failed ${smUrl}: ${err.message}`);
        }
    }

    entries.sort((a, b) => b.lastmod.localeCompare(a.lastmod));
    for (const e of entries) {
        addUrl(e.loc);
    }

    console.log(`[Sitemap] Total unique upland-guide.com URLs discovered: ${ordered.length}`);
    return ordered.slice(0, MAX_GUIDE_PAGES);
}

async function main() {
    fs.mkdirSync(MARKDOWN_DIR, { recursive: true });
    const urls = await discoverGuideUrls();

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
            fs.writeFileSync(path.join(MARKDOWN_DIR, fileName), doc.content, 'utf8');
            savedCount += 1;
            console.log(`[Saved] ${fileName} (${doc.title.slice(0, 60)})`);
        } catch (err) {
            failedCount += 1;
            console.warn(`[Error] ${url}: ${err.message}`);
        }
    }

    console.log('\n[Index] Rebuilding vector_index.json from all Upland docs...');
    const chunks = rebuildOfficialVectorIndexSync();
    console.log(`[Done] Saved/updated ${savedCount} upland-guide.com doc(s) (${failedCount} failed). Total vector chunks: ${chunks.length}`);
}

main().catch((err) => {
    console.error('[Fatal]', err);
    process.exit(1);
});
