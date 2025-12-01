import React, { useEffect, useState, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useKernel } from '../contexts/KernelContext';
import { useHyphaStore } from '../store/hyphaStore';
import { get } from '../utils/idb';
import { DATASET_STARTUP_SCRIPT } from '../lib/datasetStartup';
import { 
  Box, 
  Typography, 
  Paper, 
  Button, 
  CircularProgress, 
  Container,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  IconButton
} from '@mui/material';
import { 
  PlayArrow, 
  Stop, 
  Refresh, 
  ArrowBack,
  Terminal,
  CheckCircle,
  Error as ErrorIcon,
  Share
} from '@mui/icons-material';
import Snackbar from '../components/Snackbar';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField } from '@mui/material';

export default function MountedDatasetDashboard() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, server } = useHyphaStore();
  const { 
    kernelExecutionLog, 
    kernelStatus, 
    isReady, 
    executeCode, 
    restartKernel, 
    mountFolder,
    startKernel,
    destroyCurrentKernel,
    clearLogs
  } = useKernel();

  const [datasetInfo, setDatasetInfo] = useState<{name: string, description: string} | null>(null);
  const [isRestoring, setIsRestoring] = useState(true);
  const [hasStarted, setHasStarted] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarType, setSnackbarType] = useState<'success' | 'error' | 'info'>('info');
  const [mcpUrl, setMcpUrl] = useState("");
  const [showShareDialog, setShowShareDialog] = useState(false);

  const showMessage = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setSnackbarMessage(msg);
    setSnackbarType(type);
    setSnackbarOpen(true);
  };

  useEffect(() => {
    // Load dataset info
    const state = location.state as { name: string, description: string } | null;
    if (state) {
      setDatasetInfo(state);
    } else if (id) {
      const stored = localStorage.getItem(`dataset_${id}`);
      if (stored) {
        setDatasetInfo(JSON.parse(stored));
      }
    }
  }, [id, location.state]);

  useEffect(() => {
    const restoreAndStart = async () => {
      if (!id) return;
      
      try {
        setIsRestoring(true);
        clearLogs();
        
        // 1. Get handle
        const handle = await get(`dataset_handle_${id}`);
        if (!handle) {
          showMessage("Could not restore folder access. Please remount.", "error");
          setIsRestoring(false);
          return;
        }

        // 2. Start Kernel if needed
        if (!isReady) {
          await startKernel();
        }

        // 3. Mount
        // Wait for kernel to be ready
        // We'll do this in a separate effect or check isReady
      } catch (e) {
        console.error("Failed to restore", e);
        showMessage("Failed to restore session", "error");
        setIsRestoring(false);
      }
    };

    restoreAndStart();
  }, [id]); // Run once on mount

  // Effect to handle mounting and startup once kernel is ready
  useEffect(() => {
    const init = async () => {
      if (isReady && isRestoring && id && !hasStarted && datasetInfo && server) {
        try {
          const handle = await get(`dataset_handle_${id}`);
          if (handle) {
            await mountFolder(handle);
            
            // Set environment variables
            const envCode = `
import os
os.environ["DATASET_NAME"] = """${datasetInfo.name.replace(/"/g, '\\"')}"""
os.environ["DATASET_DESCRIPTION"] = """${datasetInfo.description.replace(/"/g, '\\"')}"""
os.environ["DATASET_ID"] = "${id}"
os.environ["CLIENT_ID"] = "${server.config.client_id}"
os.environ["HYPHA_TOKEN"] = "${server.config.token || ''}"
`;
            if (executeCode) {
              await executeCode(envCode + "\n" + DATASET_STARTUP_SCRIPT);
              setHasStarted(true);
              
              // Construct MCP URL
              const baseUrl = server.config.public_base_url || "https://hypha.aicell.io";
              const workspace = server.config.workspace;
              const clientId = server.config.client_id;
              const serviceId = `${id}-service`;
              const url = `${baseUrl}/${workspace}/mcp/${clientId}:${serviceId}/mcp`;
              setMcpUrl(url);
              
              showMessage("Service started successfully", "success");
            }
          }
        } catch (e) {
          console.error("Startup failed", e);
          showMessage("Failed to start service", "error");
        } finally {
          setIsRestoring(false);
        }
      }
    };
    init();
  }, [isReady, isRestoring, id, hasStarted, mountFolder, executeCode, datasetInfo, server]);

  const handleStop = async () => {
    await destroyCurrentKernel();
    setHasStarted(false);
    navigate('/datasets');
  };

  const handleRestart = async () => {
    setHasStarted(false);
    setIsRestoring(true);
    clearLogs();
    await restartKernel();
  };

  const handleShare = () => {
    setShowShareDialog(true);
  };

  const copyMcpUrl = () => {
    navigator.clipboard.writeText(mcpUrl);
    showMessage("MCP URL copied to clipboard", "success");
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Snackbar 
        isOpen={snackbarOpen} 
        message={snackbarMessage} 
        type={snackbarType} 
        onClose={() => setSnackbarOpen(false)} 
      />
      
      <Dialog open={showShareDialog} onClose={() => setShowShareDialog(false)} maxWidth="md" fullWidth>
        <DialogTitle>Share Dataset via MCP</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Typography variant="body1" gutterBottom>
              Share this URL with an agent to allow it to access this dataset:
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
              <TextField 
                fullWidth 
                value={mcpUrl} 
                InputProps={{ readOnly: true }} 
                variant="outlined" 
                size="small"
              />
              <Button variant="contained" onClick={copyMcpUrl}>Copy</Button>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowShareDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      <Box sx={{ mb: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
        <IconButton onClick={() => navigate('/datasets')}>
          <ArrowBack />
        </IconButton>
        <Box>
          <Typography variant="h4">{datasetInfo?.name || "Dataset Dashboard"}</Typography>
          <Typography variant="body1" color="textSecondary">{datasetInfo?.description}</Typography>
        </Box>
        <Box sx={{ ml: 'auto', display: 'flex', gap: 2 }}>
          <Chip 
            label={kernelStatus.toUpperCase()} 
            color={kernelStatus === 'idle' ? 'success' : kernelStatus === 'busy' ? 'warning' : 'error'} 
            variant="outlined"
          />
          {hasStarted && (
            <Button
              variant="outlined"
              startIcon={<Share />}
              onClick={handleShare}
            >
              Share
            </Button>
          )}
          <Button 
            variant="outlined" 
            startIcon={<Refresh />} 
            onClick={handleRestart}
            disabled={kernelStatus === 'starting'}
          >
            Restart
          </Button>
          <Button 
            variant="contained" 
            color="error" 
            startIcon={<Stop />} 
            onClick={handleStop}
          >
            Stop & Exit
          </Button>
        </Box>
      </Box>

      <Paper sx={{ p: 0, overflow: 'hidden', bgcolor: '#1e1e1e', color: '#fff', minHeight: '500px', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ p: 2, borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Terminal fontSize="small" />
          <Typography variant="subtitle2" sx={{ fontFamily: 'monospace' }}>Kernel Output</Typography>
          {isRestoring && <CircularProgress size={16} sx={{ ml: 2, color: '#fff' }} />}
        </Box>
        <Box sx={{ p: 2, flex: 1, overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.9rem' }}>
          {kernelExecutionLog.map((log, i) => (
            <Box key={i} sx={{ mb: 0.5, color: log.type === 'stderr' || log.type === 'error' ? '#ff6b6b' : '#a5d6a7' }}>
              <span style={{ opacity: 0.5, marginRight: 8 }}>[{new Date(log.timestamp || Date.now()).toLocaleTimeString()}]</span>
              {log.content}
            </Box>
          ))}
          {kernelExecutionLog.length === 0 && (
            <Typography color="gray" sx={{ fontStyle: 'italic' }}>Waiting for logs...</Typography>
          )}
        </Box>
      </Paper>
    </Container>
  );
}
