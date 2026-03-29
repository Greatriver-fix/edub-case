import { Hono } from 'hono';
import bcrypt from 'bcrypt'; // For password hashing
import { ADMIN_PASSWORD_HASH } from '../constants'; // Import the hash

const adminApp = new Hono();

// --- Admin Verification Route ---
adminApp.post('/verify-admin', async (c) => {
    console.log('POST /api/verify-admin requested');
    try {
        const body = await c.req.json();
        const { password } = body;

        if (!password || typeof password !== 'string') {
            return c.json({ error: 'Password is required.' }, 400);
        }

        if (!ADMIN_PASSWORD_HASH) {
             console.error('ADMIN_PASSWORD_HASH is not configured. Admin verification is disabled.');
             return c.json({ error: 'Admin verification is not configured on this server.' }, 503);
        }

        const match = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);

        if (match) {
            console.log('Admin password verification successful.');
            return c.json({ success: true });
        } else {
            console.log('Admin password verification failed.');
            return c.json({ success: false }, 401); // Unauthorized
        }

    } catch (error: any) {
         console.error('Error processing POST /api/verify-admin:', error);
         // Distinguish between JSON parsing error and bcrypt error if needed
         if (error instanceof SyntaxError) {
             return c.json({ error: 'Invalid request body.' }, 400);
         }
         return c.json({ error: 'An unexpected error occurred during verification.' }, 500);
    }
});

export default adminApp;
