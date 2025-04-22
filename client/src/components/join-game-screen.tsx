import { useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import LanguageSelector from "@/components/ui/language-selector";

const JoinGameScreen: React.FC = () => {
  const [, navigate] = useLocation();
  const { t } = useTranslation();
  const { toast } = useToast();
  
  const [playerName, setPlayerName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const handleJoinGame = async () => {
    if (!playerName.trim()) {
      setError(t('join.nameRequired'));
      return;
    }
    
    if (!roomCode.trim()) {
      setError(t('join.codeRequired'));
      return;
    }
    
    try {
      setIsJoining(true);
      setError(null);
      
      const response = await apiRequest("POST", "/api/games/join", {
        playerName: playerName.trim(),
        roomCode: roomCode.trim().toUpperCase()
      });
      
      const data = await response.json();
      
      // Store game info in session storage
      sessionStorage.setItem("gameId", data.gameId);
      sessionStorage.setItem("playerId", data.playerId);
      sessionStorage.setItem("playerName", playerName);
      sessionStorage.setItem("roomCode", data.roomCode);
      
      // Navigate to lobby
      navigate(`/lobby/${data.gameId}`);
      
    } catch (error) {
      console.error("Failed to join game:", error);
      if (error instanceof Error && error.message.includes("Game is full")) {
        setError(t('join.gameFull'));
      } else {
        setError(t('join.invalidCode'));
      }
    } finally {
      setIsJoining(false);
    }
  };
  
  const handleBackToHome = () => {
    navigate("/");
  };
  
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <div className="absolute top-4 right-4">
        <LanguageSelector />
      </div>
      
      <Card className="max-w-md w-full">
        <CardContent className="pt-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold">{t('join.title')}</h2>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleBackToHome}
              aria-label={t('join.back')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </div>
          
          <div className="mb-6">
            <Label htmlFor="joinPlayerName" className="block text-sm mb-1">
              {t('create.nameLabel')}
            </Label>
            <Input
              id="joinPlayerName"
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder={t('create.namePlaceholder')}
              className="w-full"
              maxLength={20}
            />
          </div>
          
          <div className="mb-6">
            <Label htmlFor="joinRoomCode" className="block text-sm mb-1">
              {t('join.roomCode')}
            </Label>
            <Input
              id="joinRoomCode"
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder={t('join.roomCodePlaceholder')}
              className="w-full uppercase"
              maxLength={6}
            />
          </div>
          
          {error && (
            <div className="mb-4 text-destructive flex items-start">
              <AlertCircle className="h-4 w-4 mr-1 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          
          <Button
            className="w-full"
            onClick={handleJoinGame}
            disabled={isJoining}
          >
            {isJoining ? t('join.joining') : t('join.joinGame')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default JoinGameScreen;
