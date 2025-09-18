# Changes - Latest Blackjack Shoe Updates

## Summary
- Introduced individualized two-deck blackjack shoes that persist per player, resetting after natural shuffles or one-hour expirations.
- Updated gameplay commands to draw from each player's personal shoe, surfacing notifications whenever a fresh shoe spins up mid-hand or between rounds.
- Adjusted the `!count` command and help copy to describe the personal shoe mechanic while still charging 10% of the active bet for access to running/true counts.

## Notes
- Dealer draws now consume cards from the invoking player's shoe to keep the count accurate for that specific table.
- Shoe reset alerts appear during `!blackjack`, `!hit`, `!stand`, and `!count` to remove ambiguity about when the count has been cleared.
