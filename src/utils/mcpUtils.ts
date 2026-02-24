import { hyphaWebsocketClient } from 'hypha-rpc';
import { ArtifactInfo } from '../types/artifact';

/**
 * Composes an MCP service from a list of artifact IDs.
 * Connects to Hypha, fetches artifact details, registers a composed service,
 * and returns the MCP URL.
 * 
 * @param artifactIds Array of artifact IDs (e.g. "workspace/name" or just "name")
 * @returns Promise resolving to the MCP URL
 */
export async function composeMcpService(artifactIds: string[]): Promise<string> {
  // 1. Fetch artifact details for all IDs
  const artifacts: ArtifactInfo[] = await Promise.all(artifactIds.map(async (id) => {
    const [workspace, artifactName] = id.includes('/')
      ? id.split('/')
      : ['24agents-science', id];

    const url = `https://hypha.aicell.io/${workspace}/artifacts/${artifactName}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch artifact: ${artifactName}`);
    }

    return response.json();
  }));

  // 2. Connect to Hypha server
  // We use a random client_id to avoid conflicts and ensure valid fresh connection
  const server = await hyphaWebsocketClient.connectToServer({
    server_url: 'https://hypha.aicell.io',
    client_id: 'mcp-composer-' + Math.random().toString(36).substring(7),
  });

  // 3. Collect services and functions
  const serviceFunctions: any = {};
  const functionNameCounts: Record<string, number> = {};
  const skippedArtifacts: string[] = [];

  for (const artifact of artifacts) {
    // Check if this is a tool/function artifact
    const artifactType = artifact.manifest.type || artifact.type;

    // Skip non-tool artifacts (datasets, models, etc.)
    if (artifactType !== 'tool') {
      console.warn(`⊘ Skipping ${artifact.id} - type "${artifactType}" is not supported for MCP composition`);
      skippedArtifacts.push(`${artifact.manifest.name} (type: ${artifactType})`);
      continue;
    }

    // Get service ID and function name from artifact manifest
    const serviceId = artifact.manifest.source
      ? `hypha-agents/${artifact.manifest.source}`
      : 'hypha-agents/biomni'; // fallback for backward compatibility

    // Use the function_name from manifest, or fall back to artifact ID
    let baseFunctionName = artifact.manifest.function_name
      || artifact.id.split('/').pop()
      || artifact.id;

    // Handle function name collisions by appending a counter
    let functionName = baseFunctionName;
    if (functionNameCounts[baseFunctionName]) {
      functionNameCounts[baseFunctionName]++;
      functionName = `${baseFunctionName}_${functionNameCounts[baseFunctionName]}`;
    } else {
      functionNameCounts[baseFunctionName] = 1;
    }

    try {
      // Get the service
      console.log(`[${artifact.id}] Getting service: ${serviceId}, function: ${baseFunctionName} -> registering as: ${functionName}`);
      const service = await server.getService(serviceId);

      // Get function from service using the function name from manifest
      const func = service[baseFunctionName];

      if (func) {
        // Get the schema
        const schema = func.__schema__;

        // Store the function with schema for proxying (using possibly renamed function name)
        serviceFunctions[functionName] = Object.assign(
          async (...args: any[]) => {
            // Proxy call to original function
            return await func(...args);
          },
          { __schema__: schema }
        );

        console.log(`✓ Added function ${functionName} from service ${serviceId}`);
      } else {
        console.error(`✗ Function ${baseFunctionName} not found in service ${serviceId}`);
        skippedArtifacts.push(`${artifact.manifest.name} (function not found)`);
      }
    } catch (error) {
      console.error(`✗ Failed to get service for artifact ${artifact.id}:`, error);
      skippedArtifacts.push(`${artifact.manifest.name} (error: ${error})`);
    }
  }

  if (Object.keys(serviceFunctions).length === 0) {
    throw new Error('No valid tool artifacts found. Only "tool" type artifacts can be composed into MCP services.');
  }

  // 4. Register the composed service
  const composedServiceId = 'composed-' + Date.now();

  await server.registerService({
    type: 'composed-mcp-service',
    id: composedServiceId,
    name: 'Composed MCP Service',
    description: `Composed service with ${Object.keys(serviceFunctions).length} functions from ${artifacts.length} artifacts`,
    config: {
      visibility: 'public',
      require_context: true
    },
    ...serviceFunctions
  });

  // 5. Build and return the MCP URL
  const serverUrl = server.config.server_url || 'https://hypha.aicell.io';
  const builtServiceUrl = `${serverUrl}/${server.config.workspace}/services/${composedServiceId}`;
  const mcpUrl = builtServiceUrl.replace('/services/', '/mcp/') + '/mcp';
  
  return mcpUrl;
}
