/**
 * Keyword Filter Router
 * Provides API endpoints for comprehensive keyword-based video filtering
 */

const express = require('express');
const router = express.Router();
const nlp = require('../nlp');

/**
 * Get keyword statistics and frequency
 * GET /keyword-stats
 */
router.get('/keyword-stats', async (req, res) => {
  try {
    const getVideoList = req.app.locals.getVideoList;
    
    if (!getVideoList || typeof getVideoList !== 'function') {
      return res.status(500).json({ error: 'getVideoList function not provided to app.locals' });
    }
    
    if (!nlp) {
      return res.json({ keywords: [] });
    }
    
    const videos = await getVideoList();
    const keywordCounts = {};
    const keywordVideoMap = {};
    
    videos.forEach(v => {
      const kw = nlp.extractKeywords(v.name);
      kw.all.forEach(word => {
        const lowerWord = word.toLowerCase();
        keywordCounts[lowerWord] = (keywordCounts[lowerWord] || 0) + 1;
        if (!keywordVideoMap[lowerWord]) {
          keywordVideoMap[lowerWord] = [];
        }
        if (keywordVideoMap[lowerWord].length < 3) {
          keywordVideoMap[lowerWord].push(v.name.substring(0, 40));
        }
      });
    });
    
    const sortedKeywords = Object.entries(keywordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100)
      .map(([keyword, count]) => ({
        keyword,
        count,
        examples: keywordVideoMap[keyword] || []
      }));
    
    res.json({
      keywords: sortedKeywords,
      total: Object.keys(keywordCounts).length,
      topCount: sortedKeywords[0]?.count || 0
    });
  } catch (error) {
    console.error('Keyword stats error:', error);
    res.status(500).json({ error: 'Failed to fetch keyword statistics' });
  }
});

/**
 * Filter videos by keywords with AND/OR logic
 * GET /keyword-filter?keywords=word1,word2&mode=any|all&limit=50&page=1
 */
router.get('/keyword-filter', async (req, res) => {
  try {
    const getVideoList = req.app.locals.getVideoList;
    
    if (!getVideoList || typeof getVideoList !== 'function') {
      return res.status(500).json({ error: 'getVideoList function not provided to app.locals' });
    }
    
    const keywords = (req.query.keywords || '').split(',').filter(k => k.trim());
    const mode = req.query.mode || 'any'; // 'any' = OR, 'all' = AND
    const limit = parseInt(req.query.limit) || 50;
    const page = parseInt(req.query.page) || 1;
    
    let videos = await getVideoList();
    
    // Apply NLP enrichment
    if (nlp) {
      videos = videos.map(v => {
        const kw = nlp.extractKeywords(v.name);
        return {
          ...v,
          category: nlp.categorizeVideo(v.name).category,
          keywords: kw.all.map(k => k.toLowerCase()),
          allKeywords: kw.all,
          primaryKeywords: kw.primary
        };
      });
    }
    
    // Filter by keywords
    if (keywords.length > 0) {
      const keywordSet = new Set(keywords.map(k => k.toLowerCase().trim()));
      
      videos = videos.filter(v => {
        const videoKeywords = new Set((v.keywords || []).map(k => k.toLowerCase()));
        const videoName = v.name.toLowerCase();
        
        if (mode === 'all') {
          // All keywords must match (AND)
          return Array.from(keywordSet).every(kw => 
            videoKeywords.has(kw) || videoName.includes(kw) || v.category?.toLowerCase().includes(kw)
          );
        } else {
          // Any keyword matches (OR) - default
          return Array.from(keywordSet).some(kw => 
            videoKeywords.has(kw) || videoName.includes(kw) || v.category?.toLowerCase().includes(kw)
          );
        }
      });
    }
    
    const total = videos.length;
    const startIndex = (page - 1) * limit;
    const paginatedVideos = videos.slice(startIndex, startIndex + limit);
    
    res.json({
      videos: paginatedVideos.map(v => ({
        name: v.name,
        thumbnail: v.thumbnail,
        category: v.category,
        matchedKeywords: (v.primaryKeywords || []).filter(k => 
          keywords.map(kw => kw.toLowerCase()).includes(k.toLowerCase())
        )
      })),
      pagination: {
        current: page,
        total: Math.ceil(total / limit),
        totalItems: total,
        hasNext: startIndex + limit < total
      },
      keywords: keywords,
      mode: mode
    });
  } catch (error) {
    console.error('Keyword filter error:', error);
    res.status(500).json({ error: 'Failed to filter by keywords' });
  }
});

/**
 * Get related keywords for semantic filtering
 * GET /related-keywords?word=keyword
 */
router.get('/related-keywords', async (req, res) => {
  try {
    const getVideoList = req.app.locals.getVideoList;
    
    if (!getVideoList || typeof getVideoList !== 'function') {
      return res.status(500).json({ error: 'getVideoList function not provided to app.locals' });
    }
    
    const keyword = (req.query.word || '').toLowerCase().trim();
    if (!keyword) {
      return res.json({ relatedKeywords: [] });
    }
    
    if (!nlp) {
      return res.json({ relatedKeywords: [] });
    }
    
    const videos = await getVideoList();
    const relatedMap = {};
    
    // Find videos containing the keyword
    const videosWithKeyword = videos.filter(v => {
      const kw = nlp.extractKeywords(v.name);
      return kw.all.some(k => k.toLowerCase().includes(keyword));
    });
    
    // Extract related keywords from those videos
    videosWithKeyword.forEach(v => {
      const kw = nlp.extractKeywords(v.name);
      kw.all.forEach(word => {
        const lowerWord = word.toLowerCase();
        if (lowerWord !== keyword && !lowerWord.includes(keyword)) {
          relatedMap[lowerWord] = (relatedMap[lowerWord] || 0) + 1;
        }
      });
    });
    
    // Sort by frequency
    const relatedKeywords = Object.entries(relatedMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([word, count]) => ({
        keyword: word,
        cooccurrence: count,
        relevance: Math.round((count / videosWithKeyword.length) * 100)
      }));
    
    res.json({
      baseKeyword: keyword,
      videosWithKeyword: videosWithKeyword.length,
      relatedKeywords: relatedKeywords
    });
  } catch (error) {
    console.error('Related keywords error:', error);
    res.status(500).json({ error: 'Failed to fetch related keywords' });
  }
});

module.exports = router;
