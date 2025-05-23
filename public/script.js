let map;
let marker;

async function initMap() {
    console.log("Đang khởi tạo bản đồ và tìm vị trí IP...");

    try {
        const response = await fetch('/api/get-ip-location');
        const data = await response.json();

        if (data.error) {
            console.error("Lỗi khi định vị IP:", data.error);
            document.getElementById('map').innerHTML = `<p class="error-message">${data.error}</p>`;
            updateLocationInfo(data.ip || 'N/A', 'N/A', 'N/A', 'N/A');
            return;
        }

        const userLocation = [data.latitude, data.longitude];

        if (!map) {
            map = L.map('map').setView(userLocation, 12);

            // --- DÒNG CẦN THAY ĐỔI ĐỂ SỬ DỤNG ESRI WORLD STREET MAP ---
            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
                attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012'
            }).addTo(map);

        } else {
            map.setView(userLocation, 12);
        }

        if (marker) {
            marker.setLatLng(userLocation);
        } else {
            marker = L.marker(userLocation).addTo(map);
        }

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
        `).openPopup();

        updateLocationInfo(data.ip, data.city, data.region, data.country);

    } catch (error) {
        console.error("Lỗi khi tải dữ liệu vị trí hoặc khởi tạo bản đồ:", error);
        document.getElementById('map').innerHTML = '<p class="error-message">Đã xảy ra lỗi khi tải bản đồ hoặc định vị IP. Vui lòng kiểm tra kết nối.</p>';
        updateLocationInfo('N/A', 'N/A', 'N/A', 'N/A');
    }
}

// ... (các hàm updateLocationInfo, generateLocationDescription và DOMContentLoaded không thay đổi)
function updateLocationInfo(ip, city, region, country) {
    document.getElementById('display-ip').innerText = ip;
    document.getElementById('display-city').innerText = city;
    document.getElementById('display-region').innerText = region;
    document.getElementById('display-country').innerText = country;
}

async function generateLocationDescription() {
    const describeBtn = document.getElementById('describe-location-btn');
    const descriptionBox = document.getElementById('location-description');
    const city = document.getElementById('display-city').innerText;
    const country = document.getElementById('display-country').innerText;

    if (city === 'Đang tải...' || country === 'Đang tải...') {
        descriptionBox.innerHTML = '<p class="error-message">Vui lòng đợi thông tin vị trí được tải xong.</p>';
        return;
    }

    descriptionBox.innerHTML = '<p>Đang tạo mô tả... ✨</p>';
    describeBtn.disabled = true;

    try {
        const response = await fetch('/api/describe-location', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ city, country })
        });
        const data = await response.json();

        if (data.error) {
            descriptionBox.innerHTML = `<p class="error-message">Lỗi: ${data.error}</p>`;
        } else {
            const htmlDescription = marked.parse(data.description);
            descriptionBox.innerHTML = htmlDescription;
        }
    } catch (error) {
        console.error("Lỗi khi tạo mô tả địa điểm:", error);
        descriptionBox.innerHTML = '<p class="error-message">Đã xảy ra lỗi khi tạo mô tả. Vui lòng thử lại.</p>';
    } finally {
        describeBtn.disabled = false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initMap();

    const describeBtn = document.getElementById('describe-location-btn');
    if (describeBtn) {
        describeBtn.addEventListener('click', generateLocationDescription);
    }
});
