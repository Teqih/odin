import {
  User,
  InsertUser,
  GameState,
  Player,
  Card,
  CardColor,
  CardValue,
  ChatMessage,
  MessageType,
} from "@shared/schema";
import { findNextActivePlayer } from "./game";
import { nanoid } from "nanoid";
import { startNewRound as startNewRoundLogic } from "./game"; // Import game logic
import { GameError } from "./utils/gameError";
import { ErrorCode } from "./constants/errorCodes";

interface PlayerWithDisconnection extends Player {
  disconnectedSince?: number;
}

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
  playCards(
    gameId: string,
    playerId: string,
    cards: Card[]
  ): Promise<GameState>;
  pickCard(
    gameId: string,
    playerId: string,
    cardId: string
  ): Promise<GameState>;
  passTurn(gameId: string, playerId: string): Promise<GameState>;
  updatePlayerConnection(
    gameId: string,
    playerId: string,
    connected: boolean
  ): Promise<GameState>;
  getAllActiveGames(): Promise<GameState[]>;

  // Chat methods
  saveChatMessage(
    gameId: string,
    playerId: string,
    playerName: string,
    message: string,
    messageType?: MessageType,
    audioUrl?: string,
    duration?: number
  ): Promise<ChatMessage>;
  storeVoiceMessage(
    gameId: string,
    playerId: string,
    audioData: Buffer
  ): Promise<string>;
  getChatMessages(gameId: string): Promise<ChatMessage[]>;
  clearChatMessages(gameId: string): Promise<void>;
}

// Helper function to calculate the numeric value of a play
function calculatePlayValue(cards: Card[]): number {
  if (!cards || cards.length === 0) {
    return 0;
  }
  const valueString = cards
    .map((c) => c.value)
    .sort((a, b) => b - a) // Sort descending
    .join("");
  return parseInt(valueString, 10);
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private games: Map<string, GameState>;
  private roomCodes: Map<string, string>; // Maps room codes to game IDs
  private currentId: number;
  private chatMessages: Map<string, ChatMessage[]>;
  private audioMessages: Map<string, Buffer>; // To store audio message data

  constructor() {
    this.users = new Map();
    this.games = new Map();
    this.roomCodes = new Map();
    this.currentId = 1;
    this.chatMessages = new Map();
    this.audioMessages = new Map();
  }

  // User methods
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
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
      players: [
        {
          id: hostId,
          name: hostName,
          isHost: true,
          hand: [],
          score: 0,
          connected: true,
          isSpectator: false, // Initialize as not a spectator
        },
      ],
      deck: [],
      currentTurn: 0,
      currentPlay: [],
      previousPlay: [],
      roundWinner: null,
      gameWinner: null,
      pointLimit,
      lastAction: {
        type: null,
        playerId: null,
      },
      passCount: 0,
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

  async addPlayerToGame(
    gameId: string,
    playerName: string,
    joinAsSpectator: boolean = false // New parameter to indicate if joining as spectator
  ): Promise<GameState> {
    const game = await this.getGame(gameId);
    if (!game) throw new GameError(ErrorCode.GAME_NOT_FOUND);

    // If game is 'playing' and not explicitly joining as spectator, or if game is 'finished', disallow joining.
    // Player can only join a 'waiting' game directly, or a 'playing' game if joinAsSpectator is true.
    if (game.status === "finished") {
      throw new GameError(ErrorCode.GAME_FINISHED);
    }
    if (game.status === "playing" && !joinAsSpectator) {
      // This case will be handled by the route, asking the user if they want to join as spectator
      // For now, if the API is called directly without joinAsSpectator for a running game, it's an error.
      // Or, we can assume the client will pass joinAsSpectator = true after confirmation.
      // Let's refine this: the route will decide to call this with joinAsSpectator = true.
      // So, if joinAsSpectator is false and game is playing, it's an attempt to join normally, which is not allowed.
      throw new GameError(ErrorCode.GAME_ALREADY_STARTED);
    }
    if (game.status === "waiting" && joinAsSpectator) {
      // Cannot join a waiting game as a spectator
      throw new GameError(ErrorCode.CANNOT_JOIN_WAITING_AS_SPECTATOR);
    }

    // Suppression de la limite de 6 joueurs
    // Calcul de la valeur maximale basée sur le jeu de cartes - un joueur minimum doit avoir 2 cartes
    const colors: CardColor[] = [
      "red",
      "blue",
      "green",
      "yellow",
      "purple",
      "orange",
    ];
    const values: CardValue[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const totalCardsInDeck = colors.length * values.length; // 54 cartes
    const maxPlayersLimit = Math.floor(totalCardsInDeck / 2); // Chaque joueur doit avoir au moins 2 cartes

    if (game.players.length >= maxPlayersLimit)
      throw new GameError(ErrorCode.GAME_FULL);
    if (game.players.some((p) => p.name === playerName))
      throw new GameError(ErrorCode.NAME_ALREADY_TAKEN);

    const newPlayer: Player = {
      id: nanoid(),
      name: playerName,
      isHost: false,
      hand: [],
      score: 0,
      connected: true,
      isSpectator: game.status === "playing" && joinAsSpectator, // Set spectator status
    };

    game.players.push(newPlayer);
    return this.updateGame(game);
  }

  async startGame(gameId: string): Promise<GameState> {
    const game = await this.getGame(gameId);
    if (!game) throw new GameError(ErrorCode.GAME_NOT_FOUND);
    if (game.players.length < 2)
      throw new GameError(ErrorCode.NOT_ENOUGH_PLAYERS);
    if (game.status !== "waiting")
      throw new GameError(ErrorCode.GAME_ALREADY_STARTED);

    // Use the central startNewRound logic to set up the first round
    const startedGame = startNewRoundLogic(game);

    // Update status and persist
    startedGame.status = "playing";
    startedGame.gameWinner = null;
    startedGame.lastAction = {
      type: null,
      playerId: null,
    };

    return this.updateGame(startedGame);
  }

  async startNewRound(gameId: string): Promise<GameState> {
    const game = await this.getGame(gameId);
    if (!game) throw new GameError(ErrorCode.GAME_NOT_FOUND);
    if (game.status !== "playing")
      throw new GameError(ErrorCode.GAME_NOT_IN_PROGRESS);

    // Use the imported game logic function
    const updatedGame = startNewRoundLogic(game);

    // Persist the updated game state
    return this.updateGame(updatedGame);
  }

  async playCards(
    gameId: string,
    playerId: string,
    cards: Card[]
  ): Promise<GameState> {
    const game = await this.getGame(gameId);
    if (!game) throw new GameError(ErrorCode.GAME_NOT_FOUND);
    if (game.status !== "playing")
      throw new GameError(ErrorCode.GAME_NOT_IN_PROGRESS);

    const playerIndex = game.players.findIndex((p) => p.id === playerId);
    if (playerIndex === -1) throw new GameError(ErrorCode.PLAYER_NOT_FOUND);

    if (playerIndex !== game.currentTurn)
      throw new GameError(ErrorCode.NOT_YOUR_TURN);

    const player = game.players[playerIndex];

    // Check if cards array is empty
    if (!cards || cards.length === 0) {
      throw new GameError(ErrorCode.MUST_PLAY_CARDS);
    }

    // Check if all cards to be played are in player's hand
    for (const card of cards) {
      if (!player.hand.some((c) => c.id === card.id)) {
        throw new GameError(ErrorCode.CARD_NOT_IN_HAND);
      }
    }

    // Check if the played cards themselves are valid (all same value or all same color)
    const firstCard = cards[0];
    const playedValue = firstCard.value;
    const playedColor = firstCard.color;
    const allSameValue = cards.every((c) => c.value === playedValue);
    const allSameColor = cards.every((c) => c.color === playedColor);

    if (!allSameValue && !allSameColor) {
      throw new GameError(ErrorCode.MUST_PLAY_SAME_TYPE);
    }

    // === START VALIDATION ===

    // Rule: First play of the round must be exactly one card
    if (game.currentPlay.length === 0 && cards.length !== 1) {
      throw new GameError(ErrorCode.MUST_PLAY_FIRST_CARD);
    }

    // Validate subsequent plays against the current play
    if (game.currentPlay.length > 0) {
      // Rule: Must play the exact same number OR one more card than the current play
      if (
        cards.length !== game.currentPlay.length &&
        cards.length !== game.currentPlay.length + 1
      ) {
        throw new GameError(
          ErrorCode.MUST_PLAY_EXACT_COUNT,
          `Must play ${game.currentPlay.length} or ${
            game.currentPlay.length + 1
          } card(s)`
        );
      }

      const currentPlayCards = game.currentPlay;
      const firstCurrentCard = currentPlayCards[0];
      const currentIsSameValue = currentPlayCards.every(
        (c) => c.value === firstCurrentCard.value
      );
      const currentIsSameColor = currentPlayCards.every(
        (c) => c.color === firstCurrentCard.color
      );

      // CORRECTION: Les cartes jouées doivent être cohérentes (même valeur OU même couleur) entre elles
      // mais n'ont pas besoin de correspondre au type du jeu précédent
      if (!allSameValue && !allSameColor) {
        throw new Error(
          "All cards played must be the same value or the same color"
        );
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
        matchesValue = currentPlayCards.some((c) => c.value === playedValue);
      }

      // Si toutes mes cartes ont la même couleur et au moins une carte du jeu précédent a cette couleur
      if (allSameColor) {
        matchesColor = currentPlayCards.some((c) => c.color === playedColor);
      }

      // Calculer les valeurs combinées pour la comparaison
      const currentPlayValue = calculatePlayValue(currentPlayCards);
      const playedCombinedValue = calculatePlayValue(cards);

      // La règle principale:
      // Si mes cartes correspondent par couleur ou valeur, ou si la valeur combinée est supérieure
      if (
        !matchesValue &&
        !matchesColor &&
        playedCombinedValue <= currentPlayValue
      ) {
        throw new GameError(
          ErrorCode.MUST_PLAY_HIGHER_VALUE,
          `Your play value (${playedCombinedValue}) must be higher than the current play value (${currentPlayValue}) or match color/value`
        );
      }

      // Si les cartes correspondent par couleur ou valeur, elles doivent avoir une valeur strictement supérieure
      if (
        (matchesValue || matchesColor) &&
        playedCombinedValue <= currentPlayValue
      ) {
        throw new GameError(
          ErrorCode.MUST_PLAY_HIGHER_VALUE,
          `Even when matching color/value, your play value (${playedCombinedValue}) must be higher than the current play value (${currentPlayValue})`
        );
      }
    }
    // === END VALIDATION ===

    // Sort the played cards by value descending BEFORE storing them
    const sortedPlayedCards = [...cards].sort((a, b) => b.value - a.value);

    // Move cards from hand to play area
    game.previousPlay = [...game.currentPlay]; // Keep previous play for potential pick
    game.currentPlay = sortedPlayedCards; // Store sorted cards
    player.hand = player.hand.filter(
      (c) => !sortedPlayedCards.some((card) => card.id === c.id)
    );

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
      const highestScore = Math.max(...game.players.map((p) => p.score));
      if (highestScore >= game.pointLimit) {
        game.status = "finished";
        // Winner is the player with the lowest score
        const lowestScore = Math.min(...game.players.map((p) => p.score));
        game.gameWinner =
          game.players.find((p) => p.score === lowestScore)?.id || null;
      }

      game.lastAction = {
        type: "round_end",
        playerId: player.id,
      };
      // Turn logic is handled by round start/game end
    } else {
      // Player did not win, set up next action/turn

      // Update last action (using sorted cards)
      game.lastAction = {
        type: "play",
        playerId: player.id,
        cards: sortedPlayedCards,
      };

      // If no card pick is required (e.g., first turn), advance turn immediately
      if (!requiresPick) {
        game.currentTurn = findNextActivePlayer(game);
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
      game.currentTurn = findNextActivePlayer(game);

      // Update last action
      game.lastAction = {
        type: "pick",
        playerId: player.id,
      };
    }

    return this.updateGame(game);
  }

  async pickCard(
    gameId: string,
    playerId: string,
    cardId: string
  ): Promise<GameState> {
    const game = await this.getGame(gameId);
    if (!game) throw new GameError(ErrorCode.GAME_NOT_FOUND);

    const playerIndex = game.players.findIndex((p) => p.id === playerId);
    if (playerIndex === -1) throw new GameError(ErrorCode.PLAYER_NOT_FOUND);

    if (
      game.lastAction.type !== "play" ||
      game.lastAction.playerId !== playerId
    ) {
      throw new GameError(
        ErrorCode.INVALID_ACTION,
        "You can only pick a card after playing"
      );
    }

    // Find the card in the previous play
    const cardIndex = game.previousPlay.findIndex((c) => c.id === cardId);
    if (cardIndex === -1)
      throw new GameError(
        ErrorCode.CARD_NOT_FOUND,
        "Card not found in previous play"
      );

    const card = game.previousPlay[cardIndex];
    const player = game.players[playerIndex];

    // Add the card to player's hand
    player.hand.push(card);

    // Remove the card from previous play
    game.previousPlay = game.previousPlay.filter((c) => c.id !== cardId);

    // Add remaining cards to the deck and shuffle
    game.deck = [...game.deck, ...game.previousPlay];
    for (let i = game.deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [game.deck[i], game.deck[j]] = [game.deck[j], game.deck[i]];
    }

    game.previousPlay = [];

    // Move to next player's turn
    game.currentTurn = findNextActivePlayer(game);

    // Update last action
    game.lastAction = {
      type: "pick",
      playerId: player.id,
    };

    return this.updateGame(game);
  }

  async passTurn(gameId: string, playerId: string): Promise<GameState> {
    const game = await this.getGame(gameId);
    if (!game) throw new Error("Game not found");
    if (game.status !== "playing") throw new Error("Game is not in progress");

    const playerIndex = game.players.findIndex((p) => p.id === playerId);
    if (playerIndex === -1) throw new Error("Player not found");

    if (playerIndex !== game.currentTurn) throw new Error("Not your turn");

    // Si aucune carte n\\\'a été jouée (currentPlay est vide), le joueur ne peut pas passer
    if (game.currentPlay.length === 0) {
      throw new Error(
        "You cannot pass when no cards have been played. You must play a card."
      );
    }

    // Increment pass count
    game.passCount++;

    // Déterminer le prochain joueur actif potentiel
    // FIX: The context for findNextActivePlayer should use the current player's index (playerIndex)
    // game.currentTurn is already playerIndex due to the check above.
    const gameContextForFindNext = {
      ...game,
      currentTurn: playerIndex, // Use the current player's index as the reference for finding the next player
    };
    const nextActivePlayerIndex = findNextActivePlayer(gameContextForFindNext);

    // Si le tour revient au joueur qui a posé les dernières cartes (et qu\\\'il y a des cartes)
    const isLastPlayerWhoPlayed =
      game.lastAction.type === "play" &&
      game.lastAction.playerId === game.players[nextActivePlayerIndex].id &&
      game.currentPlay.length > 0; // Ensure there are cards to clear

    // Compter seulement les joueurs actifs pour la condition de nettoyage
    const activePlayerCount = game.players.filter((p) => !p.isSpectator).length;

    // Condition pour vider le milieu:
    // 1. Le tour revient au dernier joueur qui a joué (et il y a des cartes)
    // 2. OU tout le monde (parmi les joueurs actifs) a passé consécutivement (et il y a plus d'un joueur actif)
    if (
      (isLastPlayerWhoPlayed ||
        (game.passCount >= activePlayerCount - 1 && activePlayerCount > 1)) &&
      game.currentPlay.length > 0
    ) {
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
        playerId: null,
      };

      // Assigner le tour au joueur qui recommence (celui qui avait posé ou le prochain actif si le dernier joueur a quitté/est spectateur)
      // nextActivePlayerIndex est déjà le bon joueur à qui donner le tour si le board est vidé.
      game.currentTurn = nextActivePlayerIndex;
    } else {
      // Si le board n\'est pas vidé, passer simplement au joueur suivant
      // nextActivePlayerIndex est le prochain joueur actif à qui passer le tour.
      game.currentTurn = nextActivePlayerIndex;

      // Mettre à jour la dernière action pour indiquer un 'pass'
      game.lastAction = {
        type: "pass",
        playerId,
      };
    }

    return this.updateGame(game);
  }

  async updatePlayerConnection(
    gameId: string,
    playerId: string,
    connected: boolean
  ): Promise<GameState> {
    const game = await this.getGame(gameId);
    if (!game) {
      console.log(
        `Game ${gameId} not found when updating player ${playerId} connection status`
      );
      throw new Error("Game not found");
    }

    const playerIndex = game.players.findIndex((p) => p.id === playerId);
    if (playerIndex === -1) throw new Error("Player not found");

    // Only update if status actually changes
    if (game.players[playerIndex].connected !== connected) {
      game.players[playerIndex].connected = connected;

      // Track disconnection time for host reassignment
      const player = game.players[playerIndex] as PlayerWithDisconnection;

      if (!connected) {
        player.disconnectedSince = Date.now();
      } else {
        // Clear disconnection timestamp on reconnect
        delete player.disconnectedSince;
      }

      // If the host disconnects, only reassign after 5 minutes
      if (!connected && game.players[playerIndex].isHost) {
        const connectedPlayers = game.players.filter(
          (p) => p.connected && p.id !== playerId
        );
        if (connectedPlayers.length > 0) {
          // Check if there are any recently disconnected players
          const reconnectionWindow = 5 * 60 * 1000; // 5 minutes
          const now = Date.now();
          const hasRecentlyDisconnected = game.players.some(
            (p) =>
              (p as PlayerWithDisconnection).disconnectedSince &&
              now - (p as PlayerWithDisconnection).disconnectedSince! <
                reconnectionWindow
          );

          if (!hasRecentlyDisconnected) {
            // Only reassign host if no players are expected to reconnect soon
            game.players[playerIndex].isHost = false;
            const newHostIndex = game.players.findIndex(
              (p) => p.id === connectedPlayers[0].id
            );
            if (newHostIndex !== -1) {
              game.players[newHostIndex].isHost = true;
            }
          }
        }
      }

      return this.updateGame(game);
    }

    return game;
  }

  async getAllActiveGames(): Promise<GameState[]> {
    return Array.from(this.games.values()).filter((game) => {
      if (game.status === "finished") return false;

      // Consider a game active if any player is connected or recently disconnected
      const now = Date.now();
      const reconnectionWindow = 24 * 60 * 60 * 1000; // 24 hours

      return game.players.some(
        (p) =>
          p.connected ||
          ((p as PlayerWithDisconnection).disconnectedSince &&
            now - (p as PlayerWithDisconnection).disconnectedSince! <
              reconnectionWindow)
      );
    });
  }

  // Chat methods
  async saveChatMessage(
    gameId: string,
    playerId: string,
    playerName: string,
    message: string,
    messageType: MessageType = "text",
    audioUrl?: string,
    duration?: number
  ): Promise<ChatMessage> {
    if (!this.chatMessages.has(gameId)) {
      this.chatMessages.set(gameId, []);
    }

    const chatMessage: ChatMessage = {
      id: nanoid(),
      gameId,
      playerId,
      playerName,
      message,
      timestamp: Date.now(),
      messageType,
      audioUrl,
      duration,
    };

    this.chatMessages.get(gameId)!.push(chatMessage);

    // Limit chat history to last 100 messages
    const gameMessages = this.chatMessages.get(gameId)!;
    if (gameMessages.length > 100) {
      this.chatMessages.set(
        gameId,
        gameMessages.slice(gameMessages.length - 100)
      );
    }

    return chatMessage;
  }

  async storeVoiceMessage(
    gameId: string,
    playerId: string,
    audioData: Buffer
  ): Promise<string> {
    const audioId = `voice-${gameId}-${playerId}-${Date.now()}`;
    this.audioMessages.set(audioId, audioData);

    // Set a TTL for audio messages (7 days)
    setTimeout(() => {
      if (this.audioMessages.has(audioId)) {
        this.audioMessages.delete(audioId);
        console.log(`Deleted expired voice message: ${audioId}`);
      }
    }, 7 * 24 * 60 * 60 * 1000);

    return audioId;
  }

  async getChatMessages(gameId: string): Promise<ChatMessage[]> {
    return this.chatMessages.get(gameId) || [];
  }

  async clearChatMessages(gameId: string): Promise<void> {
    this.chatMessages.delete(gameId);
  }
}

export const storage = new MemStorage();
