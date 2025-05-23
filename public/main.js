let map;
let marker;

async function initMap() {
    console.log("Đang khởi tạo bản đồ và tìm vị trí...");

    let latitude, longitude, ip, city, region, country, isPrecise = false;
    const urlParams = new URLSearchParams(window.location.search);

    // Dữ liệu tạm thời để lưu kết quả từ các nguồn khác nhau
    let locationData = {};

    // 1. Ưu tiên vị trí từ URL (từ trang admin)
    if (urlParams.has('lat') && urlParams.has('lon')) {
        locationData.latitude = parseFloat(urlParams.get('lat'));
        locationData.longitude = parseFloat(urlParams.get('lon'));
        locationData.ip = urlParams.get('ip') || 'N/A';
        locationData.city = urlParams.get('city') || 'N/A';
        locationData.region = 'N/A'; // Region không được truyền từ admin
        locationData.country = urlParams.get('country') || 'N/A';
        isPrecise = false;
        console.log(`Hiển thị vị trí từ URL: IP=${locationData.ip}, Lat=${locationData.latitude}, Lon=${locationData.longitude}`);
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
            locationData.latitude = position.coords.latitude;
            locationData.longitude = position.coords.longitude;
            locationData.ip = "Vị trí chính xác (không phải IP)"; // Không có IP thực từ Geolocation API
            isPrecise = true;
            console.log(`Vị trí chính xác từ trình duyệt: Lat=${locationData.latitude}, Lon=${locationData.longitude}`);

            // Cần một API Reverse Geocoding để chuyển đổi tọa độ thành tên địa điểm
            const osmReverseGeocodingUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${locationData.latitude}&lon=${locationData.longitude}`;
            const osmResponse = await fetch(osmReverseGeocodingUrl);
            const osmData = await osmResponse.json();

            if (osmData.address) {
                locationData.city = osmData.address.city || osmData.address.town || osmData.address.village || 'N/A';
                locationData.region = osmData.address.state || osmData.address.county || 'N/A';
                locationData.country = osmData.address.country || 'N/A';
                console.log(`Reverse Geocoding: City=${locationData.city}, Country=${locationData.country}`);
            } else {
                locationData.city = 'Không xác định';
                locationData.region = 'Không xác định';
                locationData.country = 'Không xác định';
            }

        } catch (error) {
            console.warn("Không thể lấy vị trí chính xác từ trình duyệt:", error.message);
            // Fallback về định vị IP nếu người dùng từ chối hoặc có lỗi
            locationData = await getIpLocationFallback(); // Gọi hàm fallback và gán kết quả
            isPrecise = false; // Không còn chính xác cao nữa
        }
    }
    // 3. Fallback về định vị IP nếu Geolocation API không khả dụng hoặc bị từ chối
    else {
        locationData = await getIpLocationFallback(); // Gọi hàm fallback và gán kết quả
        isPrecise = false; // Không còn chính xác cao nữa
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
            return data; // Trả về dữ liệu fallback
        } catch (error) {
            console.error("Lỗi trong getIpLocationFallback:", error);
            document.getElementById('map').innerHTML = '<p class="error-message">Đã xảy ra lỗi khi tải bản đồ hoặc định vị IP. Vui lòng kiểm tra kết nối.</p>';
            updateLocationInfo('N/A', 'N/A', 'N/A', 'N/A');
            throw error; // Ném lại lỗi để dừng hàm initMap
        }
    }

    // Kiểm tra xem locationData có hợp lệ không trước khi sử dụng
    if (!locationData || typeof locationData.latitude !== 'number' || typeof locationData.longitude !== 'number') {
        console.error("Không thể xác định vị trí hợp lệ.");
        document.getElementById('map').innerHTML = '<p class="error-message">Không thể xác định vị trí. Vui lòng thử lại.</p>';
        updateLocationInfo('N/A', 'N/A', 'N/A', 'N/A');
        return;
    }

    const displayLocation = [locationData.latitude, locationData.longitude];

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
            <p><strong>IP:</strong> ${locationData.ip}</p>
            <p><strong>Thành phố:</strong> ${locationData.city || 'N/A'}</p>
            <p><strong>Vùng:</strong> ${locationData.region || 'N/A'}</p>
            <p><strong>Quốc gia:</strong> ${locationData.country || 'N/A'}</p>
            <p><strong>Kinh độ:</strong> ${locationData.longitude.toFixed(4)}</p>
            <p><strong>Vĩ độ:</strong> ${locationData.latitude.toFixed(4)}</p>
            ${isPrecise ? '<p style="font-style: italic; color: green;">(Độ chính xác cao từ trình duyệt)</p>' : ''}
        </div>
    `).openPopup();

    // Cập nhật thông tin hiển thị bên dưới bản đồ
    updateLocationInfo(locationData.ip, locationData.city, locationData.region, locationData.country);
}

// Hàm trợ giúp để cập nhật các thẻ span hiển thị thông tin vị trí
function updateLocationInfo(ip, city, region, country) {
    document.getElementById('display-ip').innerText = ip;
    document.getElementById('display-city').innerText = city;
    document.getElementById('display-region').innerText = region;
    document.getElementById('display-country').innerText = country;
}

// Hàm mới để gọi API Gemini và tạo mô tả địa điểm
async function generateLocationDescription() {
    const describeBtn = document.getElementById('describe-location-btn');
    const descriptionBox = document.getElementById('location-description');
    const city = document.getElementById('display-city').innerText;
    const country = document.getElementById('display-country').innerText;

    // Kiểm tra nếu thông tin vị trí chưa được tải hoặc là N/A
    if (city === 'Đang tải...' || country === 'Đang tải...' || city === 'N/A' || country === 'N/A' || city === 'Không xác định' || country === 'Không xác định') {
        descriptionBox.innerHTML = '<p class="error-message">Vui lòng đợi thông tin vị trí được tải xong hoặc cung cấp thành phố/quốc gia hợp lệ.</p>';
        return;
    }

    descriptionBox.innerHTML = '<p>Đang tạo mô tả... ✨</p>'; // Hiển thị trạng thái tải
    describeBtn.disabled = true; // Vô hiệu hóa nút trong khi đang xử lý

    try {
        const response = await fetch('/api/describe-location', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ city, country }) // Gửi thành phố và quốc gia đến backend
        });
        const data = await response.json();

        if (data.error) {
            descriptionBox.innerHTML = `<p class="error-message">Lỗi: ${data.error}</p>`;
        } else {
            // Chuyển đổi văn bản Markdown sang HTML bằng marked.js
            const htmlDescription = marked.parse(data.description);
            descriptionBox.innerHTML = htmlDescription; // Hiển thị mô tả đã chuyển đổi
        }
    } catch (error) {
        console.error("Lỗi khi tạo mô tả địa điểm:", error);
        descriptionBox.innerHTML = '<p class="error-message">Đã xảy ra lỗi khi tạo mô tả. Vui lòng thử lại.</p>';
    } finally {
        describeBtn.disabled = false; // Kích hoạt lại nút
    }
}

// Lắng nghe sự kiện DOMContentLoaded để đảm bảo HTML đã được tải đầy đủ trước khi chạy script
document.addEventListener('DOMContentLoaded', () => {
    initMap(); // Khởi tạo bản đồ khi DOM đã sẵn sàng

    const describeBtn = document.getElementById('describe-location-btn');
    if (describeBtn) {
        describeBtn.addEventListener('click', generateLocationDescription);
    }
});
