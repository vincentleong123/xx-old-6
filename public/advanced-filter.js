// Advanced filtering functionality
document.addEventListener('DOMContentLoaded', function() {
  // Mobile filter toggle
  const filterToggle = document.getElementById('mobile-filter-toggle');
  const filterPanel = document.querySelector('.filter-panel');
  const closeFilterBtn = document.getElementById('close-filter-mobile');
  
  if (filterToggle && filterPanel) {
    filterToggle.addEventListener('click', function() {
      filterPanel.classList.add('open');
      document.body.style.overflow = 'hidden';
    });
    
    if (closeFilterBtn) {
      closeFilterBtn.addEventListener('click', function() {
        filterPanel.classList.remove('open');
        document.body.style.overflow = '';
      });
    }
    
    // Close when clicking outside on mobile
    filterPanel.addEventListener('click', function(e) {
      if (e.target === filterPanel) {
        filterPanel.classList.remove('open');
        document.body.style.overflow = '';
      }
    });
  }
  
  // Discovery mode toggle
  const discoveryToggle = document.getElementById('discovery-toggle');
  if (discoveryToggle) {
    discoveryToggle.addEventListener('change', function() {
      if (this.checked) {
        // Shuffle current videos
        const grid = document.querySelector('.video-grid');
        const cards = Array.from(grid.children);
        cards.sort(() => Math.random() - 0.5);
        cards.forEach(card => grid.appendChild(card));
        
        showNotification('🎲 Discovery mode enabled! Videos shuffled.');
      }
    });
  }
  
  // Sort functionality
  const sortSelect = document.getElementById('sort-select');
  if (sortSelect) {
    sortSelect.addEventListener('change', function() {
      const grid = document.querySelector('.video-grid');
      const cards = Array.from(grid.children);
      
      switch(this.value) {
        case 'az':
          cards.sort((a, b) => a.dataset.name.localeCompare(b.dataset.name));
          break;
        case 'za':
          cards.sort((a, b) => b.dataset.name.localeCompare(a.dataset.name));
          break;
        case 'random':
          cards.sort(() => Math.random() - 0.5);
          break;
        default: // newest - by index
          cards.sort((a, b) => parseInt(a.dataset.index) - parseInt(b.dataset.index));
      }
      
      cards.forEach(card => grid.appendChild(card));
    });
  }
  
  // Category checkboxes
  const categoryCheckboxes = document.querySelectorAll('.category-checkbox');
  categoryCheckboxes.forEach(cb => {
    cb.addEventListener('change', function() {
      const selected = Array.from(categoryCheckboxes)
        .filter(c => c.checked)
        .map(c => c.dataset.category);
      
      if (selected.length > 0) {
        window.location.href = '/?category=' + encodeURIComponent(selected[0]);
      }
    });
  });
  
  // Surprise me button
  const surpriseBtn = document.getElementById('surprise-me-btn');
  if (surpriseBtn) {
    surpriseBtn.addEventListener('click', async function() {
      try {
        const response = await fetch('/api/random-video');
        const data = await response.json();
        if (data.name) {
          window.location.href = '/' + encodeURIComponent(data.name);
        }
      } catch (error) {
        showNotification('❌ Failed to load random video');
      }
    });
  }
  
  // Clear filters
  const clearBtn = document.getElementById('clear-filters');
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      window.location.href = '/';
    });
  }
  
  // Load trending keywords
  loadTrendingKeywords();
});

async function loadTrendingKeywords() {
  const container = document.getElementById('trending-keywords');
  if (!container) return;
  
  try {
    const response = await fetch('/api/keywords');
    const data = await response.json();
    
    if (data.topKeywords && data.topKeywords.length > 0) {
      container.innerHTML = data.topKeywords
        .slice(0, 15)
        .map(k => `<span class="trending-keyword" onclick="searchKeyword('${k.word}')">${k.word}</span>`)
        .join('');
    }
  } catch (error) {
    container.innerHTML = '<span class="loading">Failed to load</span>';
  }
}

function searchKeyword(keyword) {
  window.location.href = '/?search=' + encodeURIComponent(keyword);
}

function showNotification(message) {
  const notif = document.getElementById('slideNotification');
  const textEl = document.getElementById('notifText');
  const iconEl = document.getElementById('notifIcon');
  
  if (notif && textEl) {
    textEl.textContent = message;
    iconEl.textContent = message.split(' ')[0];
    notif.classList.add('show');
    
    setTimeout(() => {
      notif.classList.remove('show');
    }, 3000);
  }
}
