import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useDragControls, useMotionValue, useTransform, animate, PanInfo } from 'motion/react';

const SLIDE_DURATION = 1.15;
const MODAL_TRANSITION = { duration: SLIDE_DURATION, ease: [0.25, 1, 0.5, 1] as const };
// Allow free downward travel during drag (bottom: 2500) so Framer Motion never fires a competing bounce-back spring on drag release
const DRAG_CONSTRAINTS = { top: 0, bottom: 2500 };
const DRAG_ELASTIC = { top: 0.12, bottom: 1 };
const DRAG_TRANSITION = { bounceStiffness: 420, bounceDamping: 34 };
const DRAG_HANDLE_STYLE = { touchAction: 'none' as const };

export function useModalDragDismiss(
  onClose: () => void,
  enabled = true,
  onDismissStart?: () => void
) {
  const dragControls = useDragControls();
  const initialSlideDistance = typeof window !== 'undefined' ? Math.max(window.innerHeight, 800) : 900;
  const y = useMotionValue(initialSlideDistance);
  const modalOpacity = useMotionValue(0);
  const entryBackdropOpacity = useMotionValue(0);
  const dragBackdropOpacity = useTransform(y, [0, initialSlideDistance], [1, 0]);
  const backdropOpacity = useTransform(
    [entryBackdropOpacity, dragBackdropOpacity],
    ([entry, drag]: number[]) => Math.min(entry, drag)
  );
  const [isEntering, setIsEntering] = useState(true);
  const [isDismissing, setIsDismissing] = useState(false);
  const isDismissingRef = useRef(false);
  const isMountedRef = useRef(true);
  const onCloseRef = useRef(onClose);
  const onDismissStartRef = useRef(onDismissStart);
  const timeoutRef = useRef<number | null>(null);
  const entryAnimRef = useRef<{ stop: () => void }[]>([]);
  // Track the user's last intentional vertical movement direction ('up' | 'down' | null)
  const lastDirectionRef = useRef<'up' | 'down' | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    onDismissStartRef.current = onDismissStart;
  }, [onDismissStart]);

  const stopEntryAnimations = useCallback(() => {
    entryAnimRef.current.forEach((ctrl) => ctrl.stop());
    entryAnimRef.current = [];
  }, []);

  const triggerSlideUpEntry = useCallback(() => {
    stopEntryAnimations();
    const startY =
      typeof window !== 'undefined' ? Math.max(window.innerHeight, 800) : 900;

    setIsEntering(true);
    isDismissingRef.current = false;
    setIsDismissing(false);

    y.set(startY);
    modalOpacity.set(0.35);
    entryBackdropOpacity.set(0);

    const rafId = requestAnimationFrame(() => {
      if (!isMountedRef.current) return;
      const yControls = animate(y, 0, {
        duration: SLIDE_DURATION,
        ease: [0.25, 0.85, 0.35, 1],
        onComplete: () => {
          if (isMountedRef.current) {
            setIsEntering(false);
          }
        },
      });
      const opacityControls = animate(modalOpacity, 1, {
        duration: 0.45,
        ease: 'easeOut',
      });
      const backdropControls = animate(entryBackdropOpacity, 1, {
        duration: SLIDE_DURATION * 0.85,
        ease: 'easeOut',
      });
      entryAnimRef.current = [yControls, opacityControls, backdropControls];
    });

    return () => {
      cancelAnimationFrame(rafId);
      stopEntryAnimations();
    };
  }, [y, modalOpacity, entryBackdropOpacity, stopEntryAnimations]);

  const dismissWithSlideOut = useCallback((customAction?: (() => void) | React.SyntheticEvent) => {
    if (isDismissingRef.current) return;
    stopEntryAnimations();
    setIsEntering(false);
    isDismissingRef.current = true;
    setIsDismissing(true);

    // Notify parent synchronously in the same tick so any parent X button / drag controls unlock at 0ms
    if (onDismissStartRef.current) {
      onDismissStartRef.current();
    }

    const exitTarget = typeof window !== 'undefined' ? Math.max(window.innerHeight, 800) : 900;
    const currentY = Math.max(0, y.get());
    // Ensure that even if the user dragged partway down and let go, the remaining downward glide feels equally slow and deliberate
    const remainingRatio = Math.max(0.75, Math.min(1, (exitTarget - currentY) / exitTarget));
    const slideOutDuration = SLIDE_DURATION * remainingRatio;

    let closed = false;
    const finishClose = () => {
      if (closed || !isMountedRef.current) return;
      closed = true;
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (typeof customAction === 'function') {
        customAction();
      } else {
        onCloseRef.current();
      }
    };

    // Guaranteed fallback timeout slightly after the slide-out completes
    timeoutRef.current = window.setTimeout(finishClose, Math.round(slideOutDuration * 1000) + 80);

    // Keep modalOpacity high during the downward slide so the user clearly sees the sheet glide all the way down
    const opacityControls = animate(modalOpacity, 0, {
      duration: slideOutDuration,
      ease: [0.65, 0, 0.85, 0.35],
    });
    const backdropControls = animate(entryBackdropOpacity, 0, {
      duration: slideOutDuration,
      ease: [0.37, 0, 0.63, 1],
    });
    // Use a balanced, gentle curve (not front-loaded ease-out) so the downward slide matches the perceived speed of the upward slide
    const yControls = animate(y, exitTarget, {
      duration: slideOutDuration,
      ease: [0.32, 0.12, 0.28, 1],
    });
    entryAnimRef.current = [yControls, opacityControls, backdropControls];
    yControls.then(finishClose, finishClose);
  }, [y, modalOpacity, entryBackdropOpacity, stopEntryAnimations]);

  // Run the upward slide-in animation on mount without being cancelled by React 19 StrictMode double-effect execution
  useEffect(() => {
    isMountedRef.current = true;
    const cleanupEntry = triggerSlideUpEntry();
    return () => {
      isMountedRef.current = false;
      cleanupEntry();
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [triggerSlideUpEntry]);

  // Ensure modal is visible when enabled without interrupting any active drag or dismissal
  useEffect(() => {
    if (enabled && !isEntering && !isDismissingRef.current) {
      modalOpacity.set(1);
      entryBackdropOpacity.set(1);
    }
  }, [enabled, isEntering, modalOpacity, entryBackdropOpacity]);

  const startDrag = useCallback((e: React.PointerEvent) => {
    if (!enabled || isDismissingRef.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    // Prevent dragging when clicking buttons, inputs, links, or interactive controls
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea, [role="button"]:not([data-drag-handle])')) {
      return;
    }

    stopEntryAnimations();
    setIsEntering(false);
    lastDirectionRef.current = null;
    dragControls.start(e);
  }, [enabled, dragControls, stopEntryAnimations]);

  const handleDrag = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    // Record the user's latest vertical movement direction even for tiny movements
    if (info.delta.y < -0.4) {
      lastDirectionRef.current = 'up';
    } else if (info.delta.y > 0.4) {
      lastDirectionRef.current = 'down';
    }
  }, []);

  const handleDragEnd = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (!enabled || isDismissingRef.current) return;

    const offsetY = info.offset.y;
    const velocityY = info.velocity.y;
    const currentY = y.get();

    // Update last direction if the final frame had a delta or clear velocity
    if (info.delta.y < -0.4 || velocityY < -15) {
      lastDirectionRef.current = 'up';
    } else if (info.delta.y > 0.4 || velocityY > 15) {
      lastDirectionRef.current = 'down';
    }

    const lastMovedUp = lastDirectionRef.current === 'up';
    const lastMovedDown = lastDirectionRef.current === 'down';

    // Always depend on the user's last movement:
    // - If the user's last movement was upward (even a tiny push up), they do NOT want to exit -> snap back up to 0.
    // - If the user's last movement was downward (even after pushing up first, or dragging down), dismiss the modal.
    const shouldDismiss =
      !lastMovedUp &&
      (
        (lastMovedDown && (currentY > 4 || offsetY > 4 || velocityY > 20)) ||
        (!lastDirectionRef.current && (currentY > 45 || offsetY > 45))
      );

    if (shouldDismiss) {
      dismissWithSlideOut();
    } else {
      const snapControls = animate(y, 0, {
        duration: 0.65,
        ease: [0.25, 1, 0.5, 1],
      });
      entryAnimRef.current = [snapControls];
    }
  }, [enabled, y, dismissWithSlideOut]);

  const modalStyle = useMemo(
    () => ({ y, opacity: modalOpacity, willChange: 'transform, opacity' as const }),
    [y, modalOpacity]
  );

  const dragModalProps = useMemo(
    () => ({
      style: modalStyle,
      transition: MODAL_TRANSITION,
      drag: enabled && !isDismissing ? ('y' as const) : false,
      dragControls,
      dragListener: false,
      dragDirectionLock: true,
      dragConstraints: DRAG_CONSTRAINTS,
      dragElastic: DRAG_ELASTIC,
      dragMomentum: false,
      dragTransition: DRAG_TRANSITION,
      onDrag: handleDrag,
      onDragEnd: handleDragEnd,
    }),
    [modalStyle, enabled, isDismissing, dragControls, handleDrag, handleDragEnd]
  );

  const dragHandleProps = useMemo(
    () => ({
      onPointerDown: startDrag,
      style: DRAG_HANDLE_STYLE,
    }),
    [startDrag]
  );

  return {
    y,
    modalOpacity,
    backdropOpacity,
    isDismissing,
    dragControls,
    triggerSlideUpEntry,
    dismissWithSlideOut,
    dragModalProps,
    dragHandleProps,
  };
}

export const ModalDragIndicator: React.FC<{ className?: string }> = React.memo(({ className = "" }) => (
  <div 
    data-drag-handle="true"
    className={`flex items-center justify-center cursor-grab active:cursor-grabbing select-none group ${className}`}
    aria-label="Drag down to dismiss modal"
    role="button"
    tabIndex={-1}
  >
    <div className="w-10 h-1.5 rounded-full bg-white/65 group-hover:bg-[#D4AF37] group-active:bg-[#D4AF37] backdrop-blur-sm shadow-[0_1px_4px_rgba(0,0,0,0.85)] transition-colors" />
  </div>
));

