import { unlink } from 'node:fs/promises'; // For deleting files on rollback
import { join, extname } from 'node:path'; // For path manipulation
import { randomUUID } from 'node:crypto'; // For unique filenames
import { parseBlob } from 'music-metadata-browser'; // For reading audio duration
import type { HonoRequest } from 'hono'; // Use type-only import
import sharp from 'sharp'; // Import sharp for image processing
import {
    IMAGES_DIR, // Need this for constructing the correct path
    ALLOWED_IMAGE_TYPES,
    MAX_IMAGE_SIZE_BYTES,
    ALLOWED_AUDIO_TYPES
} from './constants'; // Import necessary constants

// Define expected structure for items within the form data (JSON string)
export interface CaseItemLinkData {
    item_template_id: number;
    override_name?: string | null;
    percentage_chance: number; // Changed from color
    display_color: string;     // Added display color
    override_rules_text?: string | null; // Added for rules override
    showPercentageInOpener?: boolean; // <<< NEW FIELD (optional for frontend, backend will default)
}

// Helper function to save uploaded file, now with image processing
export async function saveUploadedFile(file: File, targetDir: string): Promise<string | null> {
    console.log(`[saveUploadedFile] Received file: ${file.name}, Size: ${file.size}, Type: ${file.type}`);
    if (!file || file.size === 0) {
        console.log(`[saveUploadedFile] Skipping empty file: ${file.name}`);
        return null;
    }

    const isImage = file.type.startsWith('image/');
    const uniqueSuffix = randomUUID();
    let filename: string;
    let savePath: string = ''; // Initialize to empty string
    let relativePath: string;

    try {
        if (isImage && targetDir === IMAGES_DIR) {
            // --- Image Processing Logic ---
            console.log(`[saveUploadedFile] Processing image: ${file.name}, Type: ${file.type}`);
            const buffer = await file.arrayBuffer();
            let sharpInstance;
            let isAnimated = false;
            let processedBuffer: Buffer;

            // Load animated GIFs specifically telling sharp to load all frames
            if (file.type === 'image/gif') {
                console.log(`[saveUploadedFile] Loading as animated GIF.`);
                sharpInstance = sharp(buffer, { animated: true });
                // We can check metadata to confirm, though loading with animated:true is key
                const metadata = await sharpInstance.metadata();
                // Ensure isAnimated is always boolean, even if metadata.pages is undefined
                isAnimated = !!(metadata.pages && metadata.pages > 1);
                if (!isAnimated) {
                    console.warn(`[saveUploadedFile] Input was image/gif but sharp metadata indicates not animated? Proceeding as static.`);
                }
            } else {
                // Load other image types normally
                sharpInstance = sharp(buffer);
            }

            if (isAnimated) {
                console.log(`[saveUploadedFile] Converting animated GIF to infinitely looping animated WebP (no resize).`);
                // Convert animated GIF to animated WebP, skip resize, set infinite loop
                processedBuffer = await sharpInstance
                    .webp({ quality: 80, loop: 0 }) // loop: 0 should mean infinite loop
                    .toBuffer();
            } else {
                console.log(`[saveUploadedFile] Resizing and converting static image to static WebP.`);
                // Resize and convert static images to static WebP
                processedBuffer = await sharpInstance
                    .resize({
                        width: 512,
                        height: 512,
                        fit: 'inside',
                        withoutEnlargement: true
                    })
                    .webp({ quality: 80 })
                    .toBuffer();
            }

            filename = `${uniqueSuffix}.webp`; // Always save as .webp
            savePath = join(targetDir, filename);
            console.log(`[saveUploadedFile] Attempting to save processed ${isAnimated ? 'animated' : 'static'} WebP image to: ${savePath}`);

            await Bun.write(savePath, processedBuffer); // Save the processed buffer

            console.log(`[saveUploadedFile] Successfully wrote processed ${isAnimated ? 'animated' : 'static'} WebP image: ${savePath}`);
            // Construct relative path using the new .webp filename
            relativePath = `/${targetDir.replace(/\\/g, '/')}/${filename}`;

        } else {
            // --- Original Logic for Non-Image Files (or images not going to IMAGES_DIR) ---
            console.log(`[saveUploadedFile] Saving non-image file or image to non-standard dir: ${file.name}`);
            const extension = extname(file.name) || '';
            const originalNameWithoutExt = file.name.substring(0, file.name.length - extension.length);
            const sanitizedOriginalName = originalNameWithoutExt.replace(/[^a-zA-Z0-9_.-]/g, '_');
            filename = `${uniqueSuffix}-${sanitizedOriginalName}${extension}`;
            savePath = join(targetDir, filename);
            console.log(`[saveUploadedFile] Attempting to save original file to: ${savePath}`);

            await Bun.write(savePath, file); // Save the original file

            console.log(`[saveUploadedFile] Successfully wrote original file: ${savePath}`);
            relativePath = `/${targetDir.replace(/\\/g, '/')}/${filename}`;
        }

        console.log(`[saveUploadedFile] Returning relative path: ${relativePath}`);
        return relativePath;

    } catch (error) {
        console.error(`[saveUploadedFile] Error processing/saving file ${file.name} to ${targetDir}:`, error);
        // Attempt to clean up partially saved file if savePath is defined
        if (savePath) {
            try {
                await unlink(savePath);
                console.log(`[saveUploadedFile] Cleaned up partially saved file: ${savePath}`);
            } catch (cleanupError) {
                console.error(`[saveUploadedFile] Error cleaning up file ${savePath}:`, cleanupError);
            }
        }
        throw new Error(`Failed to process/save file: ${file.name}`); // Re-throw to trigger rollback
    }
}

// Helper function to validate CaseItemLinkData array
export const validateCaseItems = (items: any[], req: HonoRequest): string | null => {
    if (!Array.isArray(items) || items.length === 0) {
        return 'Items must be a non-empty array.';
    }

    for (const item of items) {
        if (item.item_template_id === undefined || item.item_template_id === null || typeof item.item_template_id !== 'number') {
            return `Invalid or missing item_template_id for item. Must be a number.`;
        }
        if (item.percentage_chance === undefined || item.percentage_chance === null || typeof item.percentage_chance !== 'number' || item.percentage_chance < 0) {
            return `Each item must have a valid, non-negative percentage_chance. Failed item template ID: ${item.item_template_id}`;
        }
        if (!item.display_color || typeof item.display_color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(item.display_color)) {
             return `Each item must have a valid hex color code (e.g., #RRGGBB) for display_color. Failed item template ID: ${item.item_template_id}`;
        }
        if (item.override_name && typeof item.override_name !== 'string') {
            return `Invalid override_name format for item template ID: ${item.item_template_id}. Must be a string or null.`;
        }
        // Validation for showPercentageInOpener is not strictly needed here as backend defaults it if missing.
        // If present, it should be boolean, but the backend handles conversion from 0/1.
    }

    return null; // Validation passed
};

// Helper function for file validation (extracted logic)
export async function validateUploadedFile(file: File | null, type: 'image' | 'audio'): Promise<string | null> {
    if (!file) return null; // No file, no error

    if (type === 'image') {
        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            return `Invalid image file type. Allowed types: ${ALLOWED_IMAGE_TYPES.join(', ')}`;
        }
        if (file.size > MAX_IMAGE_SIZE_BYTES) {
            return `Image file size exceeds the limit of ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB.`;
        }
    } else if (type === 'audio') {
        if (!ALLOWED_AUDIO_TYPES.includes(file.type)) {
            return `Invalid audio file type. Allowed types: ${ALLOWED_AUDIO_TYPES.join(', ')}`;
        }
        try {
            console.log(`Attempting to parse metadata for audio file: ${file.name}, type: ${file.type}`);
            const metadata = await parseBlob(file);
            console.log(`Successfully parsed metadata. Duration: ${metadata.format.duration ?? 'N/A'}`);
        } catch (metaError: any) {
            console.warn(`Could not read metadata from audio file ${file.name}. Allowing upload anyway. Error: ${metaError.message || 'Unknown metadata error'}`);
        }
    }
    return null; // Validation passed
}
