import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const JS_HEADERS = {
  "Content-Type": "application/javascript; charset=utf-8",
  "Cache-Control": "public, max-age=300",
  "Access-Control-Allow-Origin": "*",
};

// Framework-free by necessity -- this runs on an arbitrary external site
// that can't be assumed to have React (or anything else) loaded. Styling
// is all inline to avoid colliding with the host page's own CSS.
function widgetScript(agentId: string, apiOrigin: string): string {
  return `(function () {
  var AGENT_ID = ${JSON.stringify(agentId)};
  var API_BASE = ${JSON.stringify(apiOrigin)};
  var history = [];

  var bubble = document.createElement("button");
  bubble.textContent = "\\uD83D\\uDCAC";
  bubble.setAttribute("aria-label", "Open chat");
  Object.assign(bubble.style, {
    position: "fixed", bottom: "20px", right: "20px", width: "56px", height: "56px",
    borderRadius: "50%", border: "none", background: "#111827", color: "#fff",
    fontSize: "24px", cursor: "pointer", zIndex: "999999", boxShadow: "0 4px 12px rgba(0,0,0,0.25)"
  });

  var panel = document.createElement("div");
  Object.assign(panel.style, {
    position: "fixed", bottom: "88px", right: "20px", width: "320px", height: "440px",
    background: "#fff", borderRadius: "12px", boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
    display: "none", flexDirection: "column", overflow: "hidden", zIndex: "999999",
    fontFamily: "system-ui, sans-serif", fontSize: "14px"
  });

  var messagesEl = document.createElement("div");
  Object.assign(messagesEl.style, { flex: "1", overflowY: "auto", padding: "12px" });

  var inputRow = document.createElement("div");
  Object.assign(inputRow.style, { display: "flex", borderTop: "1px solid #e5e7eb" });

  var input = document.createElement("input");
  input.placeholder = "Type a message...";
  Object.assign(input.style, { flex: "1", border: "none", padding: "10px", outline: "none", fontSize: "14px" });

  var sendBtn = document.createElement("button");
  sendBtn.textContent = "Send";
  Object.assign(sendBtn.style, { border: "none", background: "#111827", color: "#fff", padding: "0 16px", cursor: "pointer" });

  inputRow.appendChild(input);
  inputRow.appendChild(sendBtn);
  panel.appendChild(messagesEl);
  panel.appendChild(inputRow);

  function addMessage(role, content) {
    var el = document.createElement("div");
    el.textContent = content;
    var base = { margin: "6px 0", padding: "8px 12px", borderRadius: "10px", maxWidth: "80%", whiteSpace: "pre-wrap" };
    var roleStyle = role === "user"
      ? { marginLeft: "auto", background: "#111827", color: "#fff" }
      : { marginRight: "auto", background: "#f3f4f6", color: "#111827" };
    Object.assign(el.style, base, roleStyle);
    messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function send() {
    var text = input.value.trim();
    if (!text) return;
    input.value = "";
    addMessage("user", text);
    var priorHistory = history.slice();
    history.push({ role: "user", content: text });

    fetch(API_BASE + "/api/chat/" + AGENT_ID, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, history: priorHistory })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.error) {
          addMessage("assistant", "Sorry, something went wrong.");
          return;
        }
        addMessage("assistant", data.reply);
        history.push({ role: "assistant", content: data.reply });
      })
      .catch(function () {
        addMessage("assistant", "Sorry, something went wrong.");
      });
  }

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", function (e) { if (e.key === "Enter") send(); });
  bubble.addEventListener("click", function () {
    panel.style.display = panel.style.display === "none" ? "flex" : "none";
  });

  document.body.appendChild(bubble);
  document.body.appendChild(panel);
})();
`;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  if (!z.string().uuid().safeParse(agentId).success) {
    return new NextResponse("// invalid agent id", { status: 400, headers: JS_HEADERS });
  }

  return new NextResponse(widgetScript(agentId, req.nextUrl.origin), { headers: JS_HEADERS });
}
