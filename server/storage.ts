import { 
  User, 
  InsertUser, 
  GameState, 
  Player, 
  Card,
  CardColor,
  CardValue
} from "@shared/schema";
import { nanoid } from "nanoid";

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
  playCards(gameId: string, playerId: string, cards: Card[]): Promise<GameState>;
  pickCard(gameId: string, playerId: string, cardId: string): Promise<GameState>;
  passTurn(gameId: string, playerId: string): Promise<GameState>;
  updatePlayerConnection(gameId: string, playerId: string, connected: boolean): Promise<GameState>;
  getAllActiveGames(): Promise<GameState[]>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private games: Map<string, GameState>;
  private roomCodes: Map<string, string>; // Maps room codes to game IDs
  private currentId: number;

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
    if (game.players.length >= 6) throw new Error("Game is full");
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

    // Create deck
    const deck: Card[] = [];
    const colors: CardColor[] = ["red", "blue", "green", "yellow", "purple", "orange"];
    const values: CardValue[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

    for (const color of colors) {
      for (const value of values) {
        deck.push({ id: nanoid(), color, value });
      }
    }

    // Shuffle deck
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    // Deal cards to players
    for (const player of game.players) {
      player.hand = [];
      for (let i = 0; i < 9; i++) {
        if (deck.length > 0) {
          const card = deck.pop()!;
          player.hand.push(card);
        }
      }
    }

    // Update game state
    game.status = "playing";
    game.deck = deck;
    game.currentTurn = 0;
    game.currentPlay = [];
    game.previousPlay = [];
    game.roundWinner = null;
    game.gameWinner = null;
    game.lastAction = {
      type: null,
      playerId: null
    };
    game.passCount = 0;

    return this.updateGame(game);
  }

  async playCards(gameId: string, playerId: string, cards: Card[]): Promise<GameState> {
    const game = await this.getGame(gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "playing") throw new Error("Game is not in progress");
    
    const playerIndex = game.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) throw new Error("Player not found");
    
    if (playerIndex !== game.currentTurn) throw new Error("Not your turn");
    
    const player = game.players[playerIndex];
    
    // Check if all cards to be played are in player's hand
    for (const card of cards) {
      if (!player.hand.some(c => c.id === card.id)) {
        throw new Error("Card not in player's hand");
      }
    }
    
    // Validate play according to game rules
    if (game.currentPlay.length > 0) {
      // Must match count of cards from previous play or play one more card (per official rules)
      if (cards.length !== game.currentPlay.length && cards.length !== game.currentPlay.length + 1) {
        throw new Error("Must play the same number of cards or one more than the previous play");
      }
      
      // Must be higher value or same value/color
      const prevValue = game.currentPlay[0].value;
      const prevColor = game.currentPlay[0].color;
      const newValue = cards[0].value;
      const newColor = cards[0].color;
      
      // Check if all cards in the play have the same value or color
      const allSameValue = cards.every(c => c.value === newValue);
      const allSameColor = cards.every(c => c.color === newColor);
      
      if (!allSameValue && !allSameColor) {
        throw new Error("All cards in play must be the same value or color");
      }
      
      if (allSameValue && newValue <= prevValue && newColor !== prevColor) {
        throw new Error("Must play higher value cards or match the previous color");
      }
    } else {
      // First play of the round
      // Check if all cards in the play have the same value or color
      const value = cards[0].value;
      const color = cards[0].color;
      
      if (!cards.every(c => c.value === value) && !cards.every(c => c.color === color)) {
        throw new Error("All cards in play must be the same value or color");
      }
    }
    
    // Move cards from hand to play area
    game.previousPlay = [...game.currentPlay];
    game.currentPlay = [...cards];
    player.hand = player.hand.filter(c => !cards.some(card => card.id === c.id));
    
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
    } else {
      // Update last action
      game.lastAction = {
        type: "play",
        playerId: player.id,
        cards
      };
    }
    
    // Reset pass count when a player plays
    game.passCount = 0;
    
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
    
    // Increment pass count
    game.passCount++;
    
    // If all players have passed, start new round
    if (game.passCount >= game.players.length) {
      // Add current play to deck
      game.deck = [...game.deck, ...game.currentPlay, ...game.previousPlay];
      
      // Clear play areas
      game.currentPlay = [];
      game.previousPlay = [];
      
      // Reset pass count
      game.passCount = 0;
      
      // Update last action
      game.lastAction = {
        type: "round_end",
        playerId: null
      };
    } else {
      // Move to next player's turn
      game.currentTurn = (game.currentTurn + 1) % game.players.length;
      
      // Update last action
      game.lastAction = {
        type: "pass",
        playerId
      };
    }
    
    return this.updateGame(game);
  }

  async updatePlayerConnection(gameId: string, playerId: string, connected: boolean): Promise<GameState> {
    const game = await this.getGame(gameId);
    if (!game) throw new Error("Game not found");
    
    const playerIndex = game.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) throw new Error("Player not found");
    
    game.players[playerIndex].connected = connected;
    
    // If the host disconnects, make the next connected player the host
    if (!connected && game.players[playerIndex].isHost) {
      const connectedPlayers = game.players.filter(p => p.connected && p.id !== playerId);
      if (connectedPlayers.length > 0) {
        game.players[playerIndex].isHost = false;
        const newHostIndex = game.players.findIndex(p => p.id === connectedPlayers[0].id);
        game.players[newHostIndex].isHost = true;
      }
    }
    
    return this.updateGame(game);
  }

  async getAllActiveGames(): Promise<GameState[]> {
    return Array.from(this.games.values())
      .filter(game => game.status !== "finished" && game.players.some(p => p.connected));
  }
}

export const storage = new MemStorage();
