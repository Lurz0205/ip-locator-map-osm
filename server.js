// Tải các biến môi trường từ file .env
require('dotenv').config();

const express = require('express');
const axios = require('axios'); // Thư viện để gửi yêu cầu HTTP
const path = require('path'); // Thư viện để làm việc với đường dẫn file

const app = express();
// Sử dụng port từ biến môi trường (do Render.com cung cấp) hoặc mặc định là 3000
const port = process.env.PORT || 3000;

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
