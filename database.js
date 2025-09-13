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

        const createLoansTable = `
            CREATE TABLE IF NOT EXISTS loans (
                loan_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                principal_amount INTEGER NOT NULL,
                current_balance REAL NOT NULL,
                daily_interest_rate REAL DEFAULT 0.0005,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                next_payment_due DATETIME NOT NULL,
                missed_payments INTEGER DEFAULT 0,
                is_suspended BOOLEAN DEFAULT 0,
                last_payment_date DATETIME DEFAULT NULL,
                FOREIGN KEY (user_id) REFERENCES users (user_id)
            )
        `;

        this.db.run(createUsersTable, (err) => {
            if (err) {
                console.error('Error creating users table:', err);
            } else {
                console.log('Users table initialized successfully');
            }
        });

        this.db.run(createLoansTable, (err) => {
            if (err) {
                console.error('Error creating loans table:', err);
            } else {
                console.log('Loans table initialized successfully');
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

    createLoan(userId, amount, dailyRate = 0.0005) {
        return new Promise((resolve, reject) => {
            const nextPaymentDue = new Date();
            nextPaymentDue.setDate(nextPaymentDue.getDate() + 1);
            nextPaymentDue.setHours(4, 0, 0, 0); // 4 AM UTC = Midnight EST
            
            const stmt = `INSERT INTO loans 
                         (user_id, principal_amount, current_balance, daily_interest_rate, next_payment_due) 
                         VALUES (?, ?, ?, ?, ?)`;
            
            this.db.run(stmt, [userId, amount, amount, dailyRate, nextPaymentDue.toISOString()], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ loan_id: this.lastID, principal_amount: amount, current_balance: amount });
                }
            });
        });
    }

    getUserLoans(userId) {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM loans WHERE user_id = ? AND current_balance > 0', [userId], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    getAllActiveLoans() {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM loans WHERE current_balance > 0', [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    updateLoan(loanId, balance, missedPayments, isSuspended, lastPaymentDate = null) {
        return new Promise((resolve, reject) => {
            const nextPaymentDue = new Date();
            nextPaymentDue.setDate(nextPaymentDue.getDate() + 1);
            nextPaymentDue.setHours(4, 0, 0, 0);
            
            const stmt = `UPDATE loans 
                         SET current_balance = ?, missed_payments = ?, is_suspended = ?, 
                             last_payment_date = ?, next_payment_due = ?
                         WHERE loan_id = ?`;
            
            this.db.run(stmt, [balance, missedPayments, isSuspended ? 1 : 0, lastPaymentDate, nextPaymentDue.toISOString(), loanId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    recordLoanPayment(loanId, paymentAmount, newBalance) {
        return new Promise((resolve, reject) => {
            const now = new Date().toISOString();
            const nextPaymentDue = new Date();
            nextPaymentDue.setDate(nextPaymentDue.getDate() + 1);
            nextPaymentDue.setHours(4, 0, 0, 0);
            
            const stmt = `UPDATE loans 
                         SET current_balance = ?, last_payment_date = ?, next_payment_due = ?, 
                             missed_payments = 0, is_suspended = 0
                         WHERE loan_id = ?`;
            
            this.db.run(stmt, [newBalance, now, nextPaymentDue.toISOString(), loanId], function(err) {
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