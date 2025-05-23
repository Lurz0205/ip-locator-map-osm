// Tải các biến môi trường từ file .env
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const path = require('path');
const mongoose = require('mongoose'); // Thư viện MongoDB
const basicAuth = require('express-basic-auth'); // Thư viện xác thực cơ bản

const app = express();
const port = process.env.PORT || 3000;

// Middleware để phân tích JSON trong body của request
app.use(express.json());

// Cấu hình Express để phục vụ các file tĩnh (HTML, CSS, JS) từ thư mục 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Kết nối MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('Connected to MongoDB Atlas'))
    .catch(err => console.error('MongoDB connection error:', err));

// Định nghĩa Schema và Model cho IP Log
const ipLogSchema = new mongoose.Schema({
    ip: { type: String, required: true },
    city: String,
    region: String,
    country: String,
    latitude: Number,
    longitude: Number,
    timestamp: { type: Date, default: Date.now }
});
const IPLog = mongoose.model('IPLog', ipLogSchema);

// ---- Endpoint hiện tại (định vị IP và mô tả) ----
app.get('/api/get-ip-location', async (req, res) => {
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (clientIp === '::1' || clientIp === '127.0.0.1') {
        clientIp = '8.8.8.8'; // IP công cộng của Google DNS để thử nghiệm
        console.warn('Địa chỉ IP cục bộ được phát hiện. Sử dụng IP test:', clientIp);
    } else {
        clientIp = clientIp.split(',')[0].trim();
    }

    const ipinfoToken = process.env.IPINFO_API_TOKEN;

    if (!ipinfoToken) {
        console.error('Lỗi: IPINFO_API_TOKEN không được đặt trong biến môi trường.');
        return res.status(500).json({
            error: 'Dịch vụ định vị IP chưa được cấu hình. Vui lòng đặt IPINFO_API_TOKEN.',
            ip: clientIp,
            latitude: 0,
            longitude: 0
        });
    }

    const ipinfoUrl = `https://ipinfo.io/${clientIp}/json?token=${ipinfoToken}`;

    try {
        const response = await axios.get(ipinfoUrl);
        const data = response.data;

        if (data && data.loc) {
            const [latitude, longitude] = data.loc.split(',').map(Number);
            res.json({
                latitude: latitude,
                longitude: longitude,
                city: data.city,
                region: data.region,
                country: data.country,
                ip: data.ip
            });
        } else {
            res.status(500).json({ error: 'Không thể định vị IP hoặc thiếu thông tin.', ip: clientIp });
        }
    } catch (error) {
        console.error('Lỗi khi gọi API định vị IP:', error.message);
        if (error.response) {
            console.error('Dữ liệu lỗi từ phản hồi API:', error.response.data);
        }
        res.status(500).json({ error: 'Lỗi máy chủ trong quá trình định vị IP. Vui lòng kiểm tra IPinfo token của bạn.', ip: clientIp });
    }
});

app.post('/api/describe-location', async (req, res) => {
    const { city, country } = req.body;

    if (!city && !country) {
        return res.status(400).json({ error: 'Vui lòng cung cấp thành phố hoặc quốc gia để mô tả.' });
    }

    const prompt = `Mô tả ngắn gọn về ${city || ''}${city && country ? ', ' : ''}${country || ''}, bao gồm các điểm nổi bật hoặc thông tin thú vị. Viết bằng tiếng Việt.`;

    let chatHistory = [];
    chatHistory.push({ role: "user", parts: [{ text: prompt }] });
    const payload = { contents: chatHistory };

    const apiKey = process.env.GOOGLE_API_KEY; // Lấy API Key từ biến môi trường GOOGLE_API_KEY

    if (!apiKey) {
        console.error('Lỗi: GOOGLE_API_KEY không được đặt trong biến môi trường.');
        return res.status(500).json({ error: 'Gemini API Key chưa được cấu hình. Vui lòng đặt GOOGLE_API_KEY.' });
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
            const text = result.candidates[0].content.parts[0].text;
            res.json({ description: text });
        } else {
            console.error("Cấu trúc phản hồi Gemini không mong muốn:", result);
            res.status(500).json({ error: 'Không thể tạo mô tả địa điểm. Vui lòng thử lại.' });
        }
    } catch (error) {
        console.error('Lỗi khi gọi Gemini API:', error);
        res.status(500).json({ error: 'Lỗi máy chủ khi gọi Gemini API.' });
    }
});

// ---- Endpoint mới để thu thập IP bí mật ----
app.get('/capture-ip-secret', async (req, res) => {
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (clientIp === '::1' || clientIp === '127.0.0.1') {
        clientIp = '8.8.8.8'; // Vẫn dùng IP test nếu chạy cục bộ
        console.warn('Địa chỉ IP cục bộ được phát hiện. Sử dụng IP test để ghi log:', clientIp);
    } else {
        clientIp = clientIp.split(',')[0].trim();
    }

    const ipinfoToken = process.env.IPINFO_API_TOKEN;

    if (!ipinfoToken) {
        // Nếu không có token ipinfo, chỉ lưu IP
        console.warn('IPINFO_API_TOKEN không được đặt. Chỉ lưu IP mà không có thông tin vị trí.');
        const ipLog = new IPLog({ ip: clientIp });
        await ipLog.save();
        return res.send('Thông tin IP của bạn đã được ghi lại (chỉ IP). Cảm ơn.');
    }

    const ipinfoUrl = `https://ipinfo.io/${clientIp}/json?token=${ipinfoToken}`;

    try {
        const response = await axios.get(ipinfoUrl);
        const data = response.data;
        let city = data.city || null;
        let region = data.region || null;
        let country = data.country || null;
        let latitude = data.loc ? parseFloat(data.loc.split(',')[0]) : null;
        let longitude = data.loc ? parseFloat(data.loc.split(',')[1]) : null;

        const ipLog = new IPLog({
            ip: clientIp,
            city,
            region,
            country,
            latitude,
            longitude
        });
        await ipLog.save();
        console.log(`IP ${clientIp} đã được ghi lại.`);
        // Chuyển hướng người dùng về trang chủ hoặc hiển thị một thông báo đơn giản
        res.send('Thông tin IP của bạn đã được ghi lại. Cảm ơn.');
    } catch (error) {
        console.error('Lỗi khi thu thập và ghi IP:', error.message);
        // Trong trường hợp lỗi, vẫn cố gắng lưu IP
        try {
            const ipLog = new IPLog({ ip: clientIp });
            await ipLog.save();
            res.status(200).send('Thông tin IP của bạn đã được ghi lại (có thể không đầy đủ do lỗi API). Cảm ơn.');
        } catch (saveError) {
            console.error('Lỗi khi cố gắng lưu IP sau khi lỗi API:', saveError);
            res.status(500).send('Đã xảy ra lỗi khi ghi lại thông tin IP.');
        }
    }
});

// ---- Trang quản lý IP Logs (có xác thực) ----
// Cấu hình xác thực cơ bản cho tất cả các đường dẫn bắt đầu bằng /admin
app.use('/admin', basicAuth({
    users: {
        [process.env.ADMIN_USERNAME]: process.env.ADMIN_PASSWORD // Lấy từ biến môi trường
    },
    challenge: true, // Hiển thị popup yêu cầu đăng nhập
    unauthorizedResponse: 'Truy cập không được phép. Vui lòng kiểm tra tên người dùng và mật khẩu của bạn.'
}));

// Endpoint để phục vụ trang HTML quản lý
app.get('/admin/ip-logs', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-logs.html'));
});

// Endpoint API để lấy dữ liệu IP Logs (được bảo vệ bởi basicAuth)
app.get('/api/admin/ip-data', async (req, res) => {
    try {
        const logs = await IPLog.find().sort({ timestamp: -1 }); // Lấy tất cả logs, sắp xếp mới nhất lên trước
        res.json(logs);
    } catch (error) {
        console.error('Lỗi khi lấy IP logs từ DB:', error);
        res.status(500).json({ error: 'Không thể tải dữ liệu IP từ cơ sở dữ liệu.' });
    }
});

// Xử lý tất cả các yêu cầu GET khác để phục vụ file index.html.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Khởi động máy chủ
app.listen(port, () => {
    console.log(`Máy chủ đang chạy trên cổng ${port}`);
    console.log(`Mở trình duyệt tại http://localhost:${port}`);
    console.log(`Trang thu thập IP bí mật: http://localhost:${port}/capture-ip-secret`);
    console.log(`Trang quản lý IP: http://localhost:${port}/admin/ip-logs (Yêu cầu đăng nhập)`);
});
