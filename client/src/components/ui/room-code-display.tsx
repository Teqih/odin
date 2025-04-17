import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy } from "lucide-react";

interface RoomCodeDisplayProps {
  roomCode: string;
  label?: string;
  className?: string;
}

const RoomCodeDisplay: React.FC<RoomCodeDisplayProps> = ({
  roomCode,
  label = "Room Code:",
  className = ""
}) => {
  const { toast } = useToast();
  const [copying, setCopying] = useState(false);
  
  const copyToClipboard = async () => {
    try {
      setCopying(true);
      await navigator.clipboard.writeText(roomCode);
      toast({
        title: "Copied!",
        description: "Room code copied to clipboard",
        duration: 2000
      });
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Please copy the code manually",
        variant: "destructive"
      });
    } finally {
      setCopying(false);
    }
  };
  
  return (
    <div className={`flex items-center ${className}`}>
      <span className="text-sm font-medium text-muted-foreground mr-1">{label}</span>
      <span className="font-mono font-medium">{roomCode}</span>
      <Button 
        variant="ghost" 
        size="sm" 
        className="ml-1 p-1 h-auto"
        onClick={copyToClipboard}
        disabled={copying}
      >
        <Copy className="h-4 w-4" />
      </Button>
    </div>
  );
};

export default RoomCodeDisplay;
