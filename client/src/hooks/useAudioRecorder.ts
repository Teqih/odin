import { useState, useRef, useCallback } from 'react';

// Add browser detection function
const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
         (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

// Determine the audio MIME type based on browser
const getAudioMimeType = () => {
  if (isIOS()) {
    return 'audio/mp4';
  }
  return 'audio/webm';
};

interface AudioRecorderState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  audioBlob: Blob | null;
  audioMimeType: string;
  error: string | null;
}

interface AudioRecorderControls {
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  clearRecording: () => void;
}

export function useAudioRecorder(): AudioRecorderState & AudioRecorderControls {
  const [state, setState] = useState<AudioRecorderState>({
    isRecording: false,
    isPaused: false,
    duration: 0,
    audioBlob: null,
    audioMimeType: getAudioMimeType(),
    error: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mimeTypeRef = useRef<string>(getAudioMimeType());

  const clearRecordingData = useCallback(() => {
    // Clear audio chunks
    audioChunksRef.current = [];
    
    // Stop duration timer if it's running
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    
    // Stop and release media stream if it exists
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Clear recorder
    mediaRecorderRef.current = null;
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, error: null }));

      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Get the MIME type for this recording
      mimeTypeRef.current = getAudioMimeType();
      
      // Create media recorder with appropriate MIME type
      let mediaRecorder;
      try {
        // Try with the detected MIME type
        mediaRecorder = new MediaRecorder(stream, { mimeType: mimeTypeRef.current });
      } catch (e) {
        // If that fails, fall back to browser default
        console.warn(`MediaRecorder doesn't support ${mimeTypeRef.current}, using default`);
        mediaRecorder = new MediaRecorder(stream);
        // Still track what MIME type we're using
        mimeTypeRef.current = mediaRecorder.mimeType || 'audio/webm';
      }
      
      mediaRecorderRef.current = mediaRecorder;
      
      // Set up data handler
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Handle recording stop
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeTypeRef.current });
        setState(prev => ({ 
          ...prev, 
          isRecording: false, 
          isPaused: false,
          audioBlob,
          audioMimeType: mimeTypeRef.current
        }));
      };

      // Start recording
      mediaRecorder.start(100); // Collect data every 100ms
      startTimeRef.current = Date.now();
      
      // Start duration timer
      durationIntervalRef.current = setInterval(() => {
        const currentDuration = (Date.now() - startTimeRef.current) / 1000;
        setState(prev => ({ ...prev, duration: currentDuration }));
      }, 100);

      setState(prev => ({ 
        ...prev, 
        isRecording: true, 
        audioBlob: null,
        audioMimeType: mimeTypeRef.current
      }));
    } catch (error) {
      console.error('Error starting recording:', error);
      setState(prev => ({ 
        ...prev, 
        error: error instanceof Error ? error.message : 'Failed to start recording'
      }));
      clearRecordingData();
    }
  }, [clearRecordingData]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording) {
      mediaRecorderRef.current.stop();
      
      // Stop duration timer
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      
      // Stop and release media stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    }
  }, [state.isRecording]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording && !state.isPaused) {
      mediaRecorderRef.current.pause();
      
      // Pause duration timer
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      
      setState(prev => ({ ...prev, isPaused: true }));
    }
  }, [state.isRecording, state.isPaused]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorderRef.current && state.isRecording && state.isPaused) {
      mediaRecorderRef.current.resume();
      
      // Resume duration timer
      if (!durationIntervalRef.current) {
        durationIntervalRef.current = setInterval(() => {
          const currentDuration = (Date.now() - startTimeRef.current) / 1000;
          setState(prev => ({ ...prev, duration: currentDuration }));
        }, 100);
      }
      
      setState(prev => ({ ...prev, isPaused: false }));
    }
  }, [state.isRecording, state.isPaused]);

  const clearRecording = useCallback(() => {
    clearRecordingData();
    setState({
      isRecording: false,
      isPaused: false,
      duration: 0,
      audioBlob: null,
      audioMimeType: getAudioMimeType(),
      error: null,
    });
  }, [clearRecordingData]);

  return {
    ...state,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    clearRecording,
  };
} 