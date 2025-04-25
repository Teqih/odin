import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { 
  connectToGameServer, 
  addMessageHandler, 
  disconnectFromGameServer, 
  getConnectionStatus, 
  forceReconnect 
} from "@/lib/websocket";
import { Card as CardType, GameState, Player, WebSocketMessage } from "@shared/schema";
import CardComponent from "@/components/ui/card-component";
import PlayerAvatar from "@/components/ui/player-avatar";
import RoomCodeDisplay from "@/components/ui/room-code-display";
import { 
  LogOut, 
  SkipForward,
  HelpCircle,
  Send,
  AlertCircle,
  MessageCircle,
  ArrowLeft, 
  ShieldAlert, 
  Info, 
  Check, 
  ChevronsRight, 
  Play, 
  Wifi, 
  WifiOff,
  RefreshCw,
  Volume2,
  VolumeX
} from "lucide-react";
import { isValidCardSet, sortCards } from "@/lib/card-utils";
import { ChatButton } from "@/components/ui/chat-button";
import { useQueryClient } from "@tanstack/react-query";
import { useSoundEffects } from "@/hooks/useSoundEffects";

// Lazy load heavy components
const PickCardModal = lazy(() => import("@/components/modals/pick-card-modal"));
const RoundEndModal = lazy(() => import("@/components/modals/round-end-modal"));
const GameEndModal = lazy(() => import("@/components/modals/game-end-modal"));
const ChatPanel = lazy(() => import("@/components/ui/chat-panel"));

// Loading fallback for lazy-loaded components
const ModalLoadingFallback = () => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
    <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
  </div>
);

const playerColors = [
  "#e53935", // red
  "#1e88e5", // blue
  "#43a047", // green
  "#fdd835", // yellow
  "#8e24aa", // purple
  "#fb8c00"  // orange
];

interface GameScreenProps {
  gameId: string;
}

const GameScreen: React.FC<GameScreenProps> = ({ gameId }) => {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const dropZoneRef = useRef<HTMLDivElement>(null);
  
  // Get stored player info - ensure this is persisted properly
  const playerId = sessionStorage.getItem("playerId") || "";
  
  // Initialize sound effects hook before any conditional returns
  const { playYourTurnSound, playCardSound, soundEnabled, toggleSound } = useSoundEffects();
  const previousTurnRef = useRef<string | null>(null);
  
  // State for selected cards and game flow
  const [selectedCards, setSelectedCards] = useState<CardType[]>([]);
  const [showPickCardModal, setShowPickCardModal] = useState(false);
  const [showRoundEndModal, setShowRoundEndModal] = useState(false);
  const [showGameEndModal, setShowGameEndModal] = useState(false);
  const [cardsToPickFrom, setCardsToPickFrom] = useState<CardType[]>([]);
  const [roundWinnerName, setRoundWinnerName] = useState<string>("");
  const [roundScores, setRoundScores] = useState<{name: string, score: number, cards: number}[]>([]);
  const [gameWinnerName, setGameWinnerName] = useState<string>("");
  const [finalScores, setFinalScores] = useState<{name: string, score: number}[]>([]);
  
  // Drag and drop state
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  
  // Add this state for optimistic updates
  const [optimisticGameState, setOptimisticGameState] = useState<GameState | null>(null);
  
  // Add a ref to store hands to avoid dependency issues
  const handRef = useRef<CardType[]>([]);

  // Add a state for disconnection notification
  const [connectionStatus, setConnectionStatus] = useState<"connected" | "connecting" | "disconnected" | "reconnecting">("connecting");
  const [showDisconnectedAlert, setShowDisconnectedAlert] = useState(false);

  // Fetch game state
  const { data: gameStateData, isLoading, error, isError } = useQuery<GameState, Error>({
    queryKey: [`/api/games/${gameId}?playerId=${encodeURIComponent(playerId)}`],
    enabled: !!gameId && !!playerId,
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
    retry: (failureCount, error) => {
      // Don't retry on 403 or 404 errors, as the game/player likely doesn't exist
      if (error.message.includes('403') || error.message.includes('404')) {
        return false;
      }
      // Otherwise, retry up to 3 times
      return failureCount < 3;
    },
    staleTime: 1000, // Reduce stale time slightly
  });

  // Prepare the game state and hand data early to avoid hook ordering issues
  const gameState = optimisticGameState || gameStateData;
  const currentPlayer = gameState?.players?.find((p: Player) => p.id === playerId);
  const myHand = currentPlayer ? sortCards(currentPlayer.hand || []) : [];
  
  // Add effect for sound notifications when it's the player's turn
  useEffect(() => {
    // Store current turn data in a ref to avoid triggering the effect again
    if (gameStateData) {
      const currentTurnPlayerId = gameStateData.players[gameStateData.currentTurn]?.id;
      const isMyTurnNow = currentTurnPlayerId === playerId;
      
      // Only compare with the previous value from the ref (not a dependency)
      const wasMyTurnBefore = previousTurnRef.current !== null && 
        previousTurnRef.current === playerId;
      
      // Play sound when it newly becomes our turn (and wasn't our turn before)
      if (isMyTurnNow && !wasMyTurnBefore) {
        playYourTurnSound();
      }
      
      // Store current player's ID in the ref, not the turn index
      previousTurnRef.current = currentTurnPlayerId;
    }
  }, [gameStateData, playerId, playYourTurnSound]);
  
  // Update the hand ref whenever myHand changes
  useEffect(() => {
    // Only update the handRef without triggering state updates
    handRef.current = myHand;
  }, [myHand]);
  
  // Separate effect to update selected cards to avoid infinite loops
  useEffect(() => {
    // Only run this when myHand changes and there are selected cards
    if (myHand.length > 0 && selectedCards.length > 0) {
      // Check if any selected cards are no longer in the hand
      const anyInvalidCards = selectedCards.some(
        selectedCard => !myHand.some(handCard => handCard.id === selectedCard.id)
      );
      
      // Only update state if there are invalid cards to remove
      if (anyInvalidCards) {
        setSelectedCards(prevSelected => 
          prevSelected.filter(selectedCard => 
            myHand.some(handCard => handCard.id === selectedCard.id)
          )
        );
      }
    }
  }, [myHand, selectedCards]);
  
  // Play cards mutation
  const playCardsMutation = useMutation({
    mutationFn: async (cards: CardType[]) => {
      await apiRequest("POST", `/api/games/${gameId}/play`, { 
        playerId,
        cards
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}?playerId=${encodeURIComponent(playerId)}`] });
      setSelectedCards([]);
    },
    onError: (error) => {
      toast({
        title: "Failed to play cards",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive"
      });
    }
  });
  
  // Pick card mutation
  const pickCardMutation = useMutation({
    mutationFn: async (cardId: string) => {
      await apiRequest("POST", `/api/games/${gameId}/pick`, { 
        playerId,
        cardId
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}?playerId=${encodeURIComponent(playerId)}`] });
      setShowPickCardModal(false);
    },
    onError: (error) => {
      toast({
        title: "Failed to pick card",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive"
      });
    }
  });
  
  // Pass turn mutation
  const passTurnMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/games/${gameId}/pass`, { playerId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}`] });
    },
    onError: (error) => {
      // Reset the optimistic UI update
      setOptimisticGameState(null);
      
      toast({
        title: "Failed to pass",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive"
      });
    }
  });
  
  // Start new round mutation
  const startNewRoundMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/games/${gameId}/round`, { playerId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: [`/api/games/${gameId}?playerId=${encodeURIComponent(playerId)}`],
        refetchType: 'all'
      });
      setShowRoundEndModal(false);
    },
    onError: (error) => {
      toast({
        title: "Failed to start new round",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive"
      });
    }
  });
  
  useEffect(() => {
    // Redirect if no game ID or player ID
    if (!gameId || !playerId) {
      console.log("Missing gameId or playerId, redirecting to home");
      navigate("/");
      return;
    }
    
    // Save IDs to session storage to help with reconnection
    sessionStorage.setItem("gameId", gameId);
    sessionStorage.setItem("playerId", playerId);
    
    // Connect to WebSocket with improved error handling
    let socket;
    try {
      socket = connectToGameServer(gameId, playerId);
      // Start with connecting status
      setConnectionStatus("connecting");
    } catch (err) {
      console.error("Error connecting to WebSocket:", err);
      setConnectionStatus("disconnected");
      setShowDisconnectedAlert(true);
      toast({
        title: "Connection Error",
        description: "Failed to connect to game server. Please try refreshing the page.",
        variant: "destructive"
      });
    }
    
    // Add message handler
    const removeHandler = addMessageHandler((message: WebSocketMessage) => {
      if (message.type === "turn_update" && message.gameId === gameId) {
        queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}?playerId=${encodeURIComponent(playerId)}`] });
        // Set connected status when we receive game updates
        setConnectionStatus("connected");
        setShowDisconnectedAlert(false);
      } else if (message.type === "error") {
        toast({
          title: "Connection Error",
          description: message.error || "An error occurred with the game connection",
          variant: "destructive"
        });
        
        // If the error is about a duplicate connection, navigate home
        if (message.error?.includes("another device or browser tab")) {
          navigate("/");
        }
      }
    });
    
    // Set up a periodic connection status check
    const statusCheckInterval = setInterval(() => {
      const status = getConnectionStatus();
      setConnectionStatus(status);
      
      // Show disconnected alert if we're disconnected or reconnecting
      if (status === "disconnected" || status === "reconnecting") {
        setShowDisconnectedAlert(true);
      } else if (status === "connected") {
        setShowDisconnectedAlert(false);
      }
    }, 2000);
    
    // Add drag and drop event listeners
    const dropZone = dropZoneRef.current;
    if (dropZone) {
      dropZone.addEventListener("dragover", handleDragOver);
      dropZone.addEventListener("dragleave", handleDragLeave);
      dropZone.addEventListener("drop", handleDrop);
    }
    
    return () => {
      removeHandler();
      disconnectFromGameServer();
      clearInterval(statusCheckInterval);
      
      // Remove event listeners
      if (dropZone) {
        dropZone.removeEventListener("dragover", handleDragOver);
        dropZone.removeEventListener("dragleave", handleDragLeave);
        dropZone.removeEventListener("drop", handleDrop);
      }
    };
  }, [gameId, playerId, navigate, toast]);
  
  useEffect(() => {
    if (gameStateData) {
      const currentPlayer = gameStateData.players.find((p: Player) => p.id === playerId);
      if (!currentPlayer) {
        toast({
          title: "Error",
          description: "You are not a player in this game",
          variant: "destructive"
        });
        navigate("/");
        return;
      }
      
      if (gameStateData.roundWinner === null && showRoundEndModal) {
        setShowRoundEndModal(false);
      }
      
      if (gameStateData.roundWinner && !showRoundEndModal && !showGameEndModal) {
        const winnerPlayer = gameStateData.players.find((p: Player) => p.id === gameStateData.roundWinner);
        if (winnerPlayer) {
          setRoundWinnerName(winnerPlayer.name);
          const scores = gameStateData.players.map((p: Player) => ({
            name: p.name + (p.id === playerId ? " (You)" : ""),
            score: p.score,
            cards: p.hand.length
          }));
          setRoundScores(scores);
          setShowRoundEndModal(true);
        }
      }
      
      if (gameStateData.gameWinner && !showGameEndModal) {
        const winnerPlayer = gameStateData.players.find((p: Player) => p.id === gameStateData.gameWinner);
        if (winnerPlayer) {
          setGameWinnerName(winnerPlayer.name);
          const scores = [...gameStateData.players]
            .sort((a: Player, b: Player) => a.score - b.score)
            .map((p: Player) => ({
              name: p.name + (p.id === playerId ? " (You)" : ""),
              score: p.score
            }));
          setFinalScores(scores);
          setShowRoundEndModal(false);
          setShowGameEndModal(true);
        }
      }
      
      if (gameStateData.lastAction.type === "play") {
        if (gameStateData.lastAction.playerId === playerId) {
          setSelectedCards([]);
        }
        if (
          gameStateData.lastAction.playerId === playerId && 
          gameStateData.previousPlay.length > 0 && 
          !showPickCardModal
        ) {
          setCardsToPickFrom(gameStateData.previousPlay);
          setShowPickCardModal(true);
        }
      }
      
      if (gameStateData.lastAction.type === "pick" && showPickCardModal) {
        setShowPickCardModal(false);
        setCardsToPickFrom([]);
      }
    }
  }, [gameStateData, playerId, navigate, toast, showRoundEndModal, showGameEndModal, showPickCardModal]);
  
  // Add a new useEffect to ensure selected cards stay in sync with the current hand
  useEffect(() => {
    if (gameStateData) {
      const currentPlayer = gameStateData.players.find(p => p.id === playerId);
      if (currentPlayer) {
        // Clean up selected cards that are no longer in the player's hand
        // This fixes the state mismatch that causes selection display issues
        setSelectedCards(prevSelected => 
          prevSelected.filter(selectedCard => 
            currentPlayer.hand.some(handCard => handCard.id === selectedCard.id)
          )
        );
      }
    }
  }, [gameStateData, playerId]);

  // Add a useEffect to clear the optimistic state when we get a new update
  useEffect(() => {
    if (gameStateData && optimisticGameState) {
      // If the server's turn differs from our optimistic update, clear the optimistic state
      if (gameStateData.currentTurn !== optimisticGameState.currentTurn) {
        setOptimisticGameState(null);
      }
      // Or if we get a new action after our pass
      if (gameStateData.lastAction.type !== optimisticGameState.lastAction.type) {
        setOptimisticGameState(null);
      }
    }
  }, [gameStateData]);
  
  // Add a useEffect to clear selected cards when it's not the player's turn
  useEffect(() => {
    if (gameStateData && gameStateData.players[gameStateData.currentTurn]?.id !== playerId) {
      setSelectedCards([]);
    }
  }, [gameStateData?.currentTurn, playerId]);
  
  // Handle drag and drop
  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };
  
  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };
  
  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    
    try {
      const cardData = e.dataTransfer?.getData("text/plain");
      if (cardData) {
        const card = JSON.parse(cardData) as CardType;
        handleCardSelection(card);
      }
    } catch (error) {
      console.error("Error processing dropped card:", error);
    }
  };
  
  const handleCardSelection = (card: CardType) => {
    setSelectedCards(prevSelected => {
      // Check if card is already selected
      const isSelected = prevSelected.some(c => c.id === card.id);
      
      if (isSelected) {
        // Deselect the card using functional update pattern
        return prevSelected.filter(c => c.id !== card.id);
      } else {
        // Check if the card is actually in the player's hand using both handRef and gameStateData
        const currentHand = handRef.current;
        const currentPlayer = gameStateData?.players.find(p => p.id === playerId);
        
        // Verify card exists in current hand (use both refs for extra safety)
        const handContainsCard = currentHand.some(c => c.id === card.id) && 
                                (currentPlayer?.hand.some(c => c.id === card.id) || false);
        
        if (!handContainsCard) {
          console.error("Attempted to select a card not in player's hand");
          return prevSelected; // Return unchanged state
        }
        
        // Check if the new card can be added to the selection
        const newSelection = [...prevSelected, card];
        if (isValidCardSet(newSelection)) {
          return newSelection;
        } else {
          toast({
            title: "Invalid selection",
            description: "All cards must be the same color or same value",
            variant: "destructive"
          });
          return prevSelected; // Return unchanged state on validation failure
        }
      }
    });
  };
  
  const handlePlayCards = () => {
    if (selectedCards.length === 0) {
      toast({
        title: "No cards selected",
        description: "Select one or more cards to play",
        variant: "destructive"
      });
      return;
    }
    
    // Ensure all selected cards are actually in the player's hand
    const currentHand = handRef.current;
    const allCardsInHand = selectedCards.every(card => 
      currentHand.some(handCard => handCard.id === card.id)
    );
    
    if (!allCardsInHand) {
      toast({
        title: "Invalid selection",
        description: "Some selected cards are not in your hand",
        variant: "destructive"
      });
      setSelectedCards([]); // Reset selection to fix the desync
      return;
    }
    
    // Play card sound effect
    playCardSound();
    
    // Create an optimistic update for play cards
    const optimisticCards = [...selectedCards]; // Store cards for visual feedback
    
    // Call the API
    playCardsMutation.mutate(selectedCards);
  };
  
  const handlePassTurn = () => {
    // Clear selected cards when passing turn
    setSelectedCards([]);
    
    // Create an optimistic update of the game state
    if (gameStateData) {
      const nextPlayerIndex = (gameStateData.currentTurn + 1) % gameStateData.players.length;
      
      const optimisticUpdate: GameState = {
        ...gameStateData,
        currentTurn: nextPlayerIndex,
        lastAction: {
          type: "pass",
          playerId: playerId
        },
        passCount: gameStateData.passCount + 1
      };
      
      // Apply optimistic update immediately
      setOptimisticGameState(optimisticUpdate);
      
      // Apply actual update from server
      passTurnMutation.mutate();
    }
  };
  
  const handlePickCard = (card: CardType) => {
    pickCardMutation.mutate(card.id);
    setShowPickCardModal(false); // Close the modal after picking a card
  };
  
  const handleStartNewRound = () => {
    startNewRoundMutation.mutate();
    setShowRoundEndModal(false);
  };
  
  const handleLeaveGame = () => {
    if (confirm("Are you sure you want to leave the game?")) {
      sessionStorage.removeItem("gameId");
      sessionStorage.removeItem("playerId");
      sessionStorage.removeItem("playerName");
      sessionStorage.removeItem("roomCode");
      
      navigate("/");
    }
  };
  
  const handleBackToLobby = () => {
    navigate(`/lobby/${gameId}`);
  };
  
  const handleNewGame = () => {
    navigate("/");
  };
  
  const showRules = () => {
    toast({
      title: "Game Rules",
      description: "Play cards of same color or value. You can play the same number OR one more card than previous play. Higher value beats previous play. Empty your hand to win!",
      duration: 7000
    });
  };
  
  // Add a button to manually reconnect if disconnected
  const handleReconnect = () => {
    // Attempt to force reconnect
    forceReconnect();
    toast({
      title: "Reconnecting...",
      description: "Attempting to reconnect to the game server.",
    });
  };
  
  // Add an effect to handle query errors, specifically 403/404
  useEffect(() => {
    if (isError && error) {
      const errorMessage = error.message.toLowerCase();
      if (errorMessage.includes("403") || errorMessage.includes("404")) {
        console.error("Game or Player not found (403/404). Clearing session and redirecting.");
        toast({
          title: "Game session ended",
          description: "The game was not found or your session expired. Redirecting to home.",
          variant: "destructive"
        });
        // Clear stale session data
        sessionStorage.removeItem("gameId");
        sessionStorage.removeItem("playerId");
        sessionStorage.removeItem("playerName");
        sessionStorage.removeItem("roomCode");
        // Redirect home
        navigate("/");
      }
    }
  }, [isError, error, navigate, toast]);
  
  // Handle loading state
  if (isLoading || !gameStateData) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p>Loading game...</p>
        </div>
      </div>
    );
  }
  
  // Handle error state
  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Card className="p-6 max-w-md">
          <div className="text-center">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
            <h2 className="text-xl font-semibold mb-2">Error Loading Game</h2>
            <p className="text-muted-foreground mb-4">
              {error instanceof Error ? error.message : "Unable to join the game. The game may no longer exist."}
            </p>
            <Button onClick={() => navigate("/")}>
              Back to Home
            </Button>
          </div>
        </Card>
      </div>
    );
  }
  
  // At this point gameState can't be undefined because we've checked !gameStateData above
  // and optimisticGameState is null by default, but TypeScript doesn't know that
  // Explicitly assert that gameState is not undefined
  const safeGameState = gameState!;

  // Additional check: If currentPlayer is somehow not found despite being in the game, show an error.
  if (!currentPlayer) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Card className="p-6 max-w-md">
          <div className="text-center">
            <AlertCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
               <h2 className="text-xl font-semibold mb-2">Error</h2>
               <p className="text-muted-foreground mb-4">Could not find your player data in the game.</p>
               <Button onClick={() => navigate("/")}>Back to Home</Button>
          </div>
        </Card>
      </div>
    );
  }
  
  // Define variables that depend on currentPlayer AFTER the check
  const isMyTurn = safeGameState.players[safeGameState.currentTurn]?.id === playerId;
  const showPlayButton = selectedCards.length > 0 && isMyTurn;
  const showPassButton = isMyTurn;
  const currentPlayCards = safeGameState.currentPlay;
  const currentTurnPlayer = safeGameState.players[safeGameState.currentTurn];
  const opponents = safeGameState.players.filter(p => p.id !== playerId);
  
  // Function to check connection status
  const checkConnectionStatus = () => {
    // Implementation of connection check
  };
  
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Game Header */}
      <header className="bg-card shadow-md p-3 flex justify-between items-center">
        <div className="flex items-center">
          <h1 className="text-xl font-semibold text-primary">Odin Game</h1>
          <RoomCodeDisplay roomCode={safeGameState.roomCode} className="ml-4" />
        </div>
        
        <div className="flex items-center gap-2">
          {/* Connection Status Indicator */}
          <div className="flex items-center mr-2">
            <div className={`h-2 w-2 rounded-full mr-1 ${
              connectionStatus === "connected" ? "bg-green-500" :
              connectionStatus === "connecting" ? "bg-yellow-500" :
              connectionStatus === "reconnecting" ? "bg-yellow-500 animate-pulse" :
              "bg-red-500"
            }`} />
            <span className="text-xs text-muted-foreground">
              {connectionStatus === "connected" ? "Connected" :
               connectionStatus === "connecting" ? "Connecting..." :
               connectionStatus === "reconnecting" ? "Reconnecting..." :
               "Disconnected"}
            </span>
          </div>
          
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={toggleSound} 
            aria-label={soundEnabled ? "Disable sounds" : "Enable sounds"}
            title={soundEnabled ? "Disable sounds" : "Enable sounds"}
          >
            {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={showRules}
            aria-label="Game Rules"
            title="Game Rules"
          >
            <HelpCircle size={18} />
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className="p-1 h-auto text-destructive hover:text-destructive"
            onClick={handleLeaveGame}
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>
      
      {/* Disconnection Alert */}
      {showDisconnectedAlert && (
        <div className="bg-destructive/20 text-destructive p-2 text-center flex items-center justify-center">
          <AlertCircle className="h-4 w-4 mr-2" />
          <span>Connection lost. Game updates may be delayed.</span>
          <Button 
            variant="outline" 
            size="sm" 
            className="ml-2 h-7"
            onClick={handleReconnect}
          >
            Reconnect
          </Button>
        </div>
      )}
      
      {/* Game Play Area */}
      <main className="flex-grow flex flex-col justify-between overflow-hidden">
        {/* Opponent Area */}
        <div className="opponents-area p-3 flex flex-wrap justify-center md:justify-around gap-4 overflow-y-auto">
          {opponents.map((opponent, index) => (
            <div 
              key={opponent.id} 
              className={`bg-card rounded-lg shadow-sm p-2 flex flex-col items-center ${
                opponent.id === currentTurnPlayer?.id ? "player-turn" : ""
              }`}
            >
              <div className="relative">
                <PlayerAvatar 
                  name={opponent.name} 
                  color={playerColors[index % playerColors.length]}
                  isCurrentTurn={opponent.id === currentTurnPlayer?.id}
                  size="md"
                />
              </div>
              <p className="text-sm mt-1 font-medium">{opponent.name}</p>
              <div className="mt-1 flex items-center text-sm">
                <span className="mr-1">⭐</span>
                <span>{opponent.score} points</span>
              </div>
              <div className="mt-2 flex gap-1">
                {/* Show card backs for opponents */}
                {opponent.hand.slice(0, 5).map((_, i) => (
                  <div key={i} className="w-5 h-7 bg-primary rounded-sm shadow-sm"></div>
                ))}
                {opponent.hand.length > 5 && (
                  <div className="text-xs text-muted-foreground">
                    +{opponent.hand.length - 5} more
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        
        {/* Central Play Area */}
        <div className="play-area-container flex-grow flex flex-col items-center justify-center mx-auto w-full max-w-3xl px-4">
          {/* Previous Play */}
          <div className="previous-play mb-4">
            <p className="text-sm text-muted-foreground text-center mb-2">Previous Play</p>
            <div className="flex justify-center gap-2">
              {safeGameState.previousPlay.length > 0 ? (
                safeGameState.previousPlay.map(card => (
                  <CardComponent 
                    key={card.id} 
                    card={card}
                    showFace={true}
                    onClick={showPickCardModal ? () => handlePickCard(card) : undefined}
                  />
                ))
              ) : (
                <div className="text-sm text-muted-foreground">No previous play</div>
              )}
            </div>
          </div>
          
          {/* Active Play Area */}
          <div 
            className={`border-2 border-dashed rounded-lg w-full flex-grow max-h-40 flex items-center justify-center my-4 ${
              isDraggingOver ? "border-primary bg-primary/10" : "border-gray-300"
            }`}
          >
            <div 
              ref={dropZoneRef}
              className="w-full h-full flex items-center justify-center"
            >
              {safeGameState.currentPlay.length > 0 ? (
                <div className="flex gap-2 justify-center">
                  {safeGameState.currentPlay.map(card => (
                    <CardComponent 
                      key={card.id} 
                      card={card}
                      showFace={true}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground text-center">
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    className="h-8 w-8 mx-auto mb-2" 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      strokeWidth={2} 
                      d="M12 4v16m8-8H4" 
                    />
                  </svg>
                  <p>
                    {isMyTurn 
                      ? "Drag and drop cards here to play" 
                      : "Waiting for other player to play"}
                  </p>
                </div>
              )}
            </div>
          </div>
          
          {/* Game Info and Actions */}
          <div className="game-info-container mb-4 flex flex-col md:flex-row items-center justify-between w-full">
            <div className={`game-status text-center md:text-left mb-3 md:mb-0 p-2 rounded-md ${isMyTurn ? 'your-turn-highlight' : ''}`}>
              <p className="text-lg font-medium">
                {isMyTurn 
                  ? "Your turn" 
                  : `${currentTurnPlayer?.name}'s turn`}
              </p>
              <p className="text-sm text-muted-foreground">
                {isMyTurn 
                  ? safeGameState.currentPlay.length > 0 
                    ? `Play ${safeGameState.currentPlay.length} or ${safeGameState.currentPlay.length + 1} cards of higher value` 
                    : "Play any cards of same color or value" 
                  : "Waiting for other player to take their turn"}
              </p>
            </div>
            
            <div className="game-actions flex gap-3">
              <Button
                variant="secondary"
                disabled={!isMyTurn || passTurnMutation.isPending || safeGameState.currentPlay.length === 0}
                onClick={handlePassTurn}
                className={`relative transition-all ${passTurnMutation.isPending ? 'opacity-70' : ''}`}
              >
                {passTurnMutation.isPending && (
                  <div className="absolute inset-0 flex items-center justify-center bg-secondary/30 rounded-md">
                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                  </div>
                )}
                <SkipForward className="mr-1 h-4 w-4" />
                Pass
              </Button>
              
              <Button
                disabled={
                  !isMyTurn || 
                  selectedCards.length === 0 || 
                  playCardsMutation.isPending
                }
                onClick={handlePlayCards}
              >
                <Send className="mr-1 h-4 w-4" />
                Play Cards
              </Button>
            </div>
          </div>
        </div>
        
        {/* Player Hand */}
        <div className="player-hand-container bg-card shadow-md p-4">
          <div className="mb-2 flex justify-between items-center">
            <div className={`flex items-center ${isMyTurn ? 'your-turn-highlight p-1 rounded-md' : ''}`}>
              <PlayerAvatar 
                name={currentPlayer.name} 
                color="#8e24aa" 
                isCurrentTurn={isMyTurn}
                size="sm"
              />
              <p className="ml-2 font-medium">Your Hand</p>
            </div>
            <div className="flex items-center">
              <span className="mr-1">⭐</span>
              <span className="text-sm">{currentPlayer.score} points</span>
            </div>
          </div>
          
          <div className="cards-container overflow-x-auto">
            <div className="flex gap-2 md:gap-3 pb-2 justify-center md:justify-start">
              {myHand.map(card => (
                <CardComponent 
                  key={card.id} 
                  card={card}
                  selected={selectedCards.some(c => c.id === card.id)}
                  showFace={true}
                  draggable={isMyTurn}
                  onClick={isMyTurn ? () => handleCardSelection(card) : undefined}
                />
              ))}
              
              {myHand.length === 0 && (
                <div className="text-muted-foreground">
                  No cards in hand
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      
      {/* Modals */}
      <Suspense fallback={<ModalLoadingFallback />}>
        {showPickCardModal && (
          <PickCardModal 
            cards={cardsToPickFrom}
            onPickCard={handlePickCard}
            isLoading={pickCardMutation.isPending}
          />
        )}
        
        {showRoundEndModal && (
          <RoundEndModal 
            winnerName={roundWinnerName}
            scores={roundScores}
            onStartNextRound={handleStartNewRound}
            onLeaveGame={handleLeaveGame}
            isLoading={startNewRoundMutation.isPending}
            isHost={currentPlayer.isHost}
          />
        )}
        
        {showGameEndModal && (
          <GameEndModal 
            winnerName={gameWinnerName}
            scores={finalScores}
            onNewGame={handleNewGame}
            onBackToLobby={handleBackToLobby}
          />
        )}
      </Suspense>
      
      {/* Replace the ChatPanel with ChatButton */}
      {currentPlayer && (
        <ChatButton
          gameId={gameId}
          playerId={playerId}
          playerName={currentPlayer.name}
          position="bottom-right"
        />
      )}
    </div>
  );
};

export default GameScreen;
