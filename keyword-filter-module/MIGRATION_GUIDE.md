# Migration Guide: Using Keyword Filter Module

This guide explains how to refactor the existing `server-nlp-complete.js` to use the new isolated `keyword-filter-module`.

## Current Architecture

Currently, the keyword filtering logic is embedded in `server-nlp-complete.js`:
- API endpoints in the main server file
- Dependencies on utils/nlp.js
- CSS and JS bundled with main stylesheet

## New Architecture

The keyword filtering is now isolated in a reusable module:
- Standalone `keyword-filter-module/` directory
- Can be used in any Express.js project
- Minimal changes to main server file

## Migration Steps

### Step 1: Update server-nlp-complete.js

At the top of your `server-nlp-complete.js`, add the module initialization:

```javascript
const KeywordFilterModule = require('./keyword-filter-module');

// ... existing code ...

const app = express();
const PORT = process.env.PORT || 8102;

// ... existing middleware setup ...

// Initialize keyword filter module AFTER defining getVideoList function
const keywordFilter = new KeywordFilterModule({
  getVideoList: getVideoList, // The function you already have
  app: app, // This auto-mounts everything
  apiPrefix: '/api',
  publicPath: '/keyword-filter-assets' // Change if needed
});
```

### Step 2: Remove Duplicate Code

Remove these sections from `server-nlp-complete.js`:

1. **Remove the NLP import:**
   ```javascript
   // DELETE THIS:
   let nlp;
   try {
     nlp = require('./utils/nlp');
   } catch (error) {
     console.log('NLP module not found');
     nlp = null;
   }
   ```

2. **Remove keyword API endpoints:**
   - `app.get('/api/keyword-stats', ...)`
   - `app.get('/api/keyword-filter', ...)`
   - `app.get('/api/related-keywords', ...)`

3. **Remove NLP-related routes:**
   - `app.get('/api/keywords', ...)`
   - `app.get('/api/trending-tags', ...)`
   - `app.post('/api/filter-videos', ...)`

But **KEEP** these if you use them elsewhere:
   - `app.get('/api/categories', ...)`
   - `app.get('/api/categories-with-videos', ...)`

### Step 3: Update Gallery Template

In `views/gallery.ejs`, no changes needed! The module serves the same endpoints at `/api/keyword-*`.

## Files After Migration

```
server-nlp-complete.js          # Cleaned up, ~70% smaller
utils/nlp.js                    # Can be removed if not used elsewhere
public/keyword-filter.js        # MOVE to keyword-filter-module/public/
public/style.css               # Remove keyword-filter- styles
views/gallery.ejs              # No changes needed

keyword-filter-module/          # NEW - Reusable module
├── index.js
├── nlp.js
├── package.json
├── routes/keyword-filter.js
├── public/keyword-filter.js
├── public/keyword-filter.css
├── README.md
└── USAGE_EXAMPLE.js
```

## Cleanup

After migration, you can safely delete:
- `public/keyword-filter.js` (old file)
- The keyword-filter CSS section from `public/style.css`
- `utils/nlp.js` (if not used elsewhere)

## Accessing NLP Utilities

If other parts of your code need NLP functions:

```javascript
const keywordFilter = new KeywordFilterModule({ ... });
const nlp = keywordFilter.getNLP();

// Now use nlp.extractKeywords(), nlp.categorizeVideo(), etc.
```

## Testing the Migration

1. Start the server: `node server-nlp-complete.js`
2. Test API endpoints:
   - `http://localhost:8102/api/keyword-stats`
   - `http://localhost:8102/api/keyword-filter?keywords=tudung&mode=any`
   - `http://localhost:8102/api/related-keywords?word=tudung`
3. Test static assets:
   - `http://localhost:8102/keyword-filter-assets/keyword-filter.js`
   - `http://localhost:8102/keyword-filter-assets/keyword-filter.css`
4. Test UI in browser - filtering should work as before

## Benefits of Migration

✅ **Code Reusability** - Use the same module in other projects
✅ **Cleaner Codebase** - Main server ~70% less code for keyword logic
✅ **Maintainability** - Changes to filtering logic in one place
✅ **Scalability** - Easier to test and version separately
✅ **Separation of Concerns** - Clear boundaries between modules

## Rollback

If you need to rollback, keep the old files. The keyword-filter-module can co-exist with old code.

## Future Improvements

After successful migration, consider:
1. Moving keyword-filter-module to a separate npm package
2. Creating a CLI tool for batch keyword extraction
3. Adding caching layer for keyword statistics
4. Creating Admin UI for keyword management
