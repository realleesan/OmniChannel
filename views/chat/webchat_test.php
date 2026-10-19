<?php
/**
 * VIEW: chat/webchat_test.php
 * Trang Web Bán Hàng Mô Phỏng (E-commerce Store Demo)
 * Nhúng trực tiếp Widget Webchat để kiểm thử trải nghiệm của khách hàng thật
 */

require_once __DIR__ . '/../../config/constants.php';
require_once __DIR__ . '/../../models/Product.php';

$productModel = new Product();
$products = $productModel->getAll();
?>
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Minh Trang Boutique - Thời Trang Nữ Cao Cấp</title>
    <link rel="stylesheet" href="../../public/css/style.css">
    <style>
        body {
            background: #F8FAFC;
            overflow-y: auto;
            height: auto;
            font-family: 'Plus Jakarta Sans', sans-serif;
        }
        .store-navbar {
            background: #FFFFFF;
            border-bottom: 1px solid #E2E8F0;
            padding: 16px 40px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: sticky;
            top: 0;
            z-index: 10;
        }
        .store-brand {
            font-size: 20px;
            font-weight: 800;
            color: #0F172A;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .store-hero {
            background: linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%);
            padding: 60px 40px;
            text-align: center;
            border-bottom: 1px solid #E2E8F0;
        }
        .store-hero h1 {
            font-size: 32px;
            font-weight: 800;
            color: #1E1B4B;
            margin-bottom: 12px;
        }
        .store-hero p {
            color: #475569;
            font-size: 16px;
            max-width: 600px;
            margin: 0 auto;
        }
        .product-catalog {
            max-width: 1100px;
            margin: 40px auto;
            padding: 0 20px;
        }
        .catalog-title {
            font-size: 22px;
            font-weight: 700;
            margin-bottom: 24px;
            color: #0F172A;
        }
        .products-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 24px;
        }
        .product-card {
            background: #FFFFFF;
            border: 1px solid #E2E8F0;
            border-radius: var(--radius-md);
            overflow: hidden;
            box-shadow: var(--shadow-sm);
            transition: all 0.3s;
        }
        .product-card:hover {
            transform: translateY(-4px);
            box-shadow: var(--shadow-md);
        }
        .product-img-box {
            height: 220px;
            background: #F1F5F9;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 54px;
            color: #94A3B8;
        }
        .product-info {
            padding: 20px;
        }
        .product-code-tag {
            font-size: 11px;
            font-weight: 700;
            color: #4F46E5;
            background: #EEF2FF;
            padding: 3px 8px;
            border-radius: 4px;
            display: inline-block;
            margin-bottom: 8px;
        }
        .product-title {
            font-size: 16px;
            font-weight: 700;
            color: #0F172A;
            margin-bottom: 8px;
        }
        .product-price {
            font-size: 18px;
            font-weight: 800;
            color: #EF4444;
            margin-bottom: 14px;
        }
        .btn-ask-chat {
            width: 100%;
            padding: 10px;
            background: #10B981;
            color: white;
            border: none;
            border-radius: var(--radius-sm);
            font-weight: 600;
            font-size: 13px;
            cursor: pointer;
            transition: background 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }
        .btn-ask-chat:hover {
            background: #059669;
        }
    </style>
</head>
<body>

<header class="store-navbar">
    <div class="store-brand">
        <span>👗</span> Minh Trang Boutique
    </div>
    <div>
        <a href="workspace.php" class="header-link-btn" style="background:#4F46E5;color:white;border:none;">
            ← Vào Trang Quản Trị Nhân Viên (Workspace)
        </a>
    </div>
</header>

<section class="store-hero">
    <h1>Bộ Sưu Tập Thời Trang Thu Đông 2026</h1>
    <p>Chuyên cung cấp các mẫu váy dạ tweed, áo blazer thiết kế form chuẩn thời thượng, bảo hành đường may trọn đời.</p>
</section>

<main class="product-catalog">
    <h2 class="catalog-title">Sản Phẩm Đang Bán Chạy</h2>
    <div class="products-grid">
        <?php foreach ($products as $p): ?>
            <div class="product-card">
                <div class="product-img-box">
                    <?= $p['product_code'] === 'SP01' ? '👗' : ($p['product_code'] === 'SP02' ? '🧥' : '👚') ?>
                </div>
                <div class="product-info">
                    <span class="product-code-tag">MÃ: <?= htmlspecialchars($p['product_code']) ?></span>
                    <h3 class="product-title"><?= htmlspecialchars($p['name']) ?></h3>
                    <div class="product-price"><?= number_format($p['price'], 0, ',', '.') ?>đ</div>
                    <button type="button" class="btn-ask-chat" onclick="openChatAndAsk('<?= htmlspecialchars($p['name']) ?>', '<?= htmlspecialchars($p['product_code']) ?>')">
                        💬 Tư vấn mẫu này ngay
                    </button>
                </div>
            </div>
        <?php endforeach; ?>
    </div>
</main>

<!-- NHÚNG TRỰC TIẾP WIDGET WEBCHAT -->
<script src="../../public/widget/webchat.js"></script>

<script>
function openChatAndAsk(productName, productCode) {
    const toggleBtn = document.getElementById('wcToggleBtn');
    const windowEl = document.getElementById('wcWindow');
    const inputEl = document.getElementById('wcTextInput');
    
    if (windowEl && windowEl.style.display !== 'flex') {
        toggleBtn.click();
    }
    if (inputEl) {
        inputEl.value = `Shop ơi mẫu ${productName} (Mã: ${productCode}) còn size M không?`;
        inputEl.focus();
    }
}
</script>

</body>
</html>
