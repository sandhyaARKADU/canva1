import { fabric } from 'fabric';

export type TechnologyIconName =
  | 'react'
  | 'nextjs'
  | 'streamlit'
  | 'langgraph'
  | 'crewai'
  | 'mcp'
  | 'llm'
  | 'git'
  | 'github'
  | 'docker'
  | 'kubernetes'
  | 'redis'
  | 'postgres'
  | 'grafana'
  | 'prometheus'
  | 'vercel'
  | 'aws';

export const TECHNOLOGY_ICON_NAMES: TechnologyIconName[] = [
  'react',
  'nextjs',
  'streamlit',
  'langgraph',
  'crewai',
  'mcp',
  'llm',
  'git',
  'github',
  'docker',
  'kubernetes',
  'redis',
  'postgres',
  'grafana',
  'prometheus',
  'vercel',
  'aws',
];

export const TECHNOLOGY_ICON_LABELS: Record<TechnologyIconName, string> = {
  react: 'React',
  nextjs: 'Next.js',
  streamlit: 'Streamlit',
  langgraph: 'LangGraph',
  crewai: 'CrewAI',
  mcp: 'MCP',
  llm: 'LLM',
  git: 'Git',
  github: 'GitHub',
  docker: 'Docker',
  kubernetes: 'Kubernetes',
  redis: 'Redis',
  postgres: 'PostgreSQL',
  grafana: 'Grafana',
  prometheus: 'Prometheus',
  vercel: 'Vercel',
  aws: 'AWS',
};

export const TECHNOLOGY_ICON_COLORS: Record<TechnologyIconName, string> = {
  react: '#61DAFB',
  nextjs: '#FFFFFF',
  streamlit: '#FF4B4B',
  langgraph: '#34D399',
  crewai: '#FFB02E',
  mcp: '#8B7CF6',
  llm: '#CF8CFF',
  git: '#F05032',
  github: '#F0F6FC',
  docker: '#2496ED',
  kubernetes: '#326CE5',
  redis: '#FF4438',
  postgres: '#5E9DE6',
  grafana: '#F46800',
  prometheus: '#E6522C',
  vercel: '#FFFFFF',
  aws: '#FF9900',
};

export type TechnologyBadgeConfig = {
  left?: number;
  top?: number;
  tileSize?: number;
  iconSize?: number;
  borderColor?: string;
  borderWidth?: number;
  tileColor?: string;
  color?: string;
  cornerRadius?: number;
  glow?: boolean;
};



const createId = (prefix: string) => (
  window.crypto?.randomUUID
    ? `${prefix}-${window.crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
);

const strokeOptions = (color: string, width: number, size: number) => ({
  fill: '',
  stroke: color,
  strokeWidth: Math.max(1, width * size),
  strokeLineCap: 'round' as const,
  strokeLineJoin: 'round' as const,
  strokeUniform: true,
  selectable: false,
  evented: false,
});

const fillOptions = (color: string) => ({
  fill: color,
  stroke: '',
  selectable: false,
  evented: false,
});

const markCircle = (
  cx: number,
  cy: number,
  radius: number,
  size: number,
  fill: string,
) => new fabric.Circle({
  left: cx * size,
  top: cy * size,
  radius: radius * size,
  originX: 'center',
  originY: 'center',
  ...fillOptions(fill),
} as fabric.ICircleOptions);

const markEllipse = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  size: number,
  fill: string,
) => new fabric.Ellipse({
  left: cx * size,
  top: cy * size,
  rx: rx * size,
  ry: ry * size,
  originX: 'center',
  originY: 'center',
  ...fillOptions(fill),
} as fabric.IEllipseOptions);

const markLine = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  size: number,
  color: string,
  width = 0.07,
) => new fabric.Line(
  [x1 * size, y1 * size, x2 * size, y2 * size],
  strokeOptions(color, width, size),
);

const markStroke = (
  d: string,
  size: number,
  color: string,
  width = 0.07,
) => new fabric.Path(d, {
  ...strokeOptions(color, width, size),
} as fabric.IPathOptions);

const markSolid = (
  d: string,
  _size: number,
  fill: string,
) => new fabric.Path(d, {
  ...fillOptions(fill),
} as fabric.IPathOptions);

type SymbolBuilder = (size: number, color: string) => fabric.Object[];

const symbols: Record<TechnologyIconName, SymbolBuilder> = {
  react: (size, color) => {
    const w = Math.max(1.5, size * 0.05);
    const ellipse = (angle: number) => new fabric.Ellipse({
      left: size * 0.5,
      top: size * 0.5,
      rx: size * 0.35,
      ry: size * 0.125,
      angle,
      originX: 'center',
      originY: 'center',
      fill: '',
      stroke: color,
      strokeWidth: w,
      strokeUniform: true,
      selectable: false,
      evented: false,
    } as fabric.IEllipseOptions);
    return [
      ellipse(0),
      ellipse(57),
      ellipse(-57),
      markCircle(0.5, 0.5, 0.065, size, color),
    ];
  },
  nextjs: (size, color) => [
    markSolid(
      `M ${size * 0.18} ${size * 0.42} L ${size * 0.5} ${size * 0.12} L ${size * 0.82} ${size * 0.42} L ${size * 0.5} ${size * 0.72} Z`,
      size,
      color,
    ),
    markStroke(
      `M ${size * 0.43} ${size * 0.72} L ${size * 0.43} ${size * 0.3} L ${size * 0.71} ${size * 0.72} L ${size * 0.71} ${size * 0.3}`,
      size,
      '#000000',
      0.055,
    ),
  ],
  streamlit: (size, color) => [
    markStroke(
      `M ${size * 0.2} ${size * 0.84} L ${size * 0.86} ${size * 0.2}`,
      size,
      color,
      0.08,
    ),
    markStroke(
      `M ${size * 0.72} ${size * 0.28} C ${size * 0.6} ${size * 0.16}, ${size * 0.4} ${size * 0.22}, ${size * 0.38} ${size * 0.34} C ${size * 0.36} ${size * 0.47}, ${size * 0.58} ${size * 0.48}, ${size * 0.6} ${size * 0.6} C ${size * 0.62} ${size * 0.74}, ${size * 0.46} ${size * 0.84}, ${size * 0.3} ${size * 0.8}`,
      size,
      color,
      0.08,
    ),
  ],
  langgraph: (size, color) => [
    markLine(0.46, 0.34, 0.34, 0.62, size, color, 0.05),
    markLine(0.54, 0.34, 0.66, 0.62, size, color, 0.05),
    markLine(0.3, 0.62, 0.7, 0.62, size, color, 0.05),
    markCircle(0.5, 0.22, 0.1, size, color),
    markCircle(0.3, 0.72, 0.09, size, color),
    markCircle(0.7, 0.72, 0.09, size, color),
  ],
  crewai: (size, color) => [
    markStroke(
      `M ${size * 0.78} ${size * 0.3} A ${size * 0.32} ${size * 0.32} 0 1 0 ${size * 0.78} ${size * 0.7}`,
      size,
      color,
      0.075,
    ),
    markLine(0.32, 0.42, 0.5, 0.62, size, color, 0.05),
    markLine(0.68, 0.42, 0.5, 0.62, size, color, 0.05),
    markCircle(0.32, 0.4, 0.08, size, color),
    markCircle(0.68, 0.4, 0.08, size, color),
    markCircle(0.5, 0.64, 0.08, size, color),
  ],
  mcp: (size, color) => [
    new fabric.Rect({
      left: size * 0.3,
      top: size * 0.22,
      width: size * 0.4,
      height: size * 0.42,
      rx: size * 0.07,
      ry: size * 0.07,
      fill: '',
      stroke: color,
      strokeWidth: Math.max(1.5, size * 0.07),
      strokeUniform: true,
      selectable: false,
      evented: false,
    } as fabric.IRectOptions),
    markLine(0.42, 0.64, 0.42, 0.8, size, color, 0.05),
    markLine(0.58, 0.64, 0.58, 0.8, size, color, 0.05),
    markLine(0.38, 0.64, 0.62, 0.64, size, color, 0.05),
    markLine(0.3, 0.32, 0.4, 0.32, size, color, 0.05),
  ],
  llm: (size, color) => [
    new fabric.Circle({
      left: size * 0.5,
      top: size * 0.5,
      radius: size * 0.2,
      originX: 'center',
      originY: 'center',
      fill: '',
      stroke: color,
      strokeWidth: Math.max(1.5, size * 0.055),
      strokeUniform: true,
      selectable: false,
      evented: false,
    } as fabric.ICircleOptions),
    markLine(0.5, 0.3, 0.5, 0.22, size, color, 0.045),
    markLine(0.32, 0.38, 0.26, 0.32, size, color, 0.045),
    markLine(0.68, 0.38, 0.74, 0.32, size, color, 0.045),
    markLine(0.36, 0.66, 0.32, 0.74, size, color, 0.045),
    markLine(0.64, 0.66, 0.68, 0.74, size, color, 0.045),
    markCircle(0.5, 0.16, 0.055, size, color),
    markCircle(0.22, 0.28, 0.055, size, color),
    markCircle(0.78, 0.28, 0.055, size, color),
    markCircle(0.28, 0.78, 0.055, size, color),
    markCircle(0.72, 0.78, 0.055, size, color),
  ],
  git: (size, color) => [
    markCircle(0.3, 0.5, 0.11, size, color),
    markCircle(0.72, 0.24, 0.11, size, color),
    markCircle(0.72, 0.76, 0.11, size, color),
    markStroke(
      `M ${size * 0.37} ${size * 0.43} C ${size * 0.5} ${size * 0.32}, ${size * 0.62} ${size * 0.3}, ${size * 0.66} ${size * 0.29}`,
      size,
      color,
      0.065,
    ),
    markStroke(
      `M ${size * 0.37} ${size * 0.57} C ${size * 0.5} ${size * 0.68}, ${size * 0.62} ${size * 0.7}, ${size * 0.66} ${size * 0.71}`,
      size,
      color,
      0.065,
    ),
  ],
  github: (size, color) => [
    markSolid(
      `M ${size * 0.29} ${size * 0.44} L ${size * 0.36} ${size * 0.14} L ${size * 0.5} ${size * 0.3} Z`,
      size,
      color,
    ),
    markSolid(
      `M ${size * 0.71} ${size * 0.44} L ${size * 0.64} ${size * 0.14} L ${size * 0.5} ${size * 0.3} Z`,
      size,
      color,
    ),
    new fabric.Rect({
      left: size * 0.26,
      top: size * 0.3,
      width: size * 0.48,
      height: size * 0.56,
      rx: size * 0.1,
      ry: size * 0.1,
      fill: color,
      stroke: '',
      selectable: false,
      evented: false,
    } as fabric.IRectOptions),
    markStroke(
      `M ${size * 0.44} ${size * 0.6} Q ${size * 0.5} ${size * 0.68}, ${size * 0.56} ${size * 0.6}`,
      size,
      '#000000',
      0.045,
    ),
  ],
  docker: (size, color) => [
    new fabric.Rect({ left: size * 0.2, top: size * 0.56, width: size * 0.26, height: size * 0.18, rx: size * 0.02, ry: size * 0.02, fill: color, stroke: '', selectable: false, evented: false } as fabric.IRectOptions),
    new fabric.Rect({ left: size * 0.5, top: size * 0.56, width: size * 0.26, height: size * 0.18, rx: size * 0.02, ry: size * 0.02, fill: color, stroke: '', selectable: false, evented: false } as fabric.IRectOptions),
    new fabric.Rect({ left: size * 0.31, top: size * 0.33, width: size * 0.28, height: size * 0.18, rx: size * 0.02, ry: size * 0.02, fill: color, stroke: '', selectable: false, evented: false } as fabric.IRectOptions),
    new fabric.Rect({ left: size * 0.65, top: size * 0.33, width: size * 0.2, height: size * 0.18, rx: size * 0.02, ry: size * 0.02, fill: color, stroke: '', selectable: false, evented: false } as fabric.IRectOptions),
    markStroke(
      `M ${size * 0.18} ${size * 0.84} Q ${size * 0.34} ${size * 0.94}, ${size * 0.5} ${size * 0.84} T ${size * 0.82} ${size * 0.84}`,
      size,
      color,
      0.055,
    ),
  ],
  kubernetes: (size, color) => {
    const lines: fabric.Object[] = [];
    for (let index = 0; index < 7; index += 1) {
      const angle = (index / 7) * Math.PI * 2;
      const startX = 0.5 + Math.cos(angle) * 0.13;
      const startY = 0.5 + Math.sin(angle) * 0.13;
      const endX = 0.5 + Math.cos(angle) * 0.34;
      const endY = 0.5 + Math.sin(angle) * 0.34;
      lines.push(markLine(startX, startY, endX, endY, size, color, 0.035));
    }
    return [
      ...lines,
      new fabric.Circle({
        left: size * 0.5,
        top: size * 0.5,
        radius: size * 0.36,
        originX: 'center',
        originY: 'center',
        fill: '',
        stroke: color,
        strokeWidth: Math.max(1.5, size * 0.06),
        strokeUniform: true,
        selectable: false,
        evented: false,
      } as fabric.ICircleOptions),
      markCircle(0.5, 0.5, 0.09, size, color),
    ];
  },
  redis: (size, color) => [
    markLine(0.2, 0.84, 0.26, 0.66, size, color, 0.055),
    markLine(0.32, 0.84, 0.38, 0.56, size, color, 0.055),
    markLine(0.44, 0.84, 0.5, 0.46, size, color, 0.055),
    markCircle(0.26, 0.62, 0.035, size, color),
    markCircle(0.38, 0.52, 0.035, size, color),
    markCircle(0.5, 0.42, 0.035, size, color),
    markStroke(
      `M ${size * 0.44} ${size * 0.62} C ${size * 0.56} ${size * 0.76}, ${size * 0.74} ${size * 0.76}, ${size * 0.84} ${size * 0.6}`,
      size,
      color,
      0.055,
    ),
  ],
  postgres: (size, color) => [
    markEllipse(0.52, 0.5, 0.26, 0.32, size, color),
    markEllipse(0.28, 0.4, 0.09, 0.14, size, color),
    markEllipse(0.74, 0.52, 0.09, 0.14, size, color),
    markSolid(
      `M ${size * 0.3} ${size * 0.56} C ${size * 0.18} ${size * 0.66}, ${size * 0.16} ${size * 0.8}, ${size * 0.26} ${size * 0.86} C ${size * 0.34} ${size * 0.9}, ${size * 0.42} ${size * 0.82}, ${size * 0.36} ${size * 0.72} Z`,
      size,
      color,
    ),
    markLine(0.42, 0.76, 0.4, 0.92, size, '#F0F6FC', 0.045),
    markLine(0.6, 0.76, 0.62, 0.92, size, '#F0F6FC', 0.045),
  ],
  grafana: (size, color) => [
    new fabric.Circle({
      left: size * 0.5,
      top: size * 0.5,
      radius: size * 0.29,
      originX: 'center',
      originY: 'center',
      fill: '',
      stroke: color,
      strokeWidth: Math.max(1.5, size * 0.06),
      strokeUniform: true,
      selectable: false,
      evented: false,
    } as fabric.ICircleOptions),
    markLine(0.44, 0.66, 0.44, 0.38, size, color, 0.065),
    markLine(0.44, 0.38, 0.62, 0.52, size, color, 0.065),
  ],
  prometheus: (size, color) => [
    markStroke(
      `M ${size * 0.22} ${size * 0.74} A ${size * 0.28} ${size * 0.28} 0 0 1 ${size * 0.78} ${size * 0.74}`,
      size,
      color,
      0.055,
    ),
    markLine(0.16, 0.74, 0.84, 0.74, size, color, 0.055),
    markLine(0.5, 0.74, 0.66, 0.48, size, color, 0.065),
    markCircle(0.5, 0.74, 0.055, size, color),
  ],
  vercel: (size, color) => [
    markSolid(
      `M ${size * 0.5} ${size * 0.12} L ${size * 0.9} ${size * 0.88} L ${size * 0.1} ${size * 0.88} Z`,
      size,
      color,
    ),
  ],
  aws: (size, color) => [
    markStroke(
      `M ${size * 0.26} ${size * 0.52} A ${size * 0.26} ${size * 0.26} 0 0 0 ${size * 0.74} ${size * 0.52}`,
      size,
      color,
      0.05,
    ),
    markLine(0.38, 0.56, 0.38, 0.78, size, color, 0.04),
    markLine(0.5, 0.56, 0.5, 0.78, size, color, 0.04),
    markLine(0.62, 0.56, 0.62, 0.78, size, color, 0.04),
  ],
};

export function createTechnologyIcon(
  name: TechnologyIconName,
  left = 0,
  top = 0,
  size = 48,
  color?: string,
) {
  const resolvedColor = color || TECHNOLOGY_ICON_COLORS[name];
  const mark = symbols[name](size, resolvedColor);
  return new fabric.Group(mark, {
    left,
    top,
    originX: 'center',
    originY: 'center',
    selectable: false,
    evented: false,
    objectCaching: false,
  });
}

export function createTechnologyBadge(
  name: TechnologyIconName,
  input: TechnologyBadgeConfig = {},
) {
  const tileSize = Math.max(28, input.tileSize ?? 54);
  const iconSize = Math.max(14, input.iconSize ?? Math.round(tileSize * 0.74));
  const color = input.color || TECHNOLOGY_ICON_COLORS[name];
  const borderColor = input.borderColor || color;
  const tileColor = input.tileColor || '#0C1117';
  const cornerRadius = Math.max(4, input.cornerRadius ?? Math.round(tileSize * 0.24));
  const strokeWidth = Math.max(1, input.borderWidth ?? 1.5);
  const tile = new fabric.Rect({
    left: 0,
    top: 0,
    width: tileSize,
    height: tileSize,
    rx: cornerRadius,
    ry: cornerRadius,
    fill: tileColor,
    stroke: borderColor,
    strokeWidth,
    strokeUniform: true,
    opacity: 0.92,
    selectable: false,
    evented: false,
  } as fabric.IRectOptions);
  if (input.glow) {
    tile.set('shadow', new fabric.Shadow({
      color: borderColor,
      blur: tileSize * 0.22,
      offsetX: 0,
      offsetY: 0,
    }));
  }
  const mark = symbols[name](iconSize, color);
  mark.forEach((object) => object.set({
    left: tileSize / 2,
    top: tileSize / 2,
  } as Record<string, unknown>));
  const label = TECHNOLOGY_ICON_LABELS[name];
  return new fabric.Group([tile, ...mark], {
    left: input.left ?? 120,
    top: input.top ?? 120,
    originX: 'left',
    originY: 'top',
    objectCaching: false,
    subTargetCheck: true,
    id: createId('technology-badge'),
    name: `${label} badge`,
    objectType: 'technologyBadge',
    teckstudioObjectType: 'technologyBadge',
    technologyIconName: name,
    technologyIconColor: color,
    technologyBadgeConfig: {
      tileSize,
      iconSize,
      borderColor,
      tileColor,
      color,
      cornerRadius,
      borderWidth: strokeWidth,
    },
    elementCategory: 'Technology',
    elementSubcategory: 'Technology Icons',
    elementTags: ['technology', 'icon', 'badge', name, label],
    elementEditable: true,
  } as fabric.IGroupOptions & Record<string, unknown>);
}