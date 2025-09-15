# Claude Code Project Context

## Project Overview
**Gamba Bot** - A Discord bot that manages a virtual Gold Coin gambling system for server members.

## Project Details
- **Language**: Node.js (JavaScript)
- **Framework**: Discord.js v14
- **Database**: SQLite3 (local gamba.db file)  
- **Repository**: https://github.com/RyanCGit/gamba-bot

## Features Implemented
- Virtual Gold Coin currency system
- Role-based permissions (Gamba Bot Member & Gamba Bot Admin)
- Roll gambling game (1-100 number range)
- **Gold Coin loan system with 18% APR and automated daily payments**
- SQLite database for persistent user data
- All members start with 1000 Gold Coins
- Rich embed messages with goblin-themed responses
- Admin commands for managing user balances
- **Automated daily interest calculation and payment collection**

## Commands Available
### Member Commands (requires "Gamba Bot Member" role):
- `!balance` - Check current Gold Coins
- `!roll <amount>` - Roll dice game, bet specified amount
- **`!loan <amount>` - Request a loan with 18% APR (0.05% daily interest)**
- **`!loanstatus` - Check outstanding debts and payment schedules**
- **`!payloan <amount>` - Make manual payments toward loan balance**
- `!help` - Show available commands

### Admin Commands (requires "Gamba Bot Admin" role):
- `!give @user <amount>` - Add Gold Coins to user's vault
- `!setgold @user <amount>` - Set user's exact Gold Coin balance

## Game Rules
- Both player and bot roll numbers between 1-100
- Higher number wins
- Win: Get double your bet amount back
- Lose: Lose your bet amount
- Minimum bet: 1 Gold Coin
- Maximum bet: Current balance

## Loan System Rules
- **Interest Rate**: 18% APR (0.05% daily interest)
- **Collateral Required**: 10% of loan amount in existing balance
- **Loan Limit**: One active loan per user
- **Daily Payments**: Automatically collected at midnight EST (4 AM UTC)
- **Minimum Payment**: 3% of balance or 25 Gold Coins (whichever is higher)
- **Late Fee**: 50 Gold Coins per missed payment
- **Interest Compounding**: Continues during missed payment periods

## Required Discord Bot Permissions
### OAuth2 General Permissions (Permission Integer: 84992):
- ✅ Send Messages
- ✅ Embed Links
- ✅ Read Message History
- ✅ View Channels

### Gateway Intents Required:
- Message Content Intent (enabled in Discord Developer Portal)
- Server Members Intent
- Guilds Intent

## File Structure
```
gamba-bot/
├── bot.js              # Main bot file with all commands, loan logic, and daily scheduler
├── database.js         # Database management (SQLite operations + loan system)
├── package.json        # Dependencies and scripts
├── package-lock.json   # Dependency lock file
├── .env.example        # Environment variables template
├── .gitignore          # Git ignore rules
├── README.md           # Project documentation
├── gamba.db           # SQLite database (auto-created)
└── CLAUDE.md          # This context file
```

## Work Done with Claude Code

### 1. Initial Setup and Understanding
- Analyzed existing bot code and structure
- Reviewed Discord bot permissions and requirements
- Examined database schema and game logic

### 2. Documentation Updates
- Added detailed Discord OAuth2 permissions to README.md
- Specified exact permissions needed (84992 permission integer)
- Clarified bot setup process with Railway deployment steps

### 3. Bug Fixes Implemented
- **Fixed Discord API Error**: Bot was crashing with "Unknown message" errors
  - Added `safeReply()` helper function for error handling
  - Wrapped all message replies with try-catch blocks
  - Added fallback to send to channel if reply fails
  - Added comprehensive error handling to messageCreate event
  - Location: `bot.js:178-191` (safeReply function)

### 4. Deployment Process
- Set up Git repository and GitHub integration
- Configured .gitignore for sensitive files

### 5. Gold Coin Loan System Implementation
- **Database Schema**: Added `loans` table with comprehensive loan tracking
  - Loan ID, user ID, principal amount, current balance
  - Daily interest rate (0.05%), payment schedules, missed payment tracking
  - Payment history timestamps
  - Location: `database.js:20-34` (loans table schema)
- **Loan Commands**: Implemented complete loan management system
  - `!loan <amount>` - Request loans with risk assessment and collateral requirements
  - `!loanstatus` - View outstanding debts and payment schedules
  - `!payloan <amount>` - Make manual payments with automatic balance updates
  - Location: `bot.js:549-712` (loan command handlers)
- **Daily Processing**: Automated interest calculation and payment collection
  - Runs daily at midnight EST (4 AM UTC) with sophisticated scheduling
  - Processes interest compounding, minimum payment calculations
  - Handles insufficient funds with late fees
  - Location: `bot.js:284-363` (daily loan processing functions)
- **Goblin Messaging**: Extended themed messaging system for all loan interactions
  - Loan approval/denial messages and payment confirmations
  - Location: `bot.js:157-231` (loan message pools)

### 6. Bug Fix: Phantom Loan Creation Issue
- **Problem**: Users could request loans without sufficient collateral, receive denial messages, but still have phantom loan records created in the database
- **Root Cause**: Race condition between loan creation and gold coin updates - if an exception occurred after loan creation but before coin distribution, users would have loans without receiving coins
- **Solution**: Implemented atomic database transactions using `createLoanTransaction()` method
  - All loan creation and gold coin updates now happen in a single database transaction
  - If any part fails, the entire transaction is rolled back
  - Added comprehensive error handling with user-friendly error messages
  - Location: `database.js:216-265` (new createLoanTransaction method), `bot.js:839-862` (updated loan command)

### 7. Files Modified
- `README.md` - Added Discord OAuth2 permissions section
- `bot.js` - Added error handling, debugging logs, comprehensive loan system, and phantom loan bug fix
- `database.js` - Added loan management methods, database schema, and atomic transaction support
- `CLAUDE.md` - Updated with loan system documentation and bug fix details
- `.gitignore` - Created to exclude sensitive files
- Git configuration set up with user: RyanCGit, email: ryancarney9@gmail.com

## Environment Variables Required
- `DISCORD_TOKEN` - Bot token from Discord Developer Portal
- `CLIENT_ID` - Bot application ID (optional)

## Deployment Notes
- **Database**: SQLite file (gamba.db) stores all user and loan data locally

## Known Issues Resolved
1. ✅ Discord API "message_reference unknown message" errors - Fixed with safeReply()
2. ✅ Bot permissions documentation missing - Added to README.md
3. ✅ Loan system integration - Successfully implemented with automated daily processing
4. ✅ Database schema expansion - Added loans table without breaking existing functionality
5. ✅ Payment amount display bug - Fixed string replacement in loan payoff messages
6. ✅ Phantom loan creation bug - Fixed atomic transaction handling for loan creation

## Future Considerations Discussed
- Alternative hosting platforms (Render, fly.io, Koyeb) as needed

## Development Environment
- **Working Directory**: C:\Users\ryanc\VS Code Projects\gamba-bot
- **Platform**: Windows (win32)
- **Git Repository**: Initialized and connected to GitHub
- **IDE**: VS Code with Claude Code extension

## Security Notes
- .env files excluded from git commits
- Database file (gamba.db) excluded from repository
- Bot token stored securely in environment variables
- No hardcoded sensitive information in codebase

## Testing Status
- ✅ Local development tested and working
- ✅ Discord bot commands functional
- ✅ Error handling tested and working
- ✅ Database operations confirmed working
- ✅ Loan system database schema validated
- ✅ Loan command syntax and logic verified
- ✅ Daily scheduler implementation tested
- ✅ JavaScript syntax validation passed for all loan features
- ✅ Payment amount display fix verified

## Project Maintainer
- GitHub: RyanCGit
- Email: ryancarney9@gmail.com

---

**Note**: This file should be updated whenever significant changes are made to the project. It serves as a comprehensive reference for future Claude Code sessions.