let map; // Biến toàn cục để lưu trữ đối tượng bản đồ Leaflet
let marker; // Biến toàn cục để lưu trữ đối tượng marker trên bản đồ

// Hàm này được gọi khi DOM đã tải xong để khởi tạo bản đồ và lấy dữ liệu IP
async function initMap() {
    console.log("Đang khởi tạo bản đồ và tìm vị trí IP...");

    try {
        // Gửi yêu cầu đến API backend của chúng ta để lấy thông tin vị trí IP
        const response = await fetch('/api/get-ip-location');
        const data = await response.json(); // Phân tích phản hồi JSON

        // Kiểm tra nếu có lỗi từ backend
        if (data.error) {
            console.error("Lỗi khi định vị IP:", data.error);
            // Hiển thị thông báo lỗi trên khu vực bản đồ
            document.getElementById('map').innerHTML = `<p class="error-message">${data.error}</p>`;
            // Cập nhật thông tin hiển thị với "N/A"
            updateLocationInfo(data.ip || 'N/A', 'N/A', 'N/A', 'N/A');
            return; // Dừng hàm nếu có lỗi
        }

        // Leaflet sử dụng định dạng tọa độ [vĩ độ, kinh độ]
        const userLocation = [data.latitude, data.longitude];

        // Khởi tạo bản đồ nếu chưa có
        if (!map) {
            // Tạo một đối tượng bản đồ Leaflet và gán vào div có id="map"
            // setView(tọa độ, mức_zoom) đặt vị trí ban đầu và độ phóng to
            map = L.map('map').setView(userLocation, 12);

            // Thêm lớp bản đồ OpenStreetMap (các ô bản đồ)
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                // Thuộc tính bản quyền, rất quan trọng khi sử dụng OpenStreetMap
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map); // Thêm lớp bản đồ vào đối tượng bản đồ
        } else {
            // Nếu bản đồ đã tồn tại, chỉ cần di chuyển bản đồ đến vị trí mới
            map.setView(userLocation, 12);
        }

        // Tạo hoặc cập nhật marker trên bản đồ
        if (marker) {
            // Nếu marker đã tồn tại, cập nhật vị trí của nó
            marker.setLatLng(userLocation);
        } else {
            // Nếu chưa có marker, tạo một marker mới và thêm vào bản đồ
            marker = L.marker(userLocation).addTo(map);
        }

        // Gắn một popup vào marker để hiển thị thông tin khi click hoặc mặc định mở
        marker.bindPopup(`
            <div class="info-window-content">
                <h3>Vị trí IP</h3>
                <p><strong>IP:</strong> ${data.ip}</p>
                <p><strong>Thành phố:</strong> ${data.city || 'N/A'}</p>
                <p><strong>Vùng:</strong> ${data.region || 'N/A'}</p>
                <p><strong>Quốc gia:</strong> ${data.country || 'N/A'}</p>
                <p><strong>Kinh độ:</strong> ${data.longitude.toFixed(4)}</p>
                <p><strong>Vĩ độ:</strong> ${data.latitude.toFixed(4)}</p>
            </div>
        `).openPopup(); // Mở popup ngay lập tức sau khi tạo

        // Cập nhật thông tin vị trí vào các thẻ span bên dưới bản đồ
        updateLocationInfo(data.ip, data.city, data.region, data.country);

    } catch (error) {
        // Xử lý lỗi nếu có vấn đề khi fetch dữ liệu hoặc khởi tạo bản đồ
        console.error("Lỗi khi tải dữ liệu vị trí hoặc khởi tạo bản đồ:", error);
        document.getElementById('map').innerHTML = '<p class="error-message">Đã xảy ra lỗi khi tải bản đồ hoặc định vị IP. Vui lòng kiểm tra kết nối.</p>';
        updateLocationInfo('N/A', 'N/A', 'N/A', 'N/A');
    }
}

// Hàm trợ giúp để cập nhật các thẻ span hiển thị thông tin vị trí
function updateLocationInfo(ip, city, region, country) {
    document.getElementById('display-ip').innerText = ip;
    document.getElementById('display-city').innerText = city;
    document.getElementById('display-region').innerText = region;
    document.getElementById('display-country').innerText = country;
}

// Lắng nghe sự kiện DOMContentLoaded để đảm bảo HTML đã được tải đầy đủ trước khi chạy script
document.addEventListener('DOMContentLoaded', initMap);
