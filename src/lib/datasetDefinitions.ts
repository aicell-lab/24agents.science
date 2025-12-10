export interface BasicDataset {
  serviceId: string;
  name: string;
  description: string;
}

export interface DatasetInfo {
  name: string;
  description: string;
  datasetAlias: string; // The base slug (e.g. "diabetes-dataset")

  // These are derived or explicit, but we keep them for convenience if needed.
  fullServiceId?: string; // workspace/clientId:serviceAlias
  fullArtifactId?: string; // workspace/artifactAlias
}

export interface DatasetIds {
  workspace: string;
  datasetAlias: string;
  clientId: string;       // datasetAlias + "-client"
  serviceAlias: string;   // datasetAlias
  serviceId: string;      // workspace/clientId:serviceAlias
  artifactAlias: string;  // datasetAlias
  artifactId: string;     // workspace/artifactAlias
}

export interface PrivacyDatasetManifest {
  name: string;
  description: string;
  service?: string; // Full service ID
  type: "dataset";
  source?: string; // MCP service name
}

export function slugifyDatasetName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export function buildDatasetIds(workspace: string, datasetAlias: string): DatasetIds {
  const clientId = `${datasetAlias}-client`;
  const serviceAlias = datasetAlias;
  const serviceId = `${workspace}/${clientId}:${serviceAlias}`;
  const artifactAlias = datasetAlias;
  const artifactId = `${workspace}/${artifactAlias}`;

  return {
    workspace,
    datasetAlias,
    clientId,
    serviceAlias,
    serviceId,
    artifactAlias,
    artifactId,
  };
}

export function createPrivacyDatasetManifest(args: {
  name: string;
  description: string;
  workspace: string;
  datasetAlias: string;
}): { manifest: PrivacyDatasetManifest; ids: DatasetIds } {
  const ids = buildDatasetIds(args.workspace, args.datasetAlias);
  const manifest: PrivacyDatasetManifest = {
    name: args.name,
    description: args.description,
    service: ids.serviceId,
    type: "dataset",
  };

  return { manifest, ids };
}

export function parseServiceId(fullServiceId: string): { workspace: string, clientId: string, serviceAlias: string } | null {
  // Expected format: workspace/clientId:serviceAlias
  const parts = fullServiceId.split('/');
  if (parts.length < 2) return null;

  const workspace = parts[0];
  const rest = parts.slice(1).join('/');

  const [clientId, serviceAlias] = rest.split(':');

  if (!clientId || !serviceAlias) return null;

  return { workspace, clientId, serviceAlias };
}

export function deriveDatasetAliasFromServiceAlias(serviceAlias: string): string {
  return serviceAlias;
}
