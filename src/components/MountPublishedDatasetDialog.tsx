import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Dialog, 
  DialogTitle, 
  DialogContent, 
  DialogActions, 
  Button, 
  Typography,
  Box,
  CircularProgress,
  TextField
} from '@mui/material';
import { FolderOpen } from '@mui/icons-material';
import { set } from '../utils/idb';

interface Dataset {
  id: string;
  name: string;
  description: string;
  dataset_id?: string;
}

interface MountPublishedDatasetDialogProps {
  open: boolean;
  onClose: () => void;
  dataset: Dataset | null;
}

export function MountPublishedDatasetDialog({ open, onClose, dataset }: MountPublishedDatasetDialogProps) {
  const navigate = useNavigate();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [dirHandle, setDirHandle] = useState<any>(null);
  const [isMounting, setIsMounting] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [datasetId, setDatasetId] = useState("");

  useEffect(() => {
    if (dataset) {
      setName(dataset.name);
      setDescription(dataset.description);
      setDatasetId(dataset.dataset_id || dataset.id);
    }
  }, [dataset]);

  const generateDatasetId = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '') // Remove strange characters
      .replace(/\s+/g, '-') // Replace spaces with dashes
      .replace(/-+/g, '-') // Remove duplicate dashes
      .trim();
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setName(newName);
    setDatasetId(generateDatasetId(newName));
  };

  const handleFolderSelect = async () => {
    try {
      // @ts-expect-error - showDirectoryPicker is not yet in standard types
      const handle = await window.showDirectoryPicker({
        mode: 'readwrite'
      });
      setDirHandle(handle);
      // If name is empty or default, use folder name
      if (!name || name === 'Local Dataset') {
        const newName = handle.name;
        setName(newName);
        setDatasetId(generateDatasetId(newName));
      }
    } catch (err) {
      console.error("Failed to select folder:", err);
    }
  };

  const handleMount = async () => {
    if (!dirHandle || !dataset) return;

    setIsMounting(true);

    try {
      const targetId = datasetId || dataset.dataset_id || dataset.id;
      await set(`dataset_handle_${targetId}`, dirHandle);

      const metadata = {
        id: targetId,
        name: name,
        description: description,
        timestamp: Date.now(),
        type: "local",
        status: "online"
      };
      localStorage.setItem(`dataset_${targetId}`, JSON.stringify(metadata));

      onClose();
      
      navigate(`/local/mounted/${targetId}`, { state: metadata });

    } catch (error) {
      console.error("Failed to prepare mount:", error);
    } finally {
      setIsMounting(false);
      setDirHandle(null);
    }
  };

  if (!dataset) return null;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Mount Dataset</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, py: 2 }}>
          <Typography variant="body1">
            Mount a local folder to serve as a dataset. The data remains on your machine.
          </Typography>

          <TextField
            label="Dataset Name"
            value={name}
            onChange={handleNameChange}
            fullWidth
            variant="outlined"
          />
          {datasetId && (
            <Typography variant="caption" color="textSecondary" sx={{ mt: -1, ml: 1 }}>
              ID: <span style={{ fontFamily: 'monospace' }}>{datasetId}</span>
            </Typography>
          )}

          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            multiline
            rows={3}
            variant="outlined"
          />
          
          <Box 
            sx={{ 
              border: '2px dashed', 
              borderColor: dirHandle ? 'primary.main' : 'grey.300',
              borderRadius: 2,
              p: 4,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              cursor: 'pointer',
              bgcolor: dirHandle ? 'primary.50' : 'transparent',
              '&:hover': {
                borderColor: 'primary.main',
                bgcolor: 'primary.50'
              }
            }}
            onClick={handleFolderSelect}
          >
            <FolderOpen sx={{ fontSize: 48, color: dirHandle ? 'primary.main' : 'grey.400', mb: 2 }} />
            <Typography variant="h6" color={dirHandle ? 'primary.main' : 'textSecondary'}>
              {dirHandle ? dirHandle.name : "Select Folder"}
            </Typography>
            <Typography variant="caption" color={dirHandle ? 'textSecondary' : 'textSecondary'}>
              {dirHandle ? "Click to change folder" : "Choose a directory on your computer"}
            </Typography>
          </Box>

          {dirHandle && (
            <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
              This folder will be mounted as <code>/data</code> in the secure environment.
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">Cancel</Button>
        <Button 
          onClick={handleMount} 
          variant="contained" 
          disabled={!dirHandle || !name || isMounting}
          startIcon={isMounting ? <CircularProgress size={20} color="inherit" /> : null}
        >
          {isMounting ? "Mounting..." : "Mount & Start"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
