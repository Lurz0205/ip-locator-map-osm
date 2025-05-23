// Tải các biến môi trường từ file .env
require('dotenv').config();

const express = require('express');
const axios = require('axios');
const path = require('path');
const mongoose = require('mongoose');
const basicAuth = require('express-basic-auth'); // Middleware xác thực cơ bản

const app = express();
const port = process.env.PORT || 3000;

// === DÒNG LOG GLOBAL (Chạy cho MỌI yêu cầu) ===
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] Request received: ${req.method} ${req.url}`);
    next();
});
// ======================================

// Middleware để phân tích JSON trong body của request (cần cho API Gemini)
app.use(express.json());

// === CẤU HÌNH PHỤC VỤ FILE TĨNH (HTML, CSS, JS) ===
// Express sẽ tự động tìm các file tĩnh trong thư mục 'public'.
// Đặt nó ở đây để ưu tiên xử lý các yêu cầu cho tài nguyên tĩnh.
app.use(express.static(path.join(__dirname, 'public')));
// ===============================================

// Kết nối MongoDB Atlas
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('Connected to MongoDB Atlas successfully.');

        // Khởi động máy chủ Express CHỈ KHI kết nối MongoDB thành công
        app.listen(port, () => {
            console.log(`Máy chủ đang chạy trên cổng ${port}`);
            console.log(`Mở trình duyệt tại http://localhost:${port}`);
            console.log(`Trang quản lý IP: http://localhost:${port}/admin (Yêu cầu đăng nhập)`);
        });
    })
    .catch(err => {
        console.error('MongoDB connection error. App will not start:', err);
        process.exit(1); // Thoát ứng dụng nếu không kết nối được DB
    });

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

// === Endpoint để ghi IP vào logs (được gọi bởi frontend khi trang chính tải) ===
app.post('/api/log-my-ip', async (req, res) => {
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (clientIp === '::1' || clientIp === '127.0.0.1') {
        clientIp = '8.8.8.8'; // Sử dụng IP Google DNS để thử nghiệm
        console.warn('Địa chỉ IP cục bộ được phát hiện. Sử dụng IP test để ghi log:', clientIp);
    } else {
        clientIp = clientIp.split(',')[0].trim();
    }

    const ipinfoToken = process.env.IPINFO_API_TOKEN;

    // Lấy dữ liệu vị trí và cờ isPrecise từ body request
    const { latitude, longitude, city, region, country, isPrecise, ip: ipFromFrontend } = req.body;

    // Kiểm tra xem IP này đã được ghi trong 24 giờ gần nhất chưa để tránh ghi trùng lặp quá nhiều
    // Sử dụng IP thật của client để kiểm tra trùng lặp, không phải "N/A"
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    try {
        const existingLog = await IPLog.findOne({ ip: clientIp, timestamp: { $gte: twentyFourHoursAgo } });

        if (!existingLog) { // Chỉ ghi log nếu chưa có trong 24h qua
            let newLogData = {};

            if (isPrecise && ipFromFrontend === "N/A" && typeof latitude === 'number' && typeof longitude === 'number' && !isNaN(latitude) && !isNaN(longitude)) {
                // Nếu frontend gửi vị trí chính xác và IP là "N/A", lưu nó như vậy
                newLogData.ip = "N/A (Chính xác từ trình duyệt)"; // Ghi rõ hơn trong DB
                newLogData.latitude = latitude;
                newLogData.longitude = longitude;
                newLogData.city = city || 'Chưa xác định (chính xác)';
                newLogData.region = region || 'Chưa xác định (chính xác)';
                newLogData.country = country || 'Chưa xác định (chính xác)';
                console.log(`Vị trí chính xác từ trình duyệt đã được ghi lại.`);
            } else {
                // Nếu không phải vị trí chính xác, hoặc frontend không gửi IP "N/A",
                // thì dùng IP thực của client và định vị bằng IPinfo
                newLogData.ip = clientIp; // Sử dụng IP thật
                if (!ipinfoToken) {
                    console.warn('IPINFO_API_TOKEN không được đặt. Chỉ lưu IP mà không có thông tin vị trí.');
                } else {
                    const ipinfoUrl = `https://ipinfo.io/${clientIp}/json?token=${ipinfoToken}`;
                    try {
                        const response = await axios.get(ipinfoUrl);
                        const data = response.data;
                        newLogData.city = data.city || null;
                        newLogData.region = data.region || null;
                        newLogData.country = data.country || null;
                        newLogData.latitude = data.loc ? parseFloat(data.loc.split(',')[0]) : null;
                        newLogData.longitude = data.loc ? parseFloat(data.loc.split(',')[1]) : null;
                        console.log(`IP ${clientIp} đã được ghi lại với vị trí từ IPinfo.`);
                    } catch (error) {
                        console.error('Lỗi khi thu thập và ghi IP (từ /api/log-my-ip với IPinfo):', error.message);
                        console.log(`IP ${clientIp} đã được ghi lại (có thể không đầy đủ do lỗi API).`);
                    }
                }
            }

            const ipLog = new IPLog(newLogData);
            await ipLog.save();

        } else {
            console.log(`IP ${clientIp} đã được ghi trong 24 giờ qua. Bỏ qua ghi log.`);
        }
        res.status(200).json({ message: 'IP logged successfully.' });
    } catch (dbError) {
        console.error('Lỗi khi kiểm tra hoặc lưu IP vào database (từ /api/log-my-ip):', dbError);
        res.status(500).json({ error: 'Failed to log IP.' });
    }
});
// ====================================================================================

// ---- Endpoint API để frontend lấy thông tin vị trí IP (KHÔNG GHI LOG NỮA) ----
app.get('/api/get-ip-location', async (req, res) => {
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (clientIp === '::1' || clientIp === '127.0.0.1') {
        clientIp = '8.8.8.8'; // Sử dụng IP Google DNS để thử nghiệm
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
            latitude: 0, // Giá trị mặc định
            longitude: 0 // Giá trị mặc định
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
        res.status(500).json({ error: 'Lỗi máy chủ trong quá trình định vị IP. Vui lòng kiểm tra IPinfo token của bạn hoặc API.', ip: clientIp });
    }
});

// ---- Endpoint API để frontend yêu cầu mô tả địa điểm từ Gemini ----
app.post('/api/describe-location', async (req, res) => {
    const { city, country } = req.body; // Lấy thành phố và quốc gia từ body request

    if (!city && !country) {
        return res.status(400).json({ error: 'Vui lòng cung cấp thành phố hoặc quốc gia để mô tả.' });
    }

    const prompt = `Mô tả ngắn gọn về ${city || ''}${city && country ? ', ' : ''}${country || ''}, bao gồm các điểm nổi bật hoặc thông tin thú vị. Viết bằng tiếng Việt.`;

    let chatHistory = [];
    chatHistory.push({ role: "user", parts: [{ text: prompt }] });
    const payload = { contents: chatHistory };

    const apiKey = process.env.GOOGLE_API_KEY;

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
            res.status(500).json({ error: 'Không thể tạo mô tả địa điểm. Phản hồi Gemini không hợp lệ.' });
        }
    } catch (error) {
        console.error('Lỗi khi gọi Gemini API:', error);
        res.status(500).json({ error: 'Lỗi máy chủ khi gọi Gemini API.' });
    }
});

// ---- Trang quản lý IP Logs (có xác thực) ----
// Middleware basicAuth chỉ áp dụng cho route /admin và các sub-route của nó
app.use('/admin', basicAuth({
    users: {
        [process.env.ADMIN_USERNAME]: process.env.ADMIN_PASSWORD
    },
    challenge: true, // Hiển thị popup đăng nhập
    unauthorizedResponse: 'Truy cập không được phép. Vui lòng kiểm tra tên người dùng và mật khẩu của bạn.'
}));

// Endpoint để phục vụ trang HTML quản lý
app.get('/admin', (req, res) => { // Đã sửa từ /admin/ip-logs thành /admin
    console.log('--- Yêu cầu đã nhận trên route /admin, phục vụ admin.html ---');
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
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

// Endpoint để xóa tất cả IP Logs (được bảo vệ bởi basicAuth)
app.delete('/api/admin/ip-data', async (req, res) => {
    try {
        const result = await IPLog.deleteMany({}); // Xóa tất cả các bản ghi
        console.log(`Đã xóa ${result.deletedCount} IP logs.`);
        res.json({ message: `Đã xóa thành công ${result.deletedCount} IP logs.` });
    } catch (error) {
        console.error('Lỗi khi xóa IP logs:', error);
        res.status(500).json({ error: 'Không thể xóa IP logs từ cơ sở dữ liệu.' });
    }
});

// === ROUTE CATCH-ALL CUỐI CÙNG ===
// Điều này sẽ xử lý các yêu cầu không khớp với bất kỳ file tĩnh nào
// hoặc route API/admin nào ở trên. Thường dùng cho các ứng dụng SPA
// để trả về trang chính nếu đường dẫn không tìm thấy.
app.get('*', (req, res) => {
    console.log(`[${new Date().toISOString()}] Catch-all route activated for: ${req.url}`);
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
