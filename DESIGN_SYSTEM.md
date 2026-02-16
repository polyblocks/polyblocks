# PolyBlocks Design System Quick Reference

## Color Palette

### Background
- `--pb-bg-primary`: #0f1117 (Main background)
- `--pb-bg-secondary`: #1a1d27 (Cards, panels)
- `--pb-bg-tertiary`: #242836 (Buttons, inputs)
- `--pb-bg-elevated`: #2a2e3d (Elevated elements)
- `--pb-bg-hover`: #333849 (Hover states)

### Text
- `--pb-text-primary`: #f1f3f9 (Main text)
- `--pb-text-secondary`: #9ca3b4 (Secondary text)
- `--pb-text-muted`: #6b7280 (Muted text)

### Accent
- `--pb-accent`: #6366f1 (Primary brand color)
- `--pb-accent-hover`: #818cf8 (Hover state)
- `--pb-accent-muted`: rgba(99, 102, 241, 0.15) (Subtle backgrounds)

### Category Colors
- `--pb-trigger`: #f59e0b (Orange - Triggers)
- `--pb-market`: #8b5cf6 (Purple - Market)
- `--pb-data`: #3b82f6 (Blue - Data)
- `--pb-logic`: #10b981 (Green - Logic)
- `--pb-risk`: #ef4444 (Red - Risk)
- `--pb-action`: #f97316 (Orange - Actions)
- `--pb-utility`: #6b7280 (Gray - Utility)

## Typography

### Fonts
- Primary: Inter (400, 500, 600, 700)
- Monospace: JetBrains Mono (400, 500)

### Sizes
- Heading 1: 28px, weight 700
- Body: 13-15px
- Small: 11-12px
- Code: 12px monospace

## Spacing

### Radius
- Small: 6px
- Medium: 10px
- Large: 14px
- Full: 9999px (pills)

### Shadows
- Small: 0 1px 2px rgba(0,0,0,0.3)
- Medium: 0 4px 12px rgba(0,0,0,0.4)
- Large: 0 8px 24px rgba(0,0,0,0.5)

## Components

### Buttons
- `.pb-btn` - Default button
- `.pb-btn-primary` - Primary action (gradient)
- `.pb-btn-danger` - Destructive action
- `.pb-btn-icon` - Icon-only button
- `.pb-btn-sm` - Small variant

### Cards
- `.pb-card` - Standard card component

### Forms
- `.pb-input` - Text input with focus states
- `.pb-select` - Dropdown select

### Badges
- `.pb-badge` - Base badge
- `.pb-badge-{category}` - Colored variants

### Status
- `.pb-status-dot` - Status indicator
- `.pb-status-dot-active` - Pulsing green
- `.pb-status-dot-paused` - Orange
- `.pb-status-dot-stopped` - Gray
- `.pb-status-dot-error` - Pulsing red

## Animations

### Keyframes
- `pulse` - 2s pulsing effect
- `dash` - 0.5s dashed line animation
- `fadeIn` - 0.3s fade in with slide
- `shimmer` - 1.5s loading skeleton
- `spin` - 0.6s rotation

### Utility Classes
- `.fade-in` - Fade in animation
- `.shimmer` - Loading shimmer effect
- `.loading-spinner` - Spinning loader

## Best Practices

1. **Transitions**: Use 0.15s ease for most interactions
2. **Hover Effects**: Subtle transforms (translateY(-1px to -2px))
3. **Focus States**: Use accent-muted glow (0 0 0 3px)
4. **Spacing**: Use consistent 4px grid (4, 8, 12, 16, 24, 32)
5. **Borders**: Use --pb-border for subtle separation
6. **Shadows**: Layer shadows for depth (border + shadow)

## Accessibility

- All interactive elements have focus-visible states
- Color contrast meets WCAG AA standards
- Keyboard navigation fully supported
- Screen reader friendly labels
