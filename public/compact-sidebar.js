// Compact Sidebar with Auto-Extracted Categories & Tags
class CompactSidebar {
  constructor() {
    this.sidebar = document.getElementById('compact-sidebar');
    this.sidebarToggle = document.getElementById('sidebar-toggle');
    this.activeFilters = new Set();
    this.maxTagsShown = 8; // Truncate to 8 items by default
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.loadCategories();
    this.loadTrendingTags();
  }

  setupEventListeners() {
    // Toggle sidebar
    if (this.sidebarToggle) {
      this.sidebarToggle.addEventListener('click', () => this.toggleSidebar());
    }

    // Close sidebar on overlay click
    const overlay = document.getElementById('sidebar-overlay');
    if (overlay) {
      overlay.addEventListener('click', () => this.closeSidebar());
    }

    // Close on escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeSidebar();
    });

    // Expand/collapse sections
    const sectionHeaders = document.querySelectorAll('.sidebar-section-header');
    sectionHeaders.forEach(header => {
      header.addEventListener('click', (e) => this.toggleSection(e));
    });

    // Expand more/less buttons
    const expandBtns = document.querySelectorAll('.expand-more-btn');
    expandBtns.forEach(btn => {
      btn.addEventListener('click', (e) => this.toggleExpanded(e));
    });

    // Category filter
    const categoryTags = document.querySelectorAll('.sidebar-category-tag');
    categoryTags.forEach(tag => {
      tag.addEventListener('click', (e) => this.handleCategoryFilter(e));
    });

    // Keyword tag filter
    const keywordTags = document.querySelectorAll('.sidebar-keyword-tag');
    keywordTags.forEach(tag => {
      tag.addEventListener('click', (e) => this.handleKeywordFilter(e));
    });

    // Clear filters
    const clearBtn = document.getElementById('sidebar-clear-filters');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.clearAllFilters());
    }

    // Apply filters button
    const applyBtn = document.getElementById('sidebar-apply-filters');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => this.applyFilters());
    }

    // Close sidebar button
    const closeBtn = document.getElementById('sidebar-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeSidebar());
    }
  }

  toggleSidebar() {
    if (!this.sidebar) return;
    this.sidebar.classList.toggle('open');
    document.body.classList.toggle('sidebar-open');
  }

  closeSidebar() {
    if (!this.sidebar) return;
    this.sidebar.classList.remove('open');
    document.body.classList.remove('sidebar-open');
  }

  toggleSection(e) {
    const header = e.currentTarget;
    const section = header.closest('.sidebar-section');
    if (section) {
      section.classList.toggle('collapsed');
      const icon = header.querySelector('.section-icon');
      if (icon) {
        icon.textContent = section.classList.contains('collapsed') ? '▶' : '▼';
      }
    }
  }

  toggleExpanded(e) {
    e.preventDefault();
    const container = e.target.closest('.sidebar-tags-container');
    if (container) {
      const isExpanded = container.classList.contains('expanded');
      container.classList.toggle('expanded');
      e.target.textContent = isExpanded ? `Show more (${this.maxTagsShown})` : 'Show less';
    }
  }

  async loadCategories() {
    try {
      const response = await fetch('/api/categories');
      const data = await response.json();
      const categoriesContainer = document.getElementById('sidebar-categories');
      
      if (categoriesContainer && data.categories) {
        categoriesContainer.innerHTML = data.categories.map(cat => `
          <button class="sidebar-category-tag" data-category="${cat}" title="${cat}">
            <span class="tag-text">${cat}</span>
          </button>
        `).join('');

        // Re-attach event listeners
        const categoryTags = categoriesContainer.querySelectorAll('.sidebar-category-tag');
        categoryTags.forEach(tag => {
          tag.addEventListener('click', (e) => this.handleCategoryFilter(e));
        });
      }
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  }

  async loadTrendingTags() {
    try {
      const response = await fetch('/api/trending-tags');
      const data = await response.json();
      const tagsContainer = document.getElementById('sidebar-trending-tags');
      
      if (tagsContainer && data.tags) {
        const truncatedTags = data.tags.slice(0, this.maxTagsShown);
        const hiddenCount = Math.max(0, data.tags.length - this.maxTagsShown);

        let html = truncatedTags.map(tag => `
          <button class="sidebar-keyword-tag" data-tag="${tag}" title="${tag}">
            <span class="tag-text">${tag}</span>
          </button>
        `).join('');

        if (hiddenCount > 0) {
          html += `<button class="expand-more-btn">+${hiddenCount} more</button>`;
        }

        tagsContainer.innerHTML = html;
        tagsContainer.dataset.totalTags = data.tags.length;
        
        // Store all tags for expansion
        tagsContainer.dataset.allTags = JSON.stringify(data.tags);

        // Re-attach event listeners
        const keywordTags = tagsContainer.querySelectorAll('.sidebar-keyword-tag');
        keywordTags.forEach(tag => {
          tag.addEventListener('click', (e) => this.handleKeywordFilter(e));
        });

        const expandBtn = tagsContainer.querySelector('.expand-more-btn');
        if (expandBtn) {
          expandBtn.addEventListener('click', (e) => this.expandTags(e, data.tags));
        }
      }
    } catch (error) {
      console.error('Failed to load trending tags:', error);
    }
  }

  expandTags(e, allTags) {
    e.preventDefault();
    const tagsContainer = e.target.closest('.sidebar-tags-container');
    if (!tagsContainer) return;

    if (tagsContainer.classList.contains('expanded')) {
      // Collapse back to truncated
      const truncatedTags = allTags.slice(0, this.maxTagsShown);
      let html = truncatedTags.map(tag => `
        <button class="sidebar-keyword-tag" data-tag="${tag}" title="${tag}">
          <span class="tag-text">${tag}</span>
        </button>
      `).join('');
      html += `<button class="expand-more-btn">+${allTags.length - this.maxTagsShown} more</button>`;
      tagsContainer.innerHTML = html;
      tagsContainer.classList.remove('expanded');
    } else {
      // Expand to show all
      const html = allTags.map(tag => `
        <button class="sidebar-keyword-tag" data-tag="${tag}" title="${tag}">
          <span class="tag-text">${tag}</span>
        </button>
      `).join('') + '<button class="expand-more-btn">Show less</button>';
      tagsContainer.innerHTML = html;
      tagsContainer.classList.add('expanded');
    }

    // Re-attach event listeners
    const keywordTags = tagsContainer.querySelectorAll('.sidebar-keyword-tag');
    keywordTags.forEach(tag => {
      tag.addEventListener('click', (e) => this.handleKeywordFilter(e));
    });

    const expandBtn = tagsContainer.querySelector('.expand-more-btn');
    if (expandBtn) {
      expandBtn.addEventListener('click', (e) => this.expandTags(e, allTags));
    }
  }

  handleCategoryFilter(e) {
    const tag = e.currentTarget;
    const category = tag.dataset.category;
    
    tag.classList.toggle('active');
    
    if (tag.classList.contains('active')) {
      this.activeFilters.add(category);
    } else {
      this.activeFilters.delete(category);
    }
    
    this.applyFilters();
  }

  handleKeywordFilter(e) {
    const tag = e.currentTarget;
    const keyword = tag.dataset.tag;
    
    tag.classList.toggle('active');
    
    if (tag.classList.contains('active')) {
      this.activeFilters.add(keyword);
    } else {
      this.activeFilters.delete(keyword);
    }
    
    this.applyFilters();
  }

  async applyFilters() {
    const filters = Array.from(this.activeFilters);
    
    if (filters.length === 0) {
      location.reload();
      return;
    }

    try {
      const response = await fetch('/api/filter-videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters })
      });
      
      const data = await response.json();
      this.updateGallery(data.videos);
      this.updateFilterDisplay();
    } catch (error) {
      console.error('Filter error:', error);
    }
  }

  updateGallery(videos) {
    const grid = document.querySelector('.video-grid');
    if (!grid) return;

    grid.innerHTML = videos.map(video => `
      <article class="video-card" data-name="${video.name}">
        <a href="/${encodeURIComponent(video.name)}" class="video-link">
          <div class="thumbnail-container">
            <img src="${video.thumbnail}?w=320&q=80" alt="${video.name}" class="thumbnail" loading="lazy">
            <div class="play-overlay">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </div>
          <div class="video-info">
            <h3>${video.name}</h3>
          </div>
        </a>
      </article>
    `).join('');
  }

  updateFilterDisplay() {
    const filterIndicator = document.getElementById('active-filters');
    if (filterIndicator) {
      const count = this.activeFilters.size;
      filterIndicator.textContent = count > 0 ? `(${count} filters)` : '';
    }
  }

  clearAllFilters() {
    this.activeFilters.clear();
    
    // Remove active state from all tags
    document.querySelectorAll('.sidebar-category-tag.active, .sidebar-keyword-tag.active').forEach(tag => {
      tag.classList.remove('active');
    });
    
    this.updateFilterDisplay();
    location.reload();
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  new CompactSidebar();
});
