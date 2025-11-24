// --- Signature Logic (Canvas) ---
const sigModal = document.getElementById('sig-modal');
const canvas = document.getElementById('sig-canvas');
const ctx = canvas.getContext('2d');
const sigConfig = document.getElementById('sig-config');
const sigPreviewImg = document.getElementById('sig-preview-img');
const btnOpenSig = document.getElementById('btn-open-sig');

// Placement DOM
const placementModal = document.getElementById('placement-modal');
const a4Container = document.getElementById('a4-preview-container');
const draggableSig = document.getElementById('draggable-sig');
const dragSigImg = document.getElementById('drag-sig-img');
const dragScaleSlider = document.getElementById('drag-scale-slider');

let isDrawing = false;

function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
}

function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
    const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);

    return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
    };
}

const stopTouchScroll = (e) => { if (e.target === canvas) e.preventDefault(); }
document.body.addEventListener('touchstart', stopTouchScroll, { passive: false });
document.body.addEventListener('touchmove', stopTouchScroll, { passive: false });

canvas.addEventListener('mousedown', (e) => { isDrawing = true; ctx.beginPath(); const p = getPos(e); ctx.moveTo(p.x, p.y); });
canvas.addEventListener('mousemove', (e) => { if (!isDrawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
canvas.addEventListener('mouseup', () => { isDrawing = false; });
canvas.addEventListener('touchstart', (e) => { isDrawing = true; ctx.beginPath(); const p = getPos(e); ctx.moveTo(p.x, p.y); });
canvas.addEventListener('touchmove', (e) => { if (!isDrawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
canvas.addEventListener('touchend', () => { isDrawing = false; });

btnOpenSig.addEventListener('click', () => {
    sigModal.style.display = 'flex';
    requestAnimationFrame(resizeCanvas);
});

window.closeSigModal = () => sigModal.style.display = 'none';
window.clearCanvas = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.beginPath(); };
window.saveSignature = () => {
    signatureData = canvas.toDataURL('image/png');
    sigPreviewImg.src = signatureData;
    dragSigImg.src = signatureData;
    sigConfig.classList.add('active');
    btnOpenSig.innerText = '修改签名';
    closeSigModal();
}
window.removeSignature = () => {
    signatureData = null;
    sigConfig.classList.remove('active');
    btnOpenSig.innerText = '+ 创建签名';
}

// --- Visual Placement Logic (New) ---
window.openPlacementModal = () => {
    if (!signatureData) { alert('请先创建签名'); return; }
    placementModal.style.display = 'flex';
    updateDraggableVisuals();
}
window.closePlacementModal = () => {
    const containerRect = a4Container.getBoundingClientRect();
    const sigRect = draggableSig.getBoundingClientRect();

    const relativeLeft = (sigRect.left - containerRect.left) / containerRect.width;
    const relativeTop = (sigRect.top - containerRect.top) / containerRect.height;

    sigSettings.xPercent = relativeLeft;
    const relativeHeight = sigRect.height / containerRect.height;
    sigSettings.yPercent = 1 - (relativeTop + relativeHeight);

    const displayWidth = draggableSig.offsetWidth;
    sigSettings.width = displayWidth * (A4_WIDTH / containerRect.width);

    placementModal.style.display = 'none';
}

function updateDraggableVisuals() {
    let previewW = 300;
    let previewH = 424;

    if (activePdfMetadata) {
        const { width, height, rotation } = activePdfMetadata;
        const isRotated = rotation % 180 !== 0;
        const effectiveW = isRotated ? height : width;
        const effectiveH = isRotated ? width : height;
        const ratio = effectiveH / effectiveW;

        previewH = previewW * ratio;
        a4Container.style.aspectRatio = `${effectiveW}/${effectiveH}`;
        a4Container.style.height = `${previewH}px`;
    } else {
        a4Container.style.aspectRatio = '210/297';
        a4Container.style.height = 'auto';
    }

    requestAnimationFrame(() => {
        const containerRect = a4Container.getBoundingClientRect();

        const displayWidth = sigSettings.width * (containerRect.width / A4_WIDTH);
        draggableSig.style.width = `${displayWidth}px`;
        dragScaleSlider.value = displayWidth;

        const leftPx = sigSettings.xPercent * containerRect.width;
        const displayHeight = (displayWidth / dragSigImg.naturalWidth) * dragSigImg.naturalHeight || 60;
        const topPx = (1 - sigSettings.yPercent) * containerRect.height - displayHeight;

        draggableSig.style.left = `${leftPx}px`;
        draggableSig.style.top = `${topPx}px`;
    });
}

// 拖拽逻辑
let isDraggingSig = false;
let dragStart = { x: 0, y: 0 };
let sigStart = { left: 0, top: 0 };

draggableSig.addEventListener('mousedown', startDrag);
draggableSig.addEventListener('touchstart', startDrag, { passive: false });

function startDrag(e) {
    e.preventDefault();
    isDraggingSig = true;
    draggableSig.classList.add('dragging');

    const clientX = e.clientX || e.touches[0].clientX;
    const clientY = e.clientY || e.touches[0].clientY;

    dragStart = { x: clientX, y: clientY };
    sigStart = {
        left: draggableSig.offsetLeft,
        top: draggableSig.offsetTop
    };

    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', stopDrag);
    document.addEventListener('touchmove', onDrag, { passive: false });
    document.addEventListener('touchend', stopDrag);
}

function onDrag(e) {
    if (!isDraggingSig) return;
    e.preventDefault();

    const clientX = e.clientX || e.touches[0].clientX;
    const clientY = e.clientY || e.touches[0].clientY;

    const dx = clientX - dragStart.x;
    const dy = clientY - dragStart.y;

    const containerW = a4Container.offsetWidth;
    const containerH = a4Container.offsetHeight;
    const sigW = draggableSig.offsetWidth;
    const sigH = draggableSig.offsetHeight;

    let newLeft = sigStart.left + dx;
    let newTop = sigStart.top + dy;

    newLeft = Math.max(0, Math.min(newLeft, containerW - sigW));
    newTop = Math.max(0, Math.min(newTop, containerH - sigH));

    draggableSig.style.left = `${newLeft}px`;
    draggableSig.style.top = `${newTop}px`;
}

function stopDrag() {
    isDraggingSig = false;
    draggableSig.classList.remove('dragging');
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', stopDrag);
    document.removeEventListener('touchmove', onDrag);
    document.removeEventListener('touchend', stopDrag);
}

dragScaleSlider.addEventListener('input', (e) => {
    const newWidth = parseInt(e.target.value);
    draggableSig.style.width = `${newWidth}px`;
});

// --- Helper: Apply Signature to PDF Document ---
async function applySignatureToPdf(pdfDoc) {
    if (!signatureData) return;

    const sigImageEmbed = await pdfDoc.embedPng(signatureData);
    const pages = pdfDoc.getPages();
    const scope = document.getElementById('sig-scope').value;

    const sigImgDims = sigImageEmbed.scale(1);
    const targetWidth = sigSettings.width;
    const targetHeight = sigImgDims.height * (targetWidth / sigImgDims.width);

    let targetIndices = [];
    if (scope === 'all') {
        targetIndices = pages.map((_, i) => i);
    } else if (scope === 'first') {
        targetIndices = [0];
    } else if (scope === 'last') {
        targetIndices = [pages.length - 1];
    }

    targetIndices.forEach(idx => {
        const page = pages[idx];
        if (page) {
            const { width: pageWidth, height: pageHeight } = page.getSize();
            const rotation = page.getRotation().angle;
            const sigRotation = PDFLib.degrees(rotation);

            let pdfX, pdfY;
            if (rotation === 0) {
                pdfX = pageWidth * sigSettings.xPercent;
                pdfY = pageHeight * sigSettings.yPercent;
            } else if (rotation === 90) {
                pdfX = pageWidth * sigSettings.yPercent;
                pdfY = pageHeight * (1 - sigSettings.xPercent);
            } else if (rotation === 180) {
                pdfX = pageWidth * (1 - sigSettings.xPercent);
                pdfY = pageHeight * (1 - sigSettings.yPercent);
            } else if (rotation === 270) {
                pdfX = pageWidth * (1 - sigSettings.yPercent);
                pdfY = pageHeight * sigSettings.xPercent;
            }

            page.drawImage(sigImageEmbed, {
                x: pdfX,
                y: pdfY,
                width: targetWidth,
                height: targetHeight,
                rotate: sigRotation
            });
        }
    });
}
