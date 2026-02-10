import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHyphaStore } from '../store/hyphaStore';
import { ArtifactInfo } from '../types/artifact';
import { Card, CardContent, IconButton, Button, Snackbar, Alert, CircularProgress } from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { composeMcpService } from '../utils/mcpUtils';

interface ArtifactServiceInfo {
  artifact: ArtifactInfo;
  serverUrl: string;
  serviceId: string;
  functionId: string;
}

const Composer: React.FC = () => {
  const navigate = useNavigate();
  const { selectedArtifacts, removeFromCart, clearCart } = useHyphaStore();
  const [artifacts, setArtifacts] = useState<ArtifactInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [composedUrl, setComposedUrl] = useState<string>('');
  const [serviceUrl, setServiceUrl] = useState<string>('');
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  // Fetch artifact details for all selected artifacts
  useEffect(() => {
    const fetchArtifacts = async () => {
      setLoading(true);
      try {
        const promises = selectedArtifacts.map(async (id) => {
          const [workspace, artifactName] = id.includes('/')
            ? id.split('/')
            : ['24agents-science', id];

          const url = `https://hypha.aicell.io/${workspace}/artifacts/${artifactName}`;
          const response = await fetch(url);

          if (!response.ok) {
            throw new Error(`Failed to fetch artifact: ${artifactName}`);
          }

          return response.json();
        });

        const fetchedArtifacts = await Promise.all(promises);
        setArtifacts(fetchedArtifacts);
      } catch (error) {
        console.error('Error fetching artifacts:', error);
        setSnackbarMessage('Error loading artifacts');
        setSnackbarOpen(true);
      } finally {
        setLoading(false);
      }
    };

    if (selectedArtifacts.length > 0) {
      fetchArtifacts();
    } else {
      setLoading(false);
    }
  }, [selectedArtifacts]);

  const handleRemoveArtifact = (artifactId: string) => {
    removeFromCart(artifactId);
  };

  const handleClearAll = () => {
    clearCart();
    navigate('/tools');
  };

  const generateComposedUrl = async () => {
    try {
      setLoading(true);
      setSnackbarMessage('Connecting to Hypha server...');
      setSnackbarOpen(true);

      const mcpUrl = await composeMcpService(selectedArtifacts);

      const serviceUrl = mcpUrl.replace('/mcp/', '/services/').replace('/mcp', '');
      
      console.log('✓ Composed service registered!');
      console.log('Service URL:', serviceUrl);
      console.log('MCP URL:', mcpUrl);

      setServiceUrl(serviceUrl);
      setComposedUrl(mcpUrl);
      setSnackbarMessage('Composed service created successfully!');
      setSnackbarOpen(true);

    } catch (error: any) {
      console.error('Error generating composed URL:', error);
      setSnackbarMessage(`Error: ${error.message || 'Failed to create composed service'}`);
      setSnackbarOpen(true);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyUrl = (url: string, label: string) => {
    if (url) {
      navigator.clipboard.writeText(url)
        .then(() => {
          setSnackbarMessage(`${label} copied to clipboard!`);
          setSnackbarOpen(true);
        })
        .catch(err => {
          console.error('Failed to copy URL', err);
          setSnackbarMessage('Failed to copy URL');
          setSnackbarOpen(true);
        });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-gray-300 border-t-blue-600"></div>
      </div>
    );
  }

  if (selectedArtifacts.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <AutoFixHighIcon sx={{ fontSize: 64, color: '#9ca3af', mb: 2 }} />
          <h2 className="text-2xl font-semibold text-gray-800 mb-2">No Artifacts Selected</h2>
          <p className="text-gray-600 mb-6">
            Select some artifacts from the catalog to compose them into an MCP server
          </p>
          <Button
            variant="contained"
            onClick={() => navigate('/tools')}
            sx={{
              background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
              '&:hover': {
                background: 'linear-gradient(135deg, #2563eb, #4f46e5)',
              }
            }}
          >
            Browse Tools
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-cyan-50">
      <div className="max-w-[1400px] mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-800 mb-2">MCP Server Composer</h1>
              <p className="text-gray-600">
                Compose multiple artifacts into a single MCP server URL
              </p>
            </div>
            <Button
              variant="outlined"
              color="error"
              onClick={handleClearAll}
              startIcon={<DeleteIcon />}
            >
              Clear All
            </Button>
          </div>

          {/* Stats */}
          <div className="bg-white/70 backdrop-blur-sm rounded-xl p-4 border border-blue-200/50">
            <div className="flex items-center gap-6">
              <div>
                <span className="text-2xl font-bold text-blue-600">{selectedArtifacts.length}</span>
                <span className="text-gray-600 ml-2">Artifact{selectedArtifacts.length !== 1 ? 's' : ''} Selected</span>
              </div>
            </div>
          </div>
        </div>

        {/* Selected Artifacts Grid */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Selected Artifacts</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {artifacts.map((artifact) => (
              <Card
                key={artifact.id}
                sx={{
                  backgroundColor: 'rgba(255, 255, 255, 0.8)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(229, 231, 235, 0.8)',
                  borderRadius: '16px',
                  boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
                  transition: 'all 0.3s ease',
                  '&:hover': {
                    boxShadow: '0 8px 15px rgba(0, 0, 0, 0.1)',
                    transform: 'translateY(-2px)',
                  }
                }}
              >
                <CardContent>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2 flex-1">
                      {artifact.manifest.icon ? (
                        <img
                          src={artifact.manifest.icon}
                          alt={artifact.manifest.name}
                          className="w-8 h-8 object-contain"
                        />
                      ) : artifact.manifest.id_emoji ? (
                        <span className="text-2xl">{artifact.manifest.id_emoji}</span>
                      ) : (
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-100 to-purple-100 rounded-full" />
                      )}
                      <div className="flex-1">
                        <h3 className="text-base font-semibold text-gray-900 truncate">
                          {artifact.manifest.name}
                        </h3>
                        <div className="flex items-center gap-1 mt-1">
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            (artifact.manifest.type || artifact.type) === 'tool'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {artifact.manifest.type || artifact.type || 'unknown'}
                          </span>
                          {(artifact.manifest.type || artifact.type) !== 'tool' && (
                            <span className="text-xs text-yellow-600">
                              (not composable)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <IconButton
                      size="small"
                      onClick={() => handleRemoveArtifact(artifact.id)}
                      sx={{
                        color: 'rgba(239, 68, 68, 1)',
                        '&:hover': {
                          backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        }
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </div>

                  <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                    {artifact.manifest.description}
                  </p>

                  <div className="text-xs text-gray-500">
                    <code className="bg-gray-100 px-2 py-1 rounded">
                      {artifact.id.split('/').pop()}
                    </code>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Compose Section */}
        <div className="bg-white/70 backdrop-blur-sm rounded-xl p-6 border border-blue-200/50">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Composed MCP Server</h2>

          {!composedUrl ? (
            <div className="text-center py-8">
              <div className="bg-blue-50 rounded-lg p-4 mb-6 border border-blue-200 text-left">
                <p className="text-sm text-gray-700">
                  <strong>Note:</strong> Only artifacts with type "tool" can be composed into an MCP server.
                  Datasets, models, and collections will be automatically skipped.
                </p>
              </div>
              <p className="text-gray-600 mb-6">
                Click the button below to generate a composed MCP server URL for all selected tool artifacts
              </p>
              <Button
                variant="contained"
                size="large"
                onClick={generateComposedUrl}
                disabled={loading}
                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <AutoFixHighIcon />}
                sx={{
                  background: 'linear-gradient(135deg, #3b82f6, #6366f1)',
                  padding: '12px 32px',
                  fontSize: '16px',
                  fontWeight: 600,
                  '&:hover': {
                    background: 'linear-gradient(135deg, #2563eb, #4f46e5)',
                    transform: 'scale(1.02)',
                  },
                  '&:disabled': {
                    background: 'linear-gradient(135deg, #9ca3af, #6b7280)',
                  }
                }}
              >
                {loading ? 'Creating Service...' : 'Generate MCP URL'}
              </Button>
            </div>
          ) : (
            <div>
              <div className="space-y-4 mb-4">
                {/* Service URL */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Service URL
                  </label>
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="flex items-start gap-3">
                      <code className="text-sm text-gray-800 break-all flex-1">
                        {serviceUrl}
                      </code>
                      <IconButton
                        onClick={() => handleCopyUrl(serviceUrl, 'Service URL')}
                        sx={{
                          color: '#3b82f6',
                          '&:hover': {
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                          }
                        }}
                      >
                        <ContentCopyIcon />
                      </IconButton>
                    </div>
                  </div>
                </div>

                {/* MCP URL */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    MCP URL
                  </label>
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="flex items-start gap-3">
                      <code className="text-sm text-gray-800 break-all flex-1">
                        {composedUrl}
                      </code>
                      <IconButton
                        onClick={() => handleCopyUrl(composedUrl, 'MCP URL')}
                        sx={{
                          color: '#3b82f6',
                          '&:hover': {
                            backgroundColor: 'rgba(59, 130, 246, 0.1)',
                          }
                        }}
                      >
                        <ContentCopyIcon />
                      </IconButton>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <h3 className="font-semibold text-gray-800 mb-2">How to use these URLs:</h3>
                <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1">
                  <li>Copy either the Service URL or MCP URL above</li>
                  <li>Add it to your MCP client configuration</li>
                  <li>Your client will have access to all selected artifacts</li>
                </ol>
              </div>
            </div>
          )}
        </div>
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

export default Composer;
