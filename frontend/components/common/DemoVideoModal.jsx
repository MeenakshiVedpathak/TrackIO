import { useEffect, useRef, useState } from 'react';
import {
  Play, Pause, Volume2, VolumeX, Settings, Maximize, Minimize, Check,
  Video, Loader2,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/utils/cn';

// Videos placed in /public are served as static assets by Vite — no backend involved.
// The `src` is only applied when the modal is open (lazy), so nothing loads on page mount.
const VIDEOS = [
  { id: 1, label: 'Demo 1', src: '/Demo 1.mp4' },
  { id: 2, label: 'Demo 2', src: '/Demo 2.mp4' },
];

const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};

const DemoVideoModal = ({ open, onOpenChange }) => {
  const [activeId, setActiveId] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);

  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const hideTimerRef = useRef(null);
  const isPlayingRef = useRef(false);

  const active = VIDEOS.find((v) => v.id === activeId);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Fullscreen is requested on the CONTAINER (video + our control bar), not the bare <video>, so
  // the custom controls stay visible and usable in fullscreen instead of falling back to the
  // browser's native chrome.
  useEffect(() => {
    const handleChange = () => setIsFullscreen(document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  useEffect(() => () => clearTimeout(hideTimerRef.current), []);

  const resetPlaybackState = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setPlaybackRate(1);
    setControlsVisible(true);
    clearTimeout(hideTimerRef.current);
  };

  const handleTabSwitch = (id) => {
    setActiveId(id);
    setIsLoading(true);
    resetPlaybackState();
  };

  const handleOpenChange = (val) => {
    if (!val) {
      setIsLoading(true); // reset for next open
      resetPlaybackState();
    }
    onOpenChange(val);
  };

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) {
      if (video.ended) video.currentTime = 0;
      video.play().catch(() => {}); // interrupted-play rejections are expected on fast tab switches
    } else {
      video.pause();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const handleSeek = (e) => {
    const value = Number(e.target.value);
    if (videoRef.current) videoRef.current.currentTime = value;
    setCurrentTime(value);
  };

  const handleSpeedChange = (rate) => {
    if (videoRef.current) videoRef.current.playbackRate = rate;
    setPlaybackRate(rate);
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      containerRef.current?.requestFullscreen?.();
    }
  };

  // Controls fade out a couple seconds after the pointer stops moving, but only while playing —
  // a paused video always keeps its controls visible, same convention as YouTube/Vimeo.
  const wakeControls = () => {
    setControlsVisible(true);
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (isPlayingRef.current) setControlsVisible(false);
    }, 2500);
  };

  // Before the viewer has pressed play at all, the marketing headline + big center play button
  // takes over the frame (matches the reference popup); once they've started, pausing mid-way
  // only shows a plain resume button — repeating the headline on every pause would get in the way.
  const showIntro = !isLoading && !isPlaying && currentTime < 0.5;
  const showResumeHint = !isLoading && !isPlaying && currentTime >= 0.5;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden gap-0">
        {/* Single header row — icon + title on the left, pill tabs on the right, clearing the
            DialogContent's own built-in close button (absolute right-4 top-4) with pr-10 rather
            than rendering a second close control. */}
        <div className="flex items-center gap-3 border-b px-5 py-3.5 pr-10">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Video className="h-4 w-4" />
          </span>
          <DialogTitle className="min-w-0 truncate leading-normal">Demo &mdash; How to use Trackio</DialogTitle>
          <div className="ml-auto flex shrink-0 items-center gap-0.5 rounded-full bg-muted p-0.5">
            {VIDEOS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => handleTabSwitch(v.id)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  activeId === v.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col md:flex-row">
          {/* Video column — full width now that the right info panel has been removed */}
          <div
            ref={containerRef}
            className="relative aspect-video w-full bg-black"
            onMouseMove={wakeControls}
          >
            {open && (
              <>
                {isLoading && (
                  <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black">
                    <Loader2 className="h-10 w-10 animate-spin text-white/60" />
                    <span className="text-sm text-white/50">Loading video&hellip;</span>
                  </div>
                )}

                <video
                  ref={videoRef}
                  key={active.id} // remount on tab switch so the new src loads immediately
                  src={active.src}
                  className="absolute inset-0 h-full w-full"
                  onCanPlay={() => setIsLoading(false)}
                  onPlay={() => { setIsLoading(false); setIsPlaying(true); wakeControls(); }}
                  onPause={() => { setIsPlaying(false); setControlsVisible(true); }}
                  onEnded={() => { setIsPlaying(false); setControlsVisible(true); }}
                  onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                  onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                  onClick={togglePlay}
                />

                {showIntro && (
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-black/20 via-black/40 to-black/70 px-6 text-center"
                  >
                    <h3 className="max-w-xs text-xl font-bold leading-snug text-white">
                      Manage resources,<br />track costs,<br />
                      <span className="text-lg text-white/70">deliver results.</span>
                    </h3>
                    <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-primary shadow-lg transition-transform hover:scale-105">
                      <Play className="ml-1 h-7 w-7" fill="currentColor" />
                    </span>
                  </button>
                )}

                {showResumeHint && (
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="absolute inset-0 z-10 flex items-center justify-center bg-black/20"
                  >
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-primary shadow-lg transition-transform hover:scale-105">
                      <Play className="ml-1 h-6 w-6" fill="currentColor" />
                    </span>
                  </button>
                )}

                {/* Custom control bar — deliberately not the browser's native `controls`, to match
                    the reference design's own bottom bar (seek, play/pause, volume, speed,
                    fullscreen). */}
                {!isLoading && (
                  <div
                    className={cn(
                      'absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1.5 bg-gradient-to-t from-black/85 to-transparent px-4 pb-3 pt-8 transition-opacity duration-200',
                      controlsVisible ? 'opacity-100' : 'opacity-0'
                    )}
                  >
                    <input
                      type="range"
                      min={0}
                      max={duration || 0}
                      step={0.1}
                      value={Math.min(currentTime, duration || 0)}
                      onChange={handleSeek}
                      disabled={!duration}
                      aria-label="Seek"
                      className={cn(
                        'h-1 w-full cursor-pointer appearance-none rounded-full bg-white/25 accent-white disabled:cursor-default',
                        '[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none',
                        '[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow',
                        '[&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white'
                      )}
                    />
                    <div className="flex items-center gap-3 text-white">
                      <button type="button" onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'}>
                        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </button>
                      <button type="button" onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
                        {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                      </button>
                      <span className="text-xs tabular-nums text-white/80">
                        {formatTime(currentTime)} / {formatTime(duration)}
                      </span>
                      <div className="ml-auto flex items-center gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              title="Playback speed"
                              className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white/10"
                            >
                              <Settings className="h-4 w-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="min-w-24">
                            {PLAYBACK_SPEEDS.map((rate) => (
                              <DropdownMenuItem
                                key={rate}
                                onSelect={() => handleSpeedChange(rate)}
                                className="justify-between text-xs"
                              >
                                {rate}x
                                {playbackRate === rate && <Check className="h-3.5 w-3.5" />}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                        <button
                          type="button"
                          onClick={toggleFullscreen}
                          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                          className="flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white/10"
                        >
                          {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DemoVideoModal;
