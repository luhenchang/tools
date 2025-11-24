// --- Image Editor DOM ---
const editHue = document.getElementById('edit-hue');
const editSat = document.getElementById('edit-sat');
const valHue = document.getElementById('val-hue');
const valSat = document.getElementById('val-sat');
const btnToggleCrop = document.getElementById('btn-toggle-crop');
const cropActions = document.getElementById('crop-actions');
const btnConfirmCrop = document.getElementById('btn-confirm-crop');
const btnCancelCrop = document.getElementById('btn-cancel-crop');
const editW = document.getElementById('edit-w');
const editH = document.getElementById('edit-h');
const lockRatio = document.getElementById('lock-ratio');
const btnApplyResize = document.getElementById('btn-apply-resize');
const btnResetEdit = document.getElementById('btn-reset-edit');
const btnDownloadEdit = document.getElementById('btn-download-edit');
const editorImage = document.getElementById('editor-image');
const editorDropArea = document.getElementById('editor-drop-area');
const editorWorkspace = document.getElementById('editor-workspace');

function loadEditorImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        editorState.originalUrl = e.target.result;
        editorState.currentUrl = e.target.result;
        editorState.hue = 0;
        editorState.sat = 100;

        editorDropArea.style.display = 'none';
        editorWorkspace.style.display = 'block';

        editorImage.src = editorState.currentUrl;

        // Reset Controls
        editHue.value = 0;
        editSat.value = 100;
        valHue.innerText = '0';
        valSat.innerText = '100%';

        // Auto-fill dimensions
        editorImage.onload = () => {
            editW.value = editorImage.naturalWidth;
            editH.value = editorImage.naturalHeight;
        };
    };
    reader.readAsDataURL(file);
}

// Filter Logic
function updateFilter() {
    const hue = editHue.value;
    const sat = editSat.value;
    valHue.innerText = hue;
    valSat.innerText = sat + '%';

    // Apply CSS filter for preview
    editorImage.style.filter = `hue-rotate(${hue}deg) saturate(${sat}%)`;
}

editHue.addEventListener('input', updateFilter);
editSat.addEventListener('input', updateFilter);

// Crop Logic
btnToggleCrop.addEventListener('click', () => {
    if (editorState.isCropping) return;

    editorState.isCropping = true;
    btnToggleCrop.style.display = 'none';
    cropActions.style.display = 'flex';

    // Disable other controls
    editHue.disabled = true;
    editSat.disabled = true;

    // Init Cropper
    editorState.cropper = new Cropper(editorImage, {
        viewMode: 1,
        autoCropArea: 0.8,
    });
});

btnConfirmCrop.addEventListener('click', () => {
    if (!editorState.cropper) return;

    // Get cropped canvas
    const croppedCanvas = editorState.cropper.getCroppedCanvas();
    editorState.currentUrl = croppedCanvas.toDataURL('image/png');

    // Destroy cropper
    editorState.cropper.destroy();
    editorState.cropper = null;

    // Update Image
    editorImage.src = editorState.currentUrl;

    exitCropMode();

    // Update dimensions
    editW.value = croppedCanvas.width;
    editH.value = croppedCanvas.height;
});

btnCancelCrop.addEventListener('click', () => {
    if (editorState.cropper) {
        editorState.cropper.destroy();
        editorState.cropper = null;
    }
    exitCropMode();
});

function exitCropMode() {
    editorState.isCropping = false;
    btnToggleCrop.style.display = 'block';
    cropActions.style.display = 'none';
    editHue.disabled = false;
    editSat.disabled = false;
}

// Resize Logic
lockRatio.addEventListener('change', () => {
    if (lockRatio.checked && editorImage.naturalWidth) {
        const ratio = editorImage.naturalWidth / editorImage.naturalHeight;
        editH.value = Math.round(editW.value / ratio);
    }
});

editW.addEventListener('input', () => {
    if (lockRatio.checked && editorImage.naturalWidth) {
        const ratio = editorImage.naturalWidth / editorImage.naturalHeight;
        editH.value = Math.round(editW.value / ratio);
    }
});

editH.addEventListener('input', () => {
    if (lockRatio.checked && editorImage.naturalWidth) {
        const ratio = editorImage.naturalWidth / editorImage.naturalHeight;
        editW.value = Math.round(editH.value * ratio);
    }
});

btnApplyResize.addEventListener('click', () => {
    const w = parseInt(editW.value);
    const h = parseInt(editH.value);
    if (!w || !h) return;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    // Draw current image scaled
    ctx.drawImage(editorImage, 0, 0, w, h);

    editorState.currentUrl = canvas.toDataURL('image/png');
    editorImage.src = editorState.currentUrl;
});

// Reset
btnResetEdit.addEventListener('click', () => {
    if (confirm('确定要重置所有编辑吗？')) {
        editorImage.src = editorState.originalUrl;
        editorState.currentUrl = editorState.originalUrl;
        editHue.value = 0;
        editSat.value = 100;
        updateFilter();

        // Reset dimensions
        const img = new Image();
        img.onload = () => {
            editW.value = img.width;
            editH.value = img.height;
        };
        img.src = editorState.originalUrl;
    }
});

// Download
btnDownloadEdit.addEventListener('click', () => {
    // We need to apply the CSS filters (Hue/Sat) to the final canvas if they are active
    const canvas = document.createElement('canvas');
    canvas.width = editorImage.naturalWidth;
    canvas.height = editorImage.naturalHeight;
    const ctx = canvas.getContext('2d');

    // Apply filters
    ctx.filter = `hue-rotate(${editHue.value}deg) saturate(${editSat.value}%)`;
    ctx.drawImage(editorImage, 0, 0);

    const link = document.createElement('a');
    link.download = 'edited-image.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
});

// Expose for file-manager.js
window.loadEditorImage = loadEditorImage;
