require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const Database = require('./database');
const fs = require('fs');
const path = require('path');

// Process lock file to prevent multiple instances
const LOCK_FILE = path.join(__dirname, 'bot.lock');

// Check if another instance is already running
function checkSingleInstance() {
    if (fs.existsSync(LOCK_FILE)) {
        try {
            const pid = fs.readFileSync(LOCK_FILE, 'utf8');
            // Check if the process is still running
            try {
                process.kill(pid, 0); // Send signal 0 to check if process exists
                console.log('❌ Another bot instance is already running (PID:', pid + ')');
                console.log('🛑 Shutting down to prevent duplicate responses...');
                process.exit(1);
            } catch (e) {
                // Process doesn't exist, remove stale lock file
                fs.unlinkSync(LOCK_FILE);
                console.log('🧹 Removed stale lock file');
            }
        } catch (error) {
            // Lock file is corrupted, remove it
            fs.unlinkSync(LOCK_FILE);
            console.log('🧹 Removed corrupted lock file');
        }
    }

    // Create lock file with current process ID
    fs.writeFileSync(LOCK_FILE, process.pid.toString());
    console.log('🔒 Bot instance locked (PID:', process.pid + ')');
}

// Clean up lock file on exit
function cleanupLockFile() {
    try {
        if (fs.existsSync(LOCK_FILE)) {
            fs.unlinkSync(LOCK_FILE);
            console.log('🧹 Lock file cleaned up');
        }
    } catch (error) {
        console.error('Error cleaning up lock file:', error);
    }
}

// Register cleanup handlers
process.on('exit', cleanupLockFile);
process.on('SIGINT', () => {
    console.log('\n💀 Goblin bot shutting down...');
    cleanupLockFile();
    process.exit(0);
});
process.on('SIGTERM', () => {
    cleanupLockFile();
    process.exit(0);
});
process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    cleanupLockFile();
    process.exit(1);
});

// Check for single instance before starting
checkSingleInstance();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const db = new Database();

// Role names
const MEMBER_ROLE = 'Gamba Bot Member';
const ADMIN_ROLE = 'Gamba Bot Admin';

// Goblin message pools for variety
const GOBLIN_MESSAGES = {
    accessDenied: {
        titles: [
            '🚫 No Deal, Friend!',
            '🛑 Hold Up There, Buddy!',
            '⛔ Not So Fast, Pal!',
            '🚪 Members Only, Capisce?'
        ],
        descriptions: [
            `Hah! You think you can just waltz in here? You need the **${MEMBER_ROLE}** role to do business with this goblin! Come back when you got the proper credentials, capisce?`,
            `Whoa whoa whoa! This ain't a charity, friend! You need the **${MEMBER_ROLE}** role to play my games. No freebies!`,
            `Nice try, but I ain't running a soup kitchen here! Get yourself the **${MEMBER_ROLE}** role first, then we can talk business!`,
            `Hold your horses there, stranger! You need proper membership - that's the **${MEMBER_ROLE}** role - to deal with me. Rules are rules!`
        ]
    },
    balance: {
        titles: [
            '💰 Your Vault Status',
            '🏦 Account Balance',
            '💎 Treasure Report',
            '🪙 Coin Count'
        ],
        descriptions: [
            `Eh, let me check the books... Yep! You got **{coins}** Gold Coins stashed away, friend! Not bad, not bad at all! Ready to make some deals?`,
            `*flips through ledger* Ah yes, here we are! Your account shows **{coins}** Gold Coins. Looking good, looking good! Want to risk some of it?`,
            `Let's see what we got here... *counts coins* **{coins}** Gold Coins in your vault! That's some serious dough! Care to gamble?`,
            `*adjusts spectacles* According to my records, you're sitting pretty with **{coins}** Gold Coins! Time to put them to work, eh?`
        ]
    },
    invalidBet: {
        titles: [
            '🎲 Hey Now, What Kind of Deal is That?',
            '🤨 That Ain\'t How This Works!',
            '🎯 Come On, Be Serious!',
            '🎰 Invalid Wager, Friend!'
        ],
        descriptions: [
            `Listen here, buddy! You gotta put some real coin on the table! Try \`!roll <amount>\` with actual numbers! I don't work for free, capisce?`,
            `What kind of bet is that?! You need to put down real money, not funny business! Use \`!roll <amount>\` with numbers, friend!`,
            `Hah! Nice try, but I need actual coin amounts! Try \`!roll <amount>\` and make it worth my time!`,
            `Come on now, don't waste my time with nonsense! Put down a real bet with \`!roll <amount>\` - numbers only!`
        ]
    },
    insufficientFunds: {
        titles: [
            '💸 Whoa There, High Roller!',
            '🏦 Insufficient Funds, Pal!',
            '💰 Your Wallet Says No!',
            '🪙 Not Enough Coin, Friend!'
        ],
        descriptions: [
            `Hah! Nice try, friend, but you're trying to bet **{bet}** coins when you only got **{balance}** in your vault! I may be a goblin, but I ain't stupid! Come back when you got the dough!`,
            `Easy there, big spender! You want to bet **{bet}** but you only got **{balance}** coins! Math ain't your strong suit, eh? Get more gold first!`,
            `Hold up! You're trying to gamble **{bet}** coins but your vault only has **{balance}**! Even a goblin knows you can't spend what you don't have!`,
            `Whoa whoa whoa! **{bet}** coins? You only got **{balance}** to your name! Come back when your wallet matches your ambition, friend!`
        ]
    },
    wins: {
        titles: [
            '🎉 Bah! Lucky Shot, Friend!',
            '😤 Curses! You Got Me!',
            '🍀 Fine, Fine... You Win!',
            '🎯 Blast! Nice Roll!'
        ],
        descriptions: [
            `**Your roll:** {playerRoll}\n**My roll:** {botRoll}\n\nGah! You got me this time! Fine, fine... a deal's a deal! You won **{winnings}** Gold Coins fair and square!\n\n💰 Your vault now holds: **{newBalance}** Gold Coins\n\nDon't get cocky though - the house always wins in the end! Heh heh...`,
            `**Your roll:** {playerRoll}\n**My roll:** {botRoll}\n\nCurses and damnation! Lady Luck smiled on you this round! Take your **{winnings}** Gold Coins and don't let it go to your head!\n\n💰 New vault total: **{newBalance}** Gold Coins\n\nEnjoy it while it lasts - I'll get you next time!`,
            `**Your roll:** {playerRoll}\n**My roll:** {botRoll}\n\nArgh! Well played, well played... Your **{winnings}** Gold Coins are well earned, I'll admit!\n\n💰 Updated balance: **{newBalance}** Gold Coins\n\nBut mark my words - beginner's luck doesn't last forever!`,
            `**Your roll:** {playerRoll}\n**My roll:** {botRoll}\n\nBlast and bother! You beat me fair and square! Here's your **{winnings}** Gold Coins - every last one!\n\n💰 Your vault shows: **{newBalance}** Gold Coins\n\nSavor this victory, friend. They don't come often in my establishment!`
        ]
    },
    loans: {
        approval: {
            titles: [
                '🏦 Loan Approved, Friend!',
                '💰 Deal Struck!',
                '📋 Contract Signed!',
                '🤝 We Got a Deal!'
            ],
            descriptions: [
                `Excellent! I've fronted you **{amount}** Gold Coins at a fair rate of **18% APR** (that's 0.05% daily, friend).\n\n📊 **Loan Details:**\n• Principal: **{amount}** Gold Coins\n• Daily Interest: **0.05%**\n• Minimum Payment: **3%** of balance or **25** coins daily\n• Payment Time: **Midnight EST**\n\n💰 Your vault now holds: **{newBalance}** Gold Coins\n\nRemember: Pay on time or face the consequences! Business is business!`,
                `Well well! You're now **{amount}** Gold Coins richer, but remember - nothing's free in this world!\n\n📋 **Your Loan Terms:**\n• Amount Borrowed: **{amount}** Gold Coins\n• Interest Rate: **18% APR** (0.05% daily)\n• Daily Payment: **3%** minimum or **25** coins\n• Due Daily: **Midnight EST**\n\n💰 Updated balance: **{newBalance}** Gold Coins\n\nDon't be late with payments, capisce? I've got a business to run!`
            ]
        },
        denial: {
            titles: [
                '🚫 No Dice, Friend!',
                '❌ Loan Denied!',
                '🛑 Can\'t Do It!',
                '💸 Too Risky!'
            ],
            descriptions: [
                `Whoa there, big spender! You already got **{existingLoans}** active loans! I may be generous, but I ain't stupid!\n\nPay off your current debts before asking for more, capisce?`,
                `Nice try, but you're already in hock for **{totalDebt}** Gold Coins! Can't loan you more until you settle up!\n\nCome back when your books are cleaner, friend!`,
                `Hold up! You want **{amount}** coins but you only got **{balance}** to your name! Even as collateral, that's too risky for this goblin!\n\nBuild up some savings first, then we'll talk!`
            ]
        }
    },
    loanStatus: {
        active: {
            titles: [
                '📋 Your Outstanding Debts',
                '💸 What You Owe Me',
                '🏦 Loan Portfolio',
                '📊 Debt Summary'
            ]
        }
    },
    loanPayment: {
        success: {
            titles: [
                '💰 Payment Received!',
                '✅ Debt Reduced!',
                '🏦 Thank You!',
                '📊 Books Updated!'
            ],
            descriptions: [
                `Good on you! **{paymentAmount}** Gold Coins received and applied to your loan!\n\n📊 **Updated Loan Status:**\n• Remaining Balance: **{newBalance}** Gold Coins\n• Your Vault: **{userBalance}** Gold Coins\n\nKeep this up and you'll be debt-free in no time!`,
                `Excellent! Your **{paymentAmount}** coin payment has been processed!\n\n💰 **New Totals:**\n• Loan Balance: **{newBalance}** Gold Coins\n• Your Balance: **{userBalance}** Gold Coins\n\nPrompt payments keep the business flowing, friend!`
            ]
        },
        fullPayoff: {
            titles: [
                '🎉 DEBT FREE!',
                '✨ Loan Cleared!',
                '🏆 All Paid Up!',
                '💸 No More Debt!'
            ],
            descriptions: [
                `Outstanding! You've paid off your entire loan with **{paymentAmount}** Gold Coins!\n\n🎊 **CONGRATULATIONS!** 🎊\n• Final Payment: **{paymentAmount}** Gold Coins\n• Your Vault: **{userBalance}** Gold Coins\n• Status: **DEBT FREE!**\n\nPleasure doing business! Come back anytime you need more coin!`,
                `Bravo! **{paymentAmount}** Gold Coins and you're COMPLETELY PAID OFF!\n\n🏆 **LOAN CLEARED!** 🏆\n• Total Paid: All of it!\n• Remaining Balance: **0** Gold Coins\n• Your Status: **CLEAN SLATE!**\n\nYou're welcome back anytime, friend! Heh heh heh...`
            ]
        }
    },
    losses: {
        titles: [
            '😈 Hah! Better Luck Next Time!',
            '😆 The House Always Wins!',
            '💸 Thanks for the Donation!',
            '🎲 Ohohoho! Got You!'
        ],
        descriptions: [
            `**Your roll:** {playerRoll}\n**My roll:** {botRoll}\n\nOhohoho! Looks like Lady Luck ain't on your side today, friend! Those **{betAmount}** Gold Coins? They're mine now!\n\n💸 Your vault now holds: **{newBalance}** Gold Coins\n\nDon't look so glum! Come back anytime - I'll be here to take more of your coin! Business is business! Heh heh heh...`,
            `**Your roll:** {playerRoll}\n**My roll:** {botRoll}\n\nHahahaha! Another satisfied customer! Your **{betAmount}** Gold Coins will fit nicely in my collection!\n\n💸 Remaining balance: **{newBalance}** Gold Coins\n\nThe house always wins, friend! That's how I keep the lights on! Come back soon!`,
            `**Your roll:** {playerRoll}\n**My roll:** {botRoll}\n\nSorry, not sorry! Those **{betAmount}** Gold Coins are mine now! Better luck next time, eh?\n\n💸 Your vault balance: **{newBalance}** Gold Coins\n\nDon't be a stranger now - I got more games where those coins came from!`,
            `**Your roll:** {playerRoll}\n**My roll:** {botRoll}\n\nHeh heh heh! Another happy transaction! I'll take those **{betAmount}** Gold Coins, thank you very much!\n\n💸 New balance: **{newBalance}** Gold Coins\n\nKeep playing, friend! My retirement fund ain't gonna fill itself!`
        ]
    }
};

// Helper function to get random message from pool
function getRandomMessage(pool) {
    return pool[Math.floor(Math.random() * pool.length)];
}

// Helper function to safely reply to messages
async function safeReply(message, options) {
    try {
        return await message.reply(options);
    } catch (error) {
        console.error('Error replying to message:', error);
        // If reply fails, try sending to channel directly
        try {
            return await message.channel.send(options);
        } catch (channelError) {
            console.error('Error sending to channel:', channelError);
        }
    }
}

// Helper function to check if user has required role
function hasRole(member, roleName) {
    return member.roles.cache.some(role => role.name === roleName);
}

// Helper function to check if user has member access
function hasMemberAccess(member) {
    return hasRole(member, MEMBER_ROLE) || hasRole(member, ADMIN_ROLE);
}

// Helper function to check if user has admin access
function hasAdminAccess(member) {
    return hasRole(member, ADMIN_ROLE);
}

// Daily loan processing function
async function processDailyLoans() {
    console.log('🕛 Processing daily loan payments and interest...');
    
    try {
        const activeLoans = await db.getAllActiveLoans();
        console.log(`Found ${activeLoans.length} active loans to process.`);
        
        for (const loan of activeLoans) {
            const now = new Date();
            const nextPaymentDue = new Date(loan.next_payment_due);
            
            // Skip if payment isn't due yet
            if (now < nextPaymentDue) continue;
            
            // Calculate daily interest (0.05% daily = 18% APR)
            const interestAmount = loan.current_balance * loan.daily_interest_rate;
            const newBalance = loan.current_balance + interestAmount;
            
            // Calculate minimum payment (3% of balance or 25 coins minimum)
            const minimumPayment = Math.max(25, Math.ceil(newBalance * 0.03));
            
            // Get user's current balance
            const user = await db.getUser(loan.user_id);
            if (!user) continue;
            
            console.log(`Processing loan ${loan.loan_id} for user ${loan.user_id}: Balance ${loan.current_balance}, Interest ${interestAmount}, Min Payment ${minimumPayment}`);
            
            if (user.gold_coins >= minimumPayment) {
                // User can afford minimum payment
                const finalBalance = Math.max(0, newBalance - minimumPayment);
                const userNewBalance = user.gold_coins - minimumPayment;
                
                // Record payment and update balances
                await db.recordLoanPayment(loan.loan_id, minimumPayment, finalBalance);
                await db.updateGoldCoins(loan.user_id, userNewBalance);
                
                console.log(`✅ Auto payment processed: ${minimumPayment} coins, remaining loan balance: ${finalBalance}`);
            } else {
                // User cannot afford payment
                const lateFee = 50;
                const finalBalance = newBalance + lateFee;
                const newMissedPayments = loan.missed_payments + 1;
                
                // Update loan with interest, late fee, and missed payment (no suspension)
                await db.updateLoan(loan.loan_id, finalBalance, newMissedPayments, false);
                
                console.log(`❌ Payment missed for loan ${loan.loan_id}. New balance: ${finalBalance}, Missed payments: ${newMissedPayments}`);
            }
        }
        
        console.log('✅ Daily loan processing completed.');
    } catch (error) {
        console.error('❌ Error processing daily loans:', error);
    }
}

// Schedule daily loan processing at 4 AM UTC (Midnight EST)
function scheduleDailyLoanProcessing() {
    const now = new Date();
    const nextRun = new Date();
    
    // Set next run to 4 AM UTC (Midnight EST)
    nextRun.setUTCHours(4, 0, 0, 0);
    
    // If 4 AM UTC has already passed today, schedule for tomorrow
    if (now.getUTCHours() >= 4) {
        nextRun.setUTCDate(nextRun.getUTCDate() + 1);
    }
    
    const timeUntilNextRun = nextRun.getTime() - now.getTime();
    
    console.log(`📅 Next loan processing scheduled for: ${nextRun.toISOString()} (in ${Math.round(timeUntilNextRun / 1000 / 60)} minutes)`);
    
    setTimeout(() => {
        processDailyLoans();
        // Schedule the next run (24 hours later)
        setInterval(processDailyLoans, 24 * 60 * 60 * 1000);
    }, timeUntilNextRun);
}

client.once('ready', () => {
    console.log(`${client.user.tag} is online and ready to make some deals! Heh heh heh...`);
    console.log('Bot successfully deployed on Railway!');
    
    // Start daily loan processing scheduler
    scheduleDailyLoanProcessing();
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;

    try {
        const args = message.content.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();

    // Check if user has member role for all commands
    if (!hasMemberAccess(message.member)) {
        const title = getRandomMessage(GOBLIN_MESSAGES.accessDenied.titles);
        const description = getRandomMessage(GOBLIN_MESSAGES.accessDenied.descriptions);
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle(title)
            .setDescription(description);
        return await safeReply(message, { embeds: [embed] });
    }

    // Ensure user exists in database
    let user = await db.getUser(message.author.id);
    if (!user) {
        await db.createUser(message.author.id);
        user = await db.getUser(message.author.id);
    }

    if (command === 'balance') {
        const title = getRandomMessage(GOBLIN_MESSAGES.balance.titles);
        const description = getRandomMessage(GOBLIN_MESSAGES.balance.descriptions).replace('{coins}', user.gold_coins);
        const embed = new EmbedBuilder()
            .setColor('#ffd700')
            .setTitle(title)
            .setDescription(description);
        return await safeReply(message, { embeds: [embed] });
    }

    if (command === 'help') {
        const isAdmin = hasAdminAccess(message.member);
        const embed = new EmbedBuilder()
            .setColor('#00ff88')
            .setTitle('🎰 Goblin\'s Guide to Getting Rich!')
            .setDescription('Welcome to my establishment, friend! Here\'s what we got on offer:')
            .addFields(
                {
                    name: '💰 !balance',
                    value: 'Check how many Gold Coins you got stashed away in your vault!',
                    inline: false
                },
                {
                    name: '🎲 !roll <amount>',
                    value: 'Roll the dice and gamble your coins! Higher roll wins double your bet!\n*Example: `!roll 100`*',
                    inline: false
                },
                {
                    name: '🏦 !loan <amount>',
                    value: 'Borrow Gold Coins at 18% APR! Daily payments at midnight EST!\n*Example: `!loan 500`*',
                    inline: false
                },
                {
                    name: '📊 !loanstatus',
                    value: 'Check your outstanding debts and payment schedules!',
                    inline: false
                },
                {
                    name: '💸 !payloan <amount>',
                    value: 'Make a payment toward your loan balance!\n*Example: `!payloan 100`*',
                    inline: false
                },
                {
                    name: '❓ !help',
                    value: 'Shows this here menu of services!',
                    inline: false
                }
            );

        // Add admin commands if user has admin role
        if (isAdmin) {
            embed.addFields(
                {
                    name: '👑 **ADMIN COMMANDS**',
                    value: '━━━━━━━━━━━━━━━━━━━━',
                    inline: false
                },
                {
                    name: '💎 !give @user <amount>',
                    value: 'Add Gold Coins to a user\'s vault\n*Example: `!give @friend 500`*',
                    inline: true
                },
                {
                    name: '📚 !setgold @user <amount>',
                    value: 'Set a user\'s exact Gold Coin balance\n*Example: `!setgold @friend 1500`*',
                    inline: true
                },
                {
                    name: '✨ !forgiveloan @user',
                    value: 'Clear all debts for a user (debt forgiveness)\n*Example: `!forgiveloan @friend`*',
                    inline: true
                }
            );
        }

        embed.addFields(
            {
                name: '📋 How It Works:',
                value: '• Everyone starts with **1000 Gold Coins**\n• Roll 1-25, highest roll wins\n• Win = Get double your bet back\n• Lose = I keep your coins! Heh heh...',
                inline: false
            },
            {
                name: '🏦 Loan System:',
                value: '• Borrow coins at **18% APR** (0.05% daily interest)\n• Minimum payment: **3%** of balance or **25 coins**\n• Late fee: **50 Gold Coins** per missed payment\n• Interest compounds daily until paid!',
                inline: false
            },
            {
                name: '🏆 House Rules:',
                value: '• You need the **Gamba Bot Member** role to play\n• Pay your debts or face the consequences!\n• All transactions are final, capisce?',
                inline: false
            }
        );

        if (isAdmin) {
            embed.setFooter({ text: 'Remember boss: With great power comes great responsibility... and great profit! Heh heh!' });
        } else {
            embed.setFooter({ text: 'Remember: The house always wins in the end! Business is business!' });
        }
        
        return await safeReply(message, { embeds: [embed] });
    }

    // Admin-only commands
    if (command === 'give' || command === 'addgold') {
        if (!hasAdminAccess(message.member)) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('🚫 Admin Only, Friend!')
                .setDescription('Hah! You think you can just hand out MY gold? You need the **Gamba Bot Admin** role for that kind of power, capisce?');
            return await safeReply(message, { embeds: [embed] });
        }

        const targetUser = message.mentions.users.first();
        const amount = parseInt(args[1]);

        if (!targetUser || !amount || amount <= 0) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('📝 Invalid Command Format!')
                .setDescription('Listen up, boss! You gotta use: `!give @user <amount>`\n*Example: `!give @friend 500`*');
            return await safeReply(message, { embeds: [embed] });
        }

        // Ensure target user exists in database
        let targetUserData = await db.getUser(targetUser.id);
        if (!targetUserData) {
            await db.createUser(targetUser.id);
            targetUserData = await db.getUser(targetUser.id);
        }

        const newBalance = targetUserData.gold_coins + amount;
        await db.updateGoldCoins(targetUser.id, newBalance);

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('💰 Gold Distribution Complete!')
            .setDescription(`Alright boss, I've handed over **${amount}** Gold Coins to ${targetUser}!\n\n📊 **Transaction Details:**\n• Previous balance: **${targetUserData.gold_coins}** coins\n• Amount given: **${amount}** coins\n• New balance: **${newBalance}** coins\n\nThe books have been updated accordingly!`);
        
        return await safeReply(message, { embeds: [embed] });
    }

    if (command === 'setgold' || command === 'setbalance') {
        if (!hasAdminAccess(message.member)) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('🚫 Admin Only, Friend!')
                .setDescription('Whoa there! Only admins can mess with the ledger directly! You need the **Gamba Bot Admin** role for that, capisce?');
            return await safeReply(message, { embeds: [embed] });
        }

        const targetUser = message.mentions.users.first();
        const amount = parseInt(args[1]);

        if (!targetUser || amount < 0 || isNaN(amount)) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('📝 Invalid Command Format!')
                .setDescription('Come on boss, you gotta use: `!setgold @user <amount>`\n*Example: `!setgold @friend 1500`*');
            return await safeReply(message, { embeds: [embed] });
        }

        // Ensure target user exists in database
        let targetUserData = await db.getUser(targetUser.id);
        if (!targetUserData) {
            await db.createUser(targetUser.id);
            targetUserData = await db.getUser(targetUser.id);
        }

        const oldBalance = targetUserData.gold_coins;
        await db.updateGoldCoins(targetUser.id, amount);

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('📚 Ledger Updated!')
            .setDescription(`Done deal, boss! I've set ${targetUser}'s balance to **${amount}** Gold Coins!\n\n📊 **Balance Change:**\n• Previous balance: **${oldBalance}** coins\n• New balance: **${amount}** coins\n• Net change: **${amount - oldBalance}** coins\n\nThe books are all squared away!`);
        
        return await safeReply(message, { embeds: [embed] });
    }

    if (command === 'roll') {
        const betAmount = parseInt(args[0]);
        
        if (!betAmount || betAmount <= 0) {
            const title = getRandomMessage(GOBLIN_MESSAGES.invalidBet.titles);
            const description = getRandomMessage(GOBLIN_MESSAGES.invalidBet.descriptions);
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle(title)
                .setDescription(description);
            return await safeReply(message, { embeds: [embed] });
        }

        if (betAmount > user.gold_coins) {
            const title = getRandomMessage(GOBLIN_MESSAGES.insufficientFunds.titles);
            const description = getRandomMessage(GOBLIN_MESSAGES.insufficientFunds.descriptions)
                .replace('{bet}', betAmount)
                .replace('{balance}', user.gold_coins);
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle(title)
                .setDescription(description);
            return await safeReply(message, { embeds: [embed] });
        }

        // Generate random numbers
        const playerRoll = Math.floor(Math.random() * 25) + 1;
        const botRoll = Math.floor(Math.random() * 25) + 1;
        
        let resultColor, resultTitle, resultDesc, newBalance;

        if (playerRoll > botRoll) {
            // Player wins - double their bet
            const winnings = betAmount * 2;
            newBalance = user.gold_coins + betAmount; // They get back their bet + winnings
            resultColor = '#00ff00';
            resultTitle = getRandomMessage(GOBLIN_MESSAGES.wins.titles);
            resultDesc = getRandomMessage(GOBLIN_MESSAGES.wins.descriptions)
                .replace('{playerRoll}', playerRoll)
                .replace('{botRoll}', botRoll)
                .replace('{winnings}', winnings)
                .replace('{newBalance}', newBalance);
        } else {
            // Player loses
            newBalance = user.gold_coins - betAmount;
            resultColor = '#ff0000';
            resultTitle = getRandomMessage(GOBLIN_MESSAGES.losses.titles);
            resultDesc = getRandomMessage(GOBLIN_MESSAGES.losses.descriptions)
                .replace('{playerRoll}', playerRoll)
                .replace('{botRoll}', botRoll)
                .replace('{betAmount}', betAmount)
                .replace('{newBalance}', newBalance);
        }

        await db.updateGoldCoins(message.author.id, newBalance);

        const embed = new EmbedBuilder()
            .setColor(resultColor)
            .setTitle(resultTitle)
            .setDescription(resultDesc);
        
        return await safeReply(message, { embeds: [embed] });
    }

    if (command === 'loan') {
        const loanAmount = parseInt(args[0]);
        
        if (!loanAmount || loanAmount <= 0) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('📝 Invalid Loan Amount!')
                .setDescription('Listen here, friend! You gotta specify a valid loan amount!\n*Example: `!loan 500`*');
            return await safeReply(message, { embeds: [embed] });
        }

        // Check for existing loans
        const existingLoans = await db.getUserLoans(message.author.id);
        if (existingLoans.length > 0) {
            const totalDebt = existingLoans.reduce((sum, loan) => sum + loan.current_balance, 0);
            const title = getRandomMessage(GOBLIN_MESSAGES.loans.denial.titles);
            let description = getRandomMessage(GOBLIN_MESSAGES.loans.denial.descriptions);
            
            if (description.includes('{existingLoans}')) {
                description = description.replace('{existingLoans}', existingLoans.length);
            } else if (description.includes('{totalDebt}')) {
                description = description.replace('{totalDebt}', Math.round(totalDebt));
            }
            
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle(title)
                .setDescription(description);
            return await safeReply(message, { embeds: [embed] });
        }

        // Risk assessment - require some collateral
        const minRequiredBalance = loanAmount * 0.1; // 10% of loan amount
        if (user.gold_coins < minRequiredBalance) {
            const title = getRandomMessage(GOBLIN_MESSAGES.loans.denial.titles);
            const description = getRandomMessage(GOBLIN_MESSAGES.loans.denial.descriptions)
                .replace('{amount}', loanAmount)
                .replace('{balance}', user.gold_coins);
            
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle(title)
                .setDescription(description);
            return await safeReply(message, { embeds: [embed] });
        }

        // Create the loan
        const loan = await db.createLoan(message.author.id, loanAmount);
        const newBalance = user.gold_coins + loanAmount;
        await db.updateGoldCoins(message.author.id, newBalance);

        const title = getRandomMessage(GOBLIN_MESSAGES.loans.approval.titles);
        const description = getRandomMessage(GOBLIN_MESSAGES.loans.approval.descriptions)
            .replace(/{amount}/g, loanAmount)
            .replace('{newBalance}', newBalance);

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle(title)
            .setDescription(description);
        
        return await safeReply(message, { embeds: [embed] });
    }

    if (command === 'loanstatus' || command === 'loans') {
        const userLoans = await db.getUserLoans(message.author.id);
        
        if (userLoans.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#00ff88')
                .setTitle('✨ Debt Free!')
                .setDescription('Excellent! You don\'t owe me a single Gold Coin, friend!\n\nYour credit is clean and ready for business! Want to take out a loan? Just use `!loan <amount>`');
            return await safeReply(message, { embeds: [embed] });
        }

        const title = getRandomMessage(GOBLIN_MESSAGES.loanStatus.active.titles);
        let description = 'Here\'s what you owe me, friend:\n\n';
        let totalDebt = 0;

        userLoans.forEach((loan, index) => {
            const balance = Math.round(loan.current_balance * 100) / 100;
            const minPayment = Math.max(25, Math.ceil(balance * 0.03));
            const nextDue = new Date(loan.next_payment_due).toLocaleDateString();
            
            description += `**Loan #${index + 1}:**\n`;
            description += `• Balance: **${balance}** Gold Coins\n`;
            description += `• Min Payment: **${minPayment}** Gold Coins\n`;
            description += `• Next Due: **${nextDue}**\n`;
            description += `• Missed Payments: **${loan.missed_payments}**\n`;
            description += '\n';
            
            totalDebt += balance;
        });

        description += `💰 **Total Debt:** **${Math.round(totalDebt * 100) / 100}** Gold Coins`;

        const embed = new EmbedBuilder()
            .setColor('#ffd700')
            .setTitle(title)
            .setDescription(description)
            .setFooter({ text: 'Use !payloan <amount> to make a payment!' });
        
        return await safeReply(message, { embeds: [embed] });
    }

    if (command === 'payloan' || command === 'paydebt') {
        const paymentAmount = parseInt(args[0]);
        
        if (!paymentAmount || paymentAmount <= 0) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('📝 Invalid Payment Amount!')
                .setDescription('Come on, friend! Specify how much you want to pay!\n*Example: `!payloan 100`*');
            return await safeReply(message, { embeds: [embed] });
        }

        if (paymentAmount > user.gold_coins) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('💸 Insufficient Funds!')
                .setDescription(`You want to pay **${paymentAmount}** Gold Coins but only got **${user.gold_coins}** in your vault!\n\nCan't pay what you don't have, capisce?`);
            return await safeReply(message, { embeds: [embed] });
        }

        const userLoans = await db.getUserLoans(message.author.id);
        if (userLoans.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#00ff88')
                .setTitle('✨ No Debts!')
                .setDescription('Hold up there! You don\'t owe me anything, friend!\n\nYour slate is clean!');
            return await safeReply(message, { embeds: [embed] });
        }

        // Apply payment to oldest loan first
        const loan = userLoans[0];
        const newLoanBalance = Math.max(0, loan.current_balance - paymentAmount);
        const newUserBalance = user.gold_coins - paymentAmount;

        await db.recordLoanPayment(loan.loan_id, paymentAmount, newLoanBalance);
        await db.updateGoldCoins(message.author.id, newUserBalance);

        let title, description;
        
        if (newLoanBalance === 0) {
            title = getRandomMessage(GOBLIN_MESSAGES.loanPayment.fullPayoff.titles);
            description = getRandomMessage(GOBLIN_MESSAGES.loanPayment.fullPayoff.descriptions)
                .replace('{paymentAmount}', paymentAmount)
                .replace('{userBalance}', newUserBalance);
        } else {
            title = getRandomMessage(GOBLIN_MESSAGES.loanPayment.success.titles);
            description = getRandomMessage(GOBLIN_MESSAGES.loanPayment.success.descriptions)
                .replace('{paymentAmount}', paymentAmount)
                .replace('{newBalance}', Math.round(newLoanBalance * 100) / 100)
                .replace('{userBalance}', newUserBalance);
        }

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle(title)
            .setDescription(description);
        
        return await safeReply(message, { embeds: [embed] });
    }

    if (command === 'forgiveloan' || command === 'cleardebt') {
        if (!hasAdminAccess(message.member)) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('🚫 Admin Only, Friend!')
                .setDescription('Whoa there! Only admins can forgive debts! You need the **Gamba Bot Admin** role for that kind of power, capisce?');
            return await safeReply(message, { embeds: [embed] });
        }

        const targetUser = message.mentions.users.first();
        
        if (!targetUser) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('📝 Invalid Command Format!')
                .setDescription('Listen up, boss! You gotta use: `!forgiveloan @user`\n*Example: `!forgiveloan @friend`*');
            return await safeReply(message, { embeds: [embed] });
        }

        // Get user's current loans
        const userLoans = await db.getUserLoans(targetUser.id);
        
        if (userLoans.length === 0) {
            const embed = new EmbedBuilder()
                .setColor('#00ff88')
                .setTitle('✨ No Debts to Forgive!')
                .setDescription(`Hold up, boss! ${targetUser} doesn't owe me anything!\n\nTheir slate is already clean!`);
            return await safeReply(message, { embeds: [embed] });
        }

        // Calculate total debt being forgiven
        const totalDebt = userLoans.reduce((sum, loan) => sum + loan.current_balance, 0);
        const roundedDebt = Math.round(totalDebt * 100) / 100;

        // Forgive all loans for this user
        const result = await db.forgiveUserLoans(targetUser.id);

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✨ Debt Forgiven!')
            .setDescription(`Alright boss, I've wiped the slate clean for ${targetUser}!\n\n💸 **Debt Forgiven:**\n• Total Amount: **${roundedDebt}** Gold Coins\n• Loans Cleared: **${userLoans.length}**\n• Status: **DEBT FREE!**\n\nThat's some serious generosity, boss! The books have been updated accordingly.`)
            .setFooter({ text: 'Remember: With great power comes great responsibility!' });
        
        return await safeReply(message, { embeds: [embed] });
    }
    } catch (error) {
        console.error('Error handling message:', error);
        // Try to send a generic error message
        try {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('🚫 Oops! Something Went Wrong!')
                .setDescription('Sorry friend, my goblin brain had a hiccup! Try that command again, capisce?');
            await safeReply(message, { embeds: [errorEmbed] });
        } catch (embedError) {
            console.error('Failed to send error message:', embedError);
        }
    }
});

// Debug token on Railway
console.log('Environment check:');
console.log('DISCORD_TOKEN exists:', !!process.env.DISCORD_TOKEN);
console.log('DISCORD_TOKEN length:', process.env.DISCORD_TOKEN ? process.env.DISCORD_TOKEN.length : 'undefined');
console.log('DISCORD_TOKEN starts with:', process.env.DISCORD_TOKEN ? process.env.DISCORD_TOKEN.substring(0, 5) : 'undefined');

client.login(process.env.DISCORD_TOKEN);