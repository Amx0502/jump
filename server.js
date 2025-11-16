const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8011;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// MySQL 数据库配置
const dbConfig = {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'toor',
    connectionLimit: 10,
    waitForConnections: true,
    queueLimit: 0,
    multipleStatements: true,
    ssl: false,
    charset: 'utf8mb4',
    timezone: '+00:00' // UTC 时区
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
        // 添加完整的连接参数，包括时区和字符编码设置
        pool = mysql.createPool({
            ...dbConfig,
            database: 'jump_game',
            // 确保所有连接参数都正确应用
            connectTimeout: 10000,
            acquireTimeout: 10000,
            idleTimeout: 60000
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

// API 端点：检查名称是否存在
app.get('/api/check-name/:name', async (req, res) => {
    try {
        const { name } = req.params;
        
        if (!name) {
            res.status(400).json({ error: '名称不能为空' });
            return;
        }
        
        // 不区分大小写查询，去除首尾空格
        const trimmedName = name.trim();
        const [rows] = await pool.query(
            `SELECT id FROM leaderboard WHERE TRIM(name) = ?`, 
            [trimmedName]
        );
        
        res.json({ exists: rows.length > 0 });
    } catch (error) {
        console.error('检查名称失败:', error.message);
        res.status(500).json({ error: '检查名称失败' });
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
        
        const trimmedName = name.trim();
        
        // 检查名称是否存在并获取当前分数
        const [existingRows] = await pool.query(
            `SELECT id, score FROM leaderboard WHERE TRIM(name) = ?`, 
            [trimmedName]
        );
        
        if (existingRows.length > 0) {
            // 名称已存在，比较分数
            const existingScore = existingRows[0].score;
            const existingId = existingRows[0].id;
            
            if (score > existingScore) {
                // 新分数更高，更新分数
                await pool.query(
                    `UPDATE leaderboard SET score = ?, date = NOW() WHERE id = ?`, 
                    [score, existingId]
                );
                res.json({
                    id: existingId,
                    name: trimmedName,
                    score: score,
                    date: new Date(),
                    updated: true
                });
            } else {
                // 新分数不高于现有分数，不更新
                res.json({
                    id: existingId,
                    name: trimmedName,
                    score: existingScore,
                    date: new Date(),
                    updated: false
                });
            }
        } else {
            // 名称不存在，插入新记录
            const [result] = await pool.query(
                `INSERT INTO leaderboard (name, score, date) VALUES (?, ?, NOW())`, 
                [trimmedName, score]
            );
            
            res.json({
                id: result.insertId,
                name: trimmedName,
                score: score,
                date: new Date(),
                updated: true
            });
        }
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