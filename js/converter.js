// --- Generate PDF Logic ---

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

function downloadBlob(data, name, type) { const b = new Blob([data], { type }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => URL.revokeObjectURL(u), 100); }

mergeBtn.addEventListener('click', async () => {
    if (filesMap.size === 0) return;
    setLoading(true);

    try {
        // Word to PDF Logic
        if (currentMode === 'word') {
            const listItems = fileListEl.querySelectorAll('.list-item-wrapper');
            // We process files one by one for Word
            for (const item of listItems) {
                const id = item.getAttribute('data-id');
                const data = filesMap.get(id);

                // Convert .docx to HTML using Mammoth
                const arrayBuffer = await data.file.arrayBuffer();
                const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
                const html = result.value; // The generated HTML

                // Create a temporary container for HTML2PDF
                const element = document.createElement('div');
                element.innerHTML = `
                    <style>
                        body { 
                            font-family: 'Microsoft YaHei', 'SimHei', Arial, sans-serif; 
                            padding: 40px; 
                            line-height: 1.6; 
                            color: #000000 !important; /* 强制纯黑 */
                            -webkit-font-smoothing: antialiased;
                        }
                        p { margin-bottom: 12px; text-align: justify; }
                        h1, h2, h3, h4, h5, h6 { color: #000000 !important; font-weight: bold; margin-top: 20px; margin-bottom: 10px; }
                        table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
                        td, th { border: 1px solid #333; padding: 8px; }
                        img { max-width: 100%; height: auto; display: block; margin: 10px 0; }
                    </style>
                    ${html}
                `;

                // Use HTML2PDF to generate PDF Buffer (High Quality)
                const opt = {
                    margin: [10, 10, 10, 10],
                    filename: data.file.name.replace('.docx', '.pdf'),
                    image: { type: 'jpeg', quality: 1.0 },
                    html2canvas: {
                        scale: 4,
                        useCORS: true,
                        letterRendering: true,
                        scrollY: 0
                    },
                    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
                };

                // Get PDF as ArrayBuffer
                const pdfBuffer = await html2pdf().set(opt).from(element).output('arraybuffer');

                // Load into PDFLib
                const pdfDoc = await PDFDocument.load(pdfBuffer);

                // Apply Signature
                await applySignatureToPdf(pdfDoc);

                // Save and Download
                const pdfBytes = await pdfDoc.save();
                downloadBlob(pdfBytes, data.file.name.replace('.docx', '.pdf'), 'application/pdf');
            }

            setLoading(false);
            return;
        }

        // Merge / Image to PDF Logic
        const outputDoc = await PDFDocument.create();
        const listItems = fileListEl.querySelectorAll('.list-item-wrapper');

        // 2. 处理所有文件 (合并/图片转PDF)
        for (const item of listItems) {
            const id = item.getAttribute('data-id');
            const data = filesMap.get(id);
            const arrayBuffer = await data.file.arrayBuffer();

            if (data.type === 'pdf') {
                const srcPdf = await PDFDocument.load(arrayBuffer);
                const copiedPages = await outputDoc.copyPages(srcPdf, srcPdf.getPageIndices());
                copiedPages.forEach(page => outputDoc.addPage(page));
            } else {
                // 图片模式：创建 A4 页面
                let img;
                if (data.file.type.includes('png')) img = await outputDoc.embedPng(arrayBuffer);
                else img = await outputDoc.embedJpg(arrayBuffer);

                const page = outputDoc.addPage([A4_WIDTH, A4_HEIGHT]);

                // 图片排版逻辑
                const { scale, align } = data.settings;
                const dims = img.scale(1);
                const maxW = A4_WIDTH - MARGIN * 2;
                const maxH = A4_HEIGHT - MARGIN * 2;
                const baseScale = Math.min(maxW / dims.width, maxH / dims.height);
                const finalScale = baseScale * scale;
                const w = dims.width * finalScale;
                const h = dims.height * finalScale;

                const { x, y } = calcPos(align, w, h);
                page.drawImage(img, { x, y, width: w, height: h });
            }
        }

        // 3. 应用签名
        await applySignatureToPdf(outputDoc);

        const pdfBytes = await outputDoc.save();
        const fileName = currentMode === 'merge' ? 'merged.pdf' : 'images.pdf';
        downloadBlob(pdfBytes, fileName, 'application/pdf');

    } catch (e) {
        console.error(e);
        alert("生成失败: " + e.message);
    } finally {
        setLoading(false);
    }
});
