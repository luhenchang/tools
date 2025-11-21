const { PDFDocument, PageSizes } = PDFLib;
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 20;

let filesMap = new Map();
let signatureData = null;
let sigSettings = { align: 'br', scope: 'last' };
let currentMode = 'merge'; // 默认为合并模式: 'merge' | 'image'

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

// 修改后的 handleFiles：基于字节的真实进度
async function handleFiles(files) {
    if (!files.length) return;

    // 1. 筛选有效文件并计算总大小
    const validFiles = Array.from(files).filter(file => {
        if (currentMode === 'merge') return file.type === 'application/pdf';
        if (currentMode === 'image') return ['image/jpeg', 'image/png'].includes(file.type);
        return false;
    });

    if (validFiles.length === 0) return;

    const totalSize = validFiles.reduce((sum, f) => sum + f.size, 0);
    let globalLoaded = 0; // 全局已加载字节数

    // 2. 初始化进度条 UI
    progressContainer.style.display = 'block';
    // 强制浏览器重绘，确保进度条背景立即显示
    progressContainer.getBoundingClientRect();
    updateProgressBar(0);
    progressStatus.innerText = '准备导入...';

    // 3. 逐个处理
    for (const file of validFiles) {
        progressStatus.innerText = `正在读取: ${file.name}`;
        let thumbUrl = null;

        // 只有图片模式需要真正“读取”内容来生成缩略图
        if (currentMode === 'image' && file.type.startsWith('image/')) {
            try {
                thumbUrl = await readFileWithProgress(file, (fileLoadedBytes) => {
                    // 当前文件已读 + 之前文件总大小 = 全局进度
                    updateProgressBar((globalLoaded + fileLoadedBytes) / totalSize);
                });
            } catch (err) {
                console.error("读取失败:", file.name, err);
            }
        } else {
            // PDF 模式：不需要读取内容，但为了 UI 不会瞬间闪烁（例如 0->100%），
            // 尤其是在文件很小的时候，给一个极短的缓冲
            updateProgressBar(globalLoaded / totalSize);
            await new Promise(r => setTimeout(r, 20));
        }

        // 添加到列表 (这部分是同步的，很快)
        addFileToList(file, thumbUrl);

        // 完成当前文件，更新全局累加器
        globalLoaded += file.size;
        updateProgressBar(globalLoaded / totalSize);

        // 给 UI 线程喘息机会，防止界面卡死
        await new Promise(r => requestAnimationFrame(r));
    }

    // 4. 完成处理
    progressStatus.innerText = '导入完成';
    updateProgressBar(1); // 确保满格

    setTimeout(() => {
        progressContainer.style.display = 'none';
        progressFill.style.width = '0%'; // 重置
        updateUI();
    }, 600);
}

// 辅助函数：更新进度条 UI
function updateProgressBar(percentage) {
    const pct = Math.min(100, Math.round(percentage * 100));
    progressFill.style.width = `${pct}%`;
    progressText.innerText = `${pct}%`;
}

// 辅助函数：带进度的文件读取
function readFileWithProgress(file, onProgress) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onprogress = (e) => {
            if (e.lengthComputable && onProgress) {
                onProgress(e.loaded);
            }
        };

        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);

        reader.readAsDataURL(file);
    });
}

// 修改后的 addFileToList：不再负责读取文件，直接接收 thumbUrl
function addFileToList(file, thumbUrl) {
    const id = 'f_' + Math.random().toString(36).substr(2, 9);
    const isImage = file.type.startsWith('image/');
    let settings = isImage ? { scale: 0.8, align: 'cc' } : null;

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

// --- Signature Logic ---
let isDrawing = false;

function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = 200;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
}

function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX || e.touches[0].clientX) - rect.left;
    const y = (e.clientY || e.touches[0].clientY) - rect.top;
    return { x, y };
}

canvas.addEventListener('mousedown', (e) => { isDrawing = true; ctx.beginPath(); const p = getPos(e); ctx.moveTo(p.x, p.y); });
canvas.addEventListener('mousemove', (e) => { if(!isDrawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
canvas.addEventListener('mouseup', () => { isDrawing = false; });
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); isDrawing = true; ctx.beginPath(); const p = getPos(e); ctx.moveTo(p.x, p.y); });
canvas.addEventListener('touchmove', (e) => { e.preventDefault(); if(!isDrawing) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
canvas.addEventListener('touchend', () => { isDrawing = false; });

btnOpenSig.addEventListener('click', () => {
    sigModal.style.display = 'flex';
    requestAnimationFrame(resizeCanvas);
});

window.closeSigModal = () => sigModal.style.display = 'none';
window.clearCanvas = () => ctx.clearRect(0, 0, canvas.width, canvas.height);
window.saveSignature = () => {
    signatureData = canvas.toDataURL('image/png');
    sigPreviewImg.src = signatureData;
    sigConfig.classList.add('active');
    btnOpenSig.innerText = '修改签名';
    closeSigModal();
}
window.removeSignature = () => {
    signatureData = null;
    sigConfig.classList.remove('active');
    btnOpenSig.innerText = '+ 创建签名';
}
window.setSigAlign = (align, btn) => {
    sigSettings.align = align;
    const parent = btn.parentElement;
    parent.querySelectorAll('.align-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

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

        if(sigImageEmbed) {
            const pages = outputDoc.getPages();
            const scope = document.getElementById('sig-scope').value;
            const scalePercent = document.getElementById('sig-scale').value / 100;

            const sigDims = sigImageEmbed.scale(1);
            const targetWidth = A4_WIDTH * scalePercent;
            const ratio = targetWidth / sigDims.width;
            const w = targetWidth;
            const h = sigDims.height * ratio;

            const { x, y } = calcPos(sigSettings.align, w, h);

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
                    pages[idx].drawImage(sigImageEmbed, { x, y, width: w, height: h });
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