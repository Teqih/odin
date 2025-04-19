import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const HomeScreen: React.FC = () => {
  const [, navigate] = useLocation();
  
  const handleCreateGame = () => {
    navigate("/create");
  };
  
  const handleJoinGame = () => {
    navigate("/join");
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-background">
      <div className="text-center mb-8">
        <h1 className="text-4xl md:text-6xl font-bold text-primary mb-4">Odin Card Game</h1>
        <p className="text-lg text-muted-foreground max-w-md mx-auto">
          A turn-based multiplayer card game where strategy meets luck.
        </p>
      </div>
      
      <div className="flex flex-col md:flex-row gap-4 mt-6">
        <Button 
          size="lg"
          className="flex items-center" 
          onClick={handleCreateGame}
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-5 w-5 mr-2" 
            viewBox="0 0 20 20" 
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
          </svg>
          Create Game
        </Button>
        
        <Button 
          variant="outline" 
          size="lg"
          className="flex items-center" 
          onClick={handleJoinGame}
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-5 w-5 mr-2" 
            viewBox="0 0 20 20" 
            fill="currentColor"
          >
            <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 18H7a1 1 0 01-.707-1.707l.804-.804L7.22 15H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clipRule="evenodd" />
          </svg>
          Join Game
        </Button>
      </div>
      
      <Card className="mt-12 max-w-md w-full">
        <CardContent className="pt-6">
          <h2 className="text-2xl font-semibold mb-4">How to Play</h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>Players are dealt cards from a 54-card deck (6 colors, numbered 1-9). Up to 6 players get 9 cards each, larger games get fewer cards.</li>
            <li>On your turn, play one or more cards of the same number or color.</li>
            <li>Other players must match with higher value cards or pass.</li>
            <li>After a play, pick up one card from previous play.</li>
            <li>First to empty their hand wins the round.</li>
            <li>Score 1 point per card left in hand.</li>
            <li>Game ends when a player reaches the point limit.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default HomeScreen;
