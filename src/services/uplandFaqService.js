import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLAND_DATA_DIR = path.join(__dirname, '../data/upland');
const VECTOR_INDEX_PATH = path.join(UPLAND_DATA_DIR, 'vector_index.json');
const CUSTOM_DOCS_DIR = path.join(UPLAND_DATA_DIR, 'custom_docs');
const MARKDOWN_DIR = path.join(UPLAND_DATA_DIR, 'markdown');

const CHUNK_SIZE_WORDS = Number(process.env.CHUNK_SIZE_WORDS) || 500;
const CHUNK_OVERLAP_WORDS = Number(process.env.CHUNK_OVERLAP_WORDS) || 75;
const TOP_K_CHUNKS = Number(process.env.TOP_K_CHUNKS) || 3;

const STOP_WORDS = new Set([
    'what', 'how', 'when', 'where', 'who', 'why', 'which', 'is', 'are', 'was', 'were',
    'the', 'for', 'in', 'to', 'do', 'does', 'did', 'can', 'could', 'should', 'would',
    'and', 'or', 'but', 'with', 'from', 'about', 'into', 'onto', 'upland', 'tell', 'me',
]);

const SYSTEM_PROMPT = [
    'You are a helpful Upland assistant for our Discord community.',
    'Answer the player\'s question using ONLY the provided Official Upland Documentation and Community Veteran Answers.',
    'If the answer is not covered in the provided context, tell them to ask a veteran player in the chat or click the "💡 Teach / Submit Answer" button below to add an answer to the community database.',
    '',
    'Guidelines:',
    '- Keep answers concise, accurate, and easy to read in Discord (use bullet points and bold text where helpful).',
    '- If a Community Veteran Answer directly answers the question, incorporate it and credit the contributor.',
    '- Do NOT invent game mechanics, prices, or rules not supported by the provided context.',
].join('\n');

let cachedChunks = null;

export function tokenize(text) {
    if (!text || typeof text !== 'string') return [];
    return (text.toLowerCase().match(/[a-z0-9]{2,}/g) || []);
}

export function extractKeywords(text) {
    const tokens = tokenize(text).filter((w) => !STOP_WORDS.has(w));
    return [...new Set(tokens)].slice(0, 25).join(' ');
}

function getPgPool(client) {
    return client?.db?.db?.pool || null;
}

export function loadOfficialChunks() {
    if (cachedChunks && cachedChunks.length > 0) {
        return cachedChunks;
    }

    try {
        if (fs.existsSync(VECTOR_INDEX_PATH)) {
            const raw = fs.readFileSync(VECTOR_INDEX_PATH, 'utf8');
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
                cachedChunks = parsed;
                return cachedChunks;
            }
        }
    } catch (error) {
        logger.warn('Failed to load upland vector_index.json, rebuilding from markdown:', error.message);
    }

    cachedChunks = rebuildOfficialVectorIndexSync();
    return cachedChunks;
}

export function chunkMarkdownText(text, title, url, chunkSizeWords = CHUNK_SIZE_WORDS, overlapWords = CHUNK_OVERLAP_WORDS) {
    const rawSections = String(text || '').split(/\n+---+\n+|\n+(?=##\s)/);
    const chunks = [];
    let chunkIndex = 0;

    const flushChunk = (parasList, idx) => {
        const body = parasList.join('\n\n').trim();
        if (!body || body.split(/\s+/).length < 10) return;
        const urlHash = crypto.createHash('md5').update(`${url}_${idx}`).digest('hex').slice(0, 10);
        chunks.push({
            id: `doc_${urlHash}_${idx}`,
            title,
            url,
            chunk_index: idx,
            text: `Document: ${title}\nSource: ${url}\n\n${body}`,
        });
    };

    for (const section of rawSections) {
        const paragraphs = section.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
        let currentParas = [];
        let currentWordCount = 0;

        for (const para of paragraphs) {
            const pWords = para.split(/\s+/).length;
            if (!pWords) continue;

            if (currentWordCount + pWords <= chunkSizeWords || currentParas.length === 0) {
                currentParas.push(para);
                currentWordCount += pWords;
            } else {
                flushChunk(currentParas, chunkIndex);
                chunkIndex += 1;

                const overlapParas = [];
                let overlapCnt = 0;
                for (let i = currentParas.length - 1; i >= 0; i--) {
                    const prevP = currentParas[i];
                    const pw = prevP.split(/\s+/).length;
                    if (overlapCnt + pw <= overlapWords || overlapParas.length === 0) {
                        overlapParas.unshift(prevP);
                        overlapCnt += pw;
                    } else {
                        break;
                    }
                }
                currentParas = [...overlapParas, para];
                currentWordCount = overlapCnt + pWords;
            }
        }

        if (currentParas.length > 0) {
            flushChunk(currentParas, chunkIndex);
            chunkIndex += 1;
        }
    }

    return chunks;
}

export function rebuildOfficialVectorIndexSync() {
    const docs = [];

    const readMarkdownDir = (dirPath, defaultUrl) => {
        if (!fs.existsSync(dirPath)) return;
        const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.md'));
        for (const file of files) {
            const fullPath = path.join(dirPath, file);
            const content = fs.readFileSync(fullPath, 'utf8');
            const titleMatch = content.match(/^#\s+(.+)$/m);
            const sourceMatch = content.match(/^Source:\s*(https?:\/\/\S+)/m);
            const title = titleMatch ? titleMatch[1].trim() : file.replace(/\.md$/, '');
            const url = sourceMatch ? sourceMatch[1].trim() : defaultUrl;
            docs.push({ title, url, content });
        }
    };

    readMarkdownDir(CUSTOM_DOCS_DIR, 'https://www.upland.me/learn/');
    readMarkdownDir(MARKDOWN_DIR, 'https://www.upland.me/events/');

    const allChunks = [];
    for (const doc of docs) {
        allChunks.push(...chunkMarkdownText(doc.content, doc.title, doc.url));
    }

    if (allChunks.length > 0) {
        try {
            fs.mkdirSync(UPLAND_DATA_DIR, { recursive: true });
            fs.writeFileSync(VECTOR_INDEX_PATH, JSON.stringify(allChunks, null, 2), 'utf8');
        } catch (error) {
            logger.warn('Could not write rebuilt vector_index.json:', error.message);
        }
    }

    cachedChunks = allChunks;
    return allChunks;
}

export function retrieveOfficialChunks(question, topK = TOP_K_CHUNKS) {
    const chunks = loadOfficialChunks();
    if (!chunks.length) return [];

    const qTokens = tokenize(question).filter((w) => !STOP_WORDS.has(w));
    const searchTokens = qTokens.length > 0 ? qTokens : tokenize(question);
    if (!searchTokens.length) return chunks.slice(0, topK);

    const N = chunks.length;
    const docTokensList = chunks.map((c) => tokenize(`${c.title || ''} ${c.text || ''}`));
    const avgdl = docTokensList.reduce((acc, t) => acc + t.length, 0) / Math.max(N, 1);

    const df = new Map();
    for (const tokens of docTokensList) {
        for (const term of new Set(tokens)) {
            df.set(term, (df.get(term) || 0) + 1);
        }
    }

    const k1 = 1.5;
    const b = 0.75;
    const scored = [];

    for (let idx = 0; idx < N; idx++) {
        const tokens = docTokensList[idx];
        const dl = tokens.length;
        const tf = new Map();
        for (const t of tokens) {
            tf.set(t, (tf.get(t) || 0) + 1);
        }

        let score = 0;
        for (const term of searchTokens) {
            const freq = tf.get(term) || 0;
            if (!freq) continue;
            const nQ = df.get(term) || 0;
            const idf = Math.log((N - nQ + 0.5) / (nQ + 0.5) + 1.0);
            const denom = freq + k1 * (1 - b + b * (dl / Math.max(avgdl, 1.0)));
            score += idf * ((freq * (k1 + 1)) / denom);
        }

        scored.push({
            ...chunks[idx],
            score: Number(score.toFixed(4)),
        });
    }

    scored.sort((a, bItem) => bItem.score - a.score);
    return scored.slice(0, topK);
}

/**
 * Ensure the guild row exists before inserting into upland_faq_entries (FK constraint).
 */
async function ensureGuildRow(pool, guildId) {
    await pool.query(
        `INSERT INTO guilds (id, config) VALUES ($1, '{}') ON CONFLICT (id) DO NOTHING`,
        [String(guildId)]
    );
}

/**
 * Add or update a user/community FAQ answer in PostgreSQL (with memory fallback).
 */
export async function addCommunityAnswer(client, {
    guildId,
    question,
    answer,
    authorId,
    authorTag,
    verified = false,
}) {
    const cleanQuestion = String(question || '').trim();
    const cleanAnswer = String(answer || '').trim();
    const keywords = extractKeywords(`${cleanQuestion} ${cleanAnswer}`);
    const pool = getPgPool(client);

    if (pool) {
        await ensureGuildRow(pool, guildId);

        const existing = await pool.query(
            `SELECT id FROM upland_faq_entries
             WHERE guild_id = $1 AND LOWER(TRIM(question)) = LOWER(TRIM($2))
             LIMIT 1`,
            [String(guildId), cleanQuestion]
        );

        if (existing.rows.length > 0) {
            const updated = await pool.query(
                `UPDATE upland_faq_entries
                 SET answer = $1,
                     keywords = $2,
                     author_id = $3,
                     author_tag = $4,
                     verified = $5,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $6
                 RETURNING *`,
                [cleanAnswer, keywords, String(authorId || ''), String(authorTag || ''), Boolean(verified), existing.rows[0].id]
            );
            return { entry: updated.rows[0], updated: true };
        }

        const inserted = await pool.query(
            `INSERT INTO upland_faq_entries (guild_id, question, answer, keywords, author_id, author_tag, verified)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING *`,
            [String(guildId), cleanQuestion, cleanAnswer, keywords, String(authorId || ''), String(authorTag || ''), Boolean(verified)]
        );
        return { entry: inserted.rows[0], updated: false };
    }

    // Memory / key-value fallback
    const key = `guild:${guildId}:upland_faq_entries`;
    const entries = (await client?.db?.get?.(key, [])) || [];
    const nextId = entries.length > 0 ? Math.max(...entries.map((e) => Number(e.id) || 0)) + 1 : 1;
    const entry = {
        id: nextId,
        guild_id: String(guildId),
        question: cleanQuestion,
        answer: cleanAnswer,
        keywords,
        author_id: String(authorId || ''),
        author_tag: String(authorTag || ''),
        upvotes: 0,
        verified: Boolean(verified),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
    entries.unshift(entry);
    await client?.db?.set?.(key, entries);
    return { entry, updated: false };
}

/**
 * Search user-submitted answers in PostgreSQL for a given question.
 */
export async function searchCommunityAnswers(client, guildId, question, topK = 3) {
    let rows = [];
    const pool = getPgPool(client);

    if (pool) {
        try {
            const res = await pool.query(
                `SELECT id, guild_id, question, answer, keywords, author_id, author_tag, upvotes, verified, updated_at
                 FROM upland_faq_entries
                 WHERE guild_id = $1
                 ORDER BY verified DESC, upvotes DESC, updated_at DESC
                 LIMIT 200`,
                [String(guildId)]
            );
            rows = res.rows || [];
        } catch (error) {
            logger.warn('Failed to query upland_faq_entries from PostgreSQL:', error.message);
        }
    } else if (client?.db?.get) {
        rows = (await client.db.get(`guild:${guildId}:upland_faq_entries`, [])) || [];
    }

    if (!rows.length) return [];

    const qTokens = tokenize(question).filter((w) => !STOP_WORDS.has(w));
    const searchTokens = qTokens.length > 0 ? qTokens : tokenize(question);
    if (!searchTokens.length) return [];

    const normQuestion = String(question || '').trim().toLowerCase();

    const scored = [];
    for (const row of rows) {
        const rowQ = String(row.question || '').trim().toLowerCase();
        if (rowQ === normQuestion) {
            scored.push({ ...row, score: 100 });
            continue;
        }

        const docTokens = tokenize(`${row.question} ${row.keywords || ''} ${row.answer}`);
        const qDocTokens = new Set(tokenize(row.question));
        const allDocTokens = new Set(docTokens);

        let matchScore = 0;
        let matchedQueryTerms = 0;
        for (const term of searchTokens) {
            if (qDocTokens.has(term)) {
                matchScore += 3.0;
                matchedQueryTerms += 1;
            } else if (allDocTokens.has(term)) {
                matchScore += 1.25;
                matchedQueryTerms += 1;
            }
        }

        const coverage = matchedQueryTerms / searchTokens.length;
        if (matchScore >= 2.5 && coverage >= 0.34) {
            const verifiedBoost = row.verified ? 1.5 : 0;
            scored.push({
                ...row,
                score: Number((matchScore * (1 + coverage) + verifiedBoost).toFixed(3)),
            });
        }
    }

    scored.sort((a, bItem) => bItem.score - a.score);
    return scored.slice(0, topK);
}

/**
 * List recent community answers from the database.
 */
export async function listCommunityAnswers(client, guildId, limit = 10) {
    const pool = getPgPool(client);
    if (pool) {
        const res = await pool.query(
            `SELECT id, question, answer, author_id, author_tag, verified, upvotes, updated_at
             FROM upland_faq_entries
             WHERE guild_id = $1
             ORDER BY updated_at DESC
             LIMIT $2`,
            [String(guildId), Number(limit) || 10]
        );
        return res.rows || [];
    }

    const rows = (await client?.db?.get?.(`guild:${guildId}:upland_faq_entries`, [])) || [];
    return rows.slice(0, limit);
}

/**
 * Delete a community answer by ID.
 */
export async function deleteCommunityAnswer(client, guildId, entryId) {
    const pool = getPgPool(client);
    if (pool) {
        const res = await pool.query(
            `DELETE FROM upland_faq_entries WHERE guild_id = $1 AND id = $2 RETURNING *`,
            [String(guildId), Number(entryId)]
        );
        return res.rows[0] || null;
    }

    const key = `guild:${guildId}:upland_faq_entries`;
    const rows = (await client?.db?.get?.(key, [])) || [];
    const idx = rows.findIndex((r) => Number(r.id) === Number(entryId));
    if (idx === -1) return null;
    const [removed] = rows.splice(idx, 1);
    await client?.db?.set?.(key, rows);
    return removed;
}

export function extractGroundedAnswer(question, officialChunks, communityMatches = []) {
    const parts = [];

    if (communityMatches.length > 0) {
        const topComm = communityMatches[0];
        const contributor = topComm.author_tag ? ` (contributed by **${topComm.author_tag}**)` : '';
        parts.push(`**💡 Community Answer${contributor}:**\n${topComm.answer}`);
    }

    const qWords = tokenize(question).filter((w) => !STOP_WORDS.has(w));
    const candidateBlocks = [];

    for (const chunk of officialChunks) {
        const rawText = chunk.text || '';
        const body = rawText.replace(/^Document:.*?\nSource:.*?\n+/s, '').trim();
        const sections = body.split(/\n(?=#{1,3}\s|\*\*|- )/);
        for (const sec of sections) {
            const cleaned = sec.trim();
            if (cleaned.length >= 25) {
                candidateBlocks.push(cleaned);
            }
        }
    }

    if (candidateBlocks.length > 0) {
        const scoredBlocks = candidateBlocks.map((block, idx) => {
            const low = ` ${block.toLowerCase()} `;
            let score = 0;
            for (const w of qWords) {
                if (low.includes(` ${w} `)) score += 3.0;
                else if (low.includes(w)) score += 1.5;
            }
            score += Math.max(0, 1.0 - idx * 0.05);
            return { score, block };
        });

        scoredBlocks.sort((a, bItem) => bItem.score - a.score);

        const selected = [];
        let totalLen = 0;
        const maxOfficialLen = communityMatches.length > 0 ? 750 : 1200;

        for (const item of scoredBlocks) {
            if (!selected.includes(item.block) && totalLen + item.block.length < maxOfficialLen) {
                selected.push(item.block);
                totalLen += item.block.length;
            }
            if (selected.length >= (communityMatches.length > 0 ? 2 : 3)) break;
        }

        if (selected.length > 0) {
            parts.push(selected.join('\n\n'));
        }
    } else if (officialChunks[0]) {
        const fallbackBody = (officialChunks[0].text || '').replace(/^Document:.*?\nSource:.*?\n+/s, '').trim();
        if (fallbackBody) {
            parts.push(fallbackBody.slice(0, 900));
        }
    }

    if (parts.length === 0) {
        return 'I couldn\'t find that in the Upland documentation yet. Ask a veteran player in chat or click **💡 Teach Answer** below to add the answer to our server database!';
    }

    return parts.join('\n\n---\n\n');
}

async function callGeminiApi(question, contextText) {
    const apiKey = (process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey || apiKey === 'your_gemini_api_key_here') {
        return null;
    }

    const model = (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
    const userPrompt = [
        '### KNOWLEDGE BASE (COMMUNITY DATABASE & OFFICIAL UPLAND DOCUMENTATION):',
        contextText,
        '',
        '### PLAYER QUESTION:',
        question,
        '',
        '### INSTRUCTIONS:',
        'Answer the player\'s question accurately using ONLY the knowledge base above.',
        'If a Community Answer is present and relevant, highlight it clearly.',
        'If the answer is not in the knowledge base, suggest asking a veteran player or clicking "💡 Teach Answer" to save an answer for future players.',
    ].join('\n');

    const payload = {
        systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }],
        },
        contents: [
            {
                role: 'user',
                parts: [{ text: userPrompt }],
            },
        ],
        generationConfig: {
            temperature: 0.15,
            maxOutputTokens: 700,
        },
    };

    const endpoints = apiKey.startsWith('AQ.')
        ? [
            `https://aiplatform.googleapis.com/v1beta1/publishers/google/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        ]
        : [
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        ];

    for (const url of endpoints) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(12000),
            });

            if (!response.ok) {
                continue;
            }

            const data = await response.json();
            const text = data?.candidates?.[0]?.content?.parts
                ?.map((p) => p.text || '')
                .join('')
                .trim();

            if (text) {
                return text;
            }
        } catch (error) {
            logger.debug(`Gemini API request attempt failed (${error.message}), trying fallback.`);
        }
    }

    return null;
}

export async function answerUplandQuestion(client, guildId, question, topK = TOP_K_CHUNKS) {
    const [communityMatches, officialChunks] = await Promise.all([
        searchCommunityAnswers(client, guildId, question, 3),
        Promise.resolve(retrieveOfficialChunks(question, topK)),
    ]);

    const contextSections = [];

    if (communityMatches.length > 0) {
        communityMatches.forEach((m, idx) => {
            contextSections.push(
                `--- [Community Database Answer #${idx + 1} | ID: #${m.id} | Contributor: ${m.author_tag || 'Community Member'}] ---\n` +
                `Question: ${m.question}\nAnswer: ${m.answer}`
            );
        });
    }

    if (officialChunks.length > 0) {
        officialChunks.forEach((c, idx) => {
            contextSections.push(
                `--- [Official Upland Doc #${idx + 1} | Title: ${c.title || 'Upland Docs'} | Source: ${c.url || ''}] ---\n` +
                `${c.text || ''}`
            );
        });
    }

    const uniqueSources = [];
    for (const c of officialChunks) {
        const url = c.url || '';
        const title = (c.title || 'Official Upland Guide').split('|')[0].trim();
        if (url && !uniqueSources.some((s) => s.url === url)) {
            uniqueSources.push({ title, url });
        }
    }

    let answerText = null;
    if (contextSections.length > 0) {
        answerText = await callGeminiApi(question, contextSections.join('\n\n'));
    }

    if (!answerText) {
        answerText = extractGroundedAnswer(question, officialChunks, communityMatches);
    }

    return {
        answer: answerText,
        sources: uniqueSources.slice(0, 3),
        communityMatches,
        officialChunks,
    };
}
