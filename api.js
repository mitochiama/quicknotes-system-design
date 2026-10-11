"use strict";

const API_URL = "https://jsonplaceholder.typicode.com/posts";

// State and page elements.
const state = { notes: [], isLoading: false };
const loadButton = document.getElementById("load-btn");
const statusElement = document.getElementById("status");
const notesList = document.getElementById("notes-list");

// HTTP: return the body and actual status for later POST/DELETE operations.
async function request(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`The server returned status ${response.status}.`);
    }

    const responseText = await response.text();
    let data = null;

    // Empty successful bodies (including 204) must not be parsed as JSON.
    if (responseText.trim() !== "") {
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        throw new Error("The server returned an unexpected response format.");
      }
      data = JSON.parse(responseText);
    }

    return { data, status: response.status };
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("The request timed out. Please try again.");
    }
    if (error instanceof TypeError) {
      throw new Error(
        "Could not reach the server. Check your connection and try again.",
      );
    }
    if (error instanceof SyntaxError) {
      throw new Error("The server returned invalid JSON.");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Validate API data before replacing the last successfully loaded notes.
function isValidNote(note) {
  return (
    note !== null &&
    typeof note === "object" &&
    Number.isInteger(note.id) &&
    note.id > 0 &&
    typeof note.title === "string" &&
    typeof note.body === "string"
  );
}

// Rendering: API text is always inserted as text, never interpreted as HTML.
function setStatus(message, type = "idle") {
  statusElement.textContent = message;
  statusElement.dataset.state = type;
}

function renderNotes(
  emptyMessage = "No notes were returned. Try loading again.",
) {
  notesList.replaceChildren();

  if (state.notes.length === 0) {
    const item = document.createElement("li");
    item.className = "empty-state";
    item.textContent = emptyMessage;
    notesList.append(item);
    return;
  }

  for (const note of state.notes) {
    const item = document.createElement("li");
    item.className = "note-card";

    const title = document.createElement("h3");
    title.textContent = note.title;

    const body = document.createElement("p");
    body.textContent = note.body;

    item.append(title, body);
    notesList.append(item);
  }
}

// Event handling: the state guard also prevents duplicate programmatic calls.
async function loadNotes() {
  if (state.isLoading) return;

  state.isLoading = true;
  loadButton.disabled = true;
  loadButton.textContent = "Loading...";
  notesList.setAttribute("aria-busy", "true");
  setStatus("Loading notes...", "loading");

  try {
    const { data } = await request(`${API_URL}?_limit=10`);

    if (!Array.isArray(data) || !data.every(isValidNote)) {
      throw new Error("The server returned unexpected note data.");
    }

    state.notes = data;
    renderNotes();
    const noun = data.length === 1 ? "note" : "notes";
    setStatus(`Loaded ${data.length} ${noun} from the server.`, "success");
  } catch (error) {
    // Keep the previous notes when a reload fails.
    setStatus(`Error: Could not load notes. ${error.message}`, "error");
  } finally {
    state.isLoading = false;
    loadButton.disabled = false;
    loadButton.textContent = "Load notes";
    notesList.setAttribute("aria-busy", "false");
  }
}

loadButton.addEventListener("click", loadNotes);
renderNotes("No notes loaded yet. Select Load notes to begin.");
