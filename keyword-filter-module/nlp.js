/**
 * NLP Utilities for Malaysian Adult Video Search + SEO
 */
const CATEGORIES = {
    'Malay Adult': {
        keywords: ['seksi', 'bogel', 'kimak', 'm4m', 'mmf', 'ngentot', 'sundal', 'tudung', 'melayu', 'malay', 'pantat', 'pukul', 'sex', 'abg', 'adik', 'kakak', 'ibu', 'makcik', 'girlfriend', 'boyfriend', 'hotel', 'couple', 'threesome', 'orgasm', 'seduced', 'melayu-huge', 'tudung-girl', 'malay-teen'],
        subTags: ['seksi', 'malay-girl', 'hot', 'hotel', 'tudung-girl']
    },
    'Asian Hot': {
        keywords: ['thai', 'indonesia', 'indon', 'indo', 'japan', 'korea', 'china', 'asian', 'vietnam', 'jepun', 'japanese', 'korean', 'china-girl', 'japan-girl'],
        subTags: ['thai', 'indon', 'japan', 'korea']
    },
    'Amateur': {
        keywords: ['amateur', 'home', 'homemade', 'couple', 'wife', 'husband', 'sister', 'brother', 'friend', 'hidden', 'private', 'hotel', 'college', 'student'],
        subTags: ['amateur', 'home', 'hotel', 'hidden-cam']
    },
    'Roleplay': {
        keywords: ['student', 'teacher', 'nurse', 'office', 'mistress', 'fetish', 'bdsm', 'bondage', 'uniform', 'maid', 'secretary', 'cosplay'],
        subTags: ['roleplay', 'fetish', 'uniform']
    },
    'Popular': {
        keywords: ['new', 'popular', 'viral', 'trending', 'best', 'top', 'hd', '4k', 'full', 'latest', 'recommend', 'recommended'],
        subTags: ['viral', 'hd', 'recommended']
    }
};
const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'can', 'will', 'just', 'now',
    'yang', 'ini', 'itu', 'di', 'ke', 'dari', 'untuk', 'dan', 'atau', 'satu', 'dua', 'tiga', 'empat', 'lima', 'dia', 'dengan', 'juga', 'dalam', 'pada', 'ada', 'apa', 'saja', 'sudah', 'lebih', 'kurang',
    'hd', 'hq', '4k', '1080p', '720p', 'video', 'clip', 'full', 'episode', 'part', 'free', 'watch', 'online', 'stream', 'download', 'mp4', 'sub', 'subtitle'
]);

const COMMON_NGRAMS = new Set([
    'video panas', 'cerita panas', 'hot video', 'video seksi', 'sex melayu', 'tudung girl', 'malay sexy', 'pantat besar',
    'girl sex', 'hot girl', 'sexy girl', 'melayu hot', 'malay sex', 'sex video', 'hot action', 'girl action',
    'amateur sex', 'home sex', 'couple sex', 'wife sex', 'friend sex', 'sister sex', 'hidden cam',
    'thai girl', 'indo girl', 'japan girl', 'korea girl', 'asian girl', 'china girl',
    'student teacher', 'office sex', 'uniform girl', 'nurse girl', 'maid sex', 'cosplay girl',
    'viral video', 'trending video', 'popular video', 'best video', 'new video', 'hd video', '4k video'
]);

function normalizeText(text) {
    return (text || '').toLowerCase().replace(/[''`]/g, "'").replace(/[^\w\s']/g, ' ').replace(/\s+/g, ' ').trim();
}
function extractKeywords(text) {
    if (!text) return { primary: [], secondary: [], all: [] };
    const normalized = normalizeText(text);
    const words = normalized.split(' ').filter(w => w.length > 2 && !STOP_WORDS.has(w));
    const ngrams = [];
    for (let size = 2; size <= 3; size++) {
        for (let i = 0; i + size <= words.length; i++) {
            const phrase = words.slice(i, i + size).join(' ');
            if (COMMON_NGRAMS.has(phrase)) ngrams.push(phrase);
        }
    }
    const freq = {};
    for (const w of [...words, ...ngrams]) {
        freq[w] = (freq[w] || 0) + 1;
    }
    const scored = Object.entries(freq).map(([word, count]) => ({ word, score: count })).sort((a, b) => b.score - a.score || a.word.localeCompare(b.word));
    const all = scored.map(s => s.word);
    return { primary: all.slice(0, 4), secondary: all.slice(4, 9), all };
}
function categorizeVideo(videoName) {
    if (!videoName || typeof videoName !== 'string') return { category: 'Uncategorized', subTags: [], confidence: 0 };
    const normalizedName = normalizeText(videoName);
    if (!normalizedName) return { category: 'Uncategorized', subTags: [], confidence: 0 };
    
    const extracted = extractKeywords(normalizedName);
    const keywordSet = new Set(extracted.all);
    let bestMatch = { category: 'Uncategorized', subTags: [], confidence: 0 };

    for (const [categoryName, categoryData] of Object.entries(CATEGORIES)) {
        let confidence = 0;
        const matchedSubTags = new Set();
        for (const keyword of categoryData.keywords) {
            if (normalizedName.includes(keyword) || keywordSet.has(keyword)) {
                confidence += 1;
                for (const subTag of categoryData.subTags) {
                    if (keyword === subTag.replace(/-/g, ' ') || subTag.replace(/-/g, ' ') === keyword) {
                        matchedSubTags.add(subTag);
                    }
                }
            }
        }
        if (confidence > bestMatch.confidence) {
            bestMatch = { category: categoryName, subTags: [...matchedSubTags].slice(0, 3), confidence };
        }
    }

    if (bestMatch.confidence < 1 && extracted.primary.length > 0 && bestMatch.category !== 'Uncategorized') {
        bestMatch.subTags = extracted.primary.slice(0, 1).map(k => k.replace(/\s+/g, '-'));
    }

    return bestMatch;
}
function groupVideosByCategory(videos) {
    if (!Array.isArray(videos)) return {};
    const grouped = {};
    for (const video of videos) {
        if (!video) continue;
        const title = (video && (video.name || video.title || video)) || '';
        if (typeof title !== 'string') continue;
        const categorization = categorizeVideo(title);
        if (!grouped[categorization.category]) grouped[categorization.category] = [];
        grouped[categorization.category].push({ ...video, category: categorization.category, subTags: categorization.subTags, keywords: extractKeywords(title) });
    }
    return grouped;
}
function getAllTags(videos) {
    if (!Array.isArray(videos)) return { categories: [], subTags: [], keywords: [] };
    const categories = new Set();
    const subTags = new Set();
    const keywordMap = {};
    for (const video of videos) {
        if (!video) continue;
        const title = (video && (video.name || video.title || video)) || '';
        if (typeof title !== 'string') continue;
        const categorization = categorizeVideo(title);
        if (categorization.category !== 'Uncategorized') categories.add(categorization.category);
        categorization.subTags.forEach(st => subTags.add(st));
        extractKeywords(title).all.forEach(w => { keywordMap[w] = (keywordMap[w] || 0) + 1; });
    }
    return { categories: [...categories].sort(), subTags: [...subTags].sort(), keywords: Object.keys(keywordMap).sort((a, b) => keywordMap[b] - keywordMap[a]) };
}
function filterByCategory(videos, filter) {
    if (!Array.isArray(videos)) return [];
    if (!filter || filter === 'all') return videos;
    if (typeof filter !== 'string') return [];
    const nf = filter.toLowerCase().trim();
    if (!nf) return [];
    return videos.filter(v => {
        if (!v) return false;
        const title = (v && (v.name || v.title || v)) || '';
        if (typeof title !== 'string') return false;
        const c = categorizeVideo(title);
        return c.category.toLowerCase() === nf || c.subTags.some(st => st.toLowerCase().includes(nf));
    });
}
function getCategoryStats(videos) {
    const grouped = groupVideosByCategory(videos);
    let total = 0;
    for (const c of Object.values(grouped)) total += c.length;
    return { total, categories: Object.keys(grouped).length, byCategory: Object.fromEntries(Object.entries(grouped).map(([k, v]) => [k, { count: v.length, percentage: ((v.length / (total || 1)) * 100).toFixed(1) }])) };
}

function buildKeywordIndex(videos, topN = 60) {
    if (!Array.isArray(videos) || videos.length === 0) return { index: {}, topKeywords: [] };
    const validTopN = Math.max(1, Math.min(parseInt(topN) || 60, 1000));
    const freq = new Map();
    for (const video of videos) {
        if (!video) continue;
        const title = (video && (video.name || video.title || video)) || '';
        if (typeof title !== 'string' || !title.trim()) continue;
        const extracted = extractKeywords(title).all;
        for (const token of extracted) {
            freq.set(token, (freq.get(token) || 0) + 1);
        }
    }
    const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return { index: Object.fromEntries(sorted), topKeywords: sorted.slice(0, validTopN).map(x => ({ keyword: x[0], count: x[1] })) };
}
module.exports = { extractKeywords, categorizeVideo, buildKeywordIndex, groupVideosByCategory, getAllTags, filterByCategory, getCategoryStats, CATEGORIES };
