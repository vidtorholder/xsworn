async function loadPosts() {
    const res = await fetch("/api/posts");
    const posts = await res.json();
    const feed = document.getElementById("feed");
    feed.innerHTML = "";

    posts.forEach(p => {
        const el = document.createElement("div");
        el.className = "post";
        el.innerHTML = `
            <img src="${p.pfp || 'default.png'}" class="pfp">
            <b>${p.title}</b> by ${p.username}
            <div>${p.body}</div>
            <button onclick="vote(${p.id},1)">▲</button>
            ${p.score}
            <button onclick="vote(${p.id},-1)">▼</button>
            <button onclick="showComments(${p.id})">comments</button>
            <div id="comments-${p.id}"></div>
        `;
        feed.appendChild(el);
    });
}

async function vote(id, v) {
    await fetch("/api/vote", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ post_id: id, value: v })
    });
    loadPosts();
}

async function showComments(id) {
    const res = await fetch(`/api/comments/${id}`);
    const comments = await res.json();
    const box = document.getElementById("comments-" + id);
    box.innerHTML = comments.map(c =>
        `<div><b>${c.username}</b>: ${c.body}</div>`
    ).join("");
}

loadPosts();
