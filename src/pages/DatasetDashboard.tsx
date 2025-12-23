import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { get, keys, set } from "idb-keyval";
import { useKernel } from "../contexts/KernelContext";
import { useHyphaStore } from "../store/hyphaStore";
import DatasetInfo from "../components/DatasetInfo";

interface DatasetMetadata {
  name: string;
  id: string;
  description: string;
  timestamp: number;
}

export default function DatasetDashboard() {
  const { datasetId } = useParams<{ datasetId: string }>();
  const navigate = useNavigate();
  const { isReady, kernelStatus } = useKernel();

  const [datasets, setDatasets] = useState<DatasetMetadata[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<DatasetMetadata | null>(null);
  const [loading, setLoading] = useState(true);

  // Load all mounted datasets
  useEffect(() => {
    const loadDatasets = async () => {
      try {
        const allKeys = await keys();
        const datasetKeys = allKeys.filter(k =>
          typeof k === 'string' && k.startsWith('dataset_metadata_')
        );

        const loadedDatasets: DatasetMetadata[] = [];
        for (const key of datasetKeys) {
          const metadata = await get(key);
          if (metadata) {
            loadedDatasets.push(metadata);
          }
        }

        // Sort by timestamp (newest first)
        loadedDatasets.sort((a, b) => b.timestamp - a.timestamp);
        setDatasets(loadedDatasets);

        // Select current dataset if specified
        if (datasetId) {
          const current = loadedDatasets.find(d => d.id === datasetId);
          if (current) {
            setSelectedDataset(current);
          }
        }
      } catch (err) {
        console.error('Failed to load datasets:', err);
      } finally {
        setLoading(false);
      }
    };

    loadDatasets();
  }, [datasetId]);

  // Mount a new dataset
  const handleMountNewDataset = async () => {
    if (!('showDirectoryPicker' in window)) {
      alert("Your browser doesn't support folder selection. Please use Google Chrome or Microsoft Edge.");
      return;
    }

    try {
      const handle = await (window as any).showDirectoryPicker({
        mode: 'readwrite'
      });

      const datasetName = handle.name;
      const slugifyDatasetName = (name: string) => {
        return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      };
      const datasetId = slugifyDatasetName(datasetName);

      const metadata = {
        name: datasetName,
        id: datasetId,
        description: '',
        timestamp: Date.now()
      };

      await set(`dataset_handle_${datasetId}`, handle);
      await set(`dataset_metadata_${datasetId}`, metadata);

      // Reload datasets and navigate to the new one
      const allKeys = await keys();
      const datasetKeys = allKeys.filter(k =>
        typeof k === 'string' && k.startsWith('dataset_metadata_')
      );
      const loadedDatasets: DatasetMetadata[] = [];
      for (const key of datasetKeys) {
        const meta = await get(key);
        if (meta) loadedDatasets.push(meta);
      }
      setDatasets(loadedDatasets.sort((a, b) => b.timestamp - a.timestamp));

      navigate(`/datasets/${datasetId}`, { state: { ...metadata, autoStart: true } });
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return;
      }
      console.error('Failed to select folder:', err);
      alert('Failed to select folder. Please try again.');
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
    <div className="flex h-[calc(100vh-4rem)] bg-gradient-to-br from-gray-50 to-blue-50">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col shadow-lg">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800">My Datasets</h2>
            <button
              onClick={() => navigate('/datasets')}
              className="text-gray-500 hover:text-gray-700 transition-colors"
              title="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Mount Dataset Button */}
          <button
            onClick={handleMountNewDataset}
            className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-indigo-700 shadow-md transform transition-all hover:scale-[1.02] flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Mount New Dataset
          </button>
        </div>

        {/* Dataset List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading ? (
            <div className="text-center py-8 text-gray-500">
              <svg className="animate-spin h-6 w-6 mx-auto mb-2" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Loading datasets...
            </div>
          ) : datasets.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              <p className="text-sm">No datasets mounted yet</p>
              <button
                onClick={() => navigate('/datasets')}
                className="mt-3 text-sm text-blue-600 hover:text-blue-700"
              >
                Mount a dataset
              </button>
            </div>
          ) : (
            datasets.map(dataset => (
              <button
                key={dataset.id}
                onClick={() => {
                  navigate(`/datasets/${dataset.id}`);
                }}
                className={`w-full text-left p-3 rounded-lg border transition-all transform hover:scale-[1.02] ${
                  selectedDataset?.id === dataset.id
                    ? 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-300 shadow-md ring-2 ring-blue-400 ring-opacity-50'
                    : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300 hover:shadow'
                }`}
              >
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 mt-0.5 flex-shrink-0 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{dataset.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{formatDate(dataset.timestamp)}</p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto">
        {selectedDataset ? (
          <DatasetInfo key={selectedDataset.id} dataset={selectedDataset} />
        ) : (
          <div className="flex items-center justify-center h-full p-8">
            <div className="max-w-2xl w-full">
              {/* Elegant Mount Dataset Card */}
              <div className="bg-gradient-to-br from-white via-blue-50 to-indigo-50 rounded-3xl shadow-2xl border border-blue-100 p-12 text-center transform transition-all hover:scale-[1.01]">
                {/* Icon */}
                <div className="mb-8 relative">
                  <div className="w-32 h-32 mx-auto bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl flex items-center justify-center shadow-xl transform rotate-3 transition-transform hover:rotate-6">
                    <svg className="w-20 h-20 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                  </div>
                  <div className="absolute top-0 right-1/4 w-4 h-4 bg-yellow-400 rounded-full animate-pulse"></div>
                  <div className="absolute bottom-4 left-1/4 w-3 h-3 bg-green-400 rounded-full animate-pulse delay-75"></div>
                </div>

                {/* Title */}
                <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-gray-900 via-blue-800 to-indigo-900 bg-clip-text text-transparent">
                  Mount Your Dataset
                </h1>

                {/* Description */}
                <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                  Connect your local folder to start analyzing data with AI agents.<br />
                  <span className="text-sm text-gray-500">Your data stays on your computer - 100% private and secure.</span>
                </p>

                {/* Prominent Mount Button */}
                <button
                  onClick={handleMountNewDataset}
                  className="group relative px-12 py-6 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white text-xl font-bold rounded-2xl shadow-2xl hover:shadow-3xl transform transition-all duration-300 hover:scale-110 hover:rotate-1 overflow-hidden"
                >
                  {/* Animated background */}
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-600 via-indigo-600 to-blue-600 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

                  {/* Button content */}
                  <div className="relative flex items-center justify-center gap-4">
                    <svg className="w-8 h-8 transform group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                    <span>Select Folder to Mount</span>
                    <svg className="w-6 h-6 transform group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </div>
                </button>

                {/* Features */}
                <div className="mt-12 grid grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="w-12 h-12 mx-auto mb-3 bg-green-100 rounded-xl flex items-center justify-center">
                      <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-gray-700">100% Private</p>
                    <p className="text-xs text-gray-500">Data never leaves your device</p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 mx-auto mb-3 bg-blue-100 rounded-xl flex items-center justify-center">
                      <svg className="w-7 h-7 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-gray-700">Instant Setup</p>
                    <p className="text-xs text-gray-500">No upload or configuration</p>
                  </div>
                  <div className="text-center">
                    <div className="w-12 h-12 mx-auto mb-3 bg-purple-100 rounded-xl flex items-center justify-center">
                      <svg className="w-7 h-7 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-gray-700">AI Ready</p>
                    <p className="text-xs text-gray-500">Works with any AI agent</p>
                  </div>
                </div>

                {/* Browser note */}
                <p className="mt-8 text-xs text-gray-400">
                  Requires Chrome, Edge, or another browser with File System Access API support
                </p>
              </div>

              {/* Or select existing dataset hint */}
              {datasets.length > 0 && (
                <div className="mt-8 text-center">
                  <p className="text-gray-500">
                    or select an existing dataset from the sidebar
                    <svg className="w-4 h-4 inline ml-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
