import { GameState, Card, CardColor, CardValue, Player } from "@shared/schema";
import { nanoid } from "nanoid";

// Helper functions for game logic
export function createDeck(): Card[] {
  const deck: Card[] = [];
  const colors: CardColor[] = ["red", "blue", "green", "yellow", "purple", "orange"];
  const values: CardValue[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  for (const color of colors) {
    for (const value of values) {
      deck.push({ id: nanoid(), color, value });
    }
  }

  return shuffleDeck(deck);
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Deal cards to all players
export function dealCards(game: GameState): GameState {
  const updatedGame = { ...game };
  const deck = [...updatedGame.deck];
  
  // Calculate maximum cards per player based on the CURRENT deck size
  const playerCount = updatedGame.players.length;
  if (playerCount === 0) return updatedGame; // Avoid division by zero if no players

  // Calculate the number of cards each player should receive from the available deck
  const cardsToDeal = deck.length; // Total cards available to deal
  const maxCardsPerPlayer = Math.min(9, Math.floor(cardsToDeal / playerCount)); // Distribute available cards evenly, capped at 9

  // Ensure we have enough cards for at least one per player if possible
  if (cardsToDeal < playerCount && cardsToDeal > 0) {
      // This scenario shouldn't ideally happen if startNewRound refills correctly, 
      // but as a safeguard, maybe distribute one card each until deck runs out?
      // For now, stick to the even distribution logic. If maxCardsPerPlayer is 0, no cards are dealt.
  }

  // Deal cards evenly
  for (const player of updatedGame.players) {
    player.hand = [];
    // Only deal up to maxCardsPerPlayer, ensuring deck isn't empty
    for (let i = 0; i < maxCardsPerPlayer && deck.length > 0; i++) { 
      const card = deck.pop()!; // pop() is safe due to deck.length check
      player.hand.push(card);
    }
  }
  
  updatedGame.deck = deck; // Update the deck with remaining cards
  return updatedGame;
}

// Start a new round
export function startNewRound(game: GameState): GameState {
  // Create a fresh deck for every new round to avoid duplicate cards
  const updatedGame = { ...game };
  updatedGame.deck = createDeck();
  
  // Deal cards
  const gameWithDealtCards = dealCards(updatedGame);
  
  // Reset round state
  gameWithDealtCards.currentPlay = [];
  gameWithDealtCards.previousPlay = [];
  gameWithDealtCards.roundWinner = null;
  gameWithDealtCards.passCount = 0;
  
  // Find the player with the lowest score to start
  // If tied, use the current order
  const lowestScore = Math.min(...gameWithDealtCards.players.map(p => p.score));
  const lowestScoreIndex = gameWithDealtCards.players.findIndex(p => p.score === lowestScore);
  gameWithDealtCards.currentTurn = lowestScoreIndex;
  
  return gameWithDealtCards;
}

// Check if play is valid
export function isValidPlay(
  cards: Card[], 
  currentPlay: Card[], 
  playerHand: Card[]
): { valid: boolean; reason?: string } {
  // Check if player has all cards
  for (const card of cards) {
    if (!playerHand.some(c => c.id === card.id)) {
      return { valid: false, reason: "You don't have all these cards" };
    }
  }
  
  // Check if all cards have the same value or color
  const firstCard = cards[0];
  const sameValue = cards.every(card => card.value === firstCard.value);
  const sameColor = cards.every(card => card.color === firstCard.color);
  
  if (!sameValue && !sameColor) {
    return { 
      valid: false, 
      reason: "All cards must be the same value or same color" 
    };
  }
  
  // If this is the first play, it's valid
  if (currentPlay.length === 0) {
    return { valid: true };
  }
  
  // Check if the number of cards matches or is one more than the current play (per official rules)
  if (cards.length !== currentPlay.length && cards.length !== currentPlay.length + 1) {
    return { 
      valid: false, 
      reason: "You must play the same number of cards or one more than the previous play" 
    };
  }
  
  // Check if this play beats the current play
  const currentFirstCard = currentPlay[0];
  
  // Same value, must be higher color or same color
  if (sameValue) {
    if (firstCard.value > currentFirstCard.value || firstCard.color === currentFirstCard.color) {
      return { valid: true };
    }
    return { 
      valid: false, 
      reason: "You must play higher value cards or match the color" 
    };
  }
  
  // Same color, must be higher value or same value
  if (sameColor) {
    if (firstCard.color === currentFirstCard.color) {
      if (firstCard.value > currentFirstCard.value) {
        return { valid: true };
      }
      return { 
        valid: false, 
        reason: "You must play higher value cards of the same color" 
      };
    }
    return { 
      valid: false, 
      reason: "You must match the color or play cards of the same value" 
    };
  }
  
  return { valid: false, reason: "Invalid play" };
}

// Calculate scores at end of round
export function calculateRoundScores(game: GameState, winnerId: string): GameState {
  const updatedGame = { ...game };
  
  // Add one point per remaining card
  for (const player of updatedGame.players) {
    player.score += player.hand.length;
  }
  
  // Check if any player has reached the point limit
  const highestScore = Math.max(...updatedGame.players.map(p => p.score));
  if (highestScore >= updatedGame.pointLimit) {
    updatedGame.status = "finished";
    
    // Winner is player with lowest score
    const lowestScore = Math.min(...updatedGame.players.map(p => p.score));
    updatedGame.gameWinner = updatedGame.players.find(p => p.score === lowestScore)?.id || null;
  }
  
  return updatedGame;
}

// Generate unique room code
export function generateRoomCode(): string {
  return nanoid(6).toUpperCase();
}

// Filter game state for a specific player (to hide other players' cards)
export function filterGameStateForPlayer(game: GameState, playerId: string): GameState {
  const filteredGame = { ...game };
  
  // Hide other players' cards
  filteredGame.players = game.players.map(player => {
    if (player.id === playerId) {
      return player;
    }
    return {
      ...player,
      hand: player.hand.map(() => ({ id: nanoid(), color: "blue", value: 0 as unknown as CardValue }))
    };
  });
  
  // Hide deck cards
  filteredGame.deck = game.deck.map(() => ({ id: nanoid(), color: "blue", value: 0 as unknown as CardValue }));
  
  return filteredGame;
}
