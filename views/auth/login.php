<?php
/**
 * VIEW: auth/login.php
 * Màn hình Đăng nhập & Điều hướng Ca trực (Auth View)
 */

require_once __DIR__ . '/../../config/constants.php';
require_once __DIR__ . '/../../controllers/AuthController.php';

$authController = new AuthController();
$errorMsg = '';

// Nếu đã đăng nhập thì chuyển luôn sang Workspace
if (!empty($_SESSION['user_id'])) {
    header('Location: ' . BASE_URL . '/views/chat/workspace.php');
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = trim($_POST['username'] ?? '');
    $password = trim($_POST['password'] ?? '');

    $result = $authController->login($username, $password);
    if ($result['success']) {
        header('Location: ' . BASE_URL . '/views/chat/workspace.php');
        exit;
    } else {
        $errorMsg = $result['message'];
    }
}
?>
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Đăng nhập - Hệ thống Quản lý Hội thoại Đa kênh</title>
    <link rel="stylesheet" href="../../public/css/style.css">
    <style>
        body {
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #0F172A 0%, #1E1B4B 100%);
            min-height: 100vh;
        }
        .login-card {
            background: #FFFFFF;
            width: 420px;
            max-width: 90vw;
            border-radius: var(--radius-lg);
            padding: 36px 32px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.3);
            text-align: center;
        }
        .login-logo {
            width: 56px;
            height: 56px;
            background: linear-gradient(135deg, #6366F1, #4F46E5);
            border-radius: 16px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-size: 28px;
            margin-bottom: 16px;
            box-shadow: 0 8px 16px rgba(79, 70, 229, 0.3);
        }
        .login-title {
            font-size: 20px;
            font-weight: 700;
            color: #0F172A;
            margin-bottom: 6px;
        }
        .login-subtitle {
            font-size: 13px;
            color: #64748B;
            margin-bottom: 24px;
        }
        .alert-error {
            background: #FEE2E2;
            border: 1px solid #FCA5A5;
            color: #991B1B;
            padding: 10px 14px;
            border-radius: var(--radius-sm);
            font-size: 13px;
            margin-bottom: 18px;
            text-align: left;
        }
        .form-group-login {
            margin-bottom: 16px;
            text-align: left;
        }
        .form-group-login label {
            display: block;
            font-size: 12.5px;
            font-weight: 600;
            color: #334155;
            margin-bottom: 6px;
        }
        .login-input {
            width: 100%;
            padding: 11px 14px;
            border: 1px solid #CBD5E1;
            border-radius: var(--radius-sm);
            font-size: 14px;
            outline: none;
            transition: all 0.2s;
        }
        .login-input:focus {
            border-color: #4F46E5;
            box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
        }
        .btn-submit-login {
            width: 100%;
            padding: 12px;
            background: #4F46E5;
            color: white;
            border: none;
            border-radius: var(--radius-sm);
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            margin-top: 8px;
        }
        .btn-submit-login:hover {
            background: #4338CA;
            box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);
        }
        .demo-accounts-box {
            margin-top: 24px;
            padding-top: 20px;
            border-top: 1px dashed #E2E8F0;
            text-align: left;
        }
        .demo-title {
            font-size: 11.5px;
            font-weight: 700;
            text-transform: uppercase;
            color: #94A3B8;
            letter-spacing: 0.5px;
            margin-bottom: 10px;
        }
        .demo-btn-row {
            display: flex;
            gap: 10px;
        }
        .quick-login-chip {
            flex: 1;
            padding: 8px 10px;
            background: #F1F5F9;
            border: 1px solid #E2E8F0;
            border-radius: var(--radius-sm);
            cursor: pointer;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 0.2s;
        }
        .quick-login-chip:hover {
            background: #EEF2FF;
            border-color: #C7D2FE;
            color: #4F46E5;
        }
    </style>
</head>
<body>

<div class="login-card">
    <div class="login-logo">💬</div>
    <h2 class="login-title">Hệ thống Hội thoại Đa kênh</h2>
    <p class="login-subtitle">Omnichannel CRM Chat Workspace v1.0</p>

    <?php if (!empty($errorMsg)): ?>
        <div class="alert-error">
            ⚠️ <?= htmlspecialchars($errorMsg) ?>
        </div>
    <?php endif; ?>

    <form method="POST" action="">
        <div class="form-group-login">
            <label for="username">Tên tài khoản</label>
            <input type="text" id="username" name="username" class="login-input" placeholder="nv1 hoặc nv2" required autofocus>
        </div>

        <div class="form-group-login">
            <label for="password">Mật khẩu</label>
            <input type="password" id="password" name="password" class="login-input" placeholder="Mặc định: 123456" required>
        </div>

        <button type="submit" class="btn-submit-login">Đăng nhập vào Ca trực ➔</button>
    </form>

    <div class="demo-accounts-box">
        <div class="demo-title">💡 Chọn nhanh tài khoản Demo thuyết trình:</div>
        <div class="demo-btn-row">
            <button type="button" class="quick-login-chip" onclick="fillAccount('nv1', '123456')">
                <span>👨‍💼</span>
                <strong>NV1: Quân</strong>
            </button>
            <button type="button" class="quick-login-chip" onclick="fillAccount('nv2', '123456')">
                <span>👩‍💼</span>
                <strong>NV2: Phương</strong>
            </button>
        </div>
    </div>
</div>

<script>
function fillAccount(u, p) {
    document.getElementById('username').value = u;
    document.getElementById('password').value = p;
    document.querySelector('form').submit();
}
</script>

</body>
</html>
