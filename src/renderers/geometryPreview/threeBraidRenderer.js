import * as THREE from "three";
import { createCoreMaterial, createYarnMaterial } from "./yarnMaterials.js";
import { buildYarnPaths } from "./yarnPathBuilder.js";

export function createScene(options = {}) {
  const scene = new THREE.Scene();
  scene.background = options.background === false ? null : new THREE.Color(options.background || 0xffffff);

  const camera = new THREE.PerspectiveCamera(
    options.fov || 35,
    options.aspect || 16 / 5,
    options.near || 0.1,
    options.far || 2000
  );
  camera.position.set(options.cameraX || 0, options.cameraY || -34, options.cameraZ || 22);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, options.ambientIntensity || 0.72));
  const key = new THREE.DirectionalLight(0xffffff, options.keyIntensity || 1.15);
  key.position.set(-40, -60, 60);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, options.fillIntensity || 0.42);
  fill.position.set(40, 40, 30);
  scene.add(fill);

  return { scene, camera };
}

export function createBraidGeometryPreview({
  recipe = {},
  machineProfile = null,
  simulatorOutput = null,
  options = {}
} = {}) {
  const yarnModel = buildYarnPaths({
    recipe,
    machineProfile,
    simulatorOutput,
    steps: options.steps || 96,
    length: options.length || 300,
    ropeRadius: options.ropeRadius || 5,
    yarnRadius: options.yarnRadius ?? null,
    angularStep: options.angularStep ?? null,
    overOffset: options.overOffset,
    underOffset: options.underOffset,
    samplesPerStep: options.samplesPerStep || 3
  });

  const group = new THREE.Group();
  group.name = options.name || "BraidStudioGeometryPreview";

  if (options.showCore !== false) {
    group.add(createCoreMesh(yarnModel, options));
  }

  const yarnMeshes = yarnModel.carrierPaths
    .map((carrierPath) => createYarnMesh(carrierPath, yarnModel, options))
    .filter(Boolean);

  for (const mesh of yarnMeshes) group.add(mesh);

  return {
    group,
    yarnModel,
    yarnMeshes,
    dispose() {
      disposeGroup(group);
    }
  };
}

export function mountThreeBraidPreview({
  container,
  recipe = {},
  machineProfile = null,
  simulatorOutput = null,
  options = {}
} = {}) {
  if (!container) throw new Error("container is required for geometry preview.");

  const width = options.width || container.clientWidth || 900;
  const height = options.height || container.clientHeight || 220;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(options.pixelRatio || globalThis.devicePixelRatio || 1);
  renderer.setSize(width, height);
  renderer.domElement.setAttribute("aria-label", options.ariaLabel || "Three.js yarn geometry preview");
  renderer.domElement.className = options.canvasClassName || "geometry-rope-canvas";
  container.replaceChildren(renderer.domElement);

  const { scene, camera } = createScene({
    aspect: width / Math.max(height, 1),
    background: options.background ?? 0xffffff,
    cameraX: options.cameraX,
    cameraY: options.cameraY,
    cameraZ: options.cameraZ,
    fov: options.fov
  });
  const preview = createBraidGeometryPreview({
    recipe,
    machineProfile,
    simulatorOutput,
    options
  });
  scene.add(preview.group);
  renderer.render(scene, camera);

  return {
    ...preview,
    scene,
    camera,
    renderer,
    render() {
      renderer.render(scene, camera);
    },
    dispose() {
      preview.dispose();
      renderer.dispose();
      container.replaceChildren();
    }
  };
}

export function createYarnMesh(carrierPath, yarnModel, options = {}) {
  if (!Array.isArray(carrierPath.points) || carrierPath.points.length < 2) return null;

  const curvePoints = carrierPath.points.map((point) => new THREE.Vector3(point.x, point.y, point.z));
  const curve = new THREE.CatmullRomCurve3(curvePoints, false, "centripetal", 0.35);
  const geometry = new THREE.TubeGeometry(
    curve,
    options.tubularSegments || Math.max(24, carrierPath.points.length * 2),
    options.yarnRadius || yarnModel.yarnRadius,
    options.radialSegments || 14,
    false
  );
  const material = createYarnMaterial(carrierPath.carrier.color, options.material);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `carrier-${carrierPath.carrier.carrier_no}`;
  mesh.userData = {
    carrier_no: carrierPath.carrier.carrier_no,
    color: carrierPath.carrier.color,
    direction: carrierPath.carrier.direction
  };
  return mesh;
}

function createCoreMesh(yarnModel, options = {}) {
  const radius = Math.max(0.1, options.coreRadius || yarnModel.ropeRadius * 0.72);
  const geometry = new THREE.CylinderGeometry(
    radius,
    radius,
    yarnModel.length,
    options.coreRadialSegments || 48,
    1,
    true
  );
  geometry.rotateZ(Math.PI / 2);
  const material = createCoreMaterial(options.coreMaterial);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "braid-core-reference";
  return mesh;
}

function disposeGroup(group) {
  group.traverse((item) => {
    item.geometry?.dispose?.();
    if (Array.isArray(item.material)) {
      item.material.forEach((material) => material.dispose?.());
    } else {
      item.material?.dispose?.();
    }
  });
}
