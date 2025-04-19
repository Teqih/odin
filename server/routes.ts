import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { 
  CreateGameRequest, 
  JoinGameRequest, 
  PlayCardsRequest, 
  PickCardRequest, 
  PassTurnRequest,
  WebSocketMessage,
  GameState
} from "@shared/schema";
import { nanoid } from "nanoid";
import { z } from "zod";
import { filterGameStateForPlayer } from "./game";

// Map of connected clients by game ID and player ID
const connections = new Map<string, Map<string, WebSocket>>();

// Send game state update to all players in a game
function broadcastGameState(gameId: string, gameState: GameState) {
  const gameConnections = connections.get(gameId);
  if (!gameConnections) return;

  for (const [playerId, socket] of gameConnections.entries()) {
    if (socket.readyState === WebSocket.OPEN) {
      // Filter the game state to hide other players' cards
      const filteredState = filterGameStateForPlayer(gameState, playerId);
      
      const message: WebSocketMessage = {
        type: "turn_update",
        gameId,
        gameState: filteredState
      };
      
      socket.send(JSON.stringify(message));
    }
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Set up WebSocket server
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  wss.on('connection', (socket: WebSocket) => {
    console.log('WebSocket client connected');
    
    let clientGameId: string | null = null;
    let clientPlayerId: string | null = null;
    
    socket.on('message', async (data) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        
        if (message.type === 'connect' && message.gameId && message.playerId) {
          clientGameId = message.gameId;
          clientPlayerId = message.playerId;
          
          // Store connection
          if (!connections.has(clientGameId)) {
            connections.set(clientGameId, new Map());
          }
          connections.get(clientGameId)!.set(clientPlayerId, socket);
          
          // Mark player as connected
          const game = await storage.getGame(clientGameId);
          if (game) {
            await storage.updatePlayerConnection(clientGameId, clientPlayerId, true);
            // Broadcast updated state
            const updatedGame = await storage.getGame(clientGameId);
            if (updatedGame) {
              broadcastGameState(clientGameId, updatedGame);
            }
          }
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });
    
    socket.on('close', async () => {
      console.log('WebSocket client disconnected');
      
      if (clientGameId && clientPlayerId) {
        // Remove connection
        const gameConnections = connections.get(clientGameId);
        if (gameConnections) {
          gameConnections.delete(clientPlayerId);
          
          // If no connections left for this game, clean up
          if (gameConnections.size === 0) {
            connections.delete(clientGameId);
          }
        }
        
        // Mark player as disconnected
        try {
          const game = await storage.getGame(clientGameId);
          if (game) {
            await storage.updatePlayerConnection(clientGameId, clientPlayerId, false);
            // Broadcast updated state
            const updatedGame = await storage.getGame(clientGameId);
            if (updatedGame) {
              broadcastGameState(clientGameId, updatedGame);
            }
          }
        } catch (error) {
          console.error('Error updating player connection:', error);
        }
      }
    });
  });
  
  // API Routes
  // Create a new game
  app.post('/api/games', async (req: Request, res: Response) => {
    try {
      const createGameSchema = z.object({
        playerName: z.string().min(1).max(20),
        pointLimit: z.number().int().min(5).max(50)
      });
      
      const validatedData = createGameSchema.parse(req.body as CreateGameRequest);
      const game = await storage.createGame(validatedData.playerName, validatedData.pointLimit);
      
      res.status(201).json({
        gameId: game.id,
        roomCode: game.roomCode,
        playerId: game.players[0].id
      });
    } catch (error) {
      console.error('Create game error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: 'Failed to create game' });
    }
  });
  
  // Join an existing game
  app.post('/api/games/join', async (req: Request, res: Response) => {
    try {
      const joinGameSchema = z.object({
        playerName: z.string().min(1).max(20),
        roomCode: z.string().length(6)
      });
      
      const validatedData = joinGameSchema.parse(req.body as JoinGameRequest);
      const game = await storage.getGameByRoomCode(validatedData.roomCode);
      
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }
      
      if (game.status !== 'waiting') {
        return res.status(400).json({ message: 'Game has already started' });
      }
      
      const updatedGame = await storage.addPlayerToGame(game.id, validatedData.playerName);
      const newPlayer = updatedGame.players[updatedGame.players.length - 1];
      
      // Broadcast player joined to all clients
      broadcastGameState(game.id, updatedGame);
      
      res.status(200).json({
        gameId: game.id,
        roomCode: game.roomCode,
        playerId: newPlayer.id
      });
    } catch (error) {
      console.error('Join game error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: 'Failed to join game' });
    }
  });
  
  // Get game state
  app.get('/api/games/:gameId', async (req: Request, res: Response) => {
    try {
      const { gameId } = req.params;
      const { playerId } = req.query;
      
      if (!playerId || typeof playerId !== 'string') {
        return res.status(400).json({ message: 'Player ID is required' });
      }
      
      const game = await storage.getGame(gameId);
      
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }
      
      const player = game.players.find(p => p.id === playerId);
      if (!player) {
        return res.status(403).json({ message: 'Player not in game' });
      }
      
      // Filter game state to hide other players' cards
      const filteredState = filterGameStateForPlayer(game, playerId);
      
      res.status(200).json(filteredState);
    } catch (error) {
      console.error('Get game error:', error);
      res.status(500).json({ message: 'Failed to get game' });
    }
  });
  
  // Start the game
  app.post('/api/games/:gameId/start', async (req: Request, res: Response) => {
    try {
      const { gameId } = req.params;
      const { playerId } = req.body;
      
      if (!playerId) {
        return res.status(400).json({ message: 'Player ID is required' });
      }
      
      const game = await storage.getGame(gameId);
      
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }
      
      const player = game.players.find(p => p.id === playerId);
      if (!player) {
        return res.status(403).json({ message: 'Player not in game' });
      }
      
      if (!player.isHost) {
        return res.status(403).json({ message: 'Only the host can start the game' });
      }
      
      const updatedGame = await storage.startGame(gameId);
      
      // Broadcast game started to all clients
      broadcastGameState(gameId, updatedGame);
      
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Start game error:', error);
      res.status(500).json({ message: 'Failed to start game' });
    }
  });
  
  // Play cards
  app.post('/api/games/:gameId/play', async (req: Request, res: Response) => {
    try {
      const { gameId } = req.params;
      const playCardsSchema = z.object({
        playerId: z.string(),
        cards: z.array(z.object({
          id: z.string(),
          color: z.enum(["red", "blue", "green", "yellow", "purple", "orange"]),
          value: z.number().int().min(1).max(9)
        })).min(1)
      });
      
      const validatedData = playCardsSchema.parse(req.body as PlayCardsRequest);
      
      const game = await storage.getGame(gameId);
      
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }
      
      try {
        const updatedGame = await storage.playCards(gameId, validatedData.playerId, validatedData.cards);
        
        // Broadcast updated state to all clients
        broadcastGameState(gameId, updatedGame);
        
        res.status(200).json({ success: true });
      } catch (error) {
        return res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid play' });
      }
    } catch (error) {
      console.error('Play cards error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: 'Failed to play cards' });
    }
  });
  
  // Pick a card after playing
  app.post('/api/games/:gameId/pick', async (req: Request, res: Response) => {
    try {
      const { gameId } = req.params;
      const pickCardSchema = z.object({
        playerId: z.string(),
        cardId: z.string()
      });
      
      const validatedData = pickCardSchema.parse(req.body as PickCardRequest);
      
      const game = await storage.getGame(gameId);
      
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }
      
      try {
        const updatedGame = await storage.pickCard(gameId, validatedData.playerId, validatedData.cardId);
        
        // Broadcast updated state to all clients
        broadcastGameState(gameId, updatedGame);
        
        res.status(200).json({ success: true });
      } catch (error) {
        return res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid pick' });
      }
    } catch (error) {
      console.error('Pick card error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: 'Failed to pick card' });
    }
  });
  
  // Pass turn
  app.post('/api/games/:gameId/pass', async (req: Request, res: Response) => {
    try {
      const { gameId } = req.params;
      const passTurnSchema = z.object({
        playerId: z.string()
      });
      
      const validatedData = passTurnSchema.parse(req.body as PassTurnRequest);
      
      const game = await storage.getGame(gameId);
      
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }
      
      try {
        const updatedGame = await storage.passTurn(gameId, validatedData.playerId);
        
        // Broadcast updated state to all clients
        broadcastGameState(gameId, updatedGame);
        
        res.status(200).json({ success: true });
      } catch (error) {
        return res.status(400).json({ message: error instanceof Error ? error.message : 'Invalid pass' });
      }
    } catch (error) {
      console.error('Pass turn error:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: 'Failed to pass turn' });
    }
  });
  
  // Start a new round
  app.post('/api/games/:gameId/round', async (req: Request, res: Response) => {
    try {
      const { gameId } = req.params;
      const { playerId } = req.body;
      
      if (!playerId) {
        return res.status(400).json({ message: 'Player ID is required' });
      }
      
      const game = await storage.getGame(gameId);
      
      if (!game) {
        return res.status(404).json({ message: 'Game not found' });
      }
      
      const player = game.players.find(p => p.id === playerId);
      if (!player) {
        return res.status(403).json({ message: 'Player not in game' });
      }
      
      if (!player.isHost) {
        return res.status(403).json({ message: 'Only the host can start a new round' });
      }
      
      // Reset for new round
      game.currentPlay = [];
      game.previousPlay = [];
      game.roundWinner = null;
      game.passCount = 0;
      
      // Calculate maximum cards per player
      const colors = ["red", "blue", "green", "yellow", "purple", "orange"];
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9];
      const totalCardsInFullDeck = colors.length * values.length; // 54 cards
      const playerCount = game.players.length;
      // Maximum cards per player - min of 9 or what's possible with the deck
      const maxCardsPerPlayer = Math.min(9, Math.floor(totalCardsInFullDeck / playerCount));
      
      // Deal new cards to all players
      for (const p of game.players) {
        p.hand = [];
        for (let i = 0; i < maxCardsPerPlayer && game.deck.length > 0; i++) {
          const card = game.deck.pop()!;
          p.hand.push(card);
        }
      }
      
      // If deck is low, create a new one
      if (game.deck.length < game.players.length * 2) {
        const colors = ["red", "blue", "green", "yellow", "purple", "orange"];
        const values = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        
        const newDeck = [];
        for (const color of colors) {
          for (const value of values) {
            newDeck.push({ 
              id: nanoid(), 
              color: color as any, 
              value: value as any 
            });
          }
        }
        
        // Shuffle the new deck
        for (let i = newDeck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
        }
        
        game.deck = [...game.deck, ...newDeck];
      }
      
      const updatedGame = await storage.updateGame(game);
      
      // Broadcast updated state to all clients
      broadcastGameState(gameId, updatedGame);
      
      res.status(200).json({ success: true });
    } catch (error) {
      console.error('Start new round error:', error);
      res.status(500).json({ message: 'Failed to start new round' });
    }
  });

  return httpServer;
}
