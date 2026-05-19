export type ProviderMetadata = Record<string, unknown>;

export function isProviderMetadata(value: unknown): value is ProviderMetadata {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function preserveProviderMetadata(
  source: Record<string, unknown>,
  knownKeys: readonly string[],
): ProviderMetadata {
  const knownKeySet = new Set(knownKeys);

  return Object.fromEntries(Object.entries(source).filter(([key]) => !knownKeySet.has(key)));
}
