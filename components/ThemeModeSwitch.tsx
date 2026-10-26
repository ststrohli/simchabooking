import React, { useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { motion, useMotionValue, animate } from 'motion/react';
import { Sun, Moon } from 'lucide-react';

interface ThemeModeSwitchProps {
  themeMode: 'dark' | 'light';
  onToggleThemeMode: (mode: 'dark' | 'light') => void;
  fullWidth?: boolean;
}

export const ThemeModeSwitch: React.FC<ThemeModeSwitchProps> = React.memo(({
  themeMode,
  onToggleThemeMode,
  fullWidth = false,
}) => {
  const isDark = themeMode === 'dark';
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lightBtnRef = useRef<HTMLButtonElement | null>(null);
  const darkBtnRef = useRef<HTMLButtonElement | null>(null);
  const lastDarkRef = useRef(isDark);
  const isAnimatingRef = useRef(false);
  const activeControlsRef = useRef<Array<{ stop: () => void }>>([]);

  const pillX = useMotionValue(0);
  const pillRotate = useMotionValue(0);
  const pillScaleX = useMotionValue(1);

  const getDarkOffsetX = useCallback(() => {
    if (darkBtnRef.current && lightBtnRef.current) {
      const offset = darkBtnRef.current.offsetLeft - lightBtnRef.current.offsetLeft;
      if (offset > 0) return offset;
    }
    return fullWidth ? 114 : 61;
  }, [fullWidth]);

  const runSlideWiggle = useCallback((targetDark: boolean) => {
    activeControlsRef.current.forEach(ctrl => ctrl.stop());

    const targetX = targetDark ? getDarkOffsetX() : 0;
    const currentX = pillX.get();
    const delta = targetX - currentX;

    if (Math.abs(delta) < 1) {
      pillX.set(targetX);
      pillRotate.set(0);
      pillScaleX.set(1);
      isAnimatingRef.current = false;
      return;
    }

    const dir = delta > 0 ? 1 : -1;
    isAnimatingRef.current = true;

    activeControlsRef.current = [
      animate(
        pillX,
        [
          currentX,
          targetX + dir * 6.5,
          targetX - dir * 6,
          targetX + dir * 4.5,
          targetX - dir * 3.2,
          targetX + dir * 1.8,
          targetX - dir * 0.9,
          targetX,
        ],
        {
          duration: 1.25,
          times: [0, 0.36, 0.51, 0.65, 0.77, 0.87, 0.94, 1],
          ease: 'easeInOut',
          onComplete: () => {
            isAnimatingRef.current = false;
          },
        }
      ),
      animate(
        pillRotate,
        [
          0,
          dir * 4.2,
          -dir * 4.2,
          dir * 3.2,
          -dir * 2.4,
          dir * 1.4,
          -dir * 0.7,
          0,
        ],
        {
          duration: 1.25,
          times: [0, 0.36, 0.51, 0.65, 0.77, 0.87, 0.94, 1],
          ease: 'easeInOut',
        }
      ),
      animate(
        pillScaleX,
        [1, 1.06, 0.94, 1.04, 0.96, 1.02, 0.99, 1],
        {
          duration: 1.25,
          times: [0, 0.36, 0.51, 0.65, 0.77, 0.87, 0.94, 1],
          ease: 'easeInOut',
        }
      ),
    ];
  }, [getDarkOffsetX, pillX, pillRotate, pillScaleX]);

  const hasMountedRef = useRef(false);

  useLayoutEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      lastDarkRef.current = isDark;
      pillX.set(isDark ? getDarkOffsetX() : 0);
      return;
    }
    if (lastDarkRef.current !== isDark) {
      lastDarkRef.current = isDark;
      runSlideWiggle(isDark);
    }
  }, [isDark, getDarkOffsetX, pillX, runSlideWiggle]);

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (!isAnimatingRef.current) {
        pillX.set(lastDarkRef.current ? getDarkOffsetX() : 0);
      }
    });
    observer.observe(containerRef.current);
    if (lightBtnRef.current) observer.observe(lightBtnRef.current);
    if (darkBtnRef.current) observer.observe(darkBtnRef.current);
    return () => observer.disconnect();
  }, [getDarkOffsetX, pillX]);

  useEffect(() => {
    return () => {
      activeControlsRef.current.forEach(ctrl => ctrl.stop());
    };
  }, []);

  const handleSelectMode = useCallback((mode: 'light' | 'dark') => {
    const targetDark = mode === 'dark';
    if (lastDarkRef.current === targetDark) return;
    lastDarkRef.current = targetDark;
    runSlideWiggle(targetDark);
    onToggleThemeMode(mode);
  }, [onToggleThemeMode, runSlideWiggle]);

  if (fullWidth) {
    return (
      <div
        ref={containerRef}
        role="group"
        aria-label="Theme Mode Switcher"
        className="simcha-switch-track relative flex items-center justify-center w-full gap-1 h-9 bg-black border border-[#D4AF37]/35 rounded-full p-1 shadow-md text-[10px] tracking-wider uppercase font-extrabold leading-none mx-auto"
      >
        <motion.div
          style={{
            x: pillX,
            rotate: pillRotate,
            scaleX: pillScaleX,
          }}
          className="simcha-gold-pill absolute left-1 top-1 bottom-1 w-[calc(50%-6px)] rounded-full bg-gradient-to-r from-[#FFE885] via-[#D4AF37] to-[#A37B0D] border border-[#FFF8D1] shadow-[0_2px_10px_rgba(212,175,55,0.55),inset_0_1px_2px_rgba(255,255,255,0.85)] pointer-events-none z-0 transform-gpu will-change-transform"
        />

        <button
          ref={lightBtnRef}
          type="button"
          onClick={() => handleSelectMode('light')}
          aria-pressed={!isDark}
          aria-label="Switch to Light"
          className={`relative z-10 flex-1 h-full inline-flex items-center justify-center gap-1.5 rounded-full transition-colors duration-300 select-none leading-none ${
            !isDark
              ? 'simcha-switch-btn-active text-black font-black'
              : 'simcha-switch-btn-inactive text-zinc-300 hover:text-white cursor-pointer'
          }`}
        >
          <Sun className="w-3 h-3 shrink-0 stroke-[2.5]" />
          <span className="leading-none">Light</span>
        </button>

        <button
          ref={darkBtnRef}
          type="button"
          onClick={() => handleSelectMode('dark')}
          aria-pressed={isDark}
          aria-label="Switch to Dark"
          className={`relative z-10 flex-1 h-full inline-flex items-center justify-center gap-1.5 rounded-full transition-colors duration-300 select-none leading-none ${
            isDark
              ? 'simcha-switch-btn-active text-black font-black'
              : 'simcha-switch-btn-inactive text-zinc-300 hover:text-white cursor-pointer'
          }`}
        >
          <Moon className="w-3 h-3 shrink-0 stroke-[2.5]" />
          <span className="leading-none">Dark</span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label="Theme Mode Switcher"
      className="simcha-switch-track relative inline-flex items-center justify-center gap-[3px] h-[30px] sm:h-[32px] bg-zinc-950/95 border border-[#D4AF37]/45 backdrop-blur-xl rounded-full p-[3px] shadow-[0_6px_16px_rgba(0,0,0,0.45),0_0_10px_rgba(212,175,55,0.2)] text-[9.5px] sm:text-[10px] tracking-normal uppercase font-extrabold leading-none mx-auto"
    >
      <motion.div
        style={{
          x: pillX,
          rotate: pillRotate,
          scaleX: pillScaleX,
        }}
        className="simcha-gold-pill absolute left-[3px] top-[3px] bottom-[3px] w-[58px] sm:w-[62px] rounded-full bg-gradient-to-r from-[#FFE885] via-[#D4AF37] to-[#A37B0D] border border-[#FFF8D1] shadow-[0_2px_10px_rgba(212,175,55,0.6),inset_0_1px_2px_rgba(255,255,255,0.85)] pointer-events-none z-0 transform-gpu will-change-transform"
      />

      <button
        ref={lightBtnRef}
        type="button"
        onClick={() => handleSelectMode('light')}
        aria-pressed={!isDark}
        aria-label="Switch to Light"
        className={`relative z-10 h-full w-[58px] sm:w-[62px] inline-flex items-center justify-center gap-1 rounded-full transition-colors duration-300 select-none leading-none ${
          !isDark
            ? 'simcha-switch-btn-active text-black font-black'
            : 'simcha-switch-btn-inactive text-zinc-300 hover:text-white cursor-pointer'
        }`}
      >
        <Sun className="w-2.5 h-2.5 shrink-0 stroke-[2.5]" />
        <span className="leading-none">Light</span>
      </button>

      <button
        ref={darkBtnRef}
        type="button"
        onClick={() => handleSelectMode('dark')}
        aria-pressed={isDark}
        aria-label="Switch to Dark"
        className={`relative z-10 h-full w-[58px] sm:w-[62px] inline-flex items-center justify-center gap-1 rounded-full transition-colors duration-300 select-none leading-none ${
          isDark
            ? 'simcha-switch-btn-active text-black font-black'
            : 'simcha-switch-btn-inactive text-zinc-300 hover:text-white cursor-pointer'
        }`}
      >
        <Moon className="w-2.5 h-2.5 shrink-0 stroke-[2.5]" />
        <span className="leading-none">Dark</span>
      </button>
    </div>
  );
});
