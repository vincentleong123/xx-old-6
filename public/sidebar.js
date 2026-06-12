// Mobile sidebar functionality
document.addEventListener('DOMContentLoaded', function() {
  const menuToggle = document.getElementById('menuToggle');
  const mobileSidebar = document.getElementById('mobileSidebar');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  
  if (menuToggle && mobileSidebar && sidebarOverlay) {
    // Toggle sidebar
    menuToggle.addEventListener('click', function() {
      mobileSidebar.classList.toggle('open');
      sidebarOverlay.classList.toggle('active');
      document.body.style.overflow = mobileSidebar.classList.contains('open') ? 'hidden' : '';
    });
    
    // Close on overlay click
    sidebarOverlay.addEventListener('click', function() {
      mobileSidebar.classList.remove('open');
      sidebarOverlay.classList.remove('active');
      document.body.style.overflow = '';
    });
    
    // Close on escape key
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && mobileSidebar.classList.contains('open')) {
        mobileSidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
        document.body.style.overflow = '';
      }
    });
  }
  
  // Populate mobile sidebar with desktop sidebar content
  const desktopSidebar = document.querySelector('.desktop-sidebar');
  if (desktopSidebar && mobileSidebar) {
    mobileSidebar.innerHTML = `
      <div class="mobile-sidebar-header">
        <h2>Menu</h2>
        <button class="close-sidebar" aria-label="Close menu">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        </button>
      </div>
      ${desktopSidebar.innerHTML}
    `;
    
    // Close button functionality
    const closeBtn = mobileSidebar.querySelector('.close-sidebar');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        mobileSidebar.classList.remove('open');
        sidebarOverlay.classList.remove('active');
        document.body.style.overflow = '';
      });
    }
  }
});

