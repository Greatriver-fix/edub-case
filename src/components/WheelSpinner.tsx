import React, { useState, useEffect, useRef, useMemo } from 'react'; // Import useMemo
import StyledButton from './StyledButton';
import UnboxedItemPopup from './UnboxedItemPopup'; // Import the popup component
import { getApiUrl } from '../config'; // Import the helper
import './WheelSpinner.css';
import '../styles/style.css';
import './CaseOpener.css'; // For grid styles
import './UnboxedItemPopup.css'; // Import popup CSS

// Define CaseItem interface (matching CaseOpener)
interface CaseItem {
  name: string;
  display_color: string; // Use display_color
  percentage_chance: number; // Use percentage_chance
  image_url?: string | null;
  rules?: string | null;
  sound_url?: string | null;
  item_template_id?: number; // Keep optional if needed elsewhere
}

// Interface for the list of cases
interface CaseInfo {
    id: number;
    name: string;
    image_path: string | null;
}

// Interface for detailed case data
interface CaseData {
  id: number;
  name: string;
  description: string | null;
  items: CaseItem[];
}


// Shared function to calculate segment angles with minimum size enforcement
const calculateSegmentAngles = (items: CaseItem[]): {
    startAngles: number[],
    angleSpans: number[],
    totalAngle: number
} => {
    const validItems = items.filter((item): item is CaseItem => item !== null && item !== undefined);

    if (validItems.length === 0) {
        return { startAngles: [], angleSpans: [], totalAngle: 360 };
    }

    const totalPercentage = validItems.reduce((sum, item) => sum + (item.percentage_chance || 0), 0);

    if (totalPercentage <= 0) {
        // Equal distribution fallback
        const anglePerItem = 360 / validItems.length;
        const startAngles = validItems.map((_, index) => index * anglePerItem);
        const angleSpans = validItems.map(() => anglePerItem);
        return { startAngles, angleSpans, totalAngle: 360 };
    }

    // Calculate initial angles based on percentage_chance
    let initialAngles = validItems.map(item => ((item.percentage_chance || 0) / totalPercentage) * 360);

    // --- Minimum Angle Adjustment Logic ---
    const minAngle = 5.4; // 1.5% of 360 degrees
    let adjustedAngles = [...initialAngles];
    let totalAngle = 360;
    let deficit = 0;
    let surplusPoolIndices: number[] = [];
    let totalSurplusAngle = 0;

    // First pass: Identify segments below minimum and calculate deficit
    for (let i = 0; i < adjustedAngles.length; i++) {
        // Add non-null assertion for read operations
        if (adjustedAngles[i]! < minAngle) {
            deficit += minAngle - adjustedAngles[i]!;
             adjustedAngles[i] = minAngle; // Assignment is okay
         } else {
             surplusPoolIndices.push(i);
             // Add non-null assertion for read operation
             totalSurplusAngle += adjustedAngles[i]! - minAngle; // Only count surplus above minAngle
         }
     }

    // Second pass: Distribute deficit proportionally among segments above minimum
    if (deficit > 0 && totalSurplusAngle > 0) {
        // Check if we can cover the deficit
        if (totalSurplusAngle >= deficit) {
            for (const index of surplusPoolIndices) {
                // Add non-null assertions for read operations
                const originalSurplus = initialAngles[index]! - minAngle; // Use initial angle for proportion
                const reduction = (originalSurplus / totalSurplusAngle) * deficit;
                // Use explicit assignment with assertion for the read part
                adjustedAngles[index] = adjustedAngles[index]! - reduction;
                // Ensure reduction doesn't push the segment below minAngle
                if (adjustedAngles[index]! < minAngle) {
                    // This case is complex, might need iterative adjustments.
                    // For now, clamp to minAngle and recalculate deficit/surplus if needed.
                    // Simplified: Clamp and accept minor total angle deviation if this happens.
                    console.warn(`Segment ${index} fell below minimum during adjustment. Clamping.`);
                    adjustedAngles[index] = minAngle;
                }
            }
        } else {
            // Cannot cover deficit while maintaining minimums for others.
            // This implies the sum of minimum angles exceeds 360, which shouldn't happen if minAngle * count <= 360.
            // Fallback: Set all surplus pool items to minAngle and accept the total angle deviation.
            console.warn("Cannot fully cover deficit while maintaining minimums. Total angle might deviate slightly.");
            for (const index of surplusPoolIndices) {
                adjustedAngles[index] = minAngle;
            }
        }
    } else if (deficit > 0 && totalSurplusAngle <= 0) {
        // All items are below or at minimum, cannot adjust. Use equal distribution.
        console.warn("All items at or below minimum angle. Using equal distribution.");
        const anglePerItem = 360 / validItems.length;
        adjustedAngles = validItems.map(() => anglePerItem);
    }

    // Normalize angles to ensure they sum exactly to 360 due to potential floating point inaccuracies
    const currentSum = adjustedAngles.reduce((sum, angle) => sum + angle, 0);
    const normalizationFactor = 360 / currentSum;
    const finalAngleSpans = adjustedAngles.map(angle => angle * normalizationFactor);

    // Calculate final start angles based on adjusted spans
    const finalStartAngles: number[] = [];
    let currentAngle = 0;
    for (let i = 0; i < finalAngleSpans.length; i++) {
        finalStartAngles.push(currentAngle);
        // Add non-null assertion for read operation
        currentAngle += finalAngleSpans[i]!;
    }

    // console.log("Final Angles:", { finalStartAngles, finalAngleSpans }); // Debugging
    return { startAngles: finalStartAngles, angleSpans: finalAngleSpans, totalAngle: 360 };
};

// Helper function to generate conic gradient string based on the *final* items used for display
// Now accepts the deduplicated list directly
const generateConicGradient = (displayItems: CaseItem[]): string => {
    if (!displayItems || displayItems.length === 0) {
        return 'conic-gradient(var(--secondary-bg) 0deg 360deg)'; // Fallback
    }

    // No need to filter again, displayItems is already filtered/deduplicated

    // Use shared angle calculation with the displayItems
    const { startAngles, angleSpans } = calculateSegmentAngles(displayItems);
    
    // Build the gradient parts
    const gradientParts: string[] = [];
    const colors = ['#4a6741', '#5a7a4e', '#6b8e5c']; // Darker, Medium, Lighter green

    for (let i = 0; i < displayItems.length; i++) { // Iterate over displayItems
        let segmentColorIndex = i % colors.length;

        // --- Edge Case Check: Prevent first and last segments having the same color ---
        if (i === displayItems.length - 1 && displayItems.length > 1) { // Check only if more than 1 segment
            const firstSegmentColorIndex = 0 % colors.length; // Always 0
            const lastSegmentColorIndex = (displayItems.length - 1) % colors.length;
            if (lastSegmentColorIndex === firstSegmentColorIndex) {
                // If last color is same as first, force it to the next color in the cycle
                segmentColorIndex = (lastSegmentColorIndex + 1) % colors.length;
                console.log(`Adjusting last segment color to index ${segmentColorIndex} to avoid matching first segment.`);
            }
        }
        // --- End Edge Case Check ---

        const segmentColor = colors[segmentColorIndex];

        // Segment angles - ensure we have valid values with defaults
        const startAngle = startAngles[i] || 0;
        const angleSpan = angleSpans[i] || 0;
        const endAngle = startAngle + angleSpan;

        gradientParts.push(`${segmentColor} ${startAngle}deg ${endAngle}deg`);
    }

    // Join parts into the final gradient string
    const gradientString = `conic-gradient(${gradientParts.join(', ')})`;
    return gradientString;
};

// Define the props interface
interface WheelSpinnerProps {
  volume: number;
  onVolumeChange: (volume: number) => void;
  onNewUnbox: (item: CaseItem) => void;
  selectedCaseId: string; // Add prop for receiving selected ID from App
  onCaseSelected: (caseId: string) => void; // Add callback prop to report selection changes to App
}

// Constants
const SPIN_DURATION_WHEEL = 6100; // Match CaseOpener duration (6 seconds)
const WHEEL_SIZE = 700; // Make wheel even larger

const WheelSpinner: React.FC<WheelSpinnerProps> = ({ volume, onVolumeChange, onNewUnbox, selectedCaseId: selectedCaseIdFromApp, onCaseSelected }) => { // Destructure props, rename selectedCaseId
  // State
  const [availableCases, setAvailableCases] = useState<CaseInfo[]>([]);
  // Remove internal selectedCaseId state, use the one passed from App via props
  // const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [currentCaseData, setCurrentCaseData] = useState<CaseData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const itemAudioRef = useRef<HTMLAudioElement | null>(null); // Ref for item sound
  const caseAudioRef = useRef<HTMLAudioElement | null>(null); // Ref for case opening sound
  const [isSpinning, setIsSpinning] = useState(false);
  const [wonItem, setWonItem] = useState<CaseItem | null>(null);
  const [targetRotation, setTargetRotation] = useState(0);
  const [isPopupOpen, setIsPopupOpen] = useState(false); // State for popup visibility
  const wheelRef = useRef<HTMLDivElement>(null);

  // --- Create a memoized list of unique items for rendering ---
  const uniqueDisplayItems = useMemo(() => {
    if (!currentCaseData?.items) return [];
    // Filter out null/undefined first, AND items with 0% chance
    const validItems = currentCaseData.items.filter((item): item is CaseItem => 
        item !== null && 
        item !== undefined &&
        item.percentage_chance > 0 // Add this condition
    );
    // Then filter for uniqueness based on name and color among the remaining items
    return validItems.filter((item, index, self) =>
        index === self.findIndex(i =>
            i.name === item.name && i.display_color === item.display_color 
        )
    );
  }, [currentCaseData]);
  // --- End of memoized list ---

  // Fetch available cases
  useEffect(() => {
      setIsLoading(true);
      fetch(getApiUrl('/api/cases')) // Use helper
          .then(response => {
              if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
              return response.json();
          })
          .then((data: CaseInfo[]) => {
              setAvailableCases(data);
              // If no case is selected in App yet, and cases are available, select the first one
              if (!selectedCaseIdFromApp && data.length > 0 && data[0]) {
                  onCaseSelected(data[0].id.toString()); // Report selection to App
              } else if (data.length === 0) {
                  setError("No cases found. Please create one in Admin Mode.");
                  setCurrentCaseData(null);
                  // setSelectedCaseId(''); // No longer needed
              }
          })
          .catch(err => {
              console.error("Error fetching available cases:", err);
              setError(`Failed to load available cases: ${err.message}`);
              setAvailableCases([]);
          })
          .finally(() => setIsLoading(false));
  }, []);

  // Fetch case details and add weights based on selectedCaseIdFromApp
  useEffect(() => {
      if (!selectedCaseIdFromApp) { // Use prop from App
          setCurrentCaseData(null);
          return;
      }
      setIsLoading(true);
      setError(null);
      fetch(getApiUrl(`/api/cases/${selectedCaseIdFromApp}`)) // Use prop from App
          .then(response => {
              if (!response.ok) {
                  return response.json().then(errData => { throw new Error(errData.error || `HTTP error! status: ${response.status}`); })
                         .catch(() => { throw new Error(`HTTP error! status: ${response.status}`); });
              }
              return response.json();
          })
          .then((data: CaseData) => {
              if (!data || !Array.isArray(data.items)) {
                   throw new Error("Invalid case data received.");
              }
              // Filter out any null or undefined items
              const validItems = data.items.filter((item): item is CaseItem => 
                  item !== null && item !== undefined
              );

              // --- Fisher-Yates Shuffle ---
              let shuffledItems = [...validItems]; // Create a copy to shuffle
              for (let i = shuffledItems.length - 1; i > 0; i--) {
                  const j = Math.floor(Math.random() * (i + 1));
                  // Use non-null assertions for swapping elements
                  [shuffledItems[i]!, shuffledItems[j]!] = [shuffledItems[j]!, shuffledItems[i]!];
              }
              // --- End Shuffle ---
              
              console.log("Setting case data with", shuffledItems.length, "shuffled valid items");
              
              setCurrentCaseData({ ...data, items: shuffledItems }); // Set SHUFFLED valid items
              setWonItem(null); // Clear won item when case changes
              if (wheelRef.current) {
                  wheelRef.current.style.transition = 'none';
                  wheelRef.current.style.transform = 'rotate(0deg)';
              }
              setTargetRotation(0); // Reset wheel rotation
          })
          .catch(err => {
              console.error(`Error fetching case ${selectedCaseIdFromApp}:`, err); // Use prop from App
              setError(`Failed to load case details: ${err.message}`);
              setCurrentCaseData(null);
          })
          .finally(() => setIsLoading(false));
  }, [selectedCaseIdFromApp]); // Dependency array uses prop from App

  // Update audio volume
  useEffect(() => {
    if (itemAudioRef.current) itemAudioRef.current.volume = volume;
    if (caseAudioRef.current) caseAudioRef.current.volume = volume;
  }, [volume]);

  // Get random item based on percentage_chance
  const getRandomItem = (): CaseItem | null => {
      if (!currentCaseData || !currentCaseData.items || currentCaseData.items.length === 0) {
          console.warn("getRandomItem called with no case data or items.");
          return null;
      }

      const items = currentCaseData.items;
      // Use the actual sum of percentages provided, even if not 100
      const totalPercentageSum = items.reduce((sum, item) => sum + (item.percentage_chance || 0), 0);

      if (totalPercentageSum <= 0) {
          console.warn("Total percentage sum is zero or less, returning first item as fallback.");
          // Use type assertion to tell TypeScript we're sure this is a CaseItem
          const firstItem = items[0];
          return firstItem ? firstItem : null; // Fallback to first item if percentages are invalid
      }

      let randomNum = Math.random() * totalPercentageSum; // Random number between 0 and total sum

      for (const item of items) {
          const chance = item.percentage_chance || 0;
          if (randomNum <= chance) {
              return item; // This item is selected
          }
          randomNum -= chance;
      }

      // Fallback in case of floating point issues or unexpected scenarios
      console.warn("Random selection fallback triggered, returning first valid item.");
      
      // Find the first non-null item in the array
      for (const item of items) {
          if (item) {
              return item; // Return the first valid item
          }
      }
      
      // If we somehow got here with no valid items (should be impossible given earlier checks)
      console.error("getRandomItem fallback reached impossible state: no valid items found.");
      return null;
  };

  // Handle Spin Action
  const handleSpin = () => {
    if (!currentCaseData || !currentCaseData.items || currentCaseData.items.length === 0 || isSpinning) return;

    // Stop previous sounds
    if (itemAudioRef.current) { itemAudioRef.current.pause(); itemAudioRef.current = null; }
    if (caseAudioRef.current) { caseAudioRef.current.pause(); caseAudioRef.current = null; }

    console.log("Spinning the wheel...");
    setIsSpinning(true);
    setWonItem(null);

    // Play case opening sound
    try {
        const caseSoundUrl = getApiUrl('/uploads/sounds/case.mp3'); // Use helper
        const newCaseAudio = new Audio(caseSoundUrl);
        newCaseAudio.volume = volume;
        caseAudioRef.current = newCaseAudio;
        newCaseAudio.play().catch(e => { console.error("Error playing case sound:", e); caseAudioRef.current = null; });
        newCaseAudio.onended = () => { caseAudioRef.current = null; };
    } catch (e) { console.error("Error creating case audio:", e); caseAudioRef.current = null; }

    // Reset rotation visually before animation
    if (wheelRef.current) {
        wheelRef.current.style.transition = 'none';
        wheelRef.current.style.transform = `rotate(${targetRotation}deg)`;
        void wheelRef.current.offsetWidth;
    }

    const winningItem = getRandomItem();
    if (!winningItem || !currentCaseData?.items) {
        setError("Could not determine winning item."); setIsSpinning(false); return;
    }

    // --- Calculate Rotation based on the VISUAL segments (unique items, adjusted angles) ---
    // 1. Get the adjusted angles based on the unique items being displayed
    const { startAngles: visualStartAngles, angleSpans: visualAngleSpans } = calculateSegmentAngles(uniqueDisplayItems);

    // 2. Find the index of the winning item within the unique display list
    const winningItemIndexInUniqueList = uniqueDisplayItems.findIndex(item =>
        item.name === winningItem.name && item.display_color === winningItem.display_color
        // Note: This assumes the first match in the unique list corresponds to the won item.
        // This is generally safe if getRandomItem selects based on original list order and
        // uniqueDisplayItems preserves the relative order of the first occurrences.
    );

    if (winningItemIndexInUniqueList === -1) {
        // This should ideally not happen if winningItem came from currentCaseData
        setError("Could not find winning item in the unique display list for rotation calculation.");
        console.error("Mismatch between winningItem and uniqueDisplayItems", winningItem, uniqueDisplayItems);
        setIsSpinning(false);
        return;
    }

    // 3. Get the visual start angle and span for the winning segment
    let winningSegmentStartAngle = 0;
    let winningSegmentAngleSpan = 0;

    // Use the index found in the unique list to get the corresponding visual angles
    winningSegmentStartAngle = visualStartAngles[winningItemIndexInUniqueList]!;
    winningSegmentAngleSpan = visualAngleSpans[winningItemIndexInUniqueList]!;

    // 4. Calculate the target rotation to center the marker in the middle of the VISUAL segment
    // Marker is at 270 degrees (right side). We need to rotate the wheel so the segment center aligns with 270.
    // Rotation = -(segmentCenter - markerPosition)
    const segmentCenterAngle = winningSegmentStartAngle + winningSegmentAngleSpan / 2;
    const markerPosition = 0; // Top (0 degrees as per user's coordinate system)
    const targetAngle = -(segmentCenterAngle - markerPosition); // Calculate the base target angle relative to 0 degrees
    const fullSpins = 5;
    const currentRotation = targetRotation; // Get the starting rotation value for this spin
    
    // Apply random offset based on the VISUAL angle span
    const randomOffset = (Math.random() - 0.5) * (winningSegmentAngleSpan * 0.8);
    const finalTargetAngle = targetAngle + randomOffset; // This is the desired final absolute angle relative to 0

    // Calculate the effective current angle (normalized to 0-359.99...)
    const currentEffectiveAngle = ((currentRotation % 360) + 360) % 360;
    // Calculate the effective target angle (normalized to 0-359.99...)
    const finalTargetEffectiveAngle = ((finalTargetAngle % 360) + 360) % 360;

    // Calculate the shortest positive angle difference to reach the target
    let angleDifference = finalTargetEffectiveAngle - currentEffectiveAngle;
    if (angleDifference <= 0) { // If target is behind or at the same effective angle
        angleDifference += 360; // Add a full circle to ensure forward rotation
    }

    // Calculate the final rotation: current absolute rotation + full spins + the calculated angle difference
    const finalRotation = currentRotation + (fullSpins * 360) + angleDifference;

    // --- End of visual rotation calculation ---

    setTargetRotation(finalRotation);

    // Apply transition and rotation
    if (wheelRef.current) {
        wheelRef.current.style.transition = `transform ${SPIN_DURATION_WHEEL}ms cubic-bezier(0.25, 0.1, 0.25, 1)`;
        wheelRef.current.style.transform = `rotate(${finalRotation}deg)`;
    }

    // Set timeout for results // <<< Restoring this block
    setTimeout(() => {
        setWonItem(winningItem);
        if (winningItem) { // Only open popup if an item was actually won
            setIsPopupOpen(true); // Open the popup
        }
        onNewUnbox(winningItem);
        setIsSpinning(false);
        console.log("Wheel stopped. Won:", winningItem);

        if (caseAudioRef.current) { caseAudioRef.current.pause(); caseAudioRef.current = null; }

        if (winningItem.sound_url) {
            try {
                // sound_url from API already includes the path, just need base
                const fullSoundUrl = getApiUrl(winningItem.sound_url); // Use helper
                const newItemAudio = new Audio(fullSoundUrl);
                newItemAudio.volume = volume;
                itemAudioRef.current = newItemAudio;
                newItemAudio.play().catch(e => { console.error("Error playing item sound:", e); itemAudioRef.current = null; });
                newItemAudio.onended = () => { itemAudioRef.current = null; };
            } catch (e) { console.error("Error creating item audio:", e); itemAudioRef.current = null; }
        }
    }, SPIN_DURATION_WHEEL); // <<< End of restored block

  }; // <<< Restoring closing brace for handleSpin

  // Helper to calculate position and rotation for item text
  // Now accepts the index relative to the uniqueDisplayItems list
  const getItemStyle = (index: number): React.CSSProperties => {
    // Use the memoized uniqueDisplayItems list
    if (!uniqueDisplayItems || index < 0 || index >= uniqueDisplayItems.length || !uniqueDisplayItems[index]) {
        return {};
    }

    // Use the shared angle calculation with the *same unique list* to ensure alignment
    const { startAngles, angleSpans } = calculateSegmentAngles(uniqueDisplayItems);

    // Get the angles for this specific item from the calculated angles based on the unique list
    const startAngle = startAngles[index]!; // Use non-null assertion as index is validated
    const angleSpan = angleSpans[index]!; // Use non-null assertion

    
    // Calculate the exact center angle of this segment
    const centerAngle = startAngle + (angleSpan / 2);
    
    // Use a fixed radius for consistent positioning
    // Slightly smaller radius to ensure text stays within segment
    const radius = WHEEL_SIZE * 0.32; // Reduced radius slightly
    
    // Calculate position based on center angle and radius
    const angleRad = centerAngle * Math.PI / 180;
    const x = 50 + (radius / (WHEEL_SIZE / 100)) * Math.sin(angleRad);
    const y = 50 - (radius / (WHEEL_SIZE / 100)) * Math.cos(angleRad);

    // Rotate the container to align with the segment's center angle
    // Add 180 degrees to flip the orientation as requested
    const textRotation = centerAngle + 180; 

    // Calculate font size based on segment size
    // Smaller segments get smaller font
    // Increased font sizes further
    const fontSize = angleSpan < 20 ? '0.9em' : angleSpan < 40 ? '1.0em' : '1.1em'; 

    return {
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(-50%, -50%) rotate(${textRotation}deg)`, // Center and rotate container
        width: 'auto', // Let width be determined by content
        height: '130px', // Increased radial height limit for the container
        overflow: 'hidden', // Hide overflow from the container
        textAlign: 'center',
        // whiteSpace: 'nowrap', // Remove from container
        pointerEvents: 'none', // Prevent text from interfering with clicks
        fontSize: fontSize,
        // Add a debug outline to see the positioning (can be removed later)
        // outline: '1px solid rgba(255, 255, 255, 0.2)',
    };
  };


  return (
    <div className="wheel-spinner-container">
      {/* Loading / Error Display */}
      {isLoading && <p>Loading...</p>}
      {error && <p style={{ color: 'red', marginBottom: '20px' }}>Error: {error}</p>}

      {/* Placeholder div removed */}

      {/* Wheel Display Area & Spin Button */}
      {currentCaseData && !isLoading && !error && (
          <div style={{ marginBottom: '20px' }}>
              <h2>{currentCaseData.name}</h2>
              {currentCaseData.description && <p>{currentCaseData.description}</p>}
              <hr className="cs-hr" style={{ margin: '10px 0' }} />

              {/* Wheel Visual Container */}
              <div className="wheel-visual-container" style={{ width: `${WHEEL_SIZE}px`, height: `${WHEEL_SIZE}px` }}>
                  {/* Center Image */}
                  <img 
                      src={getApiUrl('/uploads/images/emonbag.webp')} 
                      alt="Wheel Center" 
                      className="wheel-center-image" 
                      onClick={handleSpin} // Add onClick handler here
                      style={{ cursor: isSpinning ? 'default' : 'pointer' }} // Add pointer cursor when clickable
                      onError={(e) => (e.currentTarget.style.display = 'none')} // Hide if image fails to load
                  />
                  <div className="wheel-marker"></div>
                  <div
                      ref={wheelRef}
                      className="wheel-graphic"
                      style={{
                          background: generateConicGradient(uniqueDisplayItems), // Use unique items for gradient
                      }}
                  >
                      {/* Item Text Layer */}
                      <div className="wheel-item-texts">
                          {/* Map over the uniqueDisplayItems directly */}
                          {uniqueDisplayItems.map((item, index) => (
                              // No need for item check as uniqueDisplayItems is guaranteed non-null here
                              // Apply style directly to the container div, passing only the index
                              <div
                                key={`item-${item.item_template_id || index}-${item.name}`} // Use unique key
                                className="wheel-item-text"
                                style={getItemStyle(index)} // Pass index relative to unique list
                              >
                                  {/* Use display_color for the text color and make text vertical */}
                                  <span
                                      className="segment-name"
                                      style={{
                                          color: item.display_color,
                                          writingMode: 'vertical-rl', // Make text vertical (right-to-left flow)
                                          textOrientation: 'mixed', // Keep characters upright
                                          whiteSpace: 'nowrap', // Re-add to span, might help overflow calculation
                                          // overflow, textOverflow, maxHeight, display removed from span
                                          // Add a slight transform to better center vertically if needed
                                          // transform: 'translateY(-50%)', // Example adjustment - might need tweaking
                                      }}
                                  >
                                      {item.name}
                                  </span>
                              </div>
                              // Ternary removed, map directly returns the div
                          ))}
                      </div>
                  </div>
              </div>

              {/* Spin Button */}
              <div style={{ textAlign: 'center', marginTop: '25px' }}>
                  <StyledButton
                      onClick={handleSpin}
                      disabled={isSpinning || !currentCaseData || currentCaseData.items.length === 0}
                      style={{ padding: '15px 30px', fontSize: '1.5em', minWidth: '200px' }}
                  >
                      {isSpinning ? 'Spinning...' : 'Spin Wheel'}
                  </StyledButton>
              </div>
          </div>
      )}

      {/* Case Selection Grid */}
      <h3 style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '15px', marginBottom: '8px' }}>Select a Case:</h3>
      <div className="case-selection-grid">
          {availableCases.length > 0 ? (
              availableCases.map(caseInfo => (
                  <div
                      key={caseInfo.id}
                      className={`case-grid-item ${selectedCaseIdFromApp === caseInfo.id.toString() ? 'selected' : ''}`} // Compare with prop from App
                      onClick={() => onCaseSelected(caseInfo.id.toString())} // Call callback prop on click
                  >
                      {caseInfo.image_path && (
                          // image_path from API already includes the path, just need base
                          <img src={getApiUrl(caseInfo.image_path)} alt={caseInfo.name} className="case-grid-item-image" loading="lazy" onError={(e) => (e.currentTarget.style.display = 'none')} />
                      )}
                      <span className="case-grid-item-name-overlay">{caseInfo.name}</span>
                  </div>
              ))
          ) : (
              !isLoading && <p style={{ color: 'orange', gridColumn: '1/-1' }}>No cases found. Create one in Admin Mode!</p>
          )}
          {isLoading && <p style={{ gridColumn: '1/-1' }}>Loading cases...</p>}
      </div>

      {/* Render the UnboxedItemPopup */}
      <UnboxedItemPopup 
        item={wonItem} 
        isOpen={isPopupOpen} 
        onClose={() => setIsPopupOpen(false)} 
      />
    </div>
  );
};

export default WheelSpinner;
