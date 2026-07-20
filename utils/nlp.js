/**
 * NLP Utilities for xMelayu Video Search & Filtering
 * Extended with comprehensive filter types for adult content
 */

const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'can', 'will', 'just', 'now', 'also', 'been', 'being', 'have', 'has', 'had', 'does', 'did', 'doing', 'would', 'should', 'could', 'may', 'might', 'must', 'shall',
    'yang', 'ini', 'itu', 'di', 'ke', 'dari', 'untuk', 'dan', 'atau', 'satu', 'dua', 'tiga', 'empat', 'lima', 'dia', 'dengan', 'juga', 'dalam', 'pada', 'ada', 'apa', 'saja', 'sudah', 'lebih', 'kurang', 'tak', 'tidak', 'ke', 'siapa', 'mana',
    'video', 'clip', 'episode', 'part', 'free', 'watch', 'online', 'stream', 'download', 'sub', 'subtitle', ' completos', ' completo'
]);

// Duration patterns
const DURATION_PATTERNS = {
    'short': {
        keywords: ['short', 'quick', 'teaser', 'preview', 'compilation', 'compil', 'best moments', 'highlights', 'scene'],
        patterns: [/\b(\d+)\s*(min|minute|menit)\b/i, /\b(\d+)m\b/i],
        maxSeconds: 300
    },
    'medium': {
        keywords: ['full video', 'complete', 'uncut', 'extended', 'long'],
        patterns: [/\b(\d+)-(\d+)\s*(min|minute|menit)\b/i],
        minSeconds: 300,
        maxSeconds: 1200
    },
    'long': {
        keywords: ['marathon', 'extended', 'full length', 'complete', 'hour', 'jam', ' lengthy', 'epic'],
        patterns: [/\b(\d+)\s*(hour|jam)\b/i, /\b(\d{2}):(\d{2}):(\d{2})\b/i],
        minSeconds: 1200
    }
};

// Quality patterns
const QUALITY_PATTERNS = {
    '4k': {
        keywords: ['4k', 'uhd', '2160p', 'ultra hd', 'ultra-high'],
        weight: 5
    },
    'hd': {
        keywords: ['hd', 'hq', '1080p', '1080', 'high definition', 'full hd', 'fhd'],
        weight: 4
    },
    'sd': {
        keywords: ['720p', '720', '480p', '480', '360p', '360', 'sd', 'low quality'],
        weight: 2
    }
};

// Ethnicity/Region patterns
const REGION_PATTERNS = {
    'Malay': {
        keywords: ['malay', 'melayu', 'malaysian', 'msia', 'bumi', 'bumiputera', 'sabah', 'sarawak', 'kl', 'kuala lumpur', 'johor', 'kedah', 'kelantan', 'terengganu', 'penang', 'perak'],
        flags: ['🇲🇾']
    },
    'Thai': {
        keywords: ['thai', 'thailand', 'bangkok', 'phuket', 'pattaya', 'thai girl', 'thai lady', 'thai woman', 'miami thai'],
        flags: ['🇹🇭']
    },
    'Indonesian': {
        keywords: ['indonesian', 'indo', 'indon', 'indonesia', 'jakarta', 'bali', 'surabaya', 'bandung', 'makassar', 'semarang', 'medan', 'yogyakarta', 'bogor', 'depok', 'tangerang', 'bekasi'],
        flags: ['🇮🇩']
    },
    'Japanese': {
        keywords: ['japanese', 'japan', 'jap', 'tokyo', 'osaka', 'nagoya', 'yokohama', 'kyoto', 'hokkaido', 'fukuoka', 'hiroshima', 'sendai', 'sapporo', 'nippon'],
        flags: ['🇯🇵']
    },
    'Korean': {
        keywords: ['korean', 'korea', 'seoul', 'busan', 'incheon', 'daegu', 'daejeon', 'gwangju', 'suwon', 'changwon'],
        flags: ['🇰🇷']
    },
    'Chinese': {
        keywords: ['chinese', 'china', 'cina', 'beijing', 'shanghai', 'shenzhen', 'guangzhou', 'hong kong', 'taiwan', 'taipei'],
        flags: ['🇨🇳']
    },
    'Vietnamese': {
        keywords: ['vietnam', 'vietnamese', 'hanoi', 'ho chi minh', 'saigon', 'danang', 'viet', 'vina'],
        flags: ['🇻🇳']
    },
    'Filipino': {
        keywords: ['filipino', 'philippines', 'philippine', 'pinoy', 'manila', 'cebu', 'davao', 'quezon'],
        flags: ['🇵🇭']
    },
    'Singaporean': {
        keywords: ['singapore', 'singaporean', 'sgp', 'sgd', 'sentosa', 'orchard'],
        flags: ['🇸🇬']
    },
    'Myanmar': {
        keywords: ['myanmar', 'burmese', 'burma', 'yangon', 'mandalay', 'naypyidaw'],
        flags: ['🇲🇲']
    },
    'Cambodian': {
        keywords: ['cambodia', 'cambodian', 'khmer', 'phnom penh', 'siem reap'],
        flags: ['🇰🇭']
    }
};

// Content type patterns
const CONTENT_TYPE_PATTERNS = {
    'Amateur': {
        keywords: ['amateur', 'amateur homemade', 'homemade', 'home video', 'home-made', 'real couple', 'real people', 'real amateur', 'not professional', 'leaked', 'real'],
        icon: '📹'
    },
    'Professional': {
        keywords: ['professional', 'studio', 'production', 'pov', 'bts', 'behind the scenes'],
        icon: '🎬'
    },
    'Reality': {
        keywords: ['reality', 'real life', 'real story', 'caught', 'hidden cam', 'hidden camera', 'spy cam', 'voyeur', 'secret camera'],
        icon: '📹'
    },
    'Cosplay': {
        keywords: ['cosplay', 'costume', 'anime', 'manga', 'hentai', 'fantasy costume', 'character play'],
        icon: '🎭'
    }
};

// Action/Scenario patterns
const ACTION_PATTERNS = {
    'Solo': {
        keywords: ['solo', 'masturbat', 'selfie', 'self shot', 'alone', 'solo video', 'tribbing'],
        icon: '🔴'
    },
    'Couple': {
        keywords: ['couple', 'boyfriend', 'girlfriend', 'husband wife', 'married', 'bf gf', 'mood', 'romantic', 'together'],
        icon: '💑'
    },
    'Group': {
        keywords: ['group', 'threesome', '4some', '5some', 'gangbang', 'orgy', 'multiple', 'mff', 'mmf', 'ffm', 'fff', 'mmmf', 'double penetration', 'dp'],
        icon: '👥'
    },
    'Teen': {
        keywords: ['teen', 'young', 'barely legal', '18yo', '19yo', '18-19', 'teenie', 'young adult'],
        ageRange: [18, 21],
        icon: '🌸'
    },
    'MILF': {
        keywords: ['milf', 'mature', 'housewife', 'mom', 'mother', 'cougar', 'mature woman', '30s', '40s', '50s', 'housewife', 'bbw', 'chubby', 'curvy', 'thick'],
        ageRange: [30, 60],
        icon: '🔥'
    },
    'POV': {
        keywords: ['pov', 'point of view', 'first person', ' POV '],
        icon: '👁️'
    }
};

// Fetish patterns
const FETISH_PATTERNS = {
    'Uniform': {
        keywords: ['uniform', 'nurse', 'maid', 'teacher', 'police', 'cop', 'military', 'army', 'student', 'schoolgirl', 'office lady', 'suit', 'waitress', 'flight attendant', 'stewardess'],
        icon: '👔'
    },
    'Bondage': {
        keywords: ['bondage', 'bdsm', 'tie', 'bound', 'restrained', 'handcuff', 'chains', 'rope', 'shibari', 'gagged'],
        icon: '⛓️'
    },
    'feet': {
        keywords: ['foot fetish', 'feet', 'footjob', 'toe', 'socks', 'stocking', 'pantyhose', 'nylon'],
        icon: '🦶'
    },
    'latex': {
        keywords: ['latex', 'rubber', 'pvc', 'leather', 'latex suit', 'rubber suit'],
        icon: '🖤'
    },
    'public': {
        keywords: ['public', 'outdoor', 'outdoors', 'outside', 'beach', 'park', 'car', ' restroom', 'toilet', 'gym', 'store', 'mall', 'street'],
        icon: '🌳'
    },
    'interracial': {
        keywords: ['interracial', 'ir', 'mixed race', 'different race', 'mixed', 'race play'],
        icon: '🌍'
    }
};

// Clothing/Appearance patterns
const APPEARANCE_PATTERNS = {
    'naked': {
        keywords: ['naked', 'nude', '全裸', 'bogel', 'clothed', 'topless', 'bottomless', 'striptease', 'strip'],
        icon: '💫'
    },
    'lingerie': {
        keywords: ['lingerie', 'bra', 'panties', 'underwear', 'intimates', 'nightwear', 'pajama', ' babydoll'],
        icon: '👙'
    },
    'swimsuit': {
        keywords: ['swimsuit', 'bikini', 'swimsuit', 'swimwear', 'beach wear', 'pool'],
        icon: '👙'
    },
    'hijab': {
        keywords: ['hijab', 'tudung', 'muslimah', 'muslim', 'chelek', 'pelekat', 'scarf', 'Islamic', 'moslem'],
        icon: '🧕'
    }
};

// Star rating patterns
const RATING_PATTERNS = {
    'hard': {
        keywords: ['hardcore', 'hard core', 'hard'],
        level: 3
    },
    'soft': {
        keywords: ['softcore', 'soft core', 'soft', 'erotic', 'sensual', 'romantic'],
        level: 1
    }
};

// Common ngrams for phrase detection
const COMMON_NGRAMS = new Set([
    // Malay phrases
    'video sex melayu', 'malay sex video', 'tudung girl melayu', 'bogel malay', 'kimak sex', 'ngentot melayu',
    'sex tudung', 'melayu bogel', 'pantat besar', 'abg melayu', 'pergh sex', 'bini orang',
    // Asian phrases
    'thai girl video', 'indo girl sex', 'japan girl video', 'korean girl video', 'vietnamese girl',
    'asian sex video', 'bangkok thai girl', 'jakarta indo girl',
    // Action phrases
    'couple sex video', 'amateur couple', 'home made video', 'real couple sex', 'wife sex video',
    'threesome video', 'group sex video', 'gangbang video',
    // Quality phrases
    'hd video', '4k video', '1080p video', 'hd quality', 'full video',
    // Duration phrases
    'short video', 'full video', 'long video', 'complete video',
    // Appearance phrases
    'teen video', 'young girl', 'milf video', 'mature woman',
    'nurse video', 'maid video', 'cosplay video',
    // Fetish phrases
    'bdsm video', 'bondage video', 'uniform video', 'public sex'
]);

// Category definitions with priority
const CATEGORIES = {
    'Malay Adult': {
        priority: 1,
        keywords: ['malay', 'melayu', 'malaysian', 'bogel', 'kimak', 'ngentot', 'sundal', 'pantat', 'pergh', 'bini', 'abg', 'makcik', 'sundal', 'buaya', 'l acik'],
        subTags: ['malay', 'seksi', 'tudung', 'hotel', 'couple']
    },
    'Thai': {
        priority: 2,
        keywords: ['thai', 'thailand', 'bangkok', 'pataya', 'phuket'],
        subTags: ['thai', 'lady', 'beautiful']
    },
    'Indonesian': {
        priority: 3,
        keywords: ['indo', 'indon', 'indonesia', 'indonesian', 'jakarta', 'bali'],
        subTags: ['indo', 'indon', 'sexy']
    },
    'Japanese': {
        priority: 4,
        keywords: ['japan', 'japanese', 'jap', 'tokyo', 'nippon'],
        subTags: ['japan', 'jap', 'cute']
    },
    'Korean': {
        priority: 5,
        keywords: ['korea', 'korean', 'seoul'],
        subTags: ['korean', 'kpop']
    },
    'Chinese': {
        priority: 6,
        keywords: ['china', 'chinese', 'cina', 'hong kong'],
        subTags: ['chinese', 'asia']
    },
    'Vietnamese': {
        priority: 7,
        keywords: ['vietnam', 'viet', 'vietnamese'],
        subTags: ['vietnam', 'asia']
    },
    'Filipino': {
        priority: 8,
        keywords: ['filipino', 'philippine', 'pinoy', 'manila'],
        subTags: ['filipino', 'asia']
    },
    'Amateur': {
        priority: 9,
        keywords: ['amateur', 'homemade', 'home video', 'real', 'leaked', 'not professional'],
        subTags: ['amateur', 'real', 'homemade']
    },
    'Professional': {
        priority: 10,
        keywords: ['professional', 'studio', 'production'],
        subTags: ['professional', 'hd', 'production']
    },
    'Teen': {
        priority: 11,
        keywords: ['teen', 'young', '18yo', '19yo', 'barely legal', 'teenie'],
        subTags: ['teen', 'young', 'cute']
    },
    'MILF': {
        priority: 12,
        keywords: ['milf', 'mature', 'housewife', 'mom', 'mother', 'bbw', 'chubby', 'curvy', 'thick'],
        subTags: ['milf', 'mature', 'bbw', 'thick']
    },
    'Couple': {
        priority: 13,
        keywords: ['couple', 'boyfriend', 'girlfriend', 'husband', 'wife', 'married', 'romantic'],
        subTags: ['couple', 'romantic', 'together']
    },
    'Group': {
        priority: 14,
        keywords: ['threesome', '4some', 'gangbang', 'orgy', 'group', 'multiple', 'dp', 'double penetration'],
        subTags: ['group', 'multiple', 'threesome']
    },
    'Uniform': {
        priority: 15,
        keywords: ['nurse', 'maid', 'teacher', 'police', 'student', 'office lady', 'suit'],
        subTags: ['uniform', 'roleplay', 'costume']
    },
    'Cosplay': {
        priority: 16,
        keywords: ['cosplay', 'costume', 'anime', 'manga', 'hentai', 'fantasy'],
        subTags: ['cosplay', 'anime', 'costume']
    },
    'POV': {
        priority: 17,
        keywords: ['pov', 'point of view', 'first person'],
        subTags: ['pov', 'first-person']
    },
    'Reality': {
        priority: 18,
        keywords: ['reality', 'real life', 'hidden cam', 'voyeur', 'spy cam', 'caught'],
        subTags: ['reality', 'voyeur', 'hidden']
    },
    'Bondage': {
        priority: 19,
        keywords: ['bondage', 'bdsm', 'bound', 'restrained', 'shibari'],
        subTags: ['bondage', 'bdsm', 'kinky']
    },
    'Public': {
        priority: 20,
        keywords: ['public', 'outdoor', 'outside', 'beach', 'car', 'gym'],
        subTags: ['public', 'outdoor', 'adventurous']
    },
    'Interracial': {
        priority: 21,
        keywords: ['interracial', 'ir', 'mixed race'],
        subTags: ['interracial', 'mixed', 'diversity']
    },
    'Hijab': {
        priority: 22,
        keywords: ['hijab', 'tudung', 'muslimah', 'muslim', 'Islamic', 'chelek'],
        subTags: ['hijab', 'muslim', 'tudung']
    },
    'Asian': {
        priority: 23,
        keywords: ['asian', 'asia', 'oriental'],
        subTags: ['asian', 'exotic']
    }
};

function normalizeText(text) {
    return (text || '').toLowerCase()
        .replace(/[''`]/g, "'")
        .replace(/[^\w\s'-]/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/[_-]+/g, ' ')
        .trim();
}

function extractKeywords(text) {
    if (!text) return { primary: [], secondary: [], all: [] };
    const normalized = normalizeText(text);
    const words = normalized.split(' ').filter(w => w.length > 2 && !STOP_WORDS.has(w));
    
    // Extract ngrams
    const ngrams = [];
    for (let size = 2; size <= 4; size++) {
        for (let i = 0; i + size <= words.length; i++) {
            const phrase = words.slice(i, i + size).join(' ');
            if (COMMON_NGRAMS.has(phrase)) {
                ngrams.push(phrase);
            }
        }
    }
    
    // Frequency analysis
    const freq = {};
    for (const w of [...words, ...ngrams]) {
        if (w.length > 2) {
            freq[w] = (freq[w] || 0) + 1;
        }
    }
    
    const scored = Object.entries(freq)
        .map(([word, count]) => ({ word, score: count }))
        .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word));
    
    const all = scored.map(s => s.word);
    return { 
        primary: all.slice(0, 5), 
        secondary: all.slice(5, 12), 
        all,
        ngrams
    };
}

function detectQuality(text) {
    const normalized = normalizeText(text);
    let best = { quality: 'unknown', confidence: 0 };
    
    for (const [quality, data] of Object.entries(QUALITY_PATTERNS)) {
        for (const keyword of data.keywords) {
            if (normalized.includes(keyword)) {
                if (data.weight > best.confidence) {
                    best = { quality, confidence: data.weight, keyword };
                }
            }
        }
    }
    return best;
}

function detectDuration(text, videoSeconds = null) {
    const normalized = normalizeText(text);
    let duration = 'medium';
    
    // Check for explicit duration keywords
    if (/short|quick|teaser|preview|compil|highlights/.test(normalized)) {
        duration = 'short';
    } else if (/marathon|full length|extended|long hour|lengthy/.test(normalized)) {
        duration = 'long';
    } else if (/full video|complete|uncut/.test(normalized)) {
        duration = 'medium';
    }
    
    // Check for time patterns
    const timeMatch = normalized.match(/(\d+)\s*(min|minute|menit|jam|hour)/i);
    if (timeMatch) {
        const value = parseInt(timeMatch[1]);
        const unit = timeMatch[2].toLowerCase();
        if (unit.includes('jam') || unit.includes('hour')) {
            duration = 'long';
        } else if (value <= 5) {
            duration = 'short';
        } else if (value >= 30) {
            duration = 'long';
        }
    }
    
    return { duration, confidence: 1 };
}

function detectRegion(text) {
    const normalized = normalizeText(text);
    let regions = [];
    let confidence = 0;
    
    for (const [region, data] of Object.entries(REGION_PATTERNS)) {
        for (const keyword of data.keywords) {
            if (normalized.includes(keyword)) {
                regions.push(region);
                confidence = Math.max(confidence, 1);
                break;
            }
        }
    }
    
    return { regions: [...new Set(regions)], confidence };
}

function detectContentType(text) {
    const normalized = normalizeText(text);
    let types = [];
    
    for (const [type, data] of Object.entries(CONTENT_TYPE_PATTERNS)) {
        for (const keyword of data.keywords) {
            if (normalized.includes(keyword)) {
                types.push(type);
                break;
            }
        }
    }
    
    return { types: [...new Set(types)] };
}

function detectActions(text) {
    const normalized = normalizeText(text);
    let actions = [];
    
    for (const [action, data] of Object.entries(ACTION_PATTERNS)) {
        for (const keyword of data.keywords) {
            if (normalized.includes(keyword)) {
                actions.push(action);
                break;
            }
        }
    }
    
    return { actions: [...new Set(actions)] };
}

function detectFetishes(text) {
    const normalized = normalizeText(text);
    let fetishes = [];
    
    for (const [fetish, data] of Object.entries(FETISH_PATTERNS)) {
        for (const keyword of data.keywords) {
            if (normalized.includes(keyword)) {
                fetishes.push(fetish);
                break;
            }
        }
    }
    
    return { fetishes: [...new Set(fetishes)] };
}

function detectAppearance(text) {
    const normalized = normalizeText(text);
    let appearances = [];
    
    for (const [appearance, data] of Object.entries(APPEARANCE_PATTERNS)) {
        for (const keyword of data.keywords) {
            if (normalized.includes(keyword)) {
                appearances.push(appearance);
                break;
            }
        }
    }
    
    return { appearances: [...new Set(appearances)] };
}

function categorizeVideo(videoName) {
    if (!videoName || typeof videoName !== 'string') {
        return { 
            category: 'Uncategorized', 
            subTags: [], 
            confidence: 0,
            filters: {}
        };
    }
    
    const normalizedName = normalizeText(videoName);
    if (!normalizedName) {
        return { 
            category: 'Uncategorized', 
            subTags: [], 
            confidence: 0,
            filters: {}
        };
    }
    
    const extracted = extractKeywords(normalizedName);
    const keywordSet = new Set(extracted.all);
    const keywordSetWithNgrams = new Set([...extracted.all, ...extracted.ngrams]);
    
    // Find best matching category
    let bestMatch = { category: 'Uncategorized', subTags: [], confidence: 0, priority: 999 };
    
    for (const [categoryName, categoryData] of Object.entries(CATEGORIES)) {
        let confidence = 0;
        const matchedSubTags = new Set();
        
        for (const keyword of categoryData.keywords) {
            if (normalizedName.includes(keyword) || keywordSetWithNgrams.has(keyword)) {
                confidence += 2;
                matchedSubTags.add(keyword);
            }
        }
        
        // Boost confidence for higher priority (lower number = higher priority)
        if (confidence > 0) {
            confidence += (100 - categoryData.priority) / 100;
        }
        
        if (confidence > bestMatch.confidence || 
            (confidence === bestMatch.confidence && categoryData.priority < bestMatch.priority)) {
            bestMatch = { 
                category: categoryName, 
                subTags: [...matchedSubTags].slice(0, 4),
                confidence,
                priority: categoryData.priority
            };
        }
    }
    
    // Collect all filters
    const filters = {
        quality: detectQuality(normalizedName),
        duration: detectDuration(normalizedName),
        regions: detectRegion(normalizedName),
        contentTypes: detectContentType(normalizedName),
        actions: detectActions(normalizedName),
        fetishes: detectFetishes(normalizedName),
        appearances: detectAppearance(normalizedName)
    };
    
    // Merge all filter tags
    const allFilters = [
        ...filters.regions.regions,
        ...filters.contentTypes.types,
        ...filters.actions.actions,
        ...filters.fetishes.fetishes,
        ...filters.appearances.appearances,
        filters.quality.quality !== 'unknown' ? filters.quality.quality : null,
        filters.duration.duration
    ].filter(Boolean);
    
    return {
        category: bestMatch.category,
        subTags: [...new Set([...bestMatch.subTags, ...allFilters.slice(0, 8)])],
        confidence: bestMatch.confidence,
        filters
    };
}

function getAllTags(videos) {
    if (!Array.isArray(videos)) return { categories: [], subTags: [], keywords: [], filters: {} };
    
    const categories = new Set();
    const subTags = new Set();
    const keywordMap = {};
    const filterCounts = {
        quality: {},
        duration: {},
        regions: {},
        contentTypes: {},
        actions: {},
        fetishes: {},
        appearances: {}
    };
    
    for (const video of videos) {
        if (!video) continue;
        const title = (video && (video.name || video.title || video)) || '';
        if (typeof title !== 'string') continue;
        
        const categorization = categorizeVideo(title);
        
        if (categorization.category !== 'Uncategorized') {
            categories.add(categorization.category);
        }
        
        categorization.subTags.forEach(st => subTags.add(st));
        
        // Count filter frequencies
        const f = categorization.filters;
        if (f.quality.quality !== 'unknown') {
            filterCounts.quality[f.quality.quality] = (filterCounts.quality[f.quality.quality] || 0) + 1;
        }
        filterCounts.duration[f.duration.duration] = (filterCounts.duration[f.duration.duration] || 0) + 1;
        
        f.regions.regions.forEach(r => {
            filterCounts.regions[r] = (filterCounts.regions[r] || 0) + 1;
        });
        
        f.contentTypes.types.forEach(t => {
            filterCounts.contentTypes[t] = (filterCounts.contentTypes[t] || 0) + 1;
        });
        
        f.actions.actions.forEach(a => {
            filterCounts.actions[a] = (filterCounts.actions[a] || 0) + 1;
        });
        
        f.fetishes.fetishes.forEach(fetish => {
            filterCounts.fetishes[fetish] = (filterCounts.fetishes[fetish] || 0) + 1;
        });
        
        f.appearances.appearances.forEach(a => {
            filterCounts.appearances[a] = (filterCounts.appearances[a] || 0) + 1;
        });
        
        // Keywords
        extractKeywords(title).all.forEach(w => {
            keywordMap[w] = (keywordMap[w] || 0) + 1;
        });
    }
    
    // Convert filter counts to sorted arrays
    const sortedFilters = {};
    for (const [filterType, counts] of Object.entries(filterCounts)) {
        sortedFilters[filterType] = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([name, count]) => ({ name, count }));
    }
    
    return { 
        categories: [...categories].sort(), 
        subTags: [...subTags].sort(),
        keywords: Object.keys(keywordMap).sort((a, b) => keywordMap[b] - keywordMap[a]),
        filters: sortedFilters
    };
}

function filterVideos(videos, filterOptions = {}) {
    if (!Array.isArray(videos)) return [];
    if (!filterOptions || Object.keys(filterOptions).length === 0) return videos;
    
    return videos.filter(video => {
        if (!video) return false;
        const title = (video && (video.name || video.title || video)) || '';
        if (typeof title !== 'string') return false;
        
        const c = categorizeVideo(title);
        
        // Category filter
        if (filterOptions.category && filterOptions.category !== 'all') {
            if (c.category.toLowerCase() !== filterOptions.category.toLowerCase()) {
                return false;
            }
        }
        
        // Region filter
        if (filterOptions.region) {
            if (!c.filters.regions.regions.includes(filterOptions.region)) {
                return false;
            }
        }
        
        // Quality filter
        if (filterOptions.quality) {
            if (c.filters.quality.quality !== filterOptions.quality) {
                return false;
            }
        }
        
        // Duration filter
        if (filterOptions.duration) {
            if (c.filters.duration.duration !== filterOptions.duration) {
                return false;
            }
        }
        
        // Content type filter
        if (filterOptions.contentType) {
            if (!c.filters.contentTypes.types.includes(filterOptions.contentType)) {
                return false;
            }
        }
        
        // Action filter
        if (filterOptions.action) {
            if (!c.filters.actions.actions.includes(filterOptions.action)) {
                return false;
            }
        }
        
        // Fetish filter
        if (filterOptions.fetish) {
            if (!c.filters.fetishes.fetishes.includes(filterOptions.fetish)) {
                return false;
            }
        }
        
        // Appearance filter
        if (filterOptions.appearance) {
            if (!c.filters.appearances.appearances.includes(filterOptions.appearance)) {
                return false;
            }
        }
        
        // Tag filter (search within subTags)
        if (filterOptions.tag) {
            const tagLower = filterOptions.tag.toLowerCase();
            if (!c.subTags.some(st => st.toLowerCase().includes(tagLower))) {
                return false;
            }
        }
        
        // Keyword search
        if (filterOptions.q) {
            const query = filterOptions.q.toLowerCase();
            const text = normalizeText(title);
            if (!text.includes(query) && !c.subTags.some(st => st.toLowerCase().includes(query))) {
                return false;
            }
        }
        
        return true;
    });
}

function groupVideosByCategory(videos) {
    if (!Array.isArray(videos)) return {};
    const grouped = {};
    
    for (const video of videos) {
        if (!video) continue;
        const title = (video && (video.name || video.title || video)) || '';
        if (typeof title !== 'string') continue;
        
        const categorization = categorizeVideo(title);
        const category = categorization.category;
        
        if (!grouped[category]) grouped[category] = [];
        grouped[category].push({ 
            ...video, 
            category: categorization.category, 
            subTags: categorization.subTags,
            filters: categorization.filters,
            keywords: extractKeywords(title)
        });
    }
    
    return grouped;
}

function getCategoryStats(videos) {
    const grouped = groupVideosByCategory(videos);
    const tagData = getAllTags(videos);
    let total = 0;
    
    for (const c of Object.values(grouped)) total += c.length;
    
    return { 
        total, 
        categories: Object.keys(grouped).length,
        byCategory: Object.fromEntries(
            Object.entries(grouped).map(([k, v]) => [k, { count: v.length, percentage: ((v.length / (total || 1)) * 100).toFixed(1) }])
        ),
        filters: tagData.filters
    };
}

function buildKeywordIndex(videos, topN = 100) {
    if (!Array.isArray(videos) || videos.length === 0) return { index: {}, topKeywords: [] };
    
    const validTopN = Math.max(1, Math.min(parseInt(topN) || 100, 500));
    const freq = new Map();
    
    for (const video of videos) {
        if (!video) continue;
        const title = (video && (video.name || video.title || video)) || '';
        if (typeof title !== 'string' || !title.trim()) continue;
        
        const extracted = extractKeywords(title);
        for (const token of extracted.all) {
            freq.set(token, (freq.get(token) || 0) + 1);
        }
    }
    
    const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return { 
        index: Object.fromEntries(sorted), 
        topKeywords: sorted.slice(0, validTopN).map(x => ({ keyword: x[0], count: x[1] }))
    };
}

module.exports = {
    extractKeywords,
    categorizeVideo,
    buildKeywordIndex,
    groupVideosByCategory,
    getAllTags,
    filterVideos,
    getCategoryStats,
    detectQuality,
    detectDuration,
    detectRegion,
    detectContentType,
    detectActions,
    detectFetishes,
    detectAppearance,
    CATEGORIES,
    REGION_PATTERNS,
    CONTENT_TYPE_PATTERNS,
    ACTION_PATTERNS,
    FETISH_PATTERNS,
    APPEARANCE_PATTERNS,
    QUALITY_PATTERNS,
    DURATION_PATTERNS
};
