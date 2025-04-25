import { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useTranslation } from "react-i18next";
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
import { ChatButton } from "@/components/ui/chat-button";
import LanguageSelector from "@/components/ui/language-selector";

interface PlayerItem {
  id: string;
  name: string;
  isHost: boolean;
}

const LobbyScreen: React.FC = () => {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/lobby/:gameId");
  const { toast } = useToast();
  const { t } = useTranslation();
  
  // Get stored game info
  const gameId = params?.gameId || sessionStorage.getItem("gameId") || "";
  const playerId = sessionStorage.getItem("playerId") || "";
  const playerName = sessionStorage.getItem("playerName") || "";
  const roomCode = sessionStorage.getItem("roomCode") || "";
  
  const [isHost, setIsHost] = useState(false);
  
  // Fetch game state
  const { data, isLoading, error } = useQuery<any>({
    queryKey: [`/api/games/${gameId}?playerId=${encodeURIComponent(playerId)}`],
    enabled: !!gameId && !!playerId,
    refetchInterval: 5000,
    refetchIntervalInBackground: true
  });
  
  // Type-safe reference to game state
  const gameState = data as GameState | undefined;
  
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
        title: t('create.failedToCreate'),
        description: error instanceof Error ? error.message : t('create.tryAgain'),
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
    if (gameState && gameState.players) {
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
    if (gameState && gameState.players && gameState.players.length < 2) {
      toast({
        title: t('game.notEnoughPlayers'),
        description: t('game.needTwoPlayers'),
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
            <div className="animate-pulse">{t('game.loading')}</div>
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
            <h2 className="text-xl font-semibold mb-4">{t('game.errorTitle')}</h2>
            <p className="text-muted-foreground mb-4">
              {t('game.errorMessage')}
            </p>
            <Button onClick={() => navigate("/")}>
              {t('game.backToHome')}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  const players = gameState.players || [];
  
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <div className="absolute top-4 right-4 flex flex-wrap gap-2">
        <LanguageSelector />
      </div>
      
      <Card className="max-w-md w-full">
        <CardContent className="pt-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold">{t('game.lobby')}</h2>
            <RoomCodeDisplay roomCode={roomCode} />
          </div>
          
          <div className="mb-6">
            <div className="flex items-center mb-3">
              <Users className="h-5 w-5 mr-2" />
              <h3 className="text-lg font-medium">{t('game.players')}</h3>
            </div>
            <ul className="bg-muted rounded-lg p-2">
              {players.map((player) => (
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
                      {player.id === playerId && ` (${t('game.playerYou')})`}
                    </span>
                  </div>
                  {player.isHost && (
                    <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded-full">
                      {t('game.playerHost')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
          
          <div className="text-center mb-6">
            <p className="text-muted-foreground">{t('game.waitingForPlayers')}</p>
          </div>
          
          <div className="flex gap-3">
            {isHost ? (
              <Button 
                className="flex-1" 
                onClick={handleStartGame} 
                disabled={startGameMutation.isPending}
              >
                <Play className="mr-2 h-4 w-4" />
                {t('game.startGame')}
              </Button>
            ) : (
              <Button variant="outline" className="flex-1" disabled>
                <Play className="mr-2 h-4 w-4" />
                {t('game.waitingTurn')}
              </Button>
            )}
            
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={handleLeaveLobby}
            >
              <LogOut className="mr-2 h-4 w-4" />
              {t('game.leaveLobby')}
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {gameId && playerId && playerName && (
        <ChatButton
          gameId={gameId}
          playerId={playerId}
          playerName={playerName}
          position="bottom-right"
        />
      )}
    </div>
  );
};

export default LobbyScreen;
