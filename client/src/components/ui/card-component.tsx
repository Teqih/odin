import React from "react";
import { Card as CardType, CardColor } from "@shared/schema";
import { getCardColorClass, getCardSymbol } from "@/lib/card-utils";
import { cn } from "@/lib/utils";

interface CardComponentProps {
  card: CardType;
  selected?: boolean;
  showFace?: boolean;
  draggable?: boolean;
  onClick?: (card: CardType) => void;
  onDragStart?: (event: React.DragEvent<HTMLDivElement>, card: CardType) => void;
}

const CardComponent: React.FC<CardComponentProps> = ({
  card,
  selected = false,
  showFace = true,
  draggable = false,
  onClick,
  onDragStart
}) => {
  // If not showing face, render card back
  if (!showFace) {
    return (
      <div 
        className="w-5 h-7 md:w-10 md:h-14 bg-primary rounded-md shadow-sm"
      />
    );
  }
  
  const colorClass = getCardColorClass(card.color);
  const symbol = getCardSymbol(card.color);
  
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    if (onDragStart) {
      onDragStart(e, card);
    }
    e.dataTransfer.setData("text/plain", JSON.stringify(card));
  };
  
  return (
    <div 
      className={cn(
        "card relative w-16 h-24 rounded-lg shadow-md flex flex-col transform transition-all",
        colorClass,
        selected && "ring-2 ring-white ring-opacity-70 translate-y-[-10px]",
        (onClick || draggable) && "cursor-pointer hover:shadow-lg"
      )}
      onClick={onClick ? () => onClick(card) : undefined}
      draggable={draggable}
      onDragStart={draggable ? handleDragStart : undefined}
      data-card-id={card.id}
      data-card-color={card.color}
      data-card-value={card.value}
    >
      <div className="p-1 text-xs flex justify-between">
        <span>{card.value}</span>
        <span>{symbol}</span>
      </div>
      <div className="flex-grow flex items-center justify-center text-2xl font-bold">
        {card.value}
      </div>
      <div className="p-1 text-xs flex justify-between">
        <span>{symbol}</span>
        <span>{card.value}</span>
      </div>
    </div>
  );
};

export default CardComponent;
