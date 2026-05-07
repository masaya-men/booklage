# Board Chrome Redesign — Phase 1

> **Status**: Design approved 2026-05-07
> **Scope**: Board UX foundation rebuild. Move chrome out of board area, introduce continuous card sizing + global zoom, establish waveform aesthetic as default visual language.
> **Out of scope**: Share modal rebuild (Phase 2), Liquid Glass / SF themes (separate later phases), footer ad implementation.

---

## Background

User identified that share modal complexity is downstream of board UX limitations:
- Discrete S/M/L cards drove "S/M/L cycle" UI surface
- Lack of board zoom drove "fit-to-view" mode in share
- Rigid layout assumptions drove aspect-ratio mode switching

Decision: rebuild board UX first → share inherits naturally → simpler share modal later.

**Existing constraints preserved**:
- destefanis-strict on cards (memory `project_phase_a_decisions.md`): no thumbnail decoration, black bg, Geist font, flat editorial layout
- Glass / SF / decorative themes are theme-system slots (memory `project_liquidglass_as_theme.md`), not default chrome

---

## Design Language: Waveform Aesthetic

### Origin
Extracted from existing `components/board/LightboxNavMeter.tsx`:
- 3-superposed sinusoid flowing waveform (low/mid/high frequency)
- Gaussian-bell amplitude swell at active position
- 4-digit zero-padded counter (`[ 0042.0000 / 0150.0000 ]`)
- Bracket wrapping (`[ ... ]`)
- rAF-driven living motion

### Vocabulary
- **Bracket pills**: `[ ALL · 248 ]` `[ INBOX · 12 ]`
- **Padded readouts**: `[ 0240px ]`, `[ 100% ]` (4-digit zero-pad where contextually appropriate)
- **Frequency-bar sliders**: track is mini-waveform bars (seed-stable randomness), thumb = Gaussian swell
- **Localized swell**: hover/active states use Gaussian bell ramp, not solid highlight
- **Vertical hairline dividers**: 1px white@12%, separates groups in chrome

### Application Boundary

| Region | Apply waveform? |
|--------|-----------------|
| Toolbar pills | ✅ |
| Sliders (size / zoom) | ✅ |
| Hover affordance — **card edge only** (outside card surface) | ✅ |
| Lightbox chrome (existing NavMeter / NavChevron) | ✅ already |
| Count / numeric readouts | ✅ |
| Loading / empty states | ✅ |
| **Card thumbnail surface** | ❌ destefanis-strict |
| **Selection outline** | ❌ solid line, predictable |
| **Card hover scale** | ❌ existing `1.02` micro-scale untouched |
| **Media content** (image / video) | ❌ |

Principle: **cards = silent content / chrome = living instrument**

---

## Layout: Top Header (Case 1)

```
┌─────────────────────────────────────────────────────────────────┐
│ [ ALL·248 ] [ INBOX·12 ] │ SIZE ◢▬◣ ZOOM ◢▬◣ │ [▼ VIEW] [SHARE↗] │
└─────────────────────────────────────────────────────────────────┘
        ↑ NAV               ↑ INSTRUMENT          ↑ ACTIONS
    (どのコレクション)         (どう見えるか)            (出力)
```

- **Sticky top**, height **64px**
- 3 groups separated by 1px vertical hairlines (waveform divider)
- Background: solid black, bottom 1px white@12% divider
- z-index: above board, below modals
- Footer area: **kept empty** (future ad placement; never put persistent chrome there)

---

## Sub-Phases

Implementation split into 4 independently shippable sub-phases.

### 1A — Top Header Restructure (~half day)

**Files**:
- Modify: `components/board/Toolbar.tsx` → restructure into 3 groups
- Modify: `components/board/Toolbar.module.css` → grid 3-col layout, hairline dividers, sticky positioning
- Modify: `components/board/FilterPill.tsx` → bracket-wrapped style `[ ALL · 248 ]`
- Modify: `components/board/FilterPill.module.css` → waveform aesthetic
- Modify: `app/(app)/board/page.tsx` (or `BoardRoot.tsx`) → move Toolbar out of board scroll region
- Tests: update existing FilterPill / Toolbar tests for new markup

**Behavior**:
- Filter, Display, Share remain functional (no behavior change yet)
- Visual restyling only
- 3-group split with dividers
- Top header sticks; board scrolls underneath

### 1B — Card Size Slider, S/M/L → Continuous (~1 day)

**Files**:
- New: `components/board/SizeSlider.tsx` + `.module.css` + `.test.ts`
- Modify: `lib/board/types.ts` → introduce `cardWidth: number` field, deprecate `sizePreset` (keep readable for migration)
- Modify: `lib/board/column-masonry.ts` → accept continuous span / cardWidth
- Modify: `lib/storage/indexeddb.ts` → migration: S→160, M→240, L→320 (default 240)
- Modify: `components/board/CardsLayer.tsx` → use continuous size
- Modify: `components/share/ShareFrame.tsx` → adapt to new size model
- Remove: `components/board/SizePresetToggle.tsx` (and per-card hover toggle behavior)
- Tests: column-masonry continuous tests, migration round-trip test

**Slider spec**:
- Range: 80-480 (px)
- Default: 240
- Step: 1
- Visual width: ~120px in header
- Track: waveform frequency bars (seed-stable per session)
- Thumb: Gaussian swell pulse
- Floating readout: `[ 0240px ]` above thumb on drag

**Migration**:
- IndexedDB version bump
- Existing records: read sizePreset, set cardWidth = {S:160, M:240, L:320}
- New records: cardWidth = 240
- Field `sizePreset` retained as deprecated until next migration cycle

**Per-card resize affordance** (v1 decision):
- Global slider only — slider in top header sets the size for **all cards uniformly**
- Per-card individual resize (corner-handle drag) is **deferred** to a later phase
- Rationale: simpler model, less drag-state complexity, matches the "moodboard global zoom" mental model

### 1C — Board Zoom Slider (~half day)

**Files**:
- New: `components/board/ZoomSlider.tsx` + `.module.css` + `.test.ts`
- Modify: `components/board/BoardRoot.tsx` → apply `transform: scale(zoom)` to inner container
- Modify: `components/board/CardsLayer.tsx` → divide pointer event coords by zoom for hit testing
- Modify: `components/board/use-card-reorder-drag.ts` → zoom-aware coords

**Slider spec**:
- Range: 50-200 (%)
- Default: 100
- Step: 1
- Visual: same waveform-bar style as size slider
- Readout: `[ 100% ]`

**Implementation note**:
- CSS `transform: scale()` is cheaper than re-running masonry on zoom
- Masonry computes in logical (100%) coords; CSS scales the rendered output
- Mouse events: `event.clientX / zoom` to get logical coords
- Scroll wheel + Ctrl/Cmd: zoom shortcut (Figma pattern)

### 1D — View Dropdown (~half day)

**Files**:
- New: `components/board/ViewDropdown.tsx` + `.module.css` + `.test.ts`
- Modify: `components/board/Toolbar.tsx` → swap `DisplayModeSwitch` → `ViewDropdown`
- New: `lib/theme/types.ts` (theme system foundation)
- New: `lib/theme/use-theme.ts` (theme state hook, IndexedDB persistence)

**Dropdown structure**:
```
[ ▼ VIEW ]
  ── Display Mode ──
  • Collage  (current)
    Grid    (placeholder, not implemented this phase)
    Timeline (placeholder)
  ── Theme ──
  • Waveform (default, only one this phase)
    Liquid Glass (placeholder, future phase)
    SF / Military (placeholder, future phase)
    Editorial (destefanis pure, placeholder)
```

**Theme system**:
- Foundation only: theme state lives in IndexedDB, applied via `data-theme` attribute on root
- Initial state: `data-theme="waveform"` (= default)
- Other themes: switch path scaffolded but no theme CSS overrides yet
- `data-theme` attribute will scope theme-specific CSS in future phases

---

## Acceptance Criteria

### 1A
- [ ] Toolbar visually moves out of board area (no longer scrolls with content)
- [ ] 3-group layout with hairline dividers visible
- [ ] FilterPill uses bracket-wrapped count format
- [ ] Existing filter / share / display behaviors unchanged
- [ ] Tests pass (board E2E + unit)

### 1B
- [ ] Cards render at any size 80-480px (smooth slider)
- [ ] Existing S/M/L data migrates correctly (no card lost, sizes plausible)
- [ ] Masonry layout stable during slider drag (debounced or throttled)
- [ ] ShareFrame still functions
- [ ] No more S/M/L cycle UI

### 1C
- [ ] Zoom slider 50-200% works smoothly
- [ ] Drag-and-drop card reorder still works at all zoom levels
- [ ] Lightbox open from card still aligns visually at any zoom
- [ ] Ctrl/Cmd + scroll triggers zoom

### 1D
- [ ] View dropdown opens / closes correctly
- [ ] Display mode (collage) selectable; placeholders visible but disabled
- [ ] Theme = waveform default; other themes visible but disabled
- [ ] Theme state persists across reload (IndexedDB)
- [ ] `data-theme="waveform"` attribute on root element

---

## References

### Memory
- `project_phase_a_decisions.md` — destefanis-strict rules (cards stay clean)
- `project_liquidglass_as_theme.md` — themes as separate slot, not default chrome
- `feedback_strict_reference.md` — Phase A is reference-strict, individuality in Phase C

### Existing Code
- `components/board/LightboxNavMeter.tsx` — waveform aesthetic origin
- `lib/glass/displacement-map.ts` — Liquid Glass theme foundation (untouched this phase)
- `lib/board/constants.ts` — `COLUMN_MASONRY.TARGET_COLUMN_UNIT_PX` (currently 280)
- `lib/board/column-masonry.ts` — masonry algorithm

### Future Phases (not this spec)
- Phase 2: Share modal MVP rebuild (post-1A-1D)
- Phase 3: Liquid Glass theme (uses existing `LiquidGlass.tsx` foundation + 3 polish items per IDEAS.md)
- Phase 4: SF / Military theme
- Phase 5: Footer ad placement (Phase 2 of ad strategy)
