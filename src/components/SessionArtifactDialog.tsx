import { useState, useEffect, useRef } from "react";
import { useHyphaStore } from "../store/hyphaStore";

interface SessionArtifactDialogProps {
  sessionId: string;
  sessionName: string;
  isOpen: boolean;
  onClose: () => void;
}

interface FileItem {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
}

export default function SessionArtifactDialog({
  sessionId,
  sessionName,
  isOpen,
  onClose,
}: SessionArtifactDialogProps) {
  const { server } = useHyphaStore();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [expandedDirs, setExpandedDirs] = useState<Record<string, FileItem[]>>({});
  const [dragCounter, setDragCounter] = useState(0);
  const [artifactManager, setArtifactManager] = useState<any>(null);
  const [currentArtifact, setCurrentArtifact] = useState<any>(null);
  const [operationLoading, setOperationLoading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Static hosting state
  const [staticHostingEnabled, setStaticHostingEnabled] = useState(false);
  const [rootDirectory, setRootDirectory] = useState("/");
  const [showStaticHostingSection, setShowStaticHostingSection] = useState(false);

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

  // Load artifact info and files when dialog opens
  useEffect(() => {
    const loadArtifact = async () => {
      if (isOpen && artifactManager) {
        try {
          // Read the artifact to get its current state
          const artifact = await artifactManager.read(sessionId, { stage: true, _rkwargs: true });
          setCurrentArtifact(artifact);

          // Load static hosting config
          const viewConfig = artifact?.config?.view_config;
          if (viewConfig) {
            setStaticHostingEnabled(true);
            setRootDirectory(viewConfig.root_directory || "/");
          } else {
            setStaticHostingEnabled(false);
            setRootDirectory("/");
          }

          // Load files
          await loadFiles("");
        } catch (err) {
          console.error("Failed to load artifact:", err);
        }
      }
    };
    loadArtifact();
  }, [isOpen, artifactManager, sessionId]);

  const canUpload = currentArtifact?.staging !== null;

  const loadFiles = async (path: string = "") => {
    if (!artifactManager) return [];

    setLoading(true);
    try {
      const fileList = await artifactManager.listFiles({
        artifact_id: sessionId,
        dir_path: path || undefined,
        stage: true,
        _rkwargs: true
      });

      if (path === "") {
        setFiles(fileList || []);
      }
      return fileList || [];
    } catch (err) {
      console.error("Failed to load files:", err);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (filePath: string) => {
    if (!artifactManager) return;

    try {
      const url = await artifactManager.getFile({
        artifact_id: sessionId,
        file_path: filePath,
        _rkwargs: true
      });
      window.open(url, "_blank");
    } catch (err) {
      console.error("Failed to download file:", err);
      alert(`Failed to download: ${err}`);
    }
  };

  const handleDelete = async (filePath: string, fileType: string) => {
    if (!artifactManager) return;

    const confirmMsg = fileType === 'directory'
      ? `Delete folder "${filePath}" and all its contents?`
      : `Delete file "${filePath}"?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await artifactManager.removeFile({
        artifact_id: sessionId,
        file_path: filePath,
        _rkwargs: true
      });

      // Reload files
      await loadFiles("");
      setExpandedDirs({});
    } catch (err) {
      console.error("Failed to delete:", err);
      alert(`Failed to delete: ${err}`);
    }
  };

  const handleStageArtifact = async () => {
    if (!artifactManager || operationLoading) return;

    try {
      setOperationLoading('stage');
      await artifactManager.edit(sessionId, { stage: true, _rkwargs: true });

      // Refresh artifact state
      const updatedArtifact = await artifactManager.read(sessionId, { stage: true, _rkwargs: true });
      setCurrentArtifact(updatedArtifact);
    } catch (err) {
      console.error("Failed to stage artifact:", err);
      alert(`Failed to stage artifact: ${err}`);
    } finally {
      setOperationLoading(null);
    }
  };

  const handleCommitArtifact = async () => {
    if (!artifactManager || operationLoading) return;

    try {
      setOperationLoading('commit');
      await artifactManager.commit(sessionId, { _rkwargs: true });

      // Refresh artifact state
      const updatedArtifact = await artifactManager.read(sessionId, { stage: false, _rkwargs: true });
      setCurrentArtifact(updatedArtifact);

      // Reload files
      await loadFiles("");
      setExpandedDirs({});
    } catch (err) {
      console.error("Failed to commit artifact:", err);
      alert(`Failed to commit artifact: ${err}`);
    } finally {
      setOperationLoading(null);
    }
  };

  const handleDiscardArtifact = async () => {
    if (!artifactManager || operationLoading) return;

    if (!window.confirm("Discard all staged changes? This cannot be undone.")) return;

    try {
      setOperationLoading('discard');
      await artifactManager.discard(sessionId, { _rkwargs: true });

      // Refresh artifact state
      const updatedArtifact = await artifactManager.read(sessionId, { stage: false, _rkwargs: true });
      setCurrentArtifact(updatedArtifact);

      // Reload files
      await loadFiles("");
      setExpandedDirs({});
    } catch (err) {
      console.error("Failed to discard artifact:", err);
      alert(`Failed to discard artifact: ${err}`);
    } finally {
      setOperationLoading(null);
    }
  };

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

      // Refresh artifact state
      const updatedArtifact = await artifactManager.read(sessionId, { stage: true, _rkwargs: true });
      setCurrentArtifact(updatedArtifact);

      setStatusMessage({ type: 'success', text: 'Static hosting configuration saved' });
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

    const serverUrl = server.config.public_base_url || server.config.server_url;
    const parts = sessionId.split('/');
    if (parts.length !== 2) return;

    const [workspace, artifactAlias] = parts;
    const previewUrl = `${serverUrl}/${workspace}/view/${artifactAlias}/`;

    navigator.clipboard.writeText(previewUrl);
    setStatusMessage({ type: 'success', text: 'Preview URL copied to clipboard' });
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

  const handleUpload = async (files: FileList, targetPath: string = "") => {
    if (!artifactManager || !files.length) return;

    if (!canUpload) {
      setStatusMessage({ type: 'error', text: 'Cannot upload to committed artifacts. Please stage the artifact first.' });
      setTimeout(() => setStatusMessage(null), 5000);
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setStatusMessage({ type: 'info', text: `Uploading ${files.length} file(s)...` });

    try {
      const fileArray = Array.from(files);
      let completedCount = 0;

      for (const file of fileArray) {
        const filePath = targetPath ? `${targetPath}/${file.name}` : file.name;

        // Get upload URL
        const putUrl = await artifactManager.putFile({
          artifact_id: sessionId,
          file_path: filePath,
          _rkwargs: true
        });

        // Upload file
        await fetch(putUrl, {
          method: 'PUT',
          body: file,
        });

        completedCount++;
        setUploadProgress((completedCount / fileArray.length) * 100);
      }

      // Reload files
      await loadFiles("");
      setExpandedDirs({});
      setStatusMessage({ type: 'success', text: `Successfully uploaded ${files.length} file(s)` });
      setTimeout(() => setStatusMessage(null), 5000);
    } catch (err) {
      console.error("Failed to upload:", err);
      setStatusMessage({ type: 'error', text: `Failed to upload: ${err}` });
      setTimeout(() => setStatusMessage(null), 5000);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleCreateFolder = async (parentPath: string = "") => {
    if (!canUpload) {
      alert('Cannot create folders in committed artifacts. Please stage the artifact first.');
      return;
    }

    const folderName = window.prompt("Enter folder name:");
    if (!folderName || !artifactManager) return;

    const folderPath = parentPath ? `${parentPath}/${folderName}` : folderName;

    try {
      // Create an empty .gitkeep file to represent the folder
      const putUrl = await artifactManager.putFile({
        artifact_id: sessionId,
        file_path: `${folderPath}/.gitkeep`,
        _rkwargs: true
      });

      await fetch(putUrl, {
        method: 'PUT',
        body: new Blob([''], { type: 'text/plain' }),
      });

      await loadFiles("");
      setExpandedDirs({});
    } catch (err) {
      console.error("Failed to create folder:", err);
      alert(`Failed to create folder: ${err}`);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => prev + 1);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(prev => prev - 1);
  };

  const handleDrop = async (e: React.DragEvent, targetPath: string = "") => {
    e.preventDefault();
    e.stopPropagation();
    setDragCounter(0);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      await handleUpload(files, targetPath);
    }
  };

  const handleCreateZip = async () => {
    if (!server) return;

    try {
      // The create-zip-file endpoint is accessed via HTTP, not RPC
      // Format: {public_base_url}/{workspace}/artifacts/{artifact_alias}/create-zip-file
      const serverUrl = server.config.public_base_url || server.config.server_url;

      // sessionId is in format "workspace/artifact-alias"
      // We need to construct: {serverUrl}/{workspace}/artifacts/{artifact-alias}/create-zip-file
      const parts = sessionId.split('/');
      if (parts.length !== 2) {
        throw new Error('Invalid session ID format');
      }
      const [workspace, artifactAlias] = parts;
      const zipUrl = `${serverUrl}/${workspace}/artifacts/${artifactAlias}/create-zip-file`;

      window.open(zipUrl, "_blank");
    } catch (err) {
      console.error("Failed to create zip:", err);
      setStatusMessage({ type: 'error', text: `Failed to create zip: ${err}` });
      setTimeout(() => setStatusMessage(null), 5000);
    }
  };

  const toggleDirectory = async (fullPath: string) => {
    if (expandedDirs[fullPath]) {
      // Collapse
      const newExpanded = { ...expandedDirs };
      delete newExpanded[fullPath];
      setExpandedDirs(newExpanded);
    } else {
      // Expand
      const children = await loadFiles(fullPath);
      setExpandedDirs({ ...expandedDirs, [fullPath]: children });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900">Session Artifact: {sessionName}</h2>
            <p className="text-sm text-gray-500 font-mono mt-1">{sessionId}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Progress Bar */}
        {uploading && (
          <div className="w-full bg-gray-200 h-1">
            <div
              className="bg-indigo-600 h-1 transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}

        {/* Status Message */}
        {statusMessage && (
          <div className={`px-4 py-2 text-sm ${
            statusMessage.type === 'success' ? 'bg-green-50 text-green-800 border-b border-green-200' :
            statusMessage.type === 'error' ? 'bg-red-50 text-red-800 border-b border-red-200' :
            'bg-blue-50 text-blue-800 border-b border-blue-200'
          }`}>
            <div className="flex items-center gap-2">
              {statusMessage.type === 'success' && (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {statusMessage.type === 'error' && (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              {statusMessage.type === 'info' && (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <span>{statusMessage.text}</span>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-2 p-4 border-b border-gray-200 bg-gray-50">
          {/* Stage/Commit Status and Controls */}
          <div className="flex items-center gap-2 pr-2 border-r border-gray-300">
            {canUpload ? (
              <>
                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded">
                  Staged
                </span>
                <button
                  onClick={handleCommitArtifact}
                  disabled={operationLoading === 'commit'}
                  className="px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {operationLoading === 'commit' ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  Commit
                </button>
                <button
                  onClick={handleDiscardArtifact}
                  disabled={operationLoading === 'discard'}
                  className="px-3 py-2 bg-orange-600 text-white text-sm rounded hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {operationLoading === 'discard' ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  Discard Changes
                </button>
              </>
            ) : (
              <>
                <span className="px-2 py-1 bg-gray-200 text-gray-700 text-xs font-medium rounded">
                  Committed
                </span>
                <button
                  onClick={handleStageArtifact}
                  disabled={operationLoading === 'stage'}
                  className="px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {operationLoading === 'stage' ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  )}
                  Stage for Editing
                </button>
              </>
            )}
          </div>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !canUpload}
            className="px-3 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Upload Files
          </button>

          <button
            onClick={() => folderInputRef.current?.click()}
            disabled={uploading || !canUpload}
            className="px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Upload Folder
          </button>

          <button
            onClick={() => handleCreateFolder("")}
            disabled={uploading || !canUpload}
            className="px-3 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
            </svg>
            New Folder
          </button>

          <button
            onClick={handleCreateZip}
            className="px-3 py-2 bg-purple-600 text-white text-sm rounded hover:bg-purple-700 flex items-center gap-2 ml-auto"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download ZIP
          </button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleUpload(e.target.files)}
          />
          <input
            ref={folderInputRef}
            type="file"
            {...({ webkitdirectory: "", directory: "" } as any)}
            className="hidden"
            onChange={(e) => e.target.files && handleUpload(e.target.files)}
          />
        </div>

        {/* Static Hosting Configuration Section */}
        <div className="border-b border-gray-200 bg-gray-50">
          <button
            onClick={() => setShowStaticHostingSection(!showStaticHostingSection)}
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              <span className="font-semibold text-gray-700">Static Hosting</span>
              {staticHostingEnabled && (
                <span className="px-2 py-0.5 bg-green-100 text-green-800 text-xs font-medium rounded">
                  Enabled
                </span>
              )}
            </div>
            <svg
              className={`w-5 h-5 text-gray-500 transition-transform ${showStaticHostingSection ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showStaticHostingSection && (
            <div className="px-4 pb-4 space-y-4">
              {/* Enable/Disable Toggle */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">
                  Enable Static Hosting
                </label>
                <button
                  onClick={() => setStaticHostingEnabled(!staticHostingEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    staticHostingEnabled ? 'bg-green-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      staticHostingEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Root Directory Input */}
              {staticHostingEnabled && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Root Directory
                    </label>
                    <input
                      type="text"
                      value={rootDirectory}
                      onChange={(e) => setRootDirectory(e.target.value)}
                      placeholder="/"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      The root directory for serving static files (e.g., "/" or "/dist")
                    </p>
                  </div>

                  {/* Preview URL */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Preview URL
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={getPreviewUrl()}
                        readOnly
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 text-sm font-mono text-gray-600"
                      />
                      <button
                        onClick={handleCopyPreviewUrl}
                        className="px-3 py-2 bg-gray-600 text-white text-sm rounded hover:bg-gray-700 flex items-center gap-1"
                        title="Copy URL"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        Copy
                      </button>
                      <button
                        onClick={() => window.open(getPreviewUrl(), "_blank")}
                        className="px-3 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 flex items-center gap-1"
                        title="Open in new tab"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        Go
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* Save Button */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveStaticHosting}
                  disabled={operationLoading === 'save-hosting'}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
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
          )}
        </div>

        {/* File Tree Area */}
        <div
          className="flex-1 overflow-y-auto p-4"
          onDragOver={handleDragOver}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, "")}
        >
          {dragCounter > 0 && (
            <div className="absolute inset-0 bg-indigo-100 bg-opacity-50 border-4 border-dashed border-indigo-400 flex items-center justify-center z-10 pointer-events-none">
              <div className="bg-white p-8 rounded-lg shadow-lg">
                <svg className="w-16 h-16 mx-auto text-indigo-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-xl font-semibold text-gray-700">Drop files here to upload</p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <svg className="w-8 h-8 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
          ) : files.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <p className="text-lg font-medium">No files yet</p>
              <p className="text-sm mt-2">Upload files or drag and drop to get started</p>
            </div>
          ) : (
            <FileTreeComponent
              files={files}
              expandedDirs={expandedDirs}
              onToggle={toggleDirectory}
              onDownload={handleDownload}
              onDelete={handleDelete}
              onUpload={handleUpload}
              onCreateFolder={handleCreateFolder}
              onDrop={handleDrop}
              parentPath=""
            />
          )}

          {uploading && (
            <div className="fixed bottom-4 right-4 bg-white p-4 rounded-lg shadow-lg border border-gray-200">
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-sm font-medium text-gray-700">Uploading files...</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// File Tree Component
function FileTreeComponent({
  files,
  expandedDirs,
  onToggle,
  onDownload,
  onDelete,
  onUpload,
  onCreateFolder,
  onDrop,
  parentPath,
}: {
  files: FileItem[];
  expandedDirs: Record<string, FileItem[]>;
  onToggle: (path: string) => void;
  onDownload: (path: string) => void;
  onDelete: (path: string, type: string) => void;
  onUpload: (files: FileList, path: string) => void;
  onCreateFolder: (path: string) => void;
  onDrop: (e: React.DragEvent, path: string) => void;
  parentPath: string;
}) {
  return (
    <div className="space-y-1">
      {files.map((file) => {
        const fullPath = parentPath ? `${parentPath}/${file.name}` : file.name;
        const isExpanded = !!expandedDirs[fullPath];
        const isDirectory = file.type === 'directory';

        return (
          <div key={fullPath}>
            <div className="group flex items-center gap-2 p-2 hover:bg-gray-50 rounded transition-colors">
              {isDirectory && (
                <button
                  onClick={() => onToggle(fullPath)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg
                    className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              )}

              <div className="flex items-center gap-2 flex-1 min-w-0">
                {isDirectory ? (
                  <svg className="w-5 h-5 text-yellow-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                )}
                <span className="text-sm text-gray-700 truncate">{file.name}</span>
                {file.size !== undefined && (
                  <span className="text-xs text-gray-400">
                    {formatFileSize(file.size)}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {!isDirectory && (
                  <button
                    onClick={() => onDownload(fullPath)}
                    className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                    title="Download"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                )}
                <button
                  onClick={() => onDelete(fullPath, file.type)}
                  className="p-1 text-red-600 hover:bg-red-50 rounded"
                  title="Delete"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>

            {isExpanded && expandedDirs[fullPath] && (
              <div className="ml-6 border-l border-gray-200 pl-2">
                <FileTreeComponent
                  files={expandedDirs[fullPath]}
                  expandedDirs={expandedDirs}
                  onToggle={onToggle}
                  onDownload={onDownload}
                  onDelete={onDelete}
                  onUpload={onUpload}
                  onCreateFolder={onCreateFolder}
                  onDrop={onDrop}
                  parentPath={fullPath}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
