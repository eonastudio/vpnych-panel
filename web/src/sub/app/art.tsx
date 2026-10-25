// The Mini App's pictures: glass teal objects, drawn in SVG, and the splash's clouds.

export function RubleTags({ className }: { className?: string }) {
  const tag = (y: number, rot: number, o: number) => (
    <g transform={`translate(0 ${y}) rotate(${rot} 100 80)`} opacity={o}>
      <path d="M40 30h110l30 30v50a14 14 0 0 1-14 14H40a14 14 0 0 1-14-14V44a14 14 0 0 1 14-14z" fill="url(#vtTagBody)" stroke="url(#vtTagEdge)" strokeWidth="3" />
      <path d="M26 86h154v24a14 14 0 0 1-14 14H40a14 14 0 0 1-14-14z" fill="url(#vtTagLiquid)" opacity=".9" />
      <circle cx="160" cy="52" r="7" fill="none" stroke="#c9fff5" strokeWidth="3" opacity=".8" />
    </g>
  );
  return (
    <svg className={className} viewBox="0 0 220 220" aria-hidden>
      <defs>
        <linearGradient id="vtTagBody" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#bff7ec" stopOpacity=".9" />
          <stop offset=".5" stopColor="#3cc7b1" stopOpacity=".55" />
          <stop offset="1" stopColor="#0f6f63" stopOpacity=".9" />
        </linearGradient>
        <linearGradient id="vtTagLiquid" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2fd0b6" />
          <stop offset="1" stopColor="#0d7466" />
        </linearGradient>
        <linearGradient id="vtTagEdge" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".9" />
          <stop offset="1" stopColor="#2fb9a4" stopOpacity=".4" />
        </linearGradient>
      </defs>
      {tag(70, -22, 0.55)}
      {tag(40, -22, 0.8)}
      {tag(0, -22, 1)}
      <g transform="rotate(-22 100 80)">
        <text x="98" y="104" textAnchor="middle" fontSize="74" fontWeight="900" fontStyle="italic" fill="#eafffb" stroke="#0f7d6f" strokeWidth="2">
          %
        </text>
      </g>
    </svg>
  );
}

export function PaperPlane({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 220 200" aria-hidden>
      <defs>
        <linearGradient id="vtPl1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#bde9e1" />
        </linearGradient>
        <linearGradient id="vtPl2" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7fe3d1" />
          <stop offset="1" stopColor="#11796b" />
        </linearGradient>
        <linearGradient id="vtPl3" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9f6f1" />
          <stop offset="1" stopColor="#5bc3b2" />
        </linearGradient>
      </defs>
      <path d="M200 10 10 110l60 20z" fill="url(#vtPl1)" />
      <path d="M200 10 70 130l10 60z" fill="url(#vtPl2)" />
      <path d="M200 10 80 190l40-50z" fill="url(#vtPl3)" opacity=".9" />
      <path d="M200 10 120 140l50 30z" fill="url(#vtPl1)" opacity=".95" />
    </svg>
  );
}

export function Clouds() {
  return (
    <div className="clouds" aria-hidden>
      {Array.from({ length: 14 }, (_, i) => (
        <span key={i} className={`cloud c${i}`} />
      ))}
    </div>
  );
}
