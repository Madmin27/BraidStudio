import { buildYarnProfile, buildYarnProfileCacheKey } from "./yarnProfile.js";

export const MAX_YARN_PROFILE_CACHE_ENTRIES = 256;

const profileCache = new Map();

export function getCachedYarnProfile(input = {}) {
  const key = buildYarnProfileCacheKey(input);
  const cached = profileCache.get(key);
  if (cached) {
    // Refresh insertion order so the Map acts as a tiny LRU cache.
    profileCache.delete(key);
    profileCache.set(key, cached);
    return cached;
  }

  const profile = buildYarnProfile(input);
  profileCache.set(key, profile);
  trimCache();
  return profile;
}

export function hasCachedYarnProfile(input = {}) {
  return profileCache.has(buildYarnProfileCacheKey(input));
}

export function clearYarnProfileCache() {
  profileCache.clear();
}

export function yarnProfileCacheStats() {
  return {
    size: profileCache.size,
    maxEntries: MAX_YARN_PROFILE_CACHE_ENTRIES
  };
}

function trimCache() {
  while (profileCache.size > MAX_YARN_PROFILE_CACHE_ENTRIES) {
    const oldestKey = profileCache.keys().next().value;
    profileCache.delete(oldestKey);
  }
}
