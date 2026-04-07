const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, '');
const processEnv = typeof process !== 'undefined' ? process.env : undefined;

const getApiBaseUrl = () => {
    const configuredBaseUrl = processEnv?.PUBLIC_API_BASE_URL?.trim();
    if (configuredBaseUrl) {
        return normalizeBaseUrl(configuredBaseUrl);
    }

    if (typeof window === 'undefined') {
        return processEnv?.NODE_ENV === 'development' ? 'http://localhost:3001' : '';
    }

    const { protocol, hostname, port } = window.location;
    const isLoopbackHost = hostname === 'localhost' || hostname === '127.0.0.1';

    // Bun's HTML dev server serves the UI on its own port, while the API stays on 3001.
    if (isLoopbackHost && port !== '3001') {
        return `${protocol}//${hostname}:3001`;
    }

    return '';
};

export const API_BASE_URL = getApiBaseUrl();

// Helper function to construct API URLs
export const getApiUrl = (path: string) => {
    // Ensure the path starts with a slash if API_BASE_URL is empty (relative path)
    const formattedPath = API_BASE_URL === '' && !path.startsWith('/') ? `/${path}` : path;
    return `${API_BASE_URL}${formattedPath}`;
};
