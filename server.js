// ------------------- Imports -------------------
const express = require("express");
const bodyParser = require("body-parser");
const session = require("express-session");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// ------------------- Middleware -------------------
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(session({
    secret: "xswarm-secret-key",
    resave: false,
    saveUninitialized: true
}));

// ------------------- Database -------------------
const db = new sqlite3.Database("db.sqlite");

// Users table
db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    pfp TEXT,
    terminated INTEGER DEFAULT 0
)`);

// Posts table
db.run(`CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    title TEXT,
    body TEXT,
    score INTEGER DEFAULT 0
)`);

// Comments table
db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER,
    user_id INTEGER,
    body TEXT
)`);

// Votes table
db.run(`CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    post_id INTEGER,
    value INTEGER
)`);

// ------------------- Signup -------------------
app.post("/api/signup", (req, res) => {
    const { username, password, pfp } = req.body;

    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (user && user.terminated) {
            return res.status(403).json({
                terminated: true,
                message: "Your account was terminated and cannot be recreated."
            });
        }
        if (user) return res.status(400).json({ error: "Username taken" });

        db.run("INSERT INTO users (username, password, pfp) VALUES (?,?,?)",
            [username, password, pfp],
            function(err) {
                if (err) return res.status(500).json({ error: "DB error" });
                res.json({ success: true });
            });
    });
});

// ------------------- Login -------------------
app.post("/api/login", (req, res) => {
    const { username, password } = req.body;

    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (!user) return res.status(401).json({ error: "User not found" });

        if (user.terminated) {
            return res.status(403).json({
                terminated: true,
                message: "Your account has been terminated."
            });
        }

        if (user.password !== password) return res.status(401).json({ error: "Wrong password" });

        req.session.user = { id: user.id, username: user.username, isMod: user.username === "mod" };
        res.json(req.session.user);
    });
});

// ------------------- Get Current User -------------------
app.get("/api/me", (req, res) => {
    if (!req.session.user) return res.json(null);
    res.json(req.session.user);
});

// ------------------- Create Post -------------------
app.post("/api/posts", (req, res) => {
    const user = req.session.user;
    if (!user) return res.status(401).json({ error: "Not logged in" });

    db.run("INSERT INTO posts (user_id, title, body) VALUES (?,?,?)",
        [user.id, req.body.title, req.body.body],
        function(err) {
            if (err) return res.status(500).json({ error: "DB error" });
            res.json({ success: true });
        });
});

// ------------------- Get Posts -------------------
app.get("/api/posts", (req, res) => {
    db.all(`SELECT posts.*, users.username, users.pfp 
            FROM posts JOIN users ON posts.user_id = users.id
            ORDER BY posts.id DESC`, [], (err, posts) => {
        res.json(posts);
    });
});

// ------------------- Vote -------------------
app.post("/api/vote", (req, res) => {
    const user = req.session.user;
    if (!user) return res.status(401).json({ error: "Not logged in" });

    const { post_id, value } = req.body;

    db.get("SELECT * FROM votes WHERE user_id = ? AND post_id = ?", [user.id, post_id], (err, vote) => {
        if (vote) {
            // Already voted, update
            db.run("UPDATE votes SET value=? WHERE id=?", [value, vote.id]);
        } else {
            db.run("INSERT INTO votes (user_id, post_id, value) VALUES (?,?,?)", [user.id, post_id, value]);
        }

        // Recalculate score
        db.get("SELECT SUM(value) AS score FROM votes WHERE post_id=?", [post_id], (err, row) => {
            db.run("UPDATE posts SET score=? WHERE id=?", [row.score || 0, post_id]);
            res.json({ success: true });
        });
    });
});

// ------------------- Add Comment -------------------
app.post("/api/comments", (req, res) => {
    const user = req.session.user;
    if (!user) return res.status(401).json({ error: "Not logged in" });

    db.run("INSERT INTO comments (post_id, user_id, body) VALUES (?,?,?)",
        [req.body.post_id, user.id, req.body.body],
        function(err) {
            if (err) return res.status(500).json({ error: "DB error" });
            res.json({ success: true });
        });
});

// ------------------- Get Comments -------------------
app.get("/api/comments/:post_id", (req, res) => {
    const post_id = req.params.post_id;
    db.all(`SELECT comments.*, users.username, users.pfp 
            FROM comments JOIN users ON comments.user_id = users.id
            WHERE post_id = ? ORDER BY comments.id ASC`, [post_id], (err, comments) => {
        res.json(comments);
    });
});

// ------------------- Moderator: Terminate User -------------------
app.post("/api/terminate/:username", (req, res) => {
    const mod = req.session.user;
    if (!mod || mod.username !== "mod") return res.status(403).json({ error: "Unauthorized" });

    const username = req.params.username;

    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (!user) return res.status(404).json({ error: "User not found" });

        // Mark as terminated
        db.run("UPDATE users SET terminated = 1 WHERE id = ?", [user.id]);
        // Delete all posts/comments
        db.run("DELETE FROM posts WHERE user_id = ?", [user.id]);
        db.run("DELETE FROM comments WHERE user_id = ?", [user.id]);

        res.json({ success: true });
    });
});

// ------------------- Get User Profile -------------------
app.get("/api/user/:username", (req, res) => {
    const username = req.params.username;

    db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
        if (!user) return res.status(404).json({ username: "User not found", posts: [] });

        if (user.terminated) {
            return res.json({
                username: "Account Deleted",
                pfp: "",
                posts: []
            });
        }

        db.all("SELECT * FROM posts WHERE user_id = ?", [user.id], (err, posts) => {
            res.json({ username: user.username, pfp: user.pfp, posts });
        });
    });
});

// ------------------- Start Server -------------------
app.listen(PORT, () => console.log(`XSWARM server running on port ${PORT}`));
