// Hàm để tải và hiển thị dữ liệu IP logs
async function loadIpLogs() {
    const tableBody = document.querySelector('#ip-logs-table tbody');
    const loadingMessage = document.getElementById('loading-message');

    loadingMessage.style.display = 'block'; // Hiển thị thông báo tải
    tableBody.innerHTML = ''; // Xóa nội dung cũ

    try {
        const response = await fetch('/api/admin/ip-data'); // Gọi API để lấy dữ liệu
        if (!response.ok) {
            // Xử lý lỗi nếu xác thực không thành công hoặc lỗi server
            const errorText = await response.text();
            throw new Error(`Lỗi khi tải dữ liệu: ${response.status} ${response.statusText} - ${errorText}`);
        }
        const logs = await response.json(); // Phân tích JSON

        loadingMessage.style.display = 'none'; // Ẩn thông báo tải

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
}

// Hàm để xóa tất cả IP logs
async function clearAllIpLogs() {
    // Hiển thị hộp thoại xác nhận tùy chỉnh
    const confirmBox = document.createElement('div');
    confirmBox.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: white;
        padding: 20px;
        border: 1px solid #ccc;
        box-shadow: 0 0 10px rgba(0,0,0,0.2);
        z-index: 1000;
        text-align: center;
        border-radius: 8px;
    `;
    confirmBox.innerHTML = `
        <p>Bạn có chắc chắn muốn xóa tất cả IP logs không?</p>
        <button id="confirm-yes" style="background-color: #28a745; color: white; padding: 10px 15px; border: none; border-radius: 5px; cursor: pointer; margin-right: 10px;">Có</button>
        <button id="confirm-no" style="background-color: #dc3545; color: white; padding: 10px 15px; border: none; border-radius: 5px; cursor: pointer;">Không</button>
    `;
    document.body.appendChild(confirmBox);

    return new Promise(resolve => {
        document.getElementById('confirm-yes').onclick = () => {
            document.body.removeChild(confirmBox);
            resolve(true);
        };
        document.getElementById('confirm-no').onclick = () => {
            document.body.removeChild(confirmBox);
            resolve(false);
        };
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    // Tải IP logs khi trang được tải
    await loadIpLogs();

    const clearButton = document.getElementById('clear-all-logs-btn');
    if (clearButton) {
        clearButton.addEventListener('click', async () => {
            const confirmed = await clearAllIpLogs(); // Gọi hàm xác nhận tùy chỉnh

            if (confirmed) {
                try {
                    const response = await fetch('/api/admin/ip-data', {
                        method: 'DELETE', // Sử dụng phương thức DELETE
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        throw new Error(`Lỗi khi xóa logs: ${response.status} ${response.statusText} - ${errorText}`);
                    }

                    const result = await response.json();
                    alert(result.message); // Hiển thị thông báo thành công (có thể thay bằng modal tùy chỉnh)
                    await loadIpLogs(); // Tải lại danh sách sau khi xóa
                } catch (error) {
                    console.error('Lỗi khi xóa IP logs:', error);
                    alert(`Không thể xóa logs: ${error.message}`); // Hiển thị lỗi (có thể thay bằng modal tùy chỉnh)
                }
            }
        });
    }
});
