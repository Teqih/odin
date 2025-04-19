import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { connectToGameServer, addMessageHandler, disconnectFromGameServer } from "@/lib/websocket";
import { Card as CardType, GameState, Player, WebSocketMessage } from "@shared/schema";
import CardComponent from "@/components/ui/card-component";
import PlayerAvatar from "@/components/ui/player-avatar";
import RoomCodeDisplay from "@/components/ui/room-code-display";
import PickCardModal from "@/components/modals/pick-card-modal";
import RoundEndModal from "@/components/modals/round-end-modal";
import GameEndModal from "@/components/modals/game-end-modal";
import { 
  LogOut, 
  SkipForward,
  HelpCircle,
  Send,
  AlertCircle
} from "lucide-react";
import { isValidCardSet, sortCards } from "@/lib/card-utils";

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
  
  // Get stored player info
  const playerId = sessionStorage.getItem("playerId") || "";
  
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
  
  // Fetch game state
  const { data: gameStateData, isLoading, error } = useQuery<GameState>({
    queryKey: [`/api/games/${gameId}?playerId=${encodeURIComponent(playerId)}`],
    enabled: !!gameId && !!playerId,
    refetchInterval: 2000,
    refetchIntervalInBackground: true
  });
  
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
      navigate("/");
      return;
    }
    
    // Connect to WebSocket
    const socket = connectToGameServer(gameId, playerId);
    
    // Add message handler
    const removeHandler = addMessageHandler((message: WebSocketMessage) => {
      if (message.type === "turn_update" && message.gameId === gameId) {
        queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}?playerId=${encodeURIComponent(playerId)}`] });
      }
    });
    
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
      
      // Remove event listeners
      if (dropZone) {
        dropZone.removeEventListener("dragover", handleDragOver);
        dropZone.removeEventListener("dragleave", handleDragLeave);
        dropZone.removeEventListener("drop", handleDrop);
      }
    };
  }, [gameId, playerId, navigate]);
  
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
    // Check if card is already selected
    const isSelected = selectedCards.some(c => c.id === card.id);
    
    if (isSelected) {
      // Deselect the card
      setSelectedCards(selectedCards.filter(c => c.id !== card.id));
    } else {
      // Check if the new card can be added to the selection
      const newSelection = [...selectedCards, card];
      if (isValidCardSet(newSelection)) {
        setSelectedCards(newSelection);
      } else {
        toast({
          title: "Invalid selection",
          description: "All cards must be the same color or same value",
          variant: "destructive"
        });
      }
    }
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
    
    playCardsMutation.mutate(selectedCards);
  };
  
  const handlePassTurn = () => {
    passTurnMutation.mutate();
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
  
  // Handle loading state
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p>Loading game...</p>
        </div>
      </div>
    );
  }
  
  // Handle error or missing data state
  if (error || !gameStateData) {
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
  
  // --- Game Logic & Render --- 
  // gameStateData is guaranteed to be valid GameState here
  const gameState = gameStateData;
  
  // Get current player data AFTER ensuring gameState is valid
  const currentPlayer = gameState.players.find((p: Player) => p.id === playerId);
  
  // Additional check: If currentPlayer is somehow not found despite being in the game, show an error.
  // This satisfies the linter and handles edge cases.
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
  const myHand = sortCards(currentPlayer.hand || []); // No optional chaining needed now
  const isMyTurn = gameState.players[gameState.currentTurn]?.id === playerId;
  const showPlayButton = selectedCards.length > 0 && isMyTurn;
  const showPassButton = isMyTurn;
  const currentPlayCards = gameState.currentPlay;
  const currentTurnPlayer = gameState.players[gameState.currentTurn];
  const opponents = gameState.players.filter(p => p.id !== playerId);
  
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Game Header */}
      <header className="bg-card shadow-md p-3 flex justify-between items-center">
        <div className="flex items-center">
          <h1 className="text-xl font-semibold text-primary">Odin Game</h1>
          <RoomCodeDisplay roomCode={gameState.roomCode} className="ml-4" />
        </div>
        
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="sm" 
            className="p-1 h-auto"
            onClick={showRules}
          >
            <HelpCircle className="h-5 w-5" />
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
              {gameState.previousPlay.length > 0 ? (
                gameState.previousPlay.map(card => (
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
              {gameState.currentPlay.length > 0 ? (
                <div className="flex gap-2 justify-center">
                  {gameState.currentPlay.map(card => (
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
            <div className="game-status text-center md:text-left mb-3 md:mb-0">
              <p className="text-lg font-medium">
                {isMyTurn 
                  ? "Your turn" 
                  : `${currentTurnPlayer?.name}'s turn`}
              </p>
              <p className="text-sm text-muted-foreground">
                {isMyTurn 
                  ? gameState.currentPlay.length > 0 
                    ? `Play ${gameState.currentPlay.length} or ${gameState.currentPlay.length + 1} cards of higher value` 
                    : "Play any cards of same color or value" 
                  : "Waiting for other player to take their turn"}
              </p>
            </div>
            
            <div className="game-actions flex gap-3">
              <Button
                variant="secondary"
                disabled={!isMyTurn || passTurnMutation.isPending || gameState.currentPlay.length === 0}
                onClick={handlePassTurn}
              >
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
            <div className="flex items-center">
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
    </div>
  );
};

export default GameScreen;
