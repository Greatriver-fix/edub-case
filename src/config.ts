// Determine API base URL based on environment
// In development (NODE_ENV=development), use the local backend server directly.
// In production (or other environments), use relative paths for proxying.
const isDevelopment = process.env.NODE_ENV === 'development';
export const API_BASE_URL = isDevelopment ? 'http://localhost:3001' : '';

// Helper function to construct API URLs
export const getApiUrl = (path: string) => {
    // Ensure the path starts with a slash if API_BASE_URL is empty (relative path)
    const formattedPath = API_BASE_URL === '' && !path.startsWith('/') ? `/${path}` : path;
    return `${API_BASE_URL}${formattedPath}`;
};
