import React, { useEffect, useState } from 'react';
import { useHyphaStore } from '../store/hyphaStore';
import { Button, Snackbar, Alert, CircularProgress } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { hyphaWebsocketClient } from 'hypha-rpc';

const SCHEMAS = {
    searchItems: {
        name: "search_items",
        description: "Search for tools and artifacts in the gallery.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Search query to filter artifacts."
                }
            },
            required: ["query"]
        }
    },
    composeMcp: {
        name: "compose_mcp",
        description: "Compose selected tools into a new MCP service.",
        parameters: {
            type: "object",
            properties: {
                toolIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of tool/artifact IDs to compose."
                }
            },
            required: ["toolIds"]
        }
    }
};

const searchItems = async (query: string) => {
    try {
        let url = `https://hypha.aicell.io/24agents-science/artifacts/24agents.science/children?stage=false`;

        if (query) {
            const keywords = query.split(' ').map(k => k.trim());
            if (keywords.length > 0) {
                url += `&keywords=${encodeURIComponent(keywords.join(','))}`;
            }
        }

        const response = await fetch(url);
        const data = await response.json();
        return data.items || [];
    } catch (e) {
        console.error("Error in searchItems:", e);
        throw e;
    }
};

const processArtifact = async (
    artifact: any,
    composedClient: any,
    serviceFunctions: any,
    functionNameCounts: Record<string, number>
) => {
    const artifactType = artifact.manifest.type || artifact.type;
    if (artifactType === 'dataset' || artifactType === 'model' || artifactType === 'collection') {
        return;
    }

    const serviceId = artifact.manifest.source
        ? `hypha-agents/${artifact.manifest.source}`
        : 'hypha-agents/biomni';

    const baseFunctionName = artifact.manifest.function_name
        || artifact.id.split('/').pop()
        || artifact.id;

    let functionName = baseFunctionName;
    if (functionNameCounts[baseFunctionName]) {
        functionNameCounts[baseFunctionName]++;
        functionName = `${baseFunctionName}_${functionNameCounts[baseFunctionName]}`;
    } else {
        functionNameCounts[baseFunctionName] = 1;
    }

    try {
        const service = await composedClient.getService(serviceId);
        const func = service[baseFunctionName];

        if (func) {
            const schema = func.__schema__;
            serviceFunctions[functionName] = Object.assign(
                async (...args: any[]) => {
                    return await func(...args);
                },
                { __schema__: schema }
            );
        }
    } catch (e) {
        console.error(`Failed to bind function ${functionName}`, e);
    }
};

const composeMcp = async (toolIds: string[]) => {
    console.log("composeMcp called with:", toolIds);
    // Connect to Hypha server for the new service
    const composedClient = await hyphaWebsocketClient.connectToServer({
        server_url: 'https://hypha.aicell.io',
        client_id: 'composer-client-' + Math.random().toString(36).substring(7),
    });

    // Fetch artifacts
    const artifacts = [];
    for (const id of toolIds) {
        const [workspace, artifactName] = id.includes('/')
            ? id.split('/')
            : ['24agents-science', id];
        const url = `https://hypha.aicell.io/${workspace}/artifacts/${artifactName}`;
        try {
            const resp = await fetch(url);
            if (resp.ok) artifacts.push(await resp.json());
        } catch (e) {
            console.error(`Failed to fetch artifact ${id}`, e);
        }
    }

    const serviceFunctions: any = {};
    const functionNameCounts: Record<string, number> = {};

    for (const artifact of artifacts) {
        await processArtifact(artifact, composedClient, serviceFunctions, functionNameCounts);
    }

    if (Object.keys(serviceFunctions).length === 0) {
        throw new Error('No valid tools found to compose.');
    }

    const composedServiceId = 'composed-' + Date.now();
    await composedClient.registerService({
        type: 'composed-mcp-service',
        id: composedServiceId,
        name: 'Composed MCP Service',
        description: `Composed service with ${Object.keys(serviceFunctions).length} functions`,
        config: {
            visibility: 'public',
            require_context: true
        },
        ...serviceFunctions
    });

    const serverUrl = composedClient.config.server_url || 'https://hypha.aicell.io';
    const builtServiceUrl = `${serverUrl}/${composedClient.config.workspace}/services/${composedServiceId}`;
    const mcpUrl = builtServiceUrl.replace('/services/', '/mcp/') + '/mcp';

    return mcpUrl;
};

const Query: React.FC<{ serviceId?: string }> = ({ serviceId: customServiceId }) => {
    const { server, isConnected, connect, isConnecting } = useHyphaStore();
    const [mcpUrl, setMcpUrl] = useState<string>('');
    const [status, setStatus] = useState<string>('Initializing...');
    const [snackbarOpen, setSnackbarOpen] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');

    useEffect(() => {
        if (!server && !isConnected && !isConnecting) {
            connect({ server_url: 'https://hypha.aicell.io' });
        }
    }, [server, isConnected, isConnecting, connect]);

    useEffect(() => {
        let mounted = true;
        if (!server || !isConnected) return;

        const registerQueryService = async () => {
            const serviceId = customServiceId || `query-service-${Math.random().toString(36).substring(2, 9)}`;

            try {
                await server.registerService({
                    id: serviceId,
                    type: 'query-service',
                    config: {
                        visibility: 'public',
                        require_context: true,
                    },
                    searchItems: Object.assign(searchItems, { __schema__: SCHEMAS.searchItems }),
                    composeMcp: Object.assign(composeMcp, { __schema__: SCHEMAS.composeMcp })
                }, { overwrite: true });

                const serverUrl = server.config.public_base_url || server.config.server_url || 'https://hypha.aicell.io';
                const builtServiceUrl = `${serverUrl}/${server.config.workspace}/services/${serviceId}`;
                const mcp = builtServiceUrl.replace('/services/', '/mcp/') + '/mcp';

                if (mounted) {
                    setMcpUrl(mcp);
                    setStatus("Active");
                }
            } catch (e) {
                console.error("Failed to register query service", e);
                if (mounted) setStatus("Error registering service");
            }
        };

        registerQueryService();

        return () => {
            mounted = false;
        };
    }, [server, isConnected, isConnecting, customServiceId]);

    const handleCopyUrl = () => {
        if (mcpUrl) {
            navigator.clipboard.writeText(mcpUrl)
                .then(() => {
                    setSnackbarMessage('MCP URL copied to clipboard!');
                    setSnackbarOpen(true);
                })
                .catch(err => {
                    console.error('Failed to copy URL', err);
                    setSnackbarMessage('Failed to copy URL');
                    setSnackbarOpen(true);
                });
        }
    };

    return (
        <div className="w-full min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-cyan-50 flex flex-col items-center justify-center p-4">
            <div className="max-w-3xl w-full bg-white/70 backdrop-blur-sm rounded-xl p-8 border border-blue-200/50 shadow-xl text-center">
                <h1 className="text-3xl font-bold text-gray-800 mb-4">Query Service</h1>
                <p className="text-gray-600 mb-8">
                    An MCP server enabling agentic query and composition of tools.
                </p>

                {status === 'Active' ? (
                    <div className="space-y-6">
                        <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 shadow-inner">
                            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">MCP Server URL</h2>
                            <div className="flex flex-col sm:flex-row items-center gap-3">
                                <code className="text-lg sm:text-xl font-mono text-blue-600 break-all bg-white p-3 rounded-lg border border-gray-100 flex-1 w-full">
                                    {mcpUrl}
                                </code>
                                <Button
                                    variant="contained"
                                    onClick={handleCopyUrl}
                                    startIcon={<ContentCopyIcon />}
                                    sx={{
                                        background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                                        minWidth: '120px',
                                        height: '52px'
                                    }}
                                >
                                    Copy
                                </Button>
                            </div>
                        </div>
                        <p className="text-sm text-gray-500">
                            Copy this URL to your MCP client to access <code>searchItems</code> and <code>composeMcp</code> tools.
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center gap-4 py-8">
                        <CircularProgress />
                        <p className="text-gray-600">{status}</p>
                    </div>
                )}
            </div>

            <Snackbar
                open={snackbarOpen}
                autoHideDuration={3000}
                onClose={() => setSnackbarOpen(false)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert onClose={() => setSnackbarOpen(false)} severity="success" sx={{ width: '100%' }}>
                    {snackbarMessage}
                </Alert>
            </Snackbar>
        </div>
    );
};

export default Query;
