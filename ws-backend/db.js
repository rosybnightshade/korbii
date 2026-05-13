import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const rawUrl = process.env.DATABASE_URL;

// Create pool with SSL verification disabled
const pool = new pg.Pool({
    connectionString: rawUrl,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
});

pool.on("error", (err) => {
    console.error(
        "Unexpected idle client error in PG pool:",
        err && err.stack ? err.stack : err,
    );
});

// Test connection
(async () => {
    try {
        const client = await pool.connect();
        try {
            const res = await client.query("SELECT NOW()");
            console.log(
                "Database reached, now():",
                res && res.rows && res.rows[0],
            );
        } finally {
            client.release();
        }
    } catch (err) {
        console.error(
            "Database connection test failed:",
            err && err.stack ? err.stack : err,
        );
    }
})();

const adapter = new PrismaPg(pool);

let prisma;
try {
    prisma = new PrismaClient({ adapter });
    prisma
        .$connect()
        .then(() => console.log("Prisma client connected"))
        .catch((err) =>
            console.error(
                "Prisma $connect failed:",
                err && err.stack ? err.stack : err,
            ),
        );
} catch (e) {
    console.error(
        "PrismaClient initialization threw an error:",
        e && e.stack ? e.stack : e,
    );
    throw e;
}

process.on("unhandledRejection", (reason) => {
    console.error("Unhandled Rejection at:", reason);
});
process.on("uncaughtException", (err) => {
    console.error(
        "Uncaught Exception thrown:",
        err && err.stack ? err.stack : err,
    );
});

export default prisma;
