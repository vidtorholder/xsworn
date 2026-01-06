let currentUser = null;

// ---------- AUTH ----------
async function signup() {
    const res = await fetch("/api/signup", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({
            username: document.getElementById("username").value,
            password: document.getElementById("password").value,
            pfp: document.getElementById("pfp").value
        })
    });
    if (res.ok) alert("Registered! Log in.");
}

async function login() {
    const res = await fetch("/api/login", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({
            username: document.getElementById("username").value,
            password: document.getElementById("password").value
        })
    });
    if (res.ok) loadMe();
}

async function loadMe() {
    const res = await fetch("/api/me");
    currentUser = await res.json();
    if (currentUser) {
        document.getElementById("auth").style.display = "none";
        document.getElementById("postBox").style.display = "block";
        document.getElementById("userStatus").innerHTML = `logged in as <b>${currentUser.username}</b>`;
    }
    loadPosts();
}

// ---------- CREATE POST ----------
async function createPost() {
    const title = document.getElementById("postTitle").value;
    const body = document.getElementById("postBody").value;
    const community = document.getElementById("postCommunity").value;

    await fetch("/api/posts", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ title, body, community })
    });

    document.getElementById("postTitle").value = "";
    document.getElementById("postBody").value = "";
    document.getElementById("postCommunity").value = "";
    loadPosts();
}

// ---------- VOTING ----------
async function votePost(id, value) {
    await fetch("/api/vote", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ post_id: id, value })
    });
    loadPosts();
}

async function voteComment(id, value) {
    await fetch("/api/voteComment", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ comment_id: id, value })
    });
    loadPosts();
}

// ---------- COMMENTS ----------
async function addComment(postId, parentId, inputId) {
    const body = document.getElementById(inputId).value;
    if (!body) return;
    await fetch("/api/comments", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ post_id: postId, parent_id: parentId, body })
    });
    loadPosts();
}

// ---------- MODERATOR ----------
async function deletePost(postId) {
    if (!confirm("Delete this post?")) return;
    await fetch("/api/mod/deletePost", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ post_id: postId })
    });
    loadPosts();
}

async function deleteComment(commentId) {
    if (!confirm("Delete this comment?")) return;
    await fetch("/api/mod/deleteComment", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ comment_id: commentId })
    });
    loadPosts();
}

async function deleteUser(username) {
    if (!confirm("Delete user?")) return;
    await fetch("/api/mod/deleteUser", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ username })
    });
    loadPosts();
}

// ---------- LOAD POSTS & COMMENTS ----------
async function loadPosts() {
    const res = await fetch("/api/posts");
    const posts = await res.json();
    const feed = document.getElementById("feed");
    feed.innerHTML = "";

    posts.forEach(p => {
        const postEl = document.createElement("div");
        postEl.className = "post";
        postEl.innerHTML = `
            <img class="pfp" src="${p.pfp || ''}">
            <div class="postContent">
                <div class="title">${p.title} ${p.community? `<span class="community">${p.community}</span>` : ''}</div>
                <div class="meta">by <a href="/u/${p.username}" class="profile-link">${p.username}</a></div>
                <div>${p.body}</div>
                <div class="actions">
                    <button onclick="votePost(${p.id},1)">▲</button>${p.score}<button onclick="votePost(${p.id},-1)">▼</button>
                    <button onclick="toggleComments(${p.id})">replies</button>
                    ${currentUser?.username==='mod'? `<button class="moderator-btn" onclick="deletePost(${p.id})">MOD DEL</button>` : ''}
                </div>
                <div id="comments-${p.id}" class="comment-container"></div>
            </div>
        `;
        feed.appendChild(postEl);
    });
}

// ---------- RECURSIVE COMMENTS ----------
async function renderComments(postId, parentId = null) {
    const res = await fetch(`/api/comments/${postId}?parent_id=${parentId || ''}`);
    const comments = await res.json();
    const container = parentId ? document.getElementById(`comment-${parentId}`) : document.getElementById(`comments-${postId}`);

    container.innerHTML = '';
    comments.forEach(c => {
        const cEl = document.createElement("div");
        cEl.className = "comment";
        cEl.id = `comment-${c.id}`;
        cEl.innerHTML = `
            <img class="pfp" src="${c.pfp || ''}">
            <b><a href="/u/${c.username}" class="profile-link">${c.username}</a></b>: ${c.body}
            <div class="actions">
                <button onclick="voteComment(${c.id},1)">▲</button>${c.score}<button onclick="voteComment(${c.id},-1)">▼</button>
                ${currentUser?.username==='mod'? `<button class="moderator-btn" onclick="deleteComment(${c.id})">MOD DEL</button>` : ''}
            </div>
            <input id="reply-${c.id}" placeholder="reply…">
            <button onclick="addComment(${postId},${c.id},'reply-${c.id}')">send</button>
            <div class="comment-container" id="comments-${c.id}"></div>
        `;
        container.appendChild(cEl);
        renderComments(postId, c.id); // recursive
    });
}

// ---------- TOGGLE COMMENTS ----------
function toggleComments(postId) {
    const container = document.getElementById(`comments-${postId}`);
    if (container.innerHTML) { container.innerHTML = ''; return; }
    renderComments(postId);
}

// ---------- INITIAL LOAD ----------
loadMe();
