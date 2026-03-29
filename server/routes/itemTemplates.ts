import { Hono } from 'hono';
import { db } from '../db'; // Import the shared db instance
import {
    IMAGES_DIR,
    SOUNDS_DIR,
    ALLOWED_IMAGE_TYPES,
    MAX_IMAGE_SIZE_BYTES,
    ALLOWED_AUDIO_TYPES
} from '../constants'; // Import constants
import { saveUploadedFile, validateUploadedFile } from '../utils'; // Import helpers
import { unlink } from 'node:fs/promises'; // For deleting files
import { join } from 'node:path'; // For path manipulation

const itemTemplatesApp = new Hono();

// --- Item Template API Routes ---

// GET /api/item-templates - List all item templates
itemTemplatesApp.get('/', (c) => {
    console.log(`GET /api/item-templates requested`);
    try {
        const stmt = db.prepare('SELECT id, base_name, image_path, sound_path, rules_text, created_at FROM item_templates ORDER BY created_at DESC');
        const templates = stmt.all();
        return c.json(templates);
    } catch (dbError) {
        console.error('Database error fetching item templates:', dbError);
        return c.json({ error: 'Database error fetching item templates.' }, 500);
    }
});

// POST /api/item-templates - Create a new item template
itemTemplatesApp.post('/', async (c) => {
    console.log('POST /api/item-templates requested');
    const savedFilePaths: string[] = []; // Track saved files for rollback

    try {
        const formData = await c.req.formData();
        const baseName = formData.get('base_name') as string;
        const rulesText = formData.get('rules_text') as string | null;
        const imageFile = formData.get('image_file') as File | null;
        const soundFile = formData.get('sound_file') as File | null;
        // Get selected existing paths (if provided)
        const existingImagePath = formData.get('existing_image_path') as string | null;
        const existingSoundPath = formData.get('existing_sound_path') as string | null;


        // Validation
        if (!baseName || typeof baseName !== 'string' || baseName.trim() === '') {
            return c.json({ error: 'Item template base_name is required.' }, 400);
        }
        if (rulesText && typeof rulesText !== 'string') {
             return c.json({ error: 'Invalid rules_text format.' }, 400);
        }

        // --- File Validation ---
        const imageValidationError = await validateUploadedFile(imageFile, 'image');
        if (imageValidationError) return c.json({ error: imageValidationError }, 400);

        const soundValidationError = await validateUploadedFile(soundFile, 'audio');
        if (soundValidationError) return c.json({ error: soundValidationError }, 400);
        // --- End File Validation ---

        const insertTemplateStmt = db.prepare(`
            INSERT INTO item_templates (base_name, image_path, sound_path, rules_text)
            VALUES (?, ?, ?, ?) RETURNING id
        `);

        db.exec('BEGIN TRANSACTION');
        try {
            let imagePath: string | null = null;
            let soundPath: string | null = null;

            // Determine final image path: New file takes precedence over existing selection
            if (imageFile) {
                imagePath = await saveUploadedFile(imageFile, IMAGES_DIR);
                if (imagePath) savedFilePaths.push(join('.', imagePath)); // Track for rollback
                else throw new Error('Failed to save new image file.');
            } else if (existingImagePath) {
                imagePath = existingImagePath; // Use selected existing path
            } // else: imagePath remains null

            // Determine final sound path: New file takes precedence over existing selection
             if (soundFile) {
                soundPath = await saveUploadedFile(soundFile, SOUNDS_DIR);
                if (soundPath) savedFilePaths.push(join('.', soundPath)); // Track for rollback
                 else throw new Error('Failed to save new sound file.');
            } else if (existingSoundPath) {
                soundPath = existingSoundPath; // Use selected existing path
            } // else: soundPath remains null


            // Insert template into DB
            const templateResult = insertTemplateStmt.get(
                baseName.trim(),
                imagePath,
                soundPath,
                rulesText?.trim() ?? null
            ) as { id: number } | null;

            if (!templateResult || typeof templateResult.id !== 'number') {
                throw new Error('Failed to insert item template or retrieve ID.');
            }

            db.exec('COMMIT');
            console.log(`Item Template '${baseName}' (ID: ${templateResult.id}) created successfully.`);
            // Return the created template details
            return c.json({
                message: 'Item template created successfully',
                template: {
                    id: templateResult.id,
                    base_name: baseName.trim(),
                    image_path: imagePath,
                    sound_path: soundPath,
                    rules_text: rulesText?.trim() ?? null
                }
             }, 201);

        } catch (error) {
            console.error('Item template creation transaction failed, rolling back:', error);
            db.exec('ROLLBACK');
            // Attempt to delete any files saved during the failed transaction
            console.log('Attempting to delete saved template files due to rollback:', savedFilePaths);
            for (const filePath of savedFilePaths) {
                try { await unlink(filePath); console.log(`Deleted rolled back file: ${filePath}`); }
                catch (unlinkError) { console.error(`Error deleting rolled back file ${filePath}:`, unlinkError); }
            }
            const errorMessage = error instanceof Error ? error.message : String(error);
            return c.json({ error: `Item template creation failed: ${errorMessage}` }, 500);
        }

    } catch (error: any) {
        console.error('Error processing POST /api/item-templates:', error);
        return c.json({ error: 'An unexpected error occurred processing the request.' }, 500);
    }
});

// PUT /api/item-templates/:id - Update an existing item template
itemTemplatesApp.put('/:id', async (c) => {
    const idParam = c.req.param('id');
    const id = parseInt(idParam, 10);
    console.log(`PUT /api/item-templates/${id} requested`);

    if (isNaN(id)) {
        return c.json({ error: 'Invalid item template ID provided.' }, 400);
    }

    const savedFilePaths: string[] = []; // Track NEW files saved for potential rollback
    let oldImagePath: string | null = null;
    let oldSoundPath: string | null = null;

    try {
        // Fetch existing template to get old file paths for deletion
        const selectStmt = db.prepare('SELECT image_path, sound_path FROM item_templates WHERE id = ?');
        const existingTemplate = selectStmt.get(id) as { image_path: string | null, sound_path: string | null } | null;

        if (!existingTemplate) {
            return c.json({ error: 'Item template not found.' }, 404);
        }
        oldImagePath = existingTemplate.image_path;
        oldSoundPath = existingTemplate.sound_path;

        const formData = await c.req.formData();
        const baseName = formData.get('base_name') as string;
        const rulesText = formData.get('rules_text') as string | null; // Can be null to clear rules
        const imageFile = formData.get('image_file') as File | null;
        const soundFile = formData.get('sound_file') as File | null;
        // Get selected existing paths (if provided)
        const existingImagePath = formData.get('existing_image_path') as string | null;
        const existingSoundPath = formData.get('existing_sound_path') as string | null;
        // Flags to indicate if existing files should be cleared
        const clearImage = formData.get('clear_image') === 'true';
        const clearSound = formData.get('clear_sound') === 'true';

        // Validation
        if (!baseName || typeof baseName !== 'string' || baseName.trim() === '') {
            return c.json({ error: 'Item template base_name is required.' }, 400);
        }
        // rulesText can be explicitly null/empty to clear it

        // --- File Validation ---
        const imageValidationError = await validateUploadedFile(imageFile, 'image');
        if (imageValidationError) return c.json({ error: imageValidationError }, 400);

        const soundValidationError = await validateUploadedFile(soundFile, 'audio');
        if (soundValidationError) return c.json({ error: soundValidationError }, 400);
        // --- End File Validation ---


        const updateTemplateStmt = db.prepare(`
            UPDATE item_templates
            SET base_name = ?, image_path = ?, sound_path = ?, rules_text = ?
            WHERE id = ?
        `);

        db.exec('BEGIN TRANSACTION');
        let finalImagePath = oldImagePath;
        let finalSoundPath = oldSoundPath;
        let finalRulesText = rulesText?.trim() ?? null; // Use provided text or null

        try {
            // Determine final image path based on priority: Clear > New File > Existing Path > Keep Old
            if (clearImage) {
                finalImagePath = null;
            } else if (imageFile) {
                const newImagePath = await saveUploadedFile(imageFile, IMAGES_DIR);
                if (newImagePath) { savedFilePaths.push(join('.', newImagePath)); finalImagePath = newImagePath; }
                else { throw new Error('Failed to save new image file.'); }
            } else if (existingImagePath) {
                 finalImagePath = existingImagePath; // Use selected existing path
            } // else: finalImagePath remains oldImagePath (default)

             // Determine final sound path based on priority: Clear > New File > Existing Path > Keep Old
            if (clearSound) {
                finalSoundPath = null;
            } else if (soundFile) {
                const newSoundPath = await saveUploadedFile(soundFile, SOUNDS_DIR);
                 if (newSoundPath) { savedFilePaths.push(join('.', newSoundPath)); finalSoundPath = newSoundPath; }
                 else { throw new Error('Failed to save new sound file.'); }
            } else if (existingSoundPath) {
                finalSoundPath = existingSoundPath; // Use selected existing path
            } // else: finalSoundPath remains oldSoundPath (default)


            // Update DB
            updateTemplateStmt.run(
                baseName.trim(),
                finalImagePath,
                finalSoundPath,
                finalRulesText,
                id
            );

            db.exec('COMMIT');

            // Delete old files AFTER commit succeeds, only if cleared or replaced by a NEW file upload
            // Don't delete if just selecting a different existing path
            if (oldImagePath && (clearImage || (imageFile && oldImagePath !== finalImagePath))) {
                 try { await unlink(join('.', oldImagePath)); console.log(`Deleted old/replaced image: ${oldImagePath}`); }
                 catch(e) { console.error(`Error deleting old/replaced image ${oldImagePath}:`, e); }
            }
             if (oldSoundPath && (clearSound || (soundFile && oldSoundPath !== finalSoundPath))) {
                 try { await unlink(join('.', oldSoundPath)); console.log(`Deleted old/replaced sound: ${oldSoundPath}`); }
                 catch(e) { console.error(`Error deleting old/replaced sound ${oldSoundPath}:`, e); }
            }


            console.log(`Item Template '${baseName}' (ID: ${id}) updated successfully.`);
            return c.json({
                message: 'Item template updated successfully',
                template: { id, base_name: baseName.trim(), image_path: finalImagePath, sound_path: finalSoundPath, rules_text: finalRulesText }
            });

        } catch (error) {
            console.error('Item template update transaction failed, rolling back:', error);
            db.exec('ROLLBACK');
            // Attempt to delete any NEW files saved during the failed transaction
            console.log('Attempting to delete newly saved template files due to rollback:', savedFilePaths);
            for (const filePath of savedFilePaths) {
                try { await unlink(filePath); console.log(`Deleted rolled back file: ${filePath}`); }
                catch (unlinkError) { console.error(`Error deleting rolled back file ${filePath}:`, unlinkError); }
            }
            const errorMessage = error instanceof Error ? error.message : String(error);
            return c.json({ error: `Item template update failed: ${errorMessage}` }, 500);
        }

    } catch (error: any) {
        console.error(`Error processing PUT /api/item-templates/${id}:`, error);
        return c.json({ error: 'An unexpected error occurred processing the request.' }, 500);
    }
});

// DELETE /api/item-templates/:id - Delete an item template
itemTemplatesApp.delete('/:id', async (c) => {
    const idParam = c.req.param('id');
    const id = parseInt(idParam, 10);
    console.log(`DELETE /api/item-templates/${id} requested`);

    if (isNaN(id)) {
        return c.json({ error: 'Invalid item template ID provided.' }, 400);
    }

    try {
        // Fetch existing template to get file paths for potential deletion
        const selectStmt = db.prepare('SELECT base_name, image_path, sound_path FROM item_templates WHERE id = ?');
        const templateToDelete = selectStmt.get(id) as { base_name: string, image_path: string | null, sound_path: string | null } | null;

        if (!templateToDelete) {
            return c.json({ error: 'Item template not found.' }, 404);
        }

        db.exec('BEGIN TRANSACTION');
        try {
            const deleteStmt = db.prepare('DELETE FROM item_templates WHERE id = ?');
            const result = deleteStmt.run(id);

            if (result.changes === 0) {
                // Should not happen if templateToDelete was found, but as a safeguard
                throw new Error('Failed to delete item template from database.');
            }

            db.exec('COMMIT');
            console.log(`Item Template '${templateToDelete.base_name}' (ID: ${id}) deleted successfully from DB.`);

            // After successful DB commit, attempt to delete associated files if they are no longer referenced
            let imageFileDeleted = false;
            let soundFileDeleted = false;

            // Check and delete image file
            if (templateToDelete.image_path) {
                const imagePath = templateToDelete.image_path;
                const isImageUsedByOtherTemplatesStmt = db.prepare('SELECT 1 FROM item_templates WHERE image_path = ? LIMIT 1');
                const isImageUsedByCasesStmt = db.prepare('SELECT 1 FROM cases WHERE image_path = ? LIMIT 1');

                const imageInOtherTemplates = isImageUsedByOtherTemplatesStmt.get(imagePath);
                const imageInCases = isImageUsedByCasesStmt.get(imagePath);

                if (!imageInOtherTemplates && !imageInCases) {
                    try {
                        await unlink(join('.', imagePath)); // Assumes path is relative to project root e.g., 'uploads/images/file.png'
                        imageFileDeleted = true;
                        console.log(`Deleted image file: ${imagePath}`);
                    } catch (e: any) {
                        // ENOENT means file not found, which is fine if it was already deleted or never existed
                        if (e.code !== 'ENOENT') {
                            console.error(`Error deleting image file ${imagePath}:`, e);
                        } else {
                            console.log(`Image file ${imagePath} not found for deletion, possibly already deleted.`);
                        }
                    }
                } else {
                    console.log(`Image file ${imagePath} is still in use by other templates or cases, not deleting.`);
                }
            }

            // Check and delete sound file
            if (templateToDelete.sound_path) {
                const soundPath = templateToDelete.sound_path;
                const isSoundUsedByOtherTemplatesStmt = db.prepare('SELECT 1 FROM item_templates WHERE sound_path = ? LIMIT 1');
                const soundInOtherTemplates = isSoundUsedByOtherTemplatesStmt.get(soundPath);

                if (!soundInOtherTemplates) {
                    try {
                        await unlink(join('.', soundPath)); // Assumes path is relative to project root
                        soundFileDeleted = true;
                        console.log(`Deleted sound file: ${soundPath}`);
                    } catch (e: any) {
                        if (e.code !== 'ENOENT') {
                            console.error(`Error deleting sound file ${soundPath}:`, e);
                        } else {
                            console.log(`Sound file ${soundPath} not found for deletion, possibly already deleted.`);
                        }
                    }
                } else {
                    console.log(`Sound file ${soundPath} is still in use by other templates, not deleting.`);
                }
            }

            return c.json({
                message: `Item template '${templateToDelete.base_name}' deleted successfully.`,
                imageFileDeleted,
                soundFileDeleted
            });

        } catch (dbError) {
            console.error('Item template deletion transaction failed, rolling back:', dbError);
            db.exec('ROLLBACK');
            const errorMessage = dbError instanceof Error ? dbError.message : String(dbError);
            return c.json({ error: `Item template deletion failed: ${errorMessage}` }, 500);
        }

    } catch (error: any) {
        console.error(`Error processing DELETE /api/item-templates/${id}:`, error);
        return c.json({ error: 'An unexpected error occurred processing the request.' }, 500);
    }
});

export default itemTemplatesApp;
