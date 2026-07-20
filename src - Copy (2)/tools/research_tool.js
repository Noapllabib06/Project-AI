// Research Tool
const { search_web_tool, scrape_web_tool } = require('./web_tools');
const logger = require('../utils/logger');

async function research_and_summarize_tool(query) {
    const startTime = Date.now();
    logger.tool('research_and_summarize_tool', `Researching: "${query}"`);
    
    try {
        const searchResults = await search_web_tool(query);
        const urlRegex = /https?:\/\/[^\s\)]+/g;
        const urls = searchResults.match(urlRegex) || [];
        
        if (urls.length === 0) {
            return `? Tidak ditemukan hasil untuk "${query}".`;
        }
        
        const uniqueUrls = [...new Set(urls)].slice(0, 3);
        const allContent = [];
        
        for (const url of uniqueUrls) {
            try {
                const content = await scrape_web_tool(url);
                const textMatch = content.match(/\*\*Konten dari[^*]+\*\*\n\n([\s\S]+)/);
                if (textMatch && textMatch[1]) {
                    allContent.push({
                        url: url,
                        text: textMatch[1].substring(0, 2000)
                    });
                }
            } catch (error) {
                continue;
            }
        }
        
        if (allContent.length === 0) {
            return `? Gagal mengambil konten.`;
        }
        
        const combinedText = allContent
            .map((item, idx) => `[Sumber ${idx + 1}]\n${item.text}`)
            .join('\n\n---\n\n');
        
        const duration = Date.now() - startTime;
        
        return `?? Research: "${query}"\n\n` +
               `?? Sumber: ${allContent.length} website\n` +
               `? Waktu: ${duration}ms\n\n` +
               `?? Konten:\n\n${combinedText.substring(0, 3000)}\n\n` +
               `?? Berdasarkan konten di atas, berikan penjelasan yang komprehensif.`;
        
    } catch (error) {
        logger.error('research_and_summarize_tool', error);
        return `? Gagal research: ${error.message}`;
    }
}

module.exports = { research_and_summarize_tool };
