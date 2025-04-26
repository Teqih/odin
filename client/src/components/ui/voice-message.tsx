interface VoiceMessageProps {
  id: string;
  audioUrl: string;
  duration: number;
  isCurrentUser: boolean;
  timestamp: number;
}

function VoiceMessage({ id, audioUrl, duration, isCurrentUser, timestamp }: VoiceMessageProps) {
  return (
    <audio controls preload="metadata">
      <source src={audioUrl} type="audio/mpeg" />
      <source src={audioUrl} type="audio/mp4" />
      <source src={audioUrl} type="audio/webm; codecs=opus" />
      Your browser doesn't support audio playback.
    </audio>
  );
}

export { VoiceMessage };