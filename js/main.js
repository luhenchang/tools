// Init Sortable
try {
    if (typeof Sortable !== 'undefined') {
        new Sortable(fileListEl, { animation: 150, handle: '.file-card', ghostClass: 'dragging' });
    } else {
        console.warn('Sortable.js not loaded. Drag and drop reordering disabled.');
    }
} catch (e) {
    console.error('Sortable init failed:', e);
}

// --- Mode Switching Logic ---
try {
    switchMode('merge');
} catch (e) {
    console.error('Initial switchMode failed:', e);
}

// --- File Upload Logic ---
dropArea.addEventListener('click', () => fileInput.click());
dropArea.addEventListener('dragover', (e) => { e.preventDefault(); dropArea.classList.add('drag-over'); });
dropArea.addEventListener('dragleave', (e) => { e.preventDefault(); dropArea.classList.remove('drag-over'); });
dropArea.addEventListener('drop', (e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); });

// Editor Drop Area
editorDropArea.addEventListener('click', () => fileInput.click());
editorDropArea.addEventListener('dragover', (e) => { e.preventDefault(); editorDropArea.classList.add('drag-over'); });
editorDropArea.addEventListener('dragleave', (e) => { e.preventDefault(); editorDropArea.classList.remove('drag-over'); });
editorDropArea.addEventListener('drop', (e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); });

fileInput.addEventListener('change', (e) => { handleFiles(e.target.files); fileInput.value = ''; });
