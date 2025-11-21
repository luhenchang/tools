const { PDFDocument, PageSizes } = PDFLib;
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 20;

let filesMap = new Map();
let signatureData = null;
// 签名设置：改用百分比坐标 (相对于A4纸左下角)
// x: 0~1, y: 0~1, width: 100 (absolute points width usually around 100-200)
let sigSettings = {
    xPercent: 0.7, // 默认靠右
    yPercent: 0.1, // 默认靠下
    width: 150     // 默认宽度点数
};
let currentMode = 'merge';

// DOM Elements
const dropArea = document.getElementById('drop-area');
const dropText = document.getElementById('drop-text');
const fileInput = document.getElementById('file-input');
const fileListEl = document.getElementById('file-list');
const mergeBtn = document.getElementById('merge-btn');
const statusText = document.getElementById('status-text');

// Progress DOM
const progressContainer = document.getElementById('upload-progress-container');
const progressFill = document.getElementById('upload-progress-fill');
const progressText = document.getElementById('upload-progress-text');
const progressStatus = document.getElementById('progress-status');

// Signature DOM
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

// Init Sortable
new Sortable(fileListEl, { animation: 150, handle: '.file-card', ghostClass: 'dragging' });

// --- Mode Switching Logic ---
switchMode('merge');

function switchMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(mode === 'merge' ? 'tab-merge' : 'tab-image').classList.add('active');
    filesMap.clear();
    fileListEl.innerHTML = '';
    updateUI();

    if (mode === 'merge') {
        dropText.innerHTML = '点击或拖拽添加 <b>PDF 文件</b> 进行合并';
        fileInput.accept = 'application/pdf';
        document.getElementById('btn-text').innerText = '开始合并 PDF';
    } else {
        dropText.innerHTML = '点击或拖拽添加 <b>图片 (JPG/PNG)</b> 生成 PDF';
        fileInput.accept = 'image/jpeg, image/png';
        document.getElementById('btn-text').innerText = '生成 PDF';
    }
}
window.switchMode = switchMode;

// --- File Upload Logic ---
dropArea.addEventListener('click', () => fileInput.click());
dropArea.addEventListener('dragover', (e) => { e.preventDefault(); dropArea.classList.add('drag-over'); });
dropArea.addEventListener('dragleave', (e) => { e.preventDefault(); dropArea.classList.remove('drag-over'); });
dropArea.addEventListener('drop', (e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); });
fileInput.addEventListener('change', (e) => { handleFiles(e.target.files); fileInput.value = ''; });

async function handleFiles(files) {
    if (!files.length) return;
    const validFiles = Array.from(files).filter(file => {
        if (currentMode === 'merge') return file.type === 'application/pdf';
        if (currentMode === 'image') return ['image/jpeg', 'image/png'].includes(file.type);
        return false;
    });

    if (validFiles.length === 0) return;

    const totalSize = validFiles.reduce((sum, f) => sum + f.size, 0);
    let globalLoaded = 0;

    progressContainer.style.display = 'block';
    progressContainer.getBoundingClientRect();
    updateProgressBar(0);
    progressStatus.innerText = '准备导入...';

    for (const file of validFiles) {
        progressStatus.innerText = `正在读取: ${file.name}`;
        let thumbUrl = null;

        if (currentMode === 'image' && file.type.startsWith('image/')) {
            try {
                thumbUrl = await readFileWithProgress(file, (fileLoadedBytes) => {
                    updateProgressBar((globalLoaded + fileLoadedBytes) / totalSize);
                });
            } catch (err) { console.error(err); }
        } else {
            updateProgressBar(globalLoaded / totalSize);
            await new Promise(r => setTimeout(r, 20));
        }

        addFileToList(file, thumbUrl);
        globalLoaded += file.size;
        updateProgressBar(globalLoaded / totalSize);
        await new Promise(r => requestAnimationFrame(r));
    }

    progressStatus.innerText = '导入完成';
    updateProgressBar(1);
    setTimeout(() => { progressContainer.style.display = 'none'; progressFill.style.width = '0%'; updateUI(); }, 600);
}

function updateProgressBar(percentage) {
    const pct = Math.min(100, Math.round(percentage * 100));
    progressFill.style.width = `${pct}%`;
    progressText.innerText = `${pct}%`;
}

function readFileWithProgress(file, onProgress) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded); };
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsDataURL(file);
    });
}

function addFileToList(file, thumbUrl) {
    const id = 'f_' + Math.random().toString(36).substr(2, 9);
    const isImage = file.type.startsWith('image/');
    let settings = isImage ? { scale: 0.8, align: 'cc' } : null; // 仅用于图片转PDF的排版
    filesMap.set(id, { file, type: isImage ? 'image' : 'pdf', thumb: thumbUrl, settings });

    const li = document.createElement('li');
    li.className = 'list-item-wrapper';
    li.setAttribute('data-id', id);

    const settingsHtml = (isImage && currentMode === 'image') ? buildImageSettingsHtml(id, settings) : '';
    const iconHtml = isImage ? `<img src="${thumbUrl}">` : '<i class="fas fa-file-pdf" style="color:#ff5252; font-size:18px;"></i>';
    const btnSetHtml = (isImage && currentMode === 'image') ? `<button onclick="toggleSettings('${id}', this)"><i class="fas fa-sliders-h"></i></button>` : '';

    li.innerHTML = `
        <div class="file-card">
            <div class="file-info">
                <div class="thumb-box">${iconHtml}</div>
                <div class="file-name">${file.name}</div>
            </div>
            <div class="card-actions">
                ${btnSetHtml}
                <button onclick="removeFile('${id}')"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>
        ${settingsHtml}
    `;
    fileListEl.appendChild(li);
}

function buildImageSettingsHtml(id, s) {
    // 图片转PDF的简单排版设置（保留，以防用户需要）
    return `
        <div class="settings-panel" id="set-${id}">
            <div class="settings-row">
                <span class="settings-label">缩放:</span>
                <input type="range" min="10" max="100" value="${s.scale*100}" oninput="updateScale('${id}', this.value)">
            </div>
            <div class="settings-row">
                <span class="settings-label">位置:</span>
                <div class="align-grid">
                    ${['tl','tc','tr','cl','cc','cr','bl','bc','br'].map(p =>
        `<div class="align-btn ${p} ${p===s.align?'active':''}" onclick="updateAlign('${id}','${p}',this)"></div>`
    ).join('')}
                </div>
            </div>
        </div>`;
}

// --- Signature Logic (Canvas) ---
let isDrawing = false;

// 修复：使用 rect 获取真实尺寸，防止鼠标偏移
function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
}

// 修复：增加缩放因子计算
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

// 防止触摸滚动
const stopTouchScroll = (e) => { if(e.target === canvas) e.preventDefault(); }
document.body.addEventListener('touchstart', stopTouchScroll, { passive: false });
document.body.addEventListener('touchmove', stopTouchScroll, { passive: false });

canvas.addEventListener('mousedown', (e) => { isDrawing = true; ctx.beginPath(); const p = getPos(e); ctx.moveTo(p.x, p.y); });
canvas.addEventListener('mousemove', (e) => { if(!isDrawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
canvas.addEventListener('mouseup', () => { isDrawing = false; });
canvas.addEventListener('touchstart', (e) => { isDrawing = true; ctx.beginPath(); const p = getPos(e); ctx.moveTo(p.x, p.y); });
canvas.addEventListener('touchmove', (e) => { if(!isDrawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
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
    dragSigImg.src = signatureData; // 更新拖拽预览图
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
    // 初始化位置 (如果没有设置过，默认放在右下角)
    updateDraggableVisuals();
}
window.closePlacementModal = () => {
    // 保存位置：计算当前 DOM 元素相对于容器的百分比
    const containerRect = a4Container.getBoundingClientRect();
    const sigRect = draggableSig.getBoundingClientRect();

    // 计算左上角相对位置 (0~1)
    const relativeLeft = (sigRect.left - containerRect.left) / containerRect.width;
    const relativeTop = (sigRect.top - containerRect.top) / containerRect.height;

    // PDF 坐标系：X 是从左往右，Y 是从下往上
    // 我们保存 xPercent (Left) 和 yPercent (Bottom)
    sigSettings.xPercent = relativeLeft;
    // Bottom = 1 - (Top + Height)
    const relativeHeight = sigRect.height / containerRect.height;
    sigSettings.yPercent = 1 - (relativeTop + relativeHeight);

    // 保存宽度 (以 A4 宽度为基准的缩放)
    // 这里的 scale slider 值对应的是显示宽度 px，我们需要把它换算成 PDF 点数
    // A4 宽度 595.28pt。 预览容器宽度 300px。
    // 比例因子 = 595.28 / 300 ≈ 1.98
    // 真实宽度 = 显示宽度 * (595.28 / 300)
    const displayWidth = draggableSig.offsetWidth;
    sigSettings.width = displayWidth * (A4_WIDTH / containerRect.width);

    placementModal.style.display = 'none';
}

function updateDraggableVisuals() {
    const containerRect = a4Container.getBoundingClientRect(); // 300 x 424
    // 反向计算：从 stored settings -> pixel values
    // Width
    const displayWidth = sigSettings.width * (containerRect.width / A4_WIDTH);
    draggableSig.style.width = `${displayWidth}px`;
    dragScaleSlider.value = displayWidth; // 这里的滑块直接控制 px 宽度

    // Position
    // Left = xPercent * containerWidth
    const leftPx = sigSettings.xPercent * containerRect.width;
    // Top = (1 - yPercent) * containerHeight - Height
    const displayHeight = (displayWidth / dragSigImg.naturalWidth) * dragSigImg.naturalHeight || 60; // 估算高度
    const topPx = (1 - sigSettings.yPercent) * containerRect.height - displayHeight;

    draggableSig.style.left = `${leftPx}px`;
    draggableSig.style.top = `${topPx}px`;
}

// 拖拽逻辑
let isDraggingSig = false;
let dragStart = { x: 0, y: 0 };
let sigStart = { left: 0, top: 0 };

draggableSig.addEventListener('mousedown', startDrag);
draggableSig.addEventListener('touchstart', startDrag, {passive: false});

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
    document.addEventListener('touchmove', onDrag, {passive: false});
    document.addEventListener('touchend', stopDrag);
}

function onDrag(e) {
    if (!isDraggingSig) return;
    e.preventDefault(); // 防止手机滚动

    const clientX = e.clientX || e.touches[0].clientX;
    const clientY = e.clientY || e.touches[0].clientY;

    const dx = clientX - dragStart.x;
    const dy = clientY - dragStart.y;

    // 限制在容器内
    const containerW = a4Container.offsetWidth;
    const containerH = a4Container.offsetHeight;
    const sigW = draggableSig.offsetWidth;
    const sigH = draggableSig.offsetHeight;

    let newLeft = sigStart.left + dx;
    let newTop = sigStart.top + dy;

    // 边界检查
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

// 缩放滑块逻辑
dragScaleSlider.addEventListener('input', (e) => {
    const newWidth = parseInt(e.target.value);
    draggableSig.style.width = `${newWidth}px`;
});


// --- Global UI Helpers ---
window.removeFile = (id) => { filesMap.delete(id); document.querySelector(`li[data-id="${id}"]`).remove(); updateUI(); }
window.toggleSettings = (id, btn) => { document.getElementById(`set-${id}`).classList.toggle('show'); btn.style.color = document.getElementById(`set-${id}`).classList.contains('show') ? 'var(--accent)' : ''; }
window.updateScale = (id, v) => filesMap.get(id).settings.scale = v / 100;
window.updateAlign = (id, a, btn) => {
    filesMap.get(id).settings.align = a;
    btn.parentElement.querySelectorAll('.align-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}
function updateUI() {
    mergeBtn.classList.toggle('active', filesMap.size > 0);
    if (filesMap.size === 0) {
        statusText.innerText = '准备就绪';
    } else {
        statusText.innerText = `已添加 ${filesMap.size} 个文件`;
    }
}

// --- Generate PDF Logic ---
mergeBtn.addEventListener('click', async () => {
    if(filesMap.size === 0) return;
    setLoading(true);

    try {
        const outputDoc = await PDFDocument.create();
        const listItems = fileListEl.querySelectorAll('.list-item-wrapper');
        let sigImageEmbed = null;

        if(signatureData) {
            sigImageEmbed = await outputDoc.embedPng(signatureData);
        }

        for (const item of listItems) {
            const id = item.getAttribute('data-id');
            const data = filesMap.get(id);
            const arrayBuffer = await data.file.arrayBuffer();

            if (data.type === 'pdf') {
                const srcPdf = await PDFDocument.load(arrayBuffer);
                const copiedPages = await outputDoc.copyPages(srcPdf, srcPdf.getPageIndices());
                copiedPages.forEach(page => outputDoc.addPage(page));
            } else {
                let img;
                if(data.file.type.includes('png')) img = await outputDoc.embedPng(arrayBuffer);
                else img = await outputDoc.embedJpg(arrayBuffer);

                const page = outputDoc.addPage([A4_WIDTH, A4_HEIGHT]);
                // 旧的图片位置逻辑（保留）
                const { scale, align } = data.settings;
                const dims = img.scale(1);
                const maxW = A4_WIDTH - MARGIN*2;
                const maxH = A4_HEIGHT - MARGIN*2;
                const baseScale = Math.min(maxW/dims.width, maxH/dims.height);
                const finalScale = baseScale * scale;
                const w = dims.width * finalScale;
                const h = dims.height * finalScale;

                const { x, y } = calcPos(align, w, h);
                page.drawImage(img, { x, y, width: w, height: h });
            }
        }

        // 3. 应用签名 (使用新的拖拽坐标)
        if(sigImageEmbed) {
            const pages = outputDoc.getPages();
            const scope = document.getElementById('sig-scope').value;

            // 计算签名在 PDF 上的实际尺寸和位置
            const sigImgDims = sigImageEmbed.scale(1);
            const targetWidth = sigSettings.width; // 已转换好的 PDF 点数宽度
            const targetHeight = sigImgDims.height * (targetWidth / sigImgDims.width);

            const pdfX = A4_WIDTH * sigSettings.xPercent;
            const pdfY = A4_HEIGHT * sigSettings.yPercent; // 已经是 bottom-up

            let targetIndices = [];
            if (scope === 'all') {
                targetIndices = pages.map((_, i) => i);
            } else if (scope === 'first') {
                targetIndices = [0];
            } else if (scope === 'last') {
                targetIndices = [pages.length - 1];
            }

            targetIndices.forEach(idx => {
                if(pages[idx]) {
                    pages[idx].drawImage(sigImageEmbed, {
                        x: pdfX,
                        y: pdfY,
                        width: targetWidth,
                        height: targetHeight
                    });
                }
            });
        }

        const pdfBytes = await outputDoc.save();
        const fileName = currentMode === 'merge' ? 'merged.pdf' : 'images.pdf';
        downloadBlob(pdfBytes, fileName, 'application/pdf');

    } catch(e) {
        console.error(e);
        alert("生成失败: " + e.message);
    } finally {
        setLoading(false);
    }
});

// 旧的九宫格计算（仅给图片转PDF用）
function calcPos(align, w, h) {
    let x, y;
    if (align.includes('l')) x = MARGIN;
    else if (align.includes('r')) x = A4_WIDTH - MARGIN - w;
    else x = (A4_WIDTH - w) / 2;
    if (align.includes('t')) y = A4_HEIGHT - MARGIN - h;
    else if (align.includes('b')) y = MARGIN;
    else y = (A4_HEIGHT - h) / 2;
    return { x, y };
}

function setLoading(v) {
    mergeBtn.disabled = v;
    document.getElementById('loader').style.display=v?'block':'none';
    if (!v) {
        document.getElementById('btn-text').innerText = currentMode === 'merge' ? '开始合并 PDF' : '生成 PDF';
    } else {
        document.getElementById('btn-text').innerText = '处理中...';
    }
    mergeBtn.style.opacity=v?0.7:1;
}

function downloadBlob(data, name, type) { const b = new Blob([data],{type}); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href=u; a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>URL.revokeObjectURL(u),100); }