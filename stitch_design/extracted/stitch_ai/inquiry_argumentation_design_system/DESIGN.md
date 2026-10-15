---
name: Inquiry Argumentation Design System
colors:
  surface: '#f7fafd'
  surface-dim: '#d7dadd'
  surface-bright: '#f7fafd'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f4f7'
  surface-container: '#ebeef1'
  surface-container-high: '#e5e8eb'
  surface-container-highest: '#e0e3e6'
  on-surface: '#181c1e'
  on-surface-variant: '#43474e'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eef1f4'
  outline: '#74777e'
  outline-variant: '#c3c6ce'
  surface-tint: '#456082'
  primary: '#001b35'
  on-primary: '#ffffff'
  primary-container: '#12304f'
  on-primary-container: '#7d98bd'
  inverse-primary: '#adc9ef'
  secondary: '#005db6'
  on-secondary: '#ffffff'
  secondary-container: '#64a1fe'
  on-secondary-container: '#00366f'
  tertiary: '#001f18'
  on-tertiary: '#ffffff'
  tertiary-container: '#00362c'
  on-tertiary-container: '#00aa8e'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d2e4ff'
  primary-fixed-dim: '#adc9ef'
  on-primary-fixed: '#001c37'
  on-primary-fixed-variant: '#2d4869'
  secondary-fixed: '#d6e3ff'
  secondary-fixed-dim: '#a9c7ff'
  on-secondary-fixed: '#001b3d'
  on-secondary-fixed-variant: '#00468c'
  tertiary-fixed: '#6ef9d9'
  tertiary-fixed-dim: '#4cddbd'
  on-tertiary-fixed: '#002019'
  on-tertiary-fixed-variant: '#005142'
  background: '#f7fafd'
  on-background: '#181c1e'
  surface-variant: '#e0e3e6'
typography:
  headline-xl:
    fontFamily: Noto Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 44px
  headline-xl-mobile:
    fontFamily: Noto Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 36px
  headline-lg:
    fontFamily: Noto Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 34px
  headline-md:
    fontFamily: Noto Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: Noto Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
  body-student-lg:
    fontFamily: Noto Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 30px
  body-student:
    fontFamily: Noto Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 26px
  body-teacher:
    fontFamily: Noto Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 22px
  label-md:
    fontFamily: Noto Sans
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
  label-sm:
    fontFamily: Noto Sans
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  code-argument:
    fontFamily: Noto Sans
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 1rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

This design system serves a dual-facing Korean science inquiry and argumentation AI platform. It bridges two distinct psychological contexts:
1. **Teacher Console**: An authoritative, distraction-free analytical cockpit designed for classroom monitoring, curriculum alignment, and evaluation efficiency.
2. **Student Experience**: An inviting, psychologically safe conversational lab designed to scaffold inquiry, reduce intimidation around scientific reasoning (Toulmin's Model), and promote metacognitive reflection.

### Emotional Response
- **For Teachers**: Trustworthy, systematic, calm, and effortlessly clear under high cognitive load.
- **For Students**: Curious, encouraging, guided, and structurally clear without feeling overly gamified or patronizing.

### Aesthetic Direction
A modern hybrid of **Clean Institutional Utility** (for instructors) and **Tactile Soft-SaaS with Spatial Clarity** (for students). The aesthetic is grounded in rational structural boundaries, luminous data accents, and semantic color signaling that mirrors the epistemology of the Toulmin argumentation framework.

## Colors

The palette establishes an epistemic hierarchy across administrative rigor and student exploration.

### Structural Base
- **Primary / Brand Anchor (`#12304F`)**: Deep Navy. Anchors teacher navigation bars, institutional typography, and foundational structural frames.
- **Surface Canvas Light (`#F2F5F8`)**: Cool Light Grey. The baseline canvas for teacher management and daytime student activities.
- **Accent Interactive (`#3B7DD8`)**: Clear Blue. Signifies direct interactive agency (primary CTAs, selected states, progress track fills).
- **Student Dark Canvas (`#0F1420`)**: Deep Slate. The primary workspace canvas when student focus mode or low-distraction dark mode is active.
- **Student Radiant Gradient**: `#22C1A3` transitioning at a 135-degree angle to `#4F8EF7`. Used sparingly for AI conversational prompts, discovery milestones, and completion badges.

### Toulmin Argumentation Model Semantics
- **Claim (주장)**: `#3B7DD8` (Clear Blue) - Direct, clear, directional assertion.
- **Evidence (근거)**: `#22C1A3` (Mint-Teal) - Empirical, data-grounded, observable facts.
- **Reasoning / Warrant (정당화/원리)**: `#8B5CF6` (Vivid Purple) - Abstract scientific laws, theoretical connective tissue.

### Evaluation & Feedback States
- **Valid / Completed (완료/타당)**: `#10B981` (Emerald Green)
- **Revision Needed (보완 필요)**: `#F59E0B` (Amber)
- **Counter-argument / Caution (반박/주의)**: `#EF4444` (Vibrant Red)
- **Border Neutral (`#E2E8F0`)**: Crisp container bounds in light surfaces.

## Typography

Typography prioritizes Korean legibility, scientific precision, and accessible eye-tracking across classroom lighting conditions.

- **Typeface Integration**: Built around modern Korean grotesque standards (`Pretendard` / `Noto Sans KR`), ensuring optical consistency across Hangul syllable blocks and Latin scientific terminology.
- **Student Floor Rule**: Student-facing body copy must never drop below `16px` (`1rem`) to support rapid tablet-based reading and cognitive stamina during extended inquiry sessions.
- **Line Heights**: Relaxed line heights (`1.6` to `1.7` multiplier for student bodies) ensure dense scientific explanations remain scannable without perceptual crowding.
- **Argument Semantic Labeling**: Labels attached to Toulmin logic items (주장, 근거, 정당화) leverage semi-bold weight (`600`) with tight tracking to function as structural metadata chips.

## Layout & Spacing

The layout model adapts between a wide dashboard structure for instructors and a focused conversational split-pane for students.

### Spatial Grid Models
- **Teacher Console**: 12-column fluid grid with a permanent 260px left sidebar (`#12304F`), 24px gutters, and 32px canvas margins. Density is optimized for real-time multi-student status overviews and rubric tables.
- **Student Inquiry Canvas**: Two-panel dynamic layout (Split Ratio: 55% inquiry source/argument map, 45% AI conversational guide) on desktop/tablet landscape. On mobile screens (under 768px), this collapses into a stacked tabbed view (Source / AI Tutor / Argument Map).

### Adaptation Breakpoints
- **Mobile (`< 768px`)**: Single column flow, 16px margins, sticky bottom prompt bar, touch-targets enlarged.
- **Tablet (`768px - 1024px`)**: Adaptive 8-column canvas, collapsible drawer navigation.
- **Desktop (`> 1024px`)**: Full multi-column dashboard with side-by-side analytical panels.

## Elevation & Depth

Visual hierarchy distinguishes analytical surfaces from interactive inquiry nodes without cluttering the screen with heavy drop shadows.

### Teacher Context: Low-Contrast Tonal Structure
- **Base Level (Canvas)**: Background `#F2F5F8`.
- **Card Surfaces**: Pure white `#FFFFFF` bounded by a 1px border of `#E2E8F0`.
- **Elevation Shadow**: Subtle institutional shadow `0 4px 12px rgba(18, 48, 79, 0.05)`.
- **Hover/Selected Depth**: Shifts border to `#3B7DD8` with shadow `0 6px 16px rgba(18, 48, 79, 0.08)`.

### Student Context: Ambient Glow & Soft Depth
- **Student Light Mode**: Surface cards float with tinted ambient shadows `0 8px 24px rgba(59, 125, 216, 0.06)`.
- **Student Dark Mode (`#0F1420`)**: Elevation is achieved via surface luminance stepping (`#171F30` for cards, `#202B42` for active panels) combined with low-opacity borders (`rgba(255, 255, 255, 0.08)`) and gentle glowing halos around active Toulmin nodes.

## Shapes

The shape system employs targeted radii to separate administrative containers from interactive argument building blocks:

- **Teacher Console Panels & Cards**: Fixed at `14px` border radius (`rounded-lg` equivalent), maintaining clean architectural stability.
- **Student Interaction Modules**: Generous radii (`16px` to `24px`) on dialog bubbles and inquiry prompts to foster an approachable, non-threatening atmosphere.
- **Argument Map Blocks (Toulmin Nodes)**: Symmetrical `12px` rounded cards featuring a distinctive 4px color-coded left boundary indicator (Claim: Blue, Evidence: Teal, Warrant: Purple).
- **Interactive Action Pills**: Fully rounded pill shapes (`9999px`) reserved for status badges, filter chips, and primary AI trigger tokens.

## Components

### Buttons
- **Primary Action (Teacher & Student)**: Solid `#3B7DD8` fill, white typography, 10px corner radius, height 40px (Teacher) or 48px (Student).
- **Student Touch Targets**: Every touch target in the student experience strictly enforces a minimum bounding box of `44px x 44px`.
- **Secondary / Ghost**: Background transparent, 1px border `#E2E8F0` (light) or `rgba(255, 255, 255, 0.15)` (dark), text color matching the current contrast layer.

### Argument Chips & Toulmin Indicators
- **Claim Chip (주장)**: Background `rgba(59, 125, 216, 0.1)`, text `#3B7DD8`, border `1px solid rgba(59, 125, 216, 0.3)`.
- **Evidence Chip (근거)**: Background `rgba(34, 193, 163, 0.1)`, text `#109B82`, border `1px solid rgba(34, 193, 163, 0.3)`.
- **Reasoning Chip (정당화)**: Background `rgba(139, 92, 246, 0.1)`, text `#7C3AED`, border `1px solid rgba(139, 92, 246, 0.3)`.

### Argument Map (내 논증 지도 - My Argument Map)
- Visual canvas tracking structural integrity of the student's reasoning.
- Nodes connect via dotted directional paths; nodes with incomplete reasoning display amber warning status pings (`#F59E0B`). Nodes with solid peer or AI validation display green checks (`#10B981`).

### AI Conversational Tutor Chat
- **Tutor Avatar & Bubble**: AI responses sit within a soft container (`#FFFFFF` in light mode, `#1A2234` in dark mode) featuring the subtle gradient header line (`#22C1A3` to `#4F8EF7`).
- **Student Input Field**: Multi-line expansion field, minimum 48px height, padded with 16px horizontal spacing, accompanied by contextual voice-to-text and Toulmin categorization quick-tags above the keyboard.

### Data Tables & Status Cards (Teacher Console)
- Clean, unstriped tables with 1px bottom divider `#E2E8F0`. Row hover reveals instant quick-inspect popovers displaying individual student argumentation progression in real-time.