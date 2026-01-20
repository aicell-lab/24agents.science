import { useState, useEffect } from "react";
import { useHyphaStore } from "../store/hyphaStore";

interface SessionHostingDialogProps {
  sessionId: string;
  sessionName: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function SessionHostingDialog({
  sessionId,
  sessionName,
  isOpen,
  onClose,
}: SessionHostingDialogProps) {
  const { server } = useHyphaStore();
  const [artifactManager, setArtifactManager] = useState<any>(null);
  const [currentArtifact, setCurrentArtifact] = useState<any>(null);
  const [operationLoading, setOperationLoading] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Static hosting state
  const [staticHostingEnabled, setStaticHostingEnabled] = useState(false);
  const [rootDirectory, setRootDirectory] = useState("/");

  // Get artifact manager service
  useEffect(() => {
    const getAM = async () => {
      if (server) {
        try {
          const am = await server.getService("public/artifact-manager", { case_conversion: "camel" });
          setArtifactManager(am);
        } catch (err) {
          console.error("Failed to get artifact manager:", err);
        }
      }
    };
    getAM();
  }, [server]);

  // Load artifact info when dialog opens
  useEffect(() => {
    const loadArtifact = async () => {
      if (isOpen && artifactManager) {
        try {
          const artifact = await artifactManager.read(sessionId, { stage: true, _rkwargs: true });
          setCurrentArtifact(artifact);

          const viewConfig = artifact?.config?.view_config;
          if (viewConfig) {
            setStaticHostingEnabled(true);
            setRootDirectory(viewConfig.root_directory || "/");
          } else {
            setStaticHostingEnabled(false);
            setRootDirectory("/");
          }
        } catch (err) {
          console.error("Failed to load artifact:", err);
        }
      }
    };
    loadArtifact();
  }, [isOpen, artifactManager, sessionId]);

  const handleSaveStaticHosting = async () => {
    if (!artifactManager || operationLoading) return;

    try {
      setOperationLoading('save-hosting');
      const view_config = staticHostingEnabled ? {
        root_directory: rootDirectory || "/",
      } : null;

      await artifactManager.edit(sessionId, {
        config: { view_config },
        _rkwargs: true
      });

      const updatedArtifact = await artifactManager.read(sessionId, { stage: true, _rkwargs: true });
      setCurrentArtifact(updatedArtifact);

      setStatusMessage({ type: 'success', text: 'Hosting configuration saved' });
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error("Failed to save static hosting config:", err);
      setStatusMessage({ type: 'error', text: `Failed to save: ${err}` });
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setOperationLoading(null);
    }
  };

  const handleCopyPreviewUrl = () => {
    if (!server || !currentArtifact) return;

    const previewUrl = getPreviewUrl();
    navigator.clipboard.writeText(previewUrl);
    setStatusMessage({ type: 'success', text: 'URL copied to clipboard' });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const getPreviewUrl = () => {
    if (!server) return "";

    const serverUrl = server.config.public_base_url || server.config.server_url;
    const parts = sessionId.split('/');
    if (parts.length !== 2) return "";

    const [workspace, artifactAlias] = parts;
    return `${serverUrl}/${workspace}/view/${artifactAlias}/`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className="w-11 h-11 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-500/20">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold text-gray-900 truncate">Static Hosting</h2>
              <p className="text-xs text-gray-400 truncate">{sessionName}</p>
            </div>
            {/* Status Badge */}
            {staticHostingEnabled ? (
              <span className="px-3 py-1.5 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 border border-emerald-200">
                <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                Enabled
              </span>
            ) : (
              <span className="px-3 py-1.5 bg-gray-50 text-gray-500 text-xs font-semibold rounded-lg flex items-center gap-1.5 border border-gray-200">
                <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                Disabled
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="ml-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Status Message */}
        {statusMessage && (
          <div className={`px-6 py-2.5 text-sm flex items-center gap-2 ${
            statusMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800' :
            statusMessage.type === 'error' ? 'bg-red-50 text-red-800' :
            'bg-blue-50 text-blue-800'
          }`}>
            {statusMessage.type === 'success' && (
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {statusMessage.type === 'error' && (
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Enable Toggle */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Enable Static Hosting</h3>
                <p className="text-xs text-gray-500 mt-0.5">Serve files as a static website</p>
              </div>
              <button
                onClick={() => setStaticHostingEnabled(!staticHostingEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  staticHostingEnabled ? 'bg-emerald-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                    staticHostingEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {staticHostingEnabled && (
              <>
                {/* Root Directory */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Root Directory
                  </label>
                  <input
                    type="text"
                    value={rootDirectory}
                    onChange={(e) => setRootDirectory(e.target.value)}
                    placeholder="/"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    The directory to serve as the website root (e.g., "/" or "/dist")
                  </p>
                </div>

                {/* Preview URL */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Preview URL
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={getPreviewUrl()}
                      readOnly
                      className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl bg-gray-50 text-xs font-mono text-gray-600"
                    />
                    <button
                      onClick={handleCopyPreviewUrl}
                      className="p-2.5 bg-white text-gray-600 rounded-xl hover:bg-gray-50 border border-gray-200 transition-colors"
                      title="Copy URL"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => window.open(getPreviewUrl(), "_blank")}
                      className="p-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition-colors"
                      title="Open in new tab"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-white text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 border border-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveStaticHosting}
              disabled={operationLoading === 'save-hosting'}
              className="flex-1 px-4 py-2.5 bg-emerald-600 text-white text-sm font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
            >
              {operationLoading === 'save-hosting' ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Save Configuration
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
