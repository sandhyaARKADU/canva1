import type {
  ArchitectureCardConfig,
  ArchitectureIconName,
  DiagramConnectorAnimationPresetId,
  DiagramConnectorConfig,
  DiagramArrowStyle,
  DiagramConnectorRouting,
  DiagramConnectorStyle,
} from './architectureDiagramTypes';
import { AI_ARCHITECTURE_PALETTE } from './architectureDiagramTypes';

export type ArchitectureSymbolDefinition = {
  id: string;
  name: string;
  category: string;
  icon: ArchitectureIconName;
  keywords: string[];
  color: string;
};

export type ArchitectureBoxPreset = {
  id: string;
  name: string;
  keywords: string[];
  config: ArchitectureCardConfig;
};

export type ArchitectureArrowPreset = {
  id: string;
  name: string;
  keywords: string[];
  routing: DiagramConnectorRouting;
  style: DiagramConnectorStyle;
  startArrow: DiagramArrowStyle;
  endArrow: DiagramArrowStyle;
  width?: number;
  angle?: number;
  label?: string;
};

export type ArchitectureAnimatedFlowPreset = {
  id: string;
  name: string;
  keywords: string[];
  config: Partial<DiagramConnectorConfig> & { name?: string; angle?: number };
  presetId?: DiagramConnectorAnimationPresetId;
};

const symbol = (
  id: string,
  name: string,
  category: string,
  icon: ArchitectureIconName,
  keywords: string[],
  color: string,
): ArchitectureSymbolDefinition => ({ id, name, category, icon, keywords, color });

export const ARCHITECTURE_SYMBOLS: ArchitectureSymbolDefinition[] = [
  symbol('symbol-member', 'Member / User', 'Users', 'member', ['user', 'member', 'person', 'client'], AI_ARCHITECTURE_PALETTE.green),
  symbol('symbol-workers', 'Workers / Team', 'Workers', 'workers', ['workers', 'team', 'async', 'users'], AI_ARCHITECTURE_PALETTE.green),
  symbol('symbol-globe', 'Internet / Globe', 'Network', 'globe', ['internet', 'network', 'edge', 'cdn', 'web'], AI_ARCHITECTURE_PALETTE.blue),
  symbol('symbol-edge', 'Edge Network', 'Network', 'globe', ['edge', 'cdn', 'waf', 'network'], AI_ARCHITECTURE_PALETTE.blue),
  symbol('symbol-api', 'API Gateway', 'API', 'gateway', ['api', 'gateway', 'endpoint', 'rest'], AI_ARCHITECTURE_PALETTE.purple),
  symbol('symbol-rate-limit', 'Rate Limiting', 'API', 'gateway', ['rate', 'limit', 'throttle', 'api'], AI_ARCHITECTURE_PALETTE.orange),
  symbol('symbol-auth', 'Authentication', 'Security', 'auth', ['auth', 'authentication', 'security', 'shield'], AI_ARCHITECTURE_PALETTE.purple),
  symbol('symbol-database', 'Database', 'Database', 'database', ['database', 'db', 'sql', 'storage'], AI_ARCHITECTURE_PALETTE.yellow),
  symbol('symbol-storage', 'Storage', 'Storage', 'database', ['storage', 'disk', 'data', 'database'], AI_ARCHITECTURE_PALETTE.yellow),
  symbol('symbol-cache', 'Cache', 'Cache', 'database', ['cache', 'redis', 'memory', 'session'], AI_ARCHITECTURE_PALETTE.yellow),
  symbol('symbol-chat', 'Chat / Message', 'Messaging', 'chat', ['chat', 'message', 'conversation', 'orchestrator'], AI_ARCHITECTURE_PALETTE.green),
  symbol('symbol-stream', 'Streaming', 'Streaming', 'stream', ['stream', 'streaming', 'realtime', 'tokens'], AI_ARCHITECTURE_PALETTE.green),
  symbol('symbol-router', 'Model Router', 'AI and Models', 'router', ['ai', 'model', 'router', 'inference'], AI_ARCHITECTURE_PALETTE.orange),
  symbol('symbol-model', 'AI Model', 'AI and Models', 'router', ['ai', 'model', 'llm', 'neural'], AI_ARCHITECTURE_PALETTE.orange),
  symbol('symbol-gpu', 'GPU / Processor', 'GPU and Hardware', 'chip', ['gpu', 'processor', 'chip', 'hardware', 'inference'], AI_ARCHITECTURE_PALETTE.blue),
  symbol('symbol-server', 'Server', 'Servers', 'server', ['server', 'compute', 'host', 'backend'], AI_ARCHITECTURE_PALETTE.blue),
  symbol('symbol-cloud', 'Cloud', 'Cloud', 'cloud', ['cloud', 'hosting', 'infrastructure'], AI_ARCHITECTURE_PALETTE.blue),
  symbol('symbol-event', 'Event Bus', 'Messaging', 'event', ['event', 'bus', 'pubsub', 'message'], AI_ARCHITECTURE_PALETTE.orange),
  symbol('symbol-queue', 'Queue', 'Queues', 'queue', ['queue', 'jobs', 'events', 'worker'], AI_ARCHITECTURE_PALETTE.orange),
  symbol('symbol-tools', 'Tools', 'System Architecture', 'server', ['tools', 'functions', 'plugins'], AI_ARCHITECTURE_PALETTE.green),
  symbol('symbol-session', 'Session', 'System Architecture', 'auth', ['session', 'state', 'context'], AI_ARCHITECTURE_PALETTE.green),
  symbol('symbol-retry', 'Retry', 'System Architecture', 'router', ['retry', 'fallback', 'repeat'], AI_ARCHITECTURE_PALETTE.orange),
  symbol('symbol-logs', 'Logs', 'Monitoring', 'event', ['logs', 'logging', 'events'], AI_ARCHITECTURE_PALETTE.green),
  symbol('symbol-metrics', 'Metrics', 'Monitoring', 'analytics', ['metrics', 'monitoring', 'chart'], AI_ARCHITECTURE_PALETTE.green),
  symbol('symbol-billing', 'Billing', 'Monitoring', 'database', ['billing', 'payment', 'usage'], AI_ARCHITECTURE_PALETTE.yellow),
  symbol('symbol-analytics', 'Analytics', 'Monitoring', 'analytics', ['analytics', 'chart', 'insights'], AI_ARCHITECTURE_PALETTE.green),
];

export const ARCHITECTURE_BOX_PRESETS: ArchitectureBoxPreset[] = [
  {
    id: 'box-basic',
    name: 'Basic Architecture Card',
    keywords: ['architecture', 'box', 'node', 'service'],
    config: { title: 'SYSTEM NODE', subtitle: 'service / responsibility', icon: 'server' },
  },
  {
    id: 'box-database',
    name: 'Database Card',
    keywords: ['database', 'storage', 'db'],
    config: { title: 'DATABASE', subtitle: 'records / metadata', icon: 'database', accentColor: AI_ARCHITECTURE_PALETTE.yellow },
  },
  {
    id: 'box-service',
    name: 'Service Card',
    keywords: ['service', 'microservice', 'backend'],
    config: { title: 'SERVICE', subtitle: 'business capability', icon: 'server', accentColor: AI_ARCHITECTURE_PALETTE.blue },
  },
  {
    id: 'box-worker',
    name: 'Worker Card',
    keywords: ['worker', 'async', 'jobs'],
    config: { title: 'ASYNC WORKERS', subtitle: 'jobs / logs / metrics', icon: 'workers', accentColor: AI_ARCHITECTURE_PALETTE.green },
  },
  {
    id: 'box-api',
    name: 'API Card',
    keywords: ['api', 'gateway', 'auth', 'rate limit'],
    config: { title: 'API GATEWAY', subtitle: 'auth / rate limits', icon: 'gateway', accentColor: AI_ARCHITECTURE_PALETTE.purple },
  },
  {
    id: 'box-gpu',
    name: 'GPU Card',
    keywords: ['gpu', 'processor', 'inference'],
    config: { title: 'GPU INFERENCE', subtitle: 'token generation', icon: 'chip', accentColor: AI_ARCHITECTURE_PALETTE.blue },
  },
  {
    id: 'box-cache',
    name: 'Cache Card',
    keywords: ['cache', 'session', 'prompt', 'redis'],
    config: { title: 'HOT CACHE', subtitle: 'session / prompt', icon: 'database', accentColor: AI_ARCHITECTURE_PALETTE.yellow },
  },
  {
    id: 'box-custom',
    name: 'Empty Custom Card',
    keywords: ['custom', 'empty', 'box'],
    config: { title: 'CUSTOM NODE', subtitle: 'add your own content', icon: 'server', accentColor: AI_ARCHITECTURE_PALETTE.mutedBorder },
  },
];

export const ARCHITECTURE_ARROW_PRESETS: ArchitectureArrowPreset[] = [
  { id: 'arrow-right', name: 'Right Arrow', keywords: ['right', 'straight'], routing: 'straight', style: 'solid', startArrow: 'none', endArrow: 'arrow' },
  { id: 'arrow-left', name: 'Left Arrow', keywords: ['left', 'straight'], routing: 'straight', style: 'solid', startArrow: 'arrow', endArrow: 'none' },
  { id: 'arrow-up', name: 'Up Arrow', keywords: ['up', 'vertical'], routing: 'straight', style: 'solid', startArrow: 'none', endArrow: 'arrow', angle: -90 },
  { id: 'arrow-down', name: 'Down Arrow', keywords: ['down', 'vertical'], routing: 'straight', style: 'solid', startArrow: 'none', endArrow: 'arrow', angle: 90 },
  { id: 'arrow-double', name: 'Double-ended Arrow', keywords: ['double', 'both'], routing: 'straight', style: 'solid', startArrow: 'arrow', endArrow: 'arrow' },
  { id: 'arrow-open', name: 'Open Arrowhead', keywords: ['open', 'thin'], routing: 'straight', style: 'solid', startArrow: 'none', endArrow: 'open-arrow' },
  { id: 'arrow-circle', name: 'Circle-ended Arrow', keywords: ['circle', 'endpoint'], routing: 'straight', style: 'solid', startArrow: 'circle', endArrow: 'arrow' },
  { id: 'arrow-dashed', name: 'Dashed Arrow', keywords: ['dashed', 'dash'], routing: 'straight', style: 'dashed', startArrow: 'none', endArrow: 'arrow' },
  { id: 'arrow-dotted', name: 'Dotted Arrow', keywords: ['dotted', 'dots'], routing: 'straight', style: 'dotted', startArrow: 'none', endArrow: 'arrow' },
  { id: 'arrow-elbow', name: 'Elbow Arrow', keywords: ['elbow', 'angled'], routing: 'elbow', style: 'solid', startArrow: 'none', endArrow: 'arrow' },
  { id: 'arrow-curved', name: 'Curved Arrow', keywords: ['curved', 'curve'], routing: 'curved', style: 'solid', startArrow: 'none', endArrow: 'arrow' },
  { id: 'arrow-bezier', name: 'Bezier Arrow', keywords: ['bezier', 'curve'], routing: 'bezier', style: 'dotted', startArrow: 'none', endArrow: 'open-arrow' },
  { id: 'arrow-thick', name: 'Thick Arrow', keywords: ['thick', 'bold'], routing: 'straight', style: 'solid', startArrow: 'none', endArrow: 'arrow', width: 7 },
  { id: 'arrow-label', name: 'Arrow with Label', keywords: ['label', 'request', 'flow'], routing: 'straight', style: 'dotted', startArrow: 'none', endArrow: 'arrow', label: 'REQUEST' },
];

export const ARCHITECTURE_ANIMATED_FLOW_PRESETS: ArchitectureAnimatedFlowPreset[] = [
  {
    id: 'animated-request',
    name: 'Animated Request Arrow',
    keywords: ['animated', 'request', 'moving dots', 'green'],
    presetId: 'request-flow',
    config: { routing: 'straight', label: 'REQUEST' },
  },
  {
    id: 'animated-response',
    name: 'Animated Response Arrow',
    keywords: ['animated', 'response', 'pulse', 'green'],
    presetId: 'response-flow',
    config: { routing: 'curved', label: 'RESPONSE' },
  },
  {
    id: 'animated-dots',
    name: 'Moving Dots',
    keywords: ['animated', 'dots', 'particles', 'flow'],
    config: {
      routing: 'straight',
      style: 'dotted',
      animation: { enabled: true, type: 'moving-dots', particleCount: 5, glowEnabled: true },
    },
  },
  {
    id: 'animated-dashes',
    name: 'Moving Dashes',
    keywords: ['animated', 'dashes', 'marching'],
    config: {
      routing: 'straight',
      style: 'dashed',
      animation: { enabled: true, type: 'moving-dashes', dashLength: 9, dashGap: 9 },
    },
  },
  {
    id: 'animated-pulse',
    name: 'Travelling Pulse',
    keywords: ['animated', 'pulse', 'glow'],
    config: {
      routing: 'straight',
      style: 'solid',
      animation: { enabled: true, type: 'travelling-pulse', glowEnabled: true },
    },
  },
  {
    id: 'animated-stream',
    name: 'Streaming Flow',
    keywords: ['animated', 'stream', 'fast', 'dots'],
    presetId: 'stream-flow',
    config: { routing: 'straight', label: 'STREAM' },
  },
  {
    id: 'animated-inference',
    name: 'Inference Flow',
    keywords: ['animated', 'inference', 'arrowhead', 'blue'],
    presetId: 'inference-flow',
    config: { routing: 'straight', label: 'INFERENCE' },
  },
  {
    id: 'animated-event',
    name: 'Event Flow',
    keywords: ['animated', 'event', 'orange', 'dashes'],
    presetId: 'event-flow',
    config: { routing: 'straight', label: 'EVENT' },
  },
  {
    id: 'animated-bidirectional',
    name: 'Bidirectional Flow',
    keywords: ['animated', 'both', 'bidirectional', 'two way'],
    config: {
      routing: 'straight',
      style: 'dotted',
      startArrow: 'arrow',
      endArrow: 'arrow',
      animation: { enabled: true, type: 'moving-dots', direction: 'bidirectional', particleCount: 6 },
    },
  },
  {
    id: 'animated-curved',
    name: 'Curved Animated Connector',
    keywords: ['animated', 'curved', 'bezier'],
    config: {
      routing: 'curved',
      style: 'solid',
      animation: { enabled: true, type: 'flow-trail', trailLength: 0.24, glowEnabled: true },
    },
  },
  {
    id: 'animated-elbow',
    name: 'Elbow Animated Connector',
    keywords: ['animated', 'elbow', 'bend'],
    config: {
      routing: 'elbow',
      style: 'dotted',
      animation: { enabled: true, type: 'moving-dots', particleCount: 4, glowEnabled: true },
    },
  },
];

export const ARCHITECTURE_LIBRARY_CATEGORIES = [
  'Users',
  'Network',
  'API',
  'Database',
  'Storage',
  'Cache',
  'Cloud',
  'Servers',
  'AI and Models',
  'GPU and Hardware',
  'Messaging',
  'Queues',
  'Security',
  'Streaming',
  'Monitoring',
  'Workers',
  'System Architecture',
];
