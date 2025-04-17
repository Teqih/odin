import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import RoomCodeDisplay from "@/components/ui/room-code-display";
import { 
  Share2, 
  LogOut, 
  Users, 
  Settings, 
  Play 
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { connectToGameServer, addMessageHandler } from "@/lib/websocket";
import { GameState, Player, WebSocketMessage } from "@shared/schema";

const LobbyScreen: React.FC = () => {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/lobby/:gameId");
  const { toast } = useToast();
  
  // Get stored game info
  const gameId = params?.gameId || sessionStorage.getItem("gameId") || "";
  const playerId = sessionStorage.getItem("playerId") || "";
  const playerName = sessionStorage.getItem("playerName") || "";
  const roomCode = sessionStorage.getItem("roomCode") || "";
  
  const [isHost, setIsHost] = useState(false);
  
  // Fetch game state
  const { data: gameState, isLoading, error } = useQuery({
    queryKey: [`/api/games/${gameId}?playerId=${encodeURIComponent(playerId)}`],
    enabled: !!gameId && !!playerId,
    refetchInterval: 5000,
    refetchIntervalInBackground: true
  });
  
  // Start game mutation
  const startGameMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/games/${gameId}/start`, { playerId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}?playerId=${encodeURIComponent(playerId)}`] });
    },
    onError: (error) => {
      toast({
        title: "Failed to start game",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive"
      });
    }
  });
  
  useEffect(() => {
    // Redirect if no game ID or player ID
    if (!gameId || !playerId) {
      navigate("/");
      return;
    }
    
    // Connect to WebSocket
    const socket = connectToGameServer(gameId, playerId);
    
    // Add message handler
    const removeHandler = addMessageHandler((message: WebSocketMessage) => {
      if (message.type === "game_started" && message.gameId === gameId) {
        navigate(`/game/${gameId}`);
      } else if (message.type === "player_joined" && message.gameId === gameId) {
        queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}?playerId=${encodeURIComponent(playerId)}`] });
      }
    });
    
    return () => {
      removeHandler();
    };
  }, [gameId, playerId, navigate]);
  
  useEffect(() => {
    if (gameState) {
      // Check if player is host
      const player = gameState.players.find(p => p.id === playerId);
      setIsHost(!!player?.isHost);
      
      // If game has started, redirect to game
      if (gameState.status === "playing") {
        navigate(`/game/${gameId}`);
      }
    }
  }, [gameState, playerId, gameId, navigate]);
  
  const handleLeaveLobby = () => {
    // Clear session storage
    sessionStorage.removeItem("gameId");
    sessionStorage.removeItem("playerId");
    sessionStorage.removeItem("playerName");
    sessionStorage.removeItem("roomCode");
    
    navigate("/");
  };
  
  const handleStartGame = () => {
    if (gameState && gameState.players.length < 2) {
      toast({
        title: "Not enough players",
        description: "You need at least 2 players to start the game",
        variant: "destructive"
      });
      return;
    }
    
    startGameMutation.mutate();
  };
  
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <div className="animate-pulse">Loading lobby...</div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  if (error || !gameState) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <h2 className="text-xl font-semibold mb-4">Error Loading Lobby</h2>
            <p className="text-muted-foreground mb-4">
              Unable to join the game lobby. The game may no longer exist.
            </p>
            <Button onClick={() => navigate("/")}>
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold">Game Lobby</h2>
            <RoomCodeDisplay roomCode={roomCode} />
          </div>
          
          <div className="mb-6">
            <div className="flex items-center mb-3">
              <Users className="h-5 w-5 mr-2" />
              <h3 className="text-lg font-medium">Players</h3>
            </div>
            <ul className="bg-muted rounded-lg p-2">
              {gameState.players.map((player) => (
                <li 
                  key={player.id} 
                  className="flex items-center justify-between p-2 border-b last:border-b-0 border-background"
                >
                  <div className="flex items-center">
                    <span className="mr-2">
                      {player.id === playerId ? "👤" : "👥"}
                    </span>
                    <span>
                      {player.name}
                      {player.id === playerId && " (You)"}
                    </span>
                  </div>
                  {player.isHost && (
                    <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded-full">
                      Host
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
          
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <Settings className="h-5 w-5 mr-2" />
                <h3 className="text-lg font-medium">Game Settings</h3>
              </div>
              {isHost && (
                <span className="text-xs text-muted-foreground">(Host only)</span>
              )}
            </div>
            <div className="bg-muted rounded-lg p-4">
              <div className="flex justify-between items-center mb-2">
                <span>Point Limit:</span>
                <span>{gameState.pointLimit} points</span>
              </div>
              <div className="flex justify-between items-center">
                <span>Players:</span>
                <span>{gameState.players.length}/6</span>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col gap-3">
            <Button
              className="w-full"
              onClick={handleStartGame}
              disabled={!isHost || startGameMutation.isPending || gameState.players.length < 2}
            >
              <Play className="mr-2 h-5 w-5" />
              {startGameMutation.isPending ? "Starting..." : "Start Game"}
            </Button>
            
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                navigator.clipboard.writeText(roomCode);
                toast({
                  title: "Copied!",
                  description: "Room code copied to clipboard"
                });
              }}
            >
              <Share2 className="mr-2 h-5 w-5" />
              Copy Room Code
            </Button>
            
            <Button
              variant="ghost"
              className="w-full text-destructive hover:text-destructive"
              onClick={handleLeaveLobby}
            >
              <LogOut className="mr-2 h-5 w-5" />
              Leave Lobby
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LobbyScreen;
