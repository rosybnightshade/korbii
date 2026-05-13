import "dotenv/config";
import fs from "fs/promises";
import path from "path";

const root = process.cwd();
const filesToCheck = [
    "prisma/schema.prisma",
    "prisma.config.ts",
    "db.js",
    "index.js",
    "routes/users.js",
    "routes/socket.js",
    "routes/messages.js",
];

let failed = false;

async function exists(p) {
    try {
        await fs.access(path.resolve(root, p));
        return true;
    } catch (e) {
        return false;
    }
}

console.log("Running simple project tests");
for (const f of filesToCheck) {
    const ok = await exists(f);
    if (ok) {
        console.log("OK ", f);
    } else {
        console.error("MISSING", f);
        failed = true;
    }
}

// check .env and DATABASE_URL
const envPath = path.resolve(root, ".env");
let envText = "";
try {
    envText = await fs.readFile(envPath, "utf8");
    console.log("Found .env");
} catch (e) {
    console.error(".env not found in project root");
    failed = true;
}

if (envText) {
    if (envText.includes("DATABASE_URL=")) {
        console.log("DATABASE_URL present in .env");
    } else if (process.env.DATABASE_URL) {
        console.log("DATABASE_URL present in environment");
    } else {
        console.error("DATABASE_URL not set in .env or environment");
        failed = true;
    }
}

if (failed) {
    console.error("\nSome checks failed. See messages above.");
    process.exit(1);
}

console.log("\nAll basic checks passed.");
process.exit(0);
