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

// 扩展允许的文件类型
const allowedMimeTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm', 'video/quicktime',
    'text/plain', 'text/csv', 'application/json',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
];

const fileFilter = (req, file, cb) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('不支持的文件类型'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 100 * 1024 * 1024 }
});

// 静态文件服务
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

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
            let type = 'other';
            if (mimeType.startsWith('image/')) type = 'image';
            else if (mimeType.startsWith('video/')) type = 'video';
            else if (mimeType === 'application/pdf') type = 'pdf';
            else if (mimeType === 'text/plain' || mimeType === 'text/csv' || mimeType === 'application/json') type = 'text';
            else if (mimeType.includes('word') || mimeType.includes('document')) type = 'word';
            else if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) type = 'excel';
            else if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) type = 'powerpoint';
            else type = 'other';

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