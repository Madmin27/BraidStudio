# Polyester Multifilament Rendering Model

## Contract

The production model has three scales and they must not be collapsed:

1. A machine carrier follows one continuous Maypole centerline.
2. Each carrier contains the selected number of yarn ends (`tel sayisi`).
3. Each yarn end is multifilament. Its microfilament count is inferred from an
   explicit denier-per-filament calibration, not represented as one thick tube.

For the current default, `20 ends x 1000D` means 20 separate 1000-denier yarn
ends in each carrier. A 1000D end is subdivided into microfilaments using the
configured target DPF. The UI must eventually expose DPF or filament count
because total denier alone cannot uniquely identify the spinneret filament count.

The current HT-polyester reference calibration is `1000D/444F`, approximately
`2.25 denier/filament` and `15.2 micrometers` filament diameter. This is an
explicit, replaceable material preset rather than a value inferred from denier.

## Physical Mapping

- Polyester density: 1380 kg/m3.
- Denier: grams per 9000 meters.
- Solid area: `A = (denier / 9,000,000) / density`.
- Microfilament radius: `r = sqrt(A / pi)`.
- Carrier polymer area: sum of all yarn-end areas.
- Carrier envelope area: polymer area divided by packing fraction.
- Carrier width: one full-carrier circumferential lane corrected by braid angle.
  The two direction families share the surface, so the circumference is divided
  by all carriers, not only the carriers in one S/Z family.
- Carrier thickness: envelope area divided by carrier width.

Denier changes microfilament radius and total material area. Yarn-end count
changes real material area and fiber population. Rope diameter changes only the
braid envelope. Braid angle changes centerline pitch and lane projection.

## Optical Model

- Explicit micron-scale surface curves for the proof render.
- Opaque polyester absorption; no glass-like transmission.
- Fiber-axis scattering or tangent-locked anisotropic reflection.
- Broad grazing sheen plus narrow, broken longitudinal glints.
- Fiber self-shadow, carrier contact shadow, and small correlated roughness.
- Core, regular, migration, and sparse hair fibers are separate populations.

## Quality Gates

1. Single carrier: cohesive satin ribbon, no visible plastic rods.
2. One crossing: continuous upper/lower carriers, group compression and contact shadow.
3. Full braid: only after the first two renders pass against the target crop.
4. Live Three.js integration: only after the offline reference is approved.

## Primary References

- Cornell fabric micro-appearance research: https://www.cs.cornell.edu/projects/ctcloth/
- Real-time fiber-level cloth rendering: https://people.csail.mit.edu/kuiwu/rtfr.html
- Blender curve and hair shading documentation: https://docs.blender.org/manual/en/latest/render/shader_nodes/shader/hair_principled.html
- TexGen textile geometry: https://texgen.sourceforge.io/
