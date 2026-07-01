import * as THREE from "three";

const COLOR_MAP = {
  white: "#f8faf9",
  beyaz: "#f8faf9",
  black: "#171a18",
  siyah: "#171a18",
  red: "#d51f17",
  kırmızı: "#d51f17",
  blue: "#17437a",
  mavi: "#17437a",
  lacivert: "#17437a",
  yellow: "#d8c300",
  sarı: "#d8c300",
  green: "#287a43",
  yeşil: "#287a43",
  orange: "#d96c1a",
  turuncu: "#d96c1a",
  purple: "#6b3fa0",
  mor: "#6b3fa0",
  gray: "#77817b",
  gri: "#77817b"
};

export function resolveYarnColor(color, fallback = "#f8faf9") {
  const value = String(color || "").trim().toLowerCase();
  if (!value) return fallback;
  if (value.startsWith("#")) return normalizeHex(value, fallback);
  return COLOR_MAP[value] || fallback;
}

export function createYarnMaterial(color, options = {}) {
  return new THREE.MeshStandardMaterial({
    color: resolveYarnColor(color),
    roughness: Number.isFinite(options.roughness) ? options.roughness : 0.62,
    metalness: Number.isFinite(options.metalness) ? options.metalness : 0.02
  });
}

export function createCoreMaterial(options = {}) {
  return new THREE.MeshStandardMaterial({
    color: options.color || "#ede9df",
    roughness: 0.78,
    metalness: 0
  });
}

function normalizeHex(value, fallback) {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return `#${value.slice(1).split("").map((char) => char + char).join("")}`;
  }
  return fallback;
}
