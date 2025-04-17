import { Button } from "@/components/ui/button";

interface RoundScore {
  name: string;
  score: number;
  cards: number;
}

interface RoundEndModalProps {
  winnerName: string;
  scores: RoundScore[];
  onStartNextRound: () => void;
  isLoading?: boolean;
  isHost: boolean;
}

const RoundEndModal: React.FC<RoundEndModalProps> = ({
  winnerName,
  scores,
  onStartNextRound,
  isLoading = false,
  isHost
}) => {
  // Sort scores by lowest cards (winner at top)
  const sortedScores = [...scores].sort((a, b) => a.cards - b.cards);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg shadow-lg p-6 max-w-md w-full mx-auto">
        <div className="text-center mb-6">
          <span className="inline-block p-3 bg-success/10 text-success rounded-full mb-2">
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
                d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" 
              />
            </svg>
          </span>
          <h3 className="text-xl font-medium mb-2">Round Complete!</h3>
          <p className="text-muted-foreground">
            {winnerName} has emptied their hand
          </p>
        </div>
        
        <div className="bg-muted p-4 rounded-lg mb-6">
          <h4 className="font-medium mb-2">Round Scores:</h4>
          <ul className="space-y-2">
            {sortedScores.map((score, index) => (
              <li key={index} className="flex justify-between">
                <span>{score.name}:</span>
                <span className={score.cards === 0 ? "text-success font-medium" : ""}>
                  +{score.cards} points ({score.cards === 0 ? "Winner!" : `${score.cards} cards`})
                </span>
              </li>
            ))}
          </ul>
        </div>
        
        {isHost ? (
          <Button
            className="w-full"
            onClick={onStartNextRound}
            disabled={isLoading}
          >
            {isLoading ? "Starting..." : "Start Next Round"}
          </Button>
        ) : (
          <p className="text-center text-muted-foreground">
            Waiting for host to start the next round...
          </p>
        )}
      </div>
    </div>
  );
};

export default RoundEndModal;
