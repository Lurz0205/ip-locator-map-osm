let map;
let marker;

async function initMap() {
    console.log("Đang khởi tạo bản đồ và tìm vị trí...");

    let latitude, longitude, ip, city, region, country, isPrecise = false;
    const urlParams = new URLSearchParams(window.location.search);

    // 1. Ưu tiên vị trí từ URL (từ trang admin)
    if (urlParams.has('lat') && urlParams.has('lon')) {
        latitude = parseFloat(urlParams.get('lat'));
        longitude = parseFloat(urlParams.get('lon'));
        ip = urlParams.get('ip') || 'N/A';
        city = urlParams.get('city') || 'N/A';
        region = 'N/A'; // Region không được truyền từ admin
        country = urlParams.get('country') || 'N/A';
        isPrecise = false; // Vị trí này không phải từ Geolocation API của người dùng hiện tại
        console.log(`Hiển thị vị trí từ URL: IP=${ip}, Lat=${latitude}, Lon=${longitude}`);
        window.history.replaceState({}, document.title, window.location.pathname); // Xóa params
    }
    // 2. Thử lấy vị trí chính xác từ trình duyệt của người dùng hiện tại
    else if (navigator.geolocation) {
        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout: 5000,
                    maximumAge: 0
                });
            });
            latitude = position.coords.latitude;
            longitude = position.coords.longitude;
            ip = "Vị trí chính xác của bạn"; // Không có IP thực
            city = 'Đang xác định...'; // Có thể cần API đảo ngược geocoding
            region = '';
            country = '';
            isPrecise = true;
            console.log(`Vị trí chính xác từ trình duyệt: Lat=${latitude}, Lon=${longitude}`);

            // Cần một API Reverse Geocoding để chuyển đổi tọa độ thành tên địa điểm
            // Ví dụ sử dụng OpenStreetMap Nominatim (có giới hạn số lượng request)
            const osmReverseGeocodingUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`;
            const osmResponse = await fetch(osmReverseGeocodingUrl);
            const osmData = await osmResponse.json();

            if (osmData.address) {
                city = osmData.address.city || osmData.address.town || osmData.address.village || 'N/A';
                region = osmData.address.state || osmData.address.county || 'N/A';
                country = osmData.address.country || 'N/A';
                console.log(`Reverse Geocoding: City=${city}, Country=${country}`);
            }

        } catch (error) {
            console.warn("Không thể lấy vị trí chính xác từ trình duyệt:", error.message);
            // Fallback về định vị IP nếu người dùng từ chối hoặc có lỗi
            await getIpLocationFallback(); // Gọi hàm fallback
            latitude = fallbackData.latitude;
            longitude = fallbackData.longitude;
            ip = fallbackData.ip;
            city = fallbackData.city;
            region = fallbackData.region;
            country = fallbackData.country;
        }
    }
    // 3. Fallback về định vị IP nếu Geolocation API không khả dụng hoặc bị từ chối
    else {
        await getIpLocationFallback(); // Gọi hàm fallback
        latitude = fallbackData.latitude;
        longitude = fallbackData.longitude;
        ip = fallbackData.ip;
        city = fallbackData.city;
        region = fallbackData.region;
        country = fallbackData.country;
    }

    // Hàm riêng để xử lý việc định vị IP làm fallback
    async function getIpLocationFallback() {
        try {
            const response = await fetch('/api/get-ip-location');
            const data = await response.json();
            if (data.error) {
                console.error("Lỗi khi định vị IP fallback:", data.error);
                document.getElementById('map').innerHTML = `<p class="error-message">${data.error}</p>`;
                updateLocationInfo(data.ip || 'N/A', 'N/A', 'N/A', 'N/A');
                // Ném lỗi để dừng xử lý tiếp nếu có lỗi nghiêm trọng
                throw new Error("Lỗi định vị IP fallback.");
            }
            fallbackData = data; // Lưu dữ liệu fallback
        } catch (error) {
            console.error("Lỗi trong getIpLocationFallback:", error);
            document.getElementById('map').innerHTML = '<p class="error-message">Đã xảy ra lỗi khi tải bản đồ hoặc định vị IP. Vui lòng kiểm tra kết nối.</p>';
            updateLocationInfo('N/A', 'N/A', 'N/A', 'N/A');
            throw error; // Ném lại lỗi để dừng hàm initMap
        }
    }

    // Dữ liệu vị trí đã được xác định (từ URL, Geolocation API, hoặc IP fallback)
    const displayLocation = [latitude, longitude];

    if (!map) {
        map = L.map('map').setView(displayLocation, isPrecise ? 18 : 12); // Zoom gần hơn nếu vị trí chính xác
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
    } else {
        map.setView(displayLocation, isPrecise ? 18 : 12);
    }

    if (marker) {
        marker.setLatLng(displayLocation);
    } else {
        marker = L.marker(displayLocation).addTo(map);
    }

    marker.bindPopup(`
        <div class="info-window-content">
            <h3>${isPrecise ? 'Vị trí hiện tại của bạn' : 'Vị trí IP'}</h3>
            <p><strong>IP:</strong> ${ip}</p>
            <p><strong>Thành phố:</strong> ${city || 'N/A'}</p>
            <p><strong>Vùng:</strong> ${region || 'N/A'}</p>
            <p><strong>Quốc gia:</strong> ${country || 'N/A'}</p>
            <p><strong>Kinh độ:</strong> ${longitude.toFixed(4)}</p>
            <p><strong>Vĩ độ:</strong> ${latitude.toFixed(4)}</p>
            ${isPrecise ? '<p style="font-style: italic; color: green;">(Độ chính xác cao từ trình duyệt)</p>' : ''}
        </div>
    `).openPopup();

    updateLocationInfo(ip, city, region, country);
}

// ... các hàm khác (updateLocationInfo, generateLocationDescription) giữ nguyên ...

// Lắng nghe sự kiện DOMContentLoaded để đảm bảo HTML đã được tải đầy đủ trước khi chạy script
document.addEventListener('DOMContentLoaded', () => {
    initMap(); // Khởi tạo bản đồ khi DOM đã sẵn sàng

    const describeBtn = document.getElementById('describe-location-btn');
    if (describeBtn) {
        describeBtn.addEventListener('click', generateLocationDescription);
    }
});
