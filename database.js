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

    getAllActiveLoansWithUsers() {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT
                    l.loan_id,
                    l.user_id,
                    l.principal_amount,
                    l.current_balance,
                    l.daily_interest_rate,
                    l.created_at,
                    l.next_payment_due,
                    l.missed_payments,
                    l.is_suspended,
                    l.last_payment_date,
                    u.gold_coins as user_gold_coins
                FROM loans l
                JOIN users u ON l.user_id = u.user_id
                WHERE l.current_balance > 0
                ORDER BY l.current_balance DESC
            `;
            this.db.all(query, [], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows || []);
                }
            });
        });
    }

    updateLoan(loanId, balance, missedPayments, lastPaymentDate = null) {
        return new Promise((resolve, reject) => {
            const nextPaymentDue = new Date();
            nextPaymentDue.setDate(nextPaymentDue.getDate() + 1);
            nextPaymentDue.setHours(4, 0, 0, 0);

            const stmt = `UPDATE loans
                         SET current_balance = ?, missed_payments = ?,
                             last_payment_date = ?, next_payment_due = ?
                         WHERE loan_id = ?`;

            this.db.run(stmt, [balance, missedPayments, lastPaymentDate, nextPaymentDue.toISOString(), loanId], function(err) {
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
                             missed_payments = 0
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

    forgiveUserLoans(userId) {
        return new Promise((resolve, reject) => {
            this.db.run('UPDATE loans SET current_balance = 0 WHERE user_id = ? AND current_balance > 0', [userId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    forgiveLoanById(loanId) {
        return new Promise((resolve, reject) => {
            this.db.run('UPDATE loans SET current_balance = 0 WHERE loan_id = ?', [loanId], function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({ changes: this.changes });
                }
            });
        });
    }

    // Atomic transaction to create loan and update user's gold coins
    createLoanTransaction(userId, amount, dailyRate = 0.0005) {
        return new Promise((resolve, reject) => {
            const db = this.db; // Store reference to avoid 'this' context issues

            db.serialize(() => {
                db.run('BEGIN TRANSACTION');

                const nextPaymentDue = new Date();
                nextPaymentDue.setDate(nextPaymentDue.getDate() + 1);
                nextPaymentDue.setHours(4, 0, 0, 0); // 4 AM UTC = Midnight EST

                // First, create the loan
                const loanStmt = `INSERT INTO loans
                                 (user_id, principal_amount, current_balance, daily_interest_rate, next_payment_due)
                                 VALUES (?, ?, ?, ?, ?)`;

                db.run(loanStmt, [userId, amount, amount, dailyRate, nextPaymentDue.toISOString()], function(loanErr) {
                    if (loanErr) {
                        db.run('ROLLBACK');
                        reject(loanErr);
                        return;
                    }

                    const loanId = this.lastID;

                    // Then update the user's gold coins
                    const userStmt = 'UPDATE users SET gold_coins = gold_coins + ?, last_active = CURRENT_TIMESTAMP WHERE user_id = ?';
                    db.run(userStmt, [amount, userId], function(userErr) {
                        if (userErr) {
                            db.run('ROLLBACK');
                            reject(userErr);
                            return;
                        }

                        // Commit the transaction
                        db.run('COMMIT', (commitErr) => {
                            if (commitErr) {
                                db.run('ROLLBACK');
                                reject(commitErr);
                            } else {
                                resolve({
                                    loan_id: loanId,
                                    principal_amount: amount,
                                    current_balance: amount
                                });
                            }
                        });
                    });
                });
            });
        });
    }

}

module.exports = Database;