import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, set } from 'idb-keyval';
import { useKernel } from '../contexts/KernelContext';
import { useHyphaStore } from '../store/hyphaStore';
import ReactMarkdown from 'react-markdown';
import KernelDebugTerminal from './KernelDebugTerminal';

interface DatasetMetadata {
  name: string;
  id: string;
  description: string;
  timestamp: number;
}

interface FileInfo {
  name: string;
  size: number;
  type: string;
  path: string;
}

interface ActivityLog {
  timestamp: number;
  type: 'mount' | 'doc_generation' | 'mcp_registration' | 'mcp_deactivation' | 'script_execution' | 'doc_refinement_error';
  message: string;
  details?: string;
}

interface DatasetInfoProps {
  dataset: DatasetMetadata;
}

export default function DatasetInfo({ dataset }: DatasetInfoProps) {
  const navigate = useNavigate();
  const { isReady, mountFolder, executeCode, kernelStatus, startKernel, restartKernel } = useKernel();
  const { isLoggedIn, server } = useHyphaStore();

  const [generatedDoc, setGeneratedDoc] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [refineFeedback, setRefineFeedback] = useState("");
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedDoc, setEditedDoc] = useState("");
  const [previousDoc, setPreviousDoc] = useState(""); // For undo functionality
  const [fileInfos, setFileInfos] = useState<FileInfo[]>([]);
  const [isMountingData, setIsMountingData] = useState(false);
  const [isMcpServerActive, setIsMcpServerActive] = useState(false);
  const [mcpServerUrl, setMcpServerUrl] = useState<string>("");
  const [serviceInfoUrl, setServiceInfoUrl] = useState<string>("");
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [isDebugTerminalOpen, setIsDebugTerminalOpen] = useState(false);
  const [isExplanationExpanded, setIsExplanationExpanded] = useState(false);
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());
  const [shouldAutoRegisterMcp, setShouldAutoRegisterMcp] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [registeredService, setRegisteredService] = useState<any>(null);
  const [connectionHealth, setConnectionHealth] = useState<'healthy' | 'checking' | 'reconnecting' | 'disconnected'>('healthy');
  const [refineError, setRefineError] = useState<string>("");

  // Helper to toggle log expansion
  const toggleLogExpanded = (index: number) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedLogs(newExpanded);
  };

  // Helper to strip ANSI escape codes
  const stripAnsi = (str: string): string => {
    return str.replace(/\x1b\[[0-9;]*m/g, '');
  };

  // Helper to add activity log
  const addActivityLog = async (type: ActivityLog['type'], message: string, details?: string) => {
    const log: ActivityLog = {
      timestamp: Date.now(),
      type,
      message,
      details
    };
    setActivityLogs(prev => [log, ...prev]);

    // Save logs to dataset metadata in IndexedDB
    try {
      const metadata = await get(`dataset_metadata_${dataset.id}`);
      if (metadata) {
        const updatedMetadata = {
          ...metadata,
          activityLogs: [log, ...(metadata.activityLogs || [])].slice(0, 100) // Keep last 100 logs
        };
        await set(`dataset_metadata_${dataset.id}`, updatedMetadata);
      }
    } catch (err) {
      console.error('Failed to save activity log to metadata:', err);
    }
  };

  // Load saved documentation OR generate new one when dataset changes
  useEffect(() => {
    const loadOrGenerateDoc = async () => {
      // First, try to load saved documentation
      const metadata = await get(`dataset_metadata_${dataset.id}`);
      if (metadata && metadata.description) {
        console.log('Loading saved documentation from metadata');
        setGeneratedDoc(metadata.description);
        return; // Don't generate if we have saved documentation
      }

      // Only generate if no saved documentation exists
      if (!isGenerating) {
        console.log('No saved documentation found, generating new one');
        scanFolderAndGenerateDoc();
      }
    };

    loadOrGenerateDoc();
  }, [dataset.id]);

  // Load activity logs from metadata when dataset changes
  useEffect(() => {
    const loadActivityLogs = async () => {
      try {
        const metadata = await get(`dataset_metadata_${dataset.id}`);
        if (metadata && metadata.activityLogs) {
          console.log('Loading activity logs from metadata');
          setActivityLogs(metadata.activityLogs);
        } else {
          // No saved logs, start fresh
          setActivityLogs([]);
        }
      } catch (err) {
        console.error('Failed to load activity logs:', err);
        setActivityLogs([]);
      }
    };

    loadActivityLogs();
  }, [dataset.id]);

  // Mount folder to kernel when kernel is ready
  useEffect(() => {
    if (isReady && !isMountingData) {
      mountDataToKernel();
    }
  }, [isReady, dataset.id]);

  // Deactivate MCP server when kernel becomes not ready (e.g., after restart)
  useEffect(() => {
    if (!isReady && isMcpServerActive) {
      console.log('Kernel is not ready, deactivating MCP server');
      setIsMcpServerActive(false);
      setMcpServerUrl("");
      setServiceInfoUrl("");
      addActivityLog('mcp_deactivation', 'MCP Server deactivated', 'Kernel was restarted or stopped');
    }
  }, [isReady, isMcpServerActive]);

  // Auto-register MCP server when kernel becomes ready (if flag is set)
  useEffect(() => {
    if (isReady && shouldAutoRegisterMcp && !isMcpServerActive) {
      console.log('Kernel is ready, auto-registering MCP server');
      setShouldAutoRegisterMcp(false);
      handleRegisterMcpServer();
    }
  }, [isReady, shouldAutoRegisterMcp, isMcpServerActive]);

  // Periodic health check for MCP server connection
  useEffect(() => {
    if (!isMcpServerActive || !server || !registeredService) {
      return;
    }

    const healthCheckInterval = setInterval(async () => {
      try {
        setConnectionHealth('checking');
        // Try to ping the server
        await server.ping?.();
        setConnectionHealth('healthy');
      } catch (error) {
        console.warn('Connection health check failed, attempting to reconnect...', error);
        setConnectionHealth('reconnecting');

        // Try to reconnect and re-register
        try {
          const { getToken, connect } = useHyphaStore.getState();
          const token = getToken();

          if (!token) {
            console.error('No token available for reconnection');
            setConnectionHealth('disconnected');
            setIsMcpServerActive(false);
            addActivityLog('mcp_deactivation', 'MCP Server disconnected', 'Session expired - please login again');
            return;
          }

          const activeServer = await connect({
            server_url: 'https://hypha.aicell.io',
            token: token,
            method_timeout: 300
          });

          console.log('Reconnected successfully, re-registering MCP server...');

          // Re-register the MCP server
          await handleRegisterMcpServer();
          setConnectionHealth('healthy');
          addActivityLog('mcp_registration', 'MCP Server reconnected successfully', 'Connection restored and service re-registered');
        } catch (reconnectError) {
          console.error('Failed to reconnect:', reconnectError);
          setConnectionHealth('disconnected');
          setIsMcpServerActive(false);
          setMcpServerUrl("");
          setServiceInfoUrl("");
          addActivityLog('mcp_deactivation', 'MCP Server disconnected', 'Failed to reconnect - please re-enable manually');
        }
      }
    }, 30000); // Check every 30 seconds

    return () => clearInterval(healthCheckInterval);
  }, [isMcpServerActive, server, registeredService]);

  const mountDataToKernel = async () => {
    if (isMountingData) return;

    try {
      setIsMountingData(true);
      console.log('Mounting dataset to kernel:', dataset.id);

      const handle = await get(`dataset_handle_${dataset.id}`);
      if (!handle) {
        console.error('Folder handle not found');
        return;
      }

      await mountFolder(handle);
      console.log('Dataset mounted successfully at /data');
      addActivityLog('mount', `Dataset "${dataset.name}" mounted to /data`, `Files accessible at /data in Python kernel`);

      if (executeCode) {
        await executeCode(`
import os
print("Mounted files in /data:")
for item in os.listdir("/data")[:10]:
    print(f"  - {item}")
        `);
      }
    } catch (err) {
      console.error('Failed to mount dataset:', err);
    } finally {
      setIsMountingData(false);
    }
  };

  const scanFolderAndGenerateDoc = async () => {
    try {
      const handle = await get(`dataset_handle_${dataset.id}`);
      if (!handle) {
        console.error('Folder handle not found');
        return;
      }

      setIsGenerating(true);
      const files: FileInfo[] = [];
      await scanDirectory(handle, '', files);
      setFileInfos(files);

      await generateDocumentation(files, dataset.name, dataset.description, '');
    } catch (error) {
      console.error('Failed to scan folder:', error);
      setIsGenerating(false);
    }
  };

  const scanDirectory = async (dirHandle: any, path: string, files: FileInfo[]) => {
    for await (const entry of dirHandle.values()) {
      const fullPath = path ? `${path}/${entry.name}` : entry.name;

      if (entry.kind === 'file') {
        const file = await entry.getFile();
        files.push({
          name: entry.name,
          size: file.size,
          type: file.type || 'unknown',
          path: fullPath
        });
      } else if (entry.kind === 'directory') {
        await scanDirectory(entry, fullPath, files);
      }
    }
  };

  const generateDocumentation = async (files: FileInfo[], datasetName: string, userDescription: string, feedback: string) => {
    try {
      const fileTypes = new Map<string, number>();
      files.forEach(f => {
        const ext = f.name.split('.').pop() || 'unknown';
        fileTypes.set(ext, (fileTypes.get(ext) || 0) + 1);
      });

      const fileSummary = Array.from(fileTypes.entries())
        .map(([ext, count]) => `${count} ${ext} files`)
        .join(', ');

      const sampleFiles = files.slice(0, 10).map(f => f.name).join(', ');

      try {
        if (!server) {
          throw new Error('Not connected to server');
        }
        const securityService = await server.getService(
          "hypha-agents/default@security-agent",
          { mode: "random" }
        );
        const result = await securityService.generate_dataset_description({
          dataset_name: datasetName,
          user_description: userDescription,
          file_summary: fileSummary,
          sample_files: sampleFiles,
          total_files: files.length,
          feedback: feedback || null,
          current_description: feedback ? generatedDoc : null
        });

        const docText = result.description || generateFallbackDoc(files, datasetName, userDescription);
        setGeneratedDoc(docText);
        addActivityLog('doc_generation', 'Documentation generated using AI agent', `Generated ${docText.length} characters of documentation`);
      } catch (agentError) {
        console.warn("Agent service not available, using fallback");
        const docText = generateFallbackDoc(files, datasetName, userDescription);
        setGeneratedDoc(docText);
        addActivityLog('doc_generation', 'Documentation generated (fallback mode)', `Generated ${docText.length} characters of documentation`);
      }
    } catch (error) {
      console.error('Failed to generate documentation:', error);
      const docText = generateFallbackDoc(files, datasetName, userDescription);
      setGeneratedDoc(docText);
      addActivityLog('doc_generation', 'Documentation generated (fallback mode)', `Generated ${docText.length} characters of documentation`);
    } finally {
      setIsGenerating(false);
    }
  };

  const generateFallbackDoc = (files: FileInfo[], datasetName: string, userDescription: string): string => {
    const fileTypes = new Map<string, number>();
    let totalSize = 0;

    files.forEach(file => {
      const ext = file.name.split('.').pop() || 'unknown';
      fileTypes.set(ext, (fileTypes.get(ext) || 0) + 1);
      totalSize += file.size;
    });

    const sizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
    const fileTypeSummary = Array.from(fileTypes.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([ext, count]) => `- **${ext}**: ${count} file${count > 1 ? 's' : ''}`)
      .join('\n');

    return `# ${datasetName}

${userDescription || 'No description provided.'}

## Dataset Statistics

- **Total Files**: ${files.length}
- **Total Size**: ${sizeInMB} MB

## File Types

${fileTypeSummary}

## Sample Files

${files.slice(0, 10).map(f => `- ${f.name}`).join('\n')}

---
*This documentation was automatically generated. Use the refine feature to add more details.*`;
  };

  const handleRefine = async () => {
    if (!refineFeedback.trim()) return;

    // Save current doc for undo
    setPreviousDoc(editedDoc);

    // Clear any previous errors
    setRefineError("");

    // Set generating state (stay in edit mode)
    setIsGenerating(true);

    try {
      // Generate refined documentation
      await generateDocumentation(fileInfos, dataset.name, dataset.description, refineFeedback);
      setRefineFeedback("");

      // Update the edited doc with the new generated doc
      setEditedDoc(generatedDoc);
    } catch (error) {
      console.error('Failed to refine documentation:', error);
      setRefineError(error instanceof Error ? error.message : 'Failed to refine documentation. Please try again.');
      addActivityLog('doc_refinement_error', 'AI refinement failed', error instanceof Error ? error.message : String(error));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUndoRefine = () => {
    if (previousDoc) {
      setEditedDoc(previousDoc);
      setPreviousDoc("");
    }
  };

  const handleRegisterMcpServer = async () => {
    if (!isLoggedIn || !server) {
      alert('Please login to Hypha first');
      return;
    }

    if (!generatedDoc) {
      alert('Please generate documentation first');
      return;
    }

    // If kernel is not ready, start it and set flag to auto-register
    if (!isReady) {
      console.log('Kernel not ready, starting kernel and setting auto-register flag');
      setShouldAutoRegisterMcp(true);
      await startKernel();
      return;
    }

    try {
      // Check if connection is still alive, reconnect if needed
      let activeServer = server;
      try {
        // Test connection by trying to get server info
        await server.ping?.();
      } catch (connError) {
        console.warn('Hypha connection lost, attempting to reconnect...', connError);

        // Get the stored token and reconnect
        const { getToken, connect } = useHyphaStore.getState();
        const token = getToken();

        if (!token) {
          alert('Session expired. Please login again.');
          return;
        }

        try {
          activeServer = await connect({
            server_url: 'https://hypha.aicell.io',
            token: token,
            method_timeout: 300
          });
          console.log('Reconnected to Hypha successfully');
        } catch (reconnectError) {
          console.error('Failed to reconnect:', reconnectError);
          alert('Connection lost. Please login again.');
          return;
        }
      }

      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const serviceId = `dataset-${dataset.id}-${randomSuffix}`;

      // Define schemas
      const schemas = {
        get_docs: {
          name: "get_docs",
          description: "Get dataset documentation including name, description, timestamp, file count, and usage instructions. This should almost always be the first method you call BEFORE using execute_python_script.",
          parameters: {
            type: "object",
            properties: {}
          }
        },
        execute_python_script: {
          name: "execute_python_script",
          description: "Execute Python code on the mounted dataset. The dataset is available at /data path. Returns execution results or errors. Supports numpy, pandas, matplotlib, scikit-learn, and other scientific libraries.",
          parameters: {
            type: "object",
            properties: {
              script: {
                type: "string",
                description: "Python code to execute. Can access dataset files at /data path using standard file operations or libraries like pandas, numpy, etc."
              }
            },
            required: ["script"]
          }
        }
      };

      const svc = await activeServer.registerService({
        id: serviceId,
        name: `Dataset MCP: ${dataset.name}`,
        description: `MCP server for ${dataset.name} dataset with Python kernel access. Use get_docs() first to understand the dataset, then use execute_python_script(script) to run analysis.`,
        config: {
          visibility: 'public',
          require_context: false
        },
        get_docs: Object.assign(async (_params = {}, _context = null) => {
          return {
            name: dataset.name,
            description: generatedDoc || dataset.description,
            timestamp: dataset.timestamp,
            files: fileInfos.length,
            message: "Dataset is mounted at /data in the Python environment. Use execute_python_script to run code."
          };
        }, { __schema__: schemas.get_docs }),

        execute_python_script: Object.assign(async ({ script }: { script: string } = { script: '' }, _context = null) => {
          if (!executeCode) {
            throw new Error('Kernel not ready');
          }

          if (!script) {
            throw new Error('No script provided');
          }

          addActivityLog('script_execution', 'Remote Python script execution started', `Script length: ${script.length} characters`);

          return new Promise((resolve, reject) => {
            const outputs: string[] = [];

            executeCode(script, {
              onOutput: (output) => {
                outputs.push(output.content);
              },
              onStatus: (status) => {
                if (status === 'Completed') {
                  const cleanedOutput = stripAnsi(outputs.join('\n'));
                  addActivityLog('script_execution', 'Remote Python script executed successfully', `Output: ${cleanedOutput.substring(0, 100)}...`);
                  resolve({ result: cleanedOutput, status: 'success' });
                } else if (status === 'Error') {
                  const cleanedError = stripAnsi(outputs.join('\n'));
                  addActivityLog('script_execution', 'Remote Python script execution failed', `Error: ${cleanedError}`);
                  reject(new Error(cleanedError));
                }
              }
            }).catch(reject);
          });
        }, { __schema__: schemas.execute_python_script })
      });

      const serverUrl = activeServer.config.public_base_url || 'https://hypha.aicell.io';
      const workspace = activeServer.config.workspace || 'public';
      const mcpUrl = `${serverUrl}/${workspace}/mcp/${svc.id.split('/').pop()}/mcp`;
      const serviceUrl = `${serverUrl}/${workspace}/services/${svc.id.split('/').pop()}`;

      setMcpServerUrl(mcpUrl);
      setServiceInfoUrl(serviceUrl);
      setIsMcpServerActive(true);
      setRegisteredService(svc);
      setConnectionHealth('healthy');
      addActivityLog('mcp_registration', 'MCP Server registered successfully', `Service ID: ${svc.id}`);
      console.log('MCP server registered:', mcpUrl);
      console.log('Service info URL:', serviceUrl);
    } catch (err) {
      console.error('Failed to register MCP server:', err);
      alert(`Failed to register MCP server: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="max-w-4xl mx-auto p-8">
      {/* Dataset Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-3 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">{dataset.name}</h1>
            <p className="text-gray-500 text-sm mt-1">
              <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Mounted on {formatDate(dataset.timestamp)}
            </p>
          </div>
        </div>
      </div>

      {/* MCP Server Section - Share Data Access */}
      <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-xl shadow-lg border border-purple-200 p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-lg">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900">Share Data Access</h2>
            <p className="text-sm text-gray-600">Enable secure AI agent access to your dataset without data transfer</p>
          </div>
          {isMcpServerActive && (
            <div className={`px-3 py-1 text-white text-xs font-bold rounded-full flex items-center gap-1 ${
              connectionHealth === 'healthy' ? 'bg-green-500' :
              connectionHealth === 'checking' ? 'bg-blue-500' :
              connectionHealth === 'reconnecting' ? 'bg-yellow-500' :
              'bg-red-500'
            }`}>
              {connectionHealth === 'checking' && (
                <svg className="w-3 h-3 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                  <circle cx="10" cy="10" r="5" />
                </svg>
              )}
              {connectionHealth === 'reconnecting' && (
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              {connectionHealth === 'healthy' ? 'ACTIVE' :
               connectionHealth === 'checking' ? 'CHECKING' :
               connectionHealth === 'reconnecting' ? 'RECONNECTING' :
               'DISCONNECTED'}
            </div>
          )}
        </div>

        {/* Explanation Card - Collapsible */}
        <div className="mb-4 bg-white rounded-lg border border-purple-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setIsExplanationExpanded(!isExplanationExpanded)}
            className="w-full p-4 flex items-center justify-between hover:bg-purple-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="p-1.5 bg-purple-100 rounded-lg flex-shrink-0">
                <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-gray-900">How Data Sharing Works</h3>
            </div>
            <svg
              className={`w-5 h-5 text-gray-600 transition-transform ${isExplanationExpanded ? 'transform rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {isExplanationExpanded && (
            <div className="px-4 pb-4">
              <p className="text-xs text-gray-700 leading-relaxed mb-4">
                Grant AI agents secure computational access to your dataset through the <span className="font-semibold text-purple-700">Model Context Protocol (MCP)</span>.
                Your data remains on your local machine - only analysis results are transmitted. This eliminates the need for large data transfers while maintaining full data privacy and control.
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                    <span className="text-white text-xs font-bold">1</span>
                  </div>
                  <div className="flex-1 pt-0.5">
                    <p className="text-xs font-medium text-gray-900">Mount Local Dataset</p>
                    <p className="text-xs text-gray-600 mt-0.5">Select a folder from your computer to make available</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                    <span className="text-white text-xs font-bold">2</span>
                  </div>
                  <div className="flex-1 pt-0.5">
                    <p className="text-xs font-medium text-gray-900">Initialize Python Kernel & MCP Server</p>
                    <p className="text-xs text-gray-600 mt-0.5">Start the execution environment and register the MCP service endpoint</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                    <span className="text-white text-xs font-bold">3</span>
                  </div>
                  <div className="flex-1 pt-0.5">
                    <p className="text-xs font-medium text-gray-900">Share Access URL</p>
                    <p className="text-xs text-gray-600 mt-0.5">Provide the generated URL to AI agents for secure data interaction</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Kernel Controls */}
        <div className="mb-4 p-4 bg-white rounded-lg border border-purple-200">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
              <h3 className="font-semibold text-gray-900">Python Kernel</h3>
              <div className={`ml-2 px-2 py-1 rounded-full text-xs font-semibold ${
                kernelStatus === 'starting' ? 'bg-yellow-100 text-yellow-700' :
                kernelStatus === 'busy' ? 'bg-blue-100 text-blue-700' :
                kernelStatus === 'error' ? 'bg-red-100 text-red-700' :
                isReady ? 'bg-green-100 text-green-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {kernelStatus === 'starting' ? 'Starting...' :
                 kernelStatus === 'busy' ? 'Busy' :
                 kernelStatus === 'error' ? 'Error' :
                 isReady ? 'Ready' :
                 'Not Started'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isReady ? (
                <>
                  <button
                    onClick={restartKernel}
                    className="px-3 py-1 bg-orange-600 text-white text-sm rounded hover:bg-orange-700 transition-colors flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Restart
                  </button>
                  <button
                    onClick={() => setIsDebugTerminalOpen(true)}
                    className="px-3 py-1 bg-gray-600 text-white text-sm rounded hover:bg-gray-700 transition-colors flex items-center gap-1"
                    title="Open Debug Terminal"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    Debug
                  </button>
                </>
              ) : (
                <button
                  onClick={startKernel}
                  disabled={kernelStatus === 'starting'}
                  className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                >
                  {kernelStatus === 'starting' ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Starting...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Start Kernel
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-600">
            The kernel executes Python code for MCP server operations. Debug terminal allows direct interaction.
          </p>
        </div>

        {isLoggedIn ? (
          <div>
            <button
              onClick={handleRegisterMcpServer}
              disabled={!generatedDoc || isMcpServerActive || shouldAutoRegisterMcp}
              className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-indigo-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed shadow-lg transform transition-all hover:scale-[1.02] flex items-center justify-center gap-3"
            >
              {shouldAutoRegisterMcp || kernelStatus === 'starting' ? (
                <>
                  <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Starting Kernel...
                </>
              ) : isMcpServerActive ? (
                <>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Remote Access Enabled
                </>
              ) : (
                <>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
                  </svg>
                  Enable Remote Data Access
                </>
              )}
            </button>

            {mcpServerUrl && (
              <div className="mt-4 p-4 bg-white rounded-lg border border-purple-200 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">MCP Server URL</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={mcpServerUrl}
                      readOnly
                      className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm font-mono"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(mcpServerUrl);
                        setIsCopied(true);
                        setTimeout(() => setIsCopied(false), 2000);
                      }}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                    >
                      {isCopied ? (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Copied!
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                </div>
                {serviceInfoUrl && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Service Info</label>
                    <a
                      href={serviceInfoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      View Service Info
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-800">Login Required</p>
                <p className="text-xs text-yellow-700 mt-1">You need to login to Hypha to register an MCP server.</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Documentation Section */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 mb-6 overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between bg-gray-50 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Dataset Documentation</h2>
          <div className="flex items-center gap-2">
            {generatedDoc && !isGenerating && (
              <>
                {isEditMode ? (
                  // Cancel and Save buttons in edit mode
                  <>
                    <button
                      onClick={() => {
                        setIsEditMode(false);
                        setEditedDoc('');
                      }}
                      className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        setGeneratedDoc(editedDoc);
                        setIsEditMode(false);
                        // Auto-save when exiting edit mode
                        const updatedMetadata = {
                          ...dataset,
                          description: editedDoc
                        };
                        await set(`dataset_metadata_${dataset.id}`, updatedMetadata);
                      }}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Save & Exit
                    </button>
                  </>
                ) : (
                  // Edit button in view mode
                  <button
                    onClick={() => {
                      setEditedDoc(generatedDoc);
                      setIsEditMode(true);
                    }}
                    className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <div className="px-6 pb-6 pt-4">
          {isGenerating ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <svg className="animate-spin h-8 w-8 mx-auto mb-4 text-blue-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-gray-600">Generating documentation...</p>
              </div>
            </div>
          ) : generatedDoc ? (
            <>
              {isEditMode ? (
                /* Edit Mode */
                <div className="space-y-4">
                  {/* Textarea with overlay */}
                  <div className="relative">
                    <textarea
                      value={editedDoc}
                      onChange={(e) => setEditedDoc(e.target.value)}
                      disabled={isGenerating}
                      className="w-full h-96 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm disabled:bg-gray-50 disabled:cursor-not-allowed"
                      placeholder="Edit documentation in Markdown format..."
                    />

                    {/* Generating Overlay - Only covers textarea */}
                    {isGenerating && (
                      <div className="absolute inset-0 bg-white/90 backdrop-blur-sm flex items-center justify-center rounded-lg z-10">
                        <div className="text-center">
                          <svg className="animate-spin h-8 w-8 mx-auto mb-4 text-blue-600" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <p className="text-gray-600 font-medium">Refining documentation...</p>
                          <p className="text-xs text-gray-500 mt-1">Please wait while AI generates improvements</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* AI Refine in Edit Mode */}
                  <div className="border-t border-gray-200 pt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      AI-Assisted Refinement
                    </label>

                    {/* Error Display */}
                    {refineError && (
                      <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                        <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-red-800">Refinement Failed</p>
                          <p className="text-xs text-red-700 mt-1">{refineError}</p>
                        </div>
                        <button
                          onClick={() => setRefineError("")}
                          className="text-red-600 hover:text-red-800"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={refineFeedback}
                        onChange={(e) => setRefineFeedback(e.target.value)}
                        disabled={isGenerating}
                        placeholder="e.g., 'Add more details about data formats' or 'Include example code'"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:cursor-not-allowed"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !isGenerating && refineFeedback.trim()) {
                            e.preventDefault();
                            handleRefine();
                          }
                        }}
                      />
                      <button
                        onClick={handleRefine}
                        disabled={!refineFeedback.trim() || isGenerating}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Refine with AI
                      </button>
                      {previousDoc && (
                        <button
                          onClick={handleUndoRefine}
                          disabled={isGenerating}
                          className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                          title="Undo last refinement"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                          </svg>
                          Undo
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* View Mode - Default */
                <div className="prose prose-sm max-w-none p-4 bg-gray-50 rounded-lg max-h-96 overflow-y-auto">
                  <ReactMarkdown>{generatedDoc}</ReactMarkdown>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <p>No documentation generated yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* Activity Log */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <h2 className="text-xl font-bold text-gray-900">Activity Log</h2>
            {activityLogs.length > 0 && (
              <span className="ml-auto px-2 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">
                {activityLogs.length} events
              </span>
            )}
          </div>
        </div>
        <div className="p-6">
          {activityLogs.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-500 font-medium">No activity yet</p>
              <p className="text-sm text-gray-400 mt-1">Operations will be logged here</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {activityLogs.map((log, idx) => (
                <div
                  key={idx}
                  className="cursor-pointer hover:shadow-md transition-shadow overflow-hidden border-l-4 rounded-lg border border-gray-200"
                  style={{
                    borderLeftColor:
                      log.type === 'mount' ? '#3b82f6' :
                      log.type === 'doc_generation' ? '#22c55e' :
                      log.type === 'mcp_registration' ? '#a855f7' :
                      log.type === 'mcp_deactivation' ? '#ef4444' :
                      '#f97316'
                  }}
                  onClick={() => toggleLogExpanded(idx)}
                >
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                          log.type === 'mount' ? 'bg-blue-100' :
                          log.type === 'doc_generation' ? 'bg-green-100' :
                          log.type === 'mcp_registration' ? 'bg-purple-100' :
                          log.type === 'mcp_deactivation' ? 'bg-red-100' :
                          'bg-orange-100'
                        }`}>
                          {log.type === 'mount' && (
                            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                            </svg>
                          )}
                          {log.type === 'doc_generation' && (
                            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          )}
                          {log.type === 'mcp_registration' && (
                            <svg className="w-5 h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
                            </svg>
                          )}
                          {log.type === 'mcp_deactivation' && (
                            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                          )}
                          {log.type === 'script_execution' && (
                            <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                            </svg>
                          )}
                        </div>
                        <div className="flex flex-col">
                          <p className="font-semibold text-gray-900">{log.message}</p>
                          <span className="text-xs text-gray-500">
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          log.type === 'mount' ? 'bg-blue-100 text-blue-700' :
                          log.type === 'doc_generation' ? 'bg-green-100 text-green-700' :
                          log.type === 'mcp_registration' ? 'bg-purple-100 text-purple-700' :
                          log.type === 'mcp_deactivation' ? 'bg-red-100 text-red-700' :
                          'bg-orange-100 text-orange-700'
                        }`}>
                          {log.type.replace(/_/g, ' ').toUpperCase()}
                        </span>
                        <svg
                          className={`w-5 h-5 text-gray-600 transition-transform ${expandedLogs.has(idx) ? 'transform rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </div>

                    {expandedLogs.has(idx) && log.details && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Details</h4>
                        <div className="bg-gray-50 p-3 rounded-md border border-gray-200">
                          <pre className="text-xs font-mono whitespace-pre-wrap text-gray-800 overflow-x-auto">{log.details}</pre>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Kernel Debug Terminal */}
      <KernelDebugTerminal
        isOpen={isDebugTerminalOpen}
        onClose={() => setIsDebugTerminalOpen(false)}
        executeCode={executeCode}
        kernelStatus={kernelStatus}
      />
    </div>
  );
}
