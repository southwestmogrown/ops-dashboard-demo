"use client";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

export default function NoteCheckboxField({ label, value, onChange }: Props) {
  const checked = value !== "";

  return (
    <div>
      <label className="flex items-center gap-2 mb-2 cursor-pointer group select-none">
        <div className="relative flex-shrink-0">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => {
              if (!e.target.checked) onChange("");
            }}
            className="sr-only"
          />
          <div
            className={[
              "w-4 h-4 rounded-sm border transition-all duration-150",
              checked
                ? "bg-accent border-accent"
                : "bg-transparent border-border group-hover:border-accent/50",
            ].join(" ")}
          >
            {checked && (
              <span className="material-symbols-outlined text-black text-xs absolute inset-0 flex items-center justify-center leading-none">
                check
              </span>
            )}
          </div>
        </div>
        <span className="text-[10px] text-[#e1e2ec]/40 tracking-widest uppercase font-bold">
          {label}
        </span>
      </label>
      {checked && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Describe briefly..."
          className="w-full bg-surface-highest rounded-sm px-3.5 py-2.5 text-[#e1e2ec] text-sm outline-none font-mono focus:ring-1 focus:ring-accent/40 placeholder:text-[#e1e2ec]/20"
        />
      )}
    </div>
  );
}
