import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Play, Pause, Mic, AlertCircle, User, Check, CheckCheck, Clock, Trash2 } from 'lucide-react';

interface CustomAudioPlayerProps {
  src: string;
  theme?: 'sent' | 'received';
  duration?: number;
  avatarUrl?: string;
  timestampFormatted?: string;
  status?: 'sending' | 'sent' | 'error';
  isRead?: boolean;
  showSeenLabel?: boolean;
  onDelete?: () => void;
}

export const CustomAudioPlayer: React.FC<CustomAudioPlayerProps> = ({ 
  src, 
  theme = 'received', 
  duration: initialDuration,
  avatarUrl,
  timestampFormatted,
  status,
  isRead,
  showSeenLabel,
  onDelete
}) => {
  const isSent = theme === 'sent';
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const waveformRef = useRef<HTMLDivElement | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState<number>(initialDuration || 0);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [hasError, setHasError] = useState(false);
  const [hasPlayedOnce, setHasPlayedOnce] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Generate a deterministic, realistic WhatsApp-style 40-bar voice waveform
  const waveformBars = useMemo(() => {
    let hash = 0;
    const seedStr = src || 'whatsapp_voice_default';
    for (let i = 0; i < seedStr.length; i++) {
      hash = (hash << 5) - hash + seedStr.charCodeAt(i);
      hash |= 0;
    }
    const seed = Math.abs(hash);

    const barCount = 40;
    const bars: number[] = [];
    for (let i = 0; i < barCount; i++) {
      const pos = i / barCount;
      // Natural voice burst clusters like real WhatsApp voice notes
      const burst = Math.sin(pos * Math.PI) * (0.65 + 0.35 * Math.cos(pos * Math.PI * 6));
      const pseudoRandom = Math.abs(Math.sin(seed * (i + 1) * 9301 + 49297)) % 1;
      const height = Math.max(3, Math.round((burst * 13) + (pseudoRandom * 10)));
      bars.push(Math.min(22, height));
    }
    return bars;
  }, [src]);

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
  }, [initialDuration, duration]);

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

  const seekFromClientX = useCallback((clientX: number) => {
    if (!waveformRef.current) return;
    const effectiveDuration = duration > 0 ? duration : (initialDuration || 1);
    const rect = waveformRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(rect.width, clientX - rect.left));
    const percent = rect.width > 0 ? clickX / rect.width : 0;
    const newTime = percent * effectiveDuration;
    
    setCurrentTime(newTime);
    if (audioRef.current && isFinite(audioRef.current.duration) && audioRef.current.duration > 0) {
      audioRef.current.currentTime = percent * audioRef.current.duration;
    }
  }, [duration, initialDuration]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setIsScrubbing(true);
    seekFromClientX(e.clientX);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbing) return;
    e.stopPropagation();
    seekFromClientX(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isScrubbing) return;
    e.stopPropagation();
    setIsScrubbing(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || !isFinite(secs) || secs < 0) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const effectiveDuration = duration > 0 ? duration : (initialDuration || 0);
  const progressPercent = effectiveDuration > 0 ? Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100)) : 0;
  const activeBarIndex = Math.floor((progressPercent / 100) * waveformBars.length);

  // WhatsApp Avatar + Mic Badge (or Speed Pill when playing)
  const renderAvatarOrSpeed = () => (
    <div className="relative shrink-0 flex items-center justify-center">
      {isPlaying ? (
        <button
          type="button"
          onClick={cyclePlaybackRate}
          className="w-11 h-7 rounded-full bg-black/45 border border-[#D4AF37]/40 text-zinc-100 hover:border-[#D4AF37] text-[11px] font-bold tracking-tight flex items-center justify-center transition-all active:scale-95 cursor-pointer shadow-inner"
          title="Change playback speed"
        >
          {playbackRate}x
        </button>
      ) : (
        <div
          onClick={hasPlayedOnce ? cyclePlaybackRate : undefined}
          className={`relative w-10 h-10 sm:w-11 sm:h-11 ${hasPlayedOnce ? 'cursor-pointer' : ''}`}
          title={hasPlayedOnce ? `Tap to change speed (${playbackRate}x)` : undefined}
        >
          <div className="w-full h-full rounded-full overflow-hidden bg-[#24282c] border border-white/15 flex items-center justify-center shadow-sm">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <User className="w-5 h-5 text-zinc-400 fill-zinc-400/30" />
            )}
          </div>
          {/* WhatsApp overlapping microphone badge on bottom corner of avatar */}
          <div
            className={`absolute -bottom-0.5 ${
              isSent ? '-left-1' : '-right-1'
            } w-[18px] h-[18px] rounded-full bg-[#18181c] flex items-center justify-center shadow-md`}
          >
            <Mic
              className={`w-3 h-3 ${
                !hasPlayedOnce && !isRead
                  ? 'text-[#D4AF37] fill-[#D4AF37]/20'
                  : hasPlayedOnce
                  ? 'text-[#34B7F1]'
                  : 'text-zinc-400'
              }`}
            />
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex items-center gap-2.5 pt-1 pb-0.5 px-1 select-none w-[248px] sm:w-[295px] group/vn">
      {/* On received voice notes, WhatsApp places the avatar on the left; on sent, on the right (or left). Placing avatar on left for received and right for sent matches authentic WhatsApp */}
      {!isSent && renderAvatarOrSpeed()}

      {/* Frameless WhatsApp Play / Pause Button */}
      <button
        type="button"
        onClick={togglePlay}
        disabled={hasError}
        aria-label={isPlaying ? "Pause voice note" : "Play voice note"}
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-90 cursor-pointer ${
          hasError
            ? 'text-red-400 cursor-not-allowed'
            : 'text-zinc-200 hover:text-[#D4AF37]'
        }`}
      >
        {hasError ? (
          <AlertCircle className="w-5 h-5 text-red-500" />
        ) : isPlaying ? (
          <Pause className="w-6 h-6 fill-current stroke-[1.5]" />
        ) : (
          <Play className="w-6 h-6 fill-current ml-0.5 stroke-[1.5]" />
        )}
      </button>

      {/* Center Column: Waveform with Scrubber Dot + Bottom Metadata Row */}
      <div className="flex-1 min-w-0 flex flex-col justify-center pt-1.5">
        {/* Interactive Scrubbable Waveform with WhatsApp Scrubber Knob */}
        <div
          ref={waveformRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="h-6 flex items-center gap-[2px] cursor-pointer relative touch-none select-none"
          title="Drag or click to seek"
          role="slider"
          aria-valuemin={0}
          aria-valuemax={effectiveDuration}
          aria-valuenow={currentTime}
        >
          {waveformBars.map((height, idx) => {
            const isPlayed = (isPlaying || currentTime > 0) && idx <= activeBarIndex;
            return (
              <div
                key={idx}
                className="flex-1 rounded-full transition-colors duration-75"
                style={{
                  height: `${height}px`,
                  minWidth: '2px',
                  backgroundColor: isPlayed
                    ? '#D4AF37'
                    : isSent
                    ? 'rgba(228, 228, 231, 0.32)'
                    : 'rgba(161, 161, 170, 0.38)',
                }}
              />
            );
          })}

          {/* Authentic WhatsApp Circular Scrubber Thumb Dot */}
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.65)] pointer-events-none transition-[left] duration-75"
            style={{
              left: `${progressPercent}%`,
              backgroundColor: isPlaying || hasPlayedOnce ? '#D4AF37' : '#e4e4e7',
            }}
          />
        </div>

        {/* WhatsApp Single Footer Row: Duration on Left, Time + Read Ticks on Right */}
        <div className="flex items-center justify-between text-[10.5px] leading-none mt-1 text-zinc-400 font-sans">
          <div className="flex items-center gap-1.5">
            <span className="tabular-nums text-zinc-300/90">
              {isPlaying || currentTime > 0 ? formatTime(currentTime) : formatTime(effectiveDuration)}
            </span>
            {!isPlaying && playbackRate !== 1 && (
              <button
                type="button"
                onClick={cyclePlaybackRate}
                className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-[#D4AF37] leading-none"
              >
                {playbackRate}x
              </button>
            )}
          </div>

          <div className="flex items-center gap-1">
            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="opacity-0 group-hover/vn:opacity-100 transition-opacity text-zinc-500 hover:text-red-400 p-0.5 rounded"
                title="Delete voice note"
                aria-label="Delete voice note"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
            {timestampFormatted && (
              <span className="text-[10.5px] text-zinc-400 tabular-nums">
                {timestampFormatted}
              </span>
            )}
            {isSent && (
              status === 'sending' ? (
                <Clock className="w-3 h-3 text-zinc-500 animate-pulse ml-0.5" />
              ) : status === 'error' ? (
                <AlertCircle className="w-3.5 h-3.5 text-red-500 ml-0.5" />
              ) : isRead ? (
                <span title="Seen" className="inline-flex items-center gap-0.5 text-[#34B7F1] ml-0.5">
                  <CheckCheck className="w-3.5 h-3.5 text-[#34B7F1] shrink-0" />
                  {showSeenLabel && (
                    <span className="text-[9.5px] font-medium text-[#34B7F1]/90 leading-none">Seen</span>
                  )}
                </span>
              ) : (
                <span title="Sent" className="inline-flex items-center text-zinc-400 ml-0.5">
                  <Check className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                </span>
              )
            )}
          </div>
        </div>
      </div>

      {/* On sent voice notes, WhatsApp places the sender's avatar on the right */}
      {isSent && renderAvatarOrSpeed()}
    </div>
  );
};
