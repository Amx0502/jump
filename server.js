const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// MySQL 数据库配置
const dbConfig = {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'toor'
};

let pool = null;

// 初始化数据库连接和创建库表
async function initializeDatabase() {
    try {
        // 首先连接到 MySQL 服务器
        const connection = await mysql.createConnection({
            ...dbConfig,
            multipleStatements: true
        });
        
        console.log('成功连接到 MySQL 服务器');
        
        // 检查并创建数据库（如果不存在）
        await connection.query('CREATE DATABASE IF NOT EXISTS jump_game');
        console.log('数据库检查/创建完成');
        
        // 关闭临时连接
        await connection.end();
        
        // 创建连接池，指定使用 jump_game 数据库
        pool = mysql.createPool({
            ...dbConfig,
            database: 'jump_game'
        });
        
        // 创建表（如果不存在）
        const poolConnection = await pool.getConnection();
        await poolConnection.query(`
            CREATE TABLE IF NOT EXISTS leaderboard (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                score INT NOT NULL,
                date DATETIME NOT NULL
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);
        await poolConnection.release();
        
        console.log('数据库表检查/创建完成');
        console.log('成功连接到 jump_game 数据库');
    } catch (error) {
        console.error('数据库初始化失败:', error.message);
        process.exit(1); // 初始化失败，退出程序
    }
}

// API 端点：获取排行榜数据
app.get('/api/leaderboard', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT id, name, score, date FROM leaderboard 
            ORDER BY score DESC LIMIT 10
        `);
        res.json(rows);
    } catch (error) {
        console.error('获取排行榜失败:', error.message);
        res.status(500).json({ error: '获取排行榜数据失败' });
    }
});

// API 端点：保存分数
app.post('/api/leaderboard', async (req, res) => {
    try {
        const { name, score } = req.body;
        
        if (!name || typeof score !== 'number') {
            res.status(400).json({ error: '无效的请求参数' });
            return;
        }
        
        const date = new Date();
        
        const [result] = await pool.query(
            `INSERT INTO leaderboard (name, score, date) VALUES (?, ?, ?)`, 
            [name, score, date]
        );
        
        res.json({ id: result.insertId, name, score, date });
    } catch (error) {
        console.error('保存分数失败:', error.message);
        res.status(500).json({ error: '保存分数失败' });
    }
});

// 启动服务器
async function startServer() {
    // 初始化数据库
    await initializeDatabase();
    
    // 启动 Express 服务器
    app.listen(PORT, () => {
        console.log(`服务器运行在 http://localhost:${PORT}`);
    });
}

// 处理关闭信号
process.on('SIGINT', async () => {
    try {
        if (pool) {
            await pool.end();
            console.log('数据库连接池已关闭');
        }
    } catch (error) {
        console.error('关闭数据库连接失败:', error.message);
    } finally {
        process.exit(0);
    }
});

// 启动服务器
startServer().catch(err => {
    console.error('启动服务器失败:', err);
    process.exit(1);
});