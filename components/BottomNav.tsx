import React from 'react';
import { Home, ClipboardList, CalendarHeart, MessageCircle, User, Calendar, BookText, Store, UserRound, LayoutDashboard } from 'lucide-react';
import { motion } from 'motion/react';

interface BottomNavProps {
  currentView: string;
  onNavigate: (tab: string) => void;
  isVendorView?: boolean;
  onToggleVendor?: () => void;
  showVendorToggle?: boolean;
}

const BottomNav: React.FC<BottomNavProps> = ({ currentView, onNavigate, isVendorView, onToggleVendor, showVendorToggle }) => {
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

  return (
    <div className="fixed bottom-5 left-4 right-4 max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl mx-auto z-50 transition-all duration-300">

      {/* Main Nav */}
      <nav aria-label="Bottom Navigation" className="rounded-[28px] bg-gradient-to-b from-zinc-900/95 via-black/95 to-black/98 backdrop-blur-2xl border border-white/20 shadow-[0_10px_30px_rgba(0,0,0,0.9),0_0_20px_rgba(212,175,55,0.12)] pb-safe overflow-hidden">
        {/* Liquid glass top rim specular reflection */}
        <div className="absolute top-0 inset-x-6 h-[1.5px] bg-gradient-to-r from-transparent via-white/50 to-transparent pointer-events-none" />
        {/* Glass sheen overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/10 via-transparent to-black/40 rounded-[28px] pointer-events-none" />

        <div className="flex justify-around items-center h-[60px] px-2 relative z-10">
          {tabs.map((tab) => {
            const isActive = currentView === tab.id;
            const Icon = tab.icon;

            return (
              <motion.button
                key={tab.id}
                onClick={() => onNavigate(tab.id)}
                whileTap={{ scale: 0.93 }}
                transition={{ duration: 0.2 }}
                className="relative outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] rounded-full p-0.5"
                aria-label={tab.label}
                aria-current={isActive ? 'page' : undefined}
              >
                {isActive ? (
                  /* 3D Molten Gold Active Capsule - Hugging gold outline */
                  <div className="relative flex flex-col items-center justify-center w-[62px] sm:w-[68px] h-[48px] rounded-[18px] bg-gradient-to-br from-[#FFE885] via-[#D4AF37] to-[#7B5800] border border-[#FFF8D1] shadow-[0_4px_16px_rgba(212,175,55,0.5),inset_0_1.5px_3px_rgba(255,255,255,0.95)] transition-all duration-300">
                    {/* Top curved specular gloss arc */}
                    <div className="absolute top-0.5 inset-x-2 h-2.5 rounded-t-[14px] bg-gradient-to-b from-white/90 via-white/40 to-transparent pointer-events-none" />
                    
                    <Icon 
                      className="w-4 h-4 text-zinc-950 fill-zinc-950 mb-0.5 filter drop-shadow-[0_1px_1px_rgba(255,255,255,0.4)] relative z-10" 
                      aria-hidden="true" 
                    />
                    <span className="text-[9.5px] font-black text-zinc-950 tracking-tight leading-none mt-0.5 relative z-10">
                      {tab.label}
                    </span>
                  </div>
                ) : (
                  /* Inactive Clean Tab */
                  <div className="flex flex-col items-center justify-center p-1.5 min-w-[48px] text-zinc-400 hover:text-white transition-colors">
                    <Icon 
                      className="w-5 h-5 mb-1 text-zinc-300 stroke-[1.75]" 
                      aria-hidden="true" 
                      fill="none" 
                    />
                    <span className="text-[9.5px] font-medium text-zinc-400 tracking-tight mt-0.5">
                      {tab.label}
                    </span>
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default BottomNav;
