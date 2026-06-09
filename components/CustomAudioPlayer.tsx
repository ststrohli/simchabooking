import React, { useRef, useState, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';

interface CustomAudioPlayerProps {
  src: string;
  theme: 'sent' | 'received';
}

export const CustomAudioPlayer: React.FC<CustomAudioPlayerProps> = ({ src, theme }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState('0:00');
  const [duration, setDuration] = useState('0:00');

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(err => console.error("Audio playback error:", err));
    }
  };

  useEffect(() => {
    // Reset player if source changes
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
    setProgress(0);
    setCurrentTime('0:00');
    setDuration('0:00');
  }, [src]);

  const formatTime = (secs: number) => {
    if (isNaN(secs) || !isFinite(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const current = audioRef.current.currentTime;
    const dur = audioRef.current.duration || 0;
    setCurrentTime(formatTime(current));
    if (dur > 0) {
      setProgress((current / dur) * 100);
    }
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    setDuration(formatTime(audioRef.current.duration));
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setProgress(0);
    setCurrentTime('0:00');
  };

  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !audioRef.current.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const width = rect.width;
    const newTime = (clickX / width) * audioRef.current.duration;
    audioRef.current.currentTime = newTime;
  };

  // Theme specific styles
  const playButtonBg = theme === 'sent' 
    ? 'bg-black/10 hover:bg-black/20 text-black' 
    : 'bg-[#D4AF37]/10 hover:bg-[#D4AF37]/20 text-[#D4AF37]';
  
  const progressBg = theme === 'sent' 
    ? 'bg-black/15' 
    : 'bg-zinc-800';
     
  const progressBarBg = theme === 'sent' 
    ? 'bg-black' 
    : 'bg-[#D4AF37]';

  const textColorStatus = theme === 'sent'
    ? 'text-black/60'
    : 'text-zinc-400';

  return (
    <div className="flex items-center gap-3 py-1.5 min-w-[180px] sm:min-w-[220px] select-none">
      <audio
        ref={audioRef}
        src={src}
        onPlay={handlePlay}
        onPause={handlePause}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        className="hidden"
        preload="metadata"
      />

      <button
        type="button"
        onClick={togglePlay}
        className={`w-9 h-9 rounded-full flex items-center justify-center transition-all flex-shrink-0 cursor-pointer ${playButtonBg}`}
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <Pause className="w-3.5 h-3.5 fill-current" />
        ) : (
          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
        )}
      </button>

      <div className="flex-1 space-y-1">
        {/* Progress Line */}
        <div 
          onClick={handleProgressBarClick}
          className={`h-1.5 rounded-full w-full cursor-pointer relative overflow-hidden ${progressBg}`}
        >
          <div 
            style={{ width: `${progress}%` }} 
            className={`h-full rounded-full transition-all duration-75 ${progressBarBg}`}
          />
        </div>
        
        <div className="flex justify-between items-center text-[9px] font-mono leading-none">
          <span className={textColorStatus}>{currentTime}</span>
          <span className={textColorStatus}>{duration}</span>
        </div>
      </div>
    </div>
  );
};
