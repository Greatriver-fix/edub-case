import React, { useState, useMemo, useEffect, useRef } from 'react';
import { getApiUrl } from '../config';
import type { ChangeEvent, FormEvent } from 'react';
import StyledButton from './StyledButton';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent, // Use type-only import
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
// Removed: import { randomUUID } from 'node:crypto'; // For stable client-side IDs. Will use crypto.randomUUID()

// Define structure for Item Template data received from backend
interface ItemTemplate {
    id: number;
    base_name: string;
}

// Define structure for Case List data
interface CaseInfo {
    id: number;
    name: string;
}

// Define structure for full Case Data (including items for editing)
interface FullCaseData {
    id: number;
    name: string;
    description: string | null;
    items: Array<{
        item_template_id: number;
        override_name: string | null;
        percentage_chance: number; // Updated field
        display_color: string;     // Updated field
        rules_text: string | null; // Expect rules_text from backend
    }>;
    image_path: string | null;
    is_active: boolean;
}

// Define structure for existing asset paths (only need images for cases)
interface ExistingAssets {
    images: string[];
    // sounds: string[]; // Not needed for cases
}

// Define the structure for an item's state in the form (linking template)
interface CaseItemState {
  id: string; // Changed to string for stable UUID for dnd-kit
  item_template_id: number | null; // ID of the selected template
  override_name: string; // Optional name override for this instance
  percentage_chance: number; // New field
  display_color: string;     // New field
  isPercentageLocked: boolean; // Added for locking percentage
  override_rules_text: string; // Added for rules override
  showPercentageInOpener: boolean; // <<< NEW FIELD
}

/** Counter-Strike rarity presets for color and base percentage chance */
const RARITY_PRESETS = [
  {
    label: 'Mil-Spec (Blue) – Base 79.92%',
    base_percentage_chance: 79.92, // Restored base percentage
    display_color: '#4b69ff',
  },
  {
    label: 'Restricted (Purple) – Base 15.98%',
    base_percentage_chance: 15.98, // Restored base percentage
    display_color: '#8847ff',
  },
  {
    label: 'Classified (Pink) – Base 3.20%',
    base_percentage_chance: 3.20, // Restored base percentage
    display_color: '#d32ce6',
  },
  {
    label: 'Covert (Red) – Base 0.64%',
    base_percentage_chance: 0.64, // Restored base percentage
    display_color: '#eb4b4b',
  },
  {
    label: 'Rare Special Item (Gold) – Base 0.26%',
    base_percentage_chance: 0.26, // Restored base percentage
    display_color: '#ffd700',
  },
];


// Default color for new items
const DEFAULT_ITEM_COLOR = '#808080'; // Grey

// Draggable Item Row Component
interface DraggableItemRowProps {
    item: CaseItemState;
    index: number;
    availableTemplates: ItemTemplate[];
    isSaving: boolean;
    handleItemChange: (index: number, field: keyof Omit<CaseItemState, 'id'>, value: any) => void;
    removeItem: (index: number) => void;
    renderTemplateOptions: (templates: ItemTemplate[]) => React.JSX.Element[]; // Correct JSX Element type
}

function DraggableItemRow({ item, index, availableTemplates, isSaving, handleItemChange, removeItem, renderTemplateOptions }: DraggableItemRowProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: item.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        borderBottom: '1px dashed var(--border-color)',
        paddingBottom: '15px',
        marginBottom: '15px',
        backgroundColor: isDragging ? 'var(--background-light-hover)' : 'transparent',
    };

    return (
        <div ref={setNodeRef} style={style} {...attributes}>
            {/* Item Row Content - Extracted and adapted from the main component's map function */}
            <div style={{ display: 'flex', flexWrap: 'nowrap', gap: '10px', alignItems: 'flex-end' }}>
                {/* Drag Handle */}
                <div {...listeners} style={{ cursor: 'grab', padding: '5px', alignSelf: 'center', marginRight: '5px' }} title="Drag to reorder">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                        <path fillRule="evenodd" d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5zm0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5z"/>
                    </svg>
                </div>
                {/* Template Selector */}
                <div style={{ flex: '2 1 0%' }}>
                    <label htmlFor={`template_select_${index}`} style={{ fontSize: '0.8em', display: 'block', marginBottom: '2px' }}>Item Template:</label>
                    <select
                        id={`template_select_${index}`}
                        value={item.item_template_id ?? ''}
                        onChange={(e) => handleItemChange(index, 'item_template_id', e.target.value)}
                        className="cs-input"
                        required
                        disabled={isSaving}
                        style={{ width: '100%' }}
                    >
                        <option value="" disabled>-- Select Template --</option>
                        {renderTemplateOptions(availableTemplates)}
                    </select>
                </div>
                {/* Override Name Input */}
                <div style={{ flex: '2 1 0%' }}>
                    <label htmlFor={`override_name_${index}`} style={{ fontSize: '0.8em', display: 'block', marginBottom: '2px' }}>Name Override (Optional):</label>
                    <input
                        type="text"
                        id={`override_name_${index}`}
                        value={item.override_name}
                        onChange={(e) => handleItemChange(index, 'override_name', e.target.value)}
                        placeholder="e.g., StatTrak™"
                        className="cs-input"
                        style={{ width: '100%' }}
                        disabled={isSaving}
                    />
                </div>
                {/* Rules Override Textarea */}
                <div style={{ flex: '2 1 0%' }}>
                    <label htmlFor={`rules_override_${index}`} style={{ fontSize: '0.8em', display: 'block', marginBottom: '2px' }}>Rules Override (Optional):</label>
                    <textarea
                        id={`rules_override_${index}`}
                        value={item.override_rules_text}
                        onChange={(e) => handleItemChange(index, 'override_rules_text', e.target.value)}
                        placeholder="Custom rules for this item in this case..."
                        className="cs-input"
                        style={{ width: '100%', minHeight: '30px', boxSizing: 'border-box', resize: 'vertical' }}
                        disabled={isSaving}
                    />
                </div>
                {/* Preset Dropdown + Percentage Input & Lock Checkbox Group */}
                <div style={{ flex: '1 1 180px', display: 'flex', alignItems: 'flex-end', gap: '5px' }}>
                    <div style={{ flexBasis: '90px', flexShrink: 0 }}>
                        <label htmlFor={`preset_select_${index}`} style={{ fontSize: '0.8em', display: 'block', marginBottom: '2px' }}>Preset:</label>
                        <select
                            id={`preset_select_${index}`}
                            value=""
                            onChange={e => {
                                const selectedLabel = e.target.value;
                                const preset = RARITY_PRESETS.find(p => p.label === selectedLabel);
                                if (preset) {
                                    let tempTotalPercentage = 0;
                                    // items.forEach((it, i) => { // This 'items' is from props, need to pass the main 'items' state or recalculate based on current item
                                    // For simplicity, this preset logic might need adjustment if it depends on the global items array.
                                    // For now, it will apply based on the single item's context or a fixed base.
                                    // A more robust solution would involve passing the full items array to DraggableItemRow or handling preset logic outside.
                                    // Let's assume for now it applies the preset's base values directly.
                                    // This part of the logic might need to be lifted or re-evaluated.
                                    // For now, directly applying preset values:
                                    handleItemChange(index, 'percentage_chance', preset.base_percentage_chance);
                                    handleItemChange(index, 'display_color', preset.display_color);
                                    e.target.value = "";
                                }
                            }}
                            className="cs-input" style={{ width: '100%' }} disabled={isSaving}
                        >
                            <option value="">-- Preset --</option>
                            {RARITY_PRESETS.map(preset => (<option key={preset.label} value={preset.label}>{preset.label}</option>))}
                        </select>
                    </div>
                    <div style={{ flexGrow: 1 }}>
                        <label htmlFor={`percentage_${index}`} style={{ fontSize: '0.8em', display: 'block', marginBottom: '2px' }}>Chance (%):</label>
                        <input type="number" id={`percentage_${index}`} value={item.percentage_chance} onChange={(e) => handleItemChange(index, 'percentage_chance', e.target.value)} min="0" step="0.01" placeholder="e.g., 10.5" className="cs-input" style={{ width: '100%' }} required disabled={isSaving || item.isPercentageLocked} />
                    </div>
                    <div style={{ flexShrink: 0, paddingBottom: '5px' }}>
                        <input type="checkbox" id={`lock_perc_${index}`} checked={item.isPercentageLocked} onChange={(e) => handleItemChange(index, 'isPercentageLocked', e.target.checked)} disabled={isSaving} style={{ verticalAlign: 'middle', marginRight: '3px' }} />
                        <label htmlFor={`lock_perc_${index}`} style={{ verticalAlign: 'middle', cursor: 'pointer' }}>Lock %</label>
                    </div>
                </div>
                {/* Color Picker */}
                <div style={{ flex: '0 0 auto' }}>
                    <label htmlFor={`color_picker_${index}`} style={{ fontSize: '0.8em', display: 'block', marginBottom: '2px' }}>Color:</label>
                    <input type="color" id={`color_picker_${index}`} value={item.display_color} onChange={(e) => handleItemChange(index, 'display_color', e.target.value)} className="cs-input" style={{ padding: '2px', height: '30px', width: '40px', border: '1px solid var(--border-color)', cursor: 'pointer' }} required disabled={isSaving} />
                </div>
                {/* Remove Button */}
                <div style={{ flex: '0 0 auto', marginLeft: '10px', alignSelf: 'center' }}>
                    <input
                        type="checkbox"
                        id={`show_perc_opener_${index}`}
                        checked={item.showPercentageInOpener}
                        onChange={(e) => handleItemChange(index, 'showPercentageInOpener', e.target.checked)}
                        disabled={isSaving}
                        style={{ verticalAlign: 'middle', marginRight: '3px' }}
                    />
                    <label htmlFor={`show_perc_opener_${index}`} style={{ verticalAlign: 'middle', cursor: 'pointer', fontSize: '0.8em' }}>
                        Show %
                    </label>
                </div>
                {/* Remove Button */}
                <div style={{ flex: '0 0 auto', marginLeft: 'auto' }}>
                    <StyledButton onClick={() => removeItem(index)} disabled={isSaving /* items.length <= 1 is handled by parent */} variant="danger" style={{ padding: '5px 10px', minWidth: 'auto' }}>Remove</StyledButton>
                </div>
            </div>
        </div>
    );
}


function CreateCaseForm() {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Form state
  const [caseName, setCaseName] = useState('');
  const [caseDescription, setCaseDescription] = useState('');
  const [isCaseActive, setIsCaseActive] = useState(true);
  const [items, setItems] = useState<CaseItemState[]>([
    { id: crypto.randomUUID(), item_template_id: null, override_name: '', percentage_chance: 0, display_color: DEFAULT_ITEM_COLOR, isPercentageLocked: false, override_rules_text: '', showPercentageInOpener: true },
  ]);

  // State for available data
  const [availableTemplates, setAvailableTemplates] = useState<ItemTemplate[]>([]);
  const [availableCases, setAvailableCases] = useState<CaseInfo[]>([]);

  // State for case image handling
  const [caseImageFile, setCaseImageFile] = useState<File | null>(null);
  const [selectedExistingCaseImagePath, setSelectedExistingCaseImagePath] = useState<string>('');
  const [clearExistingCaseImage, setClearExistingCaseImage] = useState(false);
  const [existingImagePaths, setExistingImagePaths] = useState<string[]>([]); // From templates/assets endpoint
  const caseImageInputRef = useRef<HTMLInputElement>(null); // Ref for file input

  // State for loading/error/editing
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [isLoadingCases, setIsLoadingCases] = useState(true);
  const [isLoadingExistingAssets, setIsLoadingExistingAssets] = useState(true); // Loading state for assets
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingCaseId, setEditingCaseId] = useState<number | null>(null);
  const [duplicatingCaseId, setDuplicatingCaseId] = useState<number | null>(null); // Added for duplication
  const [isLoadingDuplicationSource, setIsLoadingDuplicationSource] = useState(false); // Added for duplication loading
  const [editingCaseOriginalImagePath, setEditingCaseOriginalImagePath] = useState<string | null>(null); // Store original path when editing

  // Fetch available item templates, cases, and existing assets on component mount
  useEffect(() => {
    const fetchInitialData = async () => {
        setIsLoadingTemplates(true);
        setIsLoadingCases(true);
        setIsLoadingExistingAssets(true);
        setError(null);
        try {
            // Fetch Templates
            const templatesPromise = fetch(getApiUrl('/api/item-templates'))
                .then(res => { if (!res.ok) throw new Error(`Templates fetch failed: ${res.status}`); return res.json(); })
                .then((data: ItemTemplate[]) => setAvailableTemplates(data));

            // Fetch Cases (include all for admin dropdown)
            const casesPromise = fetch(getApiUrl('/api/cases?include_all=true'))
                .then(res => { if (!res.ok) throw new Error(`Cases fetch failed: ${res.status}`); return res.json(); })
                .then((data: CaseInfo[]) => setAvailableCases(data));

            // Fetch Existing Assets (Images)
            const assetsPromise = fetch(getApiUrl('/api/existing-assets'))
                .then(res => { if (!res.ok) throw new Error(`Assets fetch failed: ${res.status}`); return res.json(); })
                .then((data: ExistingAssets) => setExistingImagePaths(data.images || []));

            await Promise.all([templatesPromise, casesPromise, assetsPromise]);

        } catch (err) {
            console.error(`Error fetching initial data:`, err);
            setError(err instanceof Error ? err.message : 'An unknown error occurred during initial load');
            setAvailableTemplates([]);
            setAvailableCases([]);
            setExistingImagePaths([]);
        } finally {
            setIsLoadingTemplates(false);
            setIsLoadingCases(false);
            setIsLoadingExistingAssets(false);
        }
    };
    fetchInitialData();
  }, []);

  // Fetch full case details when editingCaseId or duplicatingCaseId changes
  useEffect(() => {
      const caseIdToLoad = editingCaseId || duplicatingCaseId;
      const isDuplicating = duplicatingCaseId !== null && editingCaseId === null;

      if (caseIdToLoad === null) {
          // Reset form if we stop editing or duplicating (or are creating new)
                  setCaseName('');
                  setCaseDescription('');
                  setIsCaseActive(true);
                  setItems([{ id: crypto.randomUUID(), item_template_id: null, override_name: '', percentage_chance: 0, display_color: DEFAULT_ITEM_COLOR, isPercentageLocked: false, override_rules_text: '', showPercentageInOpener: true }]);
                  setCaseImageFile(null);
                  setSelectedExistingCaseImagePath('');
          setClearExistingCaseImage(false);
          setEditingCaseOriginalImagePath(null); // This will be set by duplication if needed
          if (caseImageInputRef.current) caseImageInputRef.current.value = '';
          // Ensure duplication loading state is reset if we clear selections
          if (isLoadingDuplicationSource) setIsLoadingDuplicationSource(false);
          return;
      }

      // Fetch details for the selected case (either for editing or duplication)
      const fetchCaseDetails = async () => {
          if (isDuplicating) {
              setIsLoadingDuplicationSource(true);
          } else {
              setIsLoadingCases(true); // Indicate loading case details for editing
          }
          setError(null);
          try {
              const response = await fetch(getApiUrl(`/api/cases/${caseIdToLoad}`));
              if (!response.ok) {
                   let errorMsg = `HTTP error! status: ${response.status}`;
                   try { const errData = await response.json(); errorMsg = errData.error || errorMsg; } catch(e){ console.warn("Could not parse error response as JSON.", e); }
                   throw new Error(errorMsg);
              }
              const data: FullCaseData = await response.json();

              // Populate form state
              if (isDuplicating) {
                  setCaseName(`[DUPLICATE] ${data.name}`); // Prepend to indicate duplication
                  // The editingCaseId is NOT set, so it will be a new case
              } else {
                  setCaseName(data.name); // For editing
              }
              setCaseDescription(data.description ?? '');
              setIsCaseActive(data.is_active);
              setEditingCaseOriginalImagePath(data.image_path); // Used for preview in both modes

              // Reset image inputs for both edit and duplicate, original path is now stored
              setCaseImageFile(null);
              setSelectedExistingCaseImagePath('');
              setClearExistingCaseImage(false);
              if (caseImageInputRef.current) caseImageInputRef.current.value = '';

              setItems(data.items.map(item => ({
                  id: crypto.randomUUID(), // Use browser's crypto.randomUUID()
                  item_template_id: item.item_template_id,
                  override_name: item.override_name ?? '',
                  percentage_chance: item.percentage_chance,
                  display_color: item.display_color,
                  override_rules_text: item.rules_text ?? '', // Populate from fetched rules_text
                  showPercentageInOpener: typeof (item as any).showPercentageInOpener === 'boolean' ? (item as any).showPercentageInOpener : true, // Load from backend, default true
                  isPercentageLocked: false, // Default to unlocked
              })));

          } catch (err) {
              console.error(`Error fetching details for case ${caseIdToLoad} (isDuplicating: ${isDuplicating}):`, err);
              setError(err instanceof Error ? err.message : `Failed to load case details for ID ${caseIdToLoad}`);
              // Reset relevant ID to stop the operation
              if (isDuplicating) {
                  setDuplicatingCaseId(null);
              } else {
                  setEditingCaseId(null);
              }
          } finally {
              if (isDuplicating) {
                  setIsLoadingDuplicationSource(false);
              } else {
                  setIsLoadingCases(false);
              }
          }
      };

      fetchCaseDetails();

  }, [editingCaseId, duplicatingCaseId]); // Re-run when editingCaseId or duplicatingCaseId changes


  // --- Image Handling Functions ---
  const handleCaseImageFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setCaseImageFile(file);
    if (file) { // Clear existing selection if new file chosen
        setSelectedExistingCaseImagePath('');
        setClearExistingCaseImage(false); // Uncheck clear if new file added
    }
  };

  const handleExistingCaseImageChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const path = event.target.value;
    setSelectedExistingCaseImagePath(path);
    if (path) { // Clear file input if existing selected
        setCaseImageFile(null);
        if (caseImageInputRef.current) caseImageInputRef.current.value = '';
        setClearExistingCaseImage(false); // Uncheck clear
    }
  };

  const handleClearCaseImageToggle = (event: ChangeEvent<HTMLInputElement>) => {
      const isChecked = event.target.checked;
      setClearExistingCaseImage(isChecked);
      if (isChecked) { // Clear file/selection if clear is checked
          setCaseImageFile(null);
          setSelectedExistingCaseImagePath('');
          if (caseImageInputRef.current) caseImageInputRef.current.value = '';
      }
  };

  // Determine current preview path for case image
  const caseImagePreviewPath = useMemo(() => {
      if (clearExistingCaseImage) return null; // No preview if clearing
      if (caseImageFile) return URL.createObjectURL(caseImageFile); // Preview new file
      if (selectedExistingCaseImagePath) return getApiUrl(selectedExistingCaseImagePath); // Preview selected existing
      if (editingCaseOriginalImagePath) return getApiUrl(editingCaseOriginalImagePath); // Preview original editing image
      return null; // Otherwise no preview
  }, [caseImageFile, selectedExistingCaseImagePath, editingCaseOriginalImagePath, clearExistingCaseImage]);

  // Cleanup object URLs
  useEffect(() => {
      let imageUrl = caseImageFile ? URL.createObjectURL(caseImageFile) : null;
      return () => {
          if (imageUrl) URL.revokeObjectURL(imageUrl);
      };
  }, [caseImageFile]);
  // --- End Image Handling ---


  // Calculate total percentage chance
  const totalPercentage = useMemo(() => {
      return items.reduce((sum, item) => sum + (item.percentage_chance || 0), 0);
  }, [items]);

  const totalItems = useMemo(() => items.length, [items]);

  // Function to handle changes in item inputs (template selection, override name, percentage, color)
  const handleItemChange = (
      index: number,
      field: keyof Omit<CaseItemState, 'id'>,
      value: string | number | boolean | null // Value can be boolean for checkbox
    ) => {
    const newItems = [...items];
    const itemToUpdate = newItems[index];

    if (!itemToUpdate) return; // Should not happen, but safety check

    switch (field) {
        case 'item_template_id':
            const numValue = (value === '' || value === null) ? null : Number(value);
            itemToUpdate.item_template_id = (numValue !== null && isNaN(numValue)) ? null : numValue;
            break;
        case 'override_name':
            itemToUpdate.override_name = typeof value === 'string' ? value : '';
            break;
        case 'percentage_chance':
            const percValue = typeof value === 'string' ? parseFloat(value) : (typeof value === 'number' ? value : 0);
            itemToUpdate.percentage_chance = isNaN(percValue) ? 0 : Math.max(0, percValue); // Ensure non-negative, default to 0 if invalid
            break;
        case 'display_color':
            itemToUpdate.display_color = typeof value === 'string' ? value : DEFAULT_ITEM_COLOR;
            break;
        case 'isPercentageLocked': // Handle checkbox change
            itemToUpdate.isPercentageLocked = typeof value === 'boolean' ? value : false;
            break;
        case 'override_rules_text':
            itemToUpdate.override_rules_text = typeof value === 'string' ? value : '';
            break;
        case 'showPercentageInOpener':
            itemToUpdate.showPercentageInOpener = typeof value === 'boolean' ? value : true;
            break;
        default:
            console.warn(`Unhandled field change: ${field}`);
            return;
    }
    setItems(newItems);
  };

  // Function to normalize percentages to 100%, respecting locked items
  const handleNormalizePercentages = () => {
      const lockedItems = items.filter(item => item.isPercentageLocked);
      const unlockedItems = items.filter(item => !item.isPercentageLocked);
      const wereItemsLocked = lockedItems.length > 0; // Track if any items started as locked

      if (unlockedItems.length === 0) {
          const currentTotal = items.reduce((sum, item) => sum + (item.percentage_chance || 0), 0);
          if (Math.abs(currentTotal - 100) > 0.01) {
               alert('All items are locked, but their sum is not 100%. Please unlock items to normalize.');
          } else {
               alert('All items are locked and already sum to 100%. No changes made.');
          }
          return;
      }

      const lockedSum = lockedItems.reduce((sum, item) => sum + (item.percentage_chance || 0), 0);

      if (lockedSum > 100.01) { // Use tolerance
          alert(`Sum of locked percentages (${lockedSum.toFixed(2)}%) exceeds 100%. Cannot normalize unlocked items. Please adjust locked values.`);
          return;
      }

      const targetSumForUnlocked = 100 - lockedSum;
      const currentUnlockedSum = unlockedItems.reduce((sum, item) => sum + (item.percentage_chance || 0), 0);

      let normalizedUnlockedItems: CaseItemState[];

      if (currentUnlockedSum <= 0 || targetSumForUnlocked <= 0) { // Also handle case where target is 0
          // Distribute target sum equally (or set to 0 if target is 0)
          const equalPercentage = unlockedItems.length > 0 ? parseFloat((targetSumForUnlocked / unlockedItems.length).toFixed(2)) : 0;
          let remainder = parseFloat((targetSumForUnlocked - (equalPercentage * unlockedItems.length)).toFixed(2));

          normalizedUnlockedItems = unlockedItems.map((item, index) => ({
              ...item,
              percentage_chance: index === 0 ? parseFloat(Math.max(0, equalPercentage + remainder).toFixed(2)) : Math.max(0, equalPercentage), // Ensure non-negative
          }));
      } else {
          // Normalize unlocked items proportionally
          let roundedSum = 0;
          const proportionallyNormalized = unlockedItems.map(item => {
              // Avoid division by zero if currentUnlockedSum is 0 (though handled earlier, belt-and-suspenders)
              const proportionalChance = (currentUnlockedSum > 0)
                  ? (item.percentage_chance / currentUnlockedSum) * targetSumForUnlocked
                  : 0; // Assign 0 if current sum is 0
              const roundedChance = parseFloat(proportionalChance.toFixed(2));
              roundedSum += roundedChance;
              return {
                  ...item,
                  percentage_chance: roundedChance,
              };
          });

          // Distribute rounding difference to the first unlocked item (simplified)
          // The final check block below will handle ensuring the total is exactly 100.
          const difference = parseFloat((targetSumForUnlocked - roundedSum).toFixed(2));
          if (difference !== 0 && proportionallyNormalized.length > 0) {
              const firstUnlocked = proportionallyNormalized[0];
              if (firstUnlocked) { // Check existence
                  // Add difference and clamp at 0
                  firstUnlocked.percentage_chance = parseFloat(Math.max(0, firstUnlocked.percentage_chance + difference).toFixed(2));
              }
          }
          normalizedUnlockedItems = proportionallyNormalized;
      }

      // Ensure no negative percentages after final adjustment
      normalizedUnlockedItems = normalizedUnlockedItems.map(item => ({
          ...item,
          percentage_chance: Math.max(0, item.percentage_chance)
      }));

      // Combine locked and normalized unlocked items back
      const finalItems = items.map(originalItem => {
          if (originalItem.isPercentageLocked) {
              return originalItem;
          } else {
              const normalizedItem = normalizedUnlockedItems.find(normalized => normalized.id === originalItem.id);
              return normalizedItem || originalItem;
          }
      });

      // Final check and alert
      const finalSumCheck = finalItems.reduce((sum, item) => sum + item.percentage_chance, 0);
      if (Math.abs(finalSumCheck - 100) > 0.015) {
          console.error(`Normalization failed to sum precisely to 100%. Final sum: ${finalSumCheck.toFixed(2)}. Please check logic.`);
          alert(`Normalization calculation resulted in a sum of ${finalSumCheck.toFixed(2)}%. Please review percentages manually.`);
          setItems(finalItems);
      } else {
          // Ensure exactly 100 by adjusting the first unlocked item if needed
          const finalDifference = 100 - finalSumCheck;
          if (Math.abs(finalDifference) > 0.001 && unlockedItems.length > 0) {
               const firstUnlockedIndex = finalItems.findIndex(item => !item.isPercentageLocked);
               if (firstUnlockedIndex !== -1) {
                   let firstItem = finalItems[firstUnlockedIndex];
                   if (firstItem) {
                       firstItem.percentage_chance = parseFloat(Math.max(0, firstItem.percentage_chance + finalDifference).toFixed(2));
                   }
               }
          }
          setItems(finalItems);
          // Provide accurate alert message
          if (wereItemsLocked) {
              alert('Unlocked percentages normalized successfully.');
          } else {
              alert('All percentages normalized to sum 100%.');
          }
      }
  };


  // Function to add a new empty item row
  const addItem = () => {
    setItems([...items, { id: crypto.randomUUID(), item_template_id: null, override_name: '', percentage_chance: 0, display_color: DEFAULT_ITEM_COLOR, isPercentageLocked: false, override_rules_text: '', showPercentageInOpener: true }]);
  };

  // Function to remove an item row
  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    const newItems = items.filter((_, i) => i !== index);
    setItems(newItems);
  };

  // Function to handle saving the case (Create or Update)
  const handleSaveCase = () => {
    // Basic validation
    if (!caseName.trim()) {
      alert('Please enter a case name.');
      return;
    }
    // Validate that each item has a template selected
    const itemsWithTemplates = items.filter(item => item.item_template_id !== null);
    if (itemsWithTemplates.length === 0) {
        alert('Please add at least one item and select an Item Template for it.');
        return;
    }
    if (itemsWithTemplates.length !== items.length) {
        alert('One or more items are missing an Item Template selection. Please select a template for all items.');
        return;
    }
    // Note: We are NOT strictly enforcing the 100% sum here based on user feedback

    let imagePathToUse = selectedExistingCaseImagePath; // Default to current selection
    // Ensure itemsPayload includes the new showPercentageInOpener field
    const itemsPayload = itemsWithTemplates.map(({ item_template_id, override_name, percentage_chance, display_color, override_rules_text, showPercentageInOpener }) => ({
        item_template_id: item_template_id,
        override_name: override_name.trim() || null,
        percentage_chance: percentage_chance || 0,
        display_color: display_color || DEFAULT_ITEM_COLOR,
        override_rules_text: override_rules_text.trim() || null,
        showPercentageInOpener: showPercentageInOpener, // Include the new flag
    }));

    // If duplicating and no new image choice has been made, use the source case's image.
    if (
        duplicatingCaseId !== null &&         // We are in duplication mode
        caseImageFile === null &&             // No new file uploaded
        selectedExistingCaseImagePath === '' && // No existing image explicitly selected from dropdown
        !clearExistingCaseImage &&            // Image is not being cleared
        editingCaseOriginalImagePath !== null // The source case had an image
    ) {
        imagePathToUse = editingCaseOriginalImagePath;
    }

    // Prepare FormData
    const formData = new FormData();
    formData.append('name', caseName.trim());
    if (caseDescription.trim()) {
        formData.append('description', caseDescription.trim());
    }

    // Append items as JSON string (itemsPayload is already defined above with the new field)
    formData.append('items', JSON.stringify(itemsPayload));

    // Append image data
    if (caseImageFile) {
        formData.append('image_file', caseImageFile);
    } else if (imagePathToUse) { // Use the determined image path
        formData.append('existing_image_path', imagePathToUse);
    }

    formData.append('is_active', String(isCaseActive));

    // Append clear flag if editing (and not duplicating, as clear applies to existing image)
    if (editingCaseId !== null && duplicatingCaseId === null && clearExistingCaseImage) {
        formData.append('clear_image', 'true');
    }


    // Determine URL and Method
    const isUpdating = editingCaseId !== null && duplicatingCaseId === null;
    const url = isUpdating
        ? getApiUrl(`/api/cases/${editingCaseId}`) // Update existing
        : getApiUrl('/api/cases'); // Create new (either fresh or from duplication)
    const method = isUpdating ? 'PUT' : 'POST';

    setIsSaving(true);
    setError(null);

    // --- Send FormData to backend API ---
    fetch(url, {
      method: method,
      // No 'Content-Type' header needed for FormData, browser sets it
      body: formData,
    })
    .then(async response => {
      if (!response.ok) {
        let errorMsg = `HTTP error! status: ${response.status}`;
        try { const text = await response.text(); console.error("Raw error response text:", text); const errData = JSON.parse(text); errorMsg = errData.error || errorMsg; }
        catch (e) { console.warn("Could not parse error response as JSON.", e); }
        throw new Error(errorMsg);
      }
      return response.json();
    })
    .then(data => {
      const action = isUpdating ? 'updated' : (duplicatingCaseId ? 'duplicated and saved as new' : 'created');
      alert(`Case "${caseName.trim()}" ${action} successfully!`);
      // Reset form and editing/duplicating state
      setEditingCaseId(null);
      setDuplicatingCaseId(null); // Also clear duplication ID
      // The useEffect for these IDs changing will reset the form fields.

      // Refetch case list (include all for admin dropdown)
       setIsLoadingCases(true);
       fetch(getApiUrl('/api/cases?include_all=true'))
         .then(res => res.ok ? res.json() : Promise.reject(`Failed to refetch cases after ${action}: ${res.status}`))
         .then(setAvailableCases)
         .catch(err => {
             console.error(`Failed to refetch cases list after ${action}:`, err);
             setError(err instanceof Error ? err.message : `Failed to refetch cases list after ${action}`);
         })
         .finally(() => setIsLoadingCases(false));
    })
    .catch(error => {
      const action = isUpdating ? 'updating' : (duplicatingCaseId ? 'duplicating' : 'saving');
      console.error(`Error ${action} case:`, error);
      alert(`Error ${action} case: ${error.message}`);
      setError(error.message);
    })
    .finally(() => setIsSaving(false));
  };

  // Function to handle deleting a case
  const handleDeleteCase = () => {
      if (editingCaseId === null) {
          alert("No case selected to delete.");
          return;
      }

      if (!window.confirm(`Are you sure you want to delete case "${caseName}" (ID: ${editingCaseId})? This action cannot be undone.`)) {
          return;
      }

      setIsSaving(true); // Use the same saving state to disable buttons
      setError(null);

      fetch(getApiUrl(`/api/cases/${editingCaseId}`), {
          method: 'DELETE',
      })
      .then(async response => {
          if (!response.ok) {
              let errorMsg = `HTTP error! status: ${response.status}`;
              try { const errData = await response.json(); errorMsg = errData.error || errorMsg; }
              catch (e) { /* Ignore */ }
              throw new Error(errorMsg);
          }
          return response.json();
      })
      .then(data => {
          alert(`Case "${caseName}" deleted successfully!`);
          // Reset form and editing state (duplicatingId should already be null if we are deleting)
          setEditingCaseId(null);
          // The useEffect for editingCaseId will reset the form.
          // Refetch case list (include all for admin dropdown)
          setIsLoadingCases(true);
          fetch(getApiUrl('/api/cases?include_all=true'))
              .then(res => res.ok ? res.json() : Promise.reject(`Failed to refetch cases: ${res.status}`))
              .then(setAvailableCases)
              .catch(err => {
                  console.error("Failed to refetch cases list after delete:", err);
                  setError(err instanceof Error ? err.message : 'Failed to refetch cases list');
              })
              .finally(() => setIsLoadingCases(false));
      })
      .catch(error => {
          console.error(`Error deleting case ${editingCaseId}:`, error);
          alert(`Error deleting case: ${error.message}`);
          setError(error.message);
      })
      .finally(() => setIsSaving(false));
  };

  // Helper to render template options
  const renderTemplateOptions = (templates: ItemTemplate[]) => {
      return templates.map(template => (
          <option key={template.id} value={template.id}>
              {template.base_name} (ID: {template.id})
          </option>
      ));
  };


  return (
    <div style={{ padding: '20px', border: '1px solid var(--border-color)', borderRadius: '5px' }}>
      {/* Case Selection for Editing */}
       <div style={{ marginBottom: '20px', paddingBottom: '15px', borderBottom: '1px solid var(--border-color)' }}>
          <label htmlFor="case-edit-select" style={{ marginRight: '10px', fontWeight: 'bold' }}>Edit Existing Case:</label>
          <select
              id="case-edit-select"
              value={editingCaseId ?? ''}
              onChange={(e) => {
                  const newEditingId = e.target.value ? Number(e.target.value) : null;
                  setEditingCaseId(newEditingId);
                  if (newEditingId !== null) {
                      setDuplicatingCaseId(null); // Clear duplication selection
                  }
              }}
              disabled={isLoadingCases || isLoadingTemplates || isSaving || duplicatingCaseId !== null}
              className="cs-input"
              style={{ minWidth: '250px', marginRight: '10px' }}
          >
              <option value="">-- Create New Case --</option>
              {availableCases.map(caseInfo => (
                  <option key={caseInfo.id} value={caseInfo.id}>
                      {caseInfo.name} (ID: {caseInfo.id})
                  </option>
              ))}
          </select>

          {/* Duplicate Case Selection */}
          <label htmlFor="case-duplicate-select" style={{ marginLeft: '20px', marginRight: '10px', fontWeight: 'bold' }}>Duplicate Case:</label>
          <select
              id="case-duplicate-select"
              value={duplicatingCaseId ?? ''}
              onChange={(e) => {
                  const newDuplicatingId = e.target.value ? Number(e.target.value) : null;
                  setDuplicatingCaseId(newDuplicatingId);
                  if (newDuplicatingId !== null) {
                      setEditingCaseId(null); // Clear editing selection
                  }
              }}
              disabled={isLoadingCases || isLoadingTemplates || isSaving || editingCaseId !== null}
              className="cs-input"
              style={{ minWidth: '250px', marginRight: '10px' }}
          >
              <option value="">-- Select Case to Duplicate --</option>
              {availableCases.map(caseInfo => (
                  <option key={caseInfo.id} value={caseInfo.id}>
                      {caseInfo.name} (ID: {caseInfo.id})
                  </option>
              ))}
          </select>

          {(editingCaseId !== null || duplicatingCaseId !== null) && (
              <>
                  <StyledButton onClick={() => {
                      setEditingCaseId(null);
                      setDuplicatingCaseId(null);
                  }} disabled={isSaving} style={{ marginLeft: '10px' }}>
                      Clear Selection (Create New)
                  </StyledButton>
                  {/* Add Delete Button - only if editing */}
                  {editingCaseId !== null && (
                    <StyledButton
                        onClick={handleDeleteCase}
                        disabled={isSaving}
                        variant="danger"
                        style={{ marginLeft: '10px' }}
                    >
                        Delete Selected Case
                    </StyledButton>
                  )}
              </>
          )}
          {(isLoadingCases || isLoadingDuplicationSource) && <span style={{ marginLeft: '10px' }}>
            {isLoadingCases && !isLoadingDuplicationSource && "Loading cases..."}
            {isLoadingDuplicationSource && "Loading case to duplicate..."}
          </span>}
      </div>

      <h2>
        {editingCaseId
            ? `Edit Case (ID: ${editingCaseId})`
            : duplicatingCaseId
            ? `Duplicate Case (Source ID: ${duplicatingCaseId})`
            : 'Create New Case'}
      </h2>
      <hr className="cs-hr" style={{ margin: '15px 0' }} />

      {/* Display Errors */}
      {error && <p style={{ color: 'red', fontWeight: 'bold' }}>Error: {error}</p>}

      {/* Case Name and Description (remains the same) */}
      <div style={{ marginBottom: '15px' }}>
        <label htmlFor="caseName" style={{ display: 'block', marginBottom: '5px' }}>Case Name:</label>
        <input
          type="text"
          id="caseName"
          value={caseName}
          onChange={(e) => setCaseName(e.target.value)}
          placeholder="e.g., My Awesome Case"
          className="cs-input"
          style={{ width: '100%' }}
          required
          disabled={isSaving}
        />
      </div>
      <div style={{ marginBottom: '20px' }}>
        <label htmlFor="caseDescription" style={{ display: 'block', marginBottom: '5px' }}>Description:</label>
        <textarea
          id="caseDescription"
          value={caseDescription}
          onChange={(e) => setCaseDescription(e.target.value)}
          placeholder="A short description of the case contents"
          className="cs-input"
          style={{ width: '100%' }}
          disabled={isSaving}
        />
      </div>

      <div style={{ marginBottom: '15px' }}>
          <input
              type="checkbox"
              id="isCaseActive"
              checked={isCaseActive}
              onChange={(e) => setIsCaseActive(e.target.checked)}
              disabled={isSaving}
              style={{ verticalAlign: 'middle', marginRight: '5px' }}
          />
          <label htmlFor="isCaseActive" style={{ verticalAlign: 'middle', cursor: 'pointer' }}>
              Case is Active (Visible in opener)
          </label>
      </div>

      {/* Case Image Input Section */}
      <div style={{ marginBottom: '20px', border: '1px solid var(--border-color-2)', padding: '10px', borderRadius: '3px' }}>
          <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Case Image (Optional):</label>
          {/* File Upload */}
          <div style={{ marginBottom: '5px' }}>
              <label htmlFor="caseImage" style={{ display: 'block', fontSize: '0.9em', marginBottom: '3px' }}>Upload New:</label>
              <input
                  type="file" id="caseImage" accept="image/*"
                  onChange={handleCaseImageFileChange} ref={caseImageInputRef}
                  className="cs-input" style={{ width: '100%' }}
                  disabled={isSaving || clearExistingCaseImage} // Disable if clearing
              />
          </div>
          {/* OR Separator */}
          <div style={{ textAlign: 'center', margin: '5px 0', fontSize: '0.9em', color: 'var(--secondary-text)' }}>OR</div>
          {/* Existing Path Selection */}
          <div style={{ marginBottom: '5px' }}>
              <label htmlFor="existingCaseImageSelect" style={{ display: 'block', fontSize: '0.9em', marginBottom: '3px' }}>Select Existing:</label>
              <select
                  id="existingCaseImageSelect"
                  value={selectedExistingCaseImagePath}
                  onChange={handleExistingCaseImageChange}
                  disabled={isLoadingExistingAssets || isSaving || !!caseImageFile || clearExistingCaseImage} // Disable if loading, saving, new file selected, or clearing
                  className="cs-input" style={{ width: '100%' }}
              >
                  <option value="">-- Select Existing Image --</option>
                  {existingImagePaths.map(path => {
                      const fullFilename = path.split('/').pop() || '';
                      const firstHyphenIndex = fullFilename.indexOf('-');
                      const displayName = firstHyphenIndex !== -1 ? fullFilename.substring(firstHyphenIndex + 1) : fullFilename;
                      return <option key={path} value={path}>{displayName}</option>;
                  })}
              </select>
          </div>
          {/* Clear Option (only when editing and image exists) */}
          {editingCaseId !== null && editingCaseOriginalImagePath && (
              <div style={{ fontSize: '0.8em', marginTop: '5px' }}>
                  <input type="checkbox" id="clearCaseImage" checked={clearExistingCaseImage} onChange={handleClearCaseImageToggle} />
                  <label htmlFor="clearCaseImage" style={{ marginLeft: '4px' }}>Remove/Clear Image</label>
              </div>
          )}
          {/* Preview */}
          {caseImagePreviewPath && <img src={caseImagePreviewPath} alt="Case Preview" style={{ height: '50px', width: 'auto', border: '1px solid var(--border-color)', marginTop: '5px' }} />}
      </div>


      {/* Items Section */}
      <h3>Items</h3>
      {/* Display Total Percentage and Warning */}
      <div style={{ marginBottom: '10px', padding: '5px', border: '1px solid var(--border-color-2)', borderRadius: '3px', backgroundColor: 'var(--background-light)' }}>
          Total Percentage Chance: <span style={{ fontWeight: 'bold' }}>{totalPercentage.toFixed(2)}%</span>
          {Math.abs(totalPercentage - 100) > 0.01 && ( // Allow small tolerance for display
              <span style={{ color: 'orange', marginLeft: '10px', fontWeight: 'bold' }}> (Warning: Total does not equal 100%)</span>
          )}
      </div>

      {/* Use the general 'error' state for template loading errors too */}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {isLoadingTemplates && <p>Loading item templates...</p>}

      {!isLoadingTemplates && !error && (
        <DndContext
            sensors={sensors} // Use the unconditionally created sensors
            collisionDetection={closestCenter}
            onDragEnd={(event) => localHandleDragEnd(event, setItems)} // Pass setItems directly here
        >
            <SortableContext items={items.map(item => item.id)} strategy={verticalListSortingStrategy}>
                {items.map((item, index) => (
                    <DraggableItemRow
                        key={item.id}
                        item={item}
                        index={index}
                        availableTemplates={availableTemplates}
                        isSaving={isSaving}
                        handleItemChange={handleItemChange}
                        removeItem={removeItem}
                        renderTemplateOptions={renderTemplateOptions}
                    />
                ))}
            </SortableContext>
        </DndContext>
      )}

      <StyledButton onClick={addItem} style={{ marginRight: '10px' }} disabled={isLoadingTemplates || isSaving}>
        Add Item Row
      </StyledButton>

      {/* Normalize Button */}
       <StyledButton
            onClick={handleNormalizePercentages}
            style={{ marginRight: '10px' }}
            disabled={isLoadingTemplates || isSaving || items.length === 0}
            // Removed invalid variant="secondary"
        >
            Normalize % to 100
        </StyledButton>

      <StyledButton
        onClick={handleSaveCase}
        style={{ marginTop: '20px' }}
        disabled={isLoadingTemplates || isLoadingCases || isSaving || isLoadingDuplicationSource}
      >
        {isSaving
            ? 'Saving...'
            : editingCaseId // and duplicatingCaseId is null (implied by mutual exclusivity)
            ? 'Update Case'
            : duplicatingCaseId // and editingCaseId is null
            ? 'Save as New Duplicated Case'
            : 'Save New Case'}
      </StyledButton>
    </div>
  );
}

// Helper function for drag end - defined within CreateCaseForm or passed setItems correctly
// For this structure, it's better to define it where setItems is in scope or pass setItems via prop if it were outside.
// Since it's used directly in CreateCaseForm's DndContext, we'll make it a local const.
const localHandleDragEnd = (event: DragEndEvent, setItems: React.Dispatch<React.SetStateAction<CaseItemState[]>>) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
        setItems((currentItems) => {
            const oldIndex = currentItems.findIndex((item) => item.id === active.id);
            const newIndex = currentItems.findIndex((item) => item.id === over.id);
            if (oldIndex === -1 || newIndex === -1) return currentItems; // Should not happen if IDs are correct
            return arrayMove(currentItems, oldIndex, newIndex);
        });
    }
};


export default CreateCaseForm;
