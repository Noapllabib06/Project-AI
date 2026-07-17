// src/tools/yt_tools.js
// YouTube Tools - Search, Play Music, Play Video menggunakan play-dl v1.9.7
const play = require('play-dl');
const { exec } = require('child_process');
const logger = require('../utils/logger');
const { processYouTubeContent } = require('../engine/context_manager');

/**
 * Ekstrak video ID dari URL YouTube
 */
function extractVideoId(url) {
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname === 'youtu.be') {
            return urlObj.pathname.slice(1);
        }
        return urlObj.searchParams.get('v');
    } catch {
        return null;
    }
}

/**
 * Cari di YouTube dengan retry mechanism
 * play-dl v1.9.7: play.search(query, options) mengembalikan array objek
 */
async function searchYouTube(query, limit = 1) {
    const startTime = Date.now();
    logger.tool('yt_search', `Searching: "${query}" (limit: ${limit})`);
    
    let lastError = null;
    
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            let searchQuery = query;
            
            if (attempt === 1) {
                searchQuery = query.replace(/\b(dari|by|feat|ft\.?|official|music|video|audio|lyrics|lirik)\b/gi, '').trim();
                logger.tool('yt_search', `Retry with simplified query: "${searchQuery}"`);
            }
            if (attempt === 2) {
                const words = query.split(/\s+/).filter(w => 
                    !['dari','by','feat','ft','the','a','an','di','ke','dan','yang','untuk','dengan'].includes(w.toLowerCase())
                );
                searchQuery = words.slice(0, Math.min(3, words.length)).join(' ');
                logger.tool('yt_search', `Retry with minimal query: "${searchQuery}"`);
            }
            
            const results = await play.search(searchQuery, { limit });
            
            if (results && results.length > 0) {
                const duration = Date.now() - startTime;
                logger.tool('yt_search', `Found ${results.length} results (${duration}ms)`);
                return results;
            }
        } catch (error) {
            lastError = error;
            logger.warn('yt_search', `Attempt ${attempt + 1} failed: ${error.message}`);
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    
    logger.error('yt_search', `All attempts failed`, { query, lastError: lastError?.message });
    throw lastError || new Error('Tidak dapat menemukan hasil');
}

/**
 * Mencari konten di YouTube
 */
async function yt_search_tool(query) {
    const startTime = Date.now();
    logger.tool('yt_search_tool', `Query: "${query}"`);
    
    try {
        const searchResults = await searchYouTube(query, 5);
        
        let result = `🎬 **Hasil pencarian YouTube untuk: "${query}"**\n\n`;
        searchResults.forEach((item, i) => {
            const title = item.title || item.name || 'Unknown';
            const type = item.type === 'video' ? '🎥 Video' : 
                         item.type === 'playlist' ? '📋 Playlist' : '🎵 Lagu';
            const duration = item.durationRaw || item.duration || 'N/A';
            const views = item.views ? `${(item.views / 1000).toFixed(0)}k ditonton` : '';
            const channel = item.channel?.name || item.channelName || item.artist || '';
            const itemUrl = item.url || `https://www.youtube.com/watch?v=${item.id}`;
            result += `${i + 1}. ${type}: **${title}**\n`;
            if (channel) result += `   🎤 ${channel}\n`;
            result += `   🔗 ${itemUrl}\n`;
            result += `   ⏱ ${duration} | 👁 ${views}\n\n`;
        });
        
        logger.tool('yt_search_tool', `Success (${Date.now() - startTime}ms)`);
        return result;
    } catch (error) {
        logger.error('yt_search_tool', error, { query });
        return `❌ Tidak menemukan hasil untuk "${query}" di YouTube.\n💡 Coba gunakan kata kunci yang lebih sederhana.`;
    }
}

/**
 * Mendapatkan info video dari URL YouTube dengan chunking untuk description
 * play-dl v1.9.7: play.video_info(url) → { video_details: {...} }
 */
async function getVideoInfo(url) {
    const startTime = Date.now();
    logger.tool('getVideoInfo', `URL: ${url}`);
    
    try {
        const info = await play.video_info(url);
        const details = info.video_details || info;
        
        const title = details.title || 'Unknown';
        const description = details.description || '';
        const channel = details.channel?.name || details.channelName || 'Unknown';
        
        // Process description dengan chunking jika panjang
        let processedDescription = description;
        let descriptionInfo = '';
        
        if (description.length > 1500) {
            const { chunks, stats } = processYouTubeContent(description, title, 1500);
            const summary = chunks.find(c => c.isSummary) || chunks[0];
            const conclusion = chunks.find(c => c.isConclusion) || chunks[chunks.length - 1];
            
            processedDescription = summary.text;
            descriptionInfo = `\n\n📊 Deskripsi di-chunking: ${stats.totalChunks} chunks (${stats.totalChars} chars)`;
            logger.tool('getVideoInfo', `Description chunked: ${stats.totalChunks} chunks`);
        } else if (description.length > 200) {
            processedDescription = description.substring(0, 200) + '...';
        }
        
        const result = {
            title: title,
            description: processedDescription,
            descriptionInfo: descriptionInfo,
            duration: details.durationRaw || 'N/A',
            views: details.views || 0,
            channel: channel,
            thumbnail: (details.thumbnails && details.thumbnails[0]?.url) || (details.thumbnail?.url) || '',
            url: url,
            videoId: extractVideoId(url)
        };
        
        logger.tool('getVideoInfo', `Got: "${result.title}" by ${result.channel} (${Date.now() - startTime}ms)`);
        return result;
    } catch (error) {
        logger.error('getVideoInfo', error, { url });
        return {
            title: 'Unknown',
            description: '',
            descriptionInfo: '',
            duration: 'N/A',
            views: 0,
            channel: 'Unknown',
            thumbnail: '',
            url: url,
            videoId: extractVideoId(url)
        };
    }
}

/**
 * Parse query untuk musik: ekstrak judul lagu dan artis
 * Contoh: "putar lagu misery dari nsb" → { title: "misery", artist: "nsb" }
 */
function parseMusicQuery(query) {
    let clean = query.replace(/^(putar|mainkan|play)\s+(musik|lagu|music|song)\s+/i, '')
                     .replace(/^(putar|mainkan|play)\s+(musik|lagu|music|song)$/i, '')
                     .trim();
    
    let title = clean;
    let artist = '';
    
    const separators = [' dari ', ' by ', ' feat ', ' ft. ', ' ft ', ' featuring '];
    for (const sep of separators) {
        if (clean.toLowerCase().includes(sep)) {
            const parts = clean.split(new RegExp(sep, 'i'));
            title = parts[0].trim();
            artist = parts.slice(1).join(sep).trim();
            break;
        }
    }
    
    logger.tool('parseMusicQuery', `Parsed: title="${title}", artist="${artist || '(none)'}"`);
    return { title, artist, fullQuery: artist ? `${title} ${artist}` : title };
}

/**
 * Memutar lagu dari YouTube Music
 * Strategi: search → dapatkan URL → buka di YouTube Music
 */
async function play_youtube_music(query) {
    const startTime = Date.now();
    logger.tool('play_youtube_music', `Query: "${query}"`);
    
    try {
        // Jika URL langsung
        if (query.startsWith('http')) {
            const vid = extractVideoId(query);
            if (vid) {
                const musicUrl = `https://music.youtube.com/watch?v=${vid}`;
                const info = await getVideoInfo(query);
                const command = process.platform === 'win32' ? `start "" "${musicUrl}"` : `open "${musicUrl}"`;
                exec(command);
                return `🎵 **Memutar Musik: ${info.title}**\n🎤 Artis: ${info.channel}\n⏱ Durasi: ${info.duration}\n🎧 Membuka YouTube Music...\n🔗 ${musicUrl}`;
            }
        }
        
        // Parse query
        const { title, artist, fullQuery } = parseMusicQuery(query);
        
        // Cari dengan full query
        let searchQuery = fullQuery;
        let searchResults;
        
        try {
            searchResults = await searchYouTube(searchQuery, 1);
        } catch (e) {
            logger.warn('play_youtube_music', `Full query failed, trying title only: "${title}"`);
            try {
                searchResults = await searchYouTube(title, 1);
            } catch (e2) {
                return `❌ Tidak menemukan lagu "${query}" di YouTube.\n💡 Coba dengan judul yang lebih sederhana.`;
            }
        }
        
        if (!searchResults || searchResults.length === 0) {
            return `❌ Tidak menemukan lagu "${query}" di YouTube.\n💡 Coba dengan judul yang lebih sederhana.`;
        }
        
        const bestMatch = searchResults[0];
        const videoUrl = bestMatch.url || `https://www.youtube.com/watch?v=${bestMatch.id}`;
        const vid = extractVideoId(videoUrl);
        const musicUrl = `https://music.youtube.com/watch?v=${vid}`;
        
        // Coba dapatkan info, fallback jika gagal
        let info;
        try {
            info = await getVideoInfo(videoUrl);
        } catch {
            info = { title: bestMatch.title || 'Unknown', channel: bestMatch.channel?.name || artist || 'Unknown', duration: 'N/A' };
        }
        
        const command = process.platform === 'win32' ? `start "" "${musicUrl}"` : `open "${musicUrl}"`;
        exec(command);
        
        const response = `🎵 **Memutar Musik: ${info.title}**\n🎤 Artis: ${info.channel}\n⏱ Durasi: ${info.duration}\n🎧 Membuka YouTube Music...\n🔗 ${musicUrl}`;
        
        logger.tool('play_youtube_music', `Playing: "${info.title}" (${Date.now() - startTime}ms)`);
        return response;
    } catch (error) {
        logger.error('play_youtube_music', error, { query });
        return `❌ Gagal memutar musik: ${error.message}`;
    }
}

/**
 * Memutar video dari YouTube
 */
async function play_youtube_video(query) {
    const startTime = Date.now();
    logger.tool('play_youtube_video', `Query: "${query}"`);
    
    try {
        if (query.startsWith('http')) {
            const info = await getVideoInfo(query);
            const command = process.platform === 'win32' ? `start "" "${query}"` : `open "${query}"`;
            exec(command);
            return `🎬 **Memutar Video: ${info.title}**\n🎤 Channel: ${info.channel}\n⏱ Durasi: ${info.duration}\n👁 ${(info.views / 1000).toFixed(0)}k ditonton\n📺 Membuka YouTube...\n🔗 ${query}`;
        }
        
        let searchQuery = query.replace(/^(putar|mainkan|play|tonton|nonton)\s+(video\s+)?/i, '').trim();
        
        let searchResults;
        try {
            searchResults = await searchYouTube(searchQuery, 1);
        } catch (e) {
            const simpleQuery = searchQuery.replace(/\b(video|tutorial|cara)\b/gi, '').trim();
            try {
                searchResults = await searchYouTube(simpleQuery || searchQuery, 1);
            } catch (e2) {
                return `❌ Tidak menemukan video "${query}" di YouTube.\n💡 Coba dengan judul yang lebih sederhana.`;
            }
        }
        
        if (!searchResults || searchResults.length === 0) {
            return `❌ Tidak menemukan video "${query}" di YouTube.`;
        }
        
        const bestMatch = searchResults[0];
        const videoUrl = bestMatch.url || `https://www.youtube.com/watch?v=${bestMatch.id}`;
        
        let info;
        try {
            info = await getVideoInfo(videoUrl);
        } catch {
            info = { title: bestMatch.title || 'Unknown', channel: bestMatch.channel?.name || 'Unknown', duration: 'N/A', views: 0 };
        }
        
        const command = process.platform === 'win32' ? `start "" "${videoUrl}"` : `open "${videoUrl}"`;
        exec(command);
        
        const response = `🎬 **Memutar Video: ${info.title}**\n🎤 Channel: ${info.channel}\n⏱ Durasi: ${info.duration}\n👁 ${(info.views / 1000).toFixed(0)}k ditonton\n📺 Membuka YouTube...\n🔗 ${videoUrl}`;
        
        logger.tool('play_youtube_video', `Playing: "${info.title}" (${Date.now() - startTime}ms)`);
        return response;
    } catch (error) {
        logger.error('play_youtube_video', error, { query });
        return `❌ Gagal memutar video: ${error.message}`;
    }
}

/**
 * Mendapatkan informasi streaming audio (future feature)
 */
async function getAudioStream(url) {
    try {
        const stream = await play.stream(url, { quality: 0 });
        return stream;
    } catch (error) {
        logger.error('getAudioStream', error);
        throw error;
    }
}

module.exports = { 
    yt_search_tool, 
    play_youtube_music, 
    play_youtube_video, 
    getVideoInfo, 
    getAudioStream 
};