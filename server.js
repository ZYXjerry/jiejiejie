const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3100;

// ========== 强制所有 JSON 响应使用 UTF-8 编码 ==========
app.use(express.json());
app.use((req, res, next) => {
    // 拦截 res.json 方法
    const originalJson = res.json;
    res.json = function(data) {
        // 确保响应头包含 charset=utf-8
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        // 如果 data 是对象，确保其字符串化时不会丢失编码（但 JSON.stringify 默认就是 UTF-8）
        return originalJson.call(this, data);
    };
    next();
});

// 额外添加一个全局响应头设置（针对非 JSON 响应，如图片等，但不影响）
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
});
// ======================================================

// 确保 uploads 目录存在
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// 元数据文件路径
const dataFile = path.join(__dirname, 'data.json');

// 读取元数据
function readMediaData() {
    if (!fs.existsSync(dataFile)) return [];
    try {
        const raw = fs.readFileSync(dataFile, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        console.error('读取 data.json 失败', err);
        return [];
    }
}

// 写入元数据
function writeMediaData(data) {
    try {
        fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.error('写入 data.json 失败', err);
    }
}

const allowedMimeTypes = new Set([
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm', 'video/quicktime',
    'text/plain', 'text/csv', 'application/json',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/html',
    'application/xhtml+xml',
    'application/zip',
    'application/x-zip-compressed',
    'multipart/x-zip'
]);

const allowedExtensions = new Set([
    '.jpg', '.jpeg', '.png', '.gif', '.webp',
    '.mp4', '.webm', '.mov',
    '.txt', '.csv', '.json',
    '.pdf',
    '.doc', '.docx',
    '.xls', '.xlsx',
    '.ppt', '.pptx',
    '.html', '.htm', '.xhtml',
    '.zip'
]);

function getFileExtension(filename = '') {
    return path.extname(filename).toLowerCase();
}

function isHtmlFile(mimeType = '', extension = '') {
    return mimeType === 'text/html' || mimeType === 'application/xhtml+xml' || ['.html', '.htm', '.xhtml'].includes(extension);
}

function isZipFile(mimeType = '', extension = '') {
    return ['application/zip', 'application/x-zip-compressed', 'multipart/x-zip'].includes(mimeType) || extension === '.zip';
}

function detectFileType(file) {
    const mimeType = file.mimetype || '';
    const extension = getFileExtension(file.originalname || file.filename || '');

    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (isHtmlFile(mimeType, extension)) return 'html';
    if (mimeType === 'application/pdf' || extension === '.pdf') return 'pdf';
    if (['text/plain', 'text/csv', 'application/json'].includes(mimeType) || ['.txt', '.csv', '.json'].includes(extension)) return 'text';
    if (mimeType.includes('word') || mimeType.includes('document') || ['.doc', '.docx'].includes(extension)) return 'word';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet') || ['.xls', '.xlsx'].includes(extension)) return 'excel';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation') || ['.ppt', '.pptx'].includes(extension)) return 'powerpoint';
    if (isZipFile(mimeType, extension)) return 'zip';
    return 'other';
}

function isAllowedFile(file) {
    const extension = getFileExtension(file.originalname);
    return allowedMimeTypes.has(file.mimetype) || allowedExtensions.has(extension);
}

// 配置 multer 存储
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const uniqueName = `${uuidv4()}${ext}`;
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    if (isAllowedFile(file)) {
        cb(null, true);
    } else {
        cb(new Error('不支持的文件类型'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 500 * 1024 * 1024 }
});

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));

app.get('/uploads/:filename', (req, res) => {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(uploadsDir, filename);

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: '文件不存在' });
    }

    const mediaItem = readMediaData().find(item => item.filename === filename);
    const originalName = mediaItem?.originalName || filename;
    const type = mediaItem?.type || detectFileType({
        filename,
        originalname: originalName,
        mimetype: mediaItem?.mimeType || ''
    });

    if (type === 'html') {
        res.attachment(originalName);
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return fs.createReadStream(filePath).pipe(res);
    }

    if (type === 'zip') {
        res.attachment(originalName);
    }

    res.sendFile(filePath);
});

// 获取所有媒体列表
app.get('/api/media', (req, res) => {
    const mediaList = readMediaData();
    res.json(mediaList);
});

// 上传文件
app.post('/api/upload', upload.array('files', 20), (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: '未选择文件' });
        }

        const mediaList = readMediaData();
        const newItems = [];

        for (const file of req.files) {
            const mimeType = file.mimetype;
            const type = detectFileType(file);

            // 强制转换文件名编码
            const originalName = Buffer.from(file.originalname, 'binary').toString('utf8');

            const newItem = {
                id: uuidv4(),
                filename: file.filename,
                originalName: originalName,
                type: type,
                mimeType: mimeType,
                url: `/uploads/${file.filename}`,
                createdAt: new Date().toISOString()
            };
            mediaList.push(newItem);
            newItems.push(newItem);
        }

        writeMediaData(mediaList);
        res.json({ success: true, items: newItems });
    } catch (err) {
        console.error('上传失败', err);
        res.status(500).json({ error: '服务器错误' });
    }
});

app.use((err, req, res, next) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: '文件过大，单个文件不能超过 500MB' });
        }
        return res.status(400).json({ error: err.message || '上传失败' });
    }

    if (err.message === '不支持的文件类型') {
        return res.status(400).json({ error: '不支持的文件类型，当前支持图片、视频、文档、HTML、ZIP 等格式' });
    }

    console.error('请求处理失败', err);
    res.status(500).json({ error: '服务器错误' });
});


// 删除单个媒体
app.delete('/api/media/:id', (req, res) => {
    const { id } = req.params;
    let mediaList = readMediaData();
    const item = mediaList.find(m => m.id === id);
    if (!item) {
        return res.status(404).json({ error: '文件不存在' });
    }

    const filePath = path.join(uploadsDir, item.filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }

    mediaList = mediaList.filter(m => m.id !== id);
    writeMediaData(mediaList);
    res.json({ success: true });
});

// 清空所有媒体
app.delete('/api/media', (req, res) => {
    const mediaList = readMediaData();
    for (const item of mediaList) {
        const filePath = path.join(uploadsDir, item.filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
    writeMediaData([]);
    res.json({ success: true });
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`✨ 媒体画廊服务已启动`);
    console.log(`🌐 本地访问: http://localhost:${PORT}`);
});
