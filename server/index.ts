import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger'; // Re-import the default logger
import { serveStatic } from 'hono/bun'; // Import serveStatic for serving files
import { db } from './db'; // Import the initialized db instance
import { CORS_ORIGINS } from './constants';

// Import route handlers
import itemTemplatesApp from './routes/itemTemplates';
import casesApp from './routes/cases';
import adminApp from './routes/admin';
import faqApp from './routes/faq';

// --- Hono App Setup ---
const app = new Hono();

// --- Middleware ---
// Logger - Apply to all routes using the default logger
app.use('*', logger());

// CORS for API routes - Apply to all /api/* paths
app.use('/api/*', cors({
  origin: CORS_ORIGINS,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'], // Content-Type might be multipart/form-data now
}));

// Static file serving for uploads
// Serve files from './uploads' directory when URL path starts with '/uploads/'
app.use('/uploads/*', serveStatic({ root: './' }));

// --- API Routes ---
// Mount the routers under their respective base paths
app.route('/api/item-templates', itemTemplatesApp);
app.route('/api/cases', casesApp);
app.route('/api', adminApp); // Mount admin routes directly under /api (e.g., /api/verify-admin)
app.route('/api/faq', faqApp);

// GET /api/existing-assets - Fetch distinct existing image/sound paths from templates
app.get('/api/existing-assets', (c) => {
    console.log(`GET /api/existing-assets requested`);
    try {
        const imageStmt = db.prepare('SELECT DISTINCT image_path FROM item_templates WHERE image_path IS NOT NULL');
        const soundStmt = db.prepare('SELECT DISTINCT sound_path FROM item_templates WHERE sound_path IS NOT NULL');
        const images = imageStmt.all().map((row: any) => row.image_path);
        const sounds = soundStmt.all().map((row: any) => row.sound_path);
        return c.json({ images, sounds });
    } catch (dbError) {
        console.error('Database error fetching existing assets:', dbError);
        return c.json({ error: 'Database error fetching existing assets.' }, 500);
    }
});

// Root route for health check
app.get('/', (c) => c.text('Hono API Server is running!'));

// Serve CSS from src/styles for the FAQ page. This is the only static content
// the backend needs to serve directly, as Nginx handles the main frontend build.
app.use('/styles/*', serveStatic({ root: './src' }));

// --- Server Start ---
export const port = Number(process.env.PORT || 3001);

if (import.meta.main) {
  Bun.serve({
    port,
    fetch: app.fetch,
  });
  console.log(`Hono server listening on port ${port}`);
}

// Export app/db for reuse without starting the server on import.
export { app, db };
