"use strict";

const API_URL = "https://jsonplaceholder.typicode.com/posts";

// State and page elements.
const state = { notes: [], pendingAction: null, nextKey: 1 };
const loadButton = document.getElementById("load-btn");
const submitButton = document.getElementById("submit-btn");
const noteForm = document.getElementById("note-form");
const titleInput = document.getElementById("title-input");
const bodyInput = document.getElementById("body-input");
const titleError = document.getElementById("title-error");
const statusElement = document.getElementById("status");
const notesList = document.getElementById("notes-list");

// HTTP: return the body and actual status for POST/DELETE operations.
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

function validateTitle(value) {
  if (value.trim() === "") {
    return "Enter a title containing at least one non-space character.";
  }
  if (value.length > 100) {
    return "The title must be 100 characters or fewer.";
  }
  return "";
}

function setTitleError(message) {
  titleInput.setCustomValidity(message);
  titleError.textContent = message ? `Error: ${message}` : "";
  titleError.hidden = message === "";
  if (message) {
    titleInput.setAttribute("aria-invalid", "true");
  } else {
    titleInput.removeAttribute("aria-invalid");
  }
}

function toDisplayNote(note) {
  // JSONPlaceholder may return id 101 for every POST. A separate clientKey
  // identifies each displayed instance; the API id remains unchanged.
  // DELETE uses this key to remove only the selected displayed note.
  return { ...note, clientKey: state.nextKey++ };
}

// Rendering: API text is always inserted as text, never interpreted as HTML.
function setStatus(message, type = "idle") {
  statusElement.textContent = message;
  statusElement.dataset.state = type;
}

function setBusy(action, clientKey = null) {
  // Serialize list operations so overlapping requests cannot overwrite notes.
  state.pendingAction = action;
  const busy = action !== null;
  loadButton.disabled = busy;
  submitButton.disabled = busy;
  loadButton.textContent = action === "load" ? "Loading..." : "Load notes";
  submitButton.textContent =
    action === "create" ? "Creating..." : "Create note";

  // Freeze the submitted draft until the result arrives. Errors preserve it.
  titleInput.disabled = action === "create";
  bodyInput.disabled = action === "create";
  noteForm.setAttribute("aria-busy", String(action === "create"));
  notesList.setAttribute("aria-busy", String(busy));

  for (const button of notesList.querySelectorAll(".delete-btn")) {
    button.disabled = busy;
    const isSelected = Number(button.dataset.clientKey) === clientKey;
    button.textContent =
      action === "delete" && isSelected ? "Deleting..." : "Delete";
  }
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
    title.id = `note-title-${note.clientKey}`;
    title.textContent = note.title;

    const body = document.createElement("p");
    body.textContent = note.body;

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.id = `delete-note-${note.clientKey}`;
    deleteButton.className = "delete-btn";
    deleteButton.dataset.clientKey = String(note.clientKey);
    deleteButton.textContent = "Delete";
    deleteButton.disabled = state.pendingAction !== null;
    deleteButton.setAttribute(
      "aria-labelledby",
      `${deleteButton.id} ${title.id}`,
    );
    deleteButton.addEventListener("click", () => deleteNote(note.clientKey));

    item.append(title, body, deleteButton);
    notesList.append(item);
  }
}

// Event handling: the state guard also prevents duplicate programmatic calls.
async function loadNotes() {
  if (state.pendingAction !== null) return;

  setBusy("load");
  setStatus("Loading notes...", "loading");

  try {
    const { data } = await request(`${API_URL}?_limit=10`);

    if (!Array.isArray(data) || !data.every(isValidNote)) {
      throw new Error("The server returned unexpected note data.");
    }

    // A successful reload replaces local practice notes with server samples.
    // A page refresh also loses them: no local storage or backend persists them.
    state.notes = data.map(toDisplayNote);
    renderNotes();
    const noun = data.length === 1 ? "note" : "notes";
    setStatus(`Loaded ${data.length} ${noun} from the server.`, "success");
  } catch (error) {
    // Keep the previous notes when a reload fails.
    setStatus(`Error: Could not load notes. ${error.message}`, "error");
  } finally {
    setBusy(null);
  }
}

async function createNote(event) {
  event.preventDefault();
  if (state.pendingAction !== null) return;

  const validationError = validateTitle(titleInput.value);
  setTitleError(validationError);
  if (validationError) {
    setStatus(`Error: ${validationError}`, "error");
    titleInput.reportValidity();
    return;
  }

  // novalidate lets this handler announce custom errors before invoking
  // the browser's HTML constraint validation explicitly.
  if (!noteForm.reportValidity()) {
    setStatus("Error: Please correct the form before submitting.", "error");
    return;
  }

  const payload = {
    title: titleInput.value.trim(),
    body: bodyInput.value,
    userId: 1,
  };

  setBusy("create");
  setStatus("Creating note...", "loading");

  try {
    const { data, status } = await request(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!isValidNote(data)) {
      throw new Error("The server returned unexpected note data.");
    }

    state.notes.unshift(toDisplayNote(data));
    renderNotes();
    noteForm.reset();
    setTitleError("");
    setStatus(`Note created (status ${status}, id ${data.id}).`, "success");
  } catch (error) {
    // Do not clear the draft or add a note when creation fails.
    setStatus(`Error: Could not create note. ${error.message}`, "error");
  } finally {
    setBusy(null);
    titleInput.focus();
  }
}

async function deleteNote(clientKey) {
  if (state.pendingAction !== null) return;

  const index = state.notes.findIndex((note) => note.clientKey === clientKey);
  if (index === -1) return;

  const note = state.notes[index];
  const nextFocusKey =
    state.notes[index + 1]?.clientKey ??
    state.notes[index - 1]?.clientKey ??
    null;
  let deleted = false;

  setBusy("delete", clientKey);
  setStatus("Deleting note...", "loading");

  try {
    const { status } = await request(`${API_URL}/${note.id}`, {
      method: "DELETE",
    });

    // JSONPlaceholder simulates deletion and can reuse IDs for created notes.
    // Send the API id, then remove only this clientKey after HTTP success.
    // If the API rejects the request, retain the note and report the error.
    state.notes = state.notes.filter((item) => item.clientKey !== clientKey);
    deleted = true;
    renderNotes("No notes remain. Load notes or create a new note.");
    setStatus(`Note deleted (status ${status}, id ${note.id}).`, "success");
  } catch (error) {
    setStatus(`Error: Could not delete note. ${error.message}`, "error");
  } finally {
    setBusy(null);

    // Restore keyboard focus after the selected button is removed or restored.
    const focusKey = deleted ? nextFocusKey : clientKey;
    const focusTarget =
      notesList.querySelector(`button[data-client-key="${focusKey}"]`) ||
      loadButton;
    focusTarget.focus();
  }
}

loadButton.addEventListener("click", loadNotes);
noteForm.addEventListener("submit", createNote);
titleInput.addEventListener("input", () => setTitleError(""));
renderNotes("No notes loaded yet. Select Load notes to begin.");
