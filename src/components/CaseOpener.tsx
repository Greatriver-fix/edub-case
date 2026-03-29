import React, { useState, useEffect, useRef, useLayoutEffect } from 'react'; // Added useLayoutEffect

declare global {
    interface Window {
        gtag?: (type: 'event', eventName: string, eventParams: { [key: string]: any }) => void;
    }
}
import { getApiUrl } from '../config';
import StyledButton from './StyledButton';
import UnboxedItemPopup from './UnboxedItemPopup'; // Import the popup component
import './CaseOpener.css';
import './UnboxedItemPopup.css'; // Import popup CSS
// Removed direct JSON import
// Removed import caseSoundUrl from '/public/sounds/case.mp3';

// Define interfaces for case data structure
interface CaseItem {
  name: string;
  // color: string; // Removed old color
  display_color: string; // Added display color
  percentage_chance: number; // Added percentage chance
  image_url?: string | null;
  rules_text?: string | null; // Changed from rules to rules_text
  sound_url?: string | null;
  showPercentageInOpener?: boolean; // <<< NEW FIELD
  // Add item_template_id if needed for any logic here, though maybe not
  item_template_id?: number; // Optional, might not be needed directly in opener
}

interface CaseData {
  name: string;
  description: string | null;
  items: CaseItem[];
  id?: number;
}

// Interface for the list of cases fetched from /api/cases
interface CaseInfo {
    id: number;
    name: string;
    image_path: string | null; // Add image_path
}


const REEL_ITEM_WIDTH = 150; // Updated width to match CSS (.case-opener-item min-width)
const SPIN_DURATION = 7000; // Duration of spin animation in ms (Increased to 6s)

// Define props interface
interface CaseOpenerProps {
    volume: number;
    onVolumeChange: (newVolume: number) => void;
    onNewUnbox: (item: CaseItem) => void; // Add prop to report unboxed item
    selectedCaseId: string; // Add prop for receiving selected ID from App
    onCaseSelected: (caseId: string) => void; // Add callback prop to report selection changes to App
}

function CaseOpener({ volume, onVolumeChange, onNewUnbox, selectedCaseId: selectedCaseIdFromApp, onCaseSelected }: CaseOpenerProps) { // Destructure props, rename selectedCaseId to avoid conflict
  const [isSpinning, setIsSpinning] = useState(false);
  const [reelItems, setReelItems] = useState<CaseItem[]>([]);
  const [wonItem, setWonItem] = useState<CaseItem | null>(null);
  // const [unboxedHistory, setUnboxedHistory] = useState<CaseItem[]>([]); // Remove history state
  // const [volume, setVolume] = useState(0.5); // Remove internal volume state
  const [availableCases, setAvailableCases] = useState<CaseInfo[]>([]);
  // Remove internal selectedCaseId state, use the one passed from App via props
  // const [selectedCaseId, setSelectedCaseId] = useState<string>(''); // Store ID as string from select value
  const [currentCaseData, setCurrentCaseData] = useState<CaseData | null>(null); // Holds data for the selected case
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPopupOpen, setIsPopupOpen] = useState(false); // State for popup visibility
  const reelRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null); // Ref to store current ITEM sound instance
  const tickAudioPoolRef = useRef<HTMLAudioElement[]>([]); // Ref for the tick sound pool
  const tickAudioPoolIndexRef = useRef<number>(0); // Ref to track the next index in the pool
  const animationFrameRef = useRef<number | null>(null); // Ref for the animation frame ID
  const lastTickIndexRef = useRef<number>(-1); // Ref to track the last item index that ticked

  // Effect to fetch the list of available cases on mount
  useEffect(() => {
      setIsLoading(true);
      fetch(getApiUrl('/api/cases'))
          .then(response => {
              if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
              return response.json();
          })
          .then((data: CaseInfo[]) => {
              setAvailableCases(data);
              const currentSelectedIdIsValid = selectedCaseIdFromApp && data.some(caseInfo => caseInfo.id.toString() === selectedCaseIdFromApp);

              if (currentSelectedIdIsValid) {
                  // The ID from App is valid and exists in the fetched list.
                  // The useEffect watching selectedCaseIdFromApp will load its details.
              } else if (data.length > 0 && data[0]) {
                  // Either no case was selected in App, or the selected one is not in the fetched list.
                  // Select the first available case from the current DB.
                  console.log(`Previously selected case ID '${selectedCaseIdFromApp}' not found or no case selected. Selecting first available case: ${data[0].id}`);
                  onCaseSelected(data[0].id.toString());
              } else {
                  // No cases available in the current DB.
                  onCaseSelected(''); // Clear any invalid selection in App.
                  console.log("No cases found in DB, loading default fallback case.");
                  const defaultItems: CaseItem[] = [
                      { name: "Default Item 1", display_color: "#cccccc", percentage_chance: 50, image_url: null, rules_text: null, sound_url: null },
                      { name: "Default Item 2", display_color: "#aaaaaa", percentage_chance: 30, image_url: null, rules_text: null, sound_url: null },
                      { name: "Default Item 3", display_color: "#888888", percentage_chance: 15, image_url: null, rules_text: null, sound_url: null },
                      { name: "Default Item 4", display_color: "#666666", percentage_chance: 5, image_url: null, rules_text: null, sound_url: null },
                  ];
                  setCurrentCaseData({
                      id: 0,
                      name: "Default Starter Case",
                      description: "A basic case loaded because the database is empty.",
                      items: defaultItems
                  });
                  setReelItems(defaultItems.slice(0, 10));
              }
              setError(null);
          })
          .catch(err => {
              console.error("Error fetching available cases:", err);
              setError(`Failed to load available cases: ${err.message}`);
              setAvailableCases([]);
          })
          .finally(() => setIsLoading(false));
  }, []);

  // Effect to fetch details when selectedCaseIdFromApp changes
  useEffect(() => {
      if (!selectedCaseIdFromApp) { // Use prop from App
          setCurrentCaseData(null); // Clear data if no case is selected
          return;
      }

      setIsLoading(true);
      setError(null); // Clear previous errors
      fetch(getApiUrl(`/api/cases/${selectedCaseIdFromApp}`)) // Use prop from App
          .then(response => {
              if (!response.ok) {
                  return response.json().then(errData => {
                      throw new Error(errData.error || `HTTP error! status: ${response.status}`);
                  }).catch(() => {
                      throw new Error(`HTTP error! status: ${response.status}`);
                  });
              }
              return response.json();
          })
          .then((data: CaseData) => { // CaseData already uses CaseItem which will be updated
              if (!data || !Array.isArray(data.items)) {
                   throw new Error("Invalid case data received from server.");
              }
              setCurrentCaseData(data);
              setReelItems(data.items.slice(0, 10)); // Initialize reel
          })
          .catch(err => {
              console.error(`Error fetching case ${selectedCaseIdFromApp}:`, err); // Use prop from App
              setError(`Failed to load case details: ${err.message}`);
              setCurrentCaseData(null); // Clear data on error
          })
          .finally(() => setIsLoading(false));

  }, [selectedCaseIdFromApp]); // Dependency array uses prop from App

  // Effect to preload tick sound pool on mount
  useEffect(() => {
    const POOL_SIZE = 4; // Number of audio elements in the pool
    console.log(`[CaseOpener] Preloading tick sound pool (size: ${POOL_SIZE})...`);
    const tickSoundUrl = getApiUrl('/uploads/sounds/tick.mp3');
    const pool: HTMLAudioElement[] = [];
    for (let i = 0; i < POOL_SIZE; i++) {
        const audio = new Audio(tickSoundUrl);
        audio.preload = 'auto';
        audio.volume = volume; // Set initial volume
        audio.load();
        pool.push(audio);
    }
    tickAudioPoolRef.current = pool;
    tickAudioPoolIndexRef.current = 0; // Reset pool index

    // Cleanup function
    return () => {
      console.log("[CaseOpener Cleanup] Pausing and detaching preloaded tick sound pool.");
      tickAudioPoolRef.current.forEach(audio => {
        if (audio) {
            audio.pause();
            audio.src = ''; // Detach source
        }
      });
      tickAudioPoolRef.current = []; // Clear the pool array
    };
  }, []); // Empty dependency array ensures this runs only once on mount

  // Effect to update volume of currently playing sounds when volume prop changes
  useEffect(() => {
    if (audioRef.current) { // Update item sound volume
      audioRef.current.volume = volume; // Use volume prop
    }
    // Also update tick sound pool volume if it exists and is preloaded
    if (tickAudioPoolRef.current.length > 0) {
        tickAudioPoolRef.current.forEach(audio => {
            if (audio) {
                audio.volume = volume;
            }
        });
    }
  }, [volume]); // Run this effect when volume prop changes

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        console.log("[CaseOpener Cleanup] Cancelled animation frame.");
      }
    };
  }, []); // Empty dependency array ensures this runs only on mount and unmount


  // Function to get a random item based on custom percentage chance
  const getRandomItem = (): CaseItem | null => {
      if (!currentCaseData || !currentCaseData.items || currentCaseData.items.length === 0) {
          console.warn("getRandomItem called with no case data or items.");
          return null;
      }

      const items = currentCaseData.items;
      const totalPercentageSum = items.reduce((sum, item) => sum + (item.percentage_chance || 0), 0);

      if (totalPercentageSum <= 0) {
          console.warn("Total percentage sum is zero or less, returning first item as fallback.");
          return items[0] ?? null; // Fallback to first item if percentages are invalid
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
      console.warn("Random selection fallback triggered, returning last item.");
      return items[items.length - 1] ?? null;
  };

  const startSpin = () => {
    // Fire Google Analytics event for opening a case
    if (window.gtag && currentCaseData) {
        window.gtag('event', 'ClickSpin', {
            'event_category': 'Case Interaction',
            'event_label': currentCaseData.name,
            'case_id': currentCaseData.id
        });
    }

    // Check if spinning or if case data isn't loaded
    if (isSpinning || !currentCaseData || currentCaseData.items.length === 0) return;

    // Stop any currently playing sounds (both item and case opening) before starting a new spin
    if (audioRef.current) {
        console.log("[CaseOpener] Stopping previous item sound.");
        audioRef.current.pause();
        audioRef.current.src = ''; // Detach source
        audioRef.current = null;
    }
    // if (caseAudioRef.current) { // REMOVED Block
    //     console.log("[CaseOpener] Stopping previous case opening sound.");
    //     caseAudioRef.current.pause();
    //     caseAudioRef.current.src = ''; // Detach source
    //     caseAudioRef.current = null;
    // }

    // Play the case opening sound - REMOVED Block
    // try {
    //     const caseSoundUrl = getApiUrl('/uploads/sounds/case.mp3');
    //     console.log(`[CaseOpener] Attempting to play case opening sound from uploads URL: ${caseSoundUrl}`);
    //     const newCaseAudio = new Audio(caseSoundUrl); // Use the correct URL
    //     newCaseAudio.volume = volume; // Use current volume state
    //     caseAudioRef.current = newCaseAudio; // Store the new audio instance
    //     newCaseAudio.play().catch(e => {
    //         console.error("Error playing case opening sound:", e);
    //         caseAudioRef.current = null; // Clear ref on playback error
    //     });
    //     // Optional: Clear ref when audio finishes playing naturally
    //     newCaseAudio.onended = () => {
    //         console.log("[CaseOpener] Case opening sound finished playing.");
    //         // Don't clear ref here, might be needed by volume slider or stopped later
    //     };
    // } catch (e) {
    //     console.error("Error creating case opening audio object:", e);
    //     caseAudioRef.current = null; // Clear ref if object creation fails
    // }


    const currentWinningItem = getRandomItem();
    if (!currentWinningItem) {
        setError("Could not determine a winning item.");
        return;
    }

    setIsSpinning(true);
    setWonItem(null); // Clear previous win

    // 1. Generate a long list of items for the visual reel
    const totalReelItems = 50; // Number of items shown in the reel animation
    const generatedReel: CaseItem[] = [];
    for (let i = 0; i < totalReelItems; i++) {
        const randomItem = getRandomItem();
        if (randomItem) {
            generatedReel.push(randomItem);
        } else {
            // Fallback: push the first item from currentCaseData if getRandomItem fails unexpectedly
            const fallbackItem = currentCaseData.items[0]; // Explicitly get the item
            if (fallbackItem) { // Check if it exists before pushing
                generatedReel.push(fallbackItem);
            } else {
                // This case should be impossible if currentCaseData is loaded and items exist
                setError("Cannot generate reel: No items available.");
                setIsSpinning(false);
                return; // Exit if no items can be added
            }
        }
    }

    // 2. Determine the winning item (already done above)
    // Insert the winning item near the end (e.g., 5th to last visible item)
    const winningIndex = totalReelItems - 5;
    // Ensure currentWinningItem is not null before assigning
    generatedReel[winningIndex] = currentWinningItem; // Already checked currentWinningItem is not null
    setReelItems(generatedReel);

    // 3. Calculate animation offsets and generate dynamic keyframes
    const containerWidth = reelRef.current?.offsetWidth ?? 0;
    const centerOffset = containerWidth / 2 - REEL_ITEM_WIDTH / 2;
    const targetScroll = winningIndex * REEL_ITEM_WIDTH - centerOffset; // Ideal center

    // Add random offset for final landing position
    const maxFinalOffset = REEL_ITEM_WIDTH * 0.4; // Max 40% off center
    const randomFinalOffset = (Math.random() * 2 - 1) * maxFinalOffset;
    const finalTargetScroll = targetScroll + randomFinalOffset; // This needs to be accessible in setTimeout cleanup

    // Calculate "near miss" position
    const nearMissDirection = Math.random() < 0.5 ? -1 : 1; // -1 (left) or 1 (right)
    const nearMissIndex = winningIndex + nearMissDirection;
    // Ensure nearMissIndex is within bounds (though less critical as it's just a visual target)
    const clampedNearMissIndex = Math.max(0, Math.min(totalReelItems - 1, nearMissIndex));
    const nearMissTargetScroll = clampedNearMissIndex * REEL_ITEM_WIDTH - centerOffset;
    // Optional: Add slight randomness to the near miss target too
    const maxNearMissOffset = REEL_ITEM_WIDTH * 0.2; // Smaller offset for near miss
    const randomNearMissOffset = (Math.random() * 2 - 1) * maxNearMissOffset;
    const finalNearMissTargetScroll = nearMissTargetScroll + randomNearMissOffset;


    // 4. Generate and apply dynamic keyframe animation
    if (reelRef.current) {
        const animationName = `spin-${Date.now()}`;
        const keyframes = `
            @keyframes ${animationName} {
                0% { transform: translateX(0px); }
                /* Only define the start and end points. The cubic-bezier handles the speed curve. */
                100% { transform: translateX(-${finalTargetScroll}px); }
            }
        `;

        // Create and inject the style element
        const styleElement = document.createElement('style');
        styleElement.id = `anim-style-${animationName}`; // Give it an ID for easy removal
        styleElement.innerHTML = keyframes;
        document.head.appendChild(styleElement);

        // Apply the animation
        reelRef.current.style.transition = 'none'; // Remove any existing transition
        reelRef.current.style.transform = 'translateX(0px)'; // Reset position before animation
        void reelRef.current.offsetWidth; // Force reflow
        // Further adjusted cubic-bezier: maintains high speed longer, then decelerates.
        // Compared to (0.4, 0.6, 0.5, 1), this curve (e.g., 0.3, 0.9, 0.6, 1)
        // reaches high speed quickly and maintains it longer before starting to slow down later.
        reelRef.current.style.animation = `${animationName} ${SPIN_DURATION}ms cubic-bezier(0.3, 0.9, 0.6, 1) forwards`;
        // Store animation name and final scroll position for cleanup
        reelRef.current.dataset.animationName = animationName;
        reelRef.current.dataset.finalScroll = finalTargetScroll.toString(); // Store final scroll

        // --- Start Tick Sound Animation Loop ---
        lastTickIndexRef.current = -1; // Reset last ticked index
        // const tickSoundUrl = getApiUrl('/uploads/sounds/tick.mp3'); // URL is now obtained during preload

        const tickLoop = () => {
            // Check only for reelRef existence, rely on timeout/unmount to stop
            if (!reelRef.current) {
                // console.log("[TickLoop] Stopping: Reel ref is null."); // Debug log REMOVED
                if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = null;
                return;
            }
            // console.log(`[TickLoop] isSpinning state: ${isSpinning}`); // Can add this back if needed
            // console.log("[TickLoop] Running..."); // Debug log (can be noisy)

            // Get current scroll position
            const currentTransform = window.getComputedStyle(reelRef.current).transform;
            let currentScroll = 0;
            if (currentTransform && currentTransform !== 'none') {
                const matrix = new DOMMatrixReadOnly(currentTransform);
                currentScroll = Math.abs(matrix.m41); // Get translateX value
            }

            // Calculate which item is roughly at the center marker, adjusted by 5px offset
            const TICK_OFFSET_PX = 5; // Trigger sound 5 pixels earlier
            const adjustedScroll = currentScroll + TICK_OFFSET_PX;
            const centerIndex = Math.floor((adjustedScroll + centerOffset + REEL_ITEM_WIDTH / 2) / REEL_ITEM_WIDTH);
            // console.log(`[TickLoop] Scroll: ${currentScroll.toFixed(2)}, Adjusted: ${adjustedScroll.toFixed(2)}, CenterOffset: ${centerOffset.toFixed(2)}, Calculated Index: ${centerIndex}, Last Index: ${lastTickIndexRef.current}`); // Debug log REMOVED

            if (centerIndex !== lastTickIndexRef.current) {
                // console.log(`[TickLoop] Condition met: New index ${centerIndex} !== Last index ${lastTickIndexRef.current}. Playing sound.`); // Debug log REMOVED
                // Play sound from the pool
                if (tickAudioPoolRef.current.length > 0) {
                    try {
                        const poolIndex = tickAudioPoolIndexRef.current;
                        const audioToPlay = tickAudioPoolRef.current[poolIndex];
                        if (audioToPlay) {
                            audioToPlay.currentTime = 0; // Reset playback position
                            audioToPlay.play().catch(e => console.error(`Error playing tick sound from pool index ${poolIndex}:`, e));
                            // console.log(`[TickLoop] Played tick from pool index ${poolIndex} for visual index ${centerIndex}`); // Debug log
                            // Move to the next audio element in the pool
                            tickAudioPoolIndexRef.current = (poolIndex + 1) % tickAudioPoolRef.current.length;
                        } else {
                             console.warn(`[TickLoop] Audio element at pool index ${poolIndex} is null.`);
                        }
                    } catch (e) {
                        console.error("Error accessing tick audio pool:", e);
                    }
                } else {
                    console.warn("[TickLoop] Tick audio pool not ready or empty.");
                }
                lastTickIndexRef.current = centerIndex; // Update last ticked index
            }

            // Continue the loop
            animationFrameRef.current = requestAnimationFrame(tickLoop);
        };

        // Start the loop
        animationFrameRef.current = requestAnimationFrame(tickLoop);
        // --- End Tick Sound Animation Loop ---
    }

    // 5. Set timeout to stop spinning state and show result
    setTimeout(() => {
      // Stop the animation frame loop first
      if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
          // console.log("[CaseOpener Timeout] Cancelled animation frame."); // Debug log REMOVED
      }

      setIsSpinning(false);
      setWonItem(currentWinningItem); // Set the winning item
      if (currentWinningItem) { // Only open popup if an item was actually won
          setIsPopupOpen(true); // Open the popup
      }

      // Call the callback prop to report the unboxed item to App
      if (currentWinningItem) {
          onNewUnbox(currentWinningItem);
      }

      // --- Log details for debugging ---
      console.log(`[CaseOpener] Won item details:`, currentWinningItem);
      if (currentWinningItem?.image_url) {
          console.log(`[CaseOpener] Attempting to display image from: ${getApiUrl(currentWinningItem.image_url)}`);
      } else {
          console.log(`[CaseOpener] No image_url found for won item.`);
      }
      // --- End Log details ---

      // Stop the case opening sound first - REMOVED Block
      // if (caseAudioRef.current) {
      //     console.log("[CaseOpener] Stopping case opening sound on reveal.");
      //     caseAudioRef.current.pause();
      //     caseAudioRef.current.src = '';
      //     caseAudioRef.current = null;
      // }

      // --- Play Item Sound ---
      if (currentWinningItem?.sound_url) { // Play sound associated with the WON item
          try {
              // Construct the full URL by prepending the backend origin
              const fullSoundUrl = getApiUrl(currentWinningItem.sound_url);
              console.log(`[CaseOpener] Attempting to play sound from: ${fullSoundUrl}`);
              const newAudio = new Audio(fullSoundUrl);
              newAudio.volume = volume; // Use volume state
              audioRef.current = newAudio; // Store the new audio instance
              newAudio.play().catch(e => {
                  console.error("Error playing item sound:", e);
                  audioRef.current = null; // Clear ref on playback error
              });
              // Optional: Clear ref when audio finishes playing naturally
              newAudio.onended = () => {
                  console.log("[CaseOpener] Sound finished playing.");
                  audioRef.current = null;
              };
          } catch (e) {
              console.error("Error creating item audio object:", e);
              audioRef.current = null; // Clear ref if object creation fails
          }
      }
      // --- End Play Item Sound ---

      // Cleanup dynamic animation styles
      if (reelRef.current && reelRef.current.dataset.animationName) {
          const animationName = reelRef.current.dataset.animationName;
          const finalScroll = reelRef.current.dataset.finalScroll; // Retrieve final scroll
          const styleElement = document.getElementById(`anim-style-${animationName}`);
          if (styleElement) {
              document.head.removeChild(styleElement);
          }
          reelRef.current.style.animation = ''; // Clear animation style
          delete reelRef.current.dataset.animationName; // Remove data attribute
          delete reelRef.current.dataset.finalScroll; // Remove data attribute
          // Set final transform explicitly using the stored value to prevent jump
          if (finalScroll !== undefined) {
              reelRef.current.style.transform = `translateX(-${finalScroll}px)`;
          }
      }

    }, SPIN_DURATION);
  };

  if (error) {
      return <div style={{ padding: '20px', color: 'red' }}>Error: {error}</div>;
  }

  // No longer need the loading state as data is imported directly
  // if (!caseData) {
  //     return <div style={{ padding: '20px' }}>Loading case data...</div>;
  // }

  return (
    // Remove the outer flex container div, return the main content div directly
    // <div style={{ display: 'flex', gap: '20px', padding: '20px' }}>
      <div style={{ flexGrow: 1 }}> {/* This div becomes the root */}
          {/* Volume Slider Removed - Now handled in App.tsx */}

          {/* Display Loading / Error - Moved up */}
      {isLoading && <p>Loading...</p>}
      {error && <p style={{ color: 'red', marginBottom: '20px' }}>Error: {error}</p>}

      {/* Case Opener Reel and Button Section */}
      {/* Use selectedCaseIdFromApp to check if a case is selected */}
      {selectedCaseIdFromApp && currentCaseData && !isLoading && !error && (
          <div style={{ marginBottom: '20px' }}> {/* Reduced margin */}
              <h2>{currentCaseData.name}</h2>
              {/* Conditionally render description only if it exists */}
              {currentCaseData.description && <p>{currentCaseData.description}</p>}
              <hr className="cs-hr" style={{ margin: '10px 0' }} /> {/* Reduced margin */}

              {/* The visual container for the reel */}
              <div className="case-opener-viewport">
                  <div className="case-opener-reel" ref={reelRef}>
                      {reelItems.map((item, index) => (
                          <ReelItem key={`${item.item_template_id || item.name}-${index}`} item={item} />
                      ))}
                  </div>
                  {/* Center marker */}
                  <div className="case-opener-marker"></div>
              </div>

              {/* Open Case Button - Made larger */}
              <div style={{ textAlign: 'center', marginTop: '15px' }}> {/* Reduced margin */}
                  <StyledButton
                      onClick={startSpin}
                      disabled={isSpinning || !currentCaseData || currentCaseData.items.length === 0}
                      // Add styles for larger button
                      style={{
                          padding: '15px 30px', // Larger padding
                          fontSize: '1.5em', // Larger font size
                          minWidth: '200px' // Ensure minimum width
                      }}
                  >
                      {isSpinning ? 'Opening...' : 'Open Case'}
                  </StyledButton>
              </div>
          </div>
      )}

       {/* Won Item Display Removed from here */}

      {/* Case Selection Grid (Moved to Bottom) */}
      {/* Reduced marginTop, paddingTop, marginBottom */}
      <h3 style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '15px', marginBottom: '8px' }}>Select a Case:</h3>
      <div className="case-selection-grid">
          {availableCases.length > 0 ? (
              availableCases.map(caseInfo => (
                  <div
                      key={caseInfo.id}
                      className={`case-grid-item ${selectedCaseIdFromApp === caseInfo.id.toString() ? 'selected' : ''}`} // Compare with prop from App
                      onClick={() => onCaseSelected(caseInfo.id.toString())} // Call callback prop on click
                  >
                      {/* Display image if path exists */}
                      {caseInfo.image_path && (
                          <img
                              src={getApiUrl(caseInfo.image_path)}
                              alt={caseInfo.name}
                              className="case-grid-item-image" // Add class for styling
                              loading="lazy" // Lazy load images
                              onError={(e) => (e.currentTarget.style.display = 'none')} // Hide if error
                          />
                      )}
                      {/* Overlay name */}
                      <span className="case-grid-item-name-overlay">{caseInfo.name}</span>
                  </div>
              ))
          ) : (
              // Handle loading or no cases state for the grid area
              !isLoading && <p style={{ color: 'orange', gridColumn: '1/-1' }}>No cases found. Create one in Admin Mode!</p>
          )}
          {/* Display loading indicator within the grid area if needed */}
          {isLoading && <p style={{ gridColumn: '1/-1' }}>Loading cases...</p>}
      </div>
      {/* </div> */} {/* Removed closing tag for outer flex container */}

      {/* History Panel Removed - Now handled in App.tsx */}

      {/* Render the UnboxedItemPopup */}
      <UnboxedItemPopup 
        item={wonItem} 
        isOpen={isPopupOpen} 
        onClose={() => setIsPopupOpen(false)} 
      />
    </div>
  );
}

export default CaseOpener;

const ReelItem: React.FC<{ item: CaseItem }> = ({ item }) => {
  const nameRef = useRef<HTMLSpanElement>(null);
  const [nameClasses, setNameClasses] = useState('case-opener-item-name');

  // Use useLayoutEffect for DOM measurements before paint
  useLayoutEffect(() => {
    const element = nameRef.current;
    if (!element) return;

    // Reset classes before measurement
    element.className = 'case-opener-item-name'; // Base class only

    let currentClasses = ['case-opener-item-name']; // Start with base class

    // Check vertical overflow first
    // Need a slight delay or re-measure after applying small if needed
    const isVerticallyOverflowing = element.scrollHeight > element.clientHeight;

    if (isVerticallyOverflowing) {
      currentClasses.push('case-opener-item-name--small');
      // Apply small class temporarily to measure horizontal overflow accurately with smaller font
      element.classList.add('case-opener-item-name--small');
    }

    // Check horizontal overflow (potentially with small class applied)
    const isHorizontallyOverflowing = element.scrollWidth > element.clientWidth;

    if (isHorizontallyOverflowing) {
      // If horizontal overflow, add scrolling and ensure small is kept if added
      currentClasses = currentClasses.filter(c => c !== 'case-opener-item-name--scrolling'); // Remove old scrolling if present
      currentClasses.push('case-opener-item-name--scrolling');
    } else if (isVerticallyOverflowing) {
      // If only vertical overflow, keep small but remove scrolling
      currentClasses = currentClasses.filter(c => c !== 'case-opener-item-name--scrolling');
    } else {
       // No overflow, just keep the base class (already set)
       currentClasses = ['case-opener-item-name'];
    }

    // Remove temporary small class if it was added only for measurement
    // This is done implicitly by setting the final state below
    // element.classList.remove('case-opener-item-name--small');


    // Update the state with the final calculated classes
    setNameClasses(currentClasses.join(' '));

  }, [item.name]); // Re-run if item name changes

  return (
    <div
      className={`case-opener-item ${!item.image_url ? 'no-image' : ''}`}
      style={{ color: item.display_color || 'white' }}
    >
      <span ref={nameRef} className={nameClasses}> {/* Apply dynamic classes */}
        {item.name}
      </span>
      {item.image_url && (
        <img
          src={getApiUrl(item.image_url)}
          alt={item.name}
          className="case-opener-item-image"
          onError={(e) => (e.currentTarget.style.display = 'none')}
        />
      )}
    </div>
  );
};

/* Removed the duplicated CaseOpener function and export default */
