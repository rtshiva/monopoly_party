import type { BoardTheme } from './boardThemes';

/** Shared title badge drawn inside every center scene. */
function Badge({ name, tagline }: { name: string; tagline: string }) {
  const upper = name.toUpperCase();
  return (
    <g>
      <rect x={200 - upper.length * 9.5} y={128} width={upper.length * 19} height={34} rx={6} fill="#c0272d" />
      <text x={200} y={152} textAnchor="middle" fontSize={22} fontWeight={800} fill="#ffffff" fontFamily="Inter, sans-serif">
        {upper}
      </text>
      <rect x={200 - tagline.length * 4.6} y={166} width={tagline.length * 9.2} height={20} rx={4} fill="#1e293b" />
      <text x={200} y={180} textAnchor="middle" fontSize={11} fontWeight={700} fill="#f5c518" fontFamily="Inter, sans-serif">
        {tagline}
      </text>
    </g>
  );
}

function GrandPrix() {
  return (
    <g>
      <ellipse cx={200} cy={150} rx={185} ry={130} fill="#4d7c4d" />
      <ellipse cx={200} cy={150} rx={150} ry={100} fill="#3d6b41" />
      <path d="M60,150 a140,90 0 1,1 280,0 a140,90 0 1,1 -280,0" fill="none" stroke="#23262b" strokeWidth={26} />
      <path d="M60,150 a140,90 0 1,1 280,0 a140,90 0 1,1 -280,0" fill="none" stroke="#f8fafc" strokeWidth={26} strokeDasharray="14 10" opacity={0.85} />
      <path d="M60,150 a140,90 0 1,1 280,0 a140,90 0 1,1 -280,0" fill="none" stroke="#3a3f47" strokeWidth={16} />
      {Array.from({ length: 8 }, (_, i) => (
        <rect key={i} x={186 + (i % 2) * 14} y={52 + Math.floor(i / 2) * 14} width={14} height={14} fill={i % 2 ? '#111827' : '#f8fafc'} />
      ))}
      <rect x={120} y={196} width={70} height={26} rx={3} fill="#94a3b8" />
      <rect x={120} y={188} width={70} height={8} rx={2} fill="#cbd5e1" />
      <rect x={232} y={196} width={48} height={26} rx={3} fill="#b45309" />
      <rect x={232} y={188} width={48} height={8} rx={2} fill="#f59e0b" />
      <rect x={150} y={110} width={26} height={12} rx={3} fill="#eab308" />
      <rect x={238} y={118} width={26} height={12} rx={3} fill="#dc2626" />
    </g>
  );
}

function City() {
  const towers = [30, 58, 86, 300, 328, 356];
  return (
    <g>
      <rect x={0} y={0} width={400} height={300} fill="#bcd3e8" />
      {towers.map((x, i) => (
        <g key={x}>
          <rect x={x} y={150 - (i % 3) * 26} width={24} height={150} fill={i % 2 ? '#475569' : '#334155'} />
          {[0, 1, 2, 3].map((w) => (
            <rect key={w} x={x + 4} y={160 - (i % 3) * 26 + w * 18} width={16} height={8} fill="#fde68a" opacity={0.8} />
          ))}
        </g>
      ))}
      <path d="M0,232 C80,218 140,246 220,232 C300,218 340,242 400,230 L400,300 L0,300 Z" fill="#3b82f6" />
      <path d="M0,240 C80,226 140,254 220,240 C300,226 340,250 400,238" fill="none" stroke="#bfdbfe" strokeWidth={3} />
      <circle cx={310} cy={110} r={34} fill="none" stroke="#dc2626" strokeWidth={6} />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2;
        return <line key={i} x1={310} y1={110} x2={310 + 34 * Math.cos(a)} y2={110 + 34 * Math.sin(a)} stroke="#dc2626" strokeWidth={3} />;
      })}
      <rect x={306} y={140} width={8} height={60} fill="#475569" />
      <ellipse cx={120} cy={252} rx={34} ry={10} fill="#1d4ed8" />
      <rect x={112} y={228} width={6} height={24} fill="#92400e" />
      <polygon points="115,228 100,244 130,244" fill="#f8fafc" />
    </g>
  );
}

function Coastal() {
  return (
    <g>
      <rect x={0} y={0} width={400} height={300} fill="#f7e3b5" />
      <ellipse cx={200} cy={170} rx={165} ry={105} fill="#38bdf8" />
      <ellipse cx={200} cy={170} rx={165} ry={105} fill="none" stroke="#fbf3df" strokeWidth={14} />
      <ellipse cx={200} cy={170} rx={120} ry={72} fill="#0ea5e9" />
      <ellipse cx={150} cy={150} rx={46} ry={22} fill="#bae6fd" opacity={0.7} />
      <g transform="translate(84,196)">
        <rect x={-7} y={-52} width={14} height={52} fill="#e2e8f0" />
        <rect x={-11} y={-62} width={22} height={12} rx={3} fill="#dc2626" />
        <polygon points="0,-62 26,-52 -26,-52" fill="#fde68a" opacity={0.6} />
      </g>
      <g transform="translate(318,92)">
        <rect x={-3} y={0} width={6} height={26} fill="#92400e" />
        <circle cx={0} cy={-6} r={12} fill="#16a34a" />
        <circle cx={-9} cy={0} r={8} fill="#15803d" />
        <circle cx={9} cy={0} r={8} fill="#15803d" />
      </g>
      <g transform="translate(258,196)">
        <polygon points="0,-20 -12,8 12,8" fill="#f8fafc" />
        <rect x={-2} y={8} width={4} height={14} fill="#92400e" />
        <polygon points="2,-20 12,8 2,8" fill="#bae6fd" />
      </g>
      <g transform="translate(150,220)">
        <polygon points="0,-16 -10,6 10,6" fill="#f8fafc" />
        <rect x={-2} y={6} width={4} height={12} fill="#92400e" />
      </g>
      <ellipse cx={250} cy={120} rx={40} ry={12} fill="#f8fafc" />
      <rect x={228} y={108} width={44} height={10} rx={4} fill="#e2e8f0" />
    </g>
  );
}

function Mountain() {
  return (
    <g>
      <rect x={0} y={0} width={400} height={300} fill="#c3d4e5" />
      <polygon points="40,250 130,90 220,250" fill="#64748b" />
      <polygon points="130,90 158,132 130,146 102,132" fill="#f8fafc" />
      <polygon points="170,250 270,60 370,250" fill="#475569" />
      <polygon points="270,60 302,112 270,128 238,112" fill="#f8fafc" />
      <polygon points="-20,250 60,150 140,250" fill="#94a3b8" />
      <polygon points="60,150 78,178 60,188 42,178" fill="#f8fafc" />
      {[70, 110, 320, 352].map((x) => (
        <g key={x} transform={`translate(${x},232)`}>
          <polygon points="0,-34 -12,0 12,0" fill="#166534" />
          <polygon points="0,-46 -9,-16 9,-16" fill="#15803d" />
          <rect x={-3} y={0} width={6} height={10} fill="#92400e" />
        </g>
      ))}
      <ellipse cx={300} cy={262} rx={70} ry={16} fill="#38bdf8" />
      <g transform="translate(120,250)">
        <path d="M-34,0 a34,26 0 0,1 68,0 L56,0 a22,16 0 0,0 -44,0 Z" fill="#78350f" />
        <rect x={-56} y={-4} width={112} height={8} fill="#57534e" />
      </g>
    </g>
  );
}

const SCENES: Record<string, () => React.JSX.Element> = {
  grandprix: GrandPrix,
  city: City,
  coastal: Coastal,
  mountain: Mountain,
};

/** Center-panel illustration for a board theme (pure SVG, no assets). */
export function ThemeArt({ theme }: { theme: BoardTheme }) {
  const Scene = SCENES[theme.id] ?? GrandPrix;
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <Scene />
      <Badge name={theme.name} tagline={theme.tagline} />
    </svg>
  );
}
