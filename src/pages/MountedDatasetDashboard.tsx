import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { get, set } from 'idb-keyval';
import { useKernel } from '../contexts/KernelContext';
import { useHyphaStore } from '../store/hyphaStore';
import { DatasetInfo, RequestLog, RequestLogEntry } from '../types/dataset';
import { formatBytes } from '../utils/datasetUtils';

// Import the startup script as raw text
// We'll fetch it at runtime since we can't use raw-loader in CRA
const DATASET_STARTUP_SCRIPT_URL = '/dataset_startup_script.py';

// Global set to track which datasets are currently initializing
const initializingIds = new Set<string>();

const MountedDatasetDashboard: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: paramId } = useParams();
  const { server, user, artifactManager } = useHyphaStore();
  const {
    kernelExecutionLog,
    kernelStatus,
    isReady,
    executeCode,
    restartKernel,
    clearLogs,
    activeDatasetId,
    setActiveDatasetId,
    mountFolder,
    startKernel,
    destroyCurrentKernel
  } = useKernel();

  // State
  const [datasetInfo, setDatasetInfo] = useState<DatasetInfo | null>(null);
  const [mcpUrl, setMcpUrl] = useState('');
  const [hasStarted, setHasStarted] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isServiceReady, setIsServiceReady] = useState(false);
  const [startupScript, setStartupScript] = useState<string>('');

  // Dialog states
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [showRelinkDialog, setShowRelinkDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

  // Publish state
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishedArtifactId, setPublishedArtifactId] = useState<string | null>(null);

  // Debug console state
  const [isDebugExpanded, setIsDebugExpanded] = useState(false);
  const [debugCode, setDebugCode] = useState('');

  // Logs state
  const [expandedRequests, setExpandedRequests] = useState<Set<string>>(new Set());
  const [fetchedRequests, setFetchedRequests] = useState<RequestLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [showRawLogs, setShowRawLogs] = useState(false);

  // Refs
  const hasWarnedRef = useRef(false);

  // Load startup script
  useEffect(() => {
    fetch(DATASET_STARTUP_SCRIPT_URL)
      .then(res => res.text())
      .then(setStartupScript)
      .catch(err => console.error('Failed to load startup script:', err));
  }, []);

  // Load dataset info from params/storage
  useEffect(() => {
    const loadInfo = async () => {
      // 1. Try location state (fresh mount)
      if (location.state) {
        setDatasetInfo(location.state as DatasetInfo);
        return;
      }

      // 2. Try LocalStorage (refresh/direct link)
      if (paramId) {
        const stored = localStorage.getItem(`dataset_${paramId}`);
        if (stored) {
          setDatasetInfo(JSON.parse(stored));
          return;
        }
      }

      // 3. Fallback/Error
      navigate('/');
    };
    loadInfo();
  }, [location.state, paramId, navigate]);

  // Fetch logs from Hypha API
  const fetchLogsFromHypha = async (reset: boolean = false) => {
    if (!datasetInfo?.id || !server) return;

    setIsLoadingLogs(true);
    try {
      const eventType = `dataset_request_${datasetInfo.id}`;
      const events = await server.getEvents?.(eventType, 50, 0);

      if (!events) {
        setIsLoadingLogs(false);
        return;
      }

      // Process events into RequestLog format
      const reqMap = new Map<string, RequestLog>();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      events.forEach((event: any) => {
        const entry = event.data || event;
        if (!entry.id) return;

        if (!reqMap.has(entry.id)) {
          reqMap.set(entry.id, {
            id: entry.id,
            timestamp: entry.timestamp,
            user: entry.user?.email || entry.user || 'Anonymous',
            method: entry.method,
            status: entry.status,
            message: entry.message,
            detail: entry.detail,
            code: entry.method === 'run_python' && entry.status === 'processing' ? entry.detail : undefined,
            history: []
          });
        } else {
          const req = reqMap.get(entry.id)!;
          req.history.push({
            timestamp: req.timestamp,
            status: req.status,
            message: req.message,
            detail: req.detail
          });
          req.status = entry.status;
          req.message = entry.message;
          req.detail = entry.detail;
          req.timestamp = entry.timestamp;
        }
      });

      const newRequests = Array.from(reqMap.values());
      setFetchedRequests(newRequests);
    } catch (e) {
      console.error('Failed to fetch logs from Hypha:', e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  // Process logs into structured requests
  const requests = useMemo(() => {
    const reqMap = new Map<string, RequestLog>();

    // First add fetched requests from Hypha
    fetchedRequests.forEach(req => {
      reqMap.set(req.id, { ...req });
    });

    // Then process kernel execution logs
    kernelExecutionLog.forEach(log => {
      if (log.content && log.content.includes('::REQ::')) {
        try {
          const jsonStr = log.content.split('::REQ::')[1];
          const entry = JSON.parse(jsonStr);

          if (!reqMap.has(entry.id)) {
            reqMap.set(entry.id, {
              id: entry.id,
              timestamp: entry.timestamp,
              user: entry.user?.email || entry.user || 'Anonymous',
              method: entry.method,
              status: entry.status,
              message: entry.message,
              detail: entry.detail,
              code: entry.method === 'run_python' && entry.status === 'processing' ? entry.detail : undefined,
              history: []
            });
          } else {
            const req = reqMap.get(entry.id)!;
            if (new Date(entry.timestamp) >= new Date(req.timestamp)) {
              req.history.push({
                timestamp: req.timestamp,
                status: req.status,
                message: req.message,
                detail: req.detail
              });
              req.status = entry.status;
              req.message = entry.message;
              req.detail = entry.detail;
              req.timestamp = entry.timestamp;
            }
          }
        } catch (e) {
          console.error('Failed to parse request log', e);
        }
      }
    });

    return Array.from(reqMap.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [kernelExecutionLog, fetchedRequests]);

  // Manage running_datasets in localStorage for cross-tab visibility
  useEffect(() => {
    if (!datasetInfo?.id) return;

    const updateRunningState = (isRunning: boolean) => {
      try {
        const running = new Set(JSON.parse(localStorage.getItem('running_datasets') || '[]'));
        if (isRunning) {
          running.add(datasetInfo.id);
        } else {
          running.delete(datasetInfo.id);
        }
        localStorage.setItem('running_datasets', JSON.stringify(Array.from(running)));
        window.dispatchEvent(new Event('storage'));
      } catch (e) {
        console.error('Failed to update running state', e);
      }
    };

    if (isServiceReady) {
      updateRunningState(true);
    }

    const handleUnload = () => updateRunningState(false);
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      updateRunningState(false);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, [isServiceReady, datasetInfo?.id]);

  // Check if dataset is published
  useEffect(() => {
    const checkPublished = async () => {
      if (!datasetInfo?.id || !user || !artifactManager) return;
      try {
        const artifacts = await artifactManager.list({
          parent_id: '24agents-science/24agents.science',
          filters: { type: 'dataset' },
          _rkwargs: true
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const match = artifacts.find((a: any) => a.manifest?.dataset_id === datasetInfo.id);
        if (match) {
          setPublishedArtifactId(match.id);
        }
      } catch (e) {
        console.error('Failed to check published status', e);
      }
    };
    checkPublished();
  }, [datasetInfo?.id, user, artifactManager]);

  // Fetch logs periodically
  useEffect(() => {
    if (!datasetInfo?.id || !server) return;

    fetchLogsFromHypha(true);
    const intervalId = setInterval(() => {
      fetchLogsFromHypha(true);
    }, 30000);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetInfo?.id, server]);

  // Broadcast Channel for Tab Coordination
  useEffect(() => {
    if (!datasetInfo?.id) return;

    const channel = new BroadcastChannel(`dataset_status_${datasetInfo.id}`);

    channel.onmessage = event => {
      if (event.data.type === 'PING') {
        if (activeDatasetId === datasetInfo.id) {
          channel.postMessage({ type: 'PONG', datasetId: datasetInfo.id });
        }
      } else if (event.data.type === 'PONG') {
        if (activeDatasetId !== datasetInfo.id && !hasWarnedRef.current) {
          hasWarnedRef.current = true;
          alert('This dataset is already running in another tab. Please close it there first.');
        }
      }
    };

    if (activeDatasetId === datasetInfo.id) {
      channel.postMessage({ type: 'PONG', datasetId: datasetInfo.id });
    } else {
      channel.postMessage({ type: 'PING' });
    }

    return () => channel.close();
  }, [datasetInfo?.id, activeDatasetId]);

  // Handle Kernel State & Restoration
  useEffect(() => {
    if (!datasetInfo || !startupScript) return;
    let aborted = false;

    const runStartupScript = async () => {
      if (aborted) return;
      setHasError(false);
      console.log('Running startup script for dataset:', datasetInfo.id);

      try {
        // Construct MCP URL
        if (server) {
          try {
            const config = await server.getConfig?.();
            const userWorkspace = user?.id || 'default';
            const clientId = server.id || 'unknown';
            if (config && config.public_base_url) {
              const serviceId = `${datasetInfo.id}-service`;
              const url = `${config.public_base_url}/${userWorkspace}/mcp/${clientId}:${serviceId}/mcp`;
              setMcpUrl(url);
            }
          } catch (e) {
            console.error('Failed to get server config for MCP URL:', e);
          }
        }

        const setupCode = `
import os

print("Starting dataset service setup...")

os.environ["DATASET_NAME"] = "${datasetInfo.name.replace(/"/g, '\\"')}"
os.environ["DATASET_DESCRIPTION"] = """${datasetInfo.description.replace(/"""/g, '\\"\\"\\"')}"""
os.environ["DATASET_ID"] = "${datasetInfo.id.replace(/"/g, '\\"')}"
`;

        const fullCode = setupCode + '\n' + startupScript;

        if (executeCode) {
          console.log('Executing startup code...');
          let lastError = '';

          executeCode(fullCode, {
            onOutput: output => {
              console.log('Kernel Output:', output);
              if (output.type === 'stdout' && output.content.includes('Registered MCP service with ID')) {
                setIsServiceReady(true);
              }
              if (output.type === 'stderr' || output.type === 'error') {
                lastError = output.content;
              }
            },
            onStatus: status => {
              console.log('Execution status:', status);
              if (status === 'Error') {
                setHasError(true);
                console.error('Startup script failed:', lastError);
              }
            }
          });
        }
      } catch (error) {
        console.error('Failed to run dataset code:', error);
        setHasError(true);
      }
    };

    const initKernel = async () => {
      if (aborted) return;

      // Case A: Kernel is already running for THIS dataset
      if (activeDatasetId === datasetInfo.id) {
        if (!mcpUrl) {
          runStartupScript();
        }
        if (!hasStarted) {
          setHasStarted(true);
        }
        return;
      }

      // Case B: Kernel is running for ANOTHER dataset
      if (activeDatasetId && activeDatasetId !== datasetInfo.id) {
        if (!hasWarnedRef.current) {
          hasWarnedRef.current = true;
        }
        clearLogs();
        await restartKernel();
        setActiveDatasetId(null);
        return;
      }

      // Case C: No kernel running
      if (!activeDatasetId) {
        if (initializingIds.has(datasetInfo.id)) {
          console.log('Already initializing this dataset, skipping...');
          return;
        }

        try {
          if (!isReady || !executeCode) {
            if (!isReady) await startKernel();
            return;
          }

          initializingIds.add(datasetInfo.id);

          const handle = await get(`dataset_handle_${datasetInfo.id}`);
          if (handle) {
            if (aborted) return;
            await mountFolder(handle);
            await new Promise(resolve => setTimeout(resolve, 500));
            if (aborted) return;

            setActiveDatasetId(datasetInfo.id);
            clearLogs();
            runStartupScript();
          } else {
            throw new Error('Dataset handle not found in storage');
          }
        } catch (e) {
          console.error('Failed to restore dataset:', e);
          setHasError(true);
          if (
            (e as Error).message.includes('handle not found') ||
            (e as Error).message.includes('Permission denied')
          ) {
            setShowRelinkDialog(true);
          }
        } finally {
          initializingIds.delete(datasetInfo.id);
        }
      }
    };

    initKernel();

    return () => {
      aborted = true;
    };
  }, [
    datasetInfo,
    activeDatasetId,
    isReady,
    executeCode,
    hasStarted,
    restartKernel,
    clearLogs,
    mountFolder,
    startKernel,
    setActiveDatasetId,
    mcpUrl,
    server,
    user,
    startupScript
  ]);

  // Warn on close
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (kernelStatus === 'busy' || activeDatasetId) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [kernelStatus, activeDatasetId]);

  // Handlers
  const handleBackClick = () => {
    if (kernelStatus === 'busy' || activeDatasetId) {
      setShowLeaveDialog(true);
      setPendingNavigation('/datasets');
    } else {
      navigate('/datasets');
    }
  };

  const confirmLeave = async () => {
    setShowLeaveDialog(false);
    if (pendingNavigation) {
      await destroyCurrentKernel();
      setActiveDatasetId(null);
      navigate(pendingNavigation);
    }
  };

  const handleRelink = async () => {
    try {
      // @ts-expect-error - showDirectoryPicker is not yet in standard types
      const handle = await window.showDirectoryPicker({
        mode: 'readwrite'
      });

      if (handle && datasetInfo?.id) {
        await set(`dataset_handle_${datasetInfo.id}`, handle);
        setShowRelinkDialog(false);
        setHasError(false);
        window.location.reload();
      }
    } catch (err) {
      console.error('Failed to relink folder:', err);
    }
  };

  const handleRunDebugCode = async () => {
    if (!debugCode.trim() || !executeCode) return;

    try {
      await executeCode(debugCode, {
        onOutput: output => {
          console.log('Debug output:', output);
        }
      });
      setDebugCode('');
    } catch (e) {
      console.error('Debug execution failed:', e);
    }
  };

  const handlePublish = async () => {
    if (!datasetInfo || !artifactManager || !user) return;
    setIsPublishing(true);

    try {
      const manifest = {
        name: datasetInfo.name,
        description: datasetInfo.description,
        dataset_id: datasetInfo.id,
        type: 'dataset',
        uploader: { email: user.email }
      };

      if (publishedArtifactId) {
        // Update existing
        await artifactManager.edit({
          artifact_id: publishedArtifactId,
          manifest,
          _rkwargs: true
        });
        await artifactManager.commit({
          artifact_id: publishedArtifactId,
          _rkwargs: true
        });
      } else {
        // Create new
        const artifact = await artifactManager.create({
          parent_id: '24agents-science/24agents.science',
          alias: '{fruit_adjective}-{fruit}',
          type: 'dataset',
          manifest,
          stage: true,
          _rkwargs: true
        });

        // Commit it
        await artifactManager.commit({
          artifact_id: artifact.id,
          _rkwargs: true
        });

        setPublishedArtifactId(artifact.id);
      }

      setShowPublishDialog(false);
    } catch (e) {
      console.error('Failed to publish', e);
      alert('Failed to publish dataset. Please try again.');
    } finally {
      setIsPublishing(false);
    }
  };

  const copyMcpUrl = () => {
    if (!mcpUrl) return;
    navigator.clipboard.writeText(mcpUrl);
  };

  const toggleRequestExpanded = (reqId: string) => {
    const newExpanded = new Set(expandedRequests);
    if (newExpanded.has(reqId)) {
      newExpanded.delete(reqId);
    } else {
      newExpanded.add(reqId);
    }
    setExpandedRequests(newExpanded);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'processing':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'error':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'processing':
        return (
          <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        );
      case 'error':
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        );
    }
  };

  if (!datasetInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Share Dialog */}
      {showShareDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowShareDialog(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-xl w-full mx-4 p-6">
            <h2 className="text-xl font-semibold mb-4">Share Dataset</h2>
            <p className="text-gray-600 mb-4">Share this MCP URL with collaborators to give them access to your dataset:</p>
            <div className="flex items-center gap-2 p-3 bg-gray-100 rounded-lg">
              <code className="flex-1 text-sm break-all">{mcpUrl || 'Generating URL...'}</code>
              <button
                onClick={copyMcpUrl}
                disabled={!mcpUrl}
                className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Copy
              </button>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowShareDialog(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Publish Dialog */}
      {showPublishDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowPublishDialog(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-xl w-full mx-4 p-6">
            <h2 className="text-xl font-semibold mb-4">
              {publishedArtifactId ? 'Update Published Dataset' : 'Publish Dataset'}
            </h2>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <p className="text-yellow-800 text-sm">
                <strong>Warning:</strong> Publishing will make your dataset discoverable to all users.
                Only the name, description, and connection details will be published - your actual data
                remains on your local machine.
              </p>
            </div>
            <div className="space-y-3 mb-6">
              <div>
                <span className="text-gray-500 text-sm">Name:</span>
                <p className="font-medium">{datasetInfo.name}</p>
              </div>
              <div>
                <span className="text-gray-500 text-sm">Description:</span>
                <p className="text-sm text-gray-700 max-h-32 overflow-y-auto">{datasetInfo.description}</p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowPublishDialog(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handlePublish}
                disabled={isPublishing}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isPublishing && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {publishedArtifactId ? 'Update' : 'Publish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Dialog */}
      {showLeaveDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowLeaveDialog(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6">
            <h2 className="text-xl font-semibold mb-4">Stop Dataset Service?</h2>
            <p className="text-gray-600 mb-6">
              Leaving this page will stop the dataset service. Collaborators will not be able to access
              the dataset until you open this page again.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowLeaveDialog(false)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={confirmLeave}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Stop & Leave
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Relink Dialog */}
      {showRelinkDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6">
            <h2 className="text-xl font-semibold mb-4">Restore Dataset Access</h2>
            <p className="text-gray-600 mb-6">
              We lost access to the local folder for this dataset. Please select the folder again to continue.
            </p>
            <div className="flex justify-center mb-6">
              <button
                onClick={handleRelink}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                </svg>
                Select Folder
              </button>
            </div>
            <div className="flex justify-center">
              <button onClick={() => navigate('/datasets')} className="text-gray-500 hover:text-gray-700">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={handleBackClick}
            className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Datasets
          </button>

          <div className="flex items-center gap-3">
            {/* Kernel Status Badge */}
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                hasError
                  ? 'bg-red-100 text-red-800'
                  : kernelStatus === 'idle' && isReady
                  ? 'bg-green-100 text-green-800'
                  : kernelStatus === 'busy'
                  ? 'bg-blue-100 text-blue-800 animate-pulse'
                  : 'bg-yellow-100 text-yellow-800'
              }`}
            >
              {hasError
                ? 'Kernel Failed'
                : kernelStatus === 'idle' && isReady
                ? 'Kernel Ready'
                : kernelStatus === 'busy'
                ? 'Kernel Running'
                : 'Kernel Starting...'}
            </span>

            <button
              onClick={() => setShowPublishDialog(true)}
              className="px-4 py-2 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              {publishedArtifactId ? 'Update' : 'Publish'}
            </button>

            <button
              onClick={() => setShowShareDialog(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                />
              </svg>
              Share
            </button>
          </div>
        </div>

        {/* Dataset Info */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{datasetInfo.name}</h1>
          <p className="text-gray-600 mb-4">{datasetInfo.description.split('\n')[0]}</p>
          <div className="text-sm text-gray-500">
            Dataset ID: <code className="bg-gray-100 px-2 py-1 rounded">{datasetInfo.id}</code>
          </div>
        </div>

        {/* Debug Console */}
        <div className="bg-white rounded-2xl shadow-lg mb-6 overflow-hidden">
          <button
            onClick={() => setIsDebugExpanded(!isDebugExpanded)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span className="font-medium text-gray-900">Debug Console</span>
            </div>
            <svg
              className={`w-5 h-5 text-gray-500 transition-transform ${isDebugExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isDebugExpanded && (
            <div className="px-6 pb-6">
              <p className="text-sm text-gray-500 mb-3">Execute Python code directly in the kernel environment.</p>
              <textarea
                value={debugCode}
                onChange={e => setDebugCode(e.target.value)}
                placeholder="print('Hello World')"
                className="w-full h-32 px-4 py-3 font-mono text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
                onKeyDown={e => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleRunDebugCode();
                  }
                }}
              />
              <div className="flex justify-end mt-3">
                <button
                  onClick={handleRunDebugCode}
                  disabled={!isReady || !debugCode.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Run Code
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Request Log */}
        <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              <span className="font-medium text-gray-900">Request Log</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowRawLogs(!showRawLogs)}
                className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                  showRawLogs ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {showRawLogs ? 'Structured' : 'Raw Logs'}
              </button>
              <button
                onClick={() => fetchLogsFromHypha(true)}
                disabled={isLoadingLogs}
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center gap-1"
              >
                <svg
                  className={`w-4 h-4 ${isLoadingLogs ? 'animate-spin' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Refresh
              </button>
            </div>
          </div>

          <div className="max-h-[500px] overflow-y-auto">
            {showRawLogs ? (
              // Raw kernel logs
              <div className="p-4 space-y-2">
                {kernelExecutionLog.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No kernel logs yet.</p>
                ) : (
                  kernelExecutionLog.map((log, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg font-mono text-sm ${
                        log.type === 'error' || log.type === 'stderr'
                          ? 'bg-red-50 text-red-800'
                          : 'bg-gray-50 text-gray-800'
                      }`}
                    >
                      <span className="text-gray-400 text-xs mr-2">
                        [{new Date(log.timestamp).toLocaleTimeString()}]
                      </span>
                      {log.content}
                    </div>
                  ))
                )}
              </div>
            ) : (
              // Structured request logs
              <div className="p-4 space-y-3">
                {requests.length === 0 ? (
                  <p className="text-center text-gray-500 py-8">No requests yet.</p>
                ) : (
                  requests.map(req => (
                    <div key={req.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div
                        onClick={() => toggleRequestExpanded(req.id)}
                        className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50"
                      >
                        <div className="flex items-center gap-4">
                          <span className={`px-2 py-1 rounded text-xs font-medium flex items-center gap-1 ${getStatusColor(req.status)}`}>
                            {getStatusIcon(req.status)}
                            {req.status.toUpperCase()}
                          </span>
                          <div>
                            <p className="font-medium text-gray-900">{req.method}</p>
                            <p className="text-sm text-gray-500">
                              {new Date(req.timestamp).toLocaleString()} • {req.user}
                            </p>
                          </div>
                        </div>
                        <svg
                          className={`w-5 h-5 text-gray-400 transition-transform ${
                            expandedRequests.has(req.id) ? 'rotate-180' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>

                      {expandedRequests.has(req.id) && (
                        <div className="px-4 pb-4 border-t border-gray-100">
                          {req.message && (
                            <div className="mt-3">
                              <span className="text-xs font-medium text-gray-500">Message:</span>
                              <p className="text-sm text-gray-700 mt-1">{req.message}</p>
                            </div>
                          )}
                          {req.code && (
                            <div className="mt-3">
                              <span className="text-xs font-medium text-gray-500">Code:</span>
                              <pre className="mt-1 p-3 bg-gray-900 text-gray-100 rounded-lg text-sm overflow-x-auto">
                                {req.code}
                              </pre>
                            </div>
                          )}
                          {req.detail && (
                            <div className="mt-3">
                              <span className="text-xs font-medium text-gray-500">Detail:</span>
                              <pre className="mt-1 p-3 bg-gray-50 rounded-lg text-sm overflow-x-auto">
                                {req.detail}
                              </pre>
                            </div>
                          )}
                          {req.history.length > 0 && (
                            <div className="mt-3">
                              <span className="text-xs font-medium text-gray-500">History:</span>
                              <div className="mt-1 space-y-1">
                                {req.history.map((h, i) => (
                                  <div key={i} className="text-xs text-gray-500">
                                    {new Date(h.timestamp).toLocaleTimeString()} - {h.status}: {h.message}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MountedDatasetDashboard;
