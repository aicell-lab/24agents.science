/** @jest-environment node */

import WebSocket from 'ws';
import { Blob as NodeBlob } from 'buffer';
import * as http from 'http';
import * as https from 'https';

const LIVE_SERVER_URL = 'https://hypha.aicell.io';
const EXCLUDED_TYPES = new Set(['dataset', 'model', 'collection']);

let composeMcp: (params: { toolIds: string[] }) => Promise<string>;
let searchItems: (params: { query: string }) => Promise<Array<{
    id: string;
    name: string;
    description?: string;
}>>;

const liveFetch: typeof fetch = async (input, init) => {
    const resolvedUrl = typeof input === 'string'
        ? input
        : input.url;
    const targetUrl = new URL(resolvedUrl);
    const requestLib = targetUrl.protocol === 'https:' ? https : http;

    return await new Promise<Response>((resolve, reject) => {
        const request = requestLib.request(
            targetUrl,
            {
                method: init?.method || 'GET',
                headers: {
                    Connection: 'close',
                    ...(init?.headers || {}),
                },
                agent: false,
            },
            response => {
                const chunks: Buffer[] = [];
                response.on('data', chunk => {
                    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
                });
                response.on('end', () => {
                    const bodyText = Buffer.concat(chunks).toString('utf-8');
                    const status = response.statusCode || 0;
                    const wrappedResponse = {
                        ok: status >= 200 && status < 300,
                        status,
                        async json() {
                            return JSON.parse(bodyText);
                        },
                    } as Response;
                    response.socket?.destroy();
                    resolve(wrappedResponse);
                });
                response.on('error', reject);
            }
        );

        request.on('error', reject);

        if (init?.body) {
            request.write(init.body as any);
        }

        request.end();
    });
};

// Real HTTP client for Node test runtime (no mocks).
(global as any).fetch = liveFetch;

if (!(global as any).WebSocket) {
    // Real websocket client for Node test runtime (no mocks).
    (global as any).WebSocket = WebSocket;
}

if (!(global as any).ImageData) {
    // Runtime shim only; network/service calls remain fully live.
    (global as any).ImageData = class ImageDataShim {};
}

if (!(global as any).Blob) {
    // Runtime shim only; network/service calls remain fully live.
    (global as any).Blob = NodeBlob;
}

({ composeMcp, searchItems } = require('./Query'));

interface ArtifactRecord {
    id: string;
    manifest?: {
        source?: string;
        function_name?: string;
        type?: string;
    };
    type?: string;
}

const fetchArtifact = async (artifactId: string): Promise<ArtifactRecord | null> => {
    const [workspace, artifactName] = artifactId.includes('/')
        ? artifactId.split('/')
        : ['24agents-science', artifactId];

    const url = `${LIVE_SERVER_URL}/${workspace}/artifacts/${artifactName}`;
    const response = await fetch(url);
    if (!response.ok) {
        return null;
    }
    return (await response.json()) as ArtifactRecord;
};

const isComposableArtifact = (artifact: ArtifactRecord): boolean => {
    const artifactType = artifact.manifest?.type ?? artifact.type;
    if (artifactType && EXCLUDED_TYPES.has(artifactType)) {
        return false;
    }

    const functionName = artifact.manifest?.function_name;
    const source = artifact.manifest?.source;

    if (!functionName && !artifact.id) {
        return false;
    }

    return Boolean(source || functionName);
};

const selectLiveComposableTool = async (query: string): Promise<string> => {
    const results = await searchItems({ query });
    const candidateIds = results.map(item => item.id).slice(0, 80);

    for (const artifactId of candidateIds) {
        const artifact = await fetchArtifact(artifactId);
        if (!artifact) {
            continue;
        }
        if (isComposableArtifact(artifact)) {
            return artifactId;
        }
    }

    throw new Error(
        `No live composable tool found for query='${query}'. `
        + `Checked ${candidateIds.length} candidates.`
    );
};

describe('Query live integration (no mocks)', () => {
    jest.setTimeout(120000);

    test('search_items returns live results', async () => {
        const results = await searchItems({ query: 'bio' });

        expect(Array.isArray(results)).toBeTruthy();
        expect(results.length).toBeGreaterThan(0);

        const first = results[0];
        expect(first.id).toBeTruthy();
        expect(first.name).toBeTruthy();
        expect(typeof first.description === 'string' || first.description === undefined)
            .toBeTruthy();
    });

    test('compose_mcp composes a real live tool', async () => {
        const liveToolId = await selectLiveComposableTool('query');
        const mcpUrl = await composeMcp({ toolIds: [liveToolId] });

        expect(mcpUrl.startsWith('https://')).toBeTruthy();
        expect(mcpUrl.includes('/mcp/')).toBeTruthy();
        expect(mcpUrl.endsWith('/mcp')).toBeTruthy();
    });
});
