import { hyphaWebsocketClient } from 'hypha-rpc';
import { useCallback } from 'react';

const DEFAULT_SERVER_URL = 'https://hypha.aicell.io';
const DEFAULT_METHOD_TIMEOUT = 300;

interface ConnectionConfig {
  server_url?: string;
  token?: string;
  method_timeout?: number;
  client_id?: string;
}

export { DEFAULT_SERVER_URL };

/**
 * Get a valid token from localStorage if available
 */
export function getStoredToken(): string | null {
  const token = localStorage.getItem('token');
  if (token) {
    const tokenExpiry = localStorage.getItem('tokenExpiry');
    if (tokenExpiry && new Date(tokenExpiry) > new Date()) {
      return token;
    }
  }
  return null;
}

/**
 * Creates a fresh connection to the Hypha server, executes the callback,
 * and properly disconnects after the operation completes.
 *
 * This pattern ensures connections are always fresh and reliable,
 * avoiding issues with stale WebSocket connections.
 *
 * @param callback - Function to execute with the server connection
 * @param config - Optional connection configuration
 * @returns The result of the callback function
 *
 * @example
 * // Simple usage
 * const result = await withHyphaConnection(async (server) => {
 *   const artifactManager = await server.getService('public/artifact-manager');
 *   return await artifactManager.list({ collection: 'my-collection' });
 * });
 *
 * @example
 * // With custom token
 * const result = await withHyphaConnection(
 *   async (server) => {
 *     return await server.getService('my-service');
 *   },
 *   { token: myToken }
 * );
 */
export async function withHyphaConnection<T>(
  callback: (server: any) => Promise<T>,
  config?: ConnectionConfig
): Promise<T> {
  const token = config?.token ?? getStoredToken();
  const clientId = config?.client_id ?? `client-${Math.random().toString(36).substring(2, 9)}`;

  const connectionConfig = {
    server_url: config?.server_url ?? DEFAULT_SERVER_URL,
    method_timeout: config?.method_timeout ?? DEFAULT_METHOD_TIMEOUT,
    client_id: clientId,
    ...(token && { token }),
  };

  let server: any = null;

  try {
    server = await hyphaWebsocketClient.connectToServer(connectionConfig);

    if (!server) {
      throw new Error('Failed to connect to Hypha server');
    }

    const result = await callback(server);
    return result;
  } finally {
    // Always disconnect, even if an error occurred
    if (server) {
      try {
        await server.disconnect();
      } catch (disconnectError) {
        // Log but don't throw - the main operation result is more important
        console.warn('Error disconnecting from Hypha server:', disconnectError);
      }
    }
  }
}

/**
 * Creates a fresh connection to get a specific service, executes the callback,
 * and properly disconnects after the operation completes.
 *
 * @param serviceId - The service ID to fetch
 * @param callback - Function to execute with the service
 * @param config - Optional connection configuration
 * @returns The result of the callback function
 *
 * @example
 * const artifacts = await withHyphaService(
 *   'public/artifact-manager',
 *   async (artifactManager) => {
 *     return await artifactManager.list({ collection: 'my-collection' });
 *   }
 * );
 */
export async function withHyphaService<T>(
  serviceId: string,
  callback: (service: any) => Promise<T>,
  config?: ConnectionConfig & { serviceOptions?: any }
): Promise<T> {
  return withHyphaConnection(async (server) => {
    const service = await server.getService(serviceId, config?.serviceOptions);
    return await callback(service);
  }, config);
}

/**
 * Shorthand for getting the artifact manager and executing operations
 *
 * @param callback - Function to execute with the artifact manager
 * @param config - Optional connection configuration
 * @returns The result of the callback function
 *
 * @example
 * const artifact = await withArtifactManager(async (am) => {
 *   return await am.read({ artifact_id: 'my-artifact' });
 * });
 */
export async function withArtifactManager<T>(
  callback: (artifactManager: any) => Promise<T>,
  config?: ConnectionConfig
): Promise<T> {
  return withHyphaService('public/artifact-manager', callback, {
    ...config,
    serviceOptions: { case_conversion: 'camel' },
  });
}

/**
 * React hook that provides a function to execute operations with a fresh Hypha connection.
 * The connection is created when the operation is called and disconnected after completion.
 *
 * @returns A function that takes a callback and optional config, creates a fresh connection,
 *          executes the callback, and properly disconnects.
 *
 * @example
 * const withConnection = useHyphaConnection();
 *
 * const handleClick = async () => {
 *   const result = await withConnection(async (server) => {
 *     const service = await server.getService('my-service');
 *     return await service.doSomething();
 *   });
 * };
 */
export function useHyphaConnection() {
  const executeWithConnection = useCallback(
    async <T>(
      callback: (server: any) => Promise<T>,
      config?: ConnectionConfig
    ): Promise<T> => {
      return withHyphaConnection(callback, config);
    },
    []
  );

  return executeWithConnection;
}

/**
 * React hook that provides a function to execute operations with a specific Hypha service.
 * A fresh connection is created, the service is fetched, the callback is executed,
 * and the connection is properly disconnected.
 *
 * @param serviceId - The service ID to fetch
 * @returns A function that takes a callback and optional config
 *
 * @example
 * const withService = useHyphaService('public/artifact-manager');
 *
 * const handleClick = async () => {
 *   const artifacts = await withService(async (artifactManager) => {
 *     return await artifactManager.list({ collection: 'my-collection' });
 *   });
 * };
 */
export function useHyphaService(serviceId: string) {
  const executeWithService = useCallback(
    async <T>(
      callback: (service: any) => Promise<T>,
      config?: ConnectionConfig & { serviceOptions?: any }
    ): Promise<T> => {
      return withHyphaService(serviceId, callback, config);
    },
    [serviceId]
  );

  return executeWithService;
}
