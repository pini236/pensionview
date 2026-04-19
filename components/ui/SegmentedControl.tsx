"use client";

import { clsx } from "clsx";

interface Segment<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  segments: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ segments, value, onChange }: SegmentedControlProps<T>) {
  return (
    <div className="inline-flex rounded-lg bg-surface p-1">
      {segments.map((seg) => (
        <button
          key={seg.value}
          onClick={() => onChange(seg.value)}
          className={clsx(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer",
            value === seg.value
              ? "bg-cta text-background"
              : "text-text-muted hover:text-text-primary"
          )}
        >
          {seg.label}
        </button>
      ))}
    </div>
  );
}
