import React, { useState, useRef, useCallback } from 'react';
import { useMotionValue, animate } from 'motion/react';

export function useModalDragDismiss(onClose: () => void, enabled = true) {
  const y = useMotionValue(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ y: number; time: number; pointerId: number } | null>(null);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!enabled || e.button !== 0) return;
    
    // Prevent dragging when clicking buttons, inputs, links, or controls
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea, [role="button"]:not([data-drag-handle])')) {
      return;
    }

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // Non-fatal if element cannot capture pointer
    }

    dragStartRef.current = { y: e.clientY, time: Date.now(), pointerId: e.pointerId };
    setIsDragging(true);
  }, [enabled]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    const deltaY = e.clientY - dragStartRef.current.y;
    if (deltaY > 0) {
      y.set(deltaY);
    } else {
      // Rubber band upward resistance
      y.set(deltaY * 0.12);
    }
  }, [y]);

  const handlePointerEnd = useCallback((e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Non-fatal
    }

    const deltaY = e.clientY - dragStartRef.current.y;
    const duration = Math.max(Date.now() - dragStartRef.current.time, 1);
    const velocity = deltaY / duration; // px per ms
    dragStartRef.current = null;
    setIsDragging(false);

    // Sensible distance threshold: 110px, or velocity threshold: 0.4 px/ms (400px/s)
    if (deltaY > 110 || velocity > 0.4) {
      // Subtle dismissal animation downwards
      const exitTarget = typeof window !== 'undefined' ? window.innerHeight : 900;
      animate(y, exitTarget, {
        duration: 0.22,
        ease: [0.16, 1, 0.3, 1]
      }).then(() => {
        onClose();
        // Reset y after modal unmounts
        setTimeout(() => y.set(0), 100);
      });
    } else {
      // Smooth snap back
      animate(y, 0, {
        type: 'spring',
        damping: 28,
        stiffness: 380
      });
    }
  }, [y, onClose]);

  return {
    y,
    isDragging,
    dragHandleProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerEnd,
      onPointerCancel: handlePointerEnd,
      style: { touchAction: 'none' as const }
    }
  };
}

export const ModalDragIndicator: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div 
    data-drag-handle="true"
    className={`flex items-center justify-center cursor-grab active:cursor-grabbing select-none group ${className}`}
    aria-label="Drag down to dismiss modal"
    role="button"
    tabIndex={-1}
  >
    <div className="w-10 h-1.5 rounded-full bg-white/60 group-hover:bg-[#D4AF37] group-active:bg-[#D4AF37] backdrop-blur-sm shadow-[0_1px_4px_rgba(0,0,0,0.75)] transition-all" />
  </div>
);

