// src/tools/web_tools.js
// Universal Web Tools - Browsing, Scraping, Search
const { exec } = require('child_process');
const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');
const { processWebContent } = require('../engine/context_manager');

// Daftar situs populer dengan URL langsung
// Gunakan Map agar bisa lookup case-insensitive dan partial match
const KNOWN_SITES_MAP = new Map([
    ['youtube', 'https://www.youtube.com'],
    ['youtube music', 'https://music.youtube.com'],
    ['google', 'https://www.google.com'],
    ['gmail', 'https://mail.google.com'],
    ['maps', 'https://maps.google.com'],
    ['github', 'https://github.com'],
    ['stackoverflow', 'https://stackoverflow.com'],
    ['reddit', 'https://www.reddit.com'],
    ['twitter', 'https://twitter.com'],
    ['x', 'https://x.com'],
    ['facebook', 'https://www.facebook.com'],
    ['instagram', 'https://www.instagram.com'],
    ['linkedin', 'https://www.linkedin.com'],
    ['whatsapp', 'https://web.whatsapp.com'],
    ['web whatsapp', 'https://web.whatsapp.com'],
    ['wa', 'https://web.whatsapp.com'],
    ['telegram', 'https://web.telegram.org'],
    ['web telegram', 'https://web.telegram.org'],
    ['discord', 'https://discord.com'],
    ['spotify', 'https://open.spotify.com'],
    ['netflix', 'https://www.netflix.com'],
    ['amazon', 'https://www.amazon.com'],
    ['wikipedia', 'https://www.wikipedia.org'],
    ['detik', 'https://www.detik.com'],
    ['kompas', 'https://www.kompas.com'],
    ['tokopedia', 'https://www.tokopedia.com'],
    ['shopee', 'https://shopee.co.id'],
    ['gojek', 'https://www.gojek.com'],
    ['grab', 'https://www.grab.com'],
    ['chatgpt', 'https://chat.openai.com'],
    ['chat gpt', 'https://chat.openai.com'],
    ['deepseek', 'https://chat.deepseek.com'],
    ['claude', 'https://claude.ai'],
    ['perplexity', 'https://www.perplexity.ai'],
    ['bing', 'https://www.bing.com'],
    ['yahoo', 'https://www.yahoo.com'],
    ['duckduckgo', 'https://duckduckgo.com'],
    ['instagram', 'https://www.instagram.com'],
    ['tiktok', 'https://www.tiktok.com'],
    ['pinterest', 'https://www.pinterest.com'],
    ['canva', 'https://www.canva.com'],
    ['zoom', 'https://zoom.us'],
    ['meet', 'https://meet.google.com'],
    ['google meet', 'https://meet.google.com'],
    ['classroom', 'https://classroom.google.com'],
    ['google classroom', 'https://classroom.google.com'],
    ['drive', 'https://drive.google.com'],
    ['google drive', 'https://drive.google.com'],
    ['docs', 'https://docs.google.com'],
    ['google docs', 'https://docs.google.com'],
    ['sheets', 'https://sheets.google.com'],
    ['google sheets', 'https://sheets.google.com'],
    ['slides', 'https://slides.google.com'],
    ['google slides', 'https://slides.google.com'],
    ['notion', 'https://www.notion.so'],
    ['figma', 'https://www.figma.com'],
    ['medium', 'https://medium.com'],
    ['quora', 'https://www.quora.com'],
    ['twitch', 'https://www.twitch.tv'],
    ['vimeo', 'https://vimeo.com'],
    ['imdb', 'https://www.imdb.com'],
    ['cnn', 'https://www.cnn.com'],
    ['bbc', 'https://www.bbc.com'],
    ['the verge', 'https://www.theverge.com'],
    ['techcrunch', 'https://techcrunch.com'],
    ['wired', 'https://www.wired.com'],
    ['hacker news', 'https://news.ycombinator.com'],
    ['LMS Telkom University', 'https://lms.telkomuniversity.ac.id'],
    ['LMS Tel-U', 'https://lms.telkomuniversity.ac.id'],
    ['LMS Telkom University', 'https://lms.telkomuniversity.ac.id'],
    ['LMS Tel-U', 'https://lms.telkomuniversity.ac.id'],
    ['Igracias', 'https://igracias.telkomuniversity.ac.id'],
    ['G-Meet', 'https://meet.google.com'],
    ['G-Drive', 'https://drive.google.com'],
    ['G-Docs', 'https://docs.google.com'],
    ['G-Sheets', 'https://sheets.google.com'],
    ['G-Slides', 'https://slides.google.com'],
    ['zoom', 'https://zoom.us'],
    
]);

// Untuk backward compatibility dengan agent.js yang masih import KNOWN_SITES
const KNOWN_SITES = Object.fromEntries(KNOWN_SITES_MAP);

/**
 * Cari di KNOWN_SITES dengan partial match (untuk multi-word)
 * Contoh: "web whatsapp" match dengan key "web whatsapp" atau "whatsapp"
 */
/**
 * Cari di KNOWN_SITES dengan case-insensitive dan partial match
 */
function findKnownSite(text) {
    const lowerText = text.toLowerCase();
    
    // Exact match case-insensitive
    if (KNOWN_SITES[lowerText]) {
        return KNOWN_SITES[lowerText];
    }
    
    // Partial match: cari key yang mengandung semua kata dari input
    const words = lowerText.split(/\s+/).filter(w => w.length > 1);
    for (const [key, url] of KNOWN_SITES_MAP) {
        const lowerKey = key.toLowerCase();
        // Exact match case-insensitive
        if (lowerKey === lowerText) return url;
        
        const keyWords = lowerKey.split(/\s+/);
        // Cocokkan jika semua kata dari input ada di key
        const match = words.every(w => keyWords.some(kw => kw.includes(w) || w.includes(kw)));
        if (match) return url;
    }
    
    return null;
}

/**
 * Coba tebak domain untuk multi-word input
 * Contoh: "lms telkom" → coba https://lms.telkomuniversity.ac.id, https://lms-telkom.com
 *          "siakad polban" → coba https://siakad.polban.ac.id
 */
function guessDomain(text) {
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 1);
    if (words.length < 2) return null;
    
    // Pola umum domain kampus: kata1.kata2.ac.id
    const kampusWords = ['telkom', 'tel-u', 'telkomuniversity', 'polban', 'itb', 'ugm', 'ui', 'unpad', 'undip', 'univ', 'university', 'ac.id'];
    const hasKampus = words.some(w => kampusWords.some(k => w.includes(k) || k.includes(w)));
    
    if (hasKampus) {
        // Coba format kata1.kata2.ac.id
        const domain = words.join('');
        const domain2 = words.join('-');
        // Prioritaskan yang paling umum
        if (words.some(w => w.includes('telkom') || w.includes('tel-u'))) {
            return 'https://lms.telkomuniversity.ac.id';
        }
        if (words.some(w => w.includes('polban'))) {
            return 'https://lms.polban.ac.id';
        }
        return `https://${words[0]}.${words.slice(1).join('')}.ac.id`;
    }
    
    // Untuk non-kampus, coba format kata1-kata2.com
    return `https://${words.join('-')}.com`;
}

/**
 * Normalisasi input: jika hanya nama situs tanpa URL, cari di KNOWN_SITES atau tebak domain
 */
function normalizeUrl(input) {
    let text = input.trim().toLowerCase();
    
    // Hapus kata perintah dari awal
    text = text.replace(/^(buka|open|browse)\s+/i, '').trim();
    // Hapus "website ", "web ", "situs ", "halaman " dari awal
    text = text.replace(/^(website|web|situs|halaman)\s+/i, '').trim();
    // Hapus "di browser" di akhir
    text = text.replace(/\s+di\s+browser$/i, '').trim();
    
    // Jika sudah ada protocol, return langsung
    if (text.startsWith('http://') || text.startsWith('https://')) {
        return text;
    }
    
    // Jika mengandung titik, mungkin domain langsung
    if (text.includes('.')) {
        return text.startsWith('http') ? text : `https://${text}`;
    }
    
    // Cek di KNOWN_SITES dulu (exact + partial match)
    const knownUrl = findKnownSite(text);
    if (knownUrl) {
        return knownUrl;
    }
    
    // Jika hanya satu kata (nama situs), coba tebak dengan .com
    if (text.split(/\s+/).length === 1) {
        return `https://www.${text}.com`;
    }
    
    // Multi-word: coba tebak domain
    const guessed = guessDomain(text);
    if (guessed) {
        return guessed;
    }
    
    // Fallback: cari di Google
    return null;
}

/**
 * Membuka URL atau nama situs di browser default.
 * Jika hanya nama situs, akan otomatis melengkapi URL atau search.
 */
function open_web_tool(input) {
    logger.tool('open_web_tool', `Input: "${input}"`);
    
    try {
        const url = normalizeUrl(input);
        
        if (url) {
            logger.tool('open_web_tool', `Normalized URL: ${url}`);
            const command = process.platform === 'win32' ? `start "" "${url}"` : `open "${url}"`;
            exec(command, (error) => {
                if (error) {
                    logger.error('open_web_tool', `exec error: ${error.message}`);
                }
            }); 
            return `✅ Membuka ${url} di browser.`;
        } else {
            // Fallback: cari di Google
            const searchQuery = encodeURIComponent(input.replace(/^(buka|open|browse)\s+/i, ''));
            const searchUrl = `https://www.google.com/search?q=${searchQuery}`;
            const command = process.platform === 'win32' ? `start "" "${searchUrl}"` : `open "${searchUrl}"`;
            exec(command);
            return `🔍 Mencari "${input.replace(/^(buka|open|browse)\s+/i, '')}" di Google...\n✅ Membuka hasil pencarian.`;
        }
    } catch (error) {
        logger.error('open_web_tool', error);
        return `❌ Gagal membuka: ${error.message}. Coba ketik "cari ${input}" untuk mencari di Google.`;
    }
}

/**
 * Mengambil dan membaca konten dari halaman web dengan chunking
 */
async function scrape_web_tool(url) {
    const startTime = Date.now();
    logger.tool('scrape_web_tool', `Scraping: ${url}`);
    
    try {
        // Normalisasi URL
        let targetUrl = url;
        if (!url.startsWith('http')) {
            targetUrl = `https://${url}`;
        }
        
        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 15000
        });
        
        const $ = cheerio.load(response.data);
        
        // Hapus elemen yang tidak perlu
        $('script, style, nav, footer, header, iframe, noscript, svg, form, button, input').remove();
        
        // Ambil teks utama
        let text = '';
        $('p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, pre, code, article, section, div.content, div.main, div.article-body').each((i, el) => {
            const line = $(el).text().trim();
            if (line.length > 30) {
                text += line + '\n\n';
            }
        });
        
        // Jika tidak ada konten yang cocok, ambil body text
        if (text.length < 100) {
            text = $('body').text().replace(/\s+/g, ' ').trim();
        }
        
        const duration = Date.now() - startTime;
        
        // Process dengan chunking jika teks panjang
        if (text.length > 1500) {
            const { chunks, contextManager, stats } = processWebContent(text, targetUrl, 1500);
            logger.tool('scrape_web_tool', `Chunked: ${stats.totalChunks} chunks, ${stats.totalChars} chars (${duration}ms)`);
            
            // Return summary + instruction untuk AI
            const summary = chunks.find(c => c.isSummary) || chunks[0];
            const conclusion = chunks.find(c => c.isConclusion) || chunks[chunks.length - 1];
            
            return `📄 **Konten dari ${targetUrl}**\n\n` +
                   `📊 Statistik: ${stats.totalChunks} chunks, ${stats.totalChars} total chars\n\n` +
                   `📝 **Ringkasan:**\n${summary.text}\n\n` +
                   `💡 **Info:** Konten telah di-chunking. AI akan mengambil bagian yang relevan berdasarkan konteks percakapan.\n\n` +
                   `🔗 **Sumber:** ${targetUrl}`;
        } else {
            // Teks pendek, tidak perlu chunking
            logger.tool('scrape_web_tool', `Success (${duration}ms, ${text.length} chars)`);
            return `📄 **Konten dari ${targetUrl}**\n\n${text}`;
        }
    } catch (error) {
        logger.error('scrape_web_tool', error, { url });
        return `❌ Gagal membaca halaman: ${error.message}`;
    }
}

/**
 * Mencari informasi di web menggunakan Google Search
 * Fallback ke DuckDuckGo jika Google gagal
 */
async function search_web_tool(query) {
    const startTime = Date.now();
    logger.tool('search_web_tool', `Searching: "${query}"`);
    
    const searchEngines = [
        {
            name: 'Google',
            url: `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=id`,
            parse: ($) => {
                let results = '';
                $('div.g').each((i, el) => {
                    if (i >= 5) return false;
                    const title = $(el).find('h3').text().trim();
                    const link = $(el).find('a').attr('href');
                    const snippet = $(el).find('.VwiC3b, .lEBKkf, span.aCOpRe').first().text().trim();
                    
                    if (title) {
                        const cleanLink = link?.startsWith('/url?q=') 
                            ? decodeURIComponent(link.split('/url?q=')[1]?.split('&')[0]) 
                            : link || '';
                        results += `📌 **${title}**\n${cleanLink}\n${snippet || ''}\n\n`;
                    }
                });
                return results;
            }
        },
        {
            name: 'DuckDuckGo',
            url: `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
            parse: ($) => {
                let results = '';
                $('.result').each((i, el) => {
                    if (i >= 5) return false;
                    const title = $(el).find('.result__title').text().trim();
                    const link = $(el).find('.result__url').text().trim();
                    const snippet = $(el).find('.result__snippet').text().trim();
                    
                    if (title) {
                        results += `📌 **${title}**\n${link}\n${snippet}\n\n`;
                    }
                });
                return results;
            }
        }
    ];
    
    // Coba Google dulu
    for (const engine of searchEngines) {
        try {
            logger.tool('search_web_tool', `Trying ${engine.name}...`);
            const response = await axios.get(engine.url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                },
                timeout: 8000
            });
            
            const $ = cheerio.load(response.data);
            let results = `🔍 **Hasil pencarian untuk: "${query}"** (via ${engine.name})\n\n`;
            const parsed = engine.parse($);
            
            if (parsed && parsed.length > 20) {
                results += parsed;
            } else {
                // Fallback parse: ambil semua link
                $('a').each((i, el) => {
                    if (i >= 10) return false;
                    const href = $(el).attr('href');
                    const text = $(el).text().trim();
                    if (href && text && href.startsWith('http') && text.length > 15) {
                        results += `• ${text}\n  ${href}\n\n`;
                    }
                });
            }
            
            const duration = Date.now() - startTime;
            logger.tool('search_web_tool', `${engine.name} success (${duration}ms)`);
            
            if (results.length < 50) {
                results += '_(Tidak ada hasil yang relevan)_';
            }
            
            return results;
        } catch (error) {
            logger.warn('search_web_tool', `${engine.name} failed: ${error.message}`);
            continue; // Coba search engine berikutnya
        }
    }
    
    // Ultimate fallback: buka Google di browser
    const fallbackUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    const command = process.platform === 'win32' ? `start "" "${fallbackUrl}"` : `open "${fallbackUrl}"`;
    exec(command);
    
    return `❌ Gagal mengambil hasil pencarian secara otomatis.\n✅ Membuka halaman hasil pencarian di browser: ${fallbackUrl}`;
}

/**
 * Mengekstrak URL dari teks perintah
 */
function extractUrl(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const match = text.match(urlRegex);
    if (!match) return null;
    
    let url = match[0];
    
    // Bersihkan karakter tidak valid di akhir URL
    // Hapus tanda kurung, kurung siku, dll yang mungkin menempel
    url = url.replace(/[)\]>]+$/, '');
    
    return url;
}

module.exports = { open_web_tool, scrape_web_tool, search_web_tool, extractUrl, KNOWN_SITES };