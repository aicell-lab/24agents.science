import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { keys, del } from 'idb-keyval';
import { useHyphaStore } from '../store/hyphaStore';
import { DatasetInfo } from '../types/dataset';
import MountDatasetDialog from '../components/MountDatasetDialog';

interface LocalDataset extends DatasetInfo {
  isRunning: boolean;
}

const MyDatasets: React.FC = () => {
  const navigate = useNavigate();
  const { user, artifactManager } = useHyphaStore();
  
  const [localDatasets, setLocalDatasets] = useState<LocalDataset[]>([]);
  const [publishedDatasets, setPublishedDatasets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showMountDialog, setShowMountDialog] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Load local datasets from localStorage and IndexedDB
  const loadLocalDatasets = async () => {
    try {
      // Get all dataset handles from IndexedDB
      const allKeys = await keys();
      const datasetKeys = allKeys.filter(
        (key): key is string => typeof key === 'string' && key.startsWith('dataset_handle_')
      );
      
      // Get running datasets
      const runningDatasets = new Set(
        JSON.parse(localStorage.getItem('running_datasets') || '[]')
      );
      
      // Load dataset info from localStorage
      const datasets: LocalDataset[] = [];
      for (const key of datasetKeys) {
        const datasetId = key.replace('dataset_handle_', '');
        const infoStr = localStorage.getItem(`dataset_${datasetId}`);
        if (infoStr) {
          const info = JSON.parse(infoStr) as DatasetInfo;
          datasets.push({
            ...info,
            isRunning: runningDatasets.has(datasetId)
          });
        }
      }
      
      // Sort by most recently created
      datasets.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setLocalDatasets(datasets);
    } catch (e) {
      console.error('Failed to load local datasets:', e);
    }
  };

  // Load published datasets from Hypha
  const loadPublishedDatasets = async () => {
    if (!user || !artifactManager) return;
    
    try {
      const artifacts = await artifactManager.list({
        parent_id: '24agents-science/24agents.science',
        filters: { type: 'dataset' },
        _rkwargs: true
      });
      
      // Filter to only show user's datasets
      const userDatasets = artifacts.filter(
        (a: any) => a.manifest?.uploader?.email === user.email
      );
      
      setPublishedDatasets(userDatasets);
    } catch (e) {
      console.error('Failed to load published datasets:', e);
    }
  };

  // Initial load
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      await Promise.all([loadLocalDatasets(), loadPublishedDatasets()]);
      setIsLoading(false);
    };
    load();
    
    // Listen for storage changes (running state updates)
    const handleStorage = () => {
      loadLocalDatasets();
    };
    window.addEventListener('storage', handleStorage);
    
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, [user, artifactManager]);

  // Handle opening a local dataset
  const handleOpenDataset = (dataset: LocalDataset) => {
    navigate(`/dataset/${dataset.id}`, { state: dataset });
  };

  // Handle deleting a local dataset
  const handleDeleteDataset = async (datasetId: string) => {
    try {
      // Remove from IndexedDB
      await del(`dataset_handle_${datasetId}`);
      
      // Remove from localStorage
      localStorage.removeItem(`dataset_${datasetId}`);
      
      // Reload list
      await loadLocalDatasets();
      setDeleteConfirm(null);
    } catch (e) {
      console.error('Failed to delete dataset:', e);
    }
  };

  // Handle viewing a published dataset
  const handleViewPublished = (artifact: any) => {
    navigate(`/artifacts/${artifact.id}`);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Datasets</h1>
            <p className="text-gray-600 mt-1">Manage your mounted and published datasets</p>
          </div>
          <button
            onClick={() => setShowMountDialog(true)}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-lg shadow-blue-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Mount New Dataset
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            {/* Local Datasets Section */}
            <div className="mb-10">
              <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                Local Datasets
              </h2>
              
              {localDatasets.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
                  <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                  <p className="text-gray-500 mb-4">No local datasets mounted yet.</p>
                  <button
                    onClick={() => setShowMountDialog(true)}
                    className="px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors"
                  >
                    Mount Your First Dataset
                  </button>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {localDatasets.map(dataset => (
                    <div
                      key={dataset.id}
                      className="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow"
                    >
                      <div className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <h3 className="font-semibold text-gray-900 truncate flex-1">{dataset.name}</h3>
                          {dataset.isRunning && (
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full flex items-center gap-1">
                              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                              Running
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 line-clamp-2 mb-3">
                          {dataset.description.split('\n')[0]}
                        </p>
                        <div className="text-xs text-gray-400 mb-4">
                          Created {formatDate(dataset.createdAt)}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleOpenDataset(dataset)}
                            className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            {dataset.isRunning ? 'View Dashboard' : 'Open'}
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(dataset.id)}
                            className="px-3 py-2 bg-gray-100 text-gray-600 text-sm rounded-lg hover:bg-red-100 hover:text-red-600 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Published Datasets Section */}
            {user && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Published Datasets
                </h2>
                
                {publishedDatasets.length === 0 ? (
                  <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
                    <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-gray-500">No published datasets yet.</p>
                    <p className="text-sm text-gray-400 mt-2">
                      Mount a dataset and click "Publish" to make it discoverable.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {publishedDatasets.map(artifact => (
                      <div
                        key={artifact.id}
                        className="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow"
                      >
                        <div className="p-5">
                          <div className="flex items-start justify-between mb-3">
                            <h3 className="font-semibold text-gray-900 truncate flex-1">
                              {artifact.manifest?.name || artifact.alias}
                            </h3>
                            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                              Published
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 line-clamp-2 mb-3">
                            {artifact.manifest?.description?.split('\n')[0] || 'No description'}
                          </p>
                          <div className="text-xs text-gray-400 mb-4">
                            Published {formatDate(artifact.created_at * 1000)}
                          </div>
                          <button
                            onClick={() => handleViewPublished(artifact)}
                            className="w-full px-3 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200 transition-colors"
                          >
                            View Details
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Mount Dialog */}
      <MountDatasetDialog
        open={showMountDialog}
        onClose={() => setShowMountDialog(false)}
      />

      {/* Delete Confirmation Dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteConfirm(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6">
            <h2 className="text-xl font-semibold mb-4">Remove Dataset?</h2>
            <p className="text-gray-600 mb-6">
              This will remove the dataset from your local list. The original files on your computer
              will not be affected.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteDataset(deleteConfirm)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyDatasets;
