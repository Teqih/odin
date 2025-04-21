import { GameState, WebSocketMessage } from "@shared/schema";

// WebSocket connection singleton
let socket: WebSocket | null = null;
let reconnectInterval: NodeJS.Timeout | null = null;
let messageHandlers: ((message: WebSocketMessage) => void)[] = [];
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const INITIAL_RECONNECT_DELAY = 1000; // 1 second
let currentGameId: string | null = null;
let currentPlayerId: string | null = null;
let isReconnecting = false;

export function connectToGameServer(gameId: string, playerId: string): WebSocket {
  // Store credentials for reconnection attempts
  currentGameId = gameId;
  currentPlayerId = playerId;
  reconnectAttempts = 0;
  
  if (socket && socket.readyState === WebSocket.OPEN) {
    // Already connected, send identity
    const message: WebSocketMessage = {
      type: "connect",
      gameId,
      playerId
    };
    socket.send(JSON.stringify(message));
    return socket;
  }

  // Close existing socket if it exists
  if (socket) {
    try {
      socket.close();
    } catch (e) {
      console.error("Error closing existing socket:", e);
    }
    socket = null;
  }

  // Fix protocol to match server port (5000)
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.hostname;
  const port = "5000"; // Explicitly use port 5000 where the server is running
  const wsUrl = `${protocol}//${host}:${port}/ws`;
  
  console.log("Connecting to WebSocket at:", wsUrl);
  socket = new WebSocket(wsUrl);
  
  socket.onopen = () => {
    console.log("WebSocket connected");
    // Reset reconnection state on successful connection
    reconnectAttempts = 0;
    isReconnecting = false;
    
    // Send identity message
    const message: WebSocketMessage = {
      type: "connect",
      gameId,
      playerId
    };
    
    try {
      socket?.send(JSON.stringify(message));
    } catch (e) {
      console.error("Error sending identity message:", e);
      // If we can't send the identity message, consider the connection failed
      socket?.close();
    }
    
    // Clear reconnect interval if it exists
    if (reconnectInterval) {
      clearInterval(reconnectInterval);
      reconnectInterval = null;
    }
  };
  
  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data) as WebSocketMessage;
      // Notify all message handlers
      messageHandlers.forEach(handler => handler(message));
    } catch (error) {
      console.error("Error parsing WebSocket message:", error);
    }
  };
  
  socket.onclose = (event) => {
    console.log(`WebSocket disconnected. Code: ${event.code}, Reason: ${event.reason}`);
    
    // Don't attempt to reconnect if this is a normal closure or if we're already in the reconnect process
    if (event.code === 1000 || isReconnecting) {
      return;
    }

    // Attempt to reconnect with exponential backoff
    attemptReconnect();
  };
  
  socket.onerror = (error) => {
    console.error("WebSocket error:", error);
    // Provide more detailed error information for debugging
    console.log("WebSocket state:", socket?.readyState);
    console.log("Connection URL:", wsUrl);
    
    // Close the socket on error to trigger the reconnect process
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.close();
    }
  };
  
  return socket;
}

function attemptReconnect() {
  if (!currentGameId || !currentPlayerId) {
    console.error("Cannot reconnect - missing game ID or player ID");
    return;
  }
  
  if (isReconnecting) {
    return;
  }
  
  isReconnecting = true;
  
  // Clear any existing reconnect interval
  if (reconnectInterval) {
    clearInterval(reconnectInterval);
    reconnectInterval = null;
  }
  
  // Calculate backoff delay with jitter (to prevent all clients from reconnecting at the same time)
  const backoffDelay = Math.min(
    INITIAL_RECONNECT_DELAY * Math.pow(1.5, reconnectAttempts) * (0.9 + Math.random() * 0.2),
    30000 // Max 30 seconds
  );
  
  console.log(`Attempting to reconnect in ${Math.round(backoffDelay / 1000)} seconds (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})...`);
  
  reconnectInterval = setTimeout(() => {
    reconnectAttempts++;
    isReconnecting = false;
    
    if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
      // Try to reconnect
      connectToGameServer(currentGameId!, currentPlayerId!);
    } else {
      console.error("Maximum reconnection attempts reached. Giving up.");
      // Notify UI that connection is lost permanently
      const errorMessage: WebSocketMessage = {
        type: "error",
        error: "Connection lost permanently. Please refresh the page."
      };
      messageHandlers.forEach(handler => handler(errorMessage));
    }
  }, backoffDelay);
}

export function disconnectFromGameServer() {
  // Cancel any pending reconnection attempts
  if (reconnectInterval) {
    clearInterval(reconnectInterval);
    reconnectInterval = null;
  }
  
  // Reset state
  currentGameId = null;
  currentPlayerId = null;
  reconnectAttempts = 0;
  isReconnecting = false;
  
  if (socket) {
    // Use code 1000 for normal closure
    socket.close(1000, "User disconnected");
    socket = null;
  }
  
  // Clear message handlers
  messageHandlers = [];
}

// Manually trigger a reconnection attempt
export function forceReconnect() {
  if (currentGameId && currentPlayerId) {
    // Reset reconnection attempts
    reconnectAttempts = 0;
    isReconnecting = false;
    
    // Attempt to reconnect
    connectToGameServer(currentGameId, currentPlayerId);
  }
}

export function addMessageHandler(handler: (message: WebSocketMessage) => void) {
  messageHandlers.push(handler);
  return () => {
    messageHandlers = messageHandlers.filter(h => h !== handler);
  };
}

export function sendMessage(message: WebSocketMessage) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    try {
      socket.send(JSON.stringify(message));
    } catch (e) {
      console.error("Error sending message:", e);
      // If we can't send a message, try reconnecting
      if (currentGameId && currentPlayerId) {
        attemptReconnect();
      }
    }
  } else {
    console.error(`WebSocket not connected (state: ${socket?.readyState}). Attempting to reconnect...`);
    // Try to reconnect since the socket isn't ready
    if (currentGameId && currentPlayerId) {
      attemptReconnect();
    }
  }
}

export function getConnectionStatus(): "connected" | "connecting" | "disconnected" | "reconnecting" {
  if (isReconnecting) return "reconnecting";
  if (!socket) return "disconnected";
  
  switch (socket.readyState) {
    case WebSocket.CONNECTING:
      return "connecting";
    case WebSocket.OPEN:
      return "connected";
    default:
      return "disconnected";
  }
}
