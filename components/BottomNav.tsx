import React, { useRef, useLayoutEffect, useEffect } from 'react';
import { Home, ClipboardList, CalendarHeart, MessageCircle, User, Calendar, BookText, LayoutDashboard } from 'lucide-react';
import { motion, useMotionValue, animate } from 'motion/react';

interface BottomNavProps {
  currentView: string;
  onNavigate: (tab: string) => void;
  isVendorView?: boolean;
  onToggleVendor?: () => void;
  showVendorToggle?: boolean;
}

const BottomNav: React.FC<BottomNavProps> = ({ currentView, onNavigate, isVendorView }) => {
  const tabs = isVendorView ? [
    { id: 'home', label: 'Home', icon: LayoutDashboard },
    { id: 'bookings', label: 'Requests', icon: BookText },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'chat', label: 'Chats', icon: MessageCircle },
    { id: 'profile', label: 'Profile', icon: User },
  ] : [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'chat', label: 'Chats', icon: MessageCircle },
    { id: 'home', label: 'Home', icon: Home },
    { id: 'plan', label: 'Plan', icon: ClipboardList },
    { id: 'events', label: 'Events', icon: CalendarHeart },
  ];

  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const pillX = useMotionValue(0);
  const pillRotate = useMotionValue(0);
  const pillScaleX = useMotionValue(1);
  const hasInitializedRef = useRef(false);
  const prevViewRef = useRef(currentView);
  const prevVendorModeRef = useRef(isVendorView);
  const pillWidth = 68;

  const getTargetX = (tabId: string): number | null => {
    const container = containerRef.current;
    const btn = buttonRefs.current[tabId];
    if (!container || !btn) return null;
    const containerRect = container.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    return (btnRect.left - containerRect.left) + (btnRect.width / 2) - (pillWidth / 2);
  };

  useLayoutEffect(() => {
    const targetX = getTargetX(currentView);
    if (targetX === null) return;

    // On initial mount or when switching between client/vendor nav sets, position immediately
    if (!hasInitializedRef.current || prevVendorModeRef.current !== isVendorView) {
      hasInitializedRef.current = true;
      prevVendorModeRef.current = isVendorView;
      prevViewRef.current = currentView;
      pillX.set(targetX);
      pillRotate.set(0);
      pillScaleX.set(1);
      return;
    }

    if (prevViewRef.current === currentView) {
      pillX.set(targetX);
      return;
    }

    prevViewRef.current = currentView;
    const startX = pillX.get();
    const delta = targetX - startX;
    if (Math.abs(delta) < 1) {
      pillX.set(targetX);
      return;
    }

    const dir = delta >= 0 ? 1 : -1;
    // Slow, deliberate slide followed by a left-right wiggle before settling at targetX
    const xControls = animate(
      pillX,
      [
        startX,
        targetX + dir * 9,   // overshoot slightly in travel direction
        targetX - dir * 6.5, // wiggle back the opposite way
        targetX + dir * 3.5, // wiggle forward again
        targetX - dir * 1.5, // subtle counter-wiggle
        targetX,             // settle cleanly in place
      ],
      {
        duration: 1.25,
        times: [0, 0.56, 0.71, 0.83, 0.92, 1],
        ease: 'easeInOut',
      }
    );

    const rotateControls = animate(
      pillRotate,
      [
        0,
        dir * 2.5,
        -dir * 3.2,
        dir * 2.2,
        -dir * 1.1,
        0,
      ],
      {
        duration: 1.25,
        times: [0, 0.56, 0.71, 0.83, 0.92, 1],
        ease: 'easeInOut',
      }
    );

    const scaleControls = animate(
      pillScaleX,
      [1, 1.07, 0.96, 1.03, 0.99, 1],
      {
        duration: 1.25,
        times: [0, 0.45, 0.68, 0.82, 0.92, 1],
        ease: 'easeInOut',
      }
    );

    return () => {
      xControls.stop();
      rotateControls.stop();
      scaleControls.stop();
    };
  }, [currentView, isVendorView, pillX, pillRotate, pillScaleX]);

  useEffect(() => {
    const handleResize = () => {
      const targetX = getTargetX(currentView);
      if (targetX !== null) {
        pillX.set(targetX);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [currentView, pillX]);

  return (
    <nav aria-label="Bottom Navigation" className="fixed bottom-[9px] sm:bottom-5 left-2 right-2 sm:left-4 sm:right-4 max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl mx-auto z-50 transition-all duration-300">
      <div className="simcha-bottom-nav rounded-[32px] bg-gradient-to-b from-zinc-900/95 via-black/95 to-black/98 backdrop-blur-2xl border border-[#D4AF37]/35 shadow-[0_10px_30px_rgba(0,0,0,0.9),0_0_20px_rgba(212,175,55,0.12)] pb-[env(safe-area-inset-bottom)] sm:pb-0 overflow-hidden">
        <div ref={containerRef} className="flex justify-around items-center h-[60px] sm:h-[60px] px-2 relative z-10">
          {/* Sliding Gold Active Capsule */}
          <motion.div
            style={{
              x: pillX,
              rotate: pillRotate,
              scaleX: pillScaleX,
              width: pillWidth,
            }}
            className="simcha-gold-pill absolute left-0 top-[6px] h-[48px] rounded-[22px] bg-gradient-to-br from-[#FFE885] via-[#D4AF37] to-[#7B5800] border border-[#FFF8D1] shadow-[0_6px_20px_rgba(212,175,55,0.6),0_0_15px_rgba(255,232,133,0.4),inset_0_2px_3px_rgba(255,255,255,0.9),inset_0_-3px_6px_rgba(90,60,0,0.6)] pointer-events-none z-0 overflow-hidden transform-gpu"
          >
            {/* Rich 3D top glass reflection */}
            <div className="simcha-pill-gloss absolute inset-x-1 top-0.5 h-[42%] rounded-t-[18px] bg-gradient-to-b from-white/70 via-white/20 to-transparent pointer-events-none" />
            {/* Subtle bottom warm rim glow */}
            <div className="simcha-pill-gloss absolute inset-x-2 bottom-0.5 h-[20%] rounded-b-[18px] bg-gradient-to-t from-[#FFE885]/50 to-transparent pointer-events-none" />
          </motion.div>

          {tabs.map((tab) => {
            const isActive = currentView === tab.id;
            const Icon = tab.icon;

            return (
              <motion.button
                key={tab.id}
                ref={(el) => {
                  buttonRefs.current[tab.id] = el;
                }}
                onClick={() => onNavigate(tab.id)}
                whileTap={{ scale: 0.93 }}
                transition={{ duration: 0.2 }}
                className={`relative z-10 outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded-full w-[70px] sm:w-[68px] h-[48px] flex flex-col items-center justify-center cursor-pointer select-none ${
                  isActive ? 'simcha-nav-btn-active' : 'simcha-nav-btn-inactive'
                }`}
                aria-label={tab.label}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon 
                  className={
                    isActive
                      ? "simcha-nav-icon-active w-4 h-4 text-zinc-950 fill-zinc-950 mb-0.5 filter drop-shadow-[0_1px_1px_rgba(255,255,255,0.4)] transition-colors duration-500"
                      : "simcha-nav-icon-inactive w-5 h-5 mb-1 text-zinc-300 stroke-[1.75] transition-colors duration-500"
                  }
                  aria-hidden="true" 
                  fill={isActive ? "currentColor" : "none"}
                />
                <span 
                  className={
                    isActive
                      ? "simcha-nav-label-active text-[9.5px] font-black text-zinc-950 tracking-tight leading-none mt-0.5 transition-colors duration-500"
                      : "simcha-nav-label-inactive text-[9.5px] font-medium text-zinc-400 tracking-tight mt-0.5 transition-colors duration-500"
                  }
                >
                  {tab.label}
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default BottomNav;
