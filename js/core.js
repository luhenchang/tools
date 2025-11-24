const { PDFDocument, PageSizes } = PDFLib;
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 20;

let filesMap = new Map();
let signatureData = null;
// 签名设置：改用百分比坐标 (相对于A4纸左下角)
let sigSettings = {
    xPercent: 0.7, // 默认靠右
    yPercent: 0.1, // 默认靠下
    width: 150     // 默认宽度点数
};
let currentMode = 'merge';
let activePdfMetadata = null;

// Global Editor State
let editorState = {
    originalUrl: null,
    currentUrl: null,
    hue: 0,
    sat: 100,
    cropper: null,
    isCropping: false
};
