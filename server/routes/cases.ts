import { Hono } from 'hono';
import type { HonoRequest } from 'hono'; // Use type-only import
import { db } from '../db'; // Import the shared db instance
import { IMAGES_DIR } from '../constants'; // Import constants
import { saveUploadedFile, validateCaseItems, validateUploadedFile, type CaseItemLinkData } from '../utils'; // Import helpers
import { unlink } from 'node:fs/promises'; // For deleting files
import { join } from 'node:path'; // For path manipulation

const casesApp = new Hono();

// --- Case API Routes ---

// GET /api/cases - Fetch list of cases. By default, only active cases.
// Use ?include_all=true to fetch all cases (for admin panel).
casesApp.get('/', (c) => {
    const includeAll = c.req.query('include_all') === 'true';
    console.log(`GET /api/cases requested (include_all: ${includeAll})`);
    try {
        let query = 'SELECT id, name, image_path FROM cases';
        if (!includeAll) {
            query += ' WHERE is_active = 1';
        }
        query += ' ORDER BY created_at DESC';

        const stmt = db.prepare(query);
        const cases = stmt.all();
        return c.json(cases);
    } catch (dbError) {
        console.error('Database error fetching cases:', dbError);
        return c.json({ error: 'Database error fetching cases.' }, 500);
    }
});

// GET /api/cases/:id - Fetch details for a specific case and its items
casesApp.get('/:id', (c) => {
    const idParam = c.req.param('id');
    const id = parseInt(idParam, 10);
    console.log(`GET /api/cases/${id} requested`);

    if (isNaN(id)) {
        return c.json({ error: 'Invalid case ID provided.' }, 400);
    }

    try {
        // Include image_path and is_active in the select statement
        const caseStmt = db.prepare('SELECT id, name, description, image_path, is_active FROM cases WHERE id = ?');
        const caseDetails = caseStmt.get(id) as { id: number; name: string; description: string | null; image_path: string | null; is_active: number } | null;

        if (!caseDetails) {
            return c.json({ error: 'Case not found.' }, 404);
        }

        // Fetch associated items by joining cases -> case_items -> item_templates
        const itemsStmt = db.prepare(`
            SELECT
                ci.item_template_id,
                ci.override_name,
                ci.percentage_chance,
                ci.display_color,
                ci.show_percentage_in_opener, -- <<< NEW FIELD
                it.base_name,
                it.image_path as image_url,
                it.sound_path as sound_url,
                COALESCE(ci.override_rules_text, it.rules_text) as rules_text
            FROM case_items ci
            JOIN item_templates it ON ci.item_template_id = it.id
            WHERE ci.case_id = ?
            ORDER BY ci.display_order ASC
        `);
        // Type needs to match the SELECT statement columns/aliases
        const itemsRaw = itemsStmt.all(id) as Array<{
            item_template_id: number;
            override_name: string | null;
            percentage_chance: number;
            display_color: string;
            show_percentage_in_opener: number; // SQLite stores boolean as 0 or 1
            base_name: string;
            image_url: string | null;
            sound_url: string | null;
            rules_text: string | null;
        }>;

        // Process raw items to create the final structure for the frontend
        const items = itemsRaw.map(item => ({
            item_template_id: item.item_template_id,
            name: item.override_name ?? item.base_name,
            percentage_chance: item.percentage_chance,
            display_color: item.display_color,
            showPercentageInOpener: item.show_percentage_in_opener === 1, // Convert to boolean
            image_url: item.image_url,
            sound_url: item.sound_url,
            rules_text: item.rules_text,
            override_name: item.override_name
        }));


        const result = {
            ...caseDetails,
            is_active: caseDetails.is_active === 1, // Convert to boolean
            items: items
        };
        return c.json(result);

    } catch (dbError) {
        console.error(`Database error fetching case ${id}:`, dbError);
        return c.json({ error: 'Database error fetching case details.' }, 500);
    }
});

// POST /api/cases - Create a new case (handles multipart/form-data, uses new item structure)
casesApp.post('/', async (c) => {
    console.log('POST /api/cases requested (multipart/form-data)');
    let caseId: number | null = null;
    const savedFilePaths: string[] = []; // Track saved image for rollback

    try {
        const formData = await c.req.formData();
        const name = formData.get('name') as string;
        const description = formData.get('description') as string | null;
        const itemsJson = formData.get('items') as string; // Items array as JSON string
        const imageFile = formData.get('image_file') as File | null;
        const existingImagePath = formData.get('existing_image_path') as string | null;
        const isActive = formData.get('is_active') === 'true';

        // --- Basic Validation ---
        if (!name || typeof name !== 'string' || name.trim() === '') {
            return c.json({ error: 'Case name is required.' }, 400);
        }
        if (!itemsJson || typeof itemsJson !== 'string') {
            return c.json({ error: 'Items data (JSON string) is required.' }, 400);
        }

        let items: CaseItemLinkData[]; // CaseItemLinkData might need showPercentageInOpener
        try {
            items = JSON.parse(itemsJson);
            // Update validateCaseItems if it needs to check showPercentageInOpener
            const validationError = validateCaseItems(items, c.req);
            if (validationError) {
                return c.json({ error: validationError }, 400);
            }
        } catch (parseError) {
            return c.json({ error: 'Invalid items JSON format.' }, 400);
        }
        // --- End Basic Validation ---

        // --- File Validation ---
        const imageValidationError = await validateUploadedFile(imageFile, 'image');
        if (imageValidationError) return c.json({ error: imageValidationError }, 400);
        // --- End File Validation ---

        // --- Database Insertion (Transaction) ---
        const insertCaseStmt = db.prepare('INSERT INTO cases (name, description, image_path, is_active) VALUES (?, ?, ?, ?) RETURNING id');
        const insertItemLinkStmt = db.prepare(`
            INSERT INTO case_items
            (case_id, item_template_id, override_name, percentage_chance, display_color, override_rules_text, display_order, show_percentage_in_opener)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        db.exec('BEGIN TRANSACTION');

        try {
            let finalImagePath: string | null = null;
            if (imageFile) {
                finalImagePath = await saveUploadedFile(imageFile, IMAGES_DIR);
                if (finalImagePath) savedFilePaths.push(join('.', finalImagePath));
                else throw new Error('Failed to save new case image file.');
            } else if (existingImagePath) {
                finalImagePath = existingImagePath;
            }

            const caseResult = insertCaseStmt.get(
                name.trim(),
                description?.trim() ?? null,
                finalImagePath,
                isActive ? 1 : 0
            ) as { id: number } | null;

            if (!caseResult || typeof caseResult.id !== 'number') {
                 throw new Error('Failed to insert case or retrieve ID.');
            }
            caseId = caseResult.id;

            for (const [index, item] of items.entries()) {
                const showPercentageInOpenerValue = typeof item.showPercentageInOpener === 'boolean' ? (item.showPercentageInOpener ? 1 : 0) : 1; // Default to 1 (true)
                insertItemLinkStmt.run(
                    caseId,
                    item.item_template_id,
                    item.override_name?.trim() ?? null,
                    item.percentage_chance,
                    item.display_color,
                    item.override_rules_text?.trim() ?? null,
                    index,
                    showPercentageInOpenerValue // <<< NEW FIELD
                );
            }

            db.exec('COMMIT');
            console.log(`Case '${name}' (ID: ${caseId}) with image '${finalImagePath}' and ${items.length} item links inserted successfully.`);
            return c.json({ message: 'Case created successfully', caseId: caseId }, 201);

        } catch (dbError) {
            console.error('Case creation transaction failed, rolling back:', dbError);
            db.exec('ROLLBACK');
            console.log('Attempting to delete saved case image due to rollback:', savedFilePaths);
            for (const filePath of savedFilePaths) {
                try { await unlink(filePath); console.log(`Deleted rolled back file: ${filePath}`); }
                catch (unlinkError) { console.error(`Error deleting rolled back file ${filePath}:`, unlinkError); }
            }
            const errorMessage = dbError instanceof Error ? dbError.message : String(dbError);
            return c.json({ error: `Database error during case creation: ${errorMessage}` }, 500);
        }
        // --- End Database Insertion ---

    } catch (error: any) {
        console.error('Error processing POST /api/cases:', error);
        return c.json({ error: 'An unexpected error occurred processing the request.' }, 500);
    }
});

// PUT /api/cases/:id - Update an existing case and its item links
casesApp.put('/:id', async (c) => {
    const idParam = c.req.param('id');
    const caseId = parseInt(idParam, 10);
    console.log(`PUT /api/cases/${caseId} requested (multipart/form-data)`);

    if (isNaN(caseId)) {
        return c.json({ error: 'Invalid case ID provided.' }, 400);
    }

    const savedFilePaths: string[] = [];
    let oldImagePath: string | null = null;

    try {
        const selectCaseStmt = db.prepare('SELECT image_path FROM cases WHERE id = ?');
        const existingCaseData = selectCaseStmt.get(caseId) as { image_path: string | null } | null;

        if (!existingCaseData) {
            return c.json({ error: 'Case not found.' }, 404);
        }
        oldImagePath = existingCaseData.image_path;

        const formData = await c.req.formData();
        const name = formData.get('name') as string;
        const description = formData.get('description') as string | null;
        const itemsJson = formData.get('items') as string;
        const imageFile = formData.get('image_file') as File | null;
        const existingImagePath = formData.get('existing_image_path') as string | null;
        const clearImage = formData.get('clear_image') === 'true';
        const isActive = formData.get('is_active') === 'true';

        if (!name || typeof name !== 'string' || name.trim() === '') {
            return c.json({ error: 'Case name is required.' }, 400);
        }
        if (!itemsJson || typeof itemsJson !== 'string') {
            return c.json({ error: 'Items data (JSON string) is required.' }, 400);
        }

        let items: CaseItemLinkData[]; // CaseItemLinkData might need showPercentageInOpener
         try {
            items = JSON.parse(itemsJson);
            // Update validateCaseItems if it needs to check showPercentageInOpener
            const validationError = validateCaseItems(items, c.req);
            if (validationError) {
                return c.json({ error: validationError }, 400);
            }
        } catch (parseError) {
            return c.json({ error: 'Invalid items JSON format.' }, 400);
        }

        const imageValidationError = await validateUploadedFile(imageFile, 'image');
        if (imageValidationError) return c.json({ error: imageValidationError }, 400);

        const updateCaseStmt = db.prepare('UPDATE cases SET name = ?, description = ?, image_path = ?, is_active = ? WHERE id = ?');
        const deleteOldItemsStmt = db.prepare('DELETE FROM case_items WHERE case_id = ?');
        const insertItemLinkStmt = db.prepare(`
            INSERT INTO case_items
            (case_id, item_template_id, override_name, percentage_chance, display_color, override_rules_text, display_order, show_percentage_in_opener)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        db.exec('BEGIN TRANSACTION');
        let finalImagePath = oldImagePath;

        try {
            if (clearImage) {
                finalImagePath = null;
            } else if (imageFile) {
                const newImagePath = await saveUploadedFile(imageFile, IMAGES_DIR);
                if (newImagePath) { savedFilePaths.push(join('.', newImagePath)); finalImagePath = newImagePath; }
                else { throw new Error('Failed to save new case image file.'); }
            } else if (existingImagePath) {
                 finalImagePath = existingImagePath;
            }

            updateCaseStmt.run(
                name.trim(),
                description?.trim() ?? null,
                finalImagePath,
                isActive ? 1 : 0,
                caseId
            );

            deleteOldItemsStmt.run(caseId);

            for (const [index, item] of items.entries()) {
                const showPercentageInOpenerValue = typeof item.showPercentageInOpener === 'boolean' ? (item.showPercentageInOpener ? 1 : 0) : 1; // Default to 1 (true)
                insertItemLinkStmt.run(
                    caseId,
                    item.item_template_id,
                    item.override_name?.trim() ?? null,
                    item.percentage_chance,
                    item.display_color,
                    item.override_rules_text?.trim() ?? null,
                    index,
                    showPercentageInOpenerValue // <<< NEW FIELD
                );
            }

            db.exec('COMMIT');

            if (oldImagePath && (clearImage || (imageFile && oldImagePath !== finalImagePath))) {
                 try { await unlink(join('.', oldImagePath)); console.log(`Deleted old/replaced case image: ${oldImagePath}`); }
                 catch(e) { console.error(`Error deleting old/replaced case image ${oldImagePath}:`, e); }
            }

            console.log(`Case '${name}' (ID: ${caseId}) updated successfully with image '${finalImagePath}' and ${items.length} item links.`);
            return c.json({ message: 'Case updated successfully', caseId: caseId });

        } catch (dbError) {
            console.error(`Case update transaction failed for ID ${caseId}, rolling back:`, dbError);
            db.exec('ROLLBACK');
            console.log('Attempting to delete newly saved case image due to rollback:', savedFilePaths);
            for (const filePath of savedFilePaths) {
                try { await unlink(filePath); console.log(`Deleted rolled back file: ${filePath}`); }
                catch (unlinkError) { console.error(`Error deleting rolled back file ${filePath}:`, unlinkError); }
            }
            const errorMessage = dbError instanceof Error ? dbError.message : String(dbError);
            return c.json({ error: `Database error during case update: ${errorMessage}` }, 500);
        }

    } catch (error: any) {
        console.error(`Error processing PUT /api/cases/${caseId}:`, error);
        return c.json({ error: 'An unexpected error occurred processing the request.' }, 500);
    }
});

// DELETE /api/cases/:id - Delete a case and its associated image
casesApp.delete('/:id', async (c) => {
    const idParam = c.req.param('id');
    const caseId = parseInt(idParam, 10);
    console.log(`DELETE /api/cases/${caseId} requested`);

    if (isNaN(caseId)) {
        return c.json({ error: 'Invalid case ID provided.' }, 400);
    }

    let imagePathToDelete: string | null = null;

    try {
        const selectStmt = db.prepare('SELECT image_path FROM cases WHERE id = ?');
        const caseData = selectStmt.get(caseId) as { image_path: string | null } | null;

        if (!caseData) {
            return c.json({ error: 'Case not found.' }, 404);
        }
        imagePathToDelete = caseData.image_path;

        const deleteStmt = db.prepare('DELETE FROM cases WHERE id = ?');
        const result = deleteStmt.run(caseId);

        if (result.changes === 0) {
            console.warn(`Case ID ${caseId} found but delete operation affected 0 rows.`);
            return c.json({ error: 'Case found but failed to delete.' }, 500);
        }

        console.log(`Case ID ${caseId} deleted successfully from database.`);

        if (imagePathToDelete) {
            try {
                const fullPath = join('.', imagePathToDelete);
                await unlink(fullPath);
                console.log(`Deleted associated case image: ${fullPath}`);
            } catch (unlinkError: any) {
                if (unlinkError.code === 'ENOENT') {
                     console.warn(`Associated image file not found, skipping deletion: ${imagePathToDelete}`);
                } else {
                    console.error(`Error deleting associated case image ${imagePathToDelete}:`, unlinkError);
                }
            }
        }

        return c.json({ message: 'Case deleted successfully.' });

    } catch (dbError) {
        console.error(`Error processing DELETE /api/cases/${caseId}:`, dbError);
        const errorMessage = dbError instanceof Error ? dbError.message : String(dbError);
        return c.json({ error: `Database error during case deletion: ${errorMessage}` }, 500);
    }
});

export default casesApp;
