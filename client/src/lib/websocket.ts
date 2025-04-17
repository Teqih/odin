import { GameState, WebSocketMessage } from "@shared/schema";

// WebSocket connection singleton
let socket: WebSocket | null = null;
let reconnectInterval: NodeJS.Timeout | null = null;
let messageHandlers: ((message: WebSocketMessage) => void)[] = [];

export function connectToGameServer(gameId: string, playerId: string): WebSocket {
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
    socket.close();
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws`;
  
  socket = new WebSocket(wsUrl);
  
  socket.onopen = () => {
    console.log("WebSocket connected");
    // Send identity message
    const message: WebSocketMessage = {
      type: "connect",
      gameId,
      playerId
    };
    socket.send(JSON.stringify(message));
    
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
  
  socket.onclose = () => {
    console.log("WebSocket disconnected");
    
    // Attempt to reconnect
    if (!reconnectInterval) {
      reconnectInterval = setInterval(() => {
        if (socket?.readyState !== WebSocket.OPEN) {
          connectToGameServer(gameId, playerId);
        }
      }, 5000);
    }
  };
  
  socket.onerror = (error) => {
    console.error("WebSocket error:", error);
  };
  
  return socket;
}

export function disconnectFromGameServer() {
  if (socket) {
    socket.close();
    socket = null;
  }
  
  if (reconnectInterval) {
    clearInterval(reconnectInterval);
    reconnectInterval = null;
  }
  
  // Clear message handlers
  messageHandlers = [];
}

export function addMessageHandler(handler: (message: WebSocketMessage) => void) {
  messageHandlers.push(handler);
  return () => {
    messageHandlers = messageHandlers.filter(h => h !== handler);
  };
}

export function sendMessage(message: WebSocketMessage) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  } else {
    console.error("WebSocket not connected");
  }
}

export function getConnectionStatus(): "connected" | "connecting" | "disconnected" {
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
