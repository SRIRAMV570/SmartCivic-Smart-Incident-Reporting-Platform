export const INCIDENT_EMBEDDING_DIMENSIONS = 384;
export const INCIDENT_EMBEDDING_MODEL = "smartcivic-feature-hash-v1";

function hashFeature(feature: string) {
  let hash = 2166136261;
  for (let index = 0; index < feature.length; index += 1) {
    hash ^= feature.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function embedIncidentText(text: string): number[] {
  const tokens =
    text.toLowerCase().match(/[\p{L}\p{N}]+/gu)?.filter((token) => token.length > 1) ?? [];
  const features = [...tokens];

  for (let index = 0; index < tokens.length - 1; index += 1) {
    features.push(`${tokens[index]}_${tokens[index + 1]}`);
  }

  const vector = Array<number>(INCIDENT_EMBEDDING_DIMENSIONS).fill(0);
  for (const feature of features) {
    const hash = hashFeature(feature);
    const bucket = hash % INCIDENT_EMBEDDING_DIMENSIONS;
    vector[bucket] += hash & 1 ? 1 : -1;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude > 0) {
    for (let index = 0; index < vector.length; index += 1) {
      vector[index] /= magnitude;
    }
  }

  return vector;
}
