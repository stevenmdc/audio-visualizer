"use client";

import { X } from "lucide-react";

type VideoFitMode = "cover" | "contain";
type AccentMode = "cyan" | "orange";

type ModalSettingsProps = {
  isOpen: boolean;
  accentMode: AccentMode;
  videoOpacity: number;
  overlayOpacity: number;
  videoFitMode: VideoFitMode;
  videoScale: number;
  visualizerBarCount: number;
  barWidth: number;
  visualizerWidth: number;
  onClose: () => void;
  onSetVideoOpacity: (value: number) => void;
  onSetOverlayOpacity: (value: number) => void;
  onSetVideoFitMode: (value: VideoFitMode) => void;
  onSetVideoScale: (value: number) => void;
  onUpdateBarCount: (value: number) => void;
  onSetBarWidth: (value: number) => void;
  onSetVisualizerWidth: (value: number) => void;
  onSetAccentMode: (value: AccentMode) => void;
  percentMin: number;
  percentMax: number;
  videoScaleMin: number;
  videoScaleMax: number;
  barsMin: number;
  barsMax: number;
  barWidthMin: number;
  barWidthMax: number;
  visualizerWidthMin: number;
  visualizerWidthMax: number;
};

export default function ModalSettings({
  isOpen,
  accentMode,
  videoOpacity,
  overlayOpacity,
  videoFitMode,
  videoScale,
  visualizerBarCount,
  barWidth,
  visualizerWidth,
  onClose,
  onSetVideoOpacity,
  onSetOverlayOpacity,
  onSetVideoFitMode,
  onSetVideoScale,
  onUpdateBarCount,
  onSetBarWidth,
  onSetVisualizerWidth,
  onSetAccentMode,
  percentMin,
  percentMax,
  videoScaleMin,
  videoScaleMax,
  barsMin,
  barsMax,
  barWidthMin,
  barWidthMax,
  visualizerWidthMin,
  visualizerWidthMax,
}: ModalSettingsProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 px-4">
      <div
        className={`w-full max-w-xl rounded-2xl bg-neutral-700/10 p-8 backdrop-blur-md shadow-[0_20px_80px_rgba(0,0,0,0.45)] ${accentMode === "cyan" ? "border border-cyan-300/20" : "border border-orange-300/20"}`}
      >
        <div className="mb-5 flex items-center justify-between">
          <p
            className={`text-sm font-semibold uppercase tracking-[0.14em] ${accentMode === "cyan" ? "text-cyan-100" : "text-orange-100"}`}
          >
            Settings
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className={`inline-flex size-8 items-center justify-center rounded-full ${accentMode === "cyan" ? "border border-cyan-300/30 text-cyan-100 hover:bg-cyan-300/12" : "border border-orange-300/30 text-orange-100 hover:bg-orange-300/12"}`}
          >
            <X size={14} />
          </button>
        </div>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-[130px_1fr] items-center gap-4">
            <p className="text-xs uppercase tracking-[0.12em] text-zinc-300">Video Opacity {videoOpacity}%</p>
            <input type="range" min={percentMin} max={percentMax} step={1} value={videoOpacity} onChange={(event) => onSetVideoOpacity(Number(event.target.value))} className="zoom-slider w-full" style={{ accentColor: accentMode === "cyan" ? "#67e8f9" : "#fdba74" }} />
          </div>
          <div className="grid grid-cols-[130px_1fr] items-center gap-4">
            <p className="text-xs uppercase tracking-[0.12em] text-zinc-300">Overlay {overlayOpacity}%</p>
            <input type="range" min={percentMin} max={percentMax} step={1} value={overlayOpacity} onChange={(event) => onSetOverlayOpacity(Number(event.target.value))} className="zoom-slider w-full" style={{ accentColor: accentMode === "cyan" ? "#67e8f9" : "#fdba74" }} />
          </div>
          <div className="grid grid-cols-[130px_1fr] items-center gap-4">
            <p className="text-xs uppercase tracking-[0.12em] text-zinc-300">Video Fit</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onSetVideoFitMode("cover")}
                className={
                  videoFitMode === "cover"
                    ? accentMode === "cyan"
                      ? "rounded-md border border-cyan-300/70 bg-cyan-300/22 px-3 py-2 text-xs uppercase tracking-[0.1em] text-cyan-100"
                      : "rounded-md border border-orange-300/70 bg-orange-300/22 px-3 py-2 text-xs uppercase tracking-[0.1em] text-orange-100"
                    : "rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs uppercase tracking-[0.1em] text-zinc-300"
                }
              >
                Cover
              </button>
              <button
                type="button"
                onClick={() => onSetVideoFitMode("contain")}
                className={
                  videoFitMode === "contain"
                    ? accentMode === "cyan"
                      ? "rounded-md border border-cyan-300/70 bg-cyan-300/22 px-3 py-2 text-xs uppercase tracking-[0.1em] text-cyan-100"
                      : "rounded-md border border-orange-300/70 bg-orange-300/22 px-3 py-2 text-xs uppercase tracking-[0.1em] text-orange-100"
                    : "rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs uppercase tracking-[0.1em] text-zinc-300"
                }
              >
                Contain
              </button>
            </div>
          </div>
          <div className="grid grid-cols-[130px_1fr] items-center gap-4">
            <p className="text-xs uppercase tracking-[0.12em] text-zinc-300">Video Scale {videoScale}%</p>
            <input type="range" min={videoScaleMin} max={videoScaleMax} step={1} value={videoScale} onChange={(event) => onSetVideoScale(Number(event.target.value))} className="zoom-slider w-full" style={{ accentColor: accentMode === "cyan" ? "#67e8f9" : "#fdba74" }} />
          </div>
          <div className="grid grid-cols-[130px_1fr] items-center gap-4">
            <p className="text-xs uppercase tracking-[0.12em] text-zinc-300">Bars Count {visualizerBarCount}</p>
            <input type="range" min={barsMin} max={barsMax} step={1} value={visualizerBarCount} onChange={(event) => onUpdateBarCount(Number(event.target.value))} className="zoom-slider w-full" style={{ accentColor: accentMode === "cyan" ? "#67e8f9" : "#fdba74" }} />
          </div>
          <div className="grid grid-cols-[130px_1fr] items-center gap-4">
            <p className="text-xs uppercase tracking-[0.12em] text-zinc-300">Bars Width {barWidth}px</p>
            <input type="range" min={barWidthMin} max={barWidthMax} step={1} value={barWidth} onChange={(event) => onSetBarWidth(Number(event.target.value))} className="zoom-slider w-full" style={{ accentColor: accentMode === "cyan" ? "#67e8f9" : "#fdba74" }} />
          </div>
          <div className="grid grid-cols-[130px_1fr] items-center gap-4">
            <p className="text-xs uppercase tracking-[0.12em] text-zinc-300">Vis Width {visualizerWidth}%</p>
            <input type="range" min={visualizerWidthMin} max={visualizerWidthMax} step={1} value={visualizerWidth} onChange={(event) => onSetVisualizerWidth(Number(event.target.value))} className="zoom-slider w-full" style={{ accentColor: accentMode === "cyan" ? "#67e8f9" : "#fdba74" }} />
          </div>
          <div className="grid grid-cols-[130px_1fr] items-center gap-4">
            <p className="text-xs uppercase tracking-[0.12em] text-zinc-300">Accent Theme</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onSetAccentMode("cyan")}
                className={
                  accentMode === "cyan"
                    ? "rounded-md border border-cyan-300/70 bg-cyan-300/22 px-3 py-2 text-xs uppercase tracking-[0.1em] text-cyan-100"
                    : "rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs uppercase tracking-[0.1em] text-zinc-300"
                }
              >
                Blue-Green
              </button>
              <button
                type="button"
                onClick={() => onSetAccentMode("orange")}
                className={
                  accentMode === "orange"
                    ? "rounded-md border border-orange-300/70 bg-orange-300/22 px-3 py-2 text-xs uppercase tracking-[0.1em] text-orange-100"
                    : "rounded-md border border-zinc-600 bg-zinc-900 px-3 py-2 text-xs uppercase tracking-[0.1em] text-zinc-300"
                }
              >
                Orange
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
