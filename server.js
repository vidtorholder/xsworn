const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- DATABASE ----------
const db = new sqlite3.Database('./db.sqlite');

db.serialize(() => {
    // Users
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        pfp TEXT
    )`);

    // Posts
    db.run(`CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        title TEXT,
        body TEXT,
        community TEXT,
        score INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Comments
    db.run(`CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER,
        user_id INTEGER,
        parent_id INTEGER,
        body TEXT,
        score INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(post_id) REFERENCES posts(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`);

    // Votes
    db.run(`CREATE TABLE IF NOT EXISTS votes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        post_id INTEGER,
        value INTEGER,
        UNIQUE(user_id, post_id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS comment_votes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        comment_id INTEGER,
        value INTEGER,
        UNIQUE(user_id, comment_id)
    )`);

    // ---------- CREATE MOD ACCOUNT ----------
    db.get(`SELECT * FROM users WHERE username = ?`, ['mod'], (err, row) => {
        if (err) return console.error(err);
        if (!row) {
            db.run(`INSERT INTO users (username, password, pfp) VALUES (?, ?, ?)`,
                ['mod', '24231803moderation', 'https://example.com/mod.png'],
                err => {
                    if (err) console.error(err);
                    else console.log('Moderator account "mod" created.');
                }
            );
        } else {
            console.log('Moderator account "mod" already exists.');
        }
    });
});

// ---------- MIDDLEWARE ----------
app.use(bodyParser.json());
app.use(session({
    secret: 'xswarm-secret',
    resave: false,
    saveUninitialized: true
}));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- AUTH ROUTES ----------
app.post('/api/signup', (req, res) => {
    const { username, password, pfp } = req.body;
    if (!username || !password) return res.sendStatus(400);
    db.run(`INSERT INTO users (username, password, pfp) VALUES (?, ?, ?)`,
        [username, password, pfp || ''],
        function(err) {
            if (err) return res.sendStatus(400);
            res.sendStatus(200);
        });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.get(`SELECT * FROM users WHERE username = ? AND password = ?`, [username, password], (err, row) => {
        if (err || !row) return res.sendStatus(401);
        req.session.userId = row.id;
        res.sendStatus(200);
    });
});

app.get('/api/me', (req, res) => {
    if (!req.session.userId) return res.json(null);
    db.get(`SELECT * FROM users WHERE id = ?`, [req.session.userId], (err, row) => {
        if (err) return res.json(null);
        res.json({ username: row.username, pfp: row.pfp });
    });
});

// ---------- POSTS ----------
app.post('/api/posts', (req, res) => {
    if (!req.session.userId) return res.sendStatus(401);
    const { title, body, community } = req.body;
    db.run(`INSERT INTO posts (user_id, title, body, community) VALUES (?, ?, ?, ?)`,
        [req.session.userId, title, body, community || ''],
        function(err) { if (err) return res.sendStatus(400); res.sendStatus(200); });
});

app.get('/api/posts', (req, res) => {
    db.all(`
        SELECT posts.*, users.username, users.pfp,
            COALESCE(SUM(votes.value),0) as score
        FROM posts
        LEFT JOIN users ON posts.user_id = users.id
        LEFT JOIN votes ON posts.id = votes.post_id
        GROUP BY posts.id
        ORDER BY created_at DESC
    `, [], (err, rows) => {
        if (err) return res.json([]);
        res.json(rows);
    });
});

// ---------- VOTES ----------
app.post('/api/vote', (req, res) => {
    if (!req.session.userId) return res.sendStatus(401);
    const { post_id, value } = req.body;
    db.run(`
        INSERT INTO votes (user_id, post_id, value)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, post_id) DO UPDATE SET value=excluded.value
    `, [req.session.userId, post_id, value], err => {
        if (err) return res.sendStatus(400);
        res.sendStatus(200);
    });
});

app.post('/api/voteComment', (req, res) => {
    if (!req.session.userId) return res.sendStatus(401);
    const { comment_id, value } = req.body;
    db.run(`
        INSERT INTO comment_votes (user_id, comment_id, value)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, comment_id) DO UPDATE SET value=excluded.value
    `, [req.session.userId, comment_id, value], err => {
        if (err) return res.sendStatus(400);
        res.sendStatus(200);
    });
});

// ---------- COMMENTS ----------
app.post('/api/comments', (req, res) => {
    if (!req.session.userId) return res.sendStatus(401);
    const { post_id, parent_id, body } = req.body;
    db.run(`INSERT INTO comments (post_id, user_id, parent_id, body) VALUES (?, ?, ?, ?)`,
        [post_id, req.session.userId, parent_id || null, body],
        err => { if (err) return res.sendStatus(400); res.sendStatus(200); });
});

app.get('/api/comments/:postId', (req, res) => {
    const postId = req.params.postId;
    const parentId = req.query.parent_id || null;
    db.all(`
        SELECT comments.*, users.username, users.pfp,
            COALESCE(SUM(comment_votes.value),0) as score
        FROM comments
        LEFT JOIN users ON comments.user_id = users.id
        LEFT JOIN comment_votes ON comments.id = comment_votes.comment_id
        WHERE comments.post_id = ? AND comments.parent_id IS ?
        GROUP BY comments.id
        ORDER BY created_at ASC
    `, [postId, parentId], (err, rows) => {
        if (err) return res.json([]);
        res.json(rows);
    });
});

// ---------- MOD ACTIONS ----------
function requireMod(req, res, next) {
    if (!req.session.userId) return res.sendStatus(401);
    db.get(`SELECT username FROM users WHERE id = ?`, [req.session.userId], (err, row) => {
        if (err || row.username !== 'mod') return res.sendStatus(403);
        next();
    });
}

app.post('/api/mod/deletePost', requireMod, (req, res) => {
    db.run(`DELETE FROM posts WHERE id = ?`, [req.body.post_id], err => {
        if (err) return res.sendStatus(400);
        res.sendStatus(200);
    });
});

app.post('/api/mod/deleteComment', requireMod, (req, res) => {
    db.run(`DELETE FROM comments WHERE id = ?`, [req.body.comment_id], err => {
        if (err) return res.sendStatus(400);
        res.sendStatus(200);
    });
});

app.post('/api/mod/deleteUser', requireMod, (req, res) => {
    db.run(`DELETE FROM users WHERE username = ?`, [req.body.username], err => {
        if (err) return res.sendStatus(400);
        res.sendStatus(200);
    });
});

// ---------- PROFILE PAGE ----------
app.get('/u/:username', (req, res) => {
    const uname = req.params.username;
    db.get(`SELECT * FROM users WHERE username = ?`, [uname], (err, row) => {
        if (err || !row) return res.status(404).send('User does not exist');
        db.all(`SELECT posts.*, COALESCE(SUM(votes.value),0) as score
                FROM posts
                LEFT JOIN votes ON posts.id = votes.post_id
                WHERE posts.user_id = ?
                GROUP BY posts.id
                ORDER BY created_at DESC`, [row.id], (err2, posts) => {
            if (err2) return res.status(500).send('Error loading posts');
            res.json({ username: row.username, pfp: row.pfp, posts });
        });
    });
});

// ---------- START SERVER ----------
app.listen(PORT, () => {
    console.log(`XSWARM server running on http://localhost:${PORT}`);
});
