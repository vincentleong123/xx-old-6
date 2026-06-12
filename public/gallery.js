// Basic Gallery Functionality
document.addEventListener('DOMContentLoaded', function() {
  // Initialize gallery
  loadGallery();
  
  function loadGallery() {
    // Simple gallery loader
    const gallery = document.querySelector('.video-grid');
    if (gallery) {
      const videos = document.querySelectorAll('.video-card');
      videos.forEach(card => {
        card.style.display = 'block';
      });
    }
  }
});
