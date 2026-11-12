import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Star, MapPin, ShieldCheck, Play, Pause, Volume2, VolumeX, Download, PictureInPicture2, ListVideo, Film, Image as ImageIcon, Maximize2, Minimize2, ChevronLeft, ChevronRight, Clock, ChevronDown, ChevronUp, ExternalLink, Globe } from 'lucide-react';
import { Vendor, Review, getVendorSocialItems, SocialPlatformId } from '../types';
import { MOCK_BOOKINGS } from '../services/mockData';
import BookingModal from './BookingModal';
import { useModalDragDismiss, ModalDragIndicator } from './useModalDragDismiss';

const SocialPlatformIcon: React.FC<{ platform: SocialPlatformId; className?: string }> = ({ platform, className = 'w-3.5 h-3.5' }) => {
  switch (platform) {
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
          <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
        </svg>
      );
    case 'tiktok':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5" />
        </svg>
      );
    case 'youtube':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17" />
          <path d="m10 15 5-3-5-3z" />
        </svg>
      );
    case 'twentyfoursix':
      return (
        <span className="font-sans font-black text-[8.5px] leading-none tracking-tighter select-none">
          24/6
        </span>
      );
    case 'facebook':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
        </svg>
      );
    case 'website':
    default:
      return <Globe className={className} />;
  }
};

const MODAL_TRANSITION = { duration: 1.15, ease: [0.25, 0.85, 0.35, 1] as const };
const EMPTY_INITIAL_DETAILS = { clientName: '', contactEmail: '', eventName: '' };

const formatVideoTime = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

interface QuickViewModalProps {
  vendor: Vendor;
  onClose: () => void;
  onBook: (vendor: Vendor) => void;
  onAddReview: (vendorId: string, review: Omit<Review, 'id' | 'date'>) => void;
  bookingVendor?: Vendor | null;
  onCloseBooking?: () => void;
  onConfirmBooking?: (details: any) => void;
  onBookingDone?: (isPriority: boolean) => void;
  onPrepareBookingDone?: (isPriority: boolean) => void;
  onAddToPlan?: (vendor: Vendor) => void;
  isInPlan?: boolean;
  onGoToPlan?: () => void;
  onPrepareGoToPlan?: () => void;
  onGoToEvents?: () => void;
  onPrepareGoToEvents?: () => void;
}

const QuickViewModal: React.FC<QuickViewModalProps> = React.memo(({ 
  vendor, onClose, onBook, onAddReview, bookingVendor, onCloseBooking, onConfirmBooking, onBookingDone, onPrepareBookingDone, onAddToPlan, onGoToPlan, onPrepareGoToPlan, onGoToEvents, onPrepareGoToEvents 
}) => {
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Custom Luxury Video Player State
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoContainerRef = useRef<HTMLDivElement | null>(null);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoVolume, setVideoVolume] = useState(1);
  const [isVideoMuted, setIsVideoMuted] = useState(false);
  const [isPlaylistOpen, setIsPlaylistOpen] = useState(false);
  const [isPipActive, setIsPipActive] = useState(false);
  const [showVideoControls, setShowVideoControls] = useState(true);
  const [isVideoFullscreen, setIsVideoFullscreen] = useState(false);
  
  const [showReviews, setShowReviews] = useState(false);
  const [newReview, setNewReview] = useState({ author: '', rating: 5, text: '' });
  const [isNestedBookingDismissing, setIsNestedBookingDismissing] = useState(false);
  const [nestedBookingKey, setNestedBookingKey] = useState(0);
  const isQuickViewDismissingRef = React.useRef(false);
  const reviewsSectionRef = useRef<HTMLDivElement | null>(null);
  const socialItems = useMemo(() => getVendorSocialItems(vendor.socialLinks), [vendor.socialLinks]);

  useEffect(() => {
    if (bookingVendor) {
      setIsNestedBookingDismissing(false);
    }
  }, [bookingVendor]);

  useEffect(() => {
    const handleFsChange = () => {
      const isNativeFs = Boolean(document.fullscreenElement);
      setIsVideoFullscreen(isNativeFs);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const mediaItems = useMemo(() => {
    const items: Array<{ type: 'image' | 'video' | 'twentyfoursix' | 'audio', url: string, isNative?: boolean, label?: string }> = [];
    const is24SixUrl = (u: string) =>
      /24six\.(app|com)/i.test(u) || u.includes('simcha_24six=1');
    const isAudioUrl = (u: string) =>
      !is24SixUrl(u) && (
        u.startsWith('data:audio/') ||
        /\.(mp3|wav|m4a|aac|flac|oga)(?:\?|$|#|%)/i.test(u) ||
        u.includes('audio%2F') ||
        u.includes('audio/') ||
        u.includes('simcha_audio=1')
      );
    const isEmbedVideoUrl = (u: string) =>
      /youtube\.com\/embed\/|player\.vimeo\.com\/video\//i.test(u);
    const isDirectVideoUrl = (u: string) =>
      !isEmbedVideoUrl(u) && !is24SixUrl(u) && !isAudioUrl(u) && (
        u.startsWith('data:video/') ||
        /\.(mp4|webm|ogg|mov|m4v|avi|ogv)(?:\?|$|#|%)/i.test(u) ||
        u.includes('video%2F') ||
        u.includes('video/') ||
        u.includes('simcha_video=1') ||
        u.includes('dl.dropboxusercontent.com')
      );

    if (vendor.video) {
      if (is24SixUrl(vendor.video)) {
        items.push({ type: 'twentyfoursix', url: vendor.video.replace(/[#?&]simcha_24six=1/g, ''), label: `${vendor.name} on 24/6` });
      } else if (isAudioUrl(vendor.video)) {
        items.push({ type: 'audio', url: vendor.video, label: `${vendor.name} Audio Track` });
      } else {
        const isNativeVideo = isDirectVideoUrl(vendor.video);
        items.push({ type: 'video', url: vendor.video, isNative: !!isNativeVideo, label: `${vendor.name} Feature Film` });
      }
    }
    if (vendor.gallery && vendor.gallery.length > 0) {
      items.push(...vendor.gallery.map((url, idx) => {
        if (!url) return null;
        if (is24SixUrl(url)) {
          return { type: 'twentyfoursix' as const, url: url.replace(/[#?&]simcha_24six=1/g, ''), label: `24/6 Music & Video ${idx + 1}` };
        }
        if (isAudioUrl(url)) {
          return { type: 'audio' as const, url, label: `Music Track ${idx + 1}` };
        }
        if (isDirectVideoUrl(url)) {
          return { type: 'video' as const, url, isNative: true, label: `Showcase Video ${idx + 1}` };
        }
        if (isEmbedVideoUrl(url)) {
          return { type: 'video' as const, url, isNative: false, label: `Showcase Video ${idx + 1}` };
        }
        return { type: 'image' as const, url, label: `Gallery Photo ${idx + 1}` };
      }).filter(Boolean) as any);
    }
    if (items.length === 0) items.push({ type: 'image', url: vendor.image || 'https://picsum.photos/800/600', label: vendor.name });
    return items;
  }, [vendor]);

  const currentMedia = mediaItems[currentMediaIndex] || mediaItems[0];

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
    };
  }, []);

  useEffect(() => {
    // Preload first image concurrently
    if (mediaItems[0]?.type === 'image' && mediaItems[0]?.url) {
      const img = new Image();
      img.src = mediaItems[0].url;
      if (img.complete) {
        setImageLoaded(true);
      } else {
        img.onload = () => setImageLoaded(true);
        img.onerror = () => setImageLoaded(true);
      }
    } else {
      setImageLoaded(true);
    }
  }, [mediaItems]);

  useEffect(() => {
    setImageLoaded(false);
    setIsPlaying(false);
    setShowVideoControls(true);
    setVideoCurrentTime(0);
    setVideoDuration(0);
    setIsPlaylistOpen(false);
    if (currentMedia?.type === 'image' && currentMedia?.url) {
      const img = new Image();
      img.src = currentMedia.url;
      if (img.complete) {
        setImageLoaded(true);
      } else {
        img.onload = () => setImageLoaded(true);
        img.onerror = () => setImageLoaded(true);
      }
    } else {
      setImageLoaded(true);
    }
  }, [currentMediaIndex, currentMedia]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const handleEnterPiP = () => setIsPipActive(true);
    const handleLeavePiP = () => setIsPipActive(false);
    vid.addEventListener('enterpictureinpicture', handleEnterPiP);
    vid.addEventListener('leavepictureinpicture', handleLeavePiP);
    return () => {
      vid.removeEventListener('enterpictureinpicture', handleEnterPiP);
      vid.removeEventListener('leavepictureinpicture', handleLeavePiP);
    };
  }, [currentMediaIndex, currentMedia]);

  const estimatedResponseTime = useMemo(() => {
    const vendorBookings = MOCK_BOOKINGS.filter(b => b.vendorId === vendor.id);
    const bookingsCount = vendorBookings.length;
    const completedCount = vendorBookings.filter(b => b.status === 'completed' || b.status === 'confirmed').length;
    const completionRate = bookingsCount > 0 ? (completedCount / bookingsCount) : 0.8;
    const score = (vendor.rating * 10) + (completionRate * 20) + (bookingsCount * 5);
    if (score >= 65) return 'Usually responds in 1 hr';
    if (score >= 50) return 'Usually responds in 2 hrs';
    if (score >= 35) return 'Usually responds in 4 hrs';
    return 'Usually responds within 24 hrs';
  }, [vendor]);

  const nextMedia = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.pause();
    }
    setIsPlaying(false);
    setShowVideoControls(true);
    setCurrentMediaIndex((prev) => (prev + 1) % mediaItems.length);
  }, [mediaItems.length]);

  const prevMedia = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (videoRef.current) {
      videoRef.current.pause();
    }
    setIsPlaying(false);
    setShowVideoControls(true);
    setCurrentMediaIndex((prev) => (prev - 1 + mediaItems.length) % mediaItems.length);
  }, [mediaItems.length]);

  const handleToggleVideoPlay = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (currentMedia?.type === 'video' && currentMedia?.isNative && videoRef.current) {
      const vid = videoRef.current;
      if (vid.paused) {
        vid.play().then(() => {
          setIsPlaying(true);
          setShowVideoControls(false);
          setIsPlaylistOpen(false);
        }).catch(() => setIsPlaying(false));
      } else {
        vid.pause();
        setIsPlaying(false);
        setShowVideoControls(true);
      }
    } else {
      setIsPlaying((prev) => {
        const next = !prev;
        setShowVideoControls(!next);
        return next;
      });
    }
  }, [currentMedia]);

  // Tapping the video surface toggles controls visibility when playing, or starts playback when paused with controls hidden
  const handleVideoSurfaceTap = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaylistOpen) {
      setIsPlaylistOpen(false);
      return;
    }
    setShowVideoControls((prev) => !prev);
  }, [isPlaylistOpen]);

  const handleToggleFullscreen = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsVideoFullscreen(false);
        return;
      }
      if (isVideoFullscreen) {
        setIsVideoFullscreen(false);
        return;
      }
      const containerEl = videoContainerRef.current as any;
      const vidEl = videoRef.current as any;
      if (containerEl?.requestFullscreen) {
        await containerEl.requestFullscreen();
        setIsVideoFullscreen(true);
      } else if (vidEl?.webkitEnterFullscreen) {
        vidEl.webkitEnterFullscreen();
      } else {
        setIsVideoFullscreen(true);
      }
    } catch {
      // Fallback to in-app fullscreen overlay if browser/iframe blocks native Fullscreen API
      setIsVideoFullscreen((prev) => !prev);
    }
  }, [isVideoFullscreen]);

  const handleSeekVideo = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const newTime = Number(e.target.value);
    setVideoCurrentTime(newTime);
    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
    }
  }, []);

  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const newVol = Number(e.target.value);
    setVideoVolume(newVol);
    const muted = newVol === 0;
    setIsVideoMuted(muted);
    if (videoRef.current) {
      videoRef.current.volume = newVol;
      videoRef.current.muted = muted;
    }
  }, []);

  const handleToggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const nextMuted = !isVideoMuted;
    setIsVideoMuted(nextMuted);
    if (videoRef.current) {
      videoRef.current.muted = nextMuted;
      if (!nextMuted && videoVolume === 0) {
        setVideoVolume(0.8);
        videoRef.current.volume = 0.8;
      }
    }
  }, [isVideoMuted, videoVolume]);

  const handleTogglePiP = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPipActive(false);
      } else if (videoRef.current && typeof videoRef.current.requestPictureInPicture === 'function') {
        await videoRef.current.requestPictureInPicture();
        setIsPipActive(true);
      }
    } catch (err) {
      console.warn('Picture-in-Picture not available:', err);
    }
  }, []);

  const handleDownloadVideo = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentMedia?.url) return;
    const link = document.createElement('a');
    link.href = currentMedia.url;
    link.download = `${vendor.name.replace(/\s+/g, '_')}_Showcase_${currentMediaIndex + 1}.mp4`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [currentMedia?.url, vendor.name, currentMediaIndex]);

  const handleToggleReviews = useCallback(() => {
    setShowReviews((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => {
          reviewsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 90);
      }
      return next;
    });
  }, []);

  const handleScrollToReviews = useCallback(() => {
    setShowReviews(true);
    setTimeout(() => {
      reviewsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 90);
  }, []);

  const handleAuthorChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setNewReview((prev) => ({ ...prev, author: val }));
  }, []);

  const handleRatingChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = Number(e.target.value);
    setNewReview((prev) => ({ ...prev, rating: val }));
  }, []);

  const handleReviewTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNewReview((prev) => ({ ...prev, text: val }));
  }, []);

  const handleSubmitReview = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (newReview.author.trim() && newReview.text.trim()) {
      onAddReview(vendor.id, newReview);
      setNewReview({ author: '', rating: 5, text: '' });
    }
  }, [newReview, onAddReview, vendor.id]);

  const handleAddToPlanClick = useCallback(() => {
    if (onAddToPlan) onAddToPlan(vendor);
  }, [onAddToPlan, vendor]);

  const handleBookClick = useCallback(() => {
    setIsNestedBookingDismissing(false);
    setNestedBookingKey((prev) => prev + 1);
    onBook(vendor);
  }, [onBook, vendor]);

  const handleNestedBookingClose = useCallback(() => {
    if (isQuickViewDismissingRef.current) return;
    if (onCloseBooking) onCloseBooking();
    else onClose();
  }, [onCloseBooking, onClose]);

  const handleNestedBookingDone = useCallback((isPriority: boolean) => {
    if (onBookingDone) onBookingDone(isPriority);
    else onClose();
  }, [onBookingDone, onClose]);

  const handleNestedBookingConfirm = useCallback((details: any) => {
    if (onConfirmBooking) onConfirmBooking(details);
  }, [onConfirmBooking]);

  const handleNestedGoToPlan = useCallback(() => {
    if (onCloseBooking) onCloseBooking();
    onClose();
    if (onGoToPlan) onGoToPlan();
  }, [onCloseBooking, onClose, onGoToPlan]);

  const handleNestedGoToEvents = useCallback(() => {
    if (onCloseBooking) onCloseBooking();
    onClose();
    if (onGoToEvents) onGoToEvents();
  }, [onCloseBooking, onClose, onGoToEvents]);

  const handleNestedBookingDismissStart = useCallback(() => {
    setIsNestedBookingDismissing(true);
  }, []);

  const handleQuickViewDismissStart = useCallback(() => {
    isQuickViewDismissingRef.current = true;
    document.body.style.overflow = '';
  }, []);

  const defaultSelectedDate = useMemo(() => new Date().toLocaleDateString('en-CA'), []);

  const isQuickViewInteractive = !bookingVendor || isNestedBookingDismissing;
  const { backdropOpacity, isDismissing, dragModalProps, dragHandleProps, dismissWithSlideOut } = useModalDragDismiss(
    onClose,
    true,
    handleQuickViewDismissStart
  );

  // Trigger QuickViewModal's downward slide at 0ms simultaneously with nested BookingModal's downward slide
  const handleNestedPrepareGoToEvents = useCallback(() => {
    if (onPrepareGoToEvents) onPrepareGoToEvents();
    dismissWithSlideOut(() => {
      if (onCloseBooking) onCloseBooking();
      onClose();
      if (onGoToEvents) onGoToEvents();
    });
  }, [onPrepareGoToEvents, dismissWithSlideOut, onCloseBooking, onClose, onGoToEvents]);

  const handleNestedPrepareGoToPlan = useCallback(() => {
    if (onPrepareGoToPlan) onPrepareGoToPlan();
    dismissWithSlideOut(() => {
      if (onCloseBooking) onCloseBooking();
      onClose();
      if (onGoToPlan) onGoToPlan();
    });
  }, [onPrepareGoToPlan, dismissWithSlideOut, onCloseBooking, onClose, onGoToPlan]);

  const handleNestedPrepareBookingDone = useCallback((isPriority: boolean) => {
    if (onPrepareBookingDone) onPrepareBookingDone(isPriority);
    dismissWithSlideOut(() => {
      if (onBookingDone) onBookingDone(isPriority);
      else onClose();
    });
  }, [onPrepareBookingDone, dismissWithSlideOut, onBookingDone, onClose]);

  const progressPercent = videoDuration > 0 ? Math.min(100, (videoCurrentTime / videoDuration) * 100) : 0;

  return (
    <motion.div 
      style={{ opacity: backdropOpacity }}
      transition={MODAL_TRANSITION}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-view-title"
      className={`fixed inset-0 z-[150] flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 bg-black/80 backdrop-blur-md overflow-hidden ${isDismissing ? 'pointer-events-none' : ''}`}
    >
      <motion.div 
        {...dragModalProps}
        transition={MODAL_TRANSITION}
        className={`bg-[#111] w-full sm:max-w-4xl h-[96dvh] sm:h-[90vh] sm:max-h-[90vh] rounded-t-[2.5rem] rounded-b-none sm:rounded-[2.5rem] border-t-2 border-r border-l sm:border border-[#D4AF37]/30 shadow-2xl overflow-hidden relative flex flex-col mt-auto sm:mt-0 transform-gpu ${isDismissing ? 'pointer-events-none' : ''}`}
      >
        {/* Top bar drag area with centered gold drag indicator pill — stays exposed above nested BookingModal so dragging it dismisses both modals at once */}
        <div 
          {...dragHandleProps}
          data-drag-handle="true"
          title={bookingVendor ? "Drag down to close both windows" : "Drag down to close"}
          className="absolute top-0 left-0 right-14 z-[70] pt-1.5 pb-2 flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
        >
          <div className="pl-14">
            <ModalDragIndicator />
          </div>
        </div>

        {/* Single vertical scroll container where media scrolls with the content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar relative flex flex-col bg-[#111] rounded-t-[2.5rem]">
          {/* Media Section - 1:1 Square aspect ratio clipped to the modal's rounded top corners (or fullscreen when toggled) */}
          <div
            ref={videoContainerRef}
            className={
              isVideoFullscreen
                ? "fixed inset-0 z-[250] w-screen h-screen bg-black flex items-center justify-center overflow-hidden"
                : "w-full aspect-square relative bg-zinc-950 flex items-center justify-center flex-shrink-0 overflow-hidden rounded-t-[2.5rem]"
            }
          >
            {currentMedia.type === 'video' ? (
              <div
                onClick={handleVideoSurfaceTap}
                className={`w-full h-full relative group/video overflow-hidden bg-black select-none cursor-pointer ${
                  isVideoFullscreen ? '' : 'rounded-t-[2.5rem]'
                }`}
              >
                {currentMedia.isNative ? (
                  <>
                    <video 
                      ref={videoRef}
                      key={currentMedia.url} 
                      src={currentMedia.url.includes('#') ? currentMedia.url : `${currentMedia.url}#t=0.001`} 
                      poster={vendor.image || undefined}
                      className="w-full h-full object-contain bg-black" 
                      preload="metadata"
                      playsInline 
                      muted={isVideoMuted}
                      onTimeUpdate={(e) => setVideoCurrentTime(e.currentTarget.currentTime)}
                      onLoadedMetadata={(e) => {
                        setVideoDuration(e.currentTarget.duration || 0);
                        e.currentTarget.volume = videoVolume;
                        e.currentTarget.muted = isVideoMuted;
                      }}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onEnded={() => {
                        setIsPlaying(false);
                        setShowVideoControls(true);
                      }}
                    />

                    {/* Single Center Play/Pause Button + Bottom Controls Bar: hidden automatically once playing, pops back up on tap */}
                    <AnimatePresence>
                      {showVideoControls && (
                        <motion.div
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-between"
                        >
                          {/* Center Play / Pause Button (only Play/Pause button) */}
                          <div className="flex-1 flex items-center justify-center">
                            <button
                              type="button"
                              onClick={handleToggleVideoPlay}
                              aria-label={isPlaying ? 'Pause video' : 'Play video'}
                              className="pointer-events-auto w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-black/75 hover:bg-[#D4AF37] text-[#D4AF37] hover:text-black border-2 border-[#D4AF37] shadow-[0_0_30px_rgba(212,175,55,0.45)] flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                            >
                              {isPlaying ? (
                                <Pause className="w-7 h-7 sm:w-8 sm:h-8 fill-current" />
                              ) : (
                                <Play className="w-7 h-7 sm:w-8 sm:h-8 fill-current ml-1" />
                              )}
                            </button>
                          </div>

                          {/* Custom Luxury Simcha Video Controls Bar */}
                          <div 
                            onClick={(e) => e.stopPropagation()}
                            className="simcha-video-controls-bar pointer-events-auto w-full bg-gradient-to-t from-black/95 via-black/80 to-transparent pt-8 pb-3.5 px-4 sm:px-6 flex flex-col gap-2.5"
                          >
                            {/* Custom Interactive Gold Timestamp Scrubber */}
                            <div className="flex items-center gap-3 w-full">
                              <span className="text-[10px] font-black font-mono text-[#D4AF37] tracking-wider min-w-[34px]">
                                {formatVideoTime(videoCurrentTime)}
                              </span>
                              <div className="relative flex-1 h-5 flex items-center group/scrub cursor-pointer">
                                <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden border border-[#D4AF37]/25">
                                  <div 
                                    className="h-full bg-[#D4AF37] rounded-full transition-[width] duration-75"
                                    style={{ width: `${progressPercent}%` }}
                                  />
                                </div>
                                <div 
                                  className="absolute w-3.5 h-3.5 rounded-full bg-[#D4AF37] border-2 border-[#FFF8D6] shadow-[0_0_10px_rgba(212,175,55,0.9)] pointer-events-none -translate-x-1/2 transition-transform group-hover/scrub:scale-125"
                                  style={{ left: `${progressPercent}%` }}
                                />
                                <input
                                  type="range"
                                  min={0}
                                  max={videoDuration || 100}
                                  step={0.05}
                                  value={videoCurrentTime}
                                  onChange={handleSeekVideo}
                                  aria-label="Seek video timeline"
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                              </div>
                              <span className="text-[10px] font-bold font-mono text-zinc-300 tracking-wider min-w-[34px] text-right">
                                {formatVideoTime(videoDuration)}
                              </span>
                            </div>

                            {/* Custom Luxury Control Buttons Row */}
                            <div className="flex items-center justify-between gap-2">
                              {/* Left Controls: Fullscreen Button (in place of second pause button) + Custom Volume */}
                              <div className="flex items-center gap-2 sm:gap-3">
                                <button
                                  type="button"
                                  onClick={handleToggleFullscreen}
                                  aria-label={isVideoFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                                  title={isVideoFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                                  className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all shadow-md cursor-pointer ${
                                    isVideoFullscreen
                                      ? 'bg-[#D4AF37] text-black border-[#FFF8D6]'
                                      : 'bg-black/75 hover:bg-[#D4AF37] text-[#D4AF37] hover:text-black border-[#D4AF37]/50'
                                  }`}
                                >
                                  {isVideoFullscreen ? (
                                    <Minimize2 className="w-3.5 h-3.5" />
                                  ) : (
                                    <Maximize2 className="w-3.5 h-3.5" />
                                  )}
                                </button>

                                {/* Custom Luxury Volume Pill */}
                                <div className="flex items-center gap-2 bg-black/75 border border-[#D4AF37]/40 rounded-full px-2.5 py-1">
                                  <button
                                    type="button"
                                    onClick={handleToggleMute}
                                    aria-label={isVideoMuted ? 'Unmute video' : 'Mute video'}
                                    className="text-[#D4AF37] hover:text-[#FFE885] transition-colors cursor-pointer"
                                  >
                                    {isVideoMuted || videoVolume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                                  </button>
                                  <div className="relative w-14 sm:w-20 h-4 flex items-center">
                                    <div className="w-full h-1 bg-white/20 rounded-full overflow-hidden">
                                      <div 
                                        className="h-full bg-[#D4AF37] rounded-full"
                                        style={{ width: `${(isVideoMuted ? 0 : videoVolume) * 100}%` }}
                                      />
                                    </div>
                                    <input
                                      type="range"
                                      min={0}
                                      max={1}
                                      step={0.05}
                                      value={isVideoMuted ? 0 : videoVolume}
                                      onChange={handleVolumeChange}
                                      aria-label="Video volume"
                                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                  </div>
                                </div>
                              </div>

                              {/* Right Controls: Custom Playlist, Picture-in-Picture, Custom Download */}
                              <div className="flex items-center gap-1.5 sm:gap-2">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setIsPlaylistOpen(prev => !prev); }}
                                  aria-label="Open media playlist"
                                  title="Showcase Playlist"
                                  className={`h-8 px-2.5 rounded-full border text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all cursor-pointer ${
                                    isPlaylistOpen
                                      ? 'bg-[#D4AF37] text-black border-[#FFF8D6] shadow-[0_0_12px_rgba(212,175,55,0.5)]'
                                      : 'bg-black/75 text-[#D4AF37] border-[#D4AF37]/40 hover:bg-[#D4AF37]/20'
                                  }`}
                                >
                                  <ListVideo className="w-3.5 h-3.5" />
                                  <span className="hidden xs:inline">Playlist</span>
                                  <span className="opacity-80">({currentMediaIndex + 1}/{mediaItems.length})</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={handleTogglePiP}
                                  aria-label="Picture in Picture"
                                  title="Picture-in-Picture"
                                  className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all cursor-pointer ${
                                    isPipActive
                                      ? 'bg-[#D4AF37] text-black border-[#FFF8D6]'
                                      : 'bg-black/75 text-[#D4AF37] border-[#D4AF37]/40 hover:bg-[#D4AF37] hover:text-black'
                                  }`}
                                >
                                  <PictureInPicture2 className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  type="button"
                                  onClick={handleDownloadVideo}
                                  aria-label="Download showcase video"
                                  title="Download Video"
                                  className="w-8 h-8 rounded-full bg-black/75 hover:bg-[#D4AF37] text-[#D4AF37] hover:text-black border border-[#D4AF37]/40 flex items-center justify-center transition-all cursor-pointer"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                ) : (
                  <iframe 
                    key={currentMedia.url + isPlaying} 
                    src={`${currentMedia.url}${currentMedia.url.includes('?') ? '&' : '?'}autoplay=1&controls=1&rel=0&modestbranding=1`} 
                    className="w-full h-full border-0 absolute inset-0" 
                    allow="autoplay; fullscreen" 
                  />
                )}
              </div>
            ) : currentMedia.type === 'twentyfoursix' ? (
              <div className="w-full h-full relative bg-zinc-950 flex flex-col items-center justify-center overflow-hidden rounded-t-[2.5rem]">
                <iframe
                  key={currentMedia.url}
                  src={currentMedia.url}
                  title={currentMedia.label || `${vendor.name} on 24/6`}
                  className="w-full h-full border-0 absolute inset-0 bg-zinc-950"
                  allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                />
                {mediaItems.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setIsPlaylistOpen(prev => !prev); }}
                    className="absolute bottom-4 right-4 z-20 h-8 px-3 rounded-full bg-black/75 hover:bg-[#D4AF37] text-[#D4AF37] hover:text-black border border-[#D4AF37]/40 text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all shadow-lg cursor-pointer"
                  >
                    <ListVideo className="w-3.5 h-3.5" />
                    <span>{currentMediaIndex + 1}/{mediaItems.length}</span>
                  </button>
                )}
              </div>
            ) : currentMedia.type === 'audio' ? (
              <div className="w-full h-full relative bg-zinc-950 flex flex-col items-center justify-center p-6 text-center overflow-hidden rounded-t-[2.5rem]">
                <img
                  src={vendor.image || 'https://picsum.photos/800/600'}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover opacity-35 blur-sm scale-105 select-none pointer-events-none"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/65 to-black/45 pointer-events-none" />
                <div className="relative z-10 max-w-md w-full bg-black/80 backdrop-blur-xl border-2 border-[#D4AF37]/50 rounded-3xl p-6 sm:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.9),0_0_30px_rgba(212,175,55,0.22)] flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-[#D4AF37]/15 border-2 border-[#D4AF37] flex items-center justify-center text-[#D4AF37] shadow-[0_0_24px_rgba(212,175,55,0.35)]">
                    <Volume2 className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] font-black uppercase tracking-[0.28em] text-[#D4AF37] block">
                      Featured Audio Track
                    </span>
                    <h4 className="text-lg font-bold font-[Cinzel] text-white">
                      {currentMedia.label || `${vendor.name} Audio`}
                    </h4>
                  </div>
                  <audio
                    key={currentMedia.url}
                    src={currentMedia.url}
                    controls
                    className="w-full mt-1"
                  />
                </div>
                {mediaItems.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setIsPlaylistOpen(prev => !prev); }}
                    className="absolute bottom-4 right-4 z-20 h-8 px-3 rounded-full bg-black/75 hover:bg-[#D4AF37] text-[#D4AF37] hover:text-black border border-[#D4AF37]/40 text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all shadow-lg cursor-pointer"
                  >
                    <ListVideo className="w-3.5 h-3.5" />
                    <span>{currentMediaIndex + 1}/{mediaItems.length}</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="w-full h-full relative bg-zinc-950 flex items-center justify-center overflow-hidden rounded-t-[2.5rem]">
                {!imageLoaded && (
                  <div className="absolute inset-0 bg-zinc-950 animate-pulse flex items-center justify-center">
                    <div className="w-6 h-6 rounded-full border-2 border-[#D4AF37]/30 border-t-[#D4AF37] animate-spin"></div>
                  </div>
                )}
                <motion.img 
                  src={currentMedia.url} 
                  alt={vendor.name} 
                  draggable={false}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: imageLoaded ? 1 : 0, scale: imageLoaded ? 1 : 0.98 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="w-full h-full object-cover object-top rounded-t-[2.5rem] select-none" 
                />
                {mediaItems.length > 1 && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setIsPlaylistOpen(prev => !prev); }}
                    className="absolute bottom-4 right-4 z-20 h-8 px-3 rounded-full bg-black/75 hover:bg-[#D4AF37] text-[#D4AF37] hover:text-black border border-[#D4AF37]/40 text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all shadow-lg cursor-pointer"
                  >
                    <ListVideo className="w-3.5 h-3.5" />
                    <span>{currentMediaIndex + 1}/{mediaItems.length}</span>
                  </button>
                )}
              </div>
            )}

            {/* Custom Luxury Showcase Playlist Drawer */}
            <AnimatePresence>
              {isPlaylistOpen && (currentMedia.type !== 'video' || showVideoControls) && (
                <motion.div
                  initial={{ opacity: 0, y: 16, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 16, scale: 0.97 }}
                  transition={{ duration: 0.2 }}
                  onClick={(e) => e.stopPropagation()}
                  className="absolute inset-x-4 bottom-20 z-40 max-h-60 bg-[#0b0b0b]/95 backdrop-blur-xl border-2 border-[#D4AF37]/50 rounded-2xl p-3.5 shadow-[0_16px_40px_rgba(0,0,0,0.95)] flex flex-col"
                >
                  <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-[#D4AF37]/20">
                    <div className="flex items-center gap-2">
                      <ListVideo className="w-4 h-4 text-[#D4AF37]" />
                      <span className="text-[10px] font-black uppercase tracking-[0.25em] text-[#D4AF37]">
                        Showcase Playlist ({mediaItems.length})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsPlaylistOpen(false)}
                      className="w-6 h-6 rounded-full bg-white/5 hover:bg-[#D4AF37] text-zinc-300 hover:text-black flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                    {mediaItems.map((item, idx) => {
                      const isCurrent = idx === currentMediaIndex;
                      return (
                        <button
                          key={`${item.url}-${idx}`}
                          type="button"
                          onClick={() => {
                            setCurrentMediaIndex(idx);
                            setIsPlaylistOpen(false);
                          }}
                          className={`w-full flex items-center gap-3 p-2 rounded-xl border text-left transition-all cursor-pointer ${
                            isCurrent
                              ? 'bg-[#D4AF37]/15 border-[#D4AF37] text-white'
                              : 'bg-black/50 border-white/10 text-zinc-300 hover:border-[#D4AF37]/40 hover:text-white'
                          }`}
                        >
                          <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-900 border border-[#D4AF37]/30 flex items-center justify-center shrink-0 relative">
                            {item.type === 'video' ? (
                              <Film className="w-4 h-4 text-[#D4AF37]" />
                            ) : item.type === 'twentyfoursix' ? (
                              <span className="font-sans font-black text-[9px] text-[#D4AF37]">24/6</span>
                            ) : item.type === 'audio' ? (
                              <Volume2 className="w-4 h-4 text-[#D4AF37]" />
                            ) : (
                              <img src={item.url} alt="" className="w-full h-full object-cover" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold truncate text-white">
                              {item.label || (item.type === 'video' ? `Video ${idx + 1}` : item.type === 'twentyfoursix' ? `24/6 Content ${idx + 1}` : item.type === 'audio' ? `Audio ${idx + 1}` : `Photo ${idx + 1}`)}
                            </p>
                            <p className="text-[9px] font-black uppercase tracking-widest text-[#D4AF37]/80 flex items-center gap-1 mt-0.5">
                              {item.type === 'video' ? <Film className="w-2.5 h-2.5" /> : item.type === 'twentyfoursix' ? <Play className="w-2.5 h-2.5" /> : item.type === 'audio' ? <Volume2 className="w-2.5 h-2.5" /> : <ImageIcon className="w-2.5 h-2.5" />}
                              <span>{item.type === 'video' ? 'Video Showcase' : item.type === 'twentyfoursix' ? '24/6 Music & Video' : item.type === 'audio' ? 'Audio Track' : 'Gallery Photo'}</span>
                            </p>
                          </div>
                          {isCurrent && (
                            <span className="px-2 py-0.5 rounded-full bg-[#D4AF37] text-black text-[8px] font-black uppercase tracking-widest shrink-0">
                              Active
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Left/Right Gallery Navigation Arrows — visible on photos or when video controls are shown */}
            {mediaItems.length > 1 && (currentMedia.type !== 'video' || showVideoControls) && (
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-30 flex items-center justify-between px-3 sm:px-4 pointer-events-none">
                <button
                  type="button"
                  onClick={prevMedia}
                  aria-label="Previous media"
                  className="p-2.5 sm:p-3 bg-black/75 hover:bg-[#D4AF37] text-[#D4AF37] hover:text-black border border-[#D4AF37]/50 rounded-full transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] shadow-xl pointer-events-auto cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
                <button
                  type="button"
                  onClick={nextMedia}
                  aria-label="Next media"
                  className="p-2.5 sm:p-3 bg-black/75 hover:bg-[#D4AF37] text-[#D4AF37] hover:text-black border border-[#D4AF37]/50 rounded-full transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] shadow-xl pointer-events-auto cursor-pointer"
                >
                  <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
              </div>
            )}
            
            {currentMedia.type !== 'video' && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-1.5 pointer-events-none">
                {mediaItems.map((_, i) => (
                  <div 
                    key={i} 
                    className={`h-1 rounded-full transition-all ${i === currentMediaIndex ? 'w-6 bg-[#D4AF37]' : 'w-2 bg-white/30'}`} 
                  />
                ))}
              </div>
            )}
          </div>

          {/* Info Section */}
          <div className="w-full p-6 md:p-10 flex flex-col bg-[#111]">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-[10px] font-black text-[#D4AF37] uppercase tracking-[0.25em] bg-[#D4AF37]/10 px-3 py-1 rounded-full">
                {vendor.category}
              </span>
              {vendor.isVerified && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-green-400 bg-green-500/10 px-3 py-1 rounded-full">
                  <ShieldCheck className="w-3 h-3" /> Verified
                </span>
              )}
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full whitespace-nowrap">
                <Clock className="w-3 h-3" /> {estimatedResponseTime}
              </span>
            </div>
            <h2 id="quick-view-title" className="text-3xl font-bold text-white font-[Cinzel] mb-2">{vendor.name}</h2>
            
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <button
                type="button"
                onClick={handleScrollToReviews}
                title="Click to view reviews"
                className="flex items-center gap-1.5 text-[#D4AF37] hover:opacity-85 transition-opacity cursor-pointer active:scale-95 group"
              >
                <Star className="w-4 h-4 fill-current text-[#D4AF37]" />
                <span className="text-sm font-black">{vendor.rating.toFixed(1)}</span>
                <span className="text-xs text-zinc-400 group-hover:text-zinc-200 font-medium">
                  ({vendor.reviews?.length || 0} {vendor.reviews?.length === 1 ? 'Review' : 'Reviews'})
                </span>
              </button>
              <div className="flex items-center gap-1.5 text-zinc-300">
                <MapPin className="w-4 h-4 text-[#D4AF37]" />
                <span className="text-sm font-medium">{vendor.location}</span>
              </div>
            </div>

            {socialItems.length > 0 && (
              <div className="w-full flex flex-wrap items-center justify-center gap-2.5 mb-6">
                {socialItems.map((item) => (
                  <a
                    key={item.platform}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={item.label}
                    aria-label={`${vendor.name} on ${item.label}`}
                    className="simcha-social-logo-btn w-9 h-9 rounded-full bg-black/70 hover:bg-[#D4AF37] text-[#D4AF37] hover:text-black border border-[#D4AF37]/45 hover:border-[#D4AF37] inline-flex items-center justify-center transition-all duration-200 shadow-md cursor-pointer active:scale-95"
                  >
                    <SocialPlatformIcon platform={item.platform} className="w-4 h-4 shrink-0" />
                  </a>
                ))}
              </div>
            )}

            <div className="space-y-6 flex-1 mb-8">
              <div>
                <h3 className="text-[10px] font-black text-zinc-300 uppercase tracking-[0.3em] mb-3">About the Professional</h3>
                <p className="text-zinc-300 text-sm leading-relaxed font-light">
                  {vendor.description}
                </p>
              </div>

              {vendor.isKosher && (
                <div className="bg-[#D4AF37]/5 border border-[#D4AF37]/20 p-4 rounded-2xl flex items-center gap-4">
                  <div className="w-10 h-10 bg-[#D4AF37] rounded-xl flex items-center justify-center text-black font-black text-xs">K</div>
                  <div>
                    <p className="text-[10px] font-black text-[#D4AF37] uppercase tracking-widest">Kosher Certified</p>
                    <p className="text-[11px] text-zinc-400">Strict adherence to dietary standards</p>
                  </div>
                </div>
              )}

              {/* Reviews Section */}
              <div ref={reviewsSectionRef} className="border-t border-[#D4AF37]/10 pt-6 scroll-mt-4">
                <button 
                  onClick={handleToggleReviews} 
                  className="w-full flex items-center justify-between text-zinc-300 hover:text-[#D4AF37] text-[10px] font-black uppercase tracking-[0.2em] transition-colors outline-none cursor-pointer"
                  aria-expanded={showReviews}
                >
                  <span className="flex items-center gap-3">
                    Client Voices 
                    <span className="bg-[#D4AF37]/20 px-2 py-0.5 rounded-full text-[#D4AF37]">
                      {vendor.reviews?.length || 0}
                    </span>
                  </span>
                  {showReviews ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                
                <AnimatePresence>
                  {showReviews && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-5 space-y-4 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                        {vendor.reviews?.map(review => (
                          <div key={review.id} className="bg-black/30 p-3.5 rounded-xl border border-[#D4AF37]/10">
                            <div className="flex justify-between items-center mb-2">
                              <span className="font-black text-[10px] text-zinc-200 uppercase tracking-wider">{review.author}</span>
                              <div className="flex text-[#D4AF37] items-center">
                                <Star className="w-2.5 h-2.5 fill-current" />
                                <span className="text-[10px] ml-1 font-bold">{review.rating}</span>
                              </div>
                            </div>
                            <p className="text-[11px] text-zinc-400 italic leading-snug">"{review.text}"</p>
                          </div>
                        ))}
                      </div>
                      
                      <form onSubmit={handleSubmitReview} className="mt-4 pt-4 border-t border-[#D4AF37]/10 flex flex-col gap-3">
                        <div className="grid grid-cols-2 gap-2">
                          <input 
                            type="text" 
                            placeholder="YOUR NAME" 
                            required 
                            className="w-full bg-black/50 border border-[#D4AF37]/20 rounded-lg px-3 py-2 text-[10px] text-white focus:border-[#D4AF37] outline-none" 
                            value={newReview.author} 
                            onChange={handleAuthorChange} 
                          />
                          <select 
                            className="w-full bg-black/50 border border-[#D4AF37]/20 rounded-lg px-3 py-2 text-[10px] text-[#D4AF37] focus:border-[#D4AF37] outline-none" 
                            value={newReview.rating} 
                            onChange={handleRatingChange}
                          >
                            {[5,4,3,2,1].map(num => <option key={num} value={num}>{num} STARS</option>)}
                          </select>
                        </div>
                        <textarea 
                          placeholder="SHARE YOUR EXPERIENCE..." 
                          required 
                          className="bg-black/50 border border-[#D4AF37]/20 rounded-lg px-3 py-2 text-[10px] text-white focus:border-[#D4AF37] outline-none resize-none h-16" 
                          value={newReview.text} 
                          onChange={handleReviewTextChange} 
                        />
                        <button 
                          type="submit" 
                          className="bg-[#D4AF37] text-black text-[9px] font-black py-2.5 px-6 rounded-full hover:bg-[#E5C76B] outline-none uppercase tracking-[0.25em] transition-colors self-start cursor-pointer"
                        >
                          Submit Review
                        </button>
                      </form>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="mt-auto pt-2 border-t border-[#D4AF37]/10 sticky bottom-0 bg-[#111] px-2 pb-[5px]">
              <div className="grid grid-cols-2 gap-3">
                <motion.button 
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleAddToPlanClick}
                  className="flex items-center justify-center border border-[#D4AF37] text-[#D4AF37] font-black py-3.5 rounded-full hover:bg-[#D4AF37] hover:text-black transition-all uppercase tracking-widest text-[10px] cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                >
                  Add to Plan
                </motion.button>
                <motion.button 
                  initial={{ boxShadow: "0 10px 15px -3px rgba(212, 175, 55, 0.2)" }}
                  whileHover={{ scale: 1.03, boxShadow: "0 10px 20px rgba(212,175,55,0.25)" }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleBookClick}
                  className="bg-[#D4AF37] text-black font-black py-3.5 rounded-full hover:bg-[#E5C76B] transition-all uppercase tracking-widest text-[10px] shadow-lg shadow-[#D4AF37]/20 cursor-pointer flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]"
                >
                  Book Now
                </motion.button>
              </div>
            </div>
          </div>
        </div>

        {/* Nested Booking Modal layered inside QuickViewModal */}
        {bookingVendor && (
          <BookingModal
            key={`${bookingVendor.id}-${nestedBookingKey}`}
            isOpen={true}
            isNested={true}
            vendor={bookingVendor}
            selectedDate={defaultSelectedDate}
            onClose={handleNestedBookingClose}
            onDismissStart={handleNestedBookingDismissStart}
            onDone={handleNestedBookingDone}
            onPrepareDone={handleNestedPrepareBookingDone}
            onConfirm={handleNestedBookingConfirm}
            onGoToPlan={handleNestedGoToPlan}
            onPrepareGoToPlan={handleNestedPrepareGoToPlan}
            onGoToEvents={handleNestedGoToEvents}
            onPrepareGoToEvents={handleNestedPrepareGoToEvents}
            initialDetails={EMPTY_INITIAL_DETAILS}
          />
        )}

        {/* Floating close button rendered above the sheet - immediately active as soon as nested booking starts dismissing */}
        {isQuickViewInteractive && (
          <button 
            type="button"
            onClick={dismissWithSlideOut}
            className="absolute top-4 right-4 z-[120] w-8 h-8 flex items-center justify-center bg-[#1a1a1a] hover:bg-[#262626] border border-[#D4AF37]/40 rounded-full text-[#D4AF37] transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37] shadow-xl cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </motion.div>
    </motion.div>
  );
});

export default QuickViewModal;
