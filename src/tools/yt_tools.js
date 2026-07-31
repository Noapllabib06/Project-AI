/**
 * src/tools/yt_tools.js
 * YouTube Tools - Search, Play Music, Play Video
 * Format: Registry Pattern — export array of tool objects
 */
const { exec } = require('child_process');
const play = require('play-dl');
const logger = require('../utils/logger');

// ===================== INTERNAL HELPERS =====================

function extractVideoId(url) {
    if (!url) return null;
    const patterns = [
        /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
        /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
        /(?:https?:\/\/)?(?:www\.)?music\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }
    return null;
}

async function searchYouTube(query, limit = 5) {
    try {
        const searchResult = await play.search(query, { limit });
        return searchResult;
    } catch (error) {
        logger.error('ytSearch', `Search error: ${error.message}`);
        throw error;
    }
}

function parseMusicQuery(query) {
    let cleanQuery = query;
    const prefixes = ['putar lagu', 'putar musik', 'mainkan lagu', 'mainkan musik', 'play music', 'play song', 'putarkan lagu', 'putarkan musik'];
    for (const prefix of prefixes) {
        if (cleanQuery.toLowerCase().startsWith(prefix)) {
            cleanQuery = cleanQuery.substring(prefix.length).trim();
            break;
        }
    }
    cleanQuery = cleanQuery.replace(/^"|"$/g, '').trim();
    let songTitle = cleanQuery;
    let artist = '';
    const separators = [' dari ', ' by ', ' - ', ' — '];
    for (const sep of separators) {
        const idx = cleanQuery.toLowerCase().indexOf(sep);
        if (idx > 0) {
            songTitle = cleanQuery.substring(0, idx).trim();
            artist = cleanQuery.substring(idx + sep.length).trim();
            break;
        }
    }
    return { songTitle, artist, fullQuery: cleanQuery };
}

// ===================== EXPORTED TOOL LOGIC =====================

async function yt_search_tool(query) {
    logger.tool('yt_search_tool', `Searching YouTube: "${query}"`);
    try {
        const searchResult = await searchYouTube(query, 5);
        if (!searchResult || searchResult.length === 0) {
            return "Maaf, tidak ada hasil yang ditemukan di YouTube.";
        }
        let result = `🔍 **Hasil Pencarian YouTube untuk: "${query}"**\n\n`;
        searchResult.forEach((item, index) => {
            result += `${index + 1}. **${item.title}**\n`;
            result += `   👤 ${item.channel?.name || 'Unknown'}\n`;
            result += `   ⏱️ ${item.durationRaw || 'N/A'} | 👁️ ${item.views || 'N/A'}\n`;
            result += `   🔗 https://www.youtube.com/watch?v=${item.id}\n\n`;
        });
        return result;
    } catch (error) {
        logger.error('yt_search_tool', error);
        return `❌ Gagal mencari di YouTube: ${error.message}`;
    }
}

async function play_youtube_music(query) {
    logger.tool('play_youtube_music', `Playing: "${query}"`);
    try {
        const parsed = parseMusicQuery(query);
        let url;
        const videoId = extractVideoId(query);
        if (videoId) {
            url = `https://music.youtube.com/watch?v=${videoId}`;
        } else {
            const searchResult = await searchYouTube(parsed.fullQuery, 1);
            if (!searchResult || searchResult.length === 0) {
                return `❌ Tidak dapat menemukan lagu "${query}" di YouTube.`;
            }
            const bestMatch = searchResult[0];
            url = `https://music.youtube.com/watch?v=${bestMatch.id}`;
        }
        const command = process.platform === 'win32' ? `start "" "${url}"` : `open "${url}"`;
        exec(command, (error) => { if (error) logger.error('play_music', `exec error: ${error.message}`); });
        return `🎵 **Memutar Musik**\n🎶 Lagu: ${parsed.songTitle}\n🎤 Artis: ${parsed.artist || '—'}\n🔗 ${url}`;
    } catch (error) {
        logger.error('play_youtube_music', error);
        return `❌ Gagal memutar musik: ${error.message}`;
    }
}

async function play_youtube_video(query) {
    logger.tool('play_youtube_video', `Playing video: "${query}"`);
    try {
        let url;
        const videoId = extractVideoId(query);
        if (videoId) {
            url = `https://www.youtube.com/watch?v=${videoId}`;
        } else {
            const searchResult = await searchYouTube(query, 1);
            if (!searchResult || searchResult.length === 0) {
                return `❌ Tidak dapat menemukan video "${query}" di YouTube.`;
            }
            const bestMatch = searchResult[0];
            url = `https://www.youtube.com/watch?v=${bestMatch.id}`;
        }
        const command = process.platform === 'win32' ? `start "" "${url}"` : `open "${url}"`;
        exec(command, (error) => { if (error) logger.error('play_video', `exec error: ${error.message}`); });
        return `🎬 **Memutar Video**\n🔗 ${url}\n✅ Video akan dibuka di browser.`;
    } catch (error) {
        logger.error('play_youtube_video', error);
        return `❌ Gagal memutar video: ${error.message}`;
    }
}

async function getVideoInfo(url) {
    logger.tool('getVideoInfo', `Getting info: "${url}"`);
    try {
        const videoId = extractVideoId(url);
        if (!videoId) throw new Error('URL YouTube tidak valid');
        const info = await play.video_info(`https://www.youtube.com/watch?v=${videoId}`);
        const videoDetails = info.video_details;
        return {
            title: videoDetails.title || 'Unknown',
            description: videoDetails.description || 'No description',
            descriptionInfo: videoDetails.description?.substring(0, 200) || '',
            duration: videoDetails.durationRaw || 'N/A',
            views: videoDetails.views || 0,
            channel: videoDetails.channel?.name || 'Unknown',
            thumbnail: videoDetails.thumbnail?.url || '',
            url: `https://www.youtube.com/watch?v=${videoId}`,
            videoId: videoId
        };
    } catch (error) {
        logger.error('getVideoInfo', error);
        throw error;
    }
}

async function getAudioStream(url) {
    logger.tool('getAudioStream', `Getting audio stream: "${url}"`);
    try {
        const stream = await play.stream(url, { quality: 0 });
        return stream;
    } catch (error) {
        logger.error('getAudioStream', error);
        throw error;
    }
}

// ===================== REGISTRY TOOLS =====================

const ytTools = [
    {
        name: "search_youtube",
        description: "Mencari konten video/musik di YouTube dan mengembalikan 5 hasil teratas dengan judul, channel, durasi, dan link.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Kata kunci pencarian di YouTube. Contoh: 'tutorial react js', 'podcast AI', 'lagu indonesia'."
                }
            },
            required: ["query"]
        },
        execute: async (args) => {
            const result = await yt_search_tool(args.query || '');
            return { success: true, data: result };
        }
    },
    {
        name: "play_music",
        description: "Memutar lagu/musik dari YouTube Music di browser. Cari judul lagu dan artis, lalu buka di music.youtube.com.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Judul lagu atau URL YouTube. Contoh: 'bohemian rhapsody queen', 'https://youtu.be/abc123'."
                }
            },
            required: ["query"]
        },
        execute: async (args) => {
            const result = await play_youtube_music(args.query || '');
            return { success: true, data: result };
        }
    },
    {
        name: "play_video",
        description: "Memutar video dari YouTube di browser. Cari judul video atau gunakan URL langsung.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Judul video atau URL YouTube. Contoh: 'tutorial react js', 'https://youtu.be/abc123'."
                }
            },
            required: ["query"]
        },
        execute: async (args) => {
            const result = await play_youtube_video(args.query || '');
            return { success: true, data: result };
        }
    }
];

// Backward compatibility untuk code lama
ytTools.yt_search_tool = yt_search_tool;
ytTools.play_youtube_music = play_youtube_music;
ytTools.play_youtube_video = play_youtube_video;
ytTools.getVideoInfo = getVideoInfo;
ytTools.getAudioStream = getAudioStream;

module.exports = ytTools;