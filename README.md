# ARES-NAV

ARES-NAV is a research/demo interface for exploring an EVA navigation concept for Gale Crater. It includes a synthetic terrain grid, weighted A* route planning, modeled radio line-of-sight, five selectable demonstration layers, route telemetry, waypoint cards, and habitat/visor views.

**This is not operational mission software, not flight-certified, and not a source of astronaut safety guidance.** The current terrain, mineral classes, waypoints, imagery-like illustrations, radio model, and environmental inputs are synthetic or illustrative. They are not NASA observations. NASA does not endorse ARES-NAV or any non-U.S. Government entity and is not responsible for information on non-U.S. Government websites. Use any external data only under that source's own terms.

## Current status

- Synthetic Gale-sector generator with explicit `SYNTHETIC_GALE_CALIBRATED` provenance.
- A* route solver with hard terrain kinematic constraints, route modes, target validation, and shelter-cell routing.
- Terrain-derived slope and sky-view model plus a simplified terrain radio-visibility calculation.
- Route-based illustrative oxygen, battery, and radiation calculations; these are prototype estimates, not validated operational telemetry.
- Habitat planner with selectable synthetic layers, manual map targeting, waypoint details, and route profile.
- Visor-style display and simulated SEP scenario control.
- Integrity-protected spatial store and telemetry write-ahead log from the starter phase are retained; browser IndexedDB persistence and actual offline packaging are not yet integrated into this interface.

## Not yet integrated

No NASA raster/image data is currently bundled or fetched. The layer controls are visualizations of synthetic model output, not live HiRISE, MOLA, CRISM, THEMIS, RAD, REMS, or Mars Trek products. The waypoint scene is an authored SVG illustration, not a Curiosity image. The current demo does not implement IndexedDB caching, a service worker, a Web Worker, a real Mars Trek WMTS client, verified product metadata, or validated crew suit telemetry.

Before representing any layer as a NASA product, add the actual source files or service integration, document product identifiers, resolution, coordinate reference system, acquisition time, processing steps, licensing/data-use terms, uncertainty, and checksums. Preserve NASA's attribution and non-endorsement requirements.

## Local setup and verification

```sh
npm install
npm run dev
npm run verify
```

`npm run verify` runs the repository's comment guard, Vitest suite, TypeScript check, and production build. GitHub Actions runs the same verification on pull requests.

## Data provenance and safety

- Grid generation is deterministic synthetic terrain for interface and algorithm demonstration only.
- Reference Gale Crater coordinates and Mars gravity are configuration inputs, not a claim that the rendered 1 km grid is geographically registered to a NASA basemap.
- Waypoint coordinates and science descriptions are illustrative placeholders and must be independently validated before any scientific interpretation.
- Radio visibility and sky-view are simplified terrain calculations, not validated communications or radiation forecasts.
- Radiation rates, dose multipliers, oxygen use, and battery use are scenario/model inputs. They must not be used to plan a real EVA.
- NASA names and mission/instrument names identify potential public data sources only; they do not imply NASA approval, partnership, or product integration.

## NASA attribution and non-endorsement

Potential source families for future integration include NASA/JPL Mars Trek, MRO HiRISE, MGS MOLA, MRO CRISM, Mars Odyssey THEMIS, Curiosity RAD, REMS, and Mastcam/Navcam products. None is currently integrated as observed data in this demo. NASA does not endorse ARES-NAV or any non-U.S. Government entity and is not responsible for information contained on non-U.S. Government websites. Participants must comply with applicable data-use parameters for each specific website or dataset.
