"use client";

interface SparklineProps {
  values: number[];
  color: string;
  width?: number;
  height?: number;
}

export function Sparkline({ values, color, width = 80, height = 24 }: SparklineProps) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  // Build closed area path for the gradient fill
  const areaPath = `M 0,${height} L ${points.split(" ").join(" L ")} L ${width},${height} Z`;

  const gradId = `spark-grad-${color.replace("#", "")}-${values.length}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {/* Last-point highlight dot */}
      <circle
        cx={(width).toFixed(2)}
        cy={(height - ((values[values.length - 1] - min) / range) * height).toFixed(2)}
        r="2"
        fill={color}
      />
    </svg>
  );
}
