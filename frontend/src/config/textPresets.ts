import type { fabric } from 'fabric';

export type TextPreset = {
  id: string;
  name: string;
  preview: string;
  text: string;
  category?: 'heading' | 'preset';
  fontFamily: string;
  fontFallbacks?: string[];
  fontSize: number;
  fontSizeRatio?: number;
  minFontSize?: number;
  maxFontSize?: number;
  fontWeight: string | number;
  fontStyle?: 'normal' | 'italic';
  fill: string;
  textAlign: fabric.Textbox['textAlign'];
  charSpacing?: number;
  letterSpacingPx?: number;
  lineHeight?: number;
  stroke?: string;
  strokeWidth?: number;
  shadow?: fabric.IShadowOptions;
  gradient?: string[];
  highlightColor?: string;
};

export const ROUNDED_BOLD_HIGHLIGHT_PRESET_ID = 'rounded-bold-highlight';

export const TEXT_PRESETS: TextPreset[] = [
  {
    id: ROUNDED_BOLD_HIGHLIGHT_PRESET_ID,
    name: 'Rounded Bold Highlight',
    preview: 'Rounded',
    text: 'Rounded Title',
    category: 'heading',
    fontFamily: 'Fredoka',
    fontFallbacks: ['Baloo 2', 'Nunito', 'M PLUS Rounded 1c', 'Arial Rounded MT Bold', 'sans-serif'],
    fontSize: 86,
    fontSizeRatio: 0.08,
    minFontSize: 36,
    maxFontSize: 110,
    fontWeight: 700,
    fill: '#F5F2E8',
    textAlign: 'center',
    letterSpacingPx: -1.5,
    lineHeight: 1,
    highlightColor: '#E3A83B',
  },
  { id: 'architecture-main-heading', name: 'Poster Main Heading', preview: 'AI SYSTEM', text: 'AI CHAT SYSTEM', fontFamily: 'Manrope, Inter, Arial, sans-serif', fontSize: 62, fontWeight: 800, fill: '#F1F3F5', textAlign: 'center', charSpacing: 75, lineHeight: 1 },
  { id: 'architecture-subtitle', name: 'Poster Subtitle', preview: 'FLOW', text: 'HOW THE REPLY TRAVELS', fontFamily: 'Manrope, Inter, Arial, sans-serif', fontSize: 27, fontWeight: 500, fill: '#858C98', textAlign: 'center', charSpacing: 110, lineHeight: 1 },
  { id: 'architecture-card-title', name: 'Card Title', preview: 'NODE', text: 'SYSTEM NODE', fontFamily: 'IBM Plex Sans, Inter, Arial, sans-serif', fontSize: 21, fontWeight: 700, fill: '#F1F3F5', textAlign: 'left', charSpacing: 30, lineHeight: 1 },
  { id: 'architecture-card-subtitle', name: 'Card Subtitle', preview: 'service', text: 'service / responsibility', fontFamily: 'IBM Plex Sans, Inter, Arial, sans-serif', fontSize: 15, fontWeight: 400, fill: '#858C98', textAlign: 'left', charSpacing: 0, lineHeight: 1.15 },
  { id: 'architecture-connector-label', name: 'Connector Label', preview: 'REQUEST', text: 'REQUEST', fontFamily: 'IBM Plex Mono, Space Mono, Menlo, monospace', fontSize: 11, fontWeight: 700, fill: '#43D68A', textAlign: 'center', charSpacing: 55, lineHeight: 1 },
  { id: 'editorial-hero', name: 'Editorial Hero', preview: 'Editorial', text: 'Editorial Hero', fontFamily: 'Playfair Display, Georgia, serif', fontSize: 104, fontWeight: 600, fill: '#F3F0E8', textAlign: 'center', charSpacing: 0, lineHeight: 0.98 },
  { id: 'gold-italic-emphasis', name: 'Gold Italic Emphasis', preview: 'Emphasis', text: 'Gold Italic Emphasis', fontFamily: 'Playfair Display, Georgia, serif', fontSize: 72, fontWeight: 500, fontStyle: 'italic', fill: '#C89A4B', textAlign: 'center', charSpacing: 0, lineHeight: 1 },
  { id: 'technical-eyebrow', name: 'Technical Eyebrow', preview: 'TECHNICAL', text: 'TECHNICAL EYEBROW', fontFamily: 'Space Mono, Menlo, monospace', fontSize: 20, fontWeight: 600, fill: '#858A85', textAlign: 'center', charSpacing: 240, lineHeight: 1 },
  { id: 'footer-caption', name: 'Footer Caption', preview: 'FOOTER', text: 'FOOTER CAPTION', fontFamily: 'Space Mono, Menlo, monospace', fontSize: 15, fontWeight: 500, fill: '#858A85', textAlign: 'center', charSpacing: 210, lineHeight: 1 },
  { id: 'modern-heading', name: 'Modern Heading', preview: 'Modern', text: 'Modern Heading', fontFamily: 'Outfit', fontSize: 72, fontWeight: 800, fill: '#ffffff', textAlign: 'center', charSpacing: 10, lineHeight: 1.05 },
  { id: 'bold-poster-title', name: 'Bold Poster Title', preview: 'POSTER', text: 'BOLD POSTER TITLE', fontFamily: 'Outfit', fontSize: 82, fontWeight: 900, fill: '#f8fafc', textAlign: 'center', charSpacing: 35, lineHeight: 0.95, stroke: '#111827', strokeWidth: 2 },
  { id: 'gradient-ai', name: 'Gradient AI', preview: 'AI', text: 'Gradient AI', fontFamily: 'Outfit', fontSize: 78, fontWeight: 900, fill: '#8b5cf6', textAlign: 'center', gradient: ['#8b5cf6', '#06b6d4'], shadow: { color: 'rgba(139,92,246,0.35)', blur: 18, offsetX: 0, offsetY: 8 } },
  { id: 'gold-luxury', name: 'Gold Luxury', preview: 'Luxury', text: 'Gold Luxury', fontFamily: 'Georgia', fontSize: 68, fontWeight: 700, fill: '#f59e0b', textAlign: 'center', gradient: ['#fef3c7', '#f59e0b', '#92400e'], charSpacing: 18 },
  { id: 'retro-outline', name: 'Retro Outline', preview: 'Retro', text: 'Retro Outline', fontFamily: 'Outfit', fontSize: 70, fontWeight: 900, fill: '#f97316', textAlign: 'center', stroke: '#111827', strokeWidth: 4, shadow: { color: '#facc15', blur: 0, offsetX: 6, offsetY: 6 } },
  { id: 'soft-shadow', name: 'Soft Shadow', preview: 'Soft', text: 'Soft Shadow', fontFamily: 'Inter', fontSize: 58, fontWeight: 700, fill: '#ffffff', textAlign: 'center', shadow: { color: 'rgba(0,0,0,0.35)', blur: 22, offsetX: 0, offsetY: 12 } },
  { id: 'corporate-heading', name: 'Corporate Heading', preview: 'Business', text: 'Corporate Heading', fontFamily: 'Inter', fontSize: 54, fontWeight: 800, fill: '#0f172a', textAlign: 'left', lineHeight: 1.15 },
  { id: 'sale-poster', name: 'Sale Poster', preview: 'SALE', text: 'SALE 50% OFF', fontFamily: 'Outfit', fontSize: 78, fontWeight: 900, fill: '#ef4444', textAlign: 'center', charSpacing: 20, stroke: '#ffffff', strokeWidth: 3 },
  { id: 'gold-highlight', name: 'Gold Highlight', preview: 'Gold', text: 'Gold Highlight', fontFamily: 'Playfair Display', fontSize: 62, fontWeight: 800, fill: '#fbbf24', textAlign: 'center', charSpacing: 8 },
  { id: 'technical-label', name: 'Technical Label', preview: 'Label', text: 'Technical Label', fontFamily: 'Courier New', fontSize: 28, fontWeight: 700, fill: '#67e8f9', textAlign: 'left', charSpacing: 40 },
];
