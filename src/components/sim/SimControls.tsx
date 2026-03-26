"use client";

interface SimControlsProps {
  running: boolean;
  speed: number;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onSpeedChange: (speed: number) => void;
}

const SPEEDS = [
  { label: "Slow",   value: 1 },
  { label: "Normal", value: 5 },
  { label: "Fast",   value: 20 },
];

export default function SimControls({
  running, speed, onStart, onPause, onReset, onSpeedChange,
}: SimControlsProps) {
  return (
    <div className="bg-surface border border-border rounded-lg px-5 py-3 flex items-center gap-4 flex-wrap">
      <div className="flex items-center gap-2">
        {running ? (
          <button
            onClick={onPause}
            className="bg-transparent border border-accent text-accent px-4 py-1.5 rounded text-xs tracking-widest uppercase cursor-pointer hover:bg-accent hover:text-black transition-colors font-semibold"
          >
            ⏸ Pause
          </button>
        ) : (
          <button
            onClick={onStart}
            className="bg-accent text-black border-none px-4 py-1.5 rounded text-xs tracking-widest uppercase cursor-pointer font-bold"
          >
            ▶ Start
          </button>
        )}
        <button
          onClick={onReset}
          className="bg-transparent border border-border text-slate-400 px-4 py-1.5 rounded text-xs tracking-widest uppercase cursor-pointer hover:border-slate-500 hover:text-slate-200 transition-colors"
        >
          ↺ Reset
        </button>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-400">
        <span className="tracking-widest uppercase">Speed</span>
        {SPEEDS.map((s) => (
          <button
            key={s.value}
            onClick={() => onSpeedChange(s.value)}
            className={[
              "px-3 py-1 rounded border text-xs cursor-pointer transition-colors bg-transparent",
              speed === s.value
                ? "border-accent text-accent"
                : "border-border text-slate-500 hover:border-slate-500",
            ].join(" ")}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <span className={["w-2 h-2 rounded-full", running ? "bg-status-green animate-pulse" : "bg-slate-600"].join(" ")} />
        <span className="text-xs text-slate-500">{running ? "Running" : "Paused"}</span>
      </div>
    </div>
  );
}
