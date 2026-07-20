// src/tools/web_tools.js
// Universal Web Tools - Browsing, Scraping, Search
const { exec } = require('child_process');
const axios = require('axios');
const cheerio = require('cheerio');
const logger = require('../utils/logger');
const { processWebContent } = require('../engine/context_manager');

// Daftar situs populer dengan URL langsung
const KNOWN_SITES_MAP = new Map([
    ['youtube', 'https://www.youtube.com'],
    ['youtube music', 'https://music.youtube.com'],
    ['google', 'https://www.google.com'],
    ['google maps', 'https://www.google.com/maps'],
    ['maps', 'https://www.google.com/maps'],
    ['gmail', 'https://mail.google.com'],
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
    ['notion', 'https://www.notion.so'],
    ['figma', 'https://www.figma.com'],
    ['medium', 'https://medium.com'],
    ['quora', 'https://www.quora.com'],
    ['twitch', 'https://www.twitch.tv'],
    ['imdb', 'https://www.imdb.com'],
    ['cnn', 'https://www.cnn.com'],
    ['bbc', 'https://www.bbc.com'],
    ['the verge', 'https://www.theverge.com'],
    ['techcrunch', 'https://techcrunch.com'],
    ['wired', 'https://www.wired.com'],
    ['hacker news', 'https://news.ycombinator.com'],
    ['LMS Telkom University', 'https://lms.telkomuniversity.ac.id'],
    ['LMS Tel-U', 'https://lms.telkomuniversity.ac.id'],
    ['Igracias', 'https://igracias.telkomuniversity.ac.id'],
    ['zoom', 'https://zoom.us'],
]);

// Untuk backward compatibility
const KNOWN_SITES = Object.fromEntries(KNOWN_SITES_MAP);

/**
 * Validasi apakah string adalah domain atau URL yang valid
 * Mencegah AI mengarang URL dari teks biasa (seperti judul artikel)
 */
function isValidUrl(text) {
    // Jika sudah ada protocol, valid
    if (text.startsWith('http://') || text.startsWith('https://')) {
        return true;
    }
    // Regex untuk validasi domain: harus mengandung titik dan TLD yang valid
    // Contoh: google.com, scholar.google.com, youtube.com
    const domainRegex = /^([\da-z\.-]+)\.([a-z\.]{2,})(\/[^\s]*)?$/i;
    return domainRegex.test(text);
}

/**
 * Validasi tambahan: pastikan query tidak terlihat seperti judul artikel
 * (teks panjang dengan banyak spasi, bukan domain)
 */
function isArticleTitle(text) {
    const cleaned = text.replace(/^(buka|open|browse)\s+/i, '').trim();
    // Jika setelah dibersihkan masih memiliki banyak spasi (lebih dari 2 kata)
    // dan tidak mengandung titik, kemungkinan besar bukan URL
    const words = cleaned.split(/\s+/).filter(w => w.length > 0);
    if (words.length >= 3 && !cleaned.includes('.')) {
        return true;
    }
    // Jika teks panjang (>60 karakter) dan tidak seperti URL
    if (cleaned.length > 60 && !cleaned.includes('.') && !cleaned.includes('/')) {
        return true;
    }
    return false;
}

function findKnownSite(text) {
    const lowerText = text.toLowerCase();
    if (KNOWN_SITES[lowerText]) {
        return KNOWN_SITES[lowerText];
    }
    const words = lowerText.split(/\s+/).filter(w => w.length > 1);
    for (const [key, url] of KNOWN_SITES_MAP) {
        const lowerKey = key.toLowerCase();
        if (lowerKey === lowerText) return url;
        const keyWords = lowerKey.split(/\s+/);
        const match = words.every(w => keyWords.some(kw => kw.includes(w) || w.includes(kw)));
        if (match) return url;
    }
    return null;
}

/**
 * Platform-based search URL builder.
 * Jika query mengandung nama platform besar, buat URL pencarian untuk platform tersebut.
 * Contoh: "wikipedia ai" → https://id.wikipedia.org/wiki/Special:Search?search=ai
 *          "youtube tutorial react" → https://www.youtube.com/results?search_query=tutorial+react
 */
function buildPlatformSearchUrl(text) {
    const lowerText = text.toLowerCase();
    
    // Daftar platform dan pola URL pencarian mereka
    const platforms = [
        { keywords: ['wikipedia', 'wiki'], url: (q) => `https://id.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(q)}` },
        { keywords: ['youtube', 'yt'], url: (q) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}` },
        { keywords: ['google'], url: (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}` },
        { keywords: ['github'], url: (q) => `https://github.com/search?q=${encodeURIComponent(q)}` },
        { keywords: ['stackoverflow', 'stack overflow'], url: (q) => `https://stackoverflow.com/search?q=${encodeURIComponent(q)}` },
        { keywords: ['reddit'], url: (q) => `https://www.reddit.com/search/?q=${encodeURIComponent(q)}` },
        { keywords: ['twitter', 'x'], url: (q) => `https://twitter.com/search?q=${encodeURIComponent(q)}` },
        { keywords: ['instagram'], url: (q) => `https://www.instagram.com/search/?q=${encodeURIComponent(q)}` },
        { keywords: ['imdb'], url: (q) => `https://www.imdb.com/find?q=${encodeURIComponent(q)}` },
        { keywords: ['npm'], url: (q) => `https://www.npmjs.com/search?q=${encodeURIComponent(q)}` },
        { keywords: ['pypi', 'python package'], url: (q) => `https://pypi.org/search/?q=${encodeURIComponent(q)}` },
        { keywords: ['amazon', 'shop'], url: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}` },
    ];
    
    // Cari platform yang cocok
    for (const platform of platforms) {
        const hasPlatform = platform.keywords.some(k => lowerText.includes(k));
        if (hasPlatform) {
            // Ekstrak query pencarian: hapus nama platform dari teks
            let searchQuery = text;
            for (const kw of platform.keywords) {
                searchQuery = searchQuery.replace(new RegExp(kw, 'gi'), '').trim();
            }
            // Hapus kata perintah
            searchQuery = searchQuery.replace(/^(buka|open|browse|website|web|situs|halaman)\s+/i, '').trim();
            // Hapus kata hubung
            searchQuery = searchQuery.replace(/\s+(tentang|di|pada|untuk|mengenai)\s+/gi, ' ').trim();
            
            if (searchQuery) {
                return platform.url(searchQuery);
            }
        }
    }
    
    // Deteksi kampus
    const kampusWords = ['telkom', 'tel-u', 'telkomuniversity', 'polban', 'itb', 'ugm', 'ui', 'unpad', 'undip', 'univ', 'university'];
    const hasKampus = kampusWords.some(k => lowerText.includes(k));
    if (hasKampus) {
        if (lowerText.includes('telkom') || lowerText.includes('tel-u') || lowerText.includes('telkomuniversity')) {
            return 'https://lms.telkomuniversity.ac.id';
        }
        if (lowerText.includes('polban')) {
            return 'https://lms.polban.ac.id';
        }
    }
    
    return null; // Bukan platform yang dikenal
}

function normalizeUrl(input) {
    let text = input.trim().toLowerCase();
    
    // Hapus kata perintah dari awal
    text = text.replace(/^(buka|open|browse)\s+/i, '').trim();
    text = text.replace(/^(website|web|situs|halaman)\s+/i, '').trim();
    text = text.replace(/\s+di\s+browser$/i, '').trim();
    
    // Jika sudah ada protocol, return langsung
    if (text.startsWith('http://') || text.startsWith('https://')) {
        return text;
    }
    
    // Jika mengandung titik, mungkin domain langsung
    if (text.includes('.')) {
        return text.startsWith('http') ? text : `https://${text}`;
    }
    
    // Cek di KNOWN_SITES
    const knownUrl = findKnownSite(text);
    if (knownUrl) {
        return knownUrl;
    }
    
    // Jika hanya satu kata (nama situs), coba tebak dengan .com
    if (text.split(/\s+/).length === 1) {
        return `https://www.${text}.com`;
    }
    
    // Multi-word: coba buat URL pencarian platform
    const platformUrl = buildPlatformSearchUrl(text);
    if (platformUrl) {
        return platformUrl;
    }
    
    // Tidak bisa di-resolve → return null (akan ditolak oleh open_web_tool)
    return null;
}

function extractLocation(rawQuery) {
    const stopWords = /\b(buka|tolong|carikan|cari|lalu|tampilkan|lokasi|dari|di|ke|menuju|sekitar|google|maps|map)\b/gi;
    let cleanLocation = rawQuery.replace(stopWords, '').trim();
    return cleanLocation.replace(/\s+/g, ' ');
}

function open_web_tool(input) {
    logger.tool('open_web_tool', `Input: "${input}"`);
    
    try {
        // ============ CEK 1: MAP REQUEST ============
        const mapKeywords = ['maps', 'google maps', 'map', 'lokasi', 'cari di peta', 'petakan'];
        const lowerInput = input.toLowerCase();
        const isMapRequest = mapKeywords.some(k => lowerInput.includes(k)) &&
                            (lowerInput.includes('cari') || lowerInput.includes('lokasi') || 
                             lowerInput.includes('tempat') || lowerInput.includes('search') ||
                             lowerInput.includes('dari'));
        
        if (isMapRequest) {
            const location = extractLocation(input);
            if (location && location.length > 2) {
                const encodedLocation = encodeURIComponent(location);
                const mapSearchUrl = `https://www.google.com/maps/search/${encodedLocation}`;
                const command = process.platform === 'win32' ? `start "" "${mapSearchUrl}"` : `open "${mapSearchUrl}"`;
                exec(command, (error) => {
                    if (error) logger.error('open_web_tool', `exec error: ${error.message}`);
                });
                logger.tool('open_web_tool', `Map search URL: ${mapSearchUrl}`);
                return `✅ Membuka lokasi ${location} di Google Maps...`;
            }
        }
        
        // ============ CEK 2: VALIDASI ANTI-HALLUSINASI URL ============
        // Cek apakah input terlihat seperti judul artikel (bukan URL)
        if (isArticleTitle(input)) {
            const msg = `❌ Input "${input}" tidak valid sebagai URL. Ini terlihat seperti teks biasa (mungkin judul artikel), bukan URL atau nama situs. Jangan membuat URL palsu. Gunakan search_web untuk mencari halaman ini.`;
            logger.warn('open_web_tool', msg);
            return msg;
        }
        
        // ============ CEK 3: VALIDASI DOMAIN ============
        // Bersihkan input dari kata perintah
        let cleanedInput = input.replace(/^(buka|open|browse)\s+/i, '').trim();
        // Jika mengandung titik, validasi format domain
        if (cleanedInput.includes('.')) {
            if (!isValidUrl(cleanedInput)) {
                const msg = `❌ "${cleanedInput}" bukan format URL/domain yang valid. Jangan menebak URL. Gunakan search_web untuk mencari informasi.`;
                logger.warn('open_web_tool', msg);
                return msg;
            }
        }
        
        // ============ NORMAL: BUKA URL ============
        const url = normalizeUrl(input);
        
        if (url) {
            logger.tool('open_web_tool', `Normalized URL: ${url}`);
            const command = process.platform === 'win32' ? `start "" "${url}"` : `open "${url}"`;
            exec(command, (error) => {
                if (error) logger.error('open_web_tool', `exec error: ${error.message}`);
            }); 
            return `✅ Membuka ${url} di browser.`;
        } else {
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
        
        $('script, style, nav, footer, header, iframe, noscript, svg, form, button, input').remove();
        
        let text = '';
        $('p, h1, h2, h3, h4, h5, h6, li, td, th, blockquote, pre, code, article, section, div.content, div.main, div.article-body').each((i, el) => {
            const line = $(el).text().trim();
            if (line.length > 30) {
                text += line + '\n\n';
            }
        });
        
        if (text.length < 100) {
            text = $('body').text().replace(/\s+/g, ' ').trim();
        }
        
        const duration = Date.now() - startTime;
        
        if (text.length > 1500) {
            const { chunks, contextManager, stats } = processWebContent(text, targetUrl, 1500);
            logger.tool('scrape_web_tool', `Chunked: ${stats.totalChunks} chunks, ${stats.totalChars} chars (${duration}ms)`);
            
            const summary = chunks.find(c => c.isSummary) || chunks[0];
            const conclusion = chunks.find(c => c.isConclusion) || chunks[chunks.length - 1];
            
            return `📄 **Konten dari ${targetUrl}**\n\n` +
                   `📊 Statistik: ${stats.totalChunks} chunks, ${stats.totalChars} total chars\n\n` +
                   `📝 **Ringkasan:**\n${summary.text}\n\n` +
                   `💡 **Info:** Konten telah di-chunking.\n\n` +
                   `🔗 **Sumber:** ${targetUrl}`;
        } else {
            logger.tool('scrape_web_tool', `Success (${duration}ms, ${text.length} chars)`);
            return `📄 **Konten dari ${targetUrl}**\n\n${text}`;
        }
    } catch (error) {
        logger.error('scrape_web_tool', error, { url });
        return `❌ Gagal membaca halaman: ${error.message}`;
    }
}

/**
 * Mencari informasi di web menggunakan Google Search.
 * Mengembalikan hasil dalam format markdown dengan URL asli.
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
                        // Format markdown: [Judul](URL) + snippet
                        const displayUrl = cleanLink || '(tautan tidak tersedia)';
                        results += `📌 [${title}](${displayUrl})\n${displayUrl}\n${snippet || ''}\n\n`;
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
                        const displayUrl = link || '(tautan tidak tersedia)';
                        // Format markdown: [Judul](URL) + snippet
                        results += `📌 [${title}](${displayUrl})\n${displayUrl}\n${snippet}\n\n`;
                    }
                });
                return results;
            }
        }
    ];
    
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
                // Fallback: ambil semua teks yang relevan dengan link
                $('h3, h2, a, span, p, div').each((i, el) => {
                    if (i >= 20) return false;
                    const href = $(el).attr('href');
                    const text = $(el).text().trim();
                    if (text && text.length > 20) {
                        if (href && href.startsWith('http')) {
                            results += `• [${text.substring(0, 80)}](${href})\n${href}\n\n`;
                        } else if (!href) {
                            results += `${text}\n\n`;
                        }
                    }
                });
            }
            
            if (results.length < 100) {
                const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
                const sentences = bodyText.match(/[^.!?]+[.!?]+/g) || [];
                sentences.slice(0, 10).forEach(s => {
                    const trimmed = s.trim();
                    if (trimmed.length > 30) {
                        results += `${trimmed}\n\n`;
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
            continue;
        }
    }
    
    // Ultimate fallback
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
    url = url.replace(/[)\]>]+$/, '');
    
    return url;
}

module.exports = { open_web_tool, scrape_web_tool, search_web_tool, extractUrl, KNOWN_SITES };