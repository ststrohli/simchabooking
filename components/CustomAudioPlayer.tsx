import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Play, Pause, Mic, AlertCircle } from 'lucide-react';

interface CustomAudioPlayerProps {
  src: string;
  theme?: 'sent' | 'received';
  duration?: number;
  avatarUrl?: string;
}

export const CustomAudioPlayer: React.FC<CustomAudioPlayerProps> = ({ 
  src, 
  theme = 'received', 
  duration: initialDuration,
  avatarUrl 
}) => {
  const isSent = theme === 'sent';
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(initialDuration || 0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [hasPlayedOnce, setHasPlayedOnce] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Generate a deterministic, realistic WhatsApp-style voice speech waveform (32 bars)
  const waveformBars = useMemo(() => {
    // Hash the src string to get consistent distinct bar heights per voice note
    let hash = 0;
    for (let i = 0; i < src.length; i++) {
      hash = (hash << 5) - hash + src.charCodeAt(i);
      hash |= 0;
    }
    const seed = Math.abs(hash);

    const barCount = 32;
    const bars: number[] = [];
    for (let i = 0; i < barCount; i++) {
      // Natural speech envelope: lower at start and end, dynamic in the middle
      const pos = i / barCount;
      const envelope = Math.sin(pos * Math.PI);
      const pseudoRandom = Math.abs(Math.sin(seed * (i + 1) * 9301 + 49297)) % 1;
      const height = Math.max(4, Math.round((envelope * 16) + (pseudoRandom * 12)));
      bars.push(Math.min(24, height));
    }
    return bars;
  }, [src]);

  // Audio setup and event listeners
  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;
    audio.preload = 'metadata';

    const handleLoadedMetadata = () => {
      if (!isNaN(audio.duration) && isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      } else if (initialDuration && initialDuration > 0) {
        setDuration(initialDuration);
      }
      setIsLoaded(true);
      setHasError(false);
    };

    const handleTimeUpdate = () => {
      if (!isScrubbing) {
        setCurrentTime(audio.currentTime);
        if ((!duration || !isFinite(duration)) && isFinite(audio.duration) && audio.duration > 0) {
          setDuration(audio.duration);
        }
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      setHasPlayedOnce(true);
    };

    const handleError = () => {
      setHasError(true);
      setIsPlaying(false);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.src = '';
    };
  }, [src, isScrubbing, initialDuration]);

  useEffect(() => {
    if (initialDuration && initialDuration > 0 && (!duration || !isFinite(duration))) {
      setDuration(initialDuration);
    }
  }, [initialDuration]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      setHasPlayedOnce(true);
      audio.playbackRate = playbackRate;
      audio.play()
        .then(() => setIsPlaying(true))
        .catch((err) => {
          console.warn("Audio playback interrupted or blocked:", err);
          setIsPlaying(false);
        });
    }
  }, [isPlaying, playbackRate]);

  const cyclePlaybackRate = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextRate = playbackRate === 1 ? 1.5 : playbackRate === 1.5 ? 2 : 1;
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!waveformRef.current || !duration) return;
    const rect = waveformRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clickX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const percent = clickX / rect.width;
    const newTime = percent * duration;
    
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const activeBarIndex = Math.floor((progressPercent / 100) * waveformBars.length);

  return (
    <div className="flex items-center gap-2.5 py-1 px-0.5 select-none w-full max-w-[270px] sm:max-w-[310px]">
      {/* WhatsApp Voice Note Avatar with small mic badge */}
      <div className="relative shrink-0">
        <div className="w-10 h-10 rounded-full overflow-hidden bg-zinc-900 border border-[#D4AF37]/30 flex items-center justify-center">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <Mic className={`w-5 h-5 ${isSent ? 'text-[#D4AF37]' : 'text-zinc-400'}`} />
          )}
        </div>
        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#111] border border-[#D4AF37]/50 flex items-center justify-center shadow">
          <Mic className={`w-2.5 h-2.5 ${hasPlayedOnce ? 'text-[#D4AF37]' : 'text-zinc-400'}`} />
        </div>
      </div>

      {/* Play / Pause Circular Button */}
      <button
        type="button"
        onClick={togglePlay}
        disabled={hasError}
        aria-label={isPlaying ? "Pause voice note" : "Play voice note"}
        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all shadow-md active:scale-95 ${
          hasError
            ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            : 'bg-[#D4AF37] text-black hover:bg-[#e6c148] hover:scale-105'
        }`}
      >
        {hasError ? (
          <AlertCircle className="w-4 h-4 text-red-500" />
        ) : isPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" />
        )}
      </button>

      {/* Waveform + Progress Bar + Timers */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        {/* Interactive Scrubbable Waveform */}
        <div
          ref={waveformRef}
          onClick={handleSeek}
          onMouseDown={() => setIsScrubbing(true)}
          onMouseUp={() => setIsScrubbing(false)}
          className="h-7 flex items-center gap-[2.5px] cursor-pointer py-1 relative group"
          title="Click to seek"
          role="slider"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={currentTime}
        >
          {waveformBars.map((height, idx) => {
            const isPlayed = idx <= activeBarIndex;
            return (
              <div
                key={idx}
                className="flex-1 rounded-full transition-colors duration-150"
                style={{
                  height: `${height}px`,
                  backgroundColor: isPlayed 
                    ? '#D4AF37' 
                    : isSent 
                      ? 'rgba(212, 175, 55, 0.25)' 
                      : 'rgba(255, 255, 255, 0.25)',
                }}
              />
            );
          })}
        </div>

        {/* Timers & Speed Controller Row */}
        <div className="flex items-center justify-between text-[11px] font-mono leading-none mt-0.5 text-zinc-400">
          <span className={isPlaying ? 'text-[#D4AF37] font-semibold' : 'text-zinc-400'}>
            {isPlaying ? formatTime(currentTime) : formatTime(duration || currentTime)}
          </span>

          <div className="flex items-center gap-1.5">
            {/* WhatsApp Speed Toggle Pill */}
            {hasPlayedOnce && (
              <button
                type="button"
                onClick={cyclePlaybackRate}
                className="text-[10px] font-sans font-bold px-1.5 py-0.5 rounded-full bg-white/10 hover:bg-[#D4AF37]/20 hover:text-[#D4AF37] text-zinc-300 transition-colors leading-none"
                title="Change playback speed"
              >
                {playbackRate}x
              </button>
            )}
            <Mic className={`w-3 h-3 ${hasPlayedOnce ? 'text-[#D4AF37]' : 'text-zinc-500'}`} />
          </div>
        </div>
      </div>
    </div>
  );
};
