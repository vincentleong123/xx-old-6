/**
 * Keyword Filter Module - Main Export
 * 
 * A reusable, drop-in keyword filtering system for Express.js servers
 * Provides:
 * - Backend API endpoints for keyword extraction and filtering
 * - Frontend JavaScript controller for UI interactions
 * - Complete CSS styling system
 * - NLP utilities for keyword extraction
 */

const express = require('express');
const path = require('path');

module.exports = class KeywordFilterModule {
  /**
   * Initialize the keyword filter module
   * @param {Object} config - Configuration object
   * @param {Function} config.getVideoList - Function that returns array of videos
   * @param {string} config.apiPrefix - API endpoint prefix (default: '/api')
   * @param {string} config.publicPath - Public path for static assets (default: '/keyword-filter')
   * @param {Express.Application} config.app - Express app instance (optional, for auto-setup)
   */
  constructor(config = {}) {
    this.config = {
      apiPrefix: '/api',
      publicPath: '/keyword-filter',
      ...config
    };

    if (!this.config.getVideoList || typeof this.config.getVideoList !== 'function') {
      throw new Error('KeywordFilterModule: getVideoList function is required in config');
    }

    this.nlp = require('./nlp');
    this.router = this.createRouter();
    this.publicRouter = this.createPublicRouter();

    // Auto-setup if app is provided
    if (this.config.app && this.config.app instanceof express.application) {
      this.setup(this.config.app);
    }
  }

  /**
   * Setup the module with an Express app
   * @param {Express.Application} app - Express application
   */
  setup(app) {
    // Store getVideoList in app.locals for router access
    app.locals.getVideoList = this.config.getVideoList;

    // Mount API routes
    app.use(this.config.apiPrefix, this.router);

    // Mount public assets
    app.use(this.config.publicPath, this.publicRouter);

    console.log(`✓ Keyword Filter Module initialized at ${this.config.apiPrefix}`);
    console.log(`✓ Public assets available at ${this.config.publicPath}`);
  }

  /**
   * Create the API router
   */
  createRouter() {
    return require('./routes/keyword-filter');
  }

  /**
   * Create the public assets router
   */
  createPublicRouter() {
    const router = express.Router();
    const publicDir = path.join(__dirname, 'public');
    
    router.use(express.static(publicDir, {
      maxAge: '1h',
      etag: false
    }));

    return router;
  }

  /**
   * Get NLP utilities for direct use
   */
  getNLP() {
    return this.nlp;
  }

  /**
   * Get the API router for manual mounting
   */
  getRouter() {
    return this.router;
  }

  /**
   * Get the public static router for manual mounting
   */
  getPublicRouter() {
    return this.publicRouter;
  }
};
