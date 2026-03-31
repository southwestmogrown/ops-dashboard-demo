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
      <label className="flex items-center gap-3 mb-2 cursor-pointer group select-none">
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
              "flex h-5 w-5 items-center justify-center rounded-sm border-2 transition-all duration-150",
              checked
                ? "border-accent bg-accent shadow-[0_0_0_1px_rgba(249,115,22,0.25)]"
                : "border-[#748095] bg-surface-highest group-hover:border-accent/70",
            ].join(" ")}
          >
            {checked && (
              <span className="material-symbols-outlined text-[13px] leading-none text-black">
                check
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#d5dbe6] tracking-widest uppercase font-bold">
            {label}
          </span>
          <span className={[
            "rounded-sm border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em]",
            checked
              ? "border-accent/45 bg-accent/12 text-[#ffd6b8]"
              : "border-border bg-surface text-[#aeb8c8]",
          ].join(" ")}>
            {checked ? "Checked" : "Off"}
          </span>
        </div>
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
