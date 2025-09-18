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

// Blackjack game storage
const activeBlackjackGames = new Map();
const playerShoes = new Map();

const DECKS_PER_SHOE = 2;
const SHUFFLE_THRESHOLD = 15;
const SHOE_EXPIRATION_MS = 60 * 60 * 1000; // 1 hour

// Blackjack card system
const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function createDeck(numDecks = 1) {
    const deck = [];
    for (let d = 0; d < numDecks; d++) {
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                deck.push({ suit, rank });
            }
        }
    }
    return shuffleDeck(deck);
}

function shuffleDeck(deck) {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function createPlayerShoe() {
    return {
        cards: createDeck(DECKS_PER_SHOE),
        runningCount: 0,
        lastRefreshed: Date.now()
    };
}

function ensurePlayerShoe(userId, { forceNew = false } = {}) {
    let shoe = playerShoes.get(userId);
    let reshuffled = false;
    const now = Date.now();

    if (
        forceNew ||
        !shoe ||
        shoe.cards.length < SHUFFLE_THRESHOLD ||
        now - shoe.lastRefreshed >= SHOE_EXPIRATION_MS
    ) {
        shoe = createPlayerShoe();
        playerShoes.set(userId, shoe);
        reshuffled = true;
    }

    return { shoe, reshuffled };
}

function drawCardForPlayer(userId) {
    let reshuffled = false;
    let { shoe, reshuffled: ensured } = ensurePlayerShoe(userId);
    reshuffled = reshuffled || ensured;

    if (!shoe || shoe.cards.length === 0) {
        ({ shoe } = ensurePlayerShoe(userId, { forceNew: true }));
        reshuffled = true;
    }

    const card = shoe.cards.pop();
    updateRunningCount(shoe, card);
    return { card, reshuffled };
}

function updateRunningCount(shoe, card) {
    if (!shoe) {
        return;
    }

    const highCards = ['10', 'J', 'Q', 'K', 'A'];
    const lowCards = ['2', '3', '4', '5', '6'];

    if (lowCards.includes(card.rank)) {
        shoe.runningCount += 1;
    } else if (highCards.includes(card.rank)) {
        shoe.runningCount -= 1;
    }
}

function getCardValue(card, currentTotal = 0) {
    if (card.rank === 'A') {
        // Ace is 11 unless it would bust, then it's 1
        return (currentTotal + 11 > 21) ? 1 : 11;
    } else if (['J', 'Q', 'K'].includes(card.rank)) {
        return 10;
    } else {
        return parseInt(card.rank);
    }
}

function calculateHandValue(hand) {
    let total = 0;
    let aces = 0;
    
    // Count non-ace cards first
    for (const card of hand) {
        if (card.rank === 'A') {
            aces++;
        } else if (['J', 'Q', 'K'].includes(card.rank)) {
            total += 10;
        } else {
            total += parseInt(card.rank);
        }
    }
    
    // Add aces (optimize for highest value without busting)
    for (let i = 0; i < aces; i++) {
        if (total + 11 <= 21) {
            total += 11;
        } else {
            total += 1;
        }
    }
    
    return total;
}

function formatHand(hand, hideFirstCard = false) {
    if (hideFirstCard && hand.length > 0) {
        const visibleCards = hand.slice(1);
        return `🃏 ${visibleCards.map(card => `${card.rank}${card.suit}`).join(' ')}`;
    }
    return hand.map(card => `${card.rank}${card.suit}`).join(' ');
}

function isBlackjack(hand) {
    return hand.length === 2 && calculateHandValue(hand) === 21;
}

function isBust(hand) {
    return calculateHandValue(hand) > 21;
}

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
            existingLoans: [
                `Whoa there, big spender! You already got **{existingLoans}** active loans! I may be generous, but I ain't stupid!\n\nPay off your current debts before asking for more, capisce?`,
                `Listen here, friend! You got **{existingLoans}** loans already on the books! Can't give you more until you clear those up!\n\nOne thing at a time, capisce?`
            ],
            totalDebt: [
                `Nice try, but you're already in hock for **{totalDebt}** Gold Coins! Can't loan you more until you settle up!\n\nCome back when your books are cleaner, friend!`,
                `Hold up there! You owe me **{totalDebt}** Gold Coins already! Pay that off before asking for more!\n\nI ain't running a charity here!`
            ],
            insufficientCollateral: [
                `Hold up! You want **{amount}** coins but you only got **{balance}** to your name! Even as collateral, that's too risky for this goblin!\n\nBuild up some savings first, then we'll talk!`,
                `Whoa there! **{amount}** Gold Coins? You only got **{balance}** in your vault! That's not enough collateral for me!\n\nCome back when you got more skin in the game, friend!`
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
    blackjack: {
        gameStart: {
            titles: [
                '🃏 Cards on the Table!',
                '♠️ Let\'s Play Blackjack!',
                '🎰 Twenty-One Time!',
                '♥️ Deal \'Em Up!'
            ]
        },
        playerWin: {
            titles: [
                '🎉 Twenty-One! You Win!',
                '✨ Blackjack Winner!',
                '🏆 Beat the House!',
                '💰 Lucky Hand!'
            ],
            descriptions: [
                `Blast it all! You got **{result}** and beat my **{dealerTotal}**!\n\nYour **{betAmount}** Gold Coins just became **{winnings}** Gold Coins!\n\n💰 Your vault now holds: **{newBalance}** Gold Coins\n\nEnjoy your luck while it lasts, friend!`,
                `Curses! Your **{result}** beats my measly **{dealerTotal}**!\n\nTake your **{winnings}** Gold Coins and don't let it go to your head!\n\n💰 New balance: **{newBalance}** Gold Coins\n\nThe cards were with you this time...`
            ]
        },
        playerBlackjack: {
            titles: [
                '🃏 BLACKJACK! Outstanding!',
                '✨ Natural Twenty-One!',
                '🏆 Perfect Hand!',
                '💎 Blackjack Beauty!'
            ],
            descriptions: [
                `BLACKJACK! **{playerHand}** - A natural twenty-one!\n\nThat's **{winnings}** Gold Coins at 1.5x payout, friend!\n\n💰 Your vault shows: **{newBalance}** Gold Coins\n\nNow THAT'S what I call a perfect hand! Well played!`,
                `By my beard! A natural blackjack with **{playerHand}**!\n\nYour **{betAmount}** coins just became **{winnings}** at premium odds!\n\n💰 Updated balance: **{newBalance}** Gold Coins\n\nThat's the kind of hand legends are made of!`
            ]
        },
        dealerWin: {
            titles: [
                '😈 House Advantage!',
                '💸 Better Luck Next Hand!',
                '🃏 Dealer Takes It!',
                '😆 Cards Favor the House!'
            ],
            descriptions: [
                `My **{dealerTotal}** beats your **{playerTotal}**!\n\nThose **{betAmount}** Gold Coins? Mine now!\n\n💸 Your vault balance: **{newBalance}** Gold Coins\n\nThat's how the game goes, friend! Try again!`,
                `Hah! **{dealerTotal}** for me, **{playerTotal}** for you!\n\nI'll take those **{betAmount}** Gold Coins, thank you!\n\n💸 Remaining balance: **{newBalance}** Gold Coins\n\nThe house edge never sleeps!`
            ]
        },
        playerBust: {
            titles: [
                '💥 BUST! Over Twenty-One!',
                '💸 Too Greedy, Friend!',
                '🃏 Busted Hand!',
                '😆 Went Too Far!'
            ],
            descriptions: [
                `BUST! Your hand totaled **{playerTotal}** - over twenty-one!\n\n💸 Those **{betAmount}** Gold Coins are mine!\n\nVault balance: **{newBalance}** Gold Coins\n\nKnow when to stand, friend!`,
                `Ohohoho! **{playerTotal}** is a bust! Too greedy!\n\n💸 **{betAmount}** Gold Coins in my pocket!\n\nBalance: **{newBalance}** Gold Coins\n\nSometimes less is more!`
            ]
        },
        push: {
            titles: [
                '🤝 Push - It\'s a Tie!',
                '↔️ Even Steven!',
                '🤷 Nobody Wins!',
                '⚖️ Perfectly Balanced!'
            ],
            descriptions: [
                `We both got **{total}** - it's a push!\n\nYour **{betAmount}** Gold Coins stay right where they are!\n\n💰 Vault balance: **{balance}** Gold Coins\n\nWell, that was anticlimactic!`,
                `**{total}** for both of us! Nobody wins, nobody loses!\n\nKeep your **{betAmount}** Gold Coins for another round!\n\n💰 Balance unchanged: **{balance}** Gold Coins\n\nThat's what I call a standoff!`
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
                
                // Update loan with interest, late fee, and missed payment
                await db.updateLoan(loan.loan_id, finalBalance, newMissedPayments);
                
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

client.once('clientReady', () => {
    console.log(`${client.user.tag} is online and ready to make some deals! Heh heh heh...`);

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
                    name: '🃏 !blackjack <amount>',
                    value: 'Play blackjack against the house! Get 21 or close to beat the dealer!\n*Example: `!blackjack 50`*',
                    inline: false
                },
                {
                    name: '👆 !hit',
                    value: 'Draw another card in your active blackjack game!',
                    inline: true
                },
                {
                    name: '✋ !stand',
                    value: 'Keep your current hand and let the dealer play!',
                    inline: true
                },
                {
                    name: '🧮 !count',
                    value: 'Pay 10% of your current bet to peek at the running and true count of your personal two-deck blackjack shoe!',
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
                },
                {
                    name: '📊 !viewloans',
                    value: 'View all active loans in the system with user details\n*Example: `!viewloans`*',
                    inline: true
                }
            );
        }

        embed.addFields(
            {
                name: '📋 How It Works:',
                value: '• Everyone starts with **1000 Gold Coins**\n• **Roll:** 1-100, highest roll wins (2x payout)\n• **Blackjack:** Get 21 or beat dealer (2x payout, 2.5x for blackjack!)\n• Lose = I keep your coins! Heh heh...',
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

    if (command === 'viewloans' || command === 'allloans') {
        if (!hasAdminAccess(message.member)) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('🚫 Admin Only, Friend!')
                .setDescription('Whoa there! Only admins can view all loans! You need the **Gamba Bot Admin** role for that kind of access, capisce?');
            return await safeReply(message, { embeds: [embed] });
        }

        try {
            const allLoans = await db.getAllActiveLoansWithUsers();

            if (allLoans.length === 0) {
                const embed = new EmbedBuilder()
                    .setColor('#00ff88')
                    .setTitle('📊 No Active Loans!')
                    .setDescription('Excellent! No one owes me anything right now, boss!\n\nEveryone\'s got clean slates!');
                return await safeReply(message, { embeds: [embed] });
            }

            let description = `Found **${allLoans.length}** active loans, boss!\n\n`;
            let totalDebt = 0;

            // Split loans into chunks of 5 for readability
            const chunkSize = 5;
            const chunks = [];
            for (let i = 0; i < allLoans.length; i += chunkSize) {
                chunks.push(allLoans.slice(i, i + chunkSize));
            }

            // Process first chunk for main embed
            const firstChunk = chunks[0];
            firstChunk.forEach((loan, index) => {
                const balance = Math.round(loan.current_balance * 100) / 100;
                const minPayment = Math.max(25, Math.ceil(balance * 0.03));
                const nextDue = new Date(loan.next_payment_due).toLocaleDateString();
                const userGold = loan.user_gold_coins;

                description += `**Loan #${loan.loan_id}** - <@${loan.user_id}>\n`;
                description += `• Balance: **${balance}** Gold Coins\n`;
                description += `• User's Gold: **${userGold}** Gold Coins\n`;
                description += `• Min Payment: **${minPayment}** Gold Coins\n`;
                description += `• Next Due: **${nextDue}**\n`;
                description += `• Missed: **${loan.missed_payments}**\n\n`;

                totalDebt += balance;
            });

            description += `💰 **Total Outstanding Debt:** **${Math.round(totalDebt * 100) / 100}** Gold Coins`;

            const embed = new EmbedBuilder()
                .setColor('#ffd700')
                .setTitle('📊 All Active Loans')
                .setDescription(description)
                .setFooter({ text: `Showing ${Math.min(chunkSize, allLoans.length)} of ${allLoans.length} loans` });

            await safeReply(message, { embeds: [embed] });

            // Send additional embeds for remaining chunks
            for (let i = 1; i < chunks.length; i++) {
                const chunk = chunks[i];
                let chunkDescription = '';

                chunk.forEach((loan) => {
                    const balance = Math.round(loan.current_balance * 100) / 100;
                    const minPayment = Math.max(25, Math.ceil(balance * 0.03));
                    const nextDue = new Date(loan.next_payment_due).toLocaleDateString();
                    const userGold = loan.user_gold_coins;

                    chunkDescription += `**Loan #${loan.loan_id}** - <@${loan.user_id}>\n`;
                    chunkDescription += `• Balance: **${balance}** Gold Coins\n`;
                    chunkDescription += `• User's Gold: **${userGold}** Gold Coins\n`;
                    chunkDescription += `• Min Payment: **${minPayment}** Gold Coins\n`;
                    chunkDescription += `• Next Due: **${nextDue}**\n`;
                    chunkDescription += `• Missed: **${loan.missed_payments}**\n\n`;
                });

                const continuationEmbed = new EmbedBuilder()
                    .setColor('#ffd700')
                    .setTitle(`📊 All Active Loans (continued)`)
                    .setDescription(chunkDescription)
                    .setFooter({ text: `Showing ${i * chunkSize + 1}-${Math.min((i + 1) * chunkSize, allLoans.length)} of ${allLoans.length} loans` });

                await message.channel.send({ embeds: [continuationEmbed] });
            }

        } catch (error) {
            console.error('Error fetching all loans:', error);
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('🚫 Database Error!')
                .setDescription('Sorry boss, had trouble fetching the loan data! Check the logs for details.');
            return await safeReply(message, { embeds: [embed] });
        }

        return;
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
        const playerRoll = Math.floor(Math.random() * 100) + 1;
        const botRoll = Math.floor(Math.random() * 100) + 1;
        
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

            // Choose appropriate message pool based on loan count vs debt amount
            let description;
            if (existingLoans.length === 1) {
                // Use totalDebt message for single loan
                description = getRandomMessage(GOBLIN_MESSAGES.loans.denial.totalDebt)
                    .replace('{totalDebt}', Math.round(totalDebt));
            } else {
                // Use existingLoans message for multiple loans
                description = getRandomMessage(GOBLIN_MESSAGES.loans.denial.existingLoans)
                    .replace('{existingLoans}', existingLoans.length);
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
            const description = getRandomMessage(GOBLIN_MESSAGES.loans.denial.insufficientCollateral)
                .replace('{amount}', loanAmount)
                .replace('{balance}', user.gold_coins);

            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle(title)
                .setDescription(description);
            return await safeReply(message, { embeds: [embed] });
        }

        try {
            // Create the loan and update user's balance atomically
            const loan = await db.createLoanTransaction(message.author.id, loanAmount);
            const newBalance = user.gold_coins + loanAmount;

            const title = getRandomMessage(GOBLIN_MESSAGES.loans.approval.titles);
            const description = getRandomMessage(GOBLIN_MESSAGES.loans.approval.descriptions)
                .replace(/{amount}/g, loanAmount)
                .replace('{newBalance}', newBalance);

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle(title)
                .setDescription(description);

            return await safeReply(message, { embeds: [embed] });
        } catch (loanError) {
            console.error('Error creating loan:', loanError);
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('🚫 Loan Transaction Failed!')
                .setDescription('Sorry friend, something went wrong with your loan application! The transaction has been rolled back - no loan created and no coins deducted. Try again in a moment!');
            return await safeReply(message, { embeds: [embed] });
        }
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
                .replace(/{paymentAmount}/g, paymentAmount)
                .replace(/{userBalance}/g, newUserBalance);
        } else {
            title = getRandomMessage(GOBLIN_MESSAGES.loanPayment.success.titles);
            description = getRandomMessage(GOBLIN_MESSAGES.loanPayment.success.descriptions)
                .replace(/{paymentAmount}/g, paymentAmount)
                .replace(/{newBalance}/g, Math.round(newLoanBalance * 100) / 100)
                .replace(/{userBalance}/g, newUserBalance);
        }

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle(title)
            .setDescription(description);
        
        return await safeReply(message, { embeds: [embed] });
    }

    if (command === 'forgiveloan') {
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

    if (command === 'blackjack') {
        const betAmount = parseInt(args[0]);
        
        if (!betAmount || betAmount <= 0) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('🃏 Invalid Bet Amount!')
                .setDescription('Listen here, friend! You gotta put down some real coin for blackjack!\n*Example: `!blackjack 100`*');
            return await safeReply(message, { embeds: [embed] });
        }

        if (betAmount > user.gold_coins) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('💸 Insufficient Funds for Blackjack!')
                .setDescription(`You want to bet **${betAmount}** Gold Coins but only got **${user.gold_coins}** in your vault!\n\nCan't play what you can't afford, capisce?`);
            return await safeReply(message, { embeds: [embed] });
        }

        // Check if user already has an active game
        if (activeBlackjackGames.has(message.author.id)) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('🃏 Game Already in Progress!')
                .setDescription('Hold up there! You already got cards on the table!\n\nFinish your current hand with `!hit` or `!stand` before starting a new game!');
            return await safeReply(message, { embeds: [embed] });
        }

        // Start new blackjack game
        const firstPlayerDraw = drawCardForPlayer(message.author.id);
        const secondPlayerDraw = drawCardForPlayer(message.author.id);
        const firstDealerDraw = drawCardForPlayer(message.author.id);
        const secondDealerDraw = drawCardForPlayer(message.author.id);

        const reshuffled =
            firstPlayerDraw.reshuffled ||
            secondPlayerDraw.reshuffled ||
            firstDealerDraw.reshuffled ||
            secondDealerDraw.reshuffled;

        const playerHand = [firstPlayerDraw.card, secondPlayerDraw.card];
        const dealerHand = [firstDealerDraw.card, secondDealerDraw.card];

        const game = {
            userId: message.author.id,
            betAmount: betAmount,
            playerHand: playerHand,
            dealerHand: dealerHand,
            gameOver: false,
            channelId: message.channel.id,
            countUsed: false,
            reshuffled
        };

        activeBlackjackGames.set(message.author.id, game);

        const playerTotal = calculateHandValue(playerHand);
        const dealerUpCard = dealerHand[1];
        const dealerUpValue = getCardValue(dealerUpCard);

        // Check for immediate blackjack
        if (isBlackjack(playerHand)) {
            const dealerTotal = calculateHandValue(dealerHand);
            
            if (isBlackjack(dealerHand)) {
                // Push - both have blackjack
                activeBlackjackGames.delete(message.author.id);
                const title = getRandomMessage(GOBLIN_MESSAGES.blackjack.push.titles);
                const description = getRandomMessage(GOBLIN_MESSAGES.blackjack.push.descriptions)
                    .replace(/{total}/g, 21)
                    .replace(/{betAmount}/g, betAmount)
                    .replace(/{balance}/g, user.gold_coins);

                const embed = new EmbedBuilder()
                    .setColor('#ffd700')
                    .setTitle(title)
                    .setDescription(description)
                    .addFields(
                        { name: '🃏 Your Hand', value: `${formatHand(playerHand)} = **${playerTotal}**`, inline: true },
                        { name: '🎰 Dealer Hand', value: `${formatHand(dealerHand)} = **${dealerTotal}**`, inline: true }
                    );
                return await safeReply(message, { embeds: [embed] });
            } else {
                // Player blackjack wins
                const winnings = Math.floor(betAmount * 2.5); // 1.5x payout for blackjack
                const newBalance = user.gold_coins + winnings - betAmount;
                await db.updateGoldCoins(message.author.id, newBalance);
                activeBlackjackGames.delete(message.author.id);

                const title = getRandomMessage(GOBLIN_MESSAGES.blackjack.playerBlackjack.titles);
                const description = getRandomMessage(GOBLIN_MESSAGES.blackjack.playerBlackjack.descriptions)
                    .replace(/{playerHand}/g, formatHand(playerHand))
                    .replace(/{betAmount}/g, betAmount)
                    .replace(/{winnings}/g, winnings)
                    .replace(/{newBalance}/g, newBalance);

                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle(title)
                    .setDescription(description)
                    .addFields(
                        { name: '🃏 Your Hand', value: `${formatHand(playerHand)} = **${playerTotal}** (BLACKJACK!)`, inline: true },
                        { name: '🎰 Dealer Hand', value: `${formatHand(dealerHand)} = **${calculateHandValue(dealerHand)}**`, inline: true }
                    );
                return await safeReply(message, { embeds: [embed] });
            }
        }

        // Regular game start
        const title = getRandomMessage(GOBLIN_MESSAGES.blackjack.gameStart.titles);
        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(title)
            .setDescription(`Alright friend, let's see what the cards have in store for us!\n\n**Bet:** ${betAmount} Gold Coins\n**Your balance:** ${user.gold_coins} Gold Coins`)
            .addFields(
                { name: '🃏 Your Hand', value: `${formatHand(playerHand)} = **${playerTotal}**`, inline: true },
                { name: '🎰 Dealer Hand', value: `${formatHand(dealerHand, true)} = **${dealerUpValue}+**`, inline: true },
                { name: '🎮 Your Move', value: 'Use `!hit` to draw another card or `!stand` to keep your current hand!', inline: false }
            );

        if (game.reshuffled) {
            embed.addFields({
                name: 'Important: Fresh Shoe',
                value: 'Your personal two-deck shoe was reshuffled. The running count for your sessions has been reset.'
            });
            game.reshuffled = false;
        }

        return await safeReply(message, { embeds: [embed] });
    }

    if (command === 'hit') {
        const game = activeBlackjackGames.get(message.author.id);
        
        if (!game) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('🃏 No Active Game!')
                .setDescription('You don\'t have any cards on the table, friend!\n\nStart a new game with `!blackjack <amount>`');
            return await safeReply(message, { embeds: [embed] });
        }

        if (game.gameOver) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('🃏 Game Already Finished!')
                .setDescription('This hand is already over! Start a new game with `!blackjack <amount>`');
            return await safeReply(message, { embeds: [embed] });
        }

        // Draw a card
        const { card: newCard, reshuffled: shoeRefreshed } = drawCardForPlayer(message.author.id);
        game.playerHand.push(newCard);
        const playerTotal = calculateHandValue(game.playerHand);

        if (isBust(game.playerHand)) {
            // Player busted
            const newBalance = user.gold_coins - game.betAmount;
            await db.updateGoldCoins(message.author.id, newBalance);
            activeBlackjackGames.delete(message.author.id);

            const title = getRandomMessage(GOBLIN_MESSAGES.blackjack.playerBust.titles);
            const description = getRandomMessage(GOBLIN_MESSAGES.blackjack.playerBust.descriptions)
                .replace(/{playerTotal}/g, playerTotal)
                .replace(/{betAmount}/g, game.betAmount)
                .replace(/{newBalance}/g, newBalance);

            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle(title)
                .setDescription(description)
                .addFields(
                    { name: '🃏 Your Hand', value: `${formatHand(game.playerHand)} = **${playerTotal}** (BUST!)`, inline: true },
                    { name: '🎰 Dealer Hand', value: `${formatHand(game.dealerHand, true)}`, inline: true }
                );

            if (shoeRefreshed) {
                embed.addFields({
                    name: 'Important: Fresh Shoe',
                    value: 'Your personal two-deck shoe was reshuffled due to a natural shuffle or hourly refresh. Counts have been reset.'
                });
            }
            return await safeReply(message, { embeds: [embed] });
        } else {
            // Still in play
            const dealerUpValue = getCardValue(game.dealerHand[1]);
            const embed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🃏 Card Drawn!')
                .setDescription(`You drew **${newCard.rank}${newCard.suit}**!\n\n**Your total:** ${playerTotal}`)
                .addFields(
                    { name: '🃏 Your Hand', value: `${formatHand(game.playerHand)} = **${playerTotal}**`, inline: true },
                    { name: '🎰 Dealer Hand', value: `${formatHand(game.dealerHand, true)} = **${dealerUpValue}+**`, inline: true },
                    { name: '🎮 Your Move', value: 'Use `!hit` for another card or `!stand` to end your turn!', inline: false }
                );

            if (shoeRefreshed) {
                embed.addFields({
                    name: 'Important: Fresh Shoe',
                    value: 'Your personal two-deck shoe was reshuffled due to a natural shuffle or hourly refresh. Counts have been reset.'
                });
            }
            return await safeReply(message, { embeds: [embed] });
        }
    }

    if (command === 'count') {
        const game = activeBlackjackGames.get(message.author.id);

        if (!game) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('🃏 No Active Game!')
                .setDescription('You need an active blackjack hand to peek at the count. Start a new game with `!blackjack <amount>`.');
            return await safeReply(message, { embeds: [embed] });
        }

        if (game.gameOver) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('🃏 Game Already Finished!')
                .setDescription('That hand is already settled. Start a fresh game to get another count!');
            return await safeReply(message, { embeds: [embed] });
        }

        if (game.countUsed) {
            const embed = new EmbedBuilder()
                .setColor('#ffaa00')
                .setTitle('🧮 Count Already Requested')
                .setDescription('You already paid for the count this hand. Finish the round or start a new game for another peek.');
            return await safeReply(message, { embeds: [embed] });
        }

        const cost = Math.max(1, Math.floor(game.betAmount * 0.1));

        if (user.gold_coins < cost) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('💸 Not Enough Gold!')
                .setDescription(`Peeking at the count costs **${cost}** Gold Coins, but you've only got **${user.gold_coins}**. Win a few more hands and try again!`);
            return await safeReply(message, { embeds: [embed] });
        }

        const newBalance = user.gold_coins - cost;
        await db.updateGoldCoins(message.author.id, newBalance);
        user.gold_coins = newBalance;
        game.countUsed = true;

        const { shoe, reshuffled: shoeRefreshed } = ensurePlayerShoe(message.author.id);
        const runningCount = shoe.runningCount;
        const decksRemaining = shoe.cards.length / 52;
        const trueCount = decksRemaining > 0 ? runningCount / decksRemaining : runningCount;
        const roundedTrueCount = Math.round(trueCount * 100) / 100;
        const displayedTrueCount = roundedTrueCount === 0 ? 0 : roundedTrueCount;

        const embed = new EmbedBuilder()
            .setColor('#ffaa00')
            .setTitle('🧮 Shoe Count')
            .setDescription(`Cost deducted: **${cost}** Gold Coins\nNew balance: **${newBalance}** Gold Coins`)
            .addFields(
                { name: 'Running Count', value: `${runningCount}`, inline: true },
                { name: 'True Count', value: `${displayedTrueCount}`, inline: true },
                { name: 'Cards Remaining', value: `${shoe.cards.length}`, inline: true }
            );

        if (shoeRefreshed) {
            embed.addFields({
                name: 'Important',
                value: 'Your personal shoe reshuffled due to a natural shuffle or hourly refresh. Counts have been reset.'
            });
        }

        return await safeReply(message, { embeds: [embed] });
    }

    if (command === 'stand') {
        const game = activeBlackjackGames.get(message.author.id);
        
        if (!game) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('🃏 No Active Game!')
                .setDescription('You don\'t have any cards on the table, friend!\n\nStart a new game with `!blackjack <amount>`');
            return await safeReply(message, { embeds: [embed] });
        }

        if (game.gameOver) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('🃏 Game Already Finished!')
                .setDescription('This hand is already over! Start a new game with `!blackjack <amount>`');
            return await safeReply(message, { embeds: [embed] });
        }

        // Dealer plays
        let shoeRefreshedDuringDealer = false;
        while (calculateHandValue(game.dealerHand) < 17) {
            const { card, reshuffled } = drawCardForPlayer(message.author.id);
            game.dealerHand.push(card);
            shoeRefreshedDuringDealer = shoeRefreshedDuringDealer || reshuffled;
        }

        const playerTotal = calculateHandValue(game.playerHand);
        const dealerTotal = calculateHandValue(game.dealerHand);
        const dealerBusted = isBust(game.dealerHand);

        activeBlackjackGames.delete(message.author.id);

        let title, description, color, newBalance;

        if (dealerBusted || playerTotal > dealerTotal) {
            // Player wins
            const winnings = game.betAmount * 2;
            newBalance = user.gold_coins + game.betAmount; // Net gain is bet amount
            await db.updateGoldCoins(message.author.id, newBalance);

            title = getRandomMessage(GOBLIN_MESSAGES.blackjack.playerWin.titles);
            description = getRandomMessage(GOBLIN_MESSAGES.blackjack.playerWin.descriptions)
                .replace(/{result}/g, dealerBusted ? `${playerTotal} (dealer busted!)` : playerTotal)
                .replace(/{dealerTotal}/g, dealerTotal)
                .replace(/{betAmount}/g, game.betAmount)
                .replace(/{winnings}/g, winnings)
                .replace(/{newBalance}/g, newBalance);
            color = '#00ff00';
        } else if (playerTotal < dealerTotal) {
            // Dealer wins
            newBalance = user.gold_coins - game.betAmount;
            await db.updateGoldCoins(message.author.id, newBalance);

            title = getRandomMessage(GOBLIN_MESSAGES.blackjack.dealerWin.titles);
            description = getRandomMessage(GOBLIN_MESSAGES.blackjack.dealerWin.descriptions)
                .replace(/{dealerTotal}/g, dealerTotal)
                .replace(/{playerTotal}/g, playerTotal)
                .replace(/{betAmount}/g, game.betAmount)
                .replace(/{newBalance}/g, newBalance);
            color = '#ff0000';
        } else {
            // Push
            newBalance = user.gold_coins;
            title = getRandomMessage(GOBLIN_MESSAGES.blackjack.push.titles);
            description = getRandomMessage(GOBLIN_MESSAGES.blackjack.push.descriptions)
                .replace(/{total}/g, playerTotal)
                .replace(/{betAmount}/g, game.betAmount)
                .replace(/{balance}/g, newBalance);
            color = '#ffd700';
        }

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTitle(title)
            .setDescription(description)
            .addFields(
                { name: '🃏 Your Hand', value: `${formatHand(game.playerHand)} = **${playerTotal}**`, inline: true },
                { name: '🎰 Dealer Hand', value: `${formatHand(game.dealerHand)} = **${dealerTotal}**${dealerBusted ? ' (BUST!)' : ''}`, inline: true }
            );

        if (shoeRefreshedDuringDealer) {
            embed.addFields({
                name: 'Important: Fresh Shoe',
                value: 'Your personal two-deck shoe was reshuffled during the dealer\'s turn. Counts have been reset.'
            });
        }

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


client.login(process.env.DISCORD_TOKEN);