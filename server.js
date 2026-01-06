const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const session = require("express-session");
const path = require("path");

const app = express();
const db = new sqlite3.Database("db.sqlite");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: "xswarm-secret",
    resave: false,
    saveUninitialized: false
}));

app.use(express.static("public"));

/* ---------- DATABASE ---------- */

db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            username TEXT UNIQUE,
            password TEXT,
            pfp TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY,
            user_id INTEGER,
            title TEXT,
            body TEXT,
            created DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS comments (
            id INTEGER PRIMARY KEY,
            post_id INTEGER,
            user_id INTEGER,
            body TEXT,
            created DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS votes (
            user_id INTEGER,
            post_id INTEGER,
            value INTEGER,
            UNIQUE(user_id, post_id)
        )
    `);
});

/* ---------- AUTH ---------- */

app.post("/api/signup", async (req, res) => {
    const { username, password, pfp } = req.body;
    const hash = await bcrypt.hash(password, 10);

    db.run(
        "INSERT INTO users (username, password, pfp) VALUES (?, ?, ?)",
        [username, hash, pfp || ""],
        err => {
            if (err) return res.status(400).json({ error: "User exists" });
            res.json({ success: true });
        }
    );
});

app.post("/api/login", (req, res) => {
    const { username, password } = req.body;

    db.get(
        "SELECT * FROM users WHERE username = ?",
        [username],
        async (err, user) => {
            if (!user) return res.status(401).json({ error: "Invalid" });

            const ok = await bcrypt.compare(password, user.password);
            if (!ok) return res.status(401).json({ error: "Invalid" });

            req.session.user = user;
            res.json({ success: true });
        }
    );
});

app.get("/api/me", (req, res) => {
    res.json(req.session.user || null);
});

/* ---------- POSTS ---------- */

app.post("/api/posts", (req, res) => {
    if (!req.session.user) return res.sendStatus(401);

    db.run(
        "INSERT INTO posts (user_id, title, body) VALUES (?, ?, ?)",
        [req.session.user.id, req.body.title, req.body.body],
        () => res.json({ success: true })
    );
});

app.get("/api/posts", (req, res) => {
    db.all(`
        SELECT posts.*, users.username, users.pfp,
        COALESCE(SUM(votes.value),0) AS score
        FROM posts
        JOIN users ON users.id = posts.user_id
        LEFT JOIN votes ON votes.post_id = posts.id
        GROUP BY posts.id
        ORDER BY created DESC
    `, (err, rows) => res.json(rows));
});

/* ---------- COMMENTS ---------- */

app.post("/api/comments", (req, res) => {
    if (!req.session.user) return res.sendStatus(401);

    db.run(
        "INSERT INTO comments (post_id, user_id, body) VALUES (?, ?, ?)",
        [req.body.post_id, req.session.user.id, req.body.body],
        () => res.json({ success: true })
    );
});

app.get("/api/comments/:postId", (req, res) => {
    db.all(`
        SELECT comments.*, users.username, users.pfp
        FROM comments
        JOIN users ON users.id = comments.user_id
        WHERE post_id = ?
        ORDER BY created
    `, [req.params.postId], (err, rows) => res.json(rows));
});

/* ---------- VOTES ---------- */

app.post("/api/vote", (req, res) => {
    if (!req.session.user) return res.sendStatus(401);

    db.run(`
        INSERT OR REPLACE INTO votes (user_id, post_id, value)
        VALUES (?, ?, ?)
    `, [req.session.user.id, req.body.post_id, req.body.value],
    () => res.json({ success: true }));
});

/* ---------- SERVER ---------- */

app.listen(3000, () =>
    console.log("XSWARM running on http://localhost:3000")
);
