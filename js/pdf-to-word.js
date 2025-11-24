
// --- PDF to Word Logic ---

// We need to ensure pdf.js worker is set
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

async function convertPdfToWord(file, signatureData, sigSettings, sigScope) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;

        const children = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const operatorList = await page.getOperatorList();

            // 1. Extract Text
            const items = [];

            // Process Text
            for (const item of textContent.items) {
                const y = Math.round(item.transform[5]); // Y coordinate
                items.push({
                    type: 'text',
                    y: y,
                    x: Math.round(item.transform[4]),
                    text: item.str,
                    height: item.height
                });
            }

            // 2. Extract Images
            const validImageOps = [
                pdfjsLib.OPS.paintImageXObject,
                pdfjsLib.OPS.paintInlineImageXObject
            ];

            for (let j = 0; j < operatorList.fnArray.length; j++) {
                const fn = operatorList.fnArray[j];
                if (validImageOps.includes(fn)) {
                    const args = operatorList.argsArray[j];
                    const imgName = args[0];

                    try {
                        let imgObj = await page.objs.get(imgName);
                        if (!imgObj && pdf.commonObjs) {
                            imgObj = await pdf.commonObjs.get(imgName);
                        }

                        if (imgObj) {
                            const width = imgObj.width;
                            const height = imgObj.height;
                            let imgData = imgObj.data;

                            const canvas = document.createElement('canvas');
                            canvas.width = width;
                            canvas.height = height;
                            const ctx = canvas.getContext('2d');

                            const imgDataArray = new Uint8ClampedArray(width * height * 4);

                            if (imgObj.kind === 2) { // RGB
                                let p = 0;
                                for (let k = 0; k < imgData.length; k += 3) {
                                    imgDataArray[p++] = imgData[k];
                                    imgDataArray[p++] = imgData[k + 1];
                                    imgDataArray[p++] = imgData[k + 2];
                                    imgDataArray[p++] = 255;
                                }
                            } else if (imgObj.kind === 1) { // Grayscale
                                let p = 0;
                                for (let k = 0; k < imgData.length; k++) {
                                    imgDataArray[p++] = imgData[k];
                                    imgDataArray[p++] = imgData[k];
                                    imgDataArray[p++] = imgData[k];
                                    imgDataArray[p++] = 255;
                                }
                            } else if (imgObj.kind === 3) { // RGBA
                                for (let k = 0; k < imgData.length; k++) {
                                    imgDataArray[k] = imgData[k];
                                }
                            }

                            if (imgDataArray.length > 0) {
                                const imageData = new ImageData(imgDataArray, width, height);
                                ctx.putImageData(imageData, 0, 0);
                                const dataUrl = canvas.toDataURL('image/png');
                                const blob = await (await fetch(dataUrl)).blob();

                                items.push({
                                    type: 'image',
                                    y: 0,
                                    blob: blob,
                                    width: width,
                                    height: height
                                });
                            }
                        }
                    } catch (err) {
                        console.warn("Failed to extract image", err);
                    }
                }
            }

            // 3. Sort and Build Document
            const lines = {};
            for (const item of items) {
                if (item.type === 'text') {
                    if (!lines[item.y]) lines[item.y] = [];
                    lines[item.y].push(item.text);
                }
            }

            const sortedYs = Object.keys(lines).sort((a, b) => b - a);

            for (const y of sortedYs) {
                const lineText = lines[y].join(' ');
                children.push(
                    new docx.Paragraph({
                        children: [new docx.TextRun(lineText)],
                    })
                );
            }

            // Append Images for this page
            const images = items.filter(i => i.type === 'image');
            for (const img of images) {
                children.push(
                    new docx.Paragraph({
                        children: [
                            new docx.ImageRun({
                                data: img.blob,
                                transformation: {
                                    width: Math.min(img.width, 500),
                                    height: Math.min(img.height, 500 * (img.height / img.width)),
                                },
                            }),
                        ],
                    })
                );
            }

            // 4. Insert Signature if applicable
            if (signatureData && sigSettings) {
                let shouldSign = false;
                if (sigScope === 'all') shouldSign = true;
                else if (sigScope === 'first' && i === 1) shouldSign = true;
                else if (sigScope === 'last' && i === pdf.numPages) shouldSign = true;

                if (shouldSign) {
                    // Convert signature dataURL to blob
                    const sigBlob = await (await fetch(signatureData)).blob();

                    // We will add the signature at the end of the page content
                    // Positioning is tricky, so we'll just append it.
                    // Ideally we would use floating, but docx js floating support is limited/complex.
                    // We'll try to respect the alignment roughly by using paragraph alignment or indentation if possible.
                    // But for now, let's just append it.

                    // Calculate width based on settings (pixels)
                    // sigSettings.width is in pixels (approx)

                    children.push(
                        new docx.Paragraph({
                            children: [
                                new docx.ImageRun({
                                    data: sigBlob,
                                    transformation: {
                                        width: sigSettings.width,
                                        height: sigSettings.width * 0.5, // Aspect ratio guess, or we need to load image to get it
                                    },
                                    floating: {
                                        horizontalPosition: {
                                            relative: docx.HorizontalPositionRelativeFrom.PAGE,
                                            offset: A4_WIDTH * sigSettings.xPercent * 12700, // Points to EMUs (1 pt = 12700 EMUs)
                                        },
                                        verticalPosition: {
                                            relative: docx.VerticalPositionRelativeFrom.PAGE,
                                            offset: A4_HEIGHT * (1 - sigSettings.yPercent) * 12700, // Points to EMUs
                                        },
                                        wrap: {
                                            type: docx.TextWrappingType.NONE, // In front of text
                                        }
                                    }
                                }),
                            ],
                        })
                    );
                }
            }

            // Add a page break after each page except the last one
            if (i < pdf.numPages) {
                children.push(new docx.Paragraph({
                    children: [new docx.PageBreak()],
                }));
            }
        }

        const doc = new docx.Document({
            sections: [{
                properties: {},
                children: children,
            }],
        });

        const blob = await docx.Packer.toBlob(doc);
        return blob;

    } catch (e) {
        console.error("PDF to Word conversion error:", e);
        throw new Error("Failed to convert PDF to Word: " + e.message);
    }
}

// Expose to window
window.convertPdfToWord = convertPdfToWord;
