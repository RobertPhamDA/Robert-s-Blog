const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path'); // Thêm thư viện path để xử lý đường dẫn

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    cors: { origin: "*" } 
});

// --- CẤU HÌNH DATABASE LINH HOẠT ---
// Nếu có biến DATABASE_URL (trên Render), nó sẽ dùng cái đó.
// Nếu không có, nó sẽ dùng thông tin localhost của bạn.
const isProduction = process.env.NODE_ENV === 'production';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:123456@localhost:5432/postgres';

const pool = new Pool({
    connectionString: connectionString,
    // Supabase trên Cloud yêu cầu SSL, nhưng Local thì không cần
    ssl: isProduction ? { rejectUnauthorized: false } : false
});

app.use(cors());
app.use(express.json());

// Sử dụng path.join để dù chạy trên Linux hay Windows đều không lỗi
app.use(express.static(path.join(__dirname, 'public')));

const SECRET = process.env.JWT_SECRET || "mysecretkey";

// --- API ĐĂNG KÝ / ĐĂNG NHẬP ---
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const hashed = await bcrypt.hash(password, 10);
    try {
        await pool.query('INSERT INTO users (username, password) VALUES ($1, $2)', [username, hashed]);
        res.json({ message: "Đăng ký xong!" });
    } catch (e) { 
        console.error(e);
        res.status(400).send("Lỗi đăng ký"); 
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const user = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (user.rows[0] && await bcrypt.compare(password, user.rows[0].password)) {
            const token = jwt.sign({ user: username }, SECRET);
            res.json({ token });
        } else { 
            res.status(401).send("Sai tài khoản!"); 
        }
    } catch (e) {
        res.status(500).send("Lỗi server");
    }
});

// --- API BÀI VIẾT ---
app.get('/posts', async (req, res) => {
    const posts = await pool.query('SELECT * FROM posts ORDER BY id DESC');
    res.json(posts.rows);
});

app.post('/posts', async (req, res) => {
    const { title, content } = req.body;
    const result = await pool.query('INSERT INTO posts (title, content) VALUES ($1, $2) RETURNING *', [title, content]);
    io.emit('new_post', result.rows[0]);
    res.json(result.rows[0]);
});

// --- API COMMENT ---
app.get('/comments/:postId', async (req, res) => {
    const result = await pool.query('SELECT * FROM comments WHERE post_id = $1', [req.params.postId]);
    res.json(result.rows);
});

app.post('/comments', async (req, res) => {
    const { post_id, content } = req.body;
    const result = await pool.query('INSERT INTO comments (post_id, content) VALUES ($1, $2) RETURNING *', [post_id, content]);
    io.emit('new_comment', result.rows[0]);
    res.json(result.rows[0]);
});

// Mặc định trả về index.html cho mọi route không xác định
app.get('/(.*)', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Render sẽ cấp một cổng (PORT) ngẫu nhiên, Local thì dùng 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    if(!isProduction) console.log(`Local test: http://localhost:${PORT}`);
});