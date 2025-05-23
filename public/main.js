let map; // Biến toàn cục để lưu trữ đối tượng bản đồ Leaflet
let marker; // Biến toàn cục để lưu trữ đối tượng marker trên bản đồ

// Hàm này được gọi khi DOM đã tải xong để khởi tạo bản đồ và lấy dữ liệu IP
async function initMap() {
    console.log("Đang khởi tạo bản đồ và tìm vị trí...");

    let locationData = {};
    let isPrecise = false; // Biến cờ để đánh dấu vị trí có chính xác cao không
    const urlParams = new URLSearchParams(window.location.search);

    // Xử lý trường hợp URL có tham số (từ trang admin)
    if (urlParams.has('lat') && urlParams.has('lon')) {
        locationData.latitude = parseFloat(urlParams.get('lat'));
        locationData.longitude = parseFloat(urlParams.get('lon'));
        locationData.ip = urlParams.get('ip') || 'N/A';
        locationData.city = urlParams.get('city') || 'N/A';
        locationData.region = 'N/A'; // Region không được truyền từ admin
        locationData.country = urlParams.get('country') || 'N/A';
        isPrecise = (locationData.ip === 'N/A'); // Đánh dấu là chính xác nếu IP là N/A từ admin
        console.log(`Hiển thị vị trí từ URL: IP=${locationData.ip}, Lat=${locationData.latitude}, Lon=${locationData.longitude}`);
        window.history.replaceState({}, document.title, window.location.pathname); // Xóa params
    } else {
        // --- Logic mới: Yêu cầu quyền định vị ngay từ đầu ---
        if (navigator.geolocation) {
            try {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, {
                        enableHighAccuracy: true,
                        timeout: 5000,
                        maximumAge: 0
                    });
                });
                // Người dùng đã cho phép định vị
                locationData.latitude = position.coords.latitude;
                locationData.longitude = position.coords.longitude;
                locationData.ip = "N/A"; // Đánh dấu IP là N/A vì đây là vị trí chính xác
                isPrecise = true;
                console.log(`Vị trí chính xác từ trình duyệt (đã cho phép): Lat=${locationData.latitude}, Lon=${locationData.longitude}`);

                // Reverse Geocoding để lấy tên địa điểm từ tọa độ
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
                // Người dùng không cho phép định vị hoặc có lỗi
                console.warn("Không thể lấy vị trí chính xác từ trình duyệt:", error.message);
                console.log("Fallback: Lấy vị trí từ IP.");
                locationData = await getIpLocationFallback();
                isPrecise = false;
            }
        } else {
            // Trình duyệt không hỗ trợ Geolocation API
            console.warn("Trình duyệt không hỗ trợ Geolocation API. Lấy vị trí từ IP.");
            locationData = await getIpLocationFallback();
            isPrecise = false;
        }
    }

    // Hàm riêng để xử lý việc định vị IP làm fallback
    async function getIpLocationFallback() {
        try {
            const response = await fetch('/api/get-ip-location');
            const data = await response.json();
            if (data.error) {
                console.error("Lỗi khi định vị IP fallback:", data.error);
                document.getElementById('map').innerHTML = `<p class="error-message">${data.error}</p>`;
                updateLocationInfo(data.ip || 'N/A', 'N/A', 'N/A', 'N/A', false); // Truyền isPrecise là false
                throw new Error("Lỗi định vị IP fallback.");
            }
            return data; // Trả về dữ liệu fallback
        } catch (error) {
            console.error("Lỗi trong getIpLocationFallback:", error);
            document.getElementById('map').innerHTML = '<p class="error-message">Đã xảy ra lỗi khi tải bản đồ hoặc định vị IP. Vui lòng kiểm tra kết nối.</p>';
            updateLocationInfo('N/A', 'N/A', 'N/A', 'N/A', false); // Truyền isPrecise là false
            throw error;
        }
    }

    // Kiểm tra xem locationData có hợp lệ không trước khi sử dụng
    if (!locationData || typeof locationData.latitude !== 'number' || typeof locationData.longitude !== 'number' || isNaN(locationData.latitude) || isNaN(locationData.longitude)) {
        console.error("Không thể xác định vị trí hợp lệ.");
        document.getElementById('map').innerHTML = '<p class="error-message">Không thể xác định vị trí. Vui lòng thử lại.</p>';
        updateLocationInfo('N/A', 'N/A', 'N/A', 'N/A', false); // Truyền isPrecise là false
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
    updateLocationInfo(locationData.ip, locationData.city, locationData.region, locationData.country, isPrecise);

    // Ghi log sau khi đã có đầy đủ thông tin vị trí
    logUserIp(locationData.ip, locationData.latitude, locationData.longitude, locationData.city, locationData.region, locationData.country, isPrecise);
}

// Hàm trợ giúp để cập nhật các thẻ span hiển thị thông tin vị trí
// Thêm tham số isPrecise để điều chỉnh hiển thị IP
function updateLocationInfo(ip, city, region, country, isPrecise) {
    const displayIpElement = document.getElementById('display-ip');
    const ipLabelElement = displayIpElement.previousElementSibling; // Lấy thẻ strong "IP:"

    if (isPrecise) {
        displayIpElement.innerText = "Vị trí chính xác"; // Thay đổi nội dung hiển thị cho người dùng
        if (ipLabelElement && ipLabelElement.tagName === 'STRONG') {
             ipLabelElement.innerText = "Nguồn:"; // Thay đổi nhãn "IP:" thành "Nguồn:"
        }
    } else {
        displayIpElement.innerText = ip;
        if (ipLabelElement && ipLabelElement.tagName === 'STRONG') {
            ipLabelElement.innerText = "IP:"; // Đặt lại nhãn "IP:"
        }
    }

    document.getElementById('display-city').innerText = city;
    document.getElementById('display-region').innerText = region;
    document.getElementById('display-country').innerText = country;
}


// === MỚI: Hàm để gọi API ghi IP khi trang tải ===
// Hàm này giờ nhận thông tin từ initMap để đảm bảo dữ liệu nhất quán
async function logUserIp(ipToLog, lat, lon, city, region, country, isPreciseLocation) {
    let payload = {};

    // Nếu là vị trí chính xác từ trình duyệt (isPreciseLocation là true),
    // và IP là "N/A" (do frontend đã set), chúng ta sẽ gửi IP là "N/A" về backend
    // để backend biết đây là vị trí chính xác và không cần tìm IP thật.
    if (isPreciseLocation) {
        payload = {
            ip: "N/A", // Backend sẽ lưu là "N/A"
            latitude: lat,
            longitude: lon,
            city: city,
            region: region,
            country: country,
            isPrecise: true // Cờ để backend biết đây là vị trí chính xác từ trình duyệt
        };
        console.log('Đang gửi vị trí chính xác từ trình duyệt để ghi log:', payload);
    } else {
        // Nếu không phải vị trí chính xác, backend sẽ tự động lấy IP
        console.log('Không có vị trí chính xác từ trình duyệt. Backend sẽ tự ghi IP.');
        payload = {
            isPrecise: false // Cờ để backend biết nó cần tự tìm IP và định vị bằng IPinfo
        };
    }

    try {
        const response = await fetch('/api/log-my-ip', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Lỗi khi ghi IP:', errorText);
        } else {
            console.log('Yêu cầu ghi IP đã được gửi thành công.');
        }
    } catch (error) {
        console.error('Lỗi khi gọi API ghi IP:', error);
    }
}
// ===============================================

// Lắng nghe sự kiện DOMContentLoaded để đảm bảo HTML đã được tải đầy đủ trước khi chạy script
document.addEventListener('DOMContentLoaded', async () => {
    await initMap(); // initMap bây giờ sẽ xử lý cả việc yêu cầu vị trí và ghi log.

    const describeBtn = document.getElementById('describe-location-btn');
    if (describeBtn) {
        describeBtn.addEventListener('click', generateLocationDescription);
    }
});
