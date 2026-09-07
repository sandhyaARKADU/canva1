import { fabric } from 'fabric';
import {
  AI_ARCHITECTURE_PALETTE,
  AI_APPLICATION_ARCHITECTURE_TEMPLATE_NAME,
  getConnectorAnimationPreset,
} from './architectureDiagramTypes';
import type {
  ArchitectureCardConfig,
  DiagramConnectorAnimationConfig,
  DiagramConnectorAnimationPresetId,
} from './architectureDiagramTypes';
import {
  createArchitectureCard,
  createSegmentedHeaderBars,
  createStageTracker,
  createTechnicalGrid,
  ensureArchitectureFontsLoaded,
} from './architectureDiagram';
import { createDiagramConnector, updateAllDiagramConnectors } from './diagramConnectors';
import { createTechnologyBadge } from './technologyIcons';
import type { TechnologyIconName } from './technologyIcons';
import type { FabricObjectAnimation, FabricObjectAnimationType } from '../types/timeline';

const WIDTH = 1080;
const HEIGHT = 1920;
const FONT_HEADING = 'Manrope, Inter, Arial, sans-serif';
const FONT_MONO = 'IBM Plex Mono, Space Mono, Menlo, monospace';

const FONT_REFERENCES_HEADING = [
  { id: 'manrope-500', family: 'Manrope', source: 'built-in' as const, weight: 500, style: 'normal' as const },
  { id: 'manrope-800', family: 'Manrope', source: 'built-in' as const, weight: 800, style: 'normal' as const },
];
const FONT_REFERENCES_MONO = [
  { id: 'ibm-plex-mono-600', family: 'IBM Plex Mono', source: 'built-in' as const, weight: 600, style: 'normal' as const },
  { id: 'ibm-plex-mono-700', family: 'IBM Plex Mono', source: 'built-in' as const, weight: 700, style: 'normal' as const },
];

export const AI_APPLICATION_REVEAL_TIMING_MS = {
  title: 0,
  subtitle: 110,
  bars: 200,
  tracker: 260,
  requestCard: 460,
  requestConnector: 640,
  frontendSection: 920,
  frontendCard: 1000,
  frontendBadges: [1060, 1100, 1140],
  composeConnector: 1540,
  orchestrationSection: 1760,
  orchestrationCard: 1840,
  orchestrationBadges: [1920, 1980],
  groundingConnectors: [2200, 2260, 2320],
  groundingSection: 2460,
  groundingCards: [2520, 2580, 2640],
  contextConnectors: [2920, 2980, 3040],
  contextSection: 3160,
  contextCard: 3240,
  contextBadge: 3300,
  persistConnectors: [3500, 3560],
  dataSection: 3680,
  dataCards: [3760, 3820],
  dataBadges: [3880, 3940],
  traceConnectors: [4060, 4120],
  observabilitySection: 4240,
  observabilityCard: 4320,
  observabilityBadges: [4400, 4460],
  releaseConnector: 4620,
  deploymentSection: 4740,
  deploymentCard: 4820,
  deploymentBadges: [4860, 4920, 4980, 5040, 5100],
  finalPulse: 5700,
} as const;

export const AI_APPLICATION_ARCHITECTURE_DURATION_MS = 8200;

const createId = (prefix: string) => (
  window.crypto?.randomUUID
    ? `${prefix}-${window.crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
);

const architectureMetadata = (role: string, name: string) => ({
  id: createId(`architecture-${role}`),
  name,
  objectType: role,
  teckstudioObjectType: role,
  architectureRole: role,
  elementCategory: 'Technology',
  elementSubcategory: 'System Design',
  elementTags: ['architecture', 'diagram', 'technology', role],
  elementEditable: true,
});

const backgroundObject = (name: string) => new fabric.Rect({
  left: 0,
  top: 0,
  width: WIDTH,
  height: HEIGHT,
  fill: AI_ARCHITECTURE_PALETTE.background,
  selectable: true,
  evented: false,
  hasControls: false,
  lockMovementX: true,
  lockMovementY: true,
  lockScalingX: true,
  lockScalingY: true,
  lockRotation: true,
  ...architectureMetadata('architectureBackground', name),
} as fabric.IRectOptions & Record<string, unknown>);

const titleObject = (text: string, top: number, fontSize: number, role: string) => new fabric.IText(text, {
  left: WIDTH / 2,
  top,
  originX: 'center',
  originY: 'top',
  fontFamily: FONT_HEADING,
  fontSize,
  fontWeight: role === 'architecture-title' ? 800 : 500,
  fill: role === 'architecture-title'
    ? AI_ARCHITECTURE_PALETTE.primaryText
    : AI_ARCHITECTURE_PALETTE.secondaryText,
  charSpacing: role === 'architecture-title' ? 70 : 120,
  textAlign: 'center',
  fontReferences: role === 'architecture-title' ? FONT_REFERENCES_HEADING : FONT_REFERENCES_MONO,
  ...architectureMetadata(role, text),
} as fabric.ITextOptions & Record<string, unknown>);

const monoLabel = (
  text: string,
  left: number,
  top: number,
  color: string,
  fontSize: number,
  charSpacing: number,
  role: string,
  originX: 'left' | 'center' = 'left',
) => new fabric.IText(text, {
  left,
  top,
  originX,
  originY: 'top',
  fontFamily: FONT_MONO,
  fontSize,
  fontWeight: 700,
  fill: color,
  charSpacing,
  fontReferences: FONT_REFERENCES_MONO,
  ...architectureMetadata(role, text),
} as fabric.ITextOptions & Record<string, unknown>);

const createSection = (
  label: string,
  left: number,
  top: number,
  sectionWidth: number,
  sectionHeight: number,
  color: string,
) => new fabric.Group([
  new fabric.Rect({
    left: 0,
    top: 0,
    width: sectionWidth,
    height: sectionHeight,
    rx: 18,
    ry: 18,
    fill: 'rgba(17, 21, 29, 0.34)',
    stroke: `${color}66`,
    strokeWidth: 1.5,
    strokeDashArray: [10, 9],
    selectable: false,
    evented: false,
  }),
  new fabric.IText(label, {
    left: 18,
    top: 14,
    fontFamily: FONT_MONO,
    fontSize: 13,
    fontWeight: 700,
    fill: color,
    charSpacing: 80,
    selectable: false,
    evented: false,
    fontReferences: FONT_REFERENCES_MONO,
  } as fabric.ITextOptions & Record<string, unknown>),
], {
  left,
  top,
  objectCaching: false,
  selectable: true,
  evented: true,
  ...architectureMetadata('architectureSection', label),
  architectureSectionConfig: {
    label,
    left,
    top,
    width: sectionWidth,
    height: sectionHeight,
    color,
  },
  architectureAccentColor: color,
} as fabric.IGroupOptions & Record<string, unknown>);

const setObjectAnimation = (
  object: fabric.Object,
  type: FabricObjectAnimationType,
  startMs: number,
  durationMs = 460,
  extra: Partial<FabricObjectAnimation> = {},
) => {
  const fullText = object.type === 'i-text' || object.type === 'text'
    ? String(object.get('text' as keyof fabric.Object) || '')
    : undefined;
  const animation: FabricObjectAnimation = {
    id: `ai-application-${type}-${startMs}`,
    type,
    startMs,
    durationMs,
    delayMs: 0,
    easing: 'ease-out',
    loop: false,
    ...extra,
  };
  const existingAnimations = object.get('objectAnimations' as keyof fabric.Object) as FabricObjectAnimation[] | undefined;
  object.set({
    objectAnimations: [...(Array.isArray(existingAnimations) ? existingAnimations : []), animation],
    animationConfig: {
      format: 'fabric-keyframe',
      animationType: type,
      startMs,
      durationMs,
      delayMs: 0,
      easing: animation.easing,
      loop: false,
      fullText,
    },
    baseAnimationState: {
      left: object.left || 0,
      top: object.top || 0,
      width: object.width || 0,
      height: object.height || 0,
      scaleX: object.scaleX || 1,
      scaleY: object.scaleY || 1,
      angle: object.angle || 0,
      opacity: object.opacity === undefined ? 1 : object.opacity,
      visible: object.visible !== false,
      text: fullText,
      strokeDashArray: (object.get('strokeDashArray' as keyof fabric.Object) as number[] | null | undefined) || null,
      strokeDashOffset: Number(object.get('strokeDashOffset' as keyof fabric.Object) || 0),
    },
    targetWidth: (object.width || 0) * (object.scaleX || 1),
    targetHeight: (object.height || 0) * (object.scaleY || 1),
  } as Record<string, unknown>);
};

const setConnectorObjectDraw = (
  object: fabric.Object,
  startMs: number,
  durationMs: number,
) => {
  const configKey = String(object.get('teckstudioObjectType' as keyof fabric.Object)) === 'diagramArrow'
    ? 'diagramArrowConfig'
    : 'diagramConnectorConfig';
  const current = (object.get(configKey as keyof fabric.Object) || {}) as Record<string, unknown>;
  const currentAnimation = (current.animation || {}) as Record<string, unknown>;
  const existingAnimations = object.get('objectAnimations' as keyof fabric.Object) as FabricObjectAnimation[] | undefined;
  object.set({
    objectAnimations: [
      ...(Array.isArray(existingAnimations) ? existingAnimations : []),
      {
        id: `ai-application-draw-${startMs}`,
        type: 'draw',
        startMs,
        durationMs,
        delayMs: 0,
        easing: 'ease-out',
        loop: false,
      } as FabricObjectAnimation,
    ],
    [configKey]: {
      ...current,
      animation: {
        ...currentAnimation,
        enabled: true,
        type: 'draw-in',
        direction: 'forward-once',
        duration: durationMs,
        delay: startMs,
        startDelay: 0,
        loop: false,
        easing: 'ease-out',
      },
    },
  } as Record<string, unknown>);
};

const summarizeConnectorObjects = (objects: fabric.Object[]) => {
  const path = objects.find((object) => (
    object.get('diagramConnectorRole' as keyof fabric.Object) === 'diagramConnectorPath'
  ));
  const start = objects.find((object) => (
    object.get('diagramConnectorRole' as keyof fabric.Object) === 'diagramConnectorStart'
  ));
  const end = objects.find((object) => (
    object.get('diagramConnectorRole' as keyof fabric.Object) === 'diagramConnectorEnd'
  ));
  const labelGroup = objects.find((object) => (
    object.get('diagramConnectorRole' as keyof fabric.Object) === 'diagramConnectorLabel'
  ));
  return { path, start, end, label: labelGroup };
};

const attachConnectorReveal = (
  objects: fabric.Object[],
  startMs: number,
  durationMs = 460,
) => {
  const { path, start, end, label } = summarizeConnectorObjects(objects);
  if (path) setConnectorObjectDraw(path, startMs, durationMs);
  [start, end].filter(Boolean).forEach((object) => {
    if (object) setObjectAnimation(object, 'fade-in', startMs + 120, 300);
  });
  if (label) setObjectAnimation(label, 'fade-in', startMs + 180, 320);
};

const connectorConfig = (
  connectorId: string,
  sourceNodeId: string,
  targetNodeId: string,
  label: string,
  color: string,
  presetId: DiagramConnectorAnimationPresetId,
  sequenceStartMs: number,
  overrides: DiagramConnectorAnimationConfig = {},
) => ({
  connectorId,
  sourceNodeId,
  targetNodeId,
  sourceAnchor: 'bottom',
  targetAnchor: 'top',
  style: 'dotted',
  routing: 'straight',
  color,
  endArrow: 'arrow',
  label,
  labelPosition: 0.5,
  animation: {
    ...(getConnectorAnimationPreset(presetId)?.connector.animation || {}),
    enabled: true,
    delay: sequenceStartMs,
    ...overrides,
  },
});

export async function applyAIApplicationArchitectureTemplate(canvas: fabric.Canvas) {
  await ensureArchitectureFontsLoaded();
  const timing = AI_APPLICATION_REVEAL_TIMING_MS;
  canvas.clear();
  canvas.setDimensions({ width: WIDTH, height: HEIGHT });
  canvas.setBackgroundColor(AI_ARCHITECTURE_PALETTE.background, () => undefined);

  const background = backgroundObject('AI application architecture background');
  const grid = createTechnicalGrid(WIDTH, HEIGHT, {
    majorEvery: 5,
    horizontalSpacing: 90,
    verticalSpacing: 90,
    opacity: 0.1,
    thickness: 1,
  });
  const title = titleObject('AI APPLICATION ARCHITECTURE', 42, 42, 'architecture-title');
  const subtitle = titleObject('FROM USER REQUEST TO PRODUCTION', 96, 14, 'architecture-subtitle');
  const bars = createSegmentedHeaderBars(WIDTH, 138, [
    AI_ARCHITECTURE_PALETTE.green,
    AI_ARCHITECTURE_PALETTE.blue,
    AI_ARCHITECTURE_PALETTE.purple,
    AI_ARCHITECTURE_PALETTE.green,
  ], 10, 7);
  const stages = createStageTracker({
    left: 82,
    top: 198,
    width: 916,
    circleSize: 11,
    labelGap: 14,
    glow: true,
    arrows: true,
    labels: ['REQUEST', 'FRONT', 'ORCH', 'GROUND', 'CTX', 'STORE', 'EVAL', 'DEPLOY'],
    colors: [
      AI_ARCHITECTURE_PALETTE.green,
      AI_ARCHITECTURE_PALETTE.blue,
      AI_ARCHITECTURE_PALETTE.purple,
      AI_ARCHITECTURE_PALETTE.yellow,
      AI_ARCHITECTURE_PALETTE.green,
      AI_ARCHITECTURE_PALETTE.yellow,
      AI_ARCHITECTURE_PALETTE.orange,
      AI_ARCHITECTURE_PALETTE.green,
    ],
  });

  const nodeConfigs: ArchitectureCardConfig[] = [
    {
      nodeId: 'ai-app-request',
      title: 'USER REQUEST',
      subtitle: 'client prompt · session start',
      icon: 'member',
      left: 320,
      top: 262,
      width: 440,
      height: 92,
      iconSize: 30,
      titleFontSize: 19,
      subtitleFontSize: 12,
      paddingY: 16,
      accentColor: AI_ARCHITECTURE_PALETTE.green,
    },
    {
      nodeId: 'ai-app-frontend',
      title: 'FRONTEND',
      subtitle: 'react · next.js · streamlit apps',
      icon: 'browser',
      left: 148,
      top: 448,
      width: 400,
      height: 132,
      iconSize: 34,
      titleFontSize: 19,
      subtitleFontSize: 12,
      accentColor: AI_ARCHITECTURE_PALETTE.blue,
      chips: [
        { text: 'WEB', color: AI_ARCHITECTURE_PALETTE.blue },
        { text: 'DESKTOP', color: AI_ARCHITECTURE_PALETTE.blue, backgroundColor: 'rgba(85, 166, 255, 0.08)', borderColor: 'rgba(85, 166, 255, 0.2)' },
        { text: 'DATA APP', color: AI_ARCHITECTURE_PALETTE.blue },
      ],
    },
    {
      nodeId: 'ai-app-orchestrator',
      title: 'AGENT ORCHESTRATOR',
      subtitle: 'plans · tools · steps · streams',
      icon: 'chat',
      left: 190,
      top: 722,
      width: 480,
      height: 132,
      iconSize: 34,
      titleFontSize: 18,
      subtitleFontSize: 12,
      accentColor: AI_ARCHITECTURE_PALETTE.green,
      chips: [
        { text: 'STATE', color: AI_ARCHITECTURE_PALETTE.green },
        { text: 'TOOLS', color: AI_ARCHITECTURE_PALETTE.yellow, backgroundColor: 'rgba(242, 201, 76, 0.08)', borderColor: 'rgba(242, 201, 76, 0.2)' },
        { text: 'STREAM', color: AI_ARCHITECTURE_PALETTE.green },
      ],
    },
    {
      nodeId: 'ai-app-rag',
      title: 'KNOWLEDGE / RAG',
      subtitle: 'retrieval · embeddings · rerank',
      icon: 'database',
      left: 120,
      top: 960,
      width: 265,
      height: 132,
      iconSize: 32,
      titleFontSize: 16,
      subtitleFontSize: 12,
      accentColor: AI_ARCHITECTURE_PALETTE.purple,
    },
    {
      nodeId: 'ai-app-models',
      title: 'MODELS / LLM',
      subtitle: 'inference · token generation',
      icon: 'chip',
      left: 408,
      top: 960,
      width: 265,
      height: 132,
      iconSize: 32,
      titleFontSize: 16,
      subtitleFontSize: 12,
      accentColor: AI_ARCHITECTURE_PALETTE.blue,
    },
    {
      nodeId: 'ai-app-tools',
      title: 'TOOLS / MCP',
      subtitle: 'external capabilities · skills',
      icon: 'gateway',
      left: 696,
      top: 960,
      width: 265,
      height: 132,
      iconSize: 32,
      titleFontSize: 16,
      subtitleFontSize: 12,
      accentColor: AI_ARCHITECTURE_PALETTE.yellow,
    },
    {
      nodeId: 'ai-app-context',
      title: 'CONTEXT BUILDER',
      subtitle: 'prompt assembly · windowing · grounding',
      icon: 'server',
      left: 220,
      top: 1208,
      width: 640,
      height: 124,
      iconSize: 34,
      titleFontSize: 19,
      subtitleFontSize: 12,
      accentColor: AI_ARCHITECTURE_PALETTE.green,
      chips: [
        { text: 'WINDOW', color: AI_ARCHITECTURE_PALETTE.green },
        { text: 'TOKENS', color: AI_ARCHITECTURE_PALETTE.yellow, backgroundColor: 'rgba(242, 201, 76, 0.08)', borderColor: 'rgba(242, 201, 76, 0.2)' },
        { text: 'RERANK', color: AI_ARCHITECTURE_PALETTE.purple },
      ],
    },
    {
      nodeId: 'ai-app-redis',
      title: 'REDIS CACHE',
      subtitle: 'sessions · hot vectors',
      icon: 'cache',
      left: 150,
      top: 1436,
      width: 380,
      height: 124,
      iconSize: 32,
      titleFontSize: 16,
      subtitleFontSize: 12,
      accentColor: AI_ARCHITECTURE_PALETTE.yellow,
    },
    {
      nodeId: 'ai-app-postgres',
      title: 'POSTGRES / PG VECTOR',
      subtitle: 'conversations · embeddings',
      icon: 'database',
      left: 550,
      top: 1436,
      width: 380,
      height: 124,
      iconSize: 32,
      titleFontSize: 16,
      subtitleFontSize: 12,
      accentColor: AI_ARCHITECTURE_PALETTE.blue,
    },
    {
      nodeId: 'ai-app-observability',
      title: 'OBSERVABILITY & EVALS',
      subtitle: 'metrics · logs · traces · evals',
      icon: 'monitoring',
      left: 170,
      top: 1652,
      width: 520,
      height: 120,
      iconSize: 34,
      titleFontSize: 18,
      subtitleFontSize: 12,
      accentColor: AI_ARCHITECTURE_PALETTE.green,
      chips: [
        { text: 'EVALS', color: AI_ARCHITECTURE_PALETTE.purple },
        { text: 'TRACES', color: AI_ARCHITECTURE_PALETTE.green },
      ],
    },
    {
      nodeId: 'ai-app-deploy',
      title: 'DEPLOYMENT',
      subtitle: 'CI/CD · containers · edge orchestration',
      icon: 'cloud',
      left: 150,
      top: 1842,
      width: 470,
      height: 74,
      iconSize: 26,
      titleFontSize: 17,
      subtitleFontSize: 11,
      paddingY: 12,
      accentColor: AI_ARCHITECTURE_PALETTE.blue,
    },
  ];
  const nodes = nodeConfigs.map(createArchitectureCard);

  const sections = [
    createSection('FRONTEND', 110, 398, 860, 228, AI_ARCHITECTURE_PALETTE.blue),
    createSection('AGENT ORCHESTRATION', 150, 674, 780, 184, AI_ARCHITECTURE_PALETTE.green),
    createSection('KNOWLEDGE · MODELS · TOOLS', 80, 906, 920, 214, AI_ARCHITECTURE_PALETTE.purple),
    createSection('CONTEXT BUILDER', 150, 1168, 780, 170, AI_ARCHITECTURE_PALETTE.green),
    createSection('DATA LAYER', 110, 1382, 860, 186, AI_ARCHITECTURE_PALETTE.yellow),
    createSection('OBSERVABILITY & EVALS', 110, 1616, 860, 160, AI_ARCHITECTURE_PALETTE.green),
    createSection('DEPLOYMENT', 110, 1830, 860, 90, AI_ARCHITECTURE_PALETTE.blue),
  ];

  const badge = (name: TechnologyIconName, left: number, top: number, tileSize: number) =>
    createTechnologyBadge(name, { left, top, tileSize });

  const badges = [
    badge('react', 590, 452, 50),
    badge('nextjs', 652, 452, 50),
    badge('streamlit', 714, 452, 50),
    badge('langgraph', 700, 732, 48),
    badge('crewai', 760, 732, 48),
    badge('llm', 856, 1178, 38),
    badge('redis', 680, 1394, 44),
    badge('postgres', 736, 1394, 44),
    badge('grafana', 700, 1662, 46),
    badge('prometheus', 758, 1662, 46),
    badge('docker', 640, 1852, 40),
    badge('kubernetes', 694, 1852, 40),
    badge('git', 748, 1852, 40),
    badge('github', 802, 1852, 40),
    badge('vercel', 856, 1852, 40),
  ];

  const frontendLabel = monoLabel(
    'CLIENT ORCHESTRATION',
    640,
    516,
    AI_ARCHITECTURE_PALETTE.yellow,
    12,
    60,
    'architecture-small-label',
  );
  const orchestrationLabel = monoLabel(
    'AGENT RUNNER',
    754,
    792,
    AI_ARCHITECTURE_PALETTE.yellow,
    12,
    60,
    'architecture-small-label',
  );

  canvas.add(background, grid, ...sections, ...nodes, ...badges, frontendLabel, orchestrationLabel, bars, stages, title, subtitle);

  const connector = (
    connectorId: string,
    sourceNodeId: string,
    targetNodeId: string,
    label: string,
    color: string,
    presetId: DiagramConnectorAnimationPresetId,
    sequenceStartMs: number,
    configOverrides: { routing?: string; sourceAnchor?: string; targetAnchor?: string } = {},
    animationOverrides: DiagramConnectorAnimationConfig = {},
  ) => createDiagramConnector(canvas, {
    ...connectorConfig(connectorId, sourceNodeId, targetNodeId, label, color, presetId, sequenceStartMs, animationOverrides),
    ...configOverrides,
  } as Parameters<typeof createDiagramConnector>[1]);

  const connectors = [
    ...connector('ai-app-request-frontend', 'ai-app-request', 'ai-app-frontend', 'PROMPT', AI_ARCHITECTURE_PALETTE.blue, 'request-flow', timing.requestConnector, { routing: 'orthogonal' }),
    ...connector('ai-app-frontend-orchestrator', 'ai-app-frontend', 'ai-app-orchestrator', 'COMPOSE', AI_ARCHITECTURE_PALETTE.green, 'request-flow', timing.composeConnector),
    ...connector('ai-app-orchestrator-rag', 'ai-app-orchestrator', 'ai-app-rag', 'RAG', AI_ARCHITECTURE_PALETTE.purple, 'request-flow', timing.groundingConnectors[0], {}, { flowColor: AI_ARCHITECTURE_PALETTE.purple, glowColor: AI_ARCHITECTURE_PALETTE.purple }),
    ...connector('ai-app-orchestrator-models', 'ai-app-orchestrator', 'ai-app-models', 'INFERENCE', AI_ARCHITECTURE_PALETTE.blue, 'inference-flow', timing.groundingConnectors[1], {}, { flowColor: AI_ARCHITECTURE_PALETTE.blue, glowColor: AI_ARCHITECTURE_PALETTE.blue }),
    ...connector('ai-app-orchestrator-tools', 'ai-app-orchestrator', 'ai-app-tools', 'MCP', AI_ARCHITECTURE_PALETTE.yellow, 'request-flow', timing.groundingConnectors[2], {}, { flowColor: AI_ARCHITECTURE_PALETTE.yellow, glowColor: AI_ARCHITECTURE_PALETTE.yellow }),
    ...connector('ai-app-rag-context', 'ai-app-rag', 'ai-app-context', '', AI_ARCHITECTURE_PALETTE.purple, 'request-flow', timing.contextConnectors[0], {}, { flowColor: AI_ARCHITECTURE_PALETTE.purple, glowColor: AI_ARCHITECTURE_PALETTE.purple }),
    ...connector('ai-app-models-context', 'ai-app-models', 'ai-app-context', '', AI_ARCHITECTURE_PALETTE.blue, 'request-flow', timing.contextConnectors[1], {}, { flowColor: AI_ARCHITECTURE_PALETTE.blue, glowColor: AI_ARCHITECTURE_PALETTE.blue }),
    ...connector('ai-app-tools-context', 'ai-app-tools', 'ai-app-context', '', AI_ARCHITECTURE_PALETTE.yellow, 'request-flow', timing.contextConnectors[2], {}, { flowColor: AI_ARCHITECTURE_PALETTE.yellow, glowColor: AI_ARCHITECTURE_PALETTE.yellow }),
    ...connector('ai-app-context-redis', 'ai-app-context', 'ai-app-redis', 'CACHE', AI_ARCHITECTURE_PALETTE.yellow, 'request-flow', timing.persistConnectors[0], {}, { flowColor: AI_ARCHITECTURE_PALETTE.yellow, glowColor: AI_ARCHITECTURE_PALETTE.yellow }),
    ...connector('ai-app-context-postgres', 'ai-app-context', 'ai-app-postgres', 'PERSIST', AI_ARCHITECTURE_PALETTE.yellow, 'request-flow', timing.persistConnectors[1], {}, { flowColor: AI_ARCHITECTURE_PALETTE.yellow, glowColor: AI_ARCHITECTURE_PALETTE.yellow }),
    ...connector('ai-app-redis-observability', 'ai-app-redis', 'ai-app-observability', 'TRACE', AI_ARCHITECTURE_PALETTE.yellow, 'request-flow', timing.traceConnectors[0], {}, { flowColor: AI_ARCHITECTURE_PALETTE.yellow, glowColor: AI_ARCHITECTURE_PALETTE.yellow }),
    ...connector('ai-app-postgres-observability', 'ai-app-postgres', 'ai-app-observability', 'EVALS', AI_ARCHITECTURE_PALETTE.purple, 'request-flow', timing.traceConnectors[1], {}, { flowColor: AI_ARCHITECTURE_PALETTE.purple, glowColor: AI_ARCHITECTURE_PALETTE.purple }),
    ...connector('ai-app-observability-deploy', 'ai-app-observability', 'ai-app-deploy', 'RELEASE', AI_ARCHITECTURE_PALETTE.green, 'request-flow', timing.releaseConnector),
  ];

  connectors.forEach((object, index) => canvas.moveTo(object, 2 + index));

  canvas.discardActiveObject();
  updateAllDiagramConnectors(canvas);
  applyRevealTiming(canvas);
  canvas.renderAll();

  return {
    name: AI_APPLICATION_ARCHITECTURE_TEMPLATE_NAME,
    nodes,
    connectors: connectors.flat(),
    sections,
    badges,
  };
}

function applyRevealTiming(canvas: fabric.Canvas) {
  const timing = AI_APPLICATION_REVEAL_TIMING_MS;
  const allObjects = canvas.getObjects();

  const setCard = (object: fabric.Object | undefined, startMs: number) => {
    if (!object) return;
    setObjectAnimation(object, 'scale-in', startMs, 480, { distance: 26 });
  };
  const setBadge = (object: fabric.Object | undefined, startMs: number) => {
    if (!object) return;
    setObjectAnimation(object, 'pop', startMs, 380, { distance: 14 });
  };
  const setSection = (object: fabric.Object | undefined, startMs: number) => {
    if (!object) return;
    setObjectAnimation(object, 'slide-down', startMs, 420, { distance: 22 });
  };
  const findCard = (nodeId: string) => allObjects.find((object) => (
    object.get('architectureNodeId' as keyof fabric.Object) === nodeId
  ));
  const findBadge = (name: TechnologyIconName) => allObjects.find((object) => (
    object.get('technologyIconName' as keyof fabric.Object) === name
  ));
  const findSection = (index: number) => allObjects.filter((object) => (
    !object.get('technologyIconName' as keyof fabric.Object) &&
    object.get('teckstudioObjectType' as keyof fabric.Object) === 'architectureSection'
  ))[index];
  const findConnectorGroup = (connectorId: string) => {
    return allObjects.filter((object) => {
      const config = object.get('diagramConnectorConfig' as keyof fabric.Object);
      if (!config) return false;
      return (config as Record<string, unknown>).connectorId === connectorId;
    });
  };
  const findLabel = (text: string) => allObjects.find((object) => (
    object.get('name' as keyof fabric.Object) === text
  ));

  const titleObject = allObjects.find((object) => (
    object.get('architectureRole' as keyof fabric.Object) === 'architecture-title'
  ));
  if (titleObject) {
    setObjectAnimation(titleObject, 'slide-down', timing.title, 560, { distance: 30 });
    setObjectAnimation(titleObject, 'pulse', timing.finalPulse, 760, { loop: true });
  }
  const subtitle = allObjects.find((object) => (
    object.get('architectureRole' as keyof fabric.Object) === 'architecture-subtitle'
  ));
  if (subtitle) setObjectAnimation(subtitle, 'fade-in', timing.subtitle, 420);
  const barsObject = allObjects.find((object) => (
    object.get('teckstudioObjectType' as keyof fabric.Object) === 'segmentedHeader'
  ));
  if (barsObject) setObjectAnimation(barsObject, 'fade-in', timing.bars, 380);
  const stagesObject = allObjects.find((object) => (
    object.get('teckstudioObjectType' as keyof fabric.Object) === 'stageTracker'
  ));
  if (stagesObject) setObjectAnimation(stagesObject, 'fade-in', timing.tracker, 480);

  setCard(findCard('ai-app-request'), timing.requestCard);
  attachConnectorReveal(findConnectorGroup('ai-app-request-frontend'), timing.requestConnector, 460);

  setSection(findSection(0), timing.frontendSection);
  setCard(findCard('ai-app-frontend'), timing.frontendCard);
  (['react', 'nextjs', 'streamlit'] as TechnologyIconName[]).forEach((name, index) => {
    setBadge(findBadge(name), timing.frontendBadges[index]);
  });
  const frontendLabel = findLabel('CLIENT ORCHESTRATION');
  if (frontendLabel) setObjectAnimation(frontendLabel, 'fade-in', timing.frontendBadges[2] + 60, 300);

  attachConnectorReveal(findConnectorGroup('ai-app-frontend-orchestrator'), timing.composeConnector, 460);

  setSection(findSection(1), timing.orchestrationSection);
  setCard(findCard('ai-app-orchestrator'), timing.orchestrationCard);
  (['langgraph', 'crewai'] as TechnologyIconName[]).forEach((name, index) => {
    setBadge(findBadge(name), timing.orchestrationBadges[index]);
  });
  const orchestrationLabel = findLabel('AGENT RUNNER');
  if (orchestrationLabel) setObjectAnimation(orchestrationLabel, 'fade-in', timing.orchestrationBadges[1] + 60, 300);

  ['ai-app-orchestrator-rag', 'ai-app-orchestrator-models', 'ai-app-orchestrator-tools'].forEach((id, index) => {
    attachConnectorReveal(findConnectorGroup(id), timing.groundingConnectors[index], 440);
  });

  setSection(findSection(2), timing.groundingSection);
  ['ai-app-rag', 'ai-app-models', 'ai-app-tools'].forEach((id, index) => {
    setCard(findCard(id), timing.groundingCards[index]);
  });

  ['ai-app-rag-context', 'ai-app-models-context', 'ai-app-tools-context'].forEach((id, index) => {
    attachConnectorReveal(findConnectorGroup(id), timing.contextConnectors[index], 420);
  });

  setSection(findSection(3), timing.contextSection);
  setCard(findCard('ai-app-context'), timing.contextCard);
  setBadge(findBadge('llm'), timing.contextBadge);

  ['ai-app-context-redis', 'ai-app-context-postgres'].forEach((id, index) => {
    attachConnectorReveal(findConnectorGroup(id), timing.persistConnectors[index], 440);
  });

  setSection(findSection(4), timing.dataSection);
  ['ai-app-redis', 'ai-app-postgres'].forEach((id, index) => {
    setCard(findCard(id), timing.dataCards[index]);
  });
  (['redis', 'postgres'] as TechnologyIconName[]).forEach((name, index) => {
    setBadge(findBadge(name), timing.dataBadges[index]);
  });

  ['ai-app-redis-observability', 'ai-app-postgres-observability'].forEach((id, index) => {
    attachConnectorReveal(findConnectorGroup(id), timing.traceConnectors[index], 440);
  });

  setSection(findSection(5), timing.observabilitySection);
  setCard(findCard('ai-app-observability'), timing.observabilityCard);
  (['grafana', 'prometheus'] as TechnologyIconName[]).forEach((name, index) => {
    setBadge(findBadge(name), timing.observabilityBadges[index]);
  });

  attachConnectorReveal(findConnectorGroup('ai-app-observability-deploy'), timing.releaseConnector, 460);

  setSection(findSection(6), timing.deploymentSection);
  setCard(findCard('ai-app-deploy'), timing.deploymentCard);
  (['docker', 'kubernetes', 'git', 'github', 'vercel'] as TechnologyIconName[]).forEach((name, index) => {
    setBadge(findBadge(name), timing.deploymentBadges[index]);
  });

  canvas.getObjects().forEach((object) => object.setCoords());
}

export { AI_APPLICATION_ARCHITECTURE_TEMPLATE_NAME };