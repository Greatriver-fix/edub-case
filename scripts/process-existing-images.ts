import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import sharp from 'sharp';
import { Database } from 'bun:sqlite';
import { IMAGES_DIR } from '../server/constants'; // Adjust path relative to script location

const DB_PATH = join(__dirname, '..', 'database.sqlite'); // Path to DB relative to script
const FULL_IMAGES_DIR = join(__dirname, '..', IMAGES_DIR); // Absolute path to images dir

const NON_WEBP_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif'];

async function processExistingImages() {
    console.log('Starting processing of existing images...');
    let db: Database | null = null; // Initialize db variable
    let processedCount = 0;
    let dbUpdateCount = 0;
    let errorCount = 0;

    try {
        db = new Database(DB_PATH);
        console.log(`Connected to database: ${DB_PATH}`);

        // Prepare update statements
        const updateTemplateStmt = db.prepare('UPDATE item_templates SET image_path = ? WHERE image_path = ?');
        const updateCaseStmt = db.prepare('UPDATE cases SET image_path = ? WHERE image_path = ?');

        console.log(`Scanning directory: ${FULL_IMAGES_DIR}`);
        const files = await readdir(FULL_IMAGES_DIR);
        console.log(`Found ${files.length} files/directories.`);

        for (const filename of files) {
            const originalExt = extname(filename).toLowerCase();

            // Skip if not a target image type or already webp
            if (!NON_WEBP_IMAGE_EXTENSIONS.includes(originalExt)) {
                // console.log(`Skipping non-target file or already WebP: ${filename}`);
                continue;
            }

            const originalFullPath = join(FULL_IMAGES_DIR, filename);
            // Relative path as stored in DB (e.g., /uploads/images/image.jpg)
            const originalRelativePath = `/${IMAGES_DIR.replace(/\\/g, '/')}/${filename}`;

            const baseName = basename(filename, originalExt);
            const newFilename = `${baseName}.webp`;
            const newFullPath = join(FULL_IMAGES_DIR, newFilename);
            const newRelativePath = `/${IMAGES_DIR.replace(/\\/g, '/')}/${newFilename}`;

            console.log(`\nProcessing: ${filename}`);
            console.log(`  Original Relative Path: ${originalRelativePath}`);
            console.log(`  New Relative Path: ${newRelativePath}`);

            try {
                const buffer = await readFile(originalFullPath);
                const sharpInstance = sharp(buffer);
                const metadata = await sharpInstance.metadata();
                const isAnimated = metadata.pages && metadata.pages > 1;

                let processedBuffer: Buffer;

                if (isAnimated) {
                    console.log(`  Type: Animated GIF`);
                    // Convert animated GIF to animated WebP (no resize)
                    processedBuffer = await sharpInstance
                        .webp({ quality: 80 }) // Sharp handles animation automatically
                        .toBuffer();
                    console.log(`  Converted to animated WebP.`);
                } else {
                    console.log(`  Type: Static Image`);
                    // Resize static image and convert to static WebP
                    processedBuffer = await sharpInstance
                        .resize({
                            width: 512,
                            height: 512,
                            fit: 'inside',
                            withoutEnlargement: true
                        })
                        .webp({ quality: 80 })
                        .toBuffer();
                    console.log(`  Resized and converted to static WebP.`);
                }

                // Save the new WebP file
                await writeFile(newFullPath, processedBuffer);
                console.log(`  Saved new file: ${newFullPath}`);
                processedCount++;

                // Update database references
                console.log(`  Updating database entries...`);
                const templateInfo = updateTemplateStmt.run(newRelativePath, originalRelativePath);
                const caseInfo = updateCaseStmt.run(newRelativePath, originalRelativePath);
                const updates = (templateInfo.changes ?? 0) + (caseInfo.changes ?? 0);
                dbUpdateCount += updates;
                console.log(`  Updated ${updates} database entries.`);

                // DO NOT delete original file as requested

            } catch (fileProcessingError) {
                console.error(`  Error processing file ${filename}:`, fileProcessingError);
                errorCount++;
            }
        } // End loop

    } catch (error) {
        console.error('A critical error occurred during the script:', error);
        errorCount++; // Count critical errors too
    } finally {
        if (db) {
            db.close();
            console.log('\nDatabase connection closed.');
        }
    }

    console.log('\n--- Processing Summary ---');
    console.log(`Successfully processed images: ${processedCount}`);
    console.log(`Total database entries updated: ${dbUpdateCount}`);
    console.log(`Errors encountered: ${errorCount}`);
    console.log('--------------------------');
}

processExistingImages();
