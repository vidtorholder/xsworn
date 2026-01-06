const socket = io();
let currentUser = null;

// ------------------- Auth -------------------
async function signup() {
    const res = await fetch("/api/signup", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({
            username: username.value,
            password: password.value,
            pfp: pfp.value
        })
    });

    const data = await res.json();
    if (data.terminated) {
        alert("This account has been terminated and cannot be recreated.");
        return;
    }
    if (res.ok) alert("Registered. Log in.");
}

async function login() {
    const res = await fetch("/api/login", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({
            username: username.value,
            password: password.value
        })
    });

    const data = await res.json();

    if (data.terminated) {
        document.body.innerHTML = `
            <div style="padding:50px;text-align:center;">
                <h1>Account Terminated</h1>
                <p>We are very sorry but our moderators have decided your actions are not in regards of our terms of service, your account has been terminated.</p>
            </div>
        `;
        return;
    }

    if (res.ok) loadMe();
}

// ------------------- Load Current User -------------------
async function loadMe() {
    const res = await fetch("/api/me");
    currentUser = await res.json();

    if (currentUser) {
        auth.style.display = "none";
        postBox.style.display = "block";
        userStatus.innerHTML = `logged in as <b>${currentUser.username}</b>`;
        if (currentUser.isMod) modNotice.style.display = "block";
    }

    // Initial fetch of existing posts
    const postsRes = await fetch("/api/posts");
    const posts = await postsRes.json();
    feed.innerHTML = "";
    posts.reverse().forEach(renderPost);
}

// ------------------- Posts -------------------
async function createPost() {
    const title = postTitle.value;
    const body = postBody.value;
    if (!title && !body) return;

    await fetch("/api/posts", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ title, body })
    });

    postTitle.value = "";
    postBody.value = "";
}

async function vote(id, value) {
    await fetch("/api/vote", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ post_id: id, value })
    });
}

// ------------------- Comments -------------------
async function addComment(postId, inputId) {
    const input = document.getElementById(inputId);
    if (!input.value) return;

    await fetch("/api/comments", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ post_id: postId, body: input.value })
    });
    input.value = "";
}

async function toggleComments(id) {
    const box = document.getElementById("comments-" + id);
    if (box.innerHTML) { box.innerHTML = ""; return; }

    const res = await fetch("/api/comments/" + id);
    const comments = await res.json();

    box.innerHTML =
        comments.map(c => `
            <div class="comment">
                <img class="pfp" src="${c.pfp || ""}">
                <b>${c.username}</b>: ${c.body}
            </div>
        `).join("") +
        `<input id="reply-${id}" placeholder="reply…">
         <button onclick="addComment(${id},'reply-${id}')">send</button>`;
}

// ------------------- Render Post -------------------
function renderPost(p) {
    let el = document.getElementById("post-" + p.id);
    if (!el) {
        el = document.createElement("div");
        el.id = "post-" + p.id;
        el.className = "post";
        feed.prepend(el); // newest on top
    }

    el.innerHTML = `
        <img class="pfp" src="${p.pfp || ""}">
        <div class="postContent">
            <div class="title">${p.title}</div>
            <div class="meta">by ${p.username}</div>
            <div>${p.body}</div>
            <div class="actions">
                <button onclick="vote(${p.id},1)">▲</button>
                ${p.score || 0}
                <button onclick="vote(${p.id},-1)">▼</button>
                <button onclick="toggleComments(${p.id})">replies</button>
                ${currentUser?.isMod ? `<button onclick="terminateUser('${p.username}')">terminate user</button>` : ""}
            </div>
            <div id="comments-${p.id}"></div>
        </div>
    `;
}

// ------------------- Render Comment -------------------
function renderComment(c) {
    const box = document.getElementById("comments-" + c.post_id);
    if (!box) return;

    const div = document.createElement("div");
    div.className = "comment";
    div.innerHTML = `<img class="pfp" src="${c.pfp || ""}"><b>${c.username}</b>: ${c.body}`;
    box.appendChild(div);
}

// ------------------- Moderator: Terminate User -------------------
async function terminateUser(username) {
    if (!confirm(`Are you sure you want to terminate ${username}?`)) return;

    await fetch("/api/terminate/" + username, { method: "POST" });
}

// ------------------- Socket.IO Events -------------------
socket.on("newPost", renderPost);
socket.on("updatePost", renderPost);
socket.on("newComment", renderComment);
socket.on("userTerminated", username => {
    // Remove posts by terminated user
    const posts = document.querySelectorAll(".post");
    posts.forEach(p => {
        if (p.querySelector(".meta").textContent.includes(username)) p.remove();
    });
});

// ------------------- Initialize -------------------
loadMe();
