import React from 'react';
import { render, waitFor } from '@testing-library/react';
import Query from './Query';
import { useHyphaStore } from '../store/hyphaStore';
import { hyphaWebsocketClient } from 'hypha-rpc';

// Mock the store hook but provide a fake server that captures the service
jest.mock('../store/hyphaStore', () => ({
    useHyphaStore: jest.fn()
}));

// We only mock the websocket client connection to avoid complexities of real WS in JSDOM
// But we keep the logic inside the service methods real (fetches, processing)
jest.mock('hypha-rpc', () => ({
    hyphaWebsocketClient: {
        connectToServer: jest.fn()
    }
}));

describe('Query Service Integration', () => {
    let mockServer: any;
    let registeredService: any;
    let composedRegisterService: jest.Mock;
    let fetchMock: jest.SpyInstance;

    beforeEach(() => {
        jest.clearAllMocks();

        fetchMock = jest.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
            const url = String(input);

            if (url.includes('/children?')) {
                return {
                    ok: true,
                    json: async () => ([
                        {
                            id: '24agents-science/query_geo',
                            manifest: {
                                name: 'query_geo',
                                description: 'Query GEO datasets'
                            }
                        },
                        {
                            id: '24agents-science/query_ensembl',
                            manifest: {
                                name: 'query_ensembl',
                                description: 'Query Ensembl'
                            }
                        }
                    ])
                } as Response;
            }

            if (url.endsWith('/24agents-science/artifacts/query_geo')) {
                return {
                    ok: true,
                    json: async () => ({
                        id: '24agents-science/query_geo',
                        manifest: {
                            source: 'biomni',
                            function_name: 'query_geo'
                        }
                    })
                } as Response;
            }

            return {
                ok: false,
                json: async () => ({})
            } as Response;
        });

        mockServer = {
            config: {
                workspace: 'test-user',
                public_base_url: 'https://hypha.aicell.io',
                server_url: 'https://hypha.aicell.io'
            },
            registerService: jest.fn().mockImplementation(async (service) => {
                // Capture the service definition so we can test its methods
                registeredService = service;
                return service;
            })
        };

        (useHyphaStore as unknown as jest.Mock).mockReturnValue({
            server: mockServer,
            isConnected: true
        });

        composedRegisterService = jest.fn().mockResolvedValue(undefined);

        (hyphaWebsocketClient.connectToServer as jest.Mock).mockResolvedValue({
            config: {
                workspace: 'composed-workspace',
                server_url: 'https://hypha.aicell.io'
            },
            getService: jest.fn().mockResolvedValue({
                query_geo: Object.assign(async () => ({ success: true }), {
                    __schema__: {
                        name: 'query_geo',
                        description: 'Query GEO'
                    }
                })
            }),
            registerService: composedRegisterService
        });
    });

    afterEach(() => {
        fetchMock.mockRestore();
    });

    const getService = (id: string) => {
        if (registeredService?.id === id) {
            return registeredService;
        }
        // Fallback if random ID was used (shouldn't be with our prop)
        if (registeredService?.id.includes('query-service')) {
            return registeredService;
        }
        throw new Error(`Service ${id} not found. Registered: ${registeredService?.id}`);
    };

    test('search_items returns tool list with expected shape', async () => {
        render(<Query serviceId="query-service" />);
        
        await waitFor(() => {
            expect(mockServer.registerService).toHaveBeenCalled();
        }, { timeout: 10000 });

        const service = getService("query-service");
        
        const items = await service.search_items({ query: 'agent' });
        
        expect(Array.isArray(items)).toBeTruthy();
        expect(items.length).toBeGreaterThan(0);

        const firstItem = items[0];
        expect(firstItem).toHaveProperty('id');
        expect(firstItem).toHaveProperty('name');
        expect(firstItem).toHaveProperty('description');
    });

    test('compose_mcp composes selected tool into MCP URL', async () => {
        render(<Query serviceId="query-service" />);
        await waitFor(() => expect(mockServer.registerService).toHaveBeenCalled());
        const service = getService("query-service");

        const mcpUrl = await service.compose_mcp({
            toolIds: ['24agents-science/query_geo']
        });

        expect(mcpUrl).toContain('/mcp/');
        expect(mcpUrl.endsWith('/mcp')).toBeTruthy();
        expect(mcpUrl).toContain('https://hypha.aicell.io');
        expect(composedRegisterService).toHaveBeenCalled();
    });
});
