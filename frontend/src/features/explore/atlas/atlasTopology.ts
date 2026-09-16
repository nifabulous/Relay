export type AtlasTopologyGeometry = {
  id?: string | number;
  type: string;
  arcs?: unknown;
};

export type AtlasTopology = {
  type: "Topology";
  objects: {
    countries: {
      type: "GeometryCollection";
      geometries: AtlasTopologyGeometry[];
    };
  };
  arcs: unknown[];
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function parseAtlasTopology(value: unknown): AtlasTopology {
  if (!isObject(value) || value.type !== "Topology" || !Array.isArray(value.arcs)) {
    throw new Error("The atlas geography is not a valid topology.");
  }

  const objects = value.objects;
  const countries = isObject(objects) ? objects.countries : undefined;
  if (
    !isObject(countries) ||
    countries.type !== "GeometryCollection" ||
    !Array.isArray(countries.geometries)
  ) {
    throw new Error("The atlas geography is missing its countries topology.");
  }

  if (
    countries.geometries.some(
      (geometry) =>
        !isObject(geometry) ||
        typeof geometry.type !== "string" ||
        (geometry.id !== undefined && typeof geometry.id !== "string" && typeof geometry.id !== "number"),
    )
  ) {
    throw new Error("The atlas geography contains an invalid country geometry.");
  }

  return value as unknown as AtlasTopology;
}
