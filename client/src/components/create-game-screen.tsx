import { useState } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import RoomCodeDisplay from "@/components/ui/room-code-display";
import { ChatButton } from "@/components/ui/chat-button";
import LanguageSelector from "@/components/ui/language-selector";

const CreateGameScreen: React.FC = () => {
  const [, navigate] = useLocation();
  const { t } = useTranslation();
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
        title: t('create.nameRequired'),
        description: t('create.pleaseEnterName'),
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
        title: t('create.failedToCreate'),
        description: t('create.tryAgain'),
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
      <div className="absolute top-4 right-4">
        <LanguageSelector />
      </div>
      
      <Card className="max-w-md w-full">
        <CardContent className="pt-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold">{t('create.title')}</h2>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleBackToHome}
              aria-label={t('join.back')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </div>
          
          {!gameCreated ? (
            <>
              <div className="mb-6">
                <Label htmlFor="playerName" className="block text-sm mb-1">
                  {t('create.nameLabel')}
                </Label>
                <Input
                  id="playerName"
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder={t('create.namePlaceholder')}
                  className="w-full"
                  maxLength={20}
                />
              </div>
              
              <div className="mb-6">
                <Label htmlFor="pointLimit" className="block text-sm mb-1">
                  {t('create.pointsLimit')}
                </Label>
                <Select
                  value={pointLimit}
                  onValueChange={setPointLimit}
                >
                  <SelectTrigger id="pointLimit" className="w-full">
                    <SelectValue placeholder={t('create.pointsLimit')} />
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
                {isCreating ? t('create.creating') : t('create.startGame')}
              </Button>
            </>
          ) : (
            <div className="mt-6">
              <p className="text-sm text-muted-foreground mb-1">{t('create.shareCode')}</p>
              <div className="bg-muted p-3 rounded-lg font-mono text-lg text-center mb-4">
                {roomCode}
              </div>
              
              <div className="flex justify-center mb-6">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    navigator.clipboard.writeText(roomCode);
                    toast({
                      title: t('create.copied'),
                      description: t('create.codeCopied')
                    });
                  }}
                  className="flex items-center"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  {t('create.copyCode')}
                </Button>
              </div>
              
              <Button
                className="w-full"
                onClick={handleGoToLobby}
              >
                {t('create.goToLobby')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Add ChatButton when game is created */}
      {gameCreated && gameId && playerId && playerName && (
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

export default CreateGameScreen;
