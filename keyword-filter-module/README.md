# Keyword Filter Module

A reusable, production-ready keyword filtering system that can be integrated into any Express.js server. Provides comprehensive NLP-powered keyword extraction, filtering, and an interactive UI component.

## Features

✨ **Complete Keyword Filtering System**
- 📊 NLP-based keyword extraction and categorization
- 🔍 Advanced filtering with AND/OR logic modes
- 🏷️ Keyword frequency statistics
- 🔗 Related keyword suggestions
- 📱 Fully responsive UI (mobile, tablet, desktop)
- 🎨 Themeable with CSS variables
- ♿ Accessible and semantic HTML

**Backend**
- 3 RESTful API endpoints for keyword operations
- Zero external NLP dependencies (built-in algorithms)
- Stateless design for scalability
- Support for custom video sources

**Frontend**
- Vanilla JavaScript (no framework dependencies)
- Real-time keyword search with autocomplete
- Interactive pill-based selection interface
- Smooth animations and transitions
- Dark/light theme support

## Installation

1. Copy or symlink the `keyword-filter-module` folder to your project
2. Require it in your server:

```javascript
const KeywordFilterModule = require('./keyword-filter-module');
```

## Quick Start

### Basic Setup (Auto-integration)

```javascript
const express = require('express');
const KeywordFilterModule = require('./keyword-filter-module');

const app = express();

// Your video source function
async function getVideoList() {
  // Return array of video objects with at least: { name, thumbnail, ... }
  return await db.getVideos();
}

// Initialize and auto-setup module
const keywordFilter = new KeywordFilterModule({
  getVideoList: getVideoList,
  app: app, // Auto-mounts routes and static files
  apiPrefix: '/api', // Optional
  publicPath: '/keyword-filter' // Optional
});

app.listen(8102, () => console.log('Server running on port 8102'));
```

### Manual Setup

```javascript
const KeywordFilterModule = require('./keyword-filter-module');

const keywordFilter = new KeywordFilterModule({
  getVideoList: getVideoList
});

// Manually mount routes
app.use('/api', keywordFilter.getRouter());

// Manually mount static files
app.use('/keyword-filter', keywordFilter.getPublicRouter());

// Store the function in app.locals for router access
app.locals.getVideoList = getVideoList;
```

## API Endpoints

### GET /api/keyword-stats
Returns keyword frequency statistics with top keywords.

**Response:**
```json
{
  "keywords": [
    {
      "keyword": "tudung",
      "count": 2607,
      "examples": ["Video name 1", "Video name 2"]
    }
  ],
  "total": 6251,
  "topCount": 2607
}
```

### GET /api/keyword-filter
Filters videos by selected keywords with configurable AND/OR logic.

**Query Parameters:**
- `keywords` (string, comma-separated): Keywords to filter by
- `mode` (string): 'any' for OR logic (default), 'all' for AND logic
- `limit` (number): Results per page (default: 50)
- `page` (number): Page number for pagination (default: 1)

**Example:** `/api/keyword-filter?keywords=tudung,malay&mode=any&limit=20`

**Response:**
```json
{
  "videos": [
    {
      "name": "Video Title",
      "thumbnail": "http://...",
      "category": "Malay Adult",
      "matchedKeywords": ["tudung"]
    }
  ],
  "pagination": {
    "current": 1,
    "total": 50,
    "totalItems": 2500,
    "hasNext": true
  },
  "keywords": ["tudung", "malay"],
  "mode": "any"
}
```

### GET /api/related-keywords
Returns keywords that co-occur with the specified keyword.

**Query Parameters:**
- `word` (string): Base keyword to find related keywords for

**Example:** `/api/related-keywords?word=tudung`

**Response:**
```json
{
  "baseKeyword": "tudung",
  "videosWithKeyword": 2607,
  "relatedKeywords": [
    {
      "keyword": "malay",
      "cooccurrence": 1200,
      "relevance": 46
    }
  ]
}
```

## Frontend Integration

### 1. Include Stylesheet

Add to your HTML `<head>`:

```html
<link rel="stylesheet" href="/keyword-filter/keyword-filter.css">
```

### 2. Add Filter HTML Container

Add to your HTML body where you want the filter to appear:

```html
<div class="keyword-filter-container">
  <div class="keyword-filter-header">
    <h3>🔍 Filter by Keywords</h3>
    <p class="keyword-filter-hint">Select keywords to discover videos</p>
  </div>

  <!-- Selected Keywords Display -->
  <div id="selected-keywords" class="selected-keywords-list"></div>

  <!-- Keyword Search Section -->
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

  <!-- Keyword Frequency Grid -->
  <div id="keyword-frequency-grid" class="keyword-frequency-grid"></div>

  <!-- Filter Mode Selection -->
  <div class="filter-mode-section">
    <div class="filter-mode-group">
      <label class="filter-mode-radio">
        <input type="radio" name="filter-mode" value="any" checked>
        <span class="filter-mode-label">
          <span class="filter-mode-name">Match Any (OR)</span>
          <span class="filter-mode-description">Find videos with any selected keyword</span>
        </span>
      </label>
    </div>
    <div class="filter-mode-group">
      <label class="filter-mode-radio">
        <input type="radio" name="filter-mode" value="all">
        <span class="filter-mode-label">
          <span class="filter-mode-name">Match All (AND)</span>
          <span class="filter-mode-description">Find videos with all selected keywords</span>
        </span>
      </label>
    </div>
  </div>

  <!-- Keyword Count Display -->
  <div class="keyword-count-display">
    <span class="keyword-count-text">
      Keywords Selected: <span id="keyword-count" class="keyword-count-badge">0</span>
    </span>
  </div>

  <!-- Action Buttons -->
  <div class="keyword-actions">
    <button id="apply-keyword-filter" class="keyword-apply-btn">Apply Filter</button>
    <button id="reset-keyword-filter" class="keyword-reset-btn">Reset Filters</button>
  </div>
</div>

<!-- Your video grid to be filtered -->
<div class="video-grid">
  <!-- Videos will be rendered here -->
</div>
```

### 3. Include JavaScript

Add before closing `</body>` tag:

```html
<script src="/keyword-filter/keyword-filter.js"></script>
```

The `KeywordFilter` class will auto-initialize on page load and be accessible as `window.keywordFilter`.

## Customization

### Video Object Structure

Your `getVideoList()` function should return an array of objects with at least:

```javascript
{
  name: "Video Title",              // Required for keyword extraction
  thumbnail: "url/to/thumbnail",    // Optional
  duration: "3:45",                 // Optional, displayed in results
  category: "Category",             // Optional
  // ... any other properties
}
```

### CSS Variables

Customize the appearance by setting CSS variables in your stylesheet:

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

### API Endpoints Prefix

Default is `/api`, but you can customize:

```javascript
const keywordFilter = new KeywordFilterModule({
  getVideoList: getVideoList,
  apiPrefix: '/filters' // Routes become /filters/keyword-stats, etc.
});
```

### Public Assets Path

Default is `/keyword-filter`, customize with:

```javascript
const keywordFilter = new KeywordFilterModule({
  getVideoList: getVideoList,
  publicPath: '/static/keyword-filter' // Assets at /static/keyword-filter/keyword-filter.js
});
```

## NLP Features

### Keyword Extraction

Automatically extracts important keywords from video titles:

```javascript
const nlp = keywordFilter.getNLP();
const keywords = nlp.extractKeywords("Malay Girl Hot Video Tudung Seksi");
console.log(keywords);
// { 
//   primary: ['malay', 'girl', 'hot', 'tudung'],
//   secondary: ['video', 'seksi'],
//   all: ['malay', 'girl', 'hot', 'tudung', 'video', 'seksi']
// }
```

### Video Categorization

Automatic category detection:

```javascript
const nlp = keywordFilter.getNLP();
const result = nlp.categorizeVideo("Malay Girl Hot Video");
console.log(result);
// {
//   category: "Malay Adult",
//   subTags: ["seksi", "malay-girl", "hot"],
//   confidence: 3
// }
```

### Keyword Indexing

Build keyword indices:

```javascript
const nlp = keywordFilter.getNLP();
const index = nlp.buildKeywordIndex(videos, 100);
console.log(index);
// {
//   index: { "malay": 4500, "girl": 3200, ... },
//   topKeywords: [
//     { keyword: "malay", count: 4500 },
//     { keyword: "girl", count: 3200 }
//   ]
// }
```

## Performance Considerations

- **Caching:** Consider caching video lists if they don't change frequently
- **Pagination:** API supports pagination via `limit` and `page` parameters
- **Lazy Loading:** Frontend dynamically loads keywords on first request
- **Debouncing:** Search input is debounced at 300ms intervals

## File Structure

```
keyword-filter-module/
├── index.js                   # Main module export
├── nlp.js                     # NLP utilities
├── routes/
│   └── keyword-filter.js      # API endpoints router
└── public/
    ├── keyword-filter.js      # Frontend controller
    └── keyword-filter.css     # Styling
```

## Browser Support

- Chrome/Chromium: ✅
- Firefox: ✅
- Safari: ✅
- Edge: ✅
- IE11: ❌ (uses ES6 features)

## License

This module is part of the xx-caddy-video-server project.

## Troubleshooting

### "getVideoList function not provided"
Ensure you're passing the `getVideoList` function in config:
```javascript
new KeywordFilterModule({
  getVideoList: getVideoList  // This is required
});
```

### API endpoints returning 500 errors
Make sure `app.locals.getVideoList` is set when manually mounting routes:
```javascript
app.locals.getVideoList = getVideoList;
app.use('/api', keywordFilter.getRouter());
```

### Styling not working
Ensure CSS is properly linked:
```html
<link rel="stylesheet" href="/keyword-filter/keyword-filter.css">
```

And that CSS variables are defined in your stylesheet.

### Search not filtering results
Ensure your video objects have a `name` property that contains the text to search.
