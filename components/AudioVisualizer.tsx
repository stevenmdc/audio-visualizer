"use client";

import { motion } from "framer-motion";
import {
  Cog,
  Eye,
  EyeOff,
  FastForward,
  Pause,
  Play,
  Rewind,
  SkipBack,
  SkipForward,
  Upload,
  Video,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

type Track = {
  id: string;
  title: string;
  url: string;
};

const DEFAULT_BAR_COUNT = 14;
const IDLE_LEVEL = 0.06;
const TIMELINE_DEFAULT_WINDOW_SECONDS = 42;
const SEEK_STEP_SECONDS = 10;
const ZOOM_MIN = 75;
const ZOOM_MAX = 125;
const ZOOM_DEFAULT = 100;
const PERCENT_MIN = 0;
const PERCENT_MAX = 100;
const BARS_MIN = 8;
const BARS_MAX = 96;
const BAR_WIDTH_MIN = 2;
const BAR_WIDTH_MAX = 10;
const BAR_WIDTH_DEFAULT = 8;
const VIDEO_SCALE_MIN = 70;
const VIDEO_SCALE_MAX = 130;
const VIDEO_SCALE_DEFAULT = 100;

type VideoFitMode = "cover" | "contain";

const idleBars = (count: number) => Array.from({ length: count }, () => IDLE_LEVEL);

const formatTimelineTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return "00:00,00";
  }

  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  const centiseconds = Math.floor((seconds - total) * 100);

  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(
    centiseconds,
  ).padStart(2, "0")}`;
};

export default function AudioVisualizer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const bgVideoUrlRef = useRef<string | null>(null);
  const playingRef = useRef(false);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [visualizerBarCount, setVisualizerBarCount] = useState(DEFAULT_BAR_COUNT);
  const [bars, setBars] = useState<number[]>(() => idleBars(DEFAULT_BAR_COUNT));
  const [showTimeline, setShowTimeline] = useState(true);
  const [bgVideoUrl, setBgVideoUrl] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(ZOOM_DEFAULT);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [videoOpacity, setVideoOpacity] = useState(100);
  const [overlayOpacity, setOverlayOpacity] = useState(0);
  const [videoFitMode, setVideoFitMode] = useState<VideoFitMode>("cover");
  const [videoScale, setVideoScale] = useState(VIDEO_SCALE_DEFAULT);
  const [barWidth, setBarWidth] = useState(BAR_WIDTH_DEFAULT);

  const currentTrack = tracks[currentIndex] ?? null;

  const timelineTicks = useMemo(() => {
    if (duration <= 0) return [];

    const visibleWindow = duration < TIMELINE_DEFAULT_WINDOW_SECONDS ? duration : TIMELINE_DEFAULT_WINDOW_SECONDS;
    const halfWindow = visibleWindow / 2;
    const step = visibleWindow / 7;

    const startTime = currentTime - halfWindow;
    const endTime = currentTime + halfWindow;
    const firstTick = Math.floor(startTime / step) * step;

    const ticks: Array<{ left: number; time: number }> = [];
    for (let time = firstTick; time <= endTime + step; time += step) {
      if (time < 0 || time > duration) continue;
      const left = 50 + ((time - currentTime) / halfWindow) * 50;
      if (left < -5 || left > 105) continue;
      ticks.push({ left, time });
    }

    return ticks;
  }, [currentTime, duration]);

  const revokeObjectUrls = useCallback(() => {
    for (const url of objectUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    objectUrlsRef.current = [];
  }, []);

  const revokeBgVideoUrl = useCallback(() => {
    if (!bgVideoUrlRef.current) return;
    URL.revokeObjectURL(bgVideoUrlRef.current);
    bgVideoUrlRef.current = null;
  }, []);

  const stopVisualizerLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startVisualizerLoop = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const frequencyData = new Uint8Array(analyser.frequencyBinCount);

    const loop = () => {
      analyser.getByteFrequencyData(frequencyData);

      const bucketSize = Math.max(1, Math.floor(frequencyData.length / visualizerBarCount));
      const nextBars = new Array<number>(visualizerBarCount);
      const audio = audioRef.current;

      for (let i = 0; i < visualizerBarCount; i += 1) {
        const start = i * bucketSize;
        const end = i === visualizerBarCount - 1 ? frequencyData.length : start + bucketSize;
        let sum = 0;

        for (let j = start; j < end; j += 1) {
          sum += frequencyData[j] ?? 0;
        }

        const average = sum / Math.max(1, end - start);
        const normalized = average / 255;
        const shaped = Math.pow(normalized, 1.4);
        nextBars[i] = IDLE_LEVEL + shaped * 0.94;
      }

      setBars((previous) => {
        const smoothing = playingRef.current ? 0.4 : 0.12;
        return nextBars.map((_, index) => {
          const value = previous[index] ?? IDLE_LEVEL;
          const target = playingRef.current ? (nextBars[index] ?? IDLE_LEVEL) : IDLE_LEVEL;
          return value + (target - value) * smoothing;
        });
      });

      if (audio && playingRef.current) {
        setCurrentTime(audio.currentTime);
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    stopVisualizerLoop();
    rafRef.current = requestAnimationFrame(loop);
  }, [stopVisualizerLoop, visualizerBarCount]);

  const ensureAudioGraph = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!audioContextRef.current) {
      const context = new AudioContext();
      const analyser = context.createAnalyser();

      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.85;

      const source = context.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(context.destination);

      audioContextRef.current = context;
      analyserRef.current = analyser;

      startVisualizerLoop();
    }

    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }
  }, [startVisualizerLoop]);

  useEffect(() => {
    return () => {
      stopVisualizerLoop();
      revokeObjectUrls();
      revokeBgVideoUrl();
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [revokeBgVideoUrl, revokeObjectUrls, stopVisualizerLoop]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!currentTrack) {
      audio.removeAttribute("src");
      audio.load();
      return;
    }

    audio.src = currentTrack.url;
    audio.load();

    if (playingRef.current) {
      void ensureAudioGraph().then(() => {
        void audio.play().catch(() => {
          playingRef.current = false;
          setIsPlaying(false);
        });
      });
    }
  }, [currentTrack, ensureAudioGraph]);

  const handleUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    revokeObjectUrls();

    const nextTracks = Array.from(files).map((file, index) => {
      const cleanedTitle = file.name.replace(/\.[^/.]+$/, "");
      return {
        id: `${file.name}-${file.lastModified}-${index}`,
        title: cleanedTitle || file.name,
        url: URL.createObjectURL(file),
      };
    });

    objectUrlsRef.current = nextTracks.map((track) => track.url);

    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    playingRef.current = false;
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setBars(idleBars(visualizerBarCount));
    setTracks(nextTracks);
    setCurrentIndex(0);

    event.target.value = "";
  };

  const handleBackgroundVideoUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    revokeBgVideoUrl();

    const nextUrl = URL.createObjectURL(file);
    bgVideoUrlRef.current = nextUrl;
    setBgVideoUrl(nextUrl);
    setVideoFitMode("cover");
    setVideoScale(VIDEO_SCALE_DEFAULT);

    event.target.value = "";
  };

  const goToPrevious = useCallback(() => {
    if (tracks.length === 0) return;
    setCurrentIndex((previous) => (previous - 1 + tracks.length) % tracks.length);
  }, [tracks.length]);

  const goToNext = useCallback(() => {
    if (tracks.length === 0) return;
    setCurrentIndex((previous) => (previous + 1) % tracks.length);
  }, [tracks.length]);

  const seekBy = useCallback((deltaSeconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration)) return;

    const nextTime = Math.min(Math.max(0, audio.currentTime + deltaSeconds), audio.duration);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }, []);

  const togglePlayPause = useCallback(async () => {
    if (!currentTrack) {
      fileInputRef.current?.click();
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    await ensureAudioGraph();

    if (audio.paused) {
      await audio.play().catch(() => undefined);
      return;
    }

    audio.pause();
  }, [currentTrack, ensureAudioGraph]);

  const updateZoom = useCallback((nextValue: number) => {
    const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nextValue));
    setZoomLevel(clamped);
  }, []);

  const updateBarCount = useCallback((nextCount: number) => {
    const clamped = Math.max(BARS_MIN, Math.min(BARS_MAX, nextCount));
    setVisualizerBarCount(clamped);
    setBars((previous) => Array.from({ length: clamped }, (_, index) => previous[index] ?? IDLE_LEVEL));
  }, []);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#05070d] px-4 py-10">
      <motion.div
        className="pointer-events-none absolute -inset-20 bg-[radial-gradient(circle_at_30%_20%,rgba(20,184,166,0.14),transparent_45%),radial-gradient(circle_at_70%_80%,rgba(56,189,248,0.09),transparent_40%)]"
        animate={{
          opacity: [(0.45 * overlayOpacity) / 100, (0.62 * overlayOpacity) / 100, (0.45 * overlayOpacity) / 100],
          scale: [1, 1.035, 1],
          x: [0, 10, 0],
          y: [0, -8, 0],
        }}
        transition={{
          duration: 14,
          repeat: Number.POSITIVE_INFINITY,
          ease: "easeInOut",
        }}
      />
      <motion.div
        className="pointer-events-none absolute -inset-24 bg-[radial-gradient(circle_at_65%_25%,rgba(34,197,94,0.08),transparent_46%)]"
        animate={{
          opacity: [(0.2 * overlayOpacity) / 100, (0.35 * overlayOpacity) / 100, (0.2 * overlayOpacity) / 100],
          scale: [1, 1.05, 1],
          x: [0, -14, 0],
          y: [0, 10, 0],
        }}
        transition={{
          duration: 18,
          repeat: Number.POSITIVE_INFINITY,
          ease: "easeInOut",
        }}
      />

      <div
        className="relative w-full max-w-5xl"
        style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: "center center" }}
      >
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="relative w-full"
        >
          <p className="mb-5 text-center text-xs uppercase tracking-[0.28em] text-zinc-400">
            audio visualiser
          </p>

        <div className="group relative h-[52vh] min-h-[320px] w-full overflow-hidden rounded-3xl border border-white/10 bg-[#0a1a23] p-4 shadow-[0_0_56px_rgba(45,212,191,0.08)]">
          {bgVideoUrl && (
            <video
              key={bgVideoUrl}
              src={bgVideoUrl}
              className="pointer-events-none absolute inset-0 h-full w-full object-cover"
              style={{
                opacity: videoOpacity / 100,
                objectFit: videoFitMode,
                transform: `scale(${videoScale / 100})`,
              }}
              autoPlay
              loop
              muted
              playsInline
            />
          )}

          {showTimeline && timelineTicks.length > 0 && (
            <div className="pointer-events-none absolute inset-x-4 top-4 z-20 h-10 sm:inset-x-8">
              {timelineTicks.map((tick) => (
                <div
                  key={tick.time}
                  className="absolute -translate-x-1/2 text-zinc-400"
                  style={{ left: `${tick.left}%` }}
                >
                  <span className="block text-[11px] tracking-[0.08em]">{formatTimelineTime(tick.time)}</span>
                  <span className="mx-auto mt-1 block h-2 w-px bg-zinc-300/75" />
                </div>
              ))}
            </div>
          )}

          {showTimeline && (
            <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-px -translate-y-1/2 bg-white/25" />
          )}

          {showTimeline && (
            <div className="pointer-events-none absolute inset-y-[70px] left-1/2 z-30 w-px -translate-x-1/2 bg-white/80 shadow-[0_0_14px_rgba(255,255,255,0.26)]">
              <div className="absolute -top-6 left-1/2 h-3 w-3.5 -translate-x-1/2 bg-white/80" />
              <div className="absolute -top-3 left-1/2 h-0 w-0 -translate-x-1/2 border-l-[7px] border-r-[7px] border-t-[10px] border-l-transparent border-r-transparent border-t-white/80" />
            </div>
          )}

          <div className="pointer-events-none absolute left-1/2 top-20 bottom-20 z-20 flex items-center gap-1 pl-[2px] sm:top-24 sm:bottom-24 sm:gap-1.5">
            {bars.map((value, index) => (
              <motion.div
                key={`right-${index}`}
                animate={{ height: `${Math.max(4, Math.round(value * 86))}%` }}
                transition={{ duration: 0.08, ease: "easeOut" }}
                className="rounded-full bg-gradient-to-t from-teal-400/90 to-cyan-200/95 shadow-[0_0_12px_rgba(45,212,191,0.4)]"
                style={{ width: `${barWidth}px`, minWidth: `${barWidth}px` }}
              />
            ))}
          </div>

          <div className="pointer-events-none absolute right-1/2 top-20 bottom-20 z-20 flex flex-row-reverse items-center gap-1 pr-[2px] sm:top-24 sm:bottom-24 sm:gap-1.5">
            {bars.map((value, index) => (
              <motion.div
                key={`left-${index}`}
                animate={{ height: `${Math.max(4, Math.round(value * 86))}%` }}
                transition={{ duration: 0.08, ease: "easeOut" }}
                className="rounded-full bg-gradient-to-t from-teal-400/90 to-cyan-200/95 shadow-[0_0_12px_rgba(45,212,191,0.4)]"
                style={{ width: `${barWidth}px`, minWidth: `${barWidth}px` }}
              />
            ))}
          </div>

          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => setShowTimeline((previous) => !previous)}
            aria-label={showTimeline ? "Masquer la piste déroulante" : "Afficher la piste déroulante"}
            className="absolute right-3 top-[calc(50%-20px)] z-40 -translate-y-1/2 rounded-full border border-white/20 bg-white/6 p-2 text-zinc-300 opacity-0 transition hover:bg-white/12 hover:text-zinc-100 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 sm:right-4"
          >
            {showTimeline ? <EyeOff size={14} /> : <Eye size={14} />}
          </motion.button>

          {tracks.length === 0 && (
            <div className="absolute inset-x-0 bottom-[16%] z-50 flex justify-center">
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => fileInputRef.current?.click()}
                aria-label="Importer des pistes audio"
                className="inline-flex items-center gap-2 rounded-full border border-cyan-300/70 bg-cyan-300/16 px-5 py-2.5 text-xs font-medium uppercase tracking-[0.16em] text-cyan-100 shadow-[0_0_30px_rgba(34,211,238,0.28)] backdrop-blur-md transition hover:bg-cyan-300/26 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
              >
                <Upload size={16} />
                Upload Audio
              </motion.button>
            </div>
          )}

          <div className="absolute right-4 bottom-4 z-50 flex gap-2">
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => videoInputRef.current?.click()}
              aria-label="Uploader une vidéo de fond"
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/35 px-3 py-2 text-[11px] uppercase tracking-[0.12em] text-zinc-100 backdrop-blur-sm transition hover:bg-black/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
            >
              <Video size={14} />
              BG Video
            </motion.button>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-center gap-3 sm:gap-4">
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={goToPrevious}
            disabled={tracks.length === 0}
            aria-label="Piste précédente"
            className="inline-flex size-12 items-center justify-center rounded-full border border-white/20 bg-white/[0.06] text-zinc-100 transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          >
            <SkipBack size={20} />
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={() => seekBy(-SEEK_STEP_SECONDS)}
            disabled={tracks.length === 0}
            aria-label="Reculer de 10 secondes"
            className="inline-flex size-12 items-center justify-center rounded-full border border-white/20 bg-white/[0.06] text-zinc-100 transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          >
            <Rewind size={18} />
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.92 }}
            onClick={() => void togglePlayPause()}
            disabled={tracks.length === 0}
            aria-label={isPlaying ? "Pause" : "Lecture"}
            className="inline-flex size-20 items-center justify-center rounded-full border border-cyan-300/70 bg-cyan-300/20 text-cyan-100 shadow-[0_0_36px_rgba(34,211,238,0.42)] transition hover:bg-cyan-300/30 disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          >
            {isPlaying ? <Pause size={32} /> : <Play size={32} className="translate-x-[1px]" />}
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={() => seekBy(SEEK_STEP_SECONDS)}
            disabled={tracks.length === 0}
            aria-label="Avancer de 10 secondes"
            className="inline-flex size-12 items-center justify-center rounded-full border border-white/20 bg-white/[0.06] text-zinc-100 transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          >
            <FastForward size={18} />
          </motion.button>

          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={goToNext}
            disabled={tracks.length === 0}
            aria-label="Piste suivante"
            className="inline-flex size-12 items-center justify-center rounded-full border border-white/20 bg-white/[0.06] text-zinc-100 transition hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          >
            <SkipForward size={20} />
          </motion.button>
        </div>

        <p className="mt-5 text-center font-mono text-sm tracking-[0.2em] text-cyan-100/90">
          {formatTimelineTime(currentTime)} / {formatTimelineTime(duration)}
        </p>

        <p className="mt-5 text-center text-xs font-medium uppercase tracking-[0.26em] text-zinc-300/85">
          {currentTrack?.title ?? "Sous-titre audio"}
        </p>

        <audio
          ref={audioRef}
          preload="auto"
          className="hidden"
          onLoadedMetadata={(event) => {
            setDuration(event.currentTarget.duration);
          }}
          onTimeUpdate={(event) => {
            setCurrentTime(event.currentTarget.currentTime);
          }}
          onPlay={() => {
            playingRef.current = true;
            setIsPlaying(true);
          }}
          onPause={() => {
            playingRef.current = false;
            setIsPlaying(false);
          }}
          onEnded={() => {
            if (tracks.length > 1) {
              setCurrentIndex((previous) => (previous + 1) % tracks.length);
              return;
            }
            const audio = audioRef.current;
            if (audio) {
              audio.currentTime = 0;
            }
            setCurrentTime(0);
            playingRef.current = false;
            setIsPlaying(false);
          }}
        />

        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          multiple
          className="hidden"
          onChange={handleUpload}
        />

        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleBackgroundVideoUpload}
        />
        </motion.section>
      </div>

      <aside className="fixed right-2 top-1/2 z-50 -translate-y-1/2 sm:right-4">
        <div className="flex w-14 flex-col items-center gap-1 py-2">
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Ouvrir les réglages"
            className="inline-flex size-10 items-center justify-center rounded-full bg-black/35 text-zinc-100 backdrop-blur-sm transition hover:bg-black/45 focus-visible:outline-none"
          >
            <Cog size={15} />
          </motion.button>

          <input
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={1}
            value={zoomLevel}
            onChange={(event) => updateZoom(Number(event.target.value))}
            aria-label="Niveau de zoom"
            className="zoom-slider h-28 w-28 -rotate-90"
          />
        </div>
      </aside>

      {isSettingsOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/15 bg-[#0b1320] p-5 shadow-[0_20px_80px_rgba(0,0,0,0.45)]">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-100">Settings</p>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="rounded-full border border-white/20 px-2 py-1 text-xs text-zinc-200 hover:bg-white/10"
              >
                Close
              </button>
            </div>

            <label className="mb-2 block text-xs uppercase tracking-[0.12em] text-zinc-300">
              Video Opacity: {videoOpacity}%
            </label>
            <input
              type="range"
              min={PERCENT_MIN}
              max={PERCENT_MAX}
              step={1}
              value={videoOpacity}
              onChange={(event) => setVideoOpacity(Number(event.target.value))}
              className="zoom-slider mb-5 w-full"
            />

            <label className="mb-2 block text-xs uppercase tracking-[0.12em] text-zinc-300">
              Overlay Intensity: {overlayOpacity}%
            </label>
            <input
              type="range"
              min={PERCENT_MIN}
              max={PERCENT_MAX}
              step={1}
              value={overlayOpacity}
              onChange={(event) => setOverlayOpacity(Number(event.target.value))}
              className="zoom-slider w-full"
            />

            <p className="mb-2 mt-5 text-xs uppercase tracking-[0.12em] text-zinc-300">Video Fit</p>
            <div className="mb-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setVideoFitMode("cover")}
                className={
                  videoFitMode === "cover"
                    ? "rounded-md border border-zinc-400 bg-zinc-700 px-3 py-2 text-xs uppercase tracking-[0.1em] text-zinc-100"
                    : "rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs uppercase tracking-[0.1em] text-zinc-300"
                }
              >
                Cover
              </button>
              <button
                type="button"
                onClick={() => setVideoFitMode("contain")}
                className={
                  videoFitMode === "contain"
                    ? "rounded-md border border-zinc-400 bg-zinc-700 px-3 py-2 text-xs uppercase tracking-[0.1em] text-zinc-100"
                    : "rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs uppercase tracking-[0.1em] text-zinc-300"
                }
              >
                Contain
              </button>
            </div>

            <label className="mb-2 block text-xs uppercase tracking-[0.12em] text-zinc-300">
              Video Scale: {videoScale}%
            </label>
            <input
              type="range"
              min={VIDEO_SCALE_MIN}
              max={VIDEO_SCALE_MAX}
              step={1}
              value={videoScale}
              onChange={(event) => setVideoScale(Number(event.target.value))}
              className="zoom-slider w-full"
            />

            <label className="mb-2 mt-5 block text-xs uppercase tracking-[0.12em] text-zinc-300">
              Bars Count: {visualizerBarCount}
            </label>
            <input
              type="range"
              min={BARS_MIN}
              max={BARS_MAX}
              step={1}
              value={visualizerBarCount}
              onChange={(event) => updateBarCount(Number(event.target.value))}
              className="zoom-slider w-full"
            />

            <label className="mb-2 mt-5 block text-xs uppercase tracking-[0.12em] text-zinc-300">
              Bars Width: {barWidth}px
            </label>
            <input
              type="range"
              min={BAR_WIDTH_MIN}
              max={BAR_WIDTH_MAX}
              step={1}
              value={barWidth}
              onChange={(event) => setBarWidth(Number(event.target.value))}
              className="zoom-slider w-full"
            />
          </div>
        </div>
      )}
    </main>
  );
}
