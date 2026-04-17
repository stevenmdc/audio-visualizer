"use client";

import { motion } from "framer-motion";
import { Pause, Play, SkipBack, SkipForward, Upload } from "lucide-react";
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

const BAR_COUNT = 32;
const IDLE_LEVEL = 0.06;
const TIMELINE_DEFAULT_WINDOW_SECONDS = 42;

const idleBars = () => Array.from({ length: BAR_COUNT }, () => IDLE_LEVEL);

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
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const playingRef = useRef(false);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bars, setBars] = useState<number[]>(idleBars);
  const [showBottomHalf, setShowBottomHalf] = useState(false);

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

      const bucketSize = Math.max(1, Math.floor(frequencyData.length / BAR_COUNT));
      const nextBars = new Array<number>(BAR_COUNT);
      const audio = audioRef.current;

      for (let i = 0; i < BAR_COUNT; i += 1) {
        const start = i * bucketSize;
        const end = i === BAR_COUNT - 1 ? frequencyData.length : start + bucketSize;
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
        return previous.map((value, index) => {
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
  }, [stopVisualizerLoop]);

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
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [revokeObjectUrls, stopVisualizerLoop]);

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
    setBars(idleBars());
    setTracks(nextTracks);
    setCurrentIndex(0);

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

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#05070d] px-4 py-10">
      <motion.div
        className="pointer-events-none absolute -inset-20 bg-[radial-gradient(circle_at_30%_20%,rgba(20,184,166,0.14),transparent_45%),radial-gradient(circle_at_70%_80%,rgba(56,189,248,0.09),transparent_40%)]"
        animate={{
          opacity: [0.45, 0.62, 0.45],
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
          opacity: [0.2, 0.35, 0.2],
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

      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative w-full max-w-5xl"
      >
        <p className="mb-5 text-center text-xs uppercase tracking-[0.28em] text-zinc-400">
          audio visualiser
        </p>

        <div className="group relative h-[52vh] min-h-[320px] w-full overflow-hidden rounded-3xl border border-white/10 bg-[#0a1a23] p-4 shadow-[0_0_56px_rgba(45,212,191,0.08)]">

          {timelineTicks.length > 0 && (
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

          <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-px -translate-y-1/2 bg-white/25" />

          <div className="pointer-events-none absolute inset-y-10 left-1/2 z-30 w-px ml-0.5 -translate-x-1/2 bg-white/95 shadow-[0_0_14px_rgba(255,255,255,0.26)]">
            <div className="absolute -top-3 left-1/2 h-0 w-0 -translate-x-1/2 border-l-[7px] border-r-[7px] border-t-[10px] border-l-transparent border-r-transparent border-t-white" />
          </div>

          <div
            className={
              showBottomHalf
                ? "pointer-events-none absolute left-1/2 top-20 bottom-20 z-20 flex items-center gap-1 pl-1.5 sm:top-24 sm:bottom-24 sm:gap-1.5"
                : "pointer-events-none absolute left-1/2 top-20 bottom-1/2 z-20 flex items-end gap-1 pl-1.5 sm:top-24 sm:gap-1.5"
            }
          >
            {bars.map((value, index) => (
              <motion.div
                key={`right-${index}`}
                animate={{ height: `${Math.max(4, Math.round(value * 86))}%` }}
                transition={{ duration: 0.08, ease: "easeOut" }}
                className="w-1 min-w-[4px] rounded-full bg-gradient-to-t from-teal-400/90 to-cyan-200/95 shadow-[0_0_12px_rgba(45,212,191,0.4)] sm:w-1.5"
              />
            ))}
          </div>

          <div
            className={
              showBottomHalf
                ? "pointer-events-none absolute right-1/2 top-20 bottom-20 z-20 flex flex-row-reverse items-center gap-1 pr-[2px] sm:top-24 sm:bottom-24 sm:gap-1.5"
                : "pointer-events-none absolute right-1/2 top-20 bottom-1/2 z-20 flex flex-row-reverse items-end gap-1 pr-[2px] sm:top-24 sm:gap-1.5"
            }
          >
            {bars.map((value, index) => (
              <motion.div
                key={`left-${index}`}
                animate={{ height: `${Math.max(4, Math.round(value * 86))}%` }}
                transition={{ duration: 0.08, ease: "easeOut" }}
                className="w-1 min-w-[4px] rounded-full bg-gradient-to-t from-teal-400/90 to-cyan-200/95 shadow-[0_0_12px_rgba(45,212,191,0.4)] sm:w-1.5"
              />
            ))}
          </div>

          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => setShowBottomHalf((previous) => !previous)}
            aria-label={showBottomHalf ? "Masquer la partie basse des barres" : "Afficher la partie basse des barres"}
            className="absolute right-3 top-1/2 z-40 -translate-y-1/2 rounded-full border border-white/20 bg-white/6 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-300 opacity-0 transition hover:bg-white/12 hover:text-zinc-100 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 sm:right-4"
          >
            {showBottomHalf ? "hide" : "show"}
          </motion.button>

          {tracks.length === 0 && (
            <div className="absolute inset-0 z-40 flex items-center justify-center">
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => fileInputRef.current?.click()}
                aria-label="Importer une piste audio"
                className="inline-flex items-center gap-3 rounded-full border border-cyan-300/70 bg-cyan-300/18 px-6 py-3 text-sm font-medium uppercase tracking-[0.16em] text-cyan-100 shadow-[0_0_34px_rgba(34,211,238,0.35)] transition hover:bg-cyan-300/28 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
              >
                <Upload size={18} />
                Upload Audio
              </motion.button>
            </div>
          )}
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
      </motion.section>
    </main>
  );
}
