import { Button } from "@/components/ui/button";

interface GameScore {
  name: string;
  score: number;
}

interface GameEndModalProps {
  winnerName: string;
  scores: GameScore[];
  onNewGame: () => void;
  onBackToLobby: () => void;
}

const GameEndModal: React.FC<GameEndModalProps> = ({
  winnerName,
  scores,
  onNewGame,
  onBackToLobby
}) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-4">
      <div className="bg-card rounded-lg shadow-lg p-6 max-w-md w-full mx-auto">
        <div className="text-center mb-6">
          <span className="inline-block p-3 bg-primary/10 text-primary rounded-full mb-2">
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-8 w-8" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" 
              />
            </svg>
          </span>
          <h3 className="text-xl font-medium mb-2">Game Over!</h3>
          <p className="text-muted-foreground">
            Point limit reached
          </p>
        </div>
        
        <div className="bg-muted p-4 rounded-lg mb-6">
          <h4 className="font-medium mb-2">Final Scores:</h4>
          <ul className="space-y-2">
            {scores.map((score, index) => (
              <li key={index} className="flex justify-between">
                <span>{score.name}:</span>
                <span className={index === 0 ? "text-success font-medium" : ""}>
                  {score.score} points{index === 0 ? " (Winner!)" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
        
        <div className="flex flex-col gap-3">
          <Button
            className="w-full"
            onClick={onBackToLobby}
          >
            Back to Lobby
          </Button>
          
          <Button
            variant="outline"
            className="w-full"
            onClick={onNewGame}
          >
            New Game
          </Button>
        </div>
      </div>
    </div>
  );
};

export default GameEndModal;
