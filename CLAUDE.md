# Claude Code Project Context

## Project Overview
**Gamba Bot** - A Discord bot that manages a virtual Gold Coin gambling system for server members.

## Project Details
- **Language**: Node.js (JavaScript)
- **Framework**: Discord.js v14
- **Database**: SQLite3 (local gamba.db file)
- **Repository**: https://github.com/RyanCGit/gamba-bot
- **Deployed on**: Railway.app (cloud hosting)

## Features Implemented
- Virtual Gold Coin currency system
- Role-based permissions (Gamba Bot Member & Gamba Bot Admin)
- Roll gambling game (1-25 number range)
- SQLite database for persistent user data
- All members start with 1000 Gold Coins
- Rich embed messages with goblin-themed responses
- Admin commands for managing user balances

## Commands Available
### Member Commands (requires "Gamba Bot Member" role):
- `!balance` - Check current Gold Coins
- `!roll <amount>` - Roll dice game, bet specified amount
- `!help` - Show available commands

### Admin Commands (requires "Gamba Bot Admin" role):
- `!give @user <amount>` - Add Gold Coins to user's vault
- `!setgold @user <amount>` - Set user's exact Gold Coin balance

## Game Rules
- Both player and bot roll numbers between 1-25
- Higher number wins
- Win: Get double your bet amount back
- Lose: Lose your bet amount
- Minimum bet: 1 Gold Coin
- Maximum bet: Current balance

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
├── bot.js              # Main bot file with all commands and logic
├── database.js         # Database management (SQLite operations)
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
- Successfully deployed to Railway.app cloud hosting
- Resolved Discord token authentication issues on Railway
- Added debugging logs for Railway environment variables

### 5. Files Modified
- `README.md` - Added Discord OAuth2 permissions section
- `bot.js` - Added error handling and debugging logs
- `.gitignore` - Created to exclude sensitive files
- Git configuration set up with user: RyanCGit, email: ryancarney9@gmail.com

## Environment Variables Required
- `DISCORD_TOKEN` - Bot token from Discord Developer Portal
- `CLIENT_ID` - Bot application ID (optional)

## Deployment Notes
- **Platform**: Railway.app (free tier)
- **Auto-deploy**: Connected to GitHub repository
- **Database**: SQLite file persists in Railway deployment
- **Status**: Successfully deployed and running 24/7

## Known Issues Resolved
1. ✅ Discord API "message_reference unknown message" errors - Fixed with safeReply()
2. ✅ Railway deployment TokenInvalid errors - Resolved through proper environment variable configuration
3. ✅ Bot permissions documentation missing - Added to README.md

## Future Considerations Discussed
- Alternative hosting platforms (Render, fly.io, Koyeb) for better free tiers
- Railway free tier limitations and potential migration options

## Development Environment
- **Working Directory**: C:\Users\ryanc\VS Code Projects\gamba-bot
- **Platform**: Windows (win32)
- **Git Repository**: Initialized and connected to GitHub
- **IDE**: VS Code with Claude Code extension

## Security Notes
- .env files excluded from git commits
- Database file (gamba.db) excluded from repository
- Bot token secured in Railway environment variables
- No hardcoded sensitive information in codebase

## Testing Status
- ✅ Local development tested and working
- ✅ Railway deployment tested and working
- ✅ Discord bot commands functional
- ✅ Error handling tested and working
- ✅ Database operations confirmed working

## Project Maintainer
- GitHub: RyanCGit
- Email: ryancarney9@gmail.com

---

**Note**: This file should be updated whenever significant changes are made to the project. It serves as a comprehensive reference for future Claude Code sessions.