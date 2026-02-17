# ITAIKO Web Configurator

## What is this?
A React PWA that configures and monitors the ITAIKO custom Taiko drum controller (RP2040-based) via Web Serial API. Users adjust pad sensitivity thresholds, key mappings, debounce timings, and view real-time sensor data through WebGL graphs.

## Tech Stack
- **React 19** + **TypeScript 5.9** (strict mode)
- **Vite 7** (build + dev server)
- **Tailwind CSS v4** (OKLCH color system, CSS custom properties, dark mode default)
- **Radix UI** primitives + **shadcn/ui** (new-york style, `components.json`)
- **Lucide React** icons
- **webgl-plot** for real-time sensor visualization
- **pnpm** package manager
- **PWA** via vite-plugin-pwa

## Commands
```
pnpm dev        # Start dev server with HMR
pnpm build      # Type check (tsc -b) + production build
pnpm lint       # ESLint
pnpm preview    # Preview production build
```

## Project Structure
```
src/
├── App.tsx                         # Router: / → LandingPage, /configure → ConfigurePage
├── main.tsx                        # Entry point
├── components/
│   ├── configuration/              # PadConfigGroup, TimingSettings, ADCChannelSettings,
│   │                               # InteractiveKeyMapping, BootScreenEditor, ConfigurationTab
│   ├── connection/                 # HeaderConnectionStatus, ConnectionPanel,
│   │                               # FirmwareUpdatePanel/Modal, EmergencyRecoveryModal
│   ├── monitor/                    # LiveMonitorTab, MonitorControls, PadGraph (WebGL)
│   ├── visual/                     # HitHistoryGrid
│   └── ui/                         # shadcn/ui primitives (button, card, dialog, slider, etc.)
├── context/
│   └── DeviceContext.tsx           # Main provider — exposes connection, config, streaming, firmware state
├── hooks/
│   ├── useWebSerial.ts             # Web Serial API wrapper (connect/disconnect/read/write)
│   ├── useDeviceConfig.ts          # Config CRUD, undo/redo history, dirty tracking
│   ├── useDeviceStreaming.ts       # Real-time 100Hz sensor data, circular buffers, throttled UI
│   ├── useFirmwareUpdate.ts        # Firmware check/install logic
│   └── useKeyboardInput.ts         # Keyboard trigger simulation
├── lib/
│   ├── serial-protocol.ts          # Protocol parsing/encoding (commands 1000-3003)
│   ├── hid-keycodes.ts             # USB HID keycode tables
│   ├── default-config.ts           # Default device settings
│   └── utils.ts                    # cn() utility, version comparison
├── pages/
│   ├── LandingPage.tsx             # Marketing/hero page
│   └── ConfigurePage.tsx           # Main app (wraps children in DeviceProvider)
└── types/
    ├── index.ts                    # Core types: DeviceConfig, PadName, TriggerState, etc.
    └── webserial.d.ts              # Web Serial API type declarations
```

## Architecture

### State Management
React Context (`DeviceContext`) is the single global state provider, composed from 5 custom hooks:
- `useWebSerial` — serial port lifecycle, line-buffered I/O
- `useDeviceConfig` — config object + undo/redo stacks + dirty flag
- `useDeviceStreaming` — circular Float32Array buffers, trigger accumulation
- `useFirmwareUpdate` — update status, progress tracking
- `useKeyboardInput` — active key detection

### Serial Protocol
Text-based commands over USB Serial (115200 baud, `\n` delimited):
- **1000**: Read all settings → `key:value` pairs (46 settings, indices 0-45)
- **1001**: Save to flash
- **1002**: Enter write mode (then `key:value` pairs to set)
- **1003**: Reload from flash
- **1004**: Reboot to BOOTSEL (firmware update mode)
- **2000**: Start raw streaming (100Hz, 16-char hex: kaL/donL/donR/kaR)
- **2001**: Stop streaming
- **2002**: Start input bitmask streaming
- **3000**: Start boot screen upload
- **3003**: Clear boot screen

Full protocol spec: `SERIAL_CONFIG.md`

### Domain Model
4 drum pads: `kaLeft`, `donLeft`, `donRight`, `kaRight` (Don = face, Ka = rim)
Each pad has: light threshold, heavy threshold, cutoff threshold, ADC channel
Global timings: debounce, key hold time, double-trigger mode

### Key Patterns
- Path alias: `@/*` → `src/*`
- Barrel exports from `hooks/index.ts` and `types/index.ts`
- Components use `useDevice()` hook to access DeviceContext
- shadcn/ui components in `src/components/ui/` — use CVA + Radix + Tailwind
- Circular buffers for zero-allocation high-frequency data handling
- 8ms frame throttle (~120fps) for graph updates
- Config auto-write with 500ms debounce after changes

## Conventions
- **Components**: PascalCase filenames and exports
- **Hooks/utils**: camelCase filenames
- **Constants**: SCREAMING_SNAKE_CASE
- **Types**: PascalCase interfaces/types
- **Imports**: ES modules with `@/` path alias
- **No test framework** currently configured
- **No CI/CD** beyond GitHub Actions (deployment)

## Browser Requirements
WebSerial API (Chrome/Edge), WebGL, ES2022+
