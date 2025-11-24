// DOM Elements
const dropArea = document.getElementById('drop-area');
const dropText = document.getElementById('drop-text');
const fileInput = document.getElementById('file-input');
const fileListEl = document.getElementById('file-list');
const mergeBtn = document.getElementById('merge-btn');
const statusText = document.getElementById('status-text');
const mainSection = document.getElementById('main-section');
const editorSection = document.getElementById('editor-section');

// Progress DOM
const progressContainer = document.getElementById('upload-progress-container');
const progressFill = document.getElementById('upload-progress-fill');
const progressText = document.getElementById('upload-progress-text');
const progressStatus = document.getElementById('progress-status');

function switchMode(mode) {
    currentMode = mode;
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));

    // Update Tab Active State
    if (mode === 'merge') document.getElementById('tab-merge').classList.add('active');
    else if (mode === 'image') document.getElementById('tab-image').classList.add('active');
    else if (mode === 'word') document.getElementById('tab-word').classList.add('active');
    else if (mode === 'editor') document.getElementById('tab-editor').classList.add('active');

    // Toggle Sections
    if (mode === 'editor') {
        mainSection.style.display = 'none';
        editorSection.style.display = 'block';
        fileInput.accept = 'image/jpeg, image/png';
    } else {
        mainSection.style.display = 'block';
        editorSection.style.display = 'none';
        filesMap.clear();
        fileListEl.innerHTML = '';
        updateUI();

        if (mode === 'merge') {
            dropText.innerHTML = '点击或拖拽添加 <b>PDF 文件</b> 进行合并';
            fileInput.accept = 'application/pdf';
            document.getElementById('btn-text').innerText = '开始合并 PDF';
        } else if (mode === 'image') {
            dropText.innerHTML = '点击或拖拽添加 <b>图片 (JPG/PNG)</b> 生成 PDF';
            fileInput.accept = 'image/jpeg, image/png';
            document.getElementById('btn-text').innerText = '生成 PDF';
        } else if (mode === 'word') {
            dropText.innerHTML = '点击或拖拽添加 <b>Word 文件 (.docx)</b> 转 PDF';
            fileInput.accept = '.docx';
            document.getElementById('btn-text').innerText = '开始转换';
        }
    }
}

function updateUI() {
    mergeBtn.classList.toggle('active', filesMap.size > 0);
    if (filesMap.size === 0) {
        statusText.innerText = '准备就绪';
    } else {
        statusText.innerText = `已添加 ${filesMap.size} 个文件`;
    }
}

function updateProgressBar(percentage) {
    const pct = Math.min(100, Math.round(percentage * 100));
    progressFill.style.width = `${pct}%`;
    progressText.innerText = `${pct}%`;
}

function setLoading(v) {
    mergeBtn.disabled = v;
    document.getElementById('loader').style.display = v ? 'block' : 'none';
    if (!v) {
        document.getElementById('btn-text').innerText = currentMode === 'merge' ? '开始合并 PDF' :
            (currentMode === 'word' ? '开始转换' : '生成 PDF');
    } else {
        document.getElementById('btn-text').innerText = '处理中...';
    }
    mergeBtn.style.opacity = v ? 0.7 : 1;
}

// Global UI Helpers
window.toggleSettings = (id, btn) => { document.getElementById(`set-${id}`).classList.toggle('show'); btn.style.color = document.getElementById(`set-${id}`).classList.contains('show') ? 'var(--accent)' : ''; }
window.updateScale = (id, v) => filesMap.get(id).settings.scale = v / 100;
window.updateAlign = (id, a, btn) => {
    filesMap.get(id).settings.align = a;
    btn.parentElement.querySelectorAll('.align-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

// Expose to window for HTML onclick access
window.switchMode = switchMode;
