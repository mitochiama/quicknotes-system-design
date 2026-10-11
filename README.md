# QuickNotes System Design

QuickNotes is a software engineering final project with two parts:

1. A working browser API client built with plain HTML, CSS, and JavaScript,
   using JSONPlaceholder to demonstrate GET, POST, and DELETE requests.
2. Design documents for a future authenticated QuickNotes service supporting
   one million registered users.

The production backend, database, and infrastructure are proposed designs;
they are not implemented or deployed by this repository.

## Project files

| File                   | Purpose                                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `index.html`           | Semantic page structure, accessible form, status announcements, and notes list.                             |
| `style.css`            | Responsive layout, readable styling, visible keyboard focus, and distinct success/error messages.           |
| `api.js`               | HTTP requests, validation, application state, safe rendering, and event handling.                           |
| `docs/api-design.md`   | Production REST endpoints, JSON examples, authentication, ownership, pagination, and errors.                |
| `docs/data-model.md`   | PostgreSQL tables, constraints, relationships, SQL queries, and indexes.                                    |
| `docs/architecture.md` | Requirements, workload/storage calculations, architecture diagram, request flows, trade-offs, and recovery. |
| `README.md`            | Project overview, running instructions, testing checklist, learning points, and submission instructions.    |

## How to run the API client

Requirements: a modern browser and an internet connection to JSONPlaceholder.
There are no package dependencies or build steps. No API key, login, Node.js,
or database installation is required.

1. Download or clone the repository, keeping the files in their original
   folders. Open the project folder in Antigravity if editing the code.
2. Save the files and open `index.html` in your browser. Keep `style.css` and
   `api.js` beside it so the relative file references work.
3. Select **Load notes**. Ten sample posts should appear as notes, with the
   message **Loaded 10 notes from the server.**
4. Enter a title and optional body, then select **Create note**. A successful
   response prepends the returned note, reports the actual HTTP status and ID,
   and clears the form.
5. Select a note's **Delete** button. The selected note disappears only after
   a successful DELETE response.

### Optional local HTTP server

If your browser restricts requests from local files, serve the project over
HTTP. If Python 3 is already installed, run this from the project folder:

```bash
python -m http.server 8000 --bind 127.0.0.1
```

If your Python 3 command is `python3`, use that instead of `python`.
Open [http://127.0.0.1:8000](http://127.0.0.1:8000) and leave the terminal
running. Press `Ctrl+C` to stop the server. This is a local development server;
the client still sends API requests directly to JSONPlaceholder.

## Working browser features

| Action      | Practice API request                                       | Behavior                                                                                                           |
| ----------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Load notes  | `GET https://jsonplaceholder.typicode.com/posts?_limit=10` | Displays each returned title/body and the returned count; shows loading, success, error, or an empty list message. |
| Create note | `POST https://jsonplaceholder.typicode.com/posts`          | Sends `{ title, body, userId: 1 }`; prepends the returned note and reports the actual status/ID.                   |
| Delete note | `DELETE https://jsonplaceholder.typicode.com/posts/{id}`   | Removes only the selected displayed note after HTTP success.                                                       |

Titles are required, cannot contain only whitespace, and cannot exceed 100
characters. The body is optional. The required title and maximum length are
declared in HTML and also checked in JavaScript.

The reusable async `request()` function checks `response.ok`, reports useful
errors, supports successful empty response bodies, and applies a 15-second
timeout. Request handlers use `try/catch/finally` so controls recover after
both success and failure.

List-changing requests run one at a time. Load, create, and delete buttons are
disabled during a request to prevent duplicate actions and conflicting
results. A failed reload keeps the displayed notes; a failed create preserves
the draft; a failed delete keeps the selected note.

Rendering uses DOM creation methods and `textContent` for note content.
Semantic elements, explicit labels, status announcements, keyboard focus,
and messages containing words such as `Error` make the interface usable
without relying on color alone.

## JSONPlaceholder limitations

JSONPlaceholder is a practice API. POST and DELETE responses simulate changes;
the service does not persist this application's created or deleted notes.
The fixed `userId: 1` demonstrates the required payload and is not
authentication or an ownership check.

Multiple creates may return the same API ID, such as `101`. Each displayed
note therefore receives a separate internal `clientKey`. DELETE sends the
API ID in the URL, then removes only the selected client key after success.
It does not remove every displayed note with that API ID.

A successful **Load notes** replaces the displayed list with server samples:
locally created notes disappear and simulated deletions can reappear. A failed
reload leaves the current list intact. Refreshing the page resets all in-memory
notes because there is no local storage or persistent application backend.
Load the samples again to display them.

See the [official JSONPlaceholder documentation](https://jsonplaceholder.typicode.com/)
for its simulated write behavior.

## Production design documents

- [API design](docs/api-design.md): production `/notes`, `/tags`, and
  `/users/me` routes; authentication, ownership, validation, pagination,
  examples, and HTTP errors.
- [Data model](docs/data-model.md): PostgreSQL 18 definitions for `users`,
  `notes`, `tags`, and `note_tags`, including constraints, deletion behavior,
  indexes, and parameterized queries.
- [Architecture](docs/architecture.md): one-million-user assumptions,
  average/peak traffic, yearly storage, component diagram, request flows,
  consistency, failover, and operational trade-offs.

These documents agree on UUID identifiers, snake_case fields, private data,
cursor ordering, and durable writes. Initial user-facing note reads use the
primary database; the reporting replica can tolerate lag. Optional queue work
does not determine whether a note has been saved.

Authentication, tags, editing through PATCH, pagination, real persistence,
replication, cache, queues, and database failover are described for the future
backend team. They are not features of this JSONPlaceholder browser demo.
The architecture's performance and availability figures are proposed targets,
not benchmark results.

## Manual testing checklist

Run these checks in the browser before submission:

- Load notes and confirm ten titles/bodies and the exact ten-note success
  message. Check that the loading button is disabled while the request runs.
- Create a note with a title and no body. Confirm it appears first, the status
  reports the returned code/ID, and the form clears only after success.
- Reject a blank or whitespace-only title. Confirm normal input is limited
  to 100 characters; JavaScript also rejects longer programmatically set values.
- Create two notes, then delete one. If their API IDs repeat, confirm the
  other displayed note remains.
- Delete all displayed notes and confirm an empty-state message appears
  inside the notes list.
- Simulate a failed network request using browser developer tools. Confirm
  an error message appears, controls recover, and notes/draft data are retained
  as appropriate for the failed action. Restore network access afterward.
- Navigate by keyboard and check labels, focus visibility, and operation
  feedback. Check the layout at a narrow browser width.
- Reload the notes and refresh the page to confirm the documented simulated
  persistence behavior.

## What I learned

- `fetch()` does not reject simply because an HTTP response is `400` or `500`;
  checking `response.ok` is necessary before treating a request as successful.
- A successful DELETE can have no JSON body. Reading the response safely
  avoids turning a valid `204` into a parsing error.
- HTML validation improves the form experience, while JavaScript must also
  reject whitespace-only and overlong titles before sending a request.
- Separate API identifiers and local display keys prevent repeated practice
  IDs from causing the wrong note to be removed.
- Relational foreign keys, composite keys, and transactions can enforce
  ownership relationships and prevent duplicate note/tag associations.
- Average traffic, peak traffic, live data, replicas, and backups represent
  different capacity needs; clear assumptions make system estimates useful.
- Meaningful Git commits record completed stages and make changes easier
  to review and troubleshoot.

## Git history and submission

Repository name: **quicknotes-system-design**. The submitted GitHub repository
must be public and contain at least five meaningful commits. The suggested
stages are:

1. `Add API client with GET`
2. `Add create note with POST`
3. `Add delete with DELETE`
4. `Add API design doc`
5. `Add data model doc`
6. `Add architecture doc`
7. `Add README`

Use the actual history of completed work. Preserve existing meaningful
commits and commit any still-uncommitted completed stages before the final
README commit.

From the existing project repository:

```bash
git status
git log --oneline
git remote -v
git add README.md
git commit -m "Add README"
```

Verify that `origin` points to the intended GitHub repository. If `origin`
does not exist, copy the HTTPS URL from your repository and add it. Replace
`YOUR-USERNAME` below with your actual account name:

```bash
git remote add origin https://github.com/YOUR-USERNAME/quicknotes-system-design.git
```

Push the current branch, retaining its existing name:

```bash
git push -u origin HEAD
```

Then check the committed files and history:

```bash
git ls-tree -r --name-only HEAD
git rev-list --count HEAD
git log --oneline
git status
```

The file listing must include all seven files above, the history must contain
at least five meaningful commits, and all intended changes must be committed.
If a push is rejected, resolve the reported problem while preserving existing
history before treating the upload as complete.

Open the GitHub repository and verify the submitted branch, public visibility,
all root files, all three files inside `docs`, and the README's document links.
Check that the submitted branch is the default branch or is the branch your
instructor will inspect. Open the repository in a signed-out/private browser
window to confirm public access.

Submit the repository URL in the form:

```text
https://github.com/YOUR-USERNAME/quicknotes-system-design
```

Creating a local commit does not publish it. Only claim submission is complete
after the push succeeds and the GitHub files and history have been checked.
