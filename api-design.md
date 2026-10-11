# QuickNotes API Design

## 1. Purpose and scope

This document specifies the proposed production QuickNotes API for a service
with one million registered users. The backend described here has not been
implemented by this repository.

The working browser client uses JSONPlaceholder at
`https://jsonplaceholder.typicode.com/posts`. It demonstrates GET, POST, and
DELETE, sends the practice API's `userId: 1`, and handles simulated persistence.
It does not implement production authentication, private storage, tags, PATCH,
or pagination. Do not change the browser's required practice endpoints to the
production paths below.

Production scope: authenticated users create, list, read, update, and delete
their own notes; create and manage their own tags; and attach or detach tags.
Notes and tags are private. Sharing and real-time collaborative editing are
outside the initial scope.

## 2. API conventions

- Illustrative origin: `https://api.quicknotes.example`. This is not a live service.
- Paths are relative to that origin, with no additional prefix: `/notes`,
  `/tags`, and `/users/me`. Architecture flows use these same paths.
- Use HTTPS, `Accept: application/json`, and `Content-Type: application/json`
  for requests that contain a JSON body.
- JSON field names use snake_case. In particular, production uses `user_id`,
  while the separate practice API requires `userId`.
- User, note, and tag IDs are server-generated UUIDs serialized as strings.
- Timestamps use UTC ISO 8601 strings, such as `2026-10-11T19:00:00Z`.
- Single-resource responses contain the resource object. Collection responses
  contain `data` and `pagination`.
- All authenticated API responses use `Cache-Control: private, no-store`.
  The CDN must not cache private API responses.
- `201 Created` includes a `Location` header for the new resource. Successful
  `204 No Content` responses have no response body.
- Example tokens, cursors, IDs, and timestamps below are illustrative values.

## 3. Authentication and ownership

The future production client signs in with one configured OpenID Connect
identity provider, using the authorization-code flow with PKCE (`S256`). The
provider handles registration and credentials; QuickNotes does not store
passwords in its application tables.

Protected requests carry a short-lived access token:

```http
Authorization: Bearer example-access-token
```

For JWT access tokens, app servers validate the signature using trusted
provider keys and an allowed algorithm, then check the configured issuer,
QuickNotes audience, expiry, and subject. An ID token must not be accepted as
an API access token. The verified subject maps to `users.auth_subject`; one
trusted issuer is configured, so this mapping is unambiguous. Account
provisioning happens during the trusted sign-in lifecycle.

Required scopes are `profile:read`, `notes:read`, `notes:write`, `tags:read`,
and `tags:write`, as appropriate for the endpoint. Note/tag association writes
require both write scopes; listing a note's tags requires both read scopes.

- Missing or invalid authentication returns `401` with a `WWW-Authenticate:
Bearer` challenge. Invalid tokens also use `error="invalid_token"` in that
  header.
- A valid token without the required scope returns `403`.
- The backend derives `user_id` from the verified identity. Clients cannot
  choose the owner by submitting `user_id` or `userId`.
- Every resource query includes the authenticated user's ID. For example,
  retrieving a note checks both `notes.id` and `notes.user_id`.
- A missing resource or one owned by someone else returns the same `404`
  response, preventing disclosure of another user's resources.
- Attaching a tag requires both the note and tag to belong to the current
  user. Database constraints also enforce that association rule.

## 4. REST endpoints

All endpoints below require authentication and the relevant scopes.

| Method | Path                             | Description                                                                   | Success status |
| ------ | -------------------------------- | ----------------------------------------------------------------------------- | -------------- |
| GET    | `/users/me`                      | Read the signed-in user's profile.                                            | 200 OK         |
| GET    | `/notes`                         | List the user's notes using cursor pagination; optionally filter by `tag_id`. | 200 OK         |
| POST   | `/notes`                         | Create and durably store a note owned by the user.                            | 201 Created    |
| GET    | `/notes/{note_id}`               | Read one owned note.                                                          | 200 OK         |
| PATCH  | `/notes/{note_id}`               | Update the supplied title and/or body of an owned note.                       | 200 OK         |
| DELETE | `/notes/{note_id}`               | Permanently delete an owned note and its tag associations.                    | 204 No Content |
| GET    | `/tags`                          | List the user's tags using cursor pagination.                                 | 200 OK         |
| POST   | `/tags`                          | Create an owned tag.                                                          | 201 Created    |
| GET    | `/tags/{tag_id}`                 | Read one owned tag.                                                           | 200 OK         |
| PATCH  | `/tags/{tag_id}`                 | Rename an owned tag.                                                          | 200 OK         |
| DELETE | `/tags/{tag_id}`                 | Delete an owned tag and its associations; keep the notes.                     | 204 No Content |
| GET    | `/notes/{note_id}/tags`          | List tags attached to an owned note using cursor pagination.                  | 200 OK         |
| PUT    | `/notes/{note_id}/tags/{tag_id}` | Ensure the owned tag is attached to the owned note.                           | 204 No Content |
| DELETE | `/notes/{note_id}/tags/{tag_id}` | Ensure that association is removed.                                           | 204 No Content |

Association PUT and DELETE requests have no body and are idempotent: repeating
them leaves the association in the same final state. For DELETE of an
association, an already-absent association returns `204` if both resources
still exist and are owned by the user. A missing or inaccessible note/tag
returns `404`. Deleting a note or tag that has already been deleted returns
`404`; the resulting resource state is still idempotent.

## 5. Resource fields and validation

### Notes

| Field        | Type                 | Rule                                                                                                                       |
| ------------ | -------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `id`         | UUID string          | Generated by the server; read-only.                                                                                        |
| `user_id`    | UUID string          | Derived from the authenticated user; read-only.                                                                            |
| `title`      | String               | Required on create; trim surrounding whitespace; 1–100 characters after normalization; whitespace-only titles are invalid. |
| `body`       | String               | Optional on create; defaults to `""`; maximum 10,000 characters; preserve content and line breaks.                         |
| `created_at` | UTC timestamp string | Set by the server; immutable.                                                                                              |
| `updated_at` | UTC timestamp string | Set by the server on create and content updates.                                                                           |

POST accepts only `title` and optional `body`. PATCH accepts `title` and/or
`body` and must contain at least one of them; omitted fields remain unchanged.
Reject nulls, wrong types, unknown fields, and attempts to set read-only fields
with `400`. A PATCH is applied atomically. The initial editing policy is
last-write-wins: concurrent edits to the same note keep the last committed
values. Optimistic version checking is a possible later improvement.

### Tags and users

A tag contains `id`, `user_id`, `name`, `created_at`, and `updated_at`. POST and
PATCH accept only `name`: a trimmed, nonblank string of 1–50 characters. Names
must be unique within one user's tags; comparison is case-sensitive. A
duplicate name returns `409`. Two different users may have identically named
tags. Association rows use `note_id`, `tag_id`, and `user_id`, with one row per
note/tag pair; duplicate associations are prevented by the database.

`GET /users/me` returns `id`, `email`, `display_name`, and `created_at`. The
internal `auth_subject` is not returned. User profile changes and account
lifecycle operations are managed separately from these initial API routes.

Enforce the same validation on the backend even if a browser validates first.
Limit JSON request bodies to 256 KiB; oversized bodies return `413`. A JSON
endpoint receiving an unsupported media type returns `415`. Do not interpret
note content as HTML or concatenate client values into SQL.

## 6. Create a note: request and response

Request headers:

```http
POST /notes HTTP/1.1
Host: api.quicknotes.example
Authorization: Bearer example-access-token
Accept: application/json
Content-Type: application/json
```

Request JSON:

```json
{
  "title": "Prepare final presentation",
  "body": "Review the API design and explain the database relationships."
}
```

The app server authenticates, validates, assigns the user and UUID, inserts the
note on the primary database, and commits the transaction. Return `201` only
after durable commit; placing a job on a queue is not sufficient to claim that
the note was created. Optional background analytics do not block creation.

Response headers:

```http
HTTP/1.1 201 Created
Location: /notes/22222222-2222-4222-8222-222222222222
Content-Type: application/json
Cache-Control: private, no-store
```

Response JSON:

```json
{
  "id": "22222222-2222-4222-8222-222222222222",
  "user_id": "11111111-1111-4111-8111-111111111111",
  "title": "Prepare final presentation",
  "body": "Review the API design and explain the database relationships.",
  "created_at": "2026-10-11T19:00:00Z",
  "updated_at": "2026-10-11T19:00:00Z"
}
```

## 7. List notes: request, pagination, and response

Request:

```http
GET /notes?limit=2 HTTP/1.1
Host: api.quicknotes.example
Authorization: Bearer example-access-token
Accept: application/json
```

GET has no JSON request body. For clarity, the query parameters in this example
can be represented as the following JSON; it is documentation, not a body to
send:

```json
{
  "limit": 2
}
```

Response status is `200 OK`, with `Content-Type: application/json` and
`Cache-Control: private, no-store`:

```json
{
  "data": [
    {
      "id": "22222222-2222-4222-8222-222222222222",
      "user_id": "11111111-1111-4111-8111-111111111111",
      "title": "Prepare final presentation",
      "body": "Review the API design and explain the database relationships.",
      "created_at": "2026-10-11T19:00:00Z",
      "updated_at": "2026-10-11T19:00:00Z"
    },
    {
      "id": "33333333-3333-4333-8333-333333333333",
      "user_id": "11111111-1111-4111-8111-111111111111",
      "title": "Check browser client",
      "body": "Test GET, POST, DELETE, validation, and error recovery.",
      "created_at": "2026-10-11T18:00:00Z",
      "updated_at": "2026-10-11T18:30:00Z"
    }
  ],
  "pagination": {
    "limit": 2,
    "next_cursor": "opaque-example-cursor"
  }
}
```

Pagination rules:

- `limit` defaults to 20 and accepts integers from 1 to 100.
- Sort collections by the listed resource's `created_at DESC, id DESC`. The ID
  breaks ties and creation times do not change when content is edited.
- `cursor` is omitted for the first page. Use the returned opaque cursor for
  the next request, for example `/notes?limit=2&cursor=opaque-example-cursor`.
  The example cursor is a placeholder; real cursors are server-generated.
- A real cursor is signed and binds the last item's creation time and ID to
  the authenticated user, collection path, and active filters. Validate it
  before querying; malformed, tampered, or mismatched cursors return `400`.
- Fetch `limit + 1` rows to determine whether another page exists, return at
  most `limit`, and build the next cursor from the last returned item.
- Return `next_cursor: null` when no further rows exist. Empty collections
  return `200`, `data: []`, and a null cursor, rather than `404`.
- This is cursor/keyset pagination, not OFFSET pagination or a multi-request
  snapshot. Newly inserted notes appear on a fresh first page; concurrent
  deletions or tag changes can change later pages.
- Optional `tag_id` on `/notes` must identify an owned tag. A valid but missing
  or inaccessible tag returns `404`; malformed UUIDs return `400`.
- `/tags` and `/notes/{note_id}/tags` use the same envelope and pagination rules,
  ordering by the tag's creation time and ID.

## 8. Other request shapes

Update a note with `PATCH /notes/{note_id}`:

```json
{
  "title": "Prepare presentation slides"
}
```

Return `200` with the complete updated note object and a new `updated_at`.

Create or rename a tag with `POST /tags` or `PATCH /tags/{tag_id}`:

```json
{
  "name": "Coursework"
}
```

Tag creation returns `201`, a `Location: /tags/{tag_id}` header, and a tag object;
renaming returns `200` and the updated object. A tag object has this shape:

```json
{
  "id": "44444444-4444-4444-8444-444444444444",
  "user_id": "11111111-1111-4111-8111-111111111111",
  "name": "Coursework",
  "created_at": "2026-10-11T19:05:00Z",
  "updated_at": "2026-10-11T19:05:00Z"
}
```

Attach that tag with:

```http
PUT /notes/22222222-2222-4222-8222-222222222222/tags/44444444-4444-4444-8444-444444444444 HTTP/1.1
Host: api.quicknotes.example
Authorization: Bearer example-access-token
```

Return `204` with no body after the association transaction commits. Removing
the association uses DELETE on the same path. Removing a note or tag uses
DELETE on its resource path and cascades only to association rows.

## 9. Error responses

| HTTP status                | Error code               | When returned                                                                       |
| -------------------------- | ------------------------ | ----------------------------------------------------------------------------------- |
| 400 Bad Request            | `bad_request`            | Invalid JSON, field/type/length, UUID, limit, or cursor.                            |
| 401 Unauthorized           | `unauthorized`           | Missing, expired, or invalid access token.                                          |
| 403 Forbidden              | `forbidden`              | Valid authentication but insufficient endpoint scope.                               |
| 404 Not Found              | `not_found`              | Resource missing or outside the authenticated user's ownership.                     |
| 409 Conflict               | `conflict`               | Tag name already exists for this user.                                              |
| 413 Content Too Large      | `payload_too_large`      | JSON body exceeds 256 KiB.                                                          |
| 415 Unsupported Media Type | `unsupported_media_type` | A JSON-body endpoint receives an unsupported content type.                          |
| 429 Too Many Requests      | `rate_limited`           | Per-user request limit exceeded; include `Retry-After`.                             |
| 500 Internal Server Error  | `internal_error`         | Unexpected server failure; expose no implementation details.                        |
| 503 Service Unavailable    | `service_unavailable`    | Temporary dependency outage or database failover; include `Retry-After` when known. |

All errors use the same JSON shape. `details` is an array and may be empty.
`request_id` is generated by the service for tracing; logs must omit tokens
and private note content.

Example `400` response:

```json
{
  "error": {
    "code": "bad_request",
    "message": "The request contains invalid fields.",
    "details": [
      {
        "field": "title",
        "message": "Title must contain between 1 and 100 characters."
      }
    ],
    "request_id": "55555555-5555-4555-8555-555555555555"
  }
}
```

For `401`, `403`, `404`, or `500`, change the code/message appropriately and
return `details: []` unless safe additional information helps the caller. Do
not reveal whether a different user's resource exists or return stack traces.

## 10. Consistency, deletion, and retries

Writes commit on the primary database before success. Initial user-facing
note reads also use the primary, providing read-your-writes behavior after a
successful create/update/delete. Private note responses are not cached in the
initial design. Replica-based reporting may be delayed and must not determine
write success or ownership checks.

Deleting a note removes its note_tags rows, not the tags. Deleting a tag removes
its note_tags rows, not the notes. These changes happen in a database
transaction, consistent with the relationships in the data model.

POST is not idempotent. If a connection fails after commit, the client may not
know that creation succeeded; avoid automatic retries and inspect the notes
list before retrying manually. The initial API does not guarantee duplicate
prevention for retried creates. An idempotency-key extension is a possible
future improvement. Queue workers never perform the core note save after a
creation response has already been sent.

## 11. References

- [HTTP semantics: RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html)
- [Bearer token usage: RFC 6750](https://www.rfc-editor.org/rfc/rfc6750.html)
- [OAuth security best current practice: RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html)
- [JWT best current practices: RFC 8725](https://www.rfc-editor.org/rfc/rfc8725.html)
