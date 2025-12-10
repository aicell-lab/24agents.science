// Simple stub for toast notifications
export const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'loading' | 'info' = 'info') => {
  console.log(`[${type.toUpperCase()}] ${message}`);
  // TODO: Integrate with actual toast notification system if needed
};
