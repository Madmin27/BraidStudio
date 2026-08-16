# BraidStudio external review request

This file is written for an external reviewer or AI assistant that will inspect the repository code directly.

## Current target

Build a deterministic polyester braided rope simulator for a Tres / maypole braiding machine.

Default recipe:

- Carrier count: 16
- Direction split: 8 S + 8 Z
- Rope diameter: 16 mm
- Braid angle: 34 degrees
- Yarn package: 20 filaments x 1000D
- Yarn width: 100%
- Over-under pattern: 1 over / 1 under diamond
- Default carrier colors: carriers 1 and 3 red, all others white

The visual target is a real white/red polyester braided rope: cohesive satin-like multifilament yarn blocks, clean red/white carrier boundaries, correct over-under order, no plastic strip look.

## Important current issue

The most important bug is not only material shading. It is braid topology / yarn-bundle handling.

Each carrier/bobbin must produce one cohesive yarn package. If a carrier has 20 filaments, those 20 filaments must travel together as one bundle and pass over or under other carriers together.

Wrong behavior:

- individual filaments from the same carrier receive separate carrier-scale over-under decisions;
- color appears to bleed at carrier block boundaries;
- red/white patches become cut fragments;
- angle or diameter changes break the pattern and physical fill.

Correct behavior:

- each carrier has one continuous centerline;
- filaments are local offsets inside that carrier frame;
- over-under deformation is applied to the whole carrier bundle;
- carrier identity and color remain continuous through every crossing.

## Files to inspect first

- `scripts/blender_polyester_live_render.py`
- `server.js`
- `DEV_STATE.md`
- `README.md`

The current renderer uses Blender/Cycles for high-quality polyester render output. The web app serves generated render images and cache keys from `server.js`.

## Questions to answer from the code

Please inspect the code and answer with formulas plus a concrete implementation order.

1. How should the carrier bundle centerline be computed for a 16-carrier maypole braid?
2. How should S and Z carrier centerlines be phase-aligned so that 8 S and 8 Z carriers form the correct diamond repeat?
3. How should the selected braid angle map to helix pitch / step length without breaking carrier spacing?
4. How should 20 filaments be attached as local offsets inside one carrier bundle frame?
5. At crossings, how should the whole carrier bundle receive radial / normal offset so the entire package goes over or under together?
6. How should bundle width and thickness be computed from rope diameter, carrier count, yarn width, filament count, and denier?
7. How should the physical fill ratio be enforced so 16 mm / 34 degrees / 20x1000D / 100% width remains visually full but not overpacked?
8. How should red/white carrier colors be assigned so colors never bleed between carriers?
9. Which single geometry change should be implemented first to fix the accepted-pattern regression?
10. Only after topology is correct, what Blender/Cycles polyester material and lighting values should be used for satin-like polyester without grey plastic or overexposed washout?

## Constraints

- Do not solve this by only changing lights or roughness.
- Do not create independent carrier-scale paths per filament.
- Do not let denier change carrier topology, color repeat, or over-under order.
- Keep the output deterministic for the same inputs.
- Prefer one diagnostic flat/close render proving carrier continuity before changing the final live renderer.

## Current working suspicion

The project needs to return to a carrier-block-first solver:

```text
Carrier centerline C_i(s)
Local frame T_i(s), U_i(s), V_i(s)
Filament j path F_ij(s) = C_i(s) + a_j(s) U_i(s) + b_j(s) V_i(s)
Crossing deformation applies to C_i and the whole local bundle envelope, not to each filament independently.
```

The first fix should likely be a diagnostic render that shows carrier IDs and over-under order without material complexity. If the carrier block topology is not correct there, any polyester shader work is wasted.
