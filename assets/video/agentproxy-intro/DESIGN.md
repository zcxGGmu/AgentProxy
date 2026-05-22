# AgentProxy Intro Video Design

## Style Prompt

A precise architecture diagram comes alive on a pure white canvas. The video should feel like a calm engineering control-plane walkthrough: sparse, technical, local-first, and trustworthy. Motion is restrained and intentional, using line tracing, card entrances, dashed boundaries, and clean page-wipe transitions. AgentProxy is always framed as a thin local control plane over OpenCode, never as a replacement runtime.

## Colors

- Canvas: `#ffffff`
- Primary text: `#0d0d0d`
- Secondary text: `#5f5f70`
- Muted labels and borders: `#e5e5e5`
- Accent lines and arrows: `#10a37f`
- Accent text: `#0b6f58`
- Soft fill: `#f7faf8`

## Typography

- Primary: system `sans-serif`, heavy for titles and regular for explanatory copy, matching the existing diagram rhythm.
- Data voice: system `monospace`, medium for CLI names, IDs, and protocol labels.
- Text should stay large enough for 1080p video: titles 72px+, body 28px+, small labels 22px+.

## Motion

- Build final layout first, then animate in with `gsap.from()`.
- Scene transitions use a white page wipe with an AgentProxy green rail.
- Diagram lines trace with finite `stroke-dashoffset` animations.
- Cards enter by opacity plus small `x`, `y`, or `scale` changes.
- No infinite loops, no random timing, no decorative particles.

## What NOT to Do

- Do not use dark tech, neon, gradients, glows, 3D cards, stock imagery, or generic SaaS hero styling.
- Do not claim AgentProxy replaces OpenCode, implements its own planner/tool runtime, or supports non-OpenCode providers in v1.
- Do not imply Phase 6 AgentProxy TUI is complete; it is the next phase.
- Do not show transcripts, secrets, provider credentials, raw share URLs, or sensitive artifact content.
