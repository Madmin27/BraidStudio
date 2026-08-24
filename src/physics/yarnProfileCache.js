import { buildYarnProfile, buildYarnProfileCacheKey } from "./yarnProfile.js";

const profileCache = new Map();

export function getCachedYarnProfile(input = {}) {
  const key = buildYarnProfileCacheKey(input);
  if (!profileCache.has(key)) {
    profileCache.set(key, buildYarnProfile(input));
  }
  return profileCache.get(key);
}

export function hasCachedYarnProfile(input = {}) {
  return profileCache.has(buildYarnProfileCacheKey(input));
}

export function clearYarnProfileCache() {
  profileCache.clear();
}

export function yarnProfileCacheStats() {
  return { size: profileCache.size };
}
