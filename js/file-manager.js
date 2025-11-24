async function handleFiles(files) {
    if (!files.length) return;

    // Editor Mode Handling
    if (currentMode === 'editor') {
        const file = files[0];
        if (!['image/jpeg', 'image/png'].includes(file.type)) {
            alert('仅支持 JPG/PNG 图片编辑');
            return;
        }
        loadEditorImage(file);
        return;
    }

    // Existing Logic for Merge/Image2PDF/Word2PDF
    const validFiles = Array.from(files).filter(file => {
        if (currentMode === 'merge') return file.type === 'application/pdf';
        if (currentMode === 'image') return ['image/jpeg', 'image/png'].includes(file.type);
        if (currentMode === 'word') return file.name.endsWith('.docx');
        if (currentMode === 'pdf2word') return file.type === 'application/pdf';
        return false;
    });

    if (validFiles.length === 0) return;

    // Capture PDF Metadata for the first PDF (for Preview Sizing)
    if ((currentMode === 'merge' || currentMode === 'pdf2word') && !activePdfMetadata) {
        try {
            const arrayBuffer = await validFiles[0].arrayBuffer();
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            const firstPage = pdfDoc.getPages()[0];
            const { width, height } = firstPage.getSize();
            const rotation = firstPage.getRotation().angle;
            activePdfMetadata = { width, height, rotation };
        } catch (e) {
            console.error("Failed to read PDF metadata", e);
        }
    }

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
    const iconHtml = isImage ? `<img src="${thumbUrl}">` :
        (file.name.endsWith('.docx') ? '<i class="fas fa-file-word" style="color:#2b579a; font-size:18px;"></i>' : '<i class="fas fa-file-pdf" style="color:#ff5252; font-size:18px;"></i>');

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
                <input type="range" min="10" max="100" value="${s.scale * 100}" oninput="updateScale('${id}', this.value)">
            </div>
            <div class="settings-row">
                <span class="settings-label">位置:</span>
                <div class="align-grid">
                    ${['tl', 'tc', 'tr', 'cl', 'cc', 'cr', 'bl', 'bc', 'br'].map(p =>
        `<div class="align-btn ${p} ${p === s.align ? 'active' : ''}" onclick="updateAlign('${id}','${p}',this)"></div>`
    ).join('')}
                </div>
            </div>
        </div>`;
}

window.removeFile = (id) => { filesMap.delete(id); document.querySelector(`li[data-id="${id}"]`).remove(); updateUI(); }
