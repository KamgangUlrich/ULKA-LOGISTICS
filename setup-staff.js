
require("dotenv").config();

const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(
    path.join(__dirname, "ulka.db")
);

try {
    db.exec(`
        CREATE TABLE IF NOT EXISTS staff (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL COLLATE NOCASE UNIQUE,
            passwordHash TEXT NOT NULL,
            role TEXT NOT NULL CHECK (
                role IN (
                    'Admin',
                    'Dispatcher',
                    'Warehouse Staff'
                )
            ),
            status TEXT NOT NULL DEFAULT 'Active'
                CHECK (status IN ('Active', 'Inactive')),
            createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    const count = db.prepare(
        "SELECT COUNT(*) AS total FROM staff"
    ).get().total;

    if (count === 0) {
        console.log(
            "No staff accounts exist. Create an account using a secure, authorized setup process."
        );
        process.exitCode = 1;
    } else {
        console.log(
            `Staff table ready. Existing accounts: ${count}. No accounts or passwords changed.`
        );
    }
} catch (error) {
    console.error("Staff setup failed:", error.message);
    process.exitCode = 1;
} finally {
    db.close();
}
