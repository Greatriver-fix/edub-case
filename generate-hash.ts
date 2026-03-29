import bcrypt from 'bcrypt';

const plainPassword = process.argv[2] || process.env.ADMIN_PASSWORD;
const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS || 10);

if (!plainPassword) {
  console.error('Provide a password via `bun run generate-hash.ts "<password>"` or the `ADMIN_PASSWORD` environment variable.');
  process.exit(1);
}

if (!Number.isInteger(saltRounds) || saltRounds < 4) {
  console.error('BCRYPT_SALT_ROUNDS must be an integer greater than or equal to 4.');
  process.exit(1);
}

async function generateHash() {
  console.log(`Generating bcrypt hash with ${saltRounds} salt rounds...`);
  try {
    const hash = await bcrypt.hash(plainPassword, saltRounds);
    console.log("\n--- HASH GENERATED ---");
    console.log(`BCrypt Hash (salt=${saltRounds}): ${hash}`);
    console.log(`ADMIN_PASSWORD_HASH=${hash}`);
    console.log("----------------------\n");
    console.log("ACTION REQUIRED:");
    console.log("1. Copy the `ADMIN_PASSWORD_HASH=...` line above.");
    console.log("2. Put it in your `.env`, deployment environment, or process manager config.");
    console.log("3. Restart the backend after updating the environment.");
  } catch (err) {
    console.error("\n--- ERROR ---");
    console.error("Error generating hash:", err);
    console.error("-------------");
  }
}

generateHash();
