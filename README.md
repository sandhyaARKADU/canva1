# TECKSTUDIO — AI-Powered Design Platform

Professional poster and graphic design generator with AI assistance, covering all industry sectors.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, JavaScript, HTML, CSS, Vite |
| Canvas | Fabric.js 5.x |
| State | Zustand |
| Backend | Python 3, FastAPI, Uvicorn |
| Database | MySQL 9.x |
| Auth | JWT (python-jose) |
| AI | Pollinations API (free, no key needed) |

## Project Structure

```
canva/
├── frontend/          # React + Fabric.js editor
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/         # Login/Register
│   │   │   ├── dashboard/    # Dashboard, templates
│   │   │   └── editor/       # Canvas, AI tools, sidebar
│   │   ├── hooks/            # Custom hooks
│   │   ├── store/            # Zustand state
│   │   └── data/             # Templates
│   └── package.json
├── backend/           # Python + FastAPI
│   ├── routes/
│   │   ├── auth.py           # Auth endpoints
│   │   ├── projects.py       # Project CRUD
│   │   ├── templates.py      # Template CRUD
│   │   ├── categories.py     # Template categories
│   │   ├── brand_kits.py     # Brand kit management
│   │   ├── shared.py         # Design sharing
│   │   ├── favorites.py      # User favorites
│   │   └── assets.py         # Asset library
│   ├── database.py           # MySQL + SQLAlchemy (12 tables)
│   ├── auth.py               # JWT + password hashing
│   ├── config.py             # Settings
│   ├── main.py               # FastAPI app
│   └── .env                  # Environment variables
├── docs/              # Documentation
│   ├── PRD.md
│   ├── Project_Scope.md
│   ├── HLD.md
│   ├── LLD.md
│   └── System_Design.md
└── README.md
```

## Quick Start

### Prerequisites
- Python 3.10+
- MySQL 8.x or 9.x
- Node.js 18+

### 1. Database Setup
```sql
CREATE DATABASE teckstudio;
-- Or it auto-creates on first run with all 12 tables
```

### 2. Backend
```bash
cd backend
pip install -r requirements.txt
python3 -m uvicorn main:app --port 5001 --reload
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Database Tables (12)

| Table | Purpose |
|-------|---------|
| users | User accounts |
| projects | Design projects |
| design_versions | Version history |
| templates | Template library |
| categories | Template categories (27 pre-seeded) |
| brand_kits | Brand kit containers |
| brand_colors | Brand color palettes |
| brand_fonts | Brand font collections |
| brand_logos | Brand logo uploads |
| shared_designs | Design sharing |
| favorites | User favorites |
| assets | SVG/icon library |

## API Endpoints

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register user |
| POST | /api/auth/login | Login |
| GET | /api/auth/me | Get current user |

### Projects
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/projects | List projects |
| POST | /api/projects | Create project |
| GET | /api/projects/:id | Get project |
| PUT | /api/projects/:id | Update project |
| DELETE | /api/projects/:id | Delete project |

### Templates
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/templates | List templates |
| POST | /api/templates | Create template |
| GET | /api/templates/:id | Get template |

### Categories
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/categories | List categories (27 pre-seeded) |

### Brand Kits
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/brand-kits | List brand kits |
| POST | /api/brand-kits | Create brand kit |
| POST | /api/brand-kits/:id/colors | Add color |
| POST | /api/brand-kits/:id/fonts | Add font |
| POST | /api/brand-kits/:id/logos | Add logo |

### Sharing
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/shared | List shared designs |
| POST | /api/shared | Share design |
| GET | /api/shared/by-token/:token | View shared design |

### Favorites & Assets
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/favorites | List favorites |
| POST | /api/favorites | Add favorite |
| GET | /api/assets | List assets |

### AI Services
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/ai/generate-poster | Generate poster design from prompt (Gemini AI) |
| POST | /api/ai/generate-reference-poster | Generate poster with reference style (Gemini AI) |
| POST | /api/ai/generate-image-prompt | Generate enhanced image prompt (Gemini AI) |
| POST | /api/ai/chat | AI chat assistant (Gemini AI) |
| POST | /api/ai/generate-image | Generate AI image (Pollinations/OpenAI) |
| GET | /api/ai/health | AI service health check |
| POST | /api/ai-poster/generate | Generate complete AI poster with image |
| POST | /api/ai-poster/analyze | Analyze prompt for design parameters |

## Features

### Canvas Editor
- Shapes: Rectangle, Circle, Triangle, Diamond, Pentagon, Hexagon, Octagon, Star, Heart, Arrow, Cloud, Shield, Flame, Bookmark, Quote
- Text editing with 20+ font families
- Image upload and manipulation
- Freehand drawing with brush tool
- Vector pen tool for custom paths
- Text on path (circle, wave, heart, star)
- Object manipulation: select, move, resize, rotate
- Multi-select and group/ungroup
- Copy, paste, duplicate
- Layer ordering and lock/unlock
- Properties panel with fill, stroke, opacity, shadow

### AI Features
- AI Poster Generator (25+ themes, Gemini AI + image generation)
- AI Image Generator (Pollinations API / OpenAI DALL-E fallback)
- AI Chat Assistant (Gemini-powered design advice)
- AI Slogan & Copy Writer (Gemini-powered marketing copy)
- AI Color Palette Generator (Gemini-powered contextual palettes)
- Enhanced Image Prompt Generator (Gemini AI for Midjourney/DALL-E prompts)
- AI Layout Suggester (predefined professional layouts)
- AI Color Extractor (extract dominant colors from images)
- Background Remover (client-side image processing)

### Assets Library
- Royalty-free image search
- 40+ SVG elements
- Gradient overlays
- Solid color palettes

### Export
- PNG with transparency
- JPG with quality control
- SVG vector export
- PDF export
- DPI presets (72, 150, 300, 600)

### Dashboard
- Recent designs with preview images
- Template categories (27 categories)
- Brand kit management
- Shared designs
- Search functionality

### Editor Tools
- Keyboard shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+C, Ctrl+V, etc.)
- Grid overlay with snap-to-grid
- Rulers
- Smart guides
- Distance measurement
- Zoom controller
- History panel with snapshots
- Pages panel (multi-page support)
- Dev mode inspector
- Alignment tools
- Animation panel

### Collaboration
- Shareable links via `/view/:token`
- Email sharing
- Access level control (Private/Link/Public)
- Design preview thumbnails
