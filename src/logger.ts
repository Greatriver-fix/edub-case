import pino from 'pino';

// Basic browser logger configuration
// In a real app, you might configure different levels or transports based on environment
const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug', // Log more in dev
  browser: {
    // Configure how pino behaves in the browser
    asObject: true, // Log messages as objects
  },
  // Pretty print is mainly for Node.js, browser console handles formatting
  // transport: process.env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
});

export default logger;
