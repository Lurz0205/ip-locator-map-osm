// Tải các biến môi trường từ file .env
require('dotenv').config();

const express = require('express');
const axios = require('axios'); // Thư viện để gửi yêu cầu HTTP
const path = require('path'); // Thư viện để làm việc với đường dẫn file

const app = express();
// Sử dụng port từ biến môi trường (do Render.com cung cấp) hoặc mặc định là 3000
const port = process.env.PORT || 3000;

// Middleware để phân tích JSON trong body của request
app.use(express.json());

// Cấu hình Express để phục vụ các file tĩnh (HTML, CSS, JS) từ thư mục 'public'
app.use(express.static(path.join(__dirname, 'public')));

// Định nghĩa một endpoint API để frontend có thể gọi để lấy thông tin vị trí IP
app.get('/api/get-ip-location', async (req, res) => {
    // Lấy địa chỉ IP của người truy cập từ request headers.
    // 'x-forwarded-for' thường được sử dụng khi có proxy (như Render.com, Cloudflare).
    // Nếu không có, dùng 'req.socket.remoteAddress'.
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // Trong môi trường phát triển cục bộ (localhost), IP có thể là '::1' hoặc '127.0.0.1'.
    // Để kiểm tra chức năng định vị IP, chúng ta sẽ sử dụng một IP công cộng mẫu (Google DNS).
    if (clientIp === '::1' || clientIp === '127.0.0.1') {
        clientIp = '8.8.8.8'; // IP công cộng của Google DNS để thử nghiệm
        console.warn('Địa chỉ IP cục bộ được phát hiện. Sử dụng IP test:', clientIp);
    } else {
        // Nếu 'x-forwarded-for' chứa nhiều IP (ví dụ: 'IP1, IP2, IP3'), lấy IP đầu tiên.
        clientIp = clientIp.split(',')[0].trim();
    }

    // Lấy API Token của ipinfo.io từ biến môi trường
    const ipinfoToken = process.env.IPINFO_API_TOKEN;

    // Kiểm tra xem API Token đã được cấu hình chưa
    if (!ipinfoToken) {
        console.error('Lỗi: IPINFO_API_TOKEN không được đặt trong biến môi trường.');
        // Trả về lỗi cho frontend, nhưng vẫn cung cấp IP của người dùng để debug
        return res.status(500).json({
            error: 'Dịch vụ định vị IP chưa được cấu hình. Vui lòng đặt IPINFO_API_TOKEN.',
            ip: clientIp,
            latitude: 0, // Giá trị mặc định
            longitude: 0 // Giá trị mặc định
        });
    }

    // Xây dựng URL cho API của ipinfo.io
    const ipinfoUrl = `https://ipinfo.io/${clientIp}/json?token=${ipinfoToken}`;

    try {
        // Gửi yêu cầu GET đến API của ipinfo.io
        const response = await axios.get(ipinfoUrl);
        const data = response.data; // Dữ liệu phản hồi từ API

        // Kiểm tra xem dữ liệu có hợp lệ và có chứa tọa độ không
        if (data && data.loc) {
            // Tách chuỗi tọa độ "latitude,longitude" thành hai số
            const [latitude, longitude] = data.loc.split(',').map(Number);
            // Trả về thông tin vị trí dưới dạng JSON cho frontend
            res.json({
                latitude: latitude,
                longitude: longitude,
                city: data.city,
                region: data.region,
                country: data.country,
                ip: data.ip
            });
        } else {
            // Nếu không thể định vị IP hoặc thiếu thông tin
            res.status(500).json({ error: 'Không thể định vị IP hoặc thiếu thông tin.', ip: clientIp });
        }
    } catch (error) {
        // Xử lý lỗi nếu có vấn đề khi gọi API ipinfo.io
        console.error('Lỗi khi gọi API định vị IP:', error.message);
        if (error.response) {
            console.error('Dữ liệu lỗi từ phản hồi API:', error.response.data);
        }
        res.status(500).json({ error: 'Lỗi máy chủ trong quá trình định vị IP. Vui lòng kiểm tra IPinfo token của bạn.', ip: clientIp });
    }
});

// Endpoint mới để mô tả địa điểm bằng Gemini API
app.post('/api/describe-location', async (req, res) => {
    const { city, country } = req.body; // Lấy thành phố và quốc gia từ body request

    if (!city && !country) {
        return res.status(400).json({ error: 'Vui lòng cung cấp thành phố hoặc quốc gia để mô tả.' });
    }

    // Xây dựng prompt cho LLM
    const prompt = `Mô tả ngắn gọn về ${city || ''}${city && country ? ', ' : ''}${country || ''}, bao gồm các điểm nổi bật hoặc thông tin thú vị. Viết bằng tiếng Việt.`;

    // Cấu hình gọi Gemini API
    let chatHistory = [];
    chatHistory.push({ role: "user", parts: [{ text: prompt }] });
    const payload = { contents: chatHistory };
    const apiKey = process.env.GOOGLE_API_KEY; // Đọc API Key từ biến môi trường
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();

        // Kiểm tra và trích xuất văn bản từ phản hồi của Gemini API
        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
            const text = result.candidates[0].content.parts[0].text;
            res.json({ description: text }); // Trả về mô tả cho frontend
        } else {
            console.error("Cấu trúc phản hồi Gemini không mong muốn:", result);
            res.status(500).json({ error: 'Không thể tạo mô tả địa điểm. Vui lòng thử lại.' });
        }
    } catch (error) {
        console.error('Lỗi khi gọi Gemini API:', error);
        res.status(500).json({ error: 'Lỗi máy chủ khi gọi Gemini API.' });
    }
});

// Xử lý tất cả các yêu cầu GET khác để phục vụ file index.html.
// Điều này quan trọng cho các ứng dụng Single Page Application (SPA) hoặc khi làm việc với Render.com.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Khởi động máy chủ và lắng nghe các yêu cầu trên cổng đã định
app.listen(port, () => {
    console.log(`Máy chủ đang chạy trên cổng ${port}`);
    console.log(`Mở trình duyệt tại http://localhost:${port}`);
    // Đối với Repl.it hoặc Render.com, URL sẽ là URL công khai của dịch vụ
});
