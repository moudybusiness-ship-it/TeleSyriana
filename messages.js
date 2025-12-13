/* =========================
   Messages / Chat Logic
   TeleSyriana
========================= */

let currentChat = null;
let floatingMode = false;

/* =========================
   Helpers
========================= */
function qs(id){ return document.getElementById(id); }
function ce(tag, cls){ const e=document.createElement(tag); if(cls)e.className=cls; return e; }

/* =========================
   MAIN CHAT (PAGE)
========================= */
document.addEventListener("DOMContentLoaded", () => {

  /* -------- Send message (Main page) -------- */
  const form = qs("chat-form");
  const input = qs("chat-input");
  const list  = qs("chat-message-list");

  if(form){
    form.addEventListener("submit", e => {
      e.preventDefault();
      sendMainMessage();
    });
  }

  if(input){
    input.addEventListener("keydown", e => {
      if(e.key === "Enter" && !e.shiftKey){
        e.preventDefault();
        sendMainMessage();
      }
    });
  }

  function sendMainMessage(){
    if(!input.value.trim()) return;
    addMessage(list, "Me", input.value, true);
    input.value = "";
  }

  /* -------- Chat item click -------- */
  document.querySelectorAll(".chat-room, .chat-dm").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      document.querySelectorAll(".chat-room,.chat-dm")
        .forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      currentChat = btn.dataset.chat || btn.innerText.trim();
      qs("chat-room-name").innerText = currentChat;
      list.innerHTML = "";
    });
  });
});

/* =========================
   Floating Chat
========================= */
const floatToggle = qs("float-chat-toggle");
const floatPanel  = qs("float-chat-panel");

if(floatToggle && floatPanel){

  floatToggle.addEventListener("click", ()=>{
    floatPanel.classList.remove("hidden");
    floatToggle.classList.add("hidden");
  });

  qs("float-chat-close").addEventListener("click", ()=>{
    floatPanel.classList.add("hidden");
    floatToggle.classList.remove("hidden");
    floatPanel.classList.remove("chat-only");
    floatingMode = false;
  });

  buildFloatingUI();
}

/* =========================
   Floating UI Builder
========================= */
function buildFloatingUI(){

  const body = qs("float-chat-body");
  body.innerHTML = "";

  const mini = ce("div","floating-mini");

  /* ---- LEFT: contacts ---- */
  const side = ce("div","floating-mini-side");

  const search = ce("input","floating-mini-search");
  search.placeholder = "Search…";
  side.appendChild(search);

  const section = ce("div","floating-mini-section");
  section.innerText = "Direct messages";
  side.appendChild(section);

  const list = ce("div","floating-mini-list");

  ["Supervisor Dema","Supervisor Moustafa","Agent 01","Agent 02"].forEach(name=>{
    const btn = ce("button","chat-dm");
    btn.innerHTML = `
      <div class="chat-row">
        <div class="chat-avatar role-supervisor">${name[0]}</div>
        <div class="chat-row-text">
          <strong>${name}</strong>
        </div>
      </div>
    `;
    btn.onclick = ()=> openFloatingChat(name);
    list.appendChild(btn);
  });

  side.appendChild(list);

  /* ---- RIGHT: chat ---- */
  const chat = ce("div","floating-mini-chat hidden");

  chat.innerHTML = `
    <div class="floating-chat-room-name" id="float-room-name"></div>
    <div class="floating-chat-note">Direct message</div>

    <div class="floating-chat-messages" id="float-messages"></div>

    <form class="floating-chat-input-row" id="float-form">
      <input id="float-input" placeholder="Type a message…" />
      <button type="submit">Send</button>
    </form>
  `;

  mini.appendChild(side);
  mini.appendChild(chat);
  body.appendChild(mini);

  /* ---- Send (Floating) ---- */
  const form = qs("float-form");
  const input = qs("float-input");
  const msgs = qs("float-messages");

  form.addEventListener("submit", e=>{
    e.preventDefault();
    if(!input.value.trim()) return;
    addMessage(msgs,"Me",input.value,true);
    input.value="";
  });

  input.addEventListener("keydown", e=>{
    if(e.key==="Enter"){
      e.preventDefault();
      form.requestSubmit();
    }
  });
}

/* =========================
   Open Floating Chat
========================= */
function openFloatingChat(name){

  floatingMode = true;
  floatPanel.classList.add("chat-only");

  qs("float-room-name").innerText = name;

  const chat = floatPanel.querySelector(".floating-mini-chat");
  chat.classList.remove("hidden");

  const msgs = qs("float-messages");
  msgs.innerHTML = "";

  addMessage(msgs,name,"Hello 👋",false);
}

/* =========================
   Message renderer
========================= */
function addMessage(container, name, text, me=false){

  const row = ce("div","chat-message"+(me?" me":""));

  const avatar = ce("div","msg-avatar");
  avatar.innerText = name[0];

  const body = ce("div","msg-body");

  const meta = ce("div","msg-meta");
  meta.innerHTML = `<span class="msg-name">${name}</span>
                    <span>${new Date().toLocaleTimeString([],{
                      hour:"2-digit",minute:"2-digit"
                    })}</span>`;

  const bubble = ce("div","chat-message-text");
  bubble.innerText = text;

  body.appendChild(meta);
  body.appendChild(bubble);

  row.appendChild(avatar);
  row.appendChild(body);

  container.appendChild(row);
  container.scrollTop = container.scrollHeight;
}
