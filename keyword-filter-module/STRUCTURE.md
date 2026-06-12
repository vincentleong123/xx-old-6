# Keyword Filter Module - Structure & Overview

## 📁 Module Directory Structure

```
keyword-filter-module/
├── index.js                               # Main export - Module class
├── nlp.js                                 # NLP utilities (no external deps)
├── package.json                           # Module metadata
│
├── routes/
│   └── keyword-filter.js                 # Express router with API endpoints
│
├── public/
│   ├── keyword-filter.js                 # Frontend JavaScript controller
│   └── keyword-filter.css                # Complete styling system
│
├── README.md                              # Full documentation
├── USAGE_EXAMPLE.js                       # Integration example
└── MIGRATION_GUIDE.md                     # How to migrate existing servers
```

## 🔧 What's Included

### Backend Components

**index.js** (Module Entry Point)
- `KeywordFilterModule` class
- Auto-setup via Express app
- Manual setup options
- NLP access methods

**nlp.js** (NLP Engine)
- Keyword extraction from text
- Video categorization
- Keyword indexing and frequency analysis
- N-gram detection
- No external dependencies - pure JavaScript

**routes/keyword-filter.js** (API Endpoints)
- 3 RESTful endpoints
- Pagination support
- Video filtering with AND/OR logic
- Keyword statistics and frequency analysis
- Related keyword suggestions

### Frontend Components

**keyword-filter.js** (UI Controller)
- `KeywordFilter` class
- 15+ methods for managing filtering
- Search with autocomplete
- Keyword pill selection
- Video grid updates
- Notification system

**keyword-filter.css** (Complete Styling)
- Responsive grid layout (mobile, tablet, desktop)
- Dark/light theme support
- CSS variables for theming
- Animations and transitions
- Accessibility features

## 🚀 Quick Integration

### Using Auto-Setup (Recommended)

```javascript
const KeywordFilterModule = require('./keyword-filter-module');

const keywordFilter = new KeywordFilterModule({
  getVideoList: async () => {
    return await db.getVideos();
  },
  app: express_app // Pass your Express app
});

// That's it! Routes and assets are auto-mounted
```

### Using Manual Setup

```javascript
const KeywordFilterModule = require('./keyword-filter-module');

const keywordFilter = new KeywordFilterModule({
  getVideoList: getVideoList
});

// Mount router
app.use('/api', keywordFilter.getRouter());

// Mount static assets
app.use('/assets', keywordFilter.getPublicRouter());

// Provide getVideoList to the router
app.locals.getVideoList = getVideoList;
```

## 📊 API Endpoints Provided

### /api/keyword-stats
```javascript
GET /api/keyword-stats

Response:
{
  keywords: [
    { keyword: "tudung", count: 2607, examples: [...] },
    { keyword: "malay", count: 1850, examples: [...] }
  ],
  total: 6251,
  topCount: 2607
}
```

### /api/keyword-filter
```javascript
GET /api/keyword-filter?keywords=tudung,malay&mode=any&limit=20&page=1

Response:
{
  videos: [...],
  pagination: { current: 1, total: 50, totalItems: 1000, hasNext: true },
  keywords: ["tudung", "malay"],
  mode: "any"
}
```

### /api/related-keywords
```javascript
GET /api/related-keywords?word=tudung

Response:
{
  baseKeyword: "tudung",
  videosWithKeyword: 2607,
  relatedKeywords: [
    { keyword: "malay", cooccurrence: 1200, relevance: 46 },
    { keyword: "girl", cooccurrence: 980, relevance: 38 }
  ]
}
```

## 💻 Frontend Usage

### 1. Include Stylesheet
```html
<link rel="stylesheet" href="/keyword-filter-assets/keyword-filter.css">
```

### 2. Add HTML Container
```html
<div class="keyword-filter-container">
  <!-- Filter UI automatically rendered -->
  <div class="keyword-filter-header">
    <h3>🔍 Filter by Keywords</h3>
  </div>
  
  <div id="selected-keywords" class="selected-keywords-list"></div>
  <div class="keyword-search-wrapper">
    <input id="keyword-search-input" class="keyword-search-input">
    <ul id="keyword-search-suggestions" class="keyword-suggestions-list"></ul>
  </div>
  
  <div id="keyword-frequency-grid" class="keyword-frequency-grid"></div>
  
  <div class="filter-mode-section">
    <label class="filter-mode-radio">
      <input type="radio" name="filter-mode" value="any" checked>
      <span class="filter-mode-label">Match Any (OR)</span>
    </label>
    <label class="filter-mode-radio">
      <input type="radio" name="filter-mode" value="all">
      <span class="filter-mode-label">Match All (AND)</span>
    </label>
  </div>
  
  <div class="keyword-count-display">
    <span>Keywords: <span id="keyword-count" class="keyword-count-badge">0</span></span>
  </div>
  
  <div class="keyword-actions">
    <button id="apply-keyword-filter" class="keyword-apply-btn">Apply Filter</button>
    <button id="reset-keyword-filter" class="keyword-reset-btn">Reset</button>
  </div>
</div>

<!-- Your video grid -->
<div class="video-grid"><!-- Videos rendered here --></div>
```

### 3. Include JavaScript
```html
<script src="/keyword-filter-assets/keyword-filter.js"></script>
```

The module auto-initializes. Access via `window.keywordFilter`:
```javascript
window.keywordFilter.selectedKeywords  // Set of selected keywords
window.keywordFilter.applyFilter()     // Trigger filter
window.keywordFilter.resetFilters()    // Clear filters
```

## 🎨 Customization

### CSS Variables
```css
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
```

### Config Options
```javascript
new KeywordFilterModule({
  getVideoList: async () => [...],     // Required
  app: express_app,                    // Optional - auto-setup
  apiPrefix: '/api',                   // Optional - default
  publicPath: '/keyword-filter-assets' // Optional - default
})
```

## 📦 Zero Dependencies

✓ No external NPM packages required
✓ No jQuery or framework dependencies
✓ Pure JavaScript (ES6)
✓ Pure CSS (no preprocessors)

## 🔄 How It Works

### Backend Flow
1. Client requests `/api/keyword-stats`
2. Router calls `app.locals.getVideoList()`
3. NLP engine extracts keywords from video names
4. Keywords sorted by frequency
5. JSON response sent to client

### Frontend Flow
1. Page loads, auto-creates `KeywordFilter` instance
2. Fetches `/api/keyword-stats` on load
3. Renders keyword pills in grid
4. User selects keywords by clicking pills
5. User clicks "Apply Filter"
6. Fetches `/api/keyword-filter?keywords=...`
7. Updates video grid with filtered results

### Filtering Logic
- **OR Mode (Any):** Video matches if it contains ANY selected keyword
- **AND Mode (All):** Video matches if it contains ALL selected keywords
- Matching checks: keyword extraction, video name contains, category match

## 📈 Performance

- **Keyword Extraction:** O(n) where n = video title length
- **Filtering:** O(m*k) where m = videos, k = keywords
- **Search:** Client-side filtering (instant)
- **Pagination:** Built-in (default 50 per page)

## 🧪 Testing

Test endpoints in curl/browser:

```bash
# Get keyword statistics
curl "http://localhost:8102/api/keyword-stats"

# Filter videos
curl "http://localhost:8102/api/keyword-filter?keywords=tudung,malay&mode=any"

# Get related keywords
curl "http://localhost:8102/api/related-keywords?word=tudung"
```

## 📝 Documentation Files

- **README.md** - Complete API and integration documentation
- **USAGE_EXAMPLE.js** - Full working example server
- **MIGRATION_GUIDE.md** - How to migrate existing servers
- **STRUCTURE.md** - This file - architecture overview

## 🔐 Security Considerations

- All user input is sanitized
- No SQL injection possible (no database)
- No XSS vectors in template rendering  
- API endpoints are stateless
- CORS can be configured

## 🌍 Browser Support

- Chrome/Chromium: Latest
- Firefox: Latest
- Safari: Latest
- Edge: Latest
- IE11: ❌ (uses ES6)

## 📞 Next Steps

1. Copy `keyword-filter-module/` to your project
2. Follow setup instructions in `README.md`
3. Or use `USAGE_EXAMPLE.js` as reference
4. Customize CSS variables for your theme
5. Integrate with your video data source

## 📄 License

Same as parent project
