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
  GameState,
  Card,
  CardColor,
  CardValue,
  ChatMessage
} from "@shared/schema";
import { nanoid } from "nanoid";
import { z } from "zod";
import { filterGameStateForPlayer } from "./game";

// Map of connected clients by game ID and player ID
const connections = new Map<string, Map<string, WebSocket>>();
// Track last message sent time to detect stale connections
const lastMessageTime = new Map<WebSocket, number>();
// Track player activity times to detect inactive players
const lastPlayerActivity = new Map<string, Map<string, number>>();
// Set up a ping interval to keep connections alive
let pingInterval: NodeJS.Timeout | null = null;
// Set up a player activity check interval
let playerActivityInterval: NodeJS.Timeout | null = null;

const CONNECTION_TIMEOUT = 45000; // 45 seconds of inactivity before considering a player disconnected

// Send game state update to all players in a game
function broadcastGameState(gameId: string, gameState: GameState) {
  const gameConnections = connections.get(gameId);
  if (!gameConnections) return;
  
  console.log(`Broadcasting game state to ${gameConnections.size} players in game ${gameId}`);

  // Track which players received the update successfully
  const failedConnections: Array<[string, WebSocket]> = [];

  // Use Array.from to convert the map entries iterator to an array
  for (const [playerId, socket] of Array.from(gameConnections.entries())) {
    if (socket.readyState === WebSocket.OPEN) {
      try {
        // Filter the game state to hide other players' cards
        const filteredState = filterGameStateForPlayer(gameState, playerId);
        
        const message: WebSocketMessage = {
          type: "turn_update",
          gameId,
          gameState: filteredState
        };
        
        socket.send(JSON.stringify(message));
        // Update last message time
        lastMessageTime.set(socket, Date.now());
        // Update player activity time
        updatePlayerActivity(gameId, playerId);
      } catch (error) {
        console.error(`Error sending update to player ${playerId}:`, error);
        failedConnections.push([playerId, socket]);
      }
    } else {
      // Connection is not open, queue for cleanup
      failedConnections.push([playerId, socket]);
    }
  }

  // Clean up any failed connections
  for (const [playerId, socket] of failedConnections) {
    console.log(`Removing stale connection for player ${playerId} in game ${gameId}`);
    gameConnections.delete(playerId);
    lastMessageTime.delete(socket);
    
    // Mark player as disconnected in game state
    markPlayerDisconnected(gameId, playerId);
  }

  // If all connections for a game have failed, clean up the game entry
  if (gameConnections.size === 0) {
    connections.delete(gameId);
  }
}

// Track player activity for disconnection detection
function updatePlayerActivity(gameId: string, playerId: string) {
  if (!lastPlayerActivity.has(gameId)) {
    lastPlayerActivity.set(gameId, new Map());
  }
  
  lastPlayerActivity.get(gameId)!.set(playerId, Date.now());
}

// Handle player disconnection
async function markPlayerDisconnected(gameId: string, playerId: string) {
  try {
    // Get player activity map for this game
    const gameActivity = lastPlayerActivity.get(gameId);
    if (gameActivity) {
      // Remove the player activity record
      gameActivity.delete(playerId);
      if (gameActivity.size === 0) {
        lastPlayerActivity.delete(gameId);
      }
    }
    
    // Mark player as disconnected in the game state
    await storage.updatePlayerConnection(gameId, playerId, false);
    
    // Fetch updated game state and broadcast to remaining players
    const updatedGame = await storage.getGame(gameId);
    if (updatedGame) {
      broadcastGameState(gameId, updatedGame);
    }
  } catch (error) {
    console.error(`Error marking player ${playerId} as disconnected:`, error);
  }
}

// Setup ping function to keep WebSocket connections alive
function setupPingInterval(wss: WebSocketServer) {
  if (pingInterval) {
    clearInterval(pingInterval);
  }
  
  pingInterval = setInterval(() => {
    const now = Date.now();
    
    wss.clients.forEach(socket => {
      if (socket.readyState === WebSocket.OPEN) {
        try {
          // Send ping to verify connection
          socket.ping();
          
          // Check if we haven't sent any messages in a while
          const lastTime = lastMessageTime.get(socket) || 0;
          if (now - lastTime > 30000) { // 30 seconds
            // Send an empty ping message to keep connection alive
            const pingMessage: WebSocketMessage = { type: "ping" };
            socket.send(JSON.stringify(pingMessage));
            lastMessageTime.set(socket, now);
          }
        } catch (err) {
          console.error('Error pinging client:', err);
          // Close the socket if we can't ping it
          try {
            socket.terminate();
          } catch (e) {
            console.error('Error terminating socket:', e);
          }
        }
      }
    });
  }, 15000); // Check every 15 seconds
}

// Check for inactive players and mark them as disconnected
function setupPlayerActivityCheck() {
  if (playerActivityInterval) {
    clearInterval(playerActivityInterval);
  }
  
  playerActivityInterval = setInterval(async () => {
    const now = Date.now();
    
    // Check each game for inactive players
    for (const [gameId, playerMap] of Array.from(lastPlayerActivity.entries())) {
      for (const [playerId, lastActive] of Array.from(playerMap.entries())) {
        if (now - lastActive > CONNECTION_TIMEOUT) {
          console.log(`Player ${playerId} in game ${gameId} inactive for too long, marking as disconnected`);
          
          // Get the player's socket if it exists
          const gameConnections = connections.get(gameId);
          if (gameConnections) {
            const socket = gameConnections.get(playerId);
            if (socket) {
              // Try to close the socket
              try {
                socket.terminate();
              } catch (e) {
                console.error('Error terminating inactive socket:', e);
              }
              
              // Remove the connection
              gameConnections.delete(playerId);
              lastMessageTime.delete(socket);
            }
          }
          
          // Mark the player as disconnected
          await markPlayerDisconnected(gameId, playerId);
        }
      }
    }
  }, 20000); // Check every 20 seconds
}

// Send chat message to all players in a game
async function broadcastChatMessage(chatMessage: ChatMessage) {
  const gameId = chatMessage.gameId;
  const gameConnections = connections.get(gameId);
  if (!gameConnections) return;
  
  console.log(`Broadcasting chat message from ${chatMessage.playerName} to ${gameConnections.size} players in game ${gameId}`);

  const message: WebSocketMessage = {
    type: "chat_message",
    gameId,
    chatMessage
  };
  
  // Track which players received the message successfully
  const failedConnections: Array<[string, WebSocket]> = [];

  // Send to all players
  for (const [playerId, socket] of Array.from(gameConnections.entries())) {
    if (socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify(message));
        // Update last message time
        lastMessageTime.set(socket, Date.now());
        // Update player activity time
        updatePlayerActivity(gameId, playerId);
      } catch (error) {
        console.error(`Error sending chat message to player ${playerId}:`, error);
        failedConnections.push([playerId, socket]);
      }
    } else {
      // Connection is not open, queue for cleanup
      failedConnections.push([playerId, socket]);
    }
  }

  // Clean up any failed connections
  for (const [playerId, socket] of failedConnections) {
    console.log(`Removing stale connection for player ${playerId} in game ${gameId}`);
    gameConnections.delete(playerId);
    lastMessageTime.delete(socket);
    
    // Mark player as disconnected in game state
    markPlayerDisconnected(gameId, playerId);
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // Set up WebSocket server
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Setup ping interval to keep connections alive
  setupPingInterval(wss);
  
  // Setup player activity check
  setupPlayerActivityCheck();
  
  wss.on('connection', (socket: WebSocket) => {
    console.log('WebSocket client connected');
    lastMessageTime.set(socket, Date.now());
    
    let clientGameId: string | null = null;
    let clientPlayerId: string | null = null;
    
    socket.on('message', async (data) => {
      try {
        const message: WebSocketMessage = JSON.parse(data.toString());
        // Update the last message time
        lastMessageTime.set(socket, Date.now());
        
        if (message.type === 'connect' && message.gameId && message.playerId) {
          // Check if this player is already connected with a different socket
          const existingGameConnections = connections.get(message.gameId);
          if (existingGameConnections) {
            const existingSocket = existingGameConnections.get(message.playerId);
            if (existingSocket && existingSocket !== socket && existingSocket.readyState === WebSocket.OPEN) {
              // Player already has an active connection - close the old one
              console.log(`Player ${message.playerId} already connected, closing previous connection`);
              
              // Close the existing socket - send a disconnect notification first
              try {
                existingSocket.send(JSON.stringify({
                  type: "error",
                  error: "You connected from another device or browser tab."
                }));
                existingSocket.close(1000, "Replaced by new connection");
              } catch (e) {
                console.error('Error closing existing socket:', e);
              }
              
              // Remove the old connection
              existingGameConnections.delete(message.playerId);
              lastMessageTime.delete(existingSocket);
            }
          }
          
          // If client was already connected to a different game, disconnect from that first
          if (clientGameId && clientGameId !== message.gameId) {
            const oldGameConnections = connections.get(clientGameId);
            if (oldGameConnections) {
              oldGameConnections.delete(clientPlayerId!);
              if (oldGameConnections.size === 0) {
                connections.delete(clientGameId);
              }
              
              // Mark player as disconnected from previous game
              await markPlayerDisconnected(clientGameId, clientPlayerId!);
            }
          }
          
          clientGameId = message.gameId;
          clientPlayerId = message.playerId;
          
          // Store connection
          if (!connections.has(clientGameId)) {
            connections.set(clientGameId, new Map());
          }
          connections.get(clientGameId)!.set(clientPlayerId, socket);
          
          // Update player activity time
          updatePlayerActivity(clientGameId, clientPlayerId);
          
          // Mark player as connected
          const game = await storage.getGame(clientGameId);
          if (game) {
            await storage.updatePlayerConnection(clientGameId, clientPlayerId, true);
            // Immediately send the current game state to the newly connected player
            const updatedGame = await storage.getGame(clientGameId);
            if (updatedGame) {
              // Send only to this player
              const filteredState = filterGameStateForPlayer(updatedGame, clientPlayerId);
              socket.send(JSON.stringify({
                type: "turn_update",
                gameId: clientGameId,
                gameState: filteredState
              }));
              // Then broadcast to everyone
              broadcastGameState(clientGameId, updatedGame);
            }
          }
        } else if (message.type === 'ping') {
          // Respond to ping with pong
          socket.send(JSON.stringify({ type: 'pong' }));
          
          // Update activity time for the player when they ping
          if (clientGameId && clientPlayerId) {
            updatePlayerActivity(clientGameId, clientPlayerId);
          }
        } else if (message.type === 'chat_message') {
          if (message.gameId && message.playerId && message.chatMessage?.message) {
            try {
              // Get player info to attach the right name
              const game = await storage.getGame(message.gameId);
              if (!game) {
                console.error(`Game ${message.gameId} not found for chat message`);
                return;
              }
              
              const player = game.players.find(p => p.id === message.playerId);
              if (!player) {
                console.error(`Player ${message.playerId} not found in game ${message.gameId} for chat message`);
                return;
              }
              
              // Save and broadcast the chat message
              const chatMessage = await storage.saveChatMessage(
                message.gameId,
                message.playerId,
                player.name,
                message.chatMessage.message
              );
              
              await broadcastChatMessage(chatMessage);
            } catch (error) {
              console.error("Error handling chat message:", error);
            }
          }
        } else if (message.type === 'chat_history') {
          if (message.gameId && message.playerId) {
            try {
              const chatHistory = await storage.getChatMessages(message.gameId);
              
              const historyMessage: WebSocketMessage = {
                type: "chat_history",
                gameId: message.gameId,
                playerId: message.playerId,
                chatHistory
              };
              
              socket.send(JSON.stringify(historyMessage));
            } catch (error) {
              console.error("Error sending chat history:", error);
            }
          }
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });
    
    socket.on('close', async () => {
      console.log('WebSocket client disconnected');
      lastMessageTime.delete(socket);
      
      if (clientGameId && clientPlayerId) {
        // Remove connection
        const gameConnections = connections.get(clientGameId);
        if (gameConnections) {
          // Only remove this specific socket if it's still the current one for the player
          const currentSocket = gameConnections.get(clientPlayerId);
          if (currentSocket === socket) {
            gameConnections.delete(clientPlayerId);
            
            // If no connections left for this game, clean up
            if (gameConnections.size === 0) {
              connections.delete(clientGameId);
            }
            
            // Mark player as disconnected
            await markPlayerDisconnected(clientGameId, clientPlayerId);
          }
        }
      }
    });
    
    socket.on('error', (error) => {
      console.error('WebSocket error:', error);
      lastMessageTime.delete(socket);
      
      // Forcefully terminate the socket on error
      try {
        socket.terminate();
      } catch (e) {
        console.error('Error terminating socket after error:', e);
      }
      
      // Mark player as disconnected if we have their info
      if (clientGameId && clientPlayerId) {
        markPlayerDisconnected(clientGameId, clientPlayerId).catch(e => {
          console.error('Error marking player disconnected after socket error:', e);
        });
      }
    });
    
    socket.on('pong', () => {
      // Update last activity time when we receive a pong response
      lastMessageTime.set(socket, Date.now());
      
      // Update player activity
      if (clientGameId && clientPlayerId) {
        updatePlayerActivity(clientGameId, clientPlayerId);
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
      
      // Use the centralized storage method to start the new round
      const updatedGame = await storage.startNewRound(gameId);
      
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
