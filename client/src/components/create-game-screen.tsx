import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import RoomCodeDisplay from "@/components/ui/room-code-display";

const CreateGameScreen: React.FC = () => {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [playerName, setPlayerName] = useState("");
  const [pointLimit, setPointLimit] = useState("15");
  const [isCreating, setIsCreating] = useState(false);
  const [gameCreated, setGameCreated] = useState(false);
  const [roomCode, setRoomCode] = useState("");
  const [gameId, setGameId] = useState("");
  const [playerId, setPlayerId] = useState("");
  
  const handleCreateGame = async () => {
    if (!playerName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter your name",
        variant: "destructive"
      });
      return;
    }
    
    try {
      setIsCreating(true);
      
      const response = await apiRequest("POST", "/api/games", {
        playerName: playerName.trim(),
        pointLimit: parseInt(pointLimit)
      });
      
      const data = await response.json();
      setRoomCode(data.roomCode);
      setGameId(data.gameId);
      setPlayerId(data.playerId);
      setGameCreated(true);
      
      // Store game info in session storage
      sessionStorage.setItem("gameId", data.gameId);
      sessionStorage.setItem("playerId", data.playerId);
      sessionStorage.setItem("playerName", playerName);
      sessionStorage.setItem("roomCode", data.roomCode);
      
    } catch (error) {
      console.error("Failed to create game:", error);
      toast({
        title: "Failed to create game",
        description: "Please try again",
        variant: "destructive"
      });
    } finally {
      setIsCreating(false);
    }
  };
  
  const handleBackToHome = () => {
    navigate("/");
  };
  
  const handleGoToLobby = () => {
    navigate(`/lobby/${gameId}`);
  };
  
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold">Create Game</h2>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleBackToHome}
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </div>
          
          {!gameCreated ? (
            <>
              <div className="mb-6">
                <Label htmlFor="playerName" className="block text-sm mb-1">
                  Your Name
                </Label>
                <Input
                  id="playerName"
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full"
                  maxLength={20}
                />
              </div>
              
              <div className="mb-6">
                <Label htmlFor="pointLimit" className="block text-sm mb-1">
                  Point Limit
                </Label>
                <Select
                  value={pointLimit}
                  onValueChange={setPointLimit}
                >
                  <SelectTrigger id="pointLimit" className="w-full">
                    <SelectValue placeholder="Select point limit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 points</SelectItem>
                    <SelectItem value="20">20 points</SelectItem>
                    <SelectItem value="25">25 points</SelectItem>
                    <SelectItem value="30">30 points</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <Button
                className="w-full"
                onClick={handleCreateGame}
                disabled={isCreating}
              >
                {isCreating ? "Creating..." : "Create Game Room"}
              </Button>
            </>
          ) : (
            <div className="mt-6">
              <p className="text-sm text-muted-foreground mb-1">Share this code with friends:</p>
              <div className="bg-muted p-3 rounded-lg font-mono text-lg text-center mb-4">
                {roomCode}
              </div>
              
              <div className="flex justify-center mb-6">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    navigator.clipboard.writeText(roomCode);
                    toast({
                      title: "Copied!",
                      description: "Room code copied to clipboard"
                    });
                  }}
                  className="flex items-center"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Code
                </Button>
              </div>
              
              <Button
                className="w-full"
                onClick={handleGoToLobby}
              >
                Go to Lobby
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CreateGameScreen;
