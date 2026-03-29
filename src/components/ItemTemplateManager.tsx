import React, { useState, useEffect, useRef } from 'react';
import type { ChangeEvent, FormEvent } from 'react'; // Use type-only imports
import StyledButton from './StyledButton';
import { getApiUrl } from '../config';
import './ItemTemplateManager.css'; // Import the new CSS

// Define structure for Item Template data received from backend
interface ItemTemplate {
    id: number;
    base_name: string;
    image_path: string | null;
    sound_path: string | null;
    rules_text: string | null;
    created_at: string;
}

// Define structure for existing asset paths
interface ExistingAssets {
    images: string[];
    sounds: string[];
}

function ItemTemplateManager() {
    const [templates, setTemplates] = useState<ItemTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // State for the create/edit template form
    const [newTemplateName, setNewTemplateName] = useState('');
    const [newTemplateImageFile, setNewTemplateImageFile] = useState<File | null>(null);
    const [newTemplateSoundFile, setNewTemplateSoundFile] = useState<File | null>(null);
    const [newTemplateRulesText, setNewTemplateRulesText] = useState('');
    const [isUploading, setIsUploading] = useState(false); // Tracks create/update state
    const [isDeleting, setIsDeleting] = useState(false); // Tracks delete state

    // State for editing
    const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
    const [clearExistingImage, setClearExistingImage] = useState(false);
    const [clearExistingSound, setClearExistingSound] = useState(false);

    // State for existing asset paths and selection
    const [existingImagePaths, setExistingImagePaths] = useState<string[]>([]);
    const [existingSoundPaths, setExistingSoundPaths] = useState<string[]>([]);
    const [selectedExistingImagePath, setSelectedExistingImagePath] = useState<string>('');
    const [selectedExistingSoundPath, setSelectedExistingSoundPath] = useState<string>('');
    const [isLoadingExistingAssets, setIsLoadingExistingAssets] = useState(true);

    // Refs for file inputs to allow resetting them
    const imageInputRef = useRef<HTMLInputElement>(null);
    const soundInputRef = useRef<HTMLInputElement>(null);

    // Function to fetch item templates
    const fetchItemTemplates = () => {
        setError(null);
        fetch(getApiUrl('/api/item-templates'))
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return response.json();
            })
            .then((data: ItemTemplate[]) => {
                setTemplates(data);
            })
            .catch(err => {
                const msg = err instanceof Error ? err.message : String(err);
                console.error("Error fetching item templates:", err);
                setError(`Failed to load item templates: ${msg}`);
                setTemplates([]);
            });
    };

    // Function to fetch existing asset paths
    const fetchExistingAssets = () => {
        setError(null);
        fetch(getApiUrl('/api/existing-assets'))
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return response.json();
            })
            .then((data: ExistingAssets) => {
                setExistingImagePaths(data.images || []);
                setExistingSoundPaths(data.sounds || []);
            })
            .catch(err => {
                const msg = err instanceof Error ? err.message : String(err);
                console.error("Error fetching existing assets:", err);
                setError(`Failed to load existing assets: ${msg}`);
                setExistingImagePaths([]);
                setExistingSoundPaths([]);
            });
    };

    // Fetch all data on mount
    useEffect(() => {
        const loadAllData = async () => {
            setIsLoading(true);
            setIsLoadingExistingAssets(true);
            setError(null);
            try {
                await Promise.all([fetchItemTemplates(), fetchExistingAssets()]);
            } catch (err) {
                console.error("Error during initial data load:", err);
            } finally {
                setIsLoading(false);
                setIsLoadingExistingAssets(false);
            }
        };
        loadAllData();
    }, []);

    // Handle file input changes (clears existing path selection)
    const handleImageFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] ?? null;
        setNewTemplateImageFile(file);
        if (file) {
            setSelectedExistingImagePath('');
        }
    };

    const handleSoundFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0] ?? null;
        setNewTemplateSoundFile(file);
        if (file) {
            setSelectedExistingSoundPath('');
        }
    };

    // Handle existing path selection changes (clears file input)
    const handleExistingImageChange = (event: ChangeEvent<HTMLSelectElement>) => {
        const path = event.target.value;
        setSelectedExistingImagePath(path);
        if (path) {
            setNewTemplateImageFile(null);
            if (imageInputRef.current) imageInputRef.current.value = '';
        }
    };

    const handleExistingSoundChange = (event: ChangeEvent<HTMLSelectElement>) => {
        const path = event.target.value;
        setSelectedExistingSoundPath(path);
        if (path) {
            setNewTemplateSoundFile(null);
            if (soundInputRef.current) soundInputRef.current.value = '';
        }
    };

    // Reset form fields
    const resetForm = () => {
        setNewTemplateName('');
        setNewTemplateImageFile(null);
        setNewTemplateSoundFile(null);
        setNewTemplateRulesText('');
        setEditingTemplateId(null);
        setClearExistingImage(false);
        setClearExistingSound(false);
        setSelectedExistingImagePath('');
        setSelectedExistingSoundPath('');
        if (imageInputRef.current) imageInputRef.current.value = '';
        if (soundInputRef.current) soundInputRef.current.value = '';
    };

    // Handle starting an edit
    const handleEditClick = (template: ItemTemplate) => {
        setEditingTemplateId(template.id);
        setNewTemplateName(template.base_name);
        setNewTemplateRulesText(template.rules_text ?? '');
        setNewTemplateImageFile(null);
        setNewTemplateSoundFile(null);
        setSelectedExistingImagePath('');
        setSelectedExistingSoundPath('');
        setClearExistingImage(false);
        setClearExistingSound(false);
        if (imageInputRef.current) imageInputRef.current.value = '';
        if (soundInputRef.current) soundInputRef.current.value = '';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Handle form submission (Create or Update)
    const handleSubmit = (event: FormEvent) => {
        event.preventDefault();
        if (!newTemplateName.trim()) {
            alert(`Please enter a base name for the item template.`);
            return;
        }

        const formData = new FormData();
        formData.append('base_name', newTemplateName.trim());

        if (newTemplateImageFile) {
            formData.append('image_file', newTemplateImageFile);
        } else if (selectedExistingImagePath) {
            formData.append('existing_image_path', selectedExistingImagePath);
        }

        if (newTemplateSoundFile) {
            formData.append('sound_file', newTemplateSoundFile);
        } else if (selectedExistingSoundPath) {
            formData.append('existing_sound_path', selectedExistingSoundPath);
        }

        if (newTemplateRulesText.trim()) {
            formData.append('rules_text', newTemplateRulesText.trim());
        }

        if (editingTemplateId !== null) {
            if (clearExistingImage) formData.append('clear_image', 'true');
            if (clearExistingSound) formData.append('clear_sound', 'true');
        }

        setIsUploading(true);
        setError(null);

        const url = editingTemplateId
            ? getApiUrl(`/api/item-templates/${editingTemplateId}`)
            : getApiUrl('/api/item-templates');
        const method = editingTemplateId ? 'PUT' : 'POST';

        fetch(url, { method, body: formData })
            .then(async response => {
                if (!response.ok) {
                    let errorMsg = `HTTP error! status: ${response.status}`;
                    try {
                        const errData = await response.json();
                        errorMsg = errData.error || errorMsg;
                    } catch (e) { /* Ignore */ }
                    throw new Error(errorMsg);
                }
                return response.json();
            })
            .then(data => {
                alert(`Item Template "${newTemplateName}" ${editingTemplateId ? 'updated' : 'created'} successfully!`);
                resetForm();
                fetchItemTemplates();
                fetchExistingAssets();
            })
            .catch(err => {
                console.error(`Error ${editingTemplateId ? 'updating' : 'creating'} item template:`, err);
                setError(`Failed to ${editingTemplateId ? 'update' : 'create'} template: ${err.message}`);
            })
            .finally(() => setIsUploading(false));
    };

    // Handle delete click
    const handleDeleteClick = (templateId: number, templateName: string) => {
        const confirmationMessage = `Deleting template "${templateName}" (ID: ${templateId}) will also remove it from any cases that use it. Are you sure you want to proceed?`;
        if (window.confirm(confirmationMessage)) {
            setIsDeleting(true);
            setError(null);
            fetch(getApiUrl(`/api/item-templates/${templateId}`), { method: 'DELETE' })
                .then(async response => {
                    if (!response.ok) {
                        let errorMsg = `HTTP error! status: ${response.status}`;
                        try {
                            const errData = await response.json();
                            errorMsg = errData.error || errorMsg;
                        } catch (e) { /* Ignore */ }
                        throw new Error(errorMsg);
                    }
                    return response.json();
                })
                .then(data => {
                    alert(`Item Template "${templateName}" deleted successfully!`);
                    fetchItemTemplates(); // Refresh the list
                    fetchExistingAssets(); // Refresh existing assets in case some are no longer used
                    if (editingTemplateId === templateId) { // If the deleted template was being edited, reset form
                        resetForm();
                    }
                })
                .catch(err => {
                    console.error(`Error deleting item template:`, err);
                    setError(`Failed to delete template: ${err.message}`);
                })
                .finally(() => setIsDeleting(false));
        }
    };

    // Determine current preview paths based on state
    const imagePreviewPath = newTemplateImageFile
        ? URL.createObjectURL(newTemplateImageFile)
        : selectedExistingImagePath
        ? getApiUrl(selectedExistingImagePath)
        : editingTemplateId
        ? templates.find(t => t.id === editingTemplateId)?.image_path
            ? getApiUrl(templates.find(t => t.id === editingTemplateId)?.image_path || '')
            : null
        : null;

    const soundPreviewPath = newTemplateSoundFile
        ? URL.createObjectURL(newTemplateSoundFile)
        : selectedExistingSoundPath
        ? getApiUrl(selectedExistingSoundPath)
        : editingTemplateId
        ? templates.find(t => t.id === editingTemplateId)?.sound_path
            ? getApiUrl(templates.find(t => t.id === editingTemplateId)?.sound_path || '')
            : null
        : null;

    // Cleanup object URLs on unmount or when file changes
    useEffect(() => {
        let imageUrl = newTemplateImageFile ? URL.createObjectURL(newTemplateImageFile) : null;
        let soundUrl = newTemplateSoundFile ? URL.createObjectURL(newTemplateSoundFile) : null;
        return () => {
            if (imageUrl) URL.revokeObjectURL(imageUrl);
            if (soundUrl) URL.revokeObjectURL(soundUrl);
        };
    }, [newTemplateImageFile, newTemplateSoundFile]);

    return (
        <div style={{ padding: '20px', border: '1px solid var(--border-color)', borderRadius: '5px' }}>
            <h2>Item Template Manager</h2>
            <hr className="cs-hr" style={{ margin: '15px 0' }} />

            {/* Create/Edit Template Form */}
            <form onSubmit={handleSubmit} style={{ marginBottom: '20px', padding: '15px', border: '1px dashed var(--border-color)' }}>
                <h3>{editingTemplateId ? 'Edit Item Template (ID: ' + editingTemplateId + ')' : 'Create New Item Template'}</h3>
                {error && !isUploading && <p style={{ color: 'red' }}>Error: {error}</p>}
                {isLoadingExistingAssets && <p>Loading existing assets...</p>}

                {/* Base Name Input */}
                <div style={{ marginBottom: '10px' }}>
                    <label htmlFor="templateName" style={{ display: 'block', marginBottom: '3px' }}>Base Name:</label>
                    <input
                        type="text"
                        id="templateName"
                        value={newTemplateName}
                        onChange={(e) => setNewTemplateName(e.target.value)}
                        placeholder="e.g., AK-47 | Redline"
                        className="cs-input"
                        required
                        disabled={isUploading}
                        style={{ width: '100%' }}
                    />
                </div>

                {/* Image Input Section */}
                <div style={{ marginBottom: '10px', border: '1px solid var(--border-color-2)', padding: '10px', borderRadius: '3px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Image (Optional):</label>
                    <div style={{ marginBottom: '5px' }}>
                        <label htmlFor="templateImage" style={{ display: 'block', fontSize: '0.9em', marginBottom: '3px' }}>Upload New:</label>
                        <input
                            type="file"
                            id="templateImage"
                            accept="image/*"
                            onChange={handleImageFileChange}
                            ref={imageInputRef}
                            className="cs-input"
                            style={{ width: '100%' }}
                            disabled={isUploading || clearExistingImage}
                        />
                    </div>
                    <div style={{ textAlign: 'center', margin: '5px 0', fontSize: '0.9em', color: 'var(--secondary-text)' }}>OR</div>
                    <div style={{ marginBottom: '5px' }}>
                        <label htmlFor="existingImageSelect" style={{ display: 'block', fontSize: '0.9em', marginBottom: '3px' }}>Select Existing:</label>
                        <select
                            id="existingImageSelect"
                            value={selectedExistingImagePath}
                            onChange={handleExistingImageChange}
                            disabled={isLoadingExistingAssets || isUploading || !!newTemplateImageFile || clearExistingImage}
                            className="cs-input"
                            style={{ width: '100%' }}
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
                    {editingTemplateId !== null && templates.find(t => t.id === editingTemplateId)?.image_path && (
                        <div style={{ fontSize: '0.8em', marginTop: '5px' }}>
                            <input
                                type="checkbox"
                                id="clearImage"
                                checked={clearExistingImage}
                                onChange={(e) => {
                                    setClearExistingImage(e.target.checked);
                                    if (e.target.checked) {
                                        setNewTemplateImageFile(null);
                                        setSelectedExistingImagePath('');
                                        if (imageInputRef.current) imageInputRef.current.value = '';
                                    }
                                }}
                            />
                            <label htmlFor="clearImage" style={{ marginLeft: '4px' }}>Remove/Clear Image</label>
                        </div>
                    )}
                    {imagePreviewPath && !clearExistingImage && (
                        <img
                            src={imagePreviewPath}
                            alt="Preview"
                            style={{
                                height: '40px',
                                width: 'auto',
                                border: '1px solid var(--border-color)',
                                marginTop: '5px'
                            }}
                        />
                    )}
                </div>

                {/* Sound Input Section */}
                <div style={{ marginBottom: '10px', border: '1px solid var(--border-color-2)', padding: '10px', borderRadius: '3px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Sound (Optional):</label>
                    <div style={{ marginBottom: '5px' }}>
                        <label htmlFor="templateSound" style={{ display: 'block', fontSize: '0.9em', marginBottom: '3px' }}>Upload New:</label>
                        <input
                            type="file"
                            id="templateSound"
                            accept="audio/*"
                            onChange={handleSoundFileChange}
                            ref={soundInputRef}
                            className="cs-input"
                            style={{ width: '100%' }}
                            disabled={isUploading || clearExistingSound}
                        />
                    </div>
                    <div style={{ textAlign: 'center', margin: '5px 0', fontSize: '0.9em', color: 'var(--secondary-text)' }}>OR</div>
                    <div style={{ marginBottom: '5px' }}>
                        <label htmlFor="existingSoundSelect" style={{ display: 'block', fontSize: '0.9em', marginBottom: '3px' }}>Select Existing:</label>
                        <select
                            id="existingSoundSelect"
                            value={selectedExistingSoundPath}
                            onChange={handleExistingSoundChange}
                            disabled={isLoadingExistingAssets || isUploading || !!newTemplateSoundFile || clearExistingSound}
                            className="cs-input"
                            style={{ width: '100%' }}
                        >
                            <option value="">-- Select Existing Sound --</option>
                            {existingSoundPaths.map(path => {
                                const fullFilename = path.split('/').pop() || '';
                                const firstHyphenIndex = fullFilename.indexOf('-');
                                const displayName = firstHyphenIndex !== -1 ? fullFilename.substring(firstHyphenIndex + 1) : fullFilename;
                                return <option key={path} value={path}>{displayName}</option>;
                            })}
                        </select>
                    </div>
                    {editingTemplateId !== null && templates.find(t => t.id === editingTemplateId)?.sound_path && (
                        <div style={{ fontSize: '0.8em', marginTop: '5px' }}>
                            <input
                                type="checkbox"
                                id="clearSound"
                                checked={clearExistingSound}
                                onChange={(e) => {
                                    setClearExistingSound(e.target.checked);
                                    if (e.target.checked) {
                                        setNewTemplateSoundFile(null);
                                        setSelectedExistingSoundPath('');
                                        if (soundInputRef.current) soundInputRef.current.value = '';
                                    }
                                }}
                            />
                            <label htmlFor="clearSound" style={{ marginLeft: '4px' }}>Remove/Clear Sound</label>
                        </div>
                    )}
                    {soundPreviewPath && !clearExistingSound && (
                        <audio controls src={soundPreviewPath} style={{ height: '30px', marginTop: '5px' }}>
                            <a href={soundPreviewPath}>Play Sound</a>
                        </audio>
                    )}
                </div>

                {/* Rules Text Input */}
                <div style={{ marginBottom: '10px' }}>
                    <label htmlFor="templateRules" style={{ display: 'block', marginBottom: '3px' }}>Rules Text (Optional):</label>
                    <textarea
                        id="templateRules"
                        value={newTemplateRulesText}
                        onChange={(e) => setNewTemplateRulesText(e.target.value)}
                        placeholder="Enter optional rules text..."
                        className="cs-input"
                        disabled={isUploading}
                        style={{ width: '100%', minHeight: '60px' }}
                    />
                </div>

                <StyledButton type="submit" disabled={isUploading || isLoadingExistingAssets} style={{ marginTop: '10px' }}>
                    {isUploading ? (editingTemplateId ? 'Updating...' : 'Creating...') : (editingTemplateId ? 'Update Template' : 'Create Template')}
                </StyledButton>
                {editingTemplateId !== null && (
                    <StyledButton type="button" onClick={resetForm} disabled={isUploading} style={{ marginTop: '10px', marginLeft: '10px' }}>
                        Cancel Edit
                    </StyledButton>
                )}
            </form>

            <h3>Existing Item Templates</h3>
            {isLoading && <p>Loading templates...</p>}
            {!isLoading && error && <p style={{ color: 'red' }}>Error loading templates: {error}</p>}
            {!isLoading && !error && templates.length === 0 && <p>No item templates created yet.</p>}

            {/* Display grid of templates */}
            {!isLoading && templates.length > 0 && (
                <div className="template-grid">
                    {templates.map(template => (
                        <div key={template.id} className="template-grid-item">
                            {template.image_path ? (
                                <img src={getApiUrl(template.image_path)} alt={template.base_name} />
                            ) : (
                                <div className="placeholder-image">No Image</div>
                            )}
                            <strong>{template.base_name}</strong>
                            <span className="template-id">(ID: {template.id})</span>
                            {/* Optionally display other info like sound/rules if needed, or keep it minimal */}
                            {/* <small style={{ color: 'var(--text-3)', fontSize: '0.8em', wordBreak: 'break-all' }}>
                                Sound: {template.sound_path ? template.sound_path.split('/').pop() : 'None'} <br />
                                Rules: {template.rules_text ? (template.rules_text.length > 20 ? template.rules_text.substring(0, 20) + '...' : template.rules_text) : 'None'}
                            </small> */}
                            <div className="actions">
                                <StyledButton
                                    onClick={() => handleEditClick(template)}
                                    disabled={isUploading || isDeleting || editingTemplateId === template.id}
                                    style={{ backgroundColor: 'var(--button-secondary-bg)', color: 'var(--button-secondary-text)'}}
                                >
                                    Edit
                                </StyledButton>
                                <StyledButton
                                    onClick={() => handleDeleteClick(template.id, template.base_name)}
                                    disabled={isUploading || isDeleting}
                                    style={{ backgroundColor: 'var(--button-danger-bg)', color: 'var(--button-danger-text)'}}
                                >
                                    Delete
                                </StyledButton>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default ItemTemplateManager;
