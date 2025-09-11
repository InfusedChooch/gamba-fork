# Gamba Bot

A Discord bot that manages a virtual Gold Coin gambling system for your server members.

## Features

- Virtual Gold Coin currency system
- Role-based permissions (Gamba Bot Member & Gamba Bot Admin)
- Roll gambling game (1-25 number range)
- SQLite database for persistent user data
- All members start with 1000 Gold Coins

## Setup Instructions

### 1. Discord Bot Creation
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to the "Bot" section and create a bot
4. Copy the bot token
5. Enable "Message Content Intent" in the bot settings

### 2. Bot Permissions & Server Setup

#### Discord OAuth2 Permissions Required:
When generating the bot invite link in the Discord Developer Portal OAuth2 section:

**Text Permissions:**
- ✅ Send Messages
- ✅ Embed Links
- ✅ Read Message History

**General Permissions:**
- ✅ View Channels

**Permission Integer: 84992**

#### Server Setup:
1. Invite the bot to your server using the OAuth2 URL with the permissions above
2. Create two roles in your Discord server:
   - `Gamba Bot Member` - Can use bot commands
   - `Gamba Bot Admin` - Can use admin commands (give/setgold)

### 3. Installation
1. Clone or download this project
2. Run `npm install` to install dependencies
3. Copy `.env.example` to `.env`
4. Fill in your bot token in the `.env` file:
   ```
   DISCORD_TOKEN=your_bot_token_here
   CLIENT_ID=your_bot_client_id_here
   ```
5. Run `npm start` to start the bot

## Commands

### For Members (requires "Gamba Bot Member" role):

- `!balance` - Check your current Gold Coins
- `!roll <amount>` - Roll dice game, bet specified amount
  - Both you and the bot roll 1-25
  - Higher number wins
  - Win: Get double your bet
  - Lose: Lose your bet amount

## Game Rules

### Roll Game
- Both player and bot roll numbers between 1-25
- Higher number wins
- If you win: You get double your bet amount
- If you lose: You lose your bet amount
- Minimum bet: 1 Gold Coin
- Maximum bet: Your current balance

## Database

The bot uses SQLite to store user data locally in `gamba.db`. Each user starts with 1000 Gold Coins when they first use the bot.

## Requirements

- Node.js 16.0 or higher
- Discord.js v14
- SQLite3

## File Structure

```
gamba-bot/
├── bot.js          # Main bot file
├── database.js     # Database management
├── package.json    # Dependencies
├── .env.example    # Environment template
└── README.md       # This file
```