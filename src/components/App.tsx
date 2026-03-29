import React, { useState, useEffect, useMemo } from 'react'; // Added useEffect, useMemo
import { getApiUrl } from '../config';
import CaseOpener from './CaseOpener';
import WheelSpinner from './WheelSpinner'; // Import the new component
import CreateCaseForm from './CreateCaseForm';
import ItemTemplateManager from './ItemTemplateManager';
import UnboxedItemPopup from './UnboxedItemPopup'; // Import the popup component
import Tabs, { Tab } from './Tabs'; // Re-add import
import '../styles/style.css';
import './CaseOpener.css';
import './UnboxedItemPopup.css'; // Import popup CSS
// Assuming Tabs.css might be needed if it exists and has styles
// import './Tabs.css'; // Add if Tabs.css exists and is needed

// Define CaseItem interface (needed for history state)
// Align with CaseOpener/WheelSpinner after recent changes
interface CaseItem {
  name: string;
  display_color: string; // Use display_color
  percentage_chance: number; // Add percentage_chance (though not directly used in history display)
  image_url?: string | null;
  rules_text?: string | null; // Changed from rules to rules_text
  sound_url?: string | null;
  showPercentageInOpener?: boolean; // <<< ADDED
  item_template_id?: number; // Keep optional
}

// Interface for detailed case data (needed for App state)
interface CaseData {
  id: number;
  name: string;
  description: string | null;
  items: CaseItem[]; // Uses the updated CaseItem interface
}

// Interface for the list of cases fetched from /api/cases
interface CaseInfo {
    id: number;
    name: string;
    image_path: string | null; // Add image_path
}


function App() {
  const [isAdminMode, setIsAdminMode] = useState(false);
  // Load display mode from localStorage, default to 'case'
  const [displayMode, setDisplayMode] = useState<'case' | 'wheel'>(() => {
    try {
      const storedMode = localStorage.getItem('displayMode');
      return (storedMode === 'case' || storedMode === 'wheel') ? storedMode : 'case';
    } catch (e) {
      console.error("Failed to load displayMode from localStorage", e);
      return 'case';
    }
  });
  // Load volume from localStorage, default to 0.5
  const [volume, setVolume] = useState(() => {
    try {
      const storedVolume = localStorage.getItem('volume');
      const parsedVolume = storedVolume ? parseFloat(storedVolume) : 0.5;
      return isNaN(parsedVolume) ? 0.5 : parsedVolume;
    } catch (e) {
      console.error("Failed to load volume from localStorage", e);
      return 0.5;
    }
  });
  const [popupHistoryItem, setPopupHistoryItem] = useState<CaseItem | null>(null); // State for the item to show in history popup
  const [isHistoryPopupOpen, setIsHistoryPopupOpen] = useState(false); // State for history popup visibility
  const [unboxedHistory, setUnboxedHistory] = useState<CaseItem[]>(() => {
      // Load initial history from localStorage
      try {
          const storedHistory = localStorage.getItem('unboxHistory');
          return storedHistory ? JSON.parse(storedHistory) : [];
      } catch (e) {
          console.error("Failed to parse history from localStorage", e);
          return [];
      }
  });
  // Load selectedCaseId from localStorage, default to ''
  const [selectedCaseId, setSelectedCaseId] = useState<string>(() => {
    try {
      const storedCaseId = localStorage.getItem('selectedCaseId');
      return storedCaseId ?? ''; // Use stored ID if it exists, otherwise default to empty string
    } catch (e) {
      console.error("Failed to load selectedCaseId from localStorage", e);
      return '';
    }
  });
  const [selectedCaseData, setSelectedCaseData] = useState<CaseData | null>(null); // State for detailed data of selected case
  const [isLoadingCaseDetails, setIsLoadingCaseDetails] = useState(false); // Loading state for details fetch

  // Memoize sorted items for the content panel
  const sortedCaseItems = useMemo(() => {
    if (!selectedCaseData?.items) return [];
    // Filter out items with 0% chance, preserving the API's display_order
    return selectedCaseData.items.filter(item => item.percentage_chance > 0);
  }, [selectedCaseData]);

  // Effect to fetch selected case details when selectedCaseId changes
  useEffect(() => {
    if (!selectedCaseId) {
      setSelectedCaseData(null); // Clear details if no case is selected
      return;
    }

    setIsLoadingCaseDetails(true); // Set loading state
    fetch(getApiUrl(`/api/cases/${selectedCaseId}`)) // Use selectedCaseId state
      .then(response => {
        if (!response.ok) {
          // Try to parse error message from backend if available
          return response.json().then(errData => {
            throw new Error(errData.error || `HTTP error! status: ${response.status}`);
          }).catch(() => {
            // Fallback if parsing error message fails
            throw new Error(`HTTP error! status: ${response.status}`);
          });
        }
        return response.json();
      })
      .then((data: CaseData) => {
        if (!data || !Array.isArray(data.items)) {
           throw new Error("Invalid case data received from server.");
        }
         setSelectedCaseData(data); // Set the fetched detailed data

      })
      .catch(err => {
        console.error(`Error fetching case details for ${selectedCaseId}:`, err);
        if (err instanceof Error && err.message.includes('404')) {
          setSelectedCaseId('');
          try {
            localStorage.removeItem('selectedCaseId');
          } catch (storageError) {
            console.error("Failed to clear invalid selectedCaseId from localStorage", storageError);
          }
        }
        setSelectedCaseData(null); // Clear data on error
        // Optionally, set an error state to display in the panel
      })
      .finally(() => setIsLoadingCaseDetails(false)); // Clear loading state

  }, [selectedCaseId]); // Add selectedCaseId to dependency array


  // Handler for volume change (passed down)
  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    // Save volume to localStorage
    try {
      localStorage.setItem('volume', newVolume.toString());
    } catch (e) {
      console.error("Failed to save volume to localStorage", e);
    }
  };

  const handleAdminModeClick = async () => {
    if (isAdminMode) {
      setIsAdminMode(false);
      return;
    }

    const passwordAttempt = window.prompt("Enter admin password:");
    if (passwordAttempt === null) {
      return;
    }

    try {
      const response = await fetch(getApiUrl('/api/verify-admin'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: passwordAttempt }),
      });
      const result = await response.json().catch(() => null);

      if (response.ok && result?.success) {
        setIsAdminMode(true);
        alert("Admin mode enabled.");
      } else if (response.status === 401) {
        alert("Incorrect password.");
      } else {
        console.error("Verification request failed:", response.status, response.statusText);
        alert(result?.error || ("Verification failed. Status: " + response.status));
      }
    } catch (error) {
      console.error("Error during admin verification:", error);
      alert("An error occurred during verification.");
    }
  };

  // Handler for display mode change
  const handleDisplayModeChange = (mode: 'case' | 'wheel') => {
    setDisplayMode(mode);
    // Save display mode to localStorage
    try {
      localStorage.setItem('displayMode', mode);
    } catch (e) {
      console.error("Failed to save displayMode to localStorage", e);
    }
  };


  // Handler for receiving a new unboxed item from CaseOpener/WheelSpinner
  const handleNewUnbox = (newItem: CaseItem) => {
      // Update the history panel
      setUnboxedHistory(prevHistory => {
          const updatedHistory = [newItem, ...prevHistory].slice(0, 12); // Add to start, limit to 13
          // Save updated history to localStorage
          try {
              localStorage.setItem('unboxHistory', JSON.stringify(updatedHistory));
          } catch (e) {
              console.error("Failed to save history to localStorage", e);
          }
          return updatedHistory;
      });
  };

  // Handler to open the popup for a specific history item
  const handleHistoryItemClick = (item: CaseItem) => {
    setPopupHistoryItem(item);
    setIsHistoryPopupOpen(true);
  };

  // Handler for when a case is selected in CaseOpener or WheelSpinner
  const handleCaseSelected = (caseId: string) => {
    setSelectedCaseId(caseId); // Update the selected case ID in App state
    // Save selectedCaseId to localStorage
    try {
      localStorage.setItem('selectedCaseId', caseId);
    } catch (e) {
      console.error("Failed to save selectedCaseId to localStorage", e);
    }
  };

  return (
    // Add class for flex layout and remove position: relative
    <div className="app-container" style={{ padding: '20px', minHeight: 'calc(100vh - 40px)' /* Ensure container takes height */ }}>
      {/* Header (content centered inside) */}
      <header style={{ marginBottom: '10px', borderBottom: '1px solid var(--border-color)', paddingBottom: '5px' }}>
        {/* Keep header content centered, but header itself spans width */}
        <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}> {/* Increased max-width for header content */}
          {/* Left Side: Title/Subtitle */}
          <div style={{ textAlign: 'left' }}>
            <h1 style={{ color: 'var(--accent)', margin: 0, paddingBottom: '2px', fontSize: '1.8em' }}>
              Erobb221 Case Opener
            </h1>
            <p style={{ color: 'var(--secondary-text)', margin: 0, fontSize: '0.9em' }}></p>
          </div>
          {/* Right Side: Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            {/* Display Mode Radio Buttons */}
            {!isAdminMode && ( // Only show when not in admin mode
              <fieldset className="cs-fieldset" style={{ border: 'none', padding: 0, margin: 0 }}> {/* Remove default fieldset border/padding */}
                {/* Optional: Add a legend if desired, or remove if not needed */}
                {/* <legend>Select Mode</legend> */}
                <div className="radio-wrapper"> {/* Use div as wrapper, REMOVED inline margin */}
                  <input
                    type="radio"
                    name="displayMode"
                    id="displayModeCase" // Add unique ID
                    value="case"
                    checked={displayMode === 'case'}
                    onChange={() => handleDisplayModeChange('case')} // Use new handler
                  />
                  <label htmlFor="displayModeCase">Case Opening</label> {/* Use htmlFor */}
                </div>
                <div className="radio-wrapper"> {/* Use div as wrapper */}
                  <input
                    type="radio"
                    name="displayMode"
                    id="displayModeWheel" // Add unique ID
                    value="wheel"
                    checked={displayMode === 'wheel'}
                    onChange={() => handleDisplayModeChange('wheel')} // Use new handler
                  />
                  <label htmlFor="displayModeWheel">Wheel Spin</label> {/* Use htmlFor */}
                </div>
              </fieldset>
            )}
            {/* Volume Slider */}
            <div className="cs-slider" style={{ maxWidth: '150px' }}>
              <div className="ruler"></div>
              <input
                id="volume-range-header"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              />
              <label htmlFor="volume-range-header" style={{ fontSize: '0.8em' }}>Volume: {Math.round(volume * 100)}%</label>
            </div>
            <button
              type="button"
              className="cs-btn"
              onClick={handleAdminModeClick}
              style={{ minWidth: '110px' }}
            >
              {isAdminMode ? 'Exit Admin' : 'Admin'}
            </button>
          </div>
        </div> {/* Close header centering wrapper div */}
      </header>

      {/* NEW Wrapper for Flexbox Layout (Rules, Main Content, History) */}
      <div className="content-wrapper">

        {/* Case Content Panel (Formerly Rules Panel) */}
        <div className="case-content-panel"> {/* Renamed class */}
            <h4>Case Contents:</h4> {/* Updated heading */}
            {/* Display loading state */}
            {isLoadingCaseDetails && <p style={{ color: 'var(--secondary-text)' }}>Loading items...</p>}
            {/* Display sorted case items */}
            {!isLoadingCaseDetails && selectedCaseData && sortedCaseItems.length > 0 ? (
              <ul>
                {sortedCaseItems.map((item) => (
                  <li key={`${item.name}-${item.item_template_id || 'no-id'}-${item.percentage_chance}`}>
                    {/* Keep the flex container for layout */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                      {/* Conditionally wrap image or name with tooltip */}
                      {item.image_url ? (
                        // If image exists, wrap image with tooltip
                        <div className="cs-tooltip" style={{ display: 'inline-block', verticalAlign: 'middle' }}> {/* Add display style */}
                          <img src={getApiUrl(item.image_url)} alt="" loading="lazy" />
                          {item.rules_text && (
                            <span className="text">
                              {item.rules_text}
                            </span>
                          )}
                        </div>
                      ) : (
                        // If no image, wrap name with tooltip (placeholder or actual name)
                        <div className="cs-tooltip" style={{ display: 'inline-block', verticalAlign: 'middle' }}> {/* Add display style */}
                          <span style={{ color: item.display_color }}>{item.name}</span>
                           {item.rules_text && (
                             <span className="text">
                               {item.rules_text}
                             </span>
                           )}
                         </div>
                      )}
                      {/* Display name separately only if image exists (otherwise it's already wrapped) */}
                      {item.image_url && (
                         <span style={{ color: item.display_color }}>{item.name}</span>
                      )}
                      {/* Conditionally render percentage */}
                      {item.showPercentageInOpener === true && typeof item.percentage_chance === 'number' && (
                        <span className="item-percentage">{item.percentage_chance.toFixed(2)}%</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : !isLoadingCaseDetails && (
              <p style={{ color: 'var(--secondary-text)', fontSize: '0.9em' }}>
                {selectedCaseId ? 'No items found in this case.' : 'Select a case to view its contents.'}
              </p>
            )}
        </div>

        {/* Main Content Area (Moved inside wrapper) */}
        {/* Re-add className for styling */}
        <div className="main-content-area"> {/* Removed inline styles */}
          {/* Inner div might not be needed anymore, but keep for now */}
          <div>
          {isAdminMode ? (
            <Tabs>
              <Tab label="Open Case">
                <main>
                  {/* Pass down selectedCaseId and the handler */}
                  <CaseOpener 
                    volume={volume} 
                    onVolumeChange={handleVolumeChange} 
                    onNewUnbox={handleNewUnbox} 
                    selectedCaseId={selectedCaseId} 
                    onCaseSelected={handleCaseSelected} 
                  />
                </main>
              </Tab>
              <Tab label="Create Case">
                <main>
                  <CreateCaseForm />
                </main>
              </Tab>
              <Tab label="Item Templates">
                <main>
                  <ItemTemplateManager />
                </main>
              </Tab>
            </Tabs>
          ) : (
            // Non-admin mode: Render based on displayMode
            <main>
              {displayMode === 'case' ? (
                // Pass down selectedCaseId and the handler
                <CaseOpener 
                  volume={volume} 
                  onVolumeChange={handleVolumeChange} 
                  onNewUnbox={handleNewUnbox} 
                  selectedCaseId={selectedCaseId} 
                  onCaseSelected={handleCaseSelected} 
                />
              ) : (
                // Pass down selectedCaseId and the handler
                <WheelSpinner 
                  volume={volume} 
                  onVolumeChange={handleVolumeChange} 
                  onNewUnbox={handleNewUnbox} 
                  selectedCaseId={selectedCaseId} 
                  onCaseSelected={handleCaseSelected} 
                />
              )}
            </main>
          )}
          </div>
        </div> {/* Close Main Content Area */}

        {/* History Panel (Moved inside wrapper) */}
        <div className="history-panel-right"> {/* Removed inline styles, added class */}
            <h4>Unbox History</h4>
            {unboxedHistory.length === 0 ? (
              <p style={{ fontSize: '0.9em', color: 'var(--secondary-text)' }}>No items unboxed yet.</p>
          ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {unboxedHistory.map((item, index) => (
                      // Add onClick handler to the list item
                      <li 
                        key={`${item.item_template_id || item.name}-${item.image_url || 'no-image'}-${index}`} 
                        style={{ 
                          marginBottom: '8px', 
                          paddingBottom: '8px', 
                          borderBottom: '1px dashed var(--border-color-2)', 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '8px',
                          cursor: 'pointer' // Add pointer cursor
                        }}
                        onClick={() => handleHistoryItemClick(item)} // Call handler on click
                      >
                          {/* Optional: Small image preview */}
                          {item.image_url && (
                              <img
                                  src={getApiUrl(item.image_url)}
                                  alt="" // Decorative
                                  // Removed inline width and height
                                  style={{ objectFit: 'contain', flexShrink: 0, border: '1px solid var(--border-dark)' }}
                                  loading="lazy"
                              />
                          )}
                          {/* Use display_color for history item text */}
                          {/* Removed inline fontSize */}
                          <span style={{ color: item.display_color, wordBreak: 'break-word' }}>
                              {item.name}
                          </span>
                      </li>
                  ))}
              </ul>
          )}
        </div> {/* Close History Panel */}

      </div> {/* Close NEW content-wrapper */}

      {/* Render the History Item Popup */}
      <UnboxedItemPopup 
        item={popupHistoryItem} 
        isOpen={isHistoryPopupOpen} 
        onClose={() => setIsHistoryPopupOpen(false)} 
      />

    </div> // Close Outermost app-container
  );
}

export default App;
