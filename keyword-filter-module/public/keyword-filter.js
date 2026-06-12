/**
 * Keyword Filter System
 * Manages comprehensive keyword-based video filtering with NLP extracted keywords
 */

class KeywordFilter {
  constructor() {
    this.selectedKeywords = new Set();
    this.filterMode = 'any'; // 'any' = OR, 'all' = AND
    this.allKeywords = [];
    this.debounceTimer = null;
    this.currentPage = 1;
    this.suggestionsTimeout = null;

    this.initializeElements();
    this.attachEventListeners();
    this.loadKeywords();
  }

  initializeElements() {
    // Container and main elements
    this.container = document.querySelector('.keyword-filter-container');
    this.selectedList = document.getElementById('selected-keywords');
    this.frequencyGrid = document.getElementById('keyword-frequency-grid');
    this.searchInput = document.getElementById('keyword-search-input');
    this.suggestionsList = document.getElementById('keyword-search-suggestions');
    this.modeRadios = document.querySelectorAll('input[name="filter-mode"]');
    this.applyBtn = document.getElementById('apply-keyword-filter');
    this.resetBtn = document.getElementById('reset-keyword-filter');
    this.countDisplay = document.getElementById('keyword-count');
  }

  attachEventListeners() {
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => this.handleSearch(e));
      this.searchInput.addEventListener('focus', (e) => this.showSuggestions(e));
      this.searchInput.addEventListener('blur', () => this.hideSuggestions());
    }

    if (this.applyBtn) {
      this.applyBtn.addEventListener('click', () => this.applyFilter());
    }

    if (this.resetBtn) {
      this.resetBtn.addEventListener('click', () => this.resetFilters());
    }

    // Mode radio buttons
    this.modeRadios.forEach((radio) => {
      radio.addEventListener('change', (e) => {
        this.filterMode = e.target.value;
      });
    });

    // Clear button - search for it by examining parent
    if (this.searchInput) {
      // The clear button might not exist, so we'll create it if needed
      let clearBtn = this.searchInput.parentElement?.querySelector('button.keyword-search-clear');
      if (!clearBtn) {
        // Create a clear button next to the search input if it doesn't exist
        clearBtn = document.createElement('button');
        clearBtn.className = 'keyword-search-clear';
        clearBtn.setAttribute('type', 'button');
        clearBtn.innerHTML = '✕';
        this.searchInput.parentElement.appendChild(clearBtn);
      }
      
      clearBtn.addEventListener('click', () => {
        this.searchInput.value = '';
        this.searchInput.focus();
        this.hideSuggestions();
      });
    }

    // Close suggestions on outside click
    document.addEventListener('click', (e) => {
      if (this.searchInput && !e.target.closest('.keyword-search-wrapper') && !e.target.closest('.keyword-search-section')) {
        this.hideSuggestions();
      }
    });
  }

  /**
   * Load keywords from API endpoint
   */
  async loadKeywords() {
    try {
      if (!this.frequencyGrid) return;

      this.frequencyGrid.innerHTML =
        '<div class="keyword-pill loading"><span>Loading keywords...</span></div>';

      const response = await fetch('/api/keyword-stats');
      const data = await response.json();

      if (data.keywords && Array.isArray(data.keywords)) {
        this.allKeywords = data.keywords;
        this.renderKeywordGrid(data.keywords.slice(0, 50)); // Show top 50
      } else {
        this.frequencyGrid.innerHTML =
          '<div class="keyword-pill empty">No keywords available</div>';
      }
    } catch (error) {
      console.error('Error loading keywords:', error);
      if (this.frequencyGrid) {
        this.frequencyGrid.innerHTML = `<div class="keyword-pill empty">Error loading keywords</div>`;
      }
    }
  }

  /**
   * Render keyword pills in the grid
   */
  renderKeywordGrid(keywords) {
    if (!this.frequencyGrid) return;

    this.frequencyGrid.innerHTML = '';

    keywords.forEach((item) => {
      const pill = document.createElement('div');
      pill.className = 'keyword-pill';
      if (this.selectedKeywords.has(item.keyword.toLowerCase())) {
        pill.classList.add('active');
      }

      const percentageOfTotal = Math.round(
        (item.count / (this.allKeywords[0]?.count || item.count)) * 100
      );

      pill.innerHTML = `
        <div class="keyword-name" title="${item.keyword}">${item.keyword}</div>
        <div class="keyword-count">${item.count.toLocaleString()}</div>
      `;

      pill.addEventListener('click', () => this.toggleKeyword(item.keyword.toLowerCase(), pill));

      this.frequencyGrid.appendChild(pill);
    });
  }

  /**
   * Toggle keyword selection
   */
  toggleKeyword(keyword, pilElement) {
    const lowerKeyword = keyword.toLowerCase();

    if (this.selectedKeywords.has(lowerKeyword)) {
      this.selectedKeywords.delete(lowerKeyword);
      pilElement.classList.remove('active');
    } else {
      this.selectedKeywords.add(lowerKeyword);
      pilElement.classList.add('active');
    }

    this.updateSelectedDisplay();
    this.updateCountDisplay();
  }

  /**
   * Update selected keywords display
   */
  updateSelectedDisplay() {
    if (!this.selectedList) return;

    this.selectedList.innerHTML = '';

    if (this.selectedKeywords.size === 0) {
      this.selectedList.innerHTML = '<span style="color: var(--text-muted); font-size: 12px;">Click keywords below to select</span>';
      return;
    }

    Array.from(this.selectedKeywords).sort().forEach((keyword) => {
      const badge = document.createElement('div');
      badge.className = 'selected-keyword';
      badge.innerHTML = `
        <span>${keyword}</span>
        <span class="selected-keyword-remove">×</span>
      `;

      badge.querySelector('.selected-keyword-remove').addEventListener('click', () => {
        this.selectedKeywords.delete(keyword);
        // Update active state in grid
        const pillElements = document.querySelectorAll('.keyword-pill');
        pillElements.forEach((pill) => {
          const pillText = pill.querySelector('.keyword-name').textContent.toLowerCase();
          if (pillText === keyword) {
            pill.classList.remove('active');
          }
        });
        this.updateSelectedDisplay();
        this.updateCountDisplay();
      });

      this.selectedList.appendChild(badge);
    });
  }

  /**
   * Update keyword count display
   */
  updateCountDisplay() {
    if (this.countDisplay) {
      this.countDisplay.textContent = this.selectedKeywords.size + ' keywords';
    }
  }

  /**
   * Handle search input with debouncing
   */
  handleSearch(e) {
    const query = e.target.value.trim().toLowerCase();

    clearTimeout(this.debounceTimer);

    if (query.length === 0) {
      this.hideSuggestions();
      this.loadKeywords();
      return;
    }

    this.debounceTimer = setTimeout(() => {
      this.fetchSuggestions(query);
    }, 300);
  }

  /**
   * Fetch keyword suggestions based on search query
   */
  async fetchSuggestions(query) {
    try {
      // Filter keywords client-side for instant feedback
      const matching = this.allKeywords.filter((item) =>
        item.keyword.toLowerCase().includes(query)
      );

      if (matching.length > 0) {
        this.renderSuggestions(matching.slice(0, 10));
        this.showSuggestions();
      } else {
        this.hideSuggestions();
      }
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      this.hideSuggestions();
    }
  }

  /**
   * Render suggestion dropdown
   */
  renderSuggestions(suggestions) {
    if (!this.suggestionsList) return;

    this.suggestionsList.innerHTML = '';

    suggestions.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'keyword-suggestion-item';
      li.innerHTML = `
        <span>${item.keyword}</span>
        <span class="keyword-suggestion-count">${item.count.toLocaleString()}</span>
      `;

      li.addEventListener('click', () => {
        const keyword = item.keyword.toLowerCase();
        this.selectedKeywords.add(keyword);

        // Update grid active states
        document.querySelectorAll('.keyword-pill').forEach((pill) => {
          const pillText = pill.querySelector('.keyword-name').textContent.toLowerCase();
          if (pillText === keyword) {
            pill.classList.add('active');
          }
        });

        this.updateSelectedDisplay();
        this.updateCountDisplay();
        this.searchInput.value = '';
        this.hideSuggestions();
      });

      this.suggestionsList.appendChild(li);
    });
  }

  /**
   * Show suggestions dropdown
   */
  showSuggestions(e) {
    if (this.suggestionsList && this.suggestionsList.children.length > 0) {
      this.suggestionsList.classList.add('show');
    }
  }

  /**
   * Hide suggestions dropdown
   */
  hideSuggestions() {
    if (this.suggestionsList) {
      this.suggestionsList.classList.remove('show');
    }
  }

  /**
   * Apply keyword filter to videos
   */
  async applyFilter() {
    if (this.selectedKeywords.size === 0) {
      alert('Please select at least one keyword');
      return;
    }

    try {
      if (this.applyBtn) {
        this.applyBtn.disabled = true;
        this.applyBtn.textContent = 'Applying...';
      }

      const keywordList = Array.from(this.selectedKeywords).join(',');
      const params = new URLSearchParams({
        keywords: keywordList,
        mode: this.filterMode,
        limit: 50,
        page: 1,
      });

      const response = await fetch(`/api/keyword-filter?${params}`);
      const data = await response.json();

      if (data.videos && Array.isArray(data.videos)) {
        this.updateVideoGrid(data.videos);
        this.showNotification(
          `Found ${data.videos.length} videos matching your keywords`,
          'success'
        );
      } else {
        alert('No videos found for selected keywords');
      }
    } catch (error) {
      console.error('Error applying filter:', error);
      alert('Error applying filter. Please try again.');
    } finally {
      if (this.applyBtn) {
        this.applyBtn.disabled = false;
        this.applyBtn.textContent = 'Apply Filter';
      }
    }
  }

  /**
   * Update video grid with filtered results
   */
  updateVideoGrid(videos) {
    const grid = document.querySelector('.video-grid');
    if (!grid) return;

    grid.innerHTML = '';

    videos.forEach((video) => {
      const card = document.createElement('div');
      card.className = 'video-card';
      card.innerHTML = `
        <a href="${video.url || '#'}" class="video-link" target="_blank">
          <div class="thumbnail-container">
            <img 
              src="${video.thumbnail || ''}" 
              alt="${video.title || 'Video'}" 
              class="thumbnail loaded"
              onerror="this.classList.add('error')"
            />
            <div class="play-overlay">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </div>
          <div class="video-info">
            <div class="video-title" title="${video.title || 'Untitled'}">${video.title || 'Untitled'}</div>
            <div class="video-meta">${video.views || '0'} views</div>
          </div>
        </a>
      `;

      grid.appendChild(card);
    });
  }

  /**
   * Reset all filters
   */
  resetFilters() {
    this.selectedKeywords.clear();
    this.filterMode = 'any';
    this.searchInput.value = '';

    // Reset radio button
    const anyModeRadio = document.querySelector('input[value="any"]');
    if (anyModeRadio) {
      anyModeRadio.checked = true;
    }

    // Reset pill states
    document.querySelectorAll('.keyword-pill.active').forEach((pill) => {
      pill.classList.remove('active');
    });

    this.updateSelectedDisplay();
    this.updateCountDisplay();
    this.loadKeywords();

    this.showNotification('Filters reset', 'info');
  }

  /**
   * Show notification message
   */
  showNotification(message, type = 'info') {
    // Try to reuse existing notification or create new one
    let notification = document.getElementById('slideNotification');
    
    if (notification) {
      // Reuse existing notification
      const textEl = document.getElementById('notifText');
      const iconEl = document.getElementById('notifIcon');
      
      if (textEl) textEl.textContent = message;
      if (iconEl) iconEl.textContent = type === 'success' ? '✓' : 'ℹ';
      
      notification.classList.add('show');
      
      setTimeout(() => {
        notification.classList.remove('show');
      }, 3000);
    } else {
      // Create a new notification if none exists
      notification = document.createElement('div');
      notification.className = `slide-notification show`;
      notification.innerHTML = `
        <div class="slide-notification-content">
          <div class="slide-notification-icon">${type === 'success' ? '✓' : 'ℹ'}</div>
          <div class="slide-notification-text">${message}</div>
        </div>
      `;

      document.body.appendChild(notification);

      setTimeout(() => {
        notification.remove();
      }, 3000);
    }
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  const keywordFilter = new KeywordFilter();

  // Make it globally accessible for debugging
  window.keywordFilter = keywordFilter;
});
