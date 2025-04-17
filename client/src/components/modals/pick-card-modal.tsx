import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card as CardType } from "@shared/schema";
import CardComponent from "@/components/ui/card-component";

interface PickCardModalProps {
  cards: CardType[];
  onPickCard: (card: CardType) => void;
  isLoading?: boolean;
}

const PickCardModal: React.FC<PickCardModalProps> = ({
  cards,
  onPickCard,
  isLoading = false,
}) => {
  const [selectedCard, setSelectedCard] = useState<CardType | null>(null);

  const handleCardClick = (card: CardType) => {
    setSelectedCard(card);
  };

  const handleConfirm = () => {
    if (selectedCard) {
      onPickCard(selectedCard);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-card rounded-lg shadow-lg p-6 max-w-md w-full mx-auto">
        <h3 className="text-xl font-medium mb-4">Pick a Card</h3>
        <p className="mb-4">Choose one card to add to your hand:</p>
        
        <div className="flex justify-center flex-wrap gap-3 mb-6">
          {cards.map(card => (
            <div 
              key={card.id} 
              className={`relative transition-all ${
                selectedCard?.id === card.id 
                  ? "transform -translate-y-2"
                  : "hover:-translate-y-1"
              }`}
              onClick={() => handleCardClick(card)}
            >
              <CardComponent card={card} showFace={true} />
              {selectedCard?.id === card.id && (
                <div className="absolute inset-0 rounded-lg ring-2 ring-primary"></div>
              )}
            </div>
          ))}
        </div>
        
        <div className="text-center text-sm text-muted-foreground mb-4">
          <p>The rest of the cards will be discarded</p>
        </div>
        
        <Button 
          className="w-full" 
          onClick={handleConfirm}
          disabled={!selectedCard || isLoading}
        >
          {isLoading ? "Picking..." : "Pick Card"}
        </Button>
      </div>
    </div>
  );
};

export default PickCardModal;
