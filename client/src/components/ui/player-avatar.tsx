import { cn } from "@/lib/utils";

interface PlayerAvatarProps {
  name: string;
  color?: string;
  isCurrentTurn?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  name,
  color = "#6200ee",
  isCurrentTurn = false,
  size = "md",
  className = ""
}) => {
  // Get initials from name (max 2 characters)
  const initials = name
    .split(" ")
    .map(part => part[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);
  
  const sizeClasses = {
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-12 h-12 text-base"
  };
  
  return (
    <div className="relative">
      <div 
        className={cn(
          "rounded-full flex items-center justify-center text-white font-medium",
          sizeClasses[size],
          isCurrentTurn && "player-turn",
          className
        )}
        style={{ backgroundColor: color }}
      >
        {initials}
      </div>
      
      {isCurrentTurn && (
        <div className="absolute -top-1 -right-1 bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
            <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
          </svg>
        </div>
      )}
    </div>
  );
};

export default PlayerAvatar;
