import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';

import ArtifactGrid from './components/ArtifactGrid';
import ArtifactDetails from './components/ArtifactDetails';
import Snackbar from './components/Snackbar';
import About from './components/About';
import Footer from './components/Footer';
import Upload from './components/Upload';
import MyArtifacts from './components/MyArtifacts';
import Edit from './components/Edit';
import Composer from './components/Composer';
import './index.css'
import './github-markdown.css'
import { HyphaProvider } from './HyphaContext';
import AdminDashboard from './pages/AdminDashboard';
import ReviewArtifacts from './components/ReviewArtifacts';
import ApiDocs from './components/ApiDocs';
import TermsOfService from './components/TermsOfService';
import BioEngineHome from './components/BioEngine/BioEngineHome';
import BioEngineWorker from './components/BioEngine/BioEngineWorker';
import DatasetDashboard from './pages/DatasetDashboard';
import AgentManager from './pages/AgentManager';
import { KernelProvider } from './contexts/KernelContext';

// Add a utility function to check if footer should be hidden
const shouldHideFooter = (pathname: string): boolean => {
  return pathname.startsWith('/edit/') || pathname === '/upload' || pathname.startsWith('/datasets/') || pathname === '/agent-manager';
};

// Create a wrapper component that uses Router hooks
const AppContent: React.FC = () => {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const hasResourceId = searchParams.has('id');
  const hideFooter = shouldHideFooter(location.pathname);

  // Add state for Snackbar
  const [snackbarOpen, setSnackbarOpen] = React.useState(false);
  const [snackbarMessage, setSnackbarMessage] = React.useState('');

  // Add search handlers
  const handleSearchChange = (value: string) => {
    // Implement search logic
  };

  const handleSearchConfirm = (value: string) => {
    // Implement search confirmation logic
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <Snackbar 
        isOpen={snackbarOpen}
        message={snackbarMessage}
        onClose={() => setSnackbarOpen(false)}
      />
      <main className="w-full overflow-x-hidden">
        <Routes>
          <Route
            path="/"
            element={<Navigate to="/tools" replace />}
          />
          <Route 
            path="/resources/:id" 
            element={<ArtifactDetails />} 
          />
          <Route 
            path="/artifacts/:id/:version?"
            element={<ArtifactDetails />} 
          />
          <Route 
            path="/about" 
            element={<About />} 
          />
          <Route path="/tools" element={<ArtifactGrid type="tool" />} />
          <Route path="/agents" element={<ArtifactGrid type="agent" />} />
          <Route path="/datasets" element={<ArtifactGrid type="datasets" />} />
          <Route path="/datasets/:datasetId" element={<DatasetDashboard />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/composer" element={<Composer />} />
          <Route path="/my-artifacts" element={<MyArtifacts />} />
          <Route path="/edit/:artifactId/:version?" element={<Edit />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/review" element={<ReviewArtifacts />} />
          <Route path="/api" element={<ApiDocs />} />
          <Route path="/toc" element={<TermsOfService />} />
          <Route path="/bioengine" element={<BioEngineHome />} />
          <Route path="/bioengine/worker" element={<BioEngineWorker />} />
          <Route path="/agent-manager" element={<AgentManager />} />
        </Routes>
      </main>
      {!hideFooter && <Footer />}
    </div>
  );
};

// Main App component that provides Router context
const App: React.FC = () => {
  return (
    <HyphaProvider>
      <KernelProvider>
        <HashRouter>
          <AppContent />
        </HashRouter>
      </KernelProvider>
    </HyphaProvider>
  );
};

export default App;
