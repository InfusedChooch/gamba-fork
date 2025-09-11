const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
    constructor() {
        this.db = new sqlite3.Database(path.join(__dirname, 'gamba.db'));
        this.init();
    }

    init() {
        const createUsersTable = `
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                gold_coins INTEGER DEFAULT 1000,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_active DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;

        this.db.run(createUsersTable, (err) => {
            if (err) {
                console.error('Error creating users table:', err);
            } else {
                console.log('Database initialized successfully');
            }
        });
    }

    getUser(userId) {
        return new Promise((resolve, reject) => {
            this.db.get('SELECT * FROM users WHERE user_id = ?', [userId], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    createUser(userId) {
        return new Promise((resolve, reject) => {
            const stmt = 'INSERT OR IGNORE INTO users (user_id) VALUES (?)';
            this.db.run(stmt, [userId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ user_id: userId, gold_coins: 1000 });
                }
            });
        });
    }

    updateGoldCoins(userId, amount) {
        return new Promise((resolve, reject) => {
            const stmt = 'UPDATE users SET gold_coins = ?, last_active = CURRENT_TIMESTAMP WHERE user_id = ?';
            this.db.run(stmt, [amount, userId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    addGoldCoins(userId, amount) {
        return new Promise((resolve, reject) => {
            const stmt = 'UPDATE users SET gold_coins = gold_coins + ?, last_active = CURRENT_TIMESTAMP WHERE user_id = ?';
            this.db.run(stmt, [amount, userId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }
}

module.exports = Database;