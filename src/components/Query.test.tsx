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

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup a "Real-ish" server mock that just accepts registration
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

        // Mock the composed client that composeMcp creates
        // This ensures composeMcp can proceed through the "connect" phase
        (hyphaWebsocketClient.connectToServer as jest.Mock).mockResolvedValue({
            config: {
                workspace: 'composed-workspace',
                server_url: 'https://hypha.aicell.io'
            },
            // This is called inside processArtifact to bind functions
            getService: jest.fn().mockResolvedValue({
                 // Mock a generic function that might exist on the tool
                 // We can't call the REAL remote tool via websocket in this test env seamlessly
                 // checking for __schema__ property access
                 test_function: Object.assign(async () => "result", { __schema__: {} }),
                 __schema__: {}
            }),
            registerService: jest.fn()
        });
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

    /**
     * Test Case 1: Search Items
     * Runs against the REAL 24agents.science public index via HTTP fetch.
     */
    test('searchItems returns sensible real results', async () => {
        render(<Query serviceId="query-service" />);
        
        await waitFor(() => {
            expect(mockServer.registerService).toHaveBeenCalled();
        }, { timeout: 10000 });

        const service = getService("query-service");
        
        // Execute REAL searchItems
        // This hits https://hypha.aicell.io/24agents-science/artifacts/24agents.science/children...
        console.log("Running searchItems('agent')...");
        const items = await service.searchItems("agent");

        console.log(`Found ${items.length} items for query "agent"`);
        
        expect(Array.isArray(items)).toBeTruthy();
        expect(items.length).toBeGreaterThan(0);
        
        // Check for sensible fields
        const firstItem = items[0];
        expect(firstItem).toHaveProperty('id');
        expect(firstItem).toHaveProperty('created_at');
        // Manifest should exist
        expect(firstItem.manifest).toBeDefined();
    });

    /**
     * Test Case 2: Compose MCP
     * Validates that composeMcp can fetch a real artifact manifest and setup the composed service.
     */
    test('composeMcp processes specific artifacts', async () => {
        render(<Query serviceId="query-service" />);
        await waitFor(() => expect(mockServer.registerService).toHaveBeenCalled());
        const service = getService("query-service");

        // 1. Find a real tool to use
        // We look for 'chat' related tools which are likely to exist
        const items = await service.searchItems("chat");
        if (items.length === 0) {
            console.warn("Skipping composeMcp test: No tools found for 'chat'");
            return;
        }
        
        // Pick one valid artifact ID
        const toolId = items[0].id;
        console.log(`Testing composeMcp with tool: ${toolId}`);

        // 2. Run composeMcp
        // This will:
        // - Fetch the artifact via HTTP (Real)
        // - Connect to "server" (Mocked WS client)
        // - Get the remote service (Mocked WS call)
        // - Register the composed service (Mocked WS call)
        const mcpUrl = await service.composeMcp([toolId]);

        console.log("Generated MCP URL:", mcpUrl);

        expect(mcpUrl).toContain('/mcp/mcp');
        expect(mcpUrl).toContain('https://hypha.aicell.io');
    });
});
