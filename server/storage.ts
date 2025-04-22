import { 
  User, 
  InsertUser, 
  GameState, 
  Player, 
  Card,
  CardColor,
  CardValue,
  ChatMessage
} from "@shared/schema";
import { nanoid } from "nanoid";
import { startNewRound as startNewRoundLogic } from "./game"; // Import game logic

// Define storage interface with additional methods for game management
export interface IStorage {
  // User methods
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Game methods
  createGame(hostName: string, pointLimit: number): Promise<GameState>;
  getGame(gameId: string): Promise<GameState | undefined>;
  getGameByRoomCode(roomCode: string): Promise<GameState | undefined>;
  updateGame(gameState: GameState): Promise<GameState>;
  addPlayerToGame(gameId: string, playerName: string): Promise<GameState>;
  startGame(gameId: string): Promise<GameState>;
  startNewRound(gameId: string): Promise<GameState>;
  playCards(gameId: string, playerId: string, cards: Card[]): Promise<GameState>;
  pickCard(gameId: string, playerId: string, cardId: string): Promise<GameState>;
  passTurn(gameId: string, playerId: string): Promise<GameState>;
  updatePlayerConnection(gameId: string, playerId: string, connected: boolean): Promise<GameState>;
  getAllActiveGames(): Promise<GameState[]>;
  
  // Chat methods
  saveChatMessage(gameId: string, playerId: string, playerName: string, message: string): Promise<ChatMessage>;
  getChatMessages(gameId: string): Promise<ChatMessage[]>;
  clearChatMessages(gameId: string): Promise<void>;
}

// Helper function to calculate the numeric value of a play
function calculatePlayValue(cards: Card[]): number {
  if (!cards || cards.length === 0) {
    return 0;
  }
  const valueString = cards
    .map(c => c.value)
    .sort((a, b) => b - a) // Sort descending
    .join('');
  return parseInt(valueString, 10);
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private games: Map<string, GameState>;
  private roomCodes: Map<string, string>; // Maps room codes to game IDs
  private currentId: number;
  private chatMessages = new Map<string, ChatMessage[]>();

  constructor() {
    this.users = new Map();
    this.games = new Map();
    this.roomCodes = new Map();
    this.currentId = 1;
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Game methods
  async createGame(hostName: string, pointLimit: number): Promise<GameState> {
    // Generate unique room code (6 chars, alphanumeric)
    let roomCode: string;
    do {
      roomCode = nanoid(6).toUpperCase();
    } while (this.roomCodes.has(roomCode));

    const gameId = nanoid();
    const hostId = nanoid();

    // Create initial game state
    const gameState: GameState = {
      id: gameId,
      roomCode,
      status: "waiting",
      players: [{
        id: hostId,
        name: hostName,
        isHost: true,
        hand: [],
        score: 0,
        connected: true
      }],
      deck: [],
      currentTurn: 0,
      currentPlay: [],
      previousPlay: [],
      roundWinner: null,
      gameWinner: null,
      pointLimit,
      lastAction: {
        type: null,
        playerId: null
      },
      passCount: 0
    };

    this.games.set(gameId, gameState);
    this.roomCodes.set(roomCode, gameId);
    return gameState;
  }

  async getGame(gameId: string): Promise<GameState | undefined> {
    return this.games.get(gameId);
  }

  async getGameByRoomCode(roomCode: string): Promise<GameState | undefined> {
    const gameId = this.roomCodes.get(roomCode);
    if (!gameId) return undefined;
    return this.games.get(gameId);
  }

  async updateGame(gameState: GameState): Promise<GameState> {
    this.games.set(gameState.id, gameState);
    return gameState;
  }

  async addPlayerToGame(gameId: string, playerName: string): Promise<GameState> {
    const game = await this.getGame(gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "waiting") throw new Error("Game has already started");
    // Suppression de la limite de 6 joueurs
    // Calcul de la valeur maximale basée sur le jeu de cartes - un joueur minimum doit avoir 2 cartes
    const colors: CardColor[] = ["red", "blue", "green", "yellow", "purple", "orange"];
    const values: CardValue[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const totalCardsInDeck = colors.length * values.length; // 54 cartes
    const maxPlayersLimit = Math.floor(totalCardsInDeck / 2); // Chaque joueur doit avoir au moins 2 cartes
    
    if (game.players.length >= maxPlayersLimit) throw new Error("Game is full");
    if (game.players.some(p => p.name === playerName)) throw new Error("Name already taken");

    const newPlayer: Player = {
      id: nanoid(),
      name: playerName,
      isHost: false,
      hand: [],
      score: 0,
      connected: true
    };

    game.players.push(newPlayer);
    return this.updateGame(game);
  }

  async startGame(gameId: string): Promise<GameState> {
    const game = await this.getGame(gameId);
    if (!game) throw new Error("Game not found");
    if (game.players.length < 2) throw new Error("Not enough players");
    if (game.status !== "waiting") throw new Error("Game has already started");

    // Use the central startNewRound logic to set up the first round
    const startedGame = startNewRoundLogic(game);
    
    // Update status and persist
    startedGame.status = "playing";
    startedGame.gameWinner = null;
    startedGame.lastAction = {
      type: null,
      playerId: null
    };
    
    return this.updateGame(startedGame);
  }

  async startNewRound(gameId: string): Promise<GameState> {
    const game = await this.getGame(gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "playing") throw new Error("Game is not in progress");
    
    // Use the imported game logic function
    const updatedGame = startNewRoundLogic(game);
    
    // Persist the updated game state
    return this.updateGame(updatedGame);
  }

  async playCards(gameId: string, playerId: string, cards: Card[]): Promise<GameState> {
    const game = await this.getGame(gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "playing") throw new Error("Game is not in progress");
    
    const playerIndex = game.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) throw new Error("Player not found");
    
    if (playerIndex !== game.currentTurn) throw new Error("Not your turn");
    
    const player = game.players[playerIndex];
    
    // Check if cards array is empty
    if (!cards || cards.length === 0) {
        throw new Error("You must play at least one card.");
    }
    
    // Check if all cards to be played are in player's hand
    for (const card of cards) {
      if (!player.hand.some(c => c.id === card.id)) {
        throw new Error("Card not in player's hand");
      }
    }
    
    // Check if the played cards themselves are valid (all same value or all same color)
    const firstCard = cards[0];
    const playedValue = firstCard.value;
    const playedColor = firstCard.color;
    const allSameValue = cards.every(c => c.value === playedValue);
    const allSameColor = cards.every(c => c.color === playedColor);

    if (!allSameValue && !allSameColor) {
      throw new Error("All cards played must be the same value or the same color");
    }
    
    // === START VALIDATION ===

    // Rule: First play of the round must be exactly one card
    if (game.currentPlay.length === 0 && cards.length !== 1) {
      throw new Error("Must play exactly one card on the first turn of the round.");
    }

    // Validate subsequent plays against the current play
    if (game.currentPlay.length > 0) {
      // Rule: Must play the exact same number OR one more card than the current play
      if (cards.length !== game.currentPlay.length && cards.length !== game.currentPlay.length + 1) {
        throw new Error(`Must play ${game.currentPlay.length} or ${game.currentPlay.length + 1} card(s)`);
      }
      
      const currentPlayCards = game.currentPlay;
      const firstCurrentCard = currentPlayCards[0];
      const currentIsSameValue = currentPlayCards.every(c => c.value === firstCurrentCard.value);
      const currentIsSameColor = currentPlayCards.every(c => c.color === firstCurrentCard.color);
      
      // CORRECTION: Les cartes jouées doivent être cohérentes (même valeur OU même couleur) entre elles
      // mais n'ont pas besoin de correspondre au type du jeu précédent
      if (!allSameValue && !allSameColor) {
        throw new Error("All cards played must be the same value or the same color");
      }
      
      // SUPPRESSION: On retire les vérifications qui exigent que le type de jeu soit préservé
      // La règle n'exige pas que si l'adversaire a joué des cartes de même valeur, je doive aussi jouer des cartes de même valeur
      // Ce qui compte c'est que:
      // 1. Mes cartes soient cohérentes entre elles (allSameValue ou allSameColor)
      // 2. SOIT le premier joueur a joué de la couleur X et je joue aussi de la couleur X
      // 3. SOIT le premier joueur a joué de la valeur Y et je joue aussi de la valeur Y
      // 4. SOIT je joue une combinaison qui a une valeur supérieure

      // Rule: Played cards must match the value OR color of the current play OR have a higher value
      let matchesValue = false;
      let matchesColor = false;
      
      // Si toutes mes cartes ont la même valeur et au moins une carte du jeu précédent a cette valeur
      if (allSameValue) {
        matchesValue = currentPlayCards.some(c => c.value === playedValue);
      }
      
      // Si toutes mes cartes ont la même couleur et au moins une carte du jeu précédent a cette couleur
      if (allSameColor) {
        matchesColor = currentPlayCards.some(c => c.color === playedColor);
      }

      // Calculer les valeurs combinées pour la comparaison
      const currentPlayValue = calculatePlayValue(currentPlayCards);
      const playedCombinedValue = calculatePlayValue(cards);

      // La règle principale: 
      // Si mes cartes correspondent par couleur ou valeur, ou si la valeur combinée est supérieure
      if (!matchesValue && !matchesColor && playedCombinedValue <= currentPlayValue) {
        throw new Error(`Your play value (${playedCombinedValue}) must be higher than the current play value (${currentPlayValue}) or match color/value`);
      }

      // Si les cartes correspondent par couleur ou valeur, elles doivent avoir une valeur strictement supérieure
      if ((matchesValue || matchesColor) && playedCombinedValue <= currentPlayValue) {
        throw new Error(`Even when matching color/value, your play value (${playedCombinedValue}) must be higher than the current play value (${currentPlayValue})`);
      }
    } 
    // === END VALIDATION ===
    
    // Sort the played cards by value descending BEFORE storing them
    const sortedPlayedCards = [...cards].sort((a, b) => b.value - a.value);
    
    // Move cards from hand to play area
    game.previousPlay = [...game.currentPlay]; // Keep previous play for potential pick
    game.currentPlay = sortedPlayedCards; // Store sorted cards
    player.hand = player.hand.filter(c => !sortedPlayedCards.some(card => card.id === c.id));
    
    const requiresPick = game.previousPlay.length > 0;
    let turnAdvanced = false;
    
    // Check if player has emptied their hand (round win)
    if (player.hand.length === 0) {
      game.roundWinner = player.id;
      
      // Update scores for all players
      for (const p of game.players) {
        p.score += p.hand.length;
      }
      
      // Check if any player reached point limit (game win)
      const highestScore = Math.max(...game.players.map(p => p.score));
      if (highestScore >= game.pointLimit) {
        game.status = "finished";
        // Winner is the player with the lowest score
        const lowestScore = Math.min(...game.players.map(p => p.score));
        game.gameWinner = game.players.find(p => p.score === lowestScore)?.id || null;
      }
      
      game.lastAction = {
        type: "round_end",
        playerId: player.id
      };
      // Turn logic is handled by round start/game end
      
    } else {
      // Player did not win, set up next action/turn
      
      // Update last action (using sorted cards)
      game.lastAction = {
        type: "play",
        playerId: player.id,
        cards: sortedPlayedCards 
      };

      // If no card pick is required (e.g., first turn), advance turn immediately
      if (!requiresPick) {
         game.currentTurn = (playerIndex + 1) % game.players.length;
         turnAdvanced = true;
      } 
      // Else: Pick is required, turn advances after pickCard is called by the client.
    }
    
    // Reset pass count on any successful play
    game.passCount = 0;
    
    // Auto-pick if there's only one card in the previous play
    if (requiresPick && game.previousPlay.length === 1) {
      const cardToPickId = game.previousPlay[0].id;
      
      // Add the card to player's hand
      player.hand.push(game.previousPlay[0]);
      
      // Clear previous play
      game.previousPlay = [];
      
      // Move to next player's turn
      game.currentTurn = (playerIndex + 1) % game.players.length;
      
      // Update last action
      game.lastAction = {
        type: "pick",
        playerId: player.id
      };
    }
    
    return this.updateGame(game);
  }

  async pickCard(gameId: string, playerId: string, cardId: string): Promise<GameState> {
    const game = await this.getGame(gameId);
    if (!game) throw new Error("Game not found");
    
    const playerIndex = game.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) throw new Error("Player not found");
    
    if (game.lastAction.type !== "play" || game.lastAction.playerId !== playerId) {
      throw new Error("You can only pick a card after playing");
    }
    
    // Find the card in the previous play
    const cardIndex = game.previousPlay.findIndex(c => c.id === cardId);
    if (cardIndex === -1) throw new Error("Card not found in previous play");
    
    const card = game.previousPlay[cardIndex];
    const player = game.players[playerIndex];
    
    // Add the card to player's hand
    player.hand.push(card);
    
    // Remove the card from previous play
    game.previousPlay = game.previousPlay.filter(c => c.id !== cardId);
    
    // Add remaining cards to the deck and shuffle
    game.deck = [...game.deck, ...game.previousPlay];
    for (let i = game.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [game.deck[i], game.deck[j]] = [game.deck[j], game.deck[i]];
    }
    
    game.previousPlay = [];
    
    // Move to next player's turn
    game.currentTurn = (game.currentTurn + 1) % game.players.length;
    
    // Update last action
    game.lastAction = {
      type: "pick",
      playerId: player.id
    };
    
    return this.updateGame(game);
  }

  async passTurn(gameId: string, playerId: string): Promise<GameState> {
    const game = await this.getGame(gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "playing") throw new Error("Game is not in progress");
    
    const playerIndex = game.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) throw new Error("Player not found");
    
    if (playerIndex !== game.currentTurn) throw new Error("Not your turn");

    // Si aucune carte n'a été jouée (currentPlay est vide), le joueur ne peut pas passer
    if (game.currentPlay.length === 0) {
      throw new Error("You cannot pass when no cards have been played. You must play a card.");
    }
    
    // Increment pass count
    game.passCount++;
    
    // Calcul du prochain joueur
    const nextPlayerIndex = (playerIndex + 1) % game.players.length;

    // Si le tour revient au joueur qui a posé les dernières cartes (et qu'il y a des cartes)
    const isLastPlayerWhoPlayed =
        game.lastAction.type === "play" &&
        game.lastAction.playerId === game.players[nextPlayerIndex].id &&
        game.currentPlay.length > 0; // Ensure there are cards to clear

    // Condition pour vider le milieu:
    // 1. Le tour revient au dernier joueur qui a joué (et il y a des cartes)
    // 2. OU tout le monde a passé consécutivement
    if (isLastPlayerWhoPlayed || game.passCount >= game.players.length - 1) {
      // Ajouter les cartes au deck
      game.deck = [...game.deck, ...game.currentPlay, ...game.previousPlay];
      
      // Vider les zones de jeu
      game.currentPlay = [];
      game.previousPlay = [];
      
      // Réinitialiser le compteur de passes
      game.passCount = 0;
      
      // Mettre à jour la dernière action pour indiquer une fin de 'mini-round' ou de manche
      // Le tour du joueur 'nextPlayerIndex' commencera avec une table vide.
      game.lastAction = {
        type: "round_end", // Using round_end signifies the board was cleared
        playerId: null
      };

      // Assigner le tour au joueur qui recommence (celui qui avait posé)
      game.currentTurn = nextPlayerIndex;

    } else {
      // Si le board n'est pas vidé, passer simplement au joueur suivant
      game.currentTurn = nextPlayerIndex;
      
      // Mettre à jour la dernière action pour indiquer un 'pass'
      game.lastAction = {
        type: "pass",
        playerId
      };
    }
    
    return this.updateGame(game);
  }

  async updatePlayerConnection(gameId: string, playerId: string, connected: boolean): Promise<GameState> {
    const game = await this.getGame(gameId);
    if (!game) {
      console.log(`Game ${gameId} not found when updating player ${playerId} connection status`);
      throw new Error("Game not found");
    }
    
    const playerIndex = game.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) throw new Error("Player not found");
    
    // Only update if status actually changes
    if (game.players[playerIndex].connected !== connected) {
      game.players[playerIndex].connected = connected;
      
      // If the host disconnects, make the next connected player the host
      if (!connected && game.players[playerIndex].isHost) {
        const connectedPlayers = game.players.filter(p => p.connected && p.id !== playerId);
        if (connectedPlayers.length > 0) {
          game.players[playerIndex].isHost = false;
          const newHostIndex = game.players.findIndex(p => p.id === connectedPlayers[0].id);
          if (newHostIndex !== -1) {
            game.players[newHostIndex].isHost = true;
          }
        }
      }
      
      return this.updateGame(game);
    }
    
    return game; // Return existing game if no change
  }

  async getAllActiveGames(): Promise<GameState[]> {
    return Array.from(this.games.values())
      .filter(game => game.status !== "finished" && game.players.some(p => p.connected));
  }

  // Chat methods
  async saveChatMessage(gameId: string, playerId: string, playerName: string, message: string): Promise<ChatMessage> {
    if (!this.chatMessages.has(gameId)) {
      this.chatMessages.set(gameId, []);
    }
    
    const chatMessage: ChatMessage = {
      id: nanoid(),
      gameId,
      playerId,
      playerName,
      message,
      timestamp: Date.now()
    };
    
    this.chatMessages.get(gameId)!.push(chatMessage);
    
    // Limit chat history to last 100 messages
    const gameMessages = this.chatMessages.get(gameId)!;
    if (gameMessages.length > 100) {
      this.chatMessages.set(gameId, gameMessages.slice(gameMessages.length - 100));
    }
    
    return chatMessage;
  }
  
  async getChatMessages(gameId: string): Promise<ChatMessage[]> {
    return this.chatMessages.get(gameId) || [];
  }
  
  async clearChatMessages(gameId: string): Promise<void> {
    this.chatMessages.delete(gameId);
  }
}

export const storage = new MemStorage();
