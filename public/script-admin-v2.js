document.addEventListener('DOMContentLoaded', async () => {
    const tableBody = document.querySelector('#ip-logs-table tbody');
    const loadingMessage = document.getElementById('loading-message');

    loadingMessage.style.display = 'block'; // Hiển thị thông báo tải

    try {
        const response = await fetch('/api/admin/ip-data'); // Gọi API để lấy dữ liệu
        if (!response.ok) {
            // Xử lý lỗi nếu xác thực không thành công hoặc lỗi server
            const errorText = await response.text();
            throw new Error(`Lỗi khi tải dữ liệu: ${response.status} ${response.statusText} - ${errorText}`);
        }
        const logs = await response.json(); // Phân tích JSON

        loadingMessage.style.display = 'none'; // Ẩn thông báo tải
        tableBody.innerHTML = ''; // Xóa nội dung cũ (nếu có)

        if (logs.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="8">Chưa có IP nào được ghi lại.</td></tr>';
            return;
        }

        let counter = 1;
        logs.forEach(log => {
            const row = tableBody.insertRow();
            row.insertCell().textContent = counter++;
            row.insertCell().textContent = log.ip || 'N/A';
            row.insertCell().textContent = log.city || 'N/A';
            row.insertCell().textContent = log.region || 'N/A';
            row.insertCell().textContent = log.country || 'N/A';
            row.insertCell().textContent = log.latitude ? log.latitude.toFixed(4) : 'N/A';
            row.insertCell().textContent = log.longitude ? log.longitude.toFixed(4) : 'N/A';
            row.insertCell().textContent = new Date(log.timestamp).toLocaleString('vi-VN'); // Định dạng ngày giờ
        });

    } catch (error) {
        console.error('Lỗi khi tải IP logs:', error);
        loadingMessage.textContent = `Lỗi: ${error.message}. Vui lòng kiểm tra lại đăng nhập hoặc logs server.`;
        loadingMessage.style.color = 'red';
    }
});
