import React from 'react';

interface CustomAudioPlayerProps {
  src: string;
  theme: 'sent' | 'received';
}

export const CustomAudioPlayer: React.FC<CustomAudioPlayerProps> = ({ src, theme }) => {
  const isSent = theme === 'sent';

  return (
    <div 
      className={`flex flex-col gap-1.5 p-3 rounded-xl border max-w-[280px] sm:max-w-[320px] transition-all duration-300 ${
        isSent 
          ? 'bg-black/20 border-black/30' 
          : 'bg-zinc-950 border-[#D4AF37]/20 shadow-[0_0_15px_rgba(212,175,55,0.05)]'
      }`}
    >
      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.15em] mb-1">
        <span className={isSent ? 'text-black/60' : 'text-[#D4AF37]'}>Voice Note</span>
        <span className={isSent ? 'text-black/40' : 'text-zinc-500 font-mono'}>Play online</span>
      </div>
      <audio
        src={src}
        controls
        preload="metadata"
        className="w-full h-9 accent-[#D4AF37] outline-none"
        style={{
          borderRadius: '8px',
          filter: isSent 
            ? 'invert(1) hue-rotate(180deg) brightness(0.7) sepia(1) saturate(3) hue-rotate(-20deg)' 
            : 'invert(0.9) sepia(1) saturate(5) hue-rotate(5deg) brightness(0.95)'
        }}
      />
    </div>
  );
};
