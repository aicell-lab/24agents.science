import React, { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useHyphaStore } from '../store/hyphaStore';
import SearchBar from './SearchBar';
import ArtifactCard from './ArtifactCard';
import PartnerScroll from './PartnerScroll';
import { Grid } from '@mui/material';
import TagSelection from './TagSelection';

interface ResourceGridProps {
  type?: 'tool' | 'data' | 'agent' ;
}

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

export const Pagination = ({ currentPage, totalPages, totalItems, onPageChange }: PaginationProps) => {
  const getPageNumbers = () => {
    const delta = 2; // Number of pages to show around current page
    const range = [];
    const rangeWithDots = [];

    // Always include first page
    range.push(1);

    // Add pages around current page
    for (let i = Math.max(2, currentPage - delta); i <= Math.min(totalPages - 1, currentPage + delta); i++) {
      range.push(i);
    }

    // Always include last page (if more than 1 page)
    if (totalPages > 1) {
      range.push(totalPages);
    }

    // Remove duplicates and sort
    const uniqueRange = Array.from(new Set(range)).sort((a, b) => a - b);

    // Add ellipsis where there are gaps
    let prev = 0;
    for (const page of uniqueRange) {
      if (page - prev > 1) {
        rangeWithDots.push('...');
      }
      rangeWithDots.push(page);
      prev = page;
    }

    return rangeWithDots;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="flex justify-center items-center gap-2 mt-6 flex-wrap">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Previous
      </button>
      
      {/* Page numbers with ellipsis */}
      {pageNumbers.map((pageNum, index) => {
        if (pageNum === '...') {
          return (
            <span key={`ellipsis-${index}`} className="px-2 py-2 text-gray-500">
              ...
            </span>
          );
        }
        
        return (
          <button
            key={pageNum}
            onClick={() => onPageChange(pageNum as number)}
            className={`px-3 py-2 rounded-lg border transition-colors ${
              currentPage === pageNum 
                ? 'bg-blue-600 text-white border-blue-600 shadow-sm' 
                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {pageNum}
          </button>
        );
      })}
      
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="px-3 py-2 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Next
      </button>
      
      {/* Page info */}
      <div className="ml-4 text-sm text-gray-600 hidden sm:block">
        Page {currentPage} of {totalPages} ({totalItems} items)
      </div>
    </div>
  );
};

// Add this overlay spinner component
const LoadingOverlay = () => (
  <div className="fixed inset-0 bg-black/10 backdrop-blur-sm flex items-center justify-center z-50">
    <div className="bg-white/80 backdrop-blur-lg rounded-xl p-8 flex flex-col items-center shadow-lg border border-white/50">
      <div className="animate-spin rounded-full h-12 w-12 border-2 border-gray-300 border-t-blue-600 mb-4"></div>
      <div className="text-lg font-medium text-gray-700">Loading resources...</div>
      <div className="text-sm text-gray-500 mt-1">Please wait while we fetch the latest data</div>
    </div>
  </div>
);

export const ArtifactGrid: React.FC<ResourceGridProps> = ({ type }) => {
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const location = useLocation();
  const navigate = useNavigate();
  const { 
    resources,
    resourceType,
    setResourceType,
    fetchResources,
    totalItems,
    itemsPerPage
  } = useHyphaStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [serverSearchQuery, setServerSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const getCurrentType = useCallback(() => {
    const path = location.pathname.split('/')[1];
    // Convert plural path to singular type
    const typeMap: { [key: string]: string } = {
      'models': 'model',
      'datasets': 'dataset',
      'applications': 'application',
      'notebooks': 'notebook'
    };
    return typeMap[path] || null;
  }, [location.pathname]);

  useEffect(() => {
    // Update artifact type in store when path changes
    const currentType = getCurrentType();
    setResourceType(currentType);
    // Reset to first page when artifact type changes
    setCurrentPage(1);
  }, [getCurrentType, setResourceType]);

  useEffect(() => {
    const loadResources = async () => {
      try {
        // Cancel any ongoing request
        if (abortController) {
          abortController.abort();
        }

        // Create new abort controller for this request
        const newAbortController = new AbortController();
        setAbortController(newAbortController);

        setLoading(true);
        await fetchResources(currentPage, serverSearchQuery, {
          tags: selectedTags
        });
      } catch (error) {
        // Don't set loading to false if the request was aborted
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }
        console.error('Error loading resources:', error);
      } finally {
        setLoading(false);
        setAbortController(null);
      }
    };

    loadResources();
  }, [location.pathname, currentPage, resourceType, serverSearchQuery, selectedTags, fetchResources]);

  useEffect(() => {
    getCurrentType();
  }, [getCurrentType]);

  // Cleanup effect to cancel ongoing requests when component unmounts
  useEffect(() => {
    return () => {
      if (abortController) {
        abortController.abort();
      }
    };
  }, [abortController]);

  // Improved debounced server search that respects user typing
  useEffect(() => {
    // Only set up debounced search if user is actively typing
    if (isTyping) {
      const timer = setTimeout(() => {
        setIsTyping(false);
        setServerSearchQuery(searchQuery);
        setCurrentPage(1);
      }, 800); // Slightly longer delay for better UX

      return () => clearTimeout(timer);
    }
  }, [searchQuery, isTyping]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // Scroll to top when page changes
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handle search input changes with improved UX
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    setIsTyping(true);
    
    // Cancel any ongoing request when user starts typing
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
  };

  // Handle immediate search when user hits Enter
  const handleSearchConfirm = () => {
    setIsTyping(false);
    setServerSearchQuery(searchQuery);
    setCurrentPage(1);
  };

  const handlePartnerClick = useCallback((partnerId: string) => {
    setSearchQuery(partnerId);
    setIsTyping(false);
    setServerSearchQuery(partnerId);
    setCurrentPage(1);
  }, []);

  const handleTagSelect = (tag: string) => {
    setSelectedTags(prev => {
      return [tag];
    });
    setSearchQuery(tag);
    setIsTyping(false);
    setServerSearchQuery(tag);
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(totalItems / itemsPerPage);

  return (
    <div className="w-full">
      <div className="max-w-[1400px] mx-auto px-2 sm:px-4 md:px-4 lg:px-4">
        {/* Enhanced separator line with gradient and shadow */}
        <div className="relative w-full mb-8 sm:mb-12">
          <div className="w-full h-px bg-gradient-to-r from-transparent via-blue-300/50 to-transparent"></div>
          <div className="absolute inset-0 w-full h-px bg-gradient-to-r from-transparent via-purple-200/30 to-transparent transform translate-y-0.5"></div>
          {/* Subtle shadow line */}
          <div className="absolute inset-0 w-full h-2 bg-gradient-to-b from-blue-50/20 to-transparent transform translate-y-1"></div>
        </div>
        
        {/* Show loading overlay when loading (but not when just typing) */}
        {loading && !isTyping && <LoadingOverlay />}
        
        {/* <div className="community-partners mb-4">
          <div className="partner-logos">
            <PartnerScroll onPartnerClick={handlePartnerClick} />
          </div>
        </div> */}

        {/* Hero Slogan Section */}
        <div className="text-center px-2 sm:px-0">
         
           <p className="text-base sm:text-lg md:text-xl font-medium mb-2 bg-gradient-to-r from-blue-600 via-purple-600 to-cyan-600 bg-clip-text text-transparent">
             24Agents.Science -- Discover, Explore and Deploy Tools for Agents in Science
           </p>

        </div>
        
        <div className="relative mb-6 sm:mb-8">
          <div 
            className="absolute right-2 sm:right-10 -bottom-6 w-32 h-32 sm:w-64 sm:h-64 bg-contain bg-no-repeat bg-right-bottom opacity-20 pointer-events-none" 
            style={{ 
              backgroundImage: 'url(/static/img/zoo-background.svg)'
            }} 
          />
          <div className="max-w-3xl mx-auto w-full px-2 sm:px-0">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex-1 min-w-0">
                <SearchBar 
                  value={searchQuery}
                  onSearchChange={handleSearchChange}
                  onSearchConfirm={handleSearchConfirm}
                />
              </div>
              <div className="flex-none self-center sm:self-auto">
                <TagSelection 
                  onTagSelect={handleTagSelect}
                  selectedTags={selectedTags}
                />
              </div>
            </div>
          </div>
        </div>

        {/* BioEngine Button - Only show for applications */}
        {resourceType === 'application' && (
          <div className="max-w-3xl mx-auto mb-6 sm:mb-8 px-2 sm:px-0">
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-2xl p-4 sm:p-6 shadow-sm hover:shadow-md transition-all duration-200">
              <div className="flex flex-col sm:flex-row items-start sm:items-center sm:justify-between gap-4">
                <div className="flex items-center">
                  <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center mr-4 shadow-md p-1">
                    <img src="/bioengine-icon.svg" alt="BioEngine" className="w-10 h-10" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-1">
                      Run BioImage Models with BioEngine
                    </h3>
                    <p className="text-sm text-gray-600">
                      Bring bioimage models locally, on-premise or in the cloud. We support laptops, workstations, HPC clusters, and cloud platforms.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => navigate('/bioengine')}
                  className="w-full sm:w-auto sm:ml-2.5 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:from-blue-700 hover:to-purple-700 shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105 flex items-center justify-center"
                >
                  <span className="mr-2">Launch BioEngine</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        <Grid container spacing={2} sx={{ padding: { xs: 0.5, sm: 1, md: 2 } }}>
          {resources.map((artifact) => (
            <Grid 
              item 
              key={artifact.id} 
              xs={12}
              sm={6} 
              md={4} 
              lg={3} 
              sx={{
                minWidth: { xs: 'auto', sm: 280 },
                maxWidth: { xs: '100%', sm: 320 },
                margin: '0 auto'
              }}
            >
              <ArtifactCard artifact={artifact} />
            </Grid>
          ))}
        </Grid>
        
        {totalPages > 1 && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            onPageChange={handlePageChange}
          />
        )}
      </div>
    </div>
  );
};

export default ArtifactGrid; 