/**
 * Example: Integrating Keyword Filter Module into another server.js project
 * 
 * This example shows how to drop the keyword-filter-module into any Express.js
 * project and have a fully functional keyword filtering system with minimal code.
 */

const express = require('express');
const path = require('path');
const KeywordFilterModule = require('./keyword-filter-module');

const app = express();
const PORT = process.env.PORT || 8103;

// ============================================
// Example 1: Basic video source
// ============================================
// In a real project, this would pull from your database
const exampleVideos = [
  { name: 'Malay Girl Hot Video Tudung Seksi', thumbnail: 'img1.jpg', duration: '5:30' },
  { name: 'Thai Girl Amateur Home Video', thumbnail: 'img2.jpg', duration: '3:45' },
  { name: 'Hot Student Teacher Roleplay', thumbnail: 'img3.jpg', duration: '8:20' },
  // ... more videos
];

async function getVideoList() {
  // Replace this with your actual video fetching logic:
  // return await db.videos.find({});
  // return await fs.readJson('./videos.json');
  // return await fetch('https://api.example.com/videos').then(r => r.json());
  
  return exampleVideos;
}

// ============================================
// Setup Keyword Filter Module (AUTO-SETUP)
// ============================================
const keywordFilter = new KeywordFilterModule({
  getVideoList: getVideoList,
  app: app, // Pass app for auto-mounting
  apiPrefix: '/api', // Optional
  publicPath: '/keyword-filter' // Optional
});

// ============================================
// Alternative: Manual Setup
// ============================================
// If you prefer manual setup, comment out above and use:
/*
const keywordFilter = new KeywordFilterModule({
  getVideoList: getVideoList
});

app.locals.getVideoList = getVideoList;
app.use('/api', keywordFilter.getRouter());
app.use('/keyword-filter', keywordFilter.getPublicRouter());
*/

// ============================================
// Your existing routes and middleware
// ============================================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));

// Your existing routes
app.get('/', async (req, res) => {
  const videos = await getVideoList();
  res.render('index', { videos });
});

app.get('/video/:name', async (req, res) => {
  const videos = await getVideoList();
  const video = videos.find(v => v.name === req.params.name);
  if (video) {
    res.render('video', { video });
  } else {
    res.status(404).send('Video not found');
  }
});

// ============================================
// Access NLP utilities if needed
// ============================================
const nlp = keywordFilter.getNLP();

// Example: Pre-process videos with keyword extraction
app.get('/api/videos-with-keywords', async (req, res) => {
  const videos = await getVideoList();
  const enriched = videos.map(v => ({
    ...v,
    keywords: nlp.extractKeywords(v.name),
    category: nlp.categorizeVideo(v.name)
  }));
  res.json(enriched);
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`📊 Keyword Filter API: http://localhost:${PORT}/api/keyword-stats`);
  console.log(`🎨 Static Assets: http://localhost:${PORT}/keyword-filter/keyword-filter.css`);
});

// ============================================
// Example EJS template for usage
// ============================================
/*
In views/index.ejs:

<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="/keyword-filter/keyword-filter.css">
  <style>
    :root {
      --bg-secondary: #1e1e1e;
      --bg-tertiary: #2a2a2a;
      --text-primary: #ffffff;
      --text-secondary: #aaaaaa;
      --text-muted: #666666;
      --border-color: #333333;
      --accent-primary: #ff0066;
      --radius-lg: 12px;
    }
  </style>
</head>
<body>
  <h1>Video Gallery with Keyword Filtering</h1>

  <!-- Keyword Filter UI -->
  <div class="keyword-filter-container">
    <div class="keyword-filter-header">
      <h3>🔍 Filter by Keywords</h3>
      <p class="keyword-filter-hint">Select keywords to discover videos</p>
    </div>

    <div id="selected-keywords" class="selected-keywords-list"></div>

    <div class="keyword-search-wrapper">
      <input 
        type="text" 
        id="keyword-search-input" 
        class="keyword-search-input"
        placeholder="Search keywords..."
        autocomplete="off"
      >
      <ul id="keyword-search-suggestions" class="keyword-suggestions-list"></ul>
    </div>

    <div id="keyword-frequency-grid" class="keyword-frequency-grid"></div>

    <div class="filter-mode-section">
      <div class="filter-mode-group">
        <label class="filter-mode-radio">
          <input type="radio" name="filter-mode" value="any" checked>
          <span class="filter-mode-label">
            <span class="filter-mode-name">Match Any (OR)</span>
            <span class="filter-mode-description">Find videos with any keyword</span>
          </span>
        </label>
      </div>
      <div class="filter-mode-group">
        <label class="filter-mode-radio">
          <input type="radio" name="filter-mode" value="all">
          <span class="filter-mode-label">
            <span class="filter-mode-name">Match All (AND)</span>
            <span class="filter-mode-description">Find videos with all keywords</span>
          </span>
        </label>
      </div>
    </div>

    <div class="keyword-count-display">
      <span class="keyword-count-text">
        Keywords Selected: <span id="keyword-count" class="keyword-count-badge">0</span>
      </span>
    </div>

    <div class="keyword-actions">
      <button id="apply-keyword-filter" class="keyword-apply-btn">Apply Filter</button>
      <button id="reset-keyword-filter" class="keyword-reset-btn">Reset Filters</button>
    </div>
  </div>

  <!-- Video Grid -->
  <div class="video-grid">
    <% videos.forEach(video => { %>
      <div class="video-card" data-name="<%= video.name %>">
        <a href="/video/<%= encodeURIComponent(video.name) %>" class="video-link">
          <img src="<%= video.thumbnail %>" alt="<%= video.name %>" class="thumbnail">
          <div class="play-overlay">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
          <div class="video-info">
            <h3><%= video.name %></h3>
            <p><%= video.duration || '0:00' %></p>
          </div>
        </a>
      </div>
    <% }); %>
  </div>

  <script src="/keyword-filter/keyword-filter.js"></script>
</body>
</html>
*/

module.exports = app;
