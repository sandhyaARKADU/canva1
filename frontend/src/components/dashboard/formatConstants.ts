import {
  Image,
  Camera,
  Play,
  Monitor,
  Smartphone,
  CreditCard,
  type LucideIcon,
} from 'lucide-react';

export interface DesignFormat {
  key: string;
  name: string;
  width: number;
  height: number;
  description: string;
  icon: LucideIcon;
  accent: string;
}

export const DESIGN_FORMATS: DesignFormat[] = [
  {
    key: 'poster',
    name: 'Poster',
    width: 800,
    height: 1132,
    description: 'Portrait marketing poster',
    icon: Image,
    accent: '#A855F7',
  },
  {
    key: 'instagram-post',
    name: 'Instagram Post',
    width: 1080,
    height: 1080,
    description: 'Square social post',
    icon: Camera,
    accent: '#EC4899',
  },
  {
    key: 'youtube-thumbnail',
    name: 'YouTube Thumbnail',
    width: 1280,
    height: 720,
    description: '16:9 video thumbnail',
    icon: Play,
    accent: '#EF4444',
  },
  {
    key: 'slide-16-9',
    name: '16:9 Slide',
    width: 1920,
    height: 1080,
    description: 'Widescreen slide',
    icon: Monitor,
    accent: '#3B82F6',
  },
  {
    key: 'instagram-story',
    name: 'Instagram Story',
    width: 1080,
    height: 1920,
    description: 'Vertical story layout',
    icon: Smartphone,
    accent: '#F97316',
  },
  {
    key: 'business-card',
    name: 'Business Card',
    width: 1050,
    height: 600,
    description: 'Print-ready card',
    icon: CreditCard,
    accent: '#14B8A6',
  },
];
