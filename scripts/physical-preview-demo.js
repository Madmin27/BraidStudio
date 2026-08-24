import { solvePhysicalPreview } from "../src/physics/physicalPreviewSolver.js";

const result = solvePhysicalPreview({
  carrierCount: 16,
  yarnConstruction: {
    material: "polyester",
    linearDensityDenier: 1000,
    denierBasis: "per_end",
    endsPerCarrier: 2,
    pliesPerEnd: 1,
    filamentsPerEnd: 192,
    packingFactor: 0.75,
    baseAspectRatio: 2.2
  },
  braidGeometry: {
    coreDiameterMm: 8,
    braidAngleDegFromAxis: 45
  }
});

console.log(JSON.stringify(result, null, 2));
