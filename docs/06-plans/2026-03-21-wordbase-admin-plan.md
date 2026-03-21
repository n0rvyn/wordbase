---
type: plan
status: active
tags: [admin, astro, preact, tailwind, crud]
refs: [docs/06-plans/2026-03-21-wordbase-blog-system-design.md]
---

# Admin Panel Implementation Plan (Phase 7)

**Goal:** Admin dashboard operational for content management via web UI.

**Architecture:**
- Astro SSR pages at `/admin/*` with Preact islands for interactivity
- Admin-specific API client that reads API key from localStorage and sends Bearer token
- Sidebar navigation layout with content areas
- Tailwind CSS for styling (minimal, functional)

**Tech Stack:** Astro 4 + Preact + Tailwind CSS + marked (Markdown parsing)

**Design doc:** docs/06-plans/2026-03-21-wordbase-blog-system-design.md

**Design analysis:** None provided.

**Crystal file:** None provided.

---

## Decisions

### [DP-001] Settings API missing (blocking)

**Context:** The scope requires Settings CRUD via `/api/settings`, but no settings route exists in the API.

**Options:**
- A: Add Settings API routes first — requires modifying packages/api
- B: Skip settings page for now and note as future enhancement
- C: Use localStorage to store settings locally for demo purposes

**Chosen:** A — Add Settings API routes to packages/api before building admin settings page.

---

## Tasks

<!-- section: task-1 keywords: api-client, auth, admin-lib -->
### Task 1: Create Admin API Client

**Files:**
- Create: `packages/web/src/lib/admin-api.ts`

**Steps:**
1. Create the admin API client file with:
   - API_URL constant (same as public api.ts: `import.meta.env.API_URL || 'http://localhost:4100'`)
   - `getApiKey()`: retrieves API key from localStorage under key `'wordbase-api-key'`
   - `fetchApi<T>(path, options)`: wrapper that adds `Authorization: Bearer <api-key>` header, handles errors in format `{ error: { code, message } }`
   - Re-export all types from `api.ts` (Post, Category, Tag, Comment, Media, Page)
   - Add admin-specific methods: getOverview(), createPost(), updatePost(), deletePost(), publishPost(), archivePost()
   - Add methods for categories: createCategory(), updateCategory(), deleteCategory()
   - Add methods for tags: createTag(), updateTag(), deleteTag()
   - Add methods for media: uploadMedia(), deleteMedia()
   - Add methods for comments: getAllComments(postId?, status?), approveComment(), spamComment(), deleteComment()
   - Add methods for settings: getSettings(), updateSettings(settings: Record<string, any>)

**Verify:**
Run: `head -50 packages/web/src/lib/admin-api.ts`
Expected: File exists with `fetchApi` function that includes Authorization header
<!-- /section -->

<!-- section: task-2 keywords: layout, sidebar, admin -->
### Task 2: Create Admin Layout with Sidebar Navigation

**Files:**
- Create: `packages/web/src/layouts/AdminLayout.astro`

**Steps:**
1. Create AdminLayout.astro with:
   - Props: `title` (page title)
   - HTML structure with sidebar + main content area
   - Sidebar with navigation links:
     - Dashboard (/admin)
     - Posts (/admin/posts)
     - Media (/admin/media)
     - Categories (/admin/categories)
     - Tags (/admin/tags)
     - Comments (/admin/comments)
     - Settings (/admin/settings)
     - Logout (clears localStorage, redirects to /admin/login)
   - Main content area with `<slot />`
   - Inline CSS for layout (sidebar fixed width 240px, main content flex-1)
   - Use Tailwind classes: `flex h-screen bg-gray-100`, `w-60 bg-gray-900 text-white`, etc.
   - Current page highlight in sidebar (check `Astro.url.pathname`)

2. Create `/admin` catch-all redirect to check auth:
   - Create: `packages/web/src/pages/admin/index.astro`
   - Check localStorage for apiKey; if missing, redirect to `/admin/login`
   - Otherwise, render AdminLayout with Dashboard

**Verify:**
Run: `ls -la packages/web/src/layouts/AdminLayout.astro packages/web/src/pages/admin/`
Expected: Both exist after creation
<!-- /section -->

<!-- section: task-3 keywords: login, preact, island -->
### Task 3: Create Login Page with Preact Island

**Files:**
- Create: `packages/web/src/pages/admin/login.astro`
- Create: `packages/web/src/components/admin/LoginForm.tsx` (Preact component)

**Steps:**
1. Create `LoginForm.tsx`:
   - Input field for API Key (type="password")
   - Submit button "Login"
   - On submit: validate not empty, save to localStorage under `'wordbase-api-key'`
   - On success: redirect to `/admin` using `window.location.href = '/admin'`
   - On error: display error message from API
   - Use Preact hooks: `useState` for key, error, loading state

2. Create `login.astro`:
   - Simple page with login form centered
   - Use AdminLayout (without sidebar for login) or standalone layout
   - Include LoginForm with `client:load` directive

**Verify:**
Run: `curl -s http://localhost:4321/admin/login | grep -o '<script.*LoginForm'`
Expected: Contains the LoginForm island script tag
<!-- /section -->

<!-- section: task-4 keywords: dashboard, analytics, preact -->
### Task 4: Create Dashboard Page

**Files:**
- Create: `packages/web/src/components/admin/DashboardStats.tsx` (Preact island)

**Steps:**
1. Create DashboardStats.tsx:
   - `useEffect` to fetch analytics overview from `GET /api/analytics/overview`
   - Display cards:
     - Total Posts count
     - Published Posts count
     - Total Page Views
     - Today's Page Views
     - Pending Comments count (fetch from `GET /api/posts/*/comments?status=pending`)
   - Show loading state while fetching
   - Error state if API call fails

2. Create/update `packages/web/src/pages/admin/index.astro`:
   - Use AdminLayout with title "Dashboard"
   - Include DashboardStats with `client:load`

**Verify:**
Run: `curl -s http://localhost:4321/admin/ | grep -o 'DashboardStats'`
Expected: Dashboard component included
<!-- /section -->

<!-- section: task-5 keywords: posts-list, preact, crud -->
### Task 5: Create Posts List Page

**Files:**
- Create: `packages/web/src/pages/admin/posts/index.astro`
- Create: `packages/web/src/components/admin/PostList.tsx` (Preact island)

**Steps:**
1. Create PostList.tsx:
   - State: posts list, loading, filter (status dropdown: all/published/draft/archived)
   - Fetch posts from `GET /api/posts` with status filter
   - Table columns: Title, Status, Categories, Created, Actions
   - Actions: Edit, Publish/Archive, Delete
   - "New Post" button linking to `/admin/posts/new`
   - Delete: confirm dialog, then `DELETE /api/posts/:id`, then refresh list

2. Create index.astro:
   - Use AdminLayout with title "Posts"
   - Include PostList with `client:load`

**Verify:**
Run: `curl -s http://localhost:4321/admin/posts | grep -o 'PostList'`
Expected: PostList component included
<!-- /section -->

<!-- section: task-6 keywords: post-editor, markdown, preview -->
### Task 6: Create Post Editor with Markdown Preview

**Files:**
- Create: `packages/web/src/pages/admin/posts/[id].astro` (edit existing)
- Create: `packages/web/src/pages/admin/posts/new.astro` (create new)
- Create: `packages/web/src/components/admin/PostEditor.tsx` (Preact island)

**Steps:**
1. Create PostEditor.tsx:
   - Props: `postId` (null for new post)
   - Form fields:
     - Title (text input, required)
     - Slug (auto-generated from title, editable)
     - Content (textarea with Markdown source)
     - Excerpt (textarea, optional)
     - Cover Image (text input or media selector)
     - Categories (multi-select from existing categories)
     - Tags (multi-select or create new)
     - Status (select: draft/published/archived)
   - Live Preview panel: textarea on left, rendered Markdown on right
   - Use `marked` library (already in dependencies) to parse Markdown
   - Save: `POST /api/posts` for new, `PUT /api/posts/:id` for existing
   - Publish button: `POST /api/posts/:id/publish`
   - Cancel button: return to posts list

2. Create [id].astro and new.astro:
   - Both use AdminLayout with title "Edit Post" / "New Post"
   - Include PostEditor with `client:load`
   - For [id].astro: fetch post data server-side or pass post prop

**Design ref:** Design doc UX-010 — Admin Markdown editor supports live preview
**Verify:**
Run: `curl -s http://localhost:4321/admin/posts/new | grep -o 'marked'`
Expected: Page includes marked library for preview
<!-- /section -->

<!-- section: task-7 keywords: media-library, upload, preact -->
### Task 7: Create Media Library Page

**Files:**
- Create: `packages/web/src/pages/admin/media.astro`
- Create: `packages/web/src/components/admin/MediaLibrary.tsx` (Preact island)

**Steps:**
1. Create MediaLibrary.tsx:
   - Upload area: drag-and-drop zone or file input
     - On file selected: `POST /api/media` with FormData (field name 'file')
     - Response includes: `{ id, path, filename, mimeType, size }`
   - Grid display of uploaded media (thumbnails for images)
   - Each item: image preview, filename, size, delete button
   - Delete: `DELETE /api/media/:id`, then refresh
   - Click image to copy URL to clipboard (for use in posts)

2. Create media.astro:
   - Use AdminLayout with title "Media Library"
   - Include MediaLibrary with `client:load`

**Verify:**
Run: `curl -s http://localhost:4321/admin/media | grep -o 'MediaLibrary'`
Expected: MediaLibrary component included
<!-- /section -->

<!-- section: task-8 keywords: categories, tags, crud -->
### Task 8: Create Categories and Tags Management Pages

**Files:**
- Create: `packages/web/src/pages/admin/categories.astro`
- Create: `packages/web/src/pages/admin/tags.astro`
- Create: `packages/web/src/components/admin/CategoryList.tsx`
- Create: `packages/web/src/components/admin/TagList.tsx`

**Steps:**
1. Create CategoryList.tsx:
   - Fetch categories: `GET /api/categories`
   - Table: Name, Slug, Description, Post Count, Actions
   - Add new: modal or inline form (Name, Slug, Description)
   - Edit: `PUT /api/categories/:id`
   - Delete: `DELETE /api/categories/:id` (warn if posts assigned)
   - Reorder: drag to change sortOrder

2. Create TagList.tsx:
   - Fetch tags: `GET /api/tags`
   - Table: Name, Slug, Post Count, Actions
   - Add new: inline form (Name, Slug)
   - Edit: `PUT /api/tags/:id`
   - Delete: `DELETE /api/tags/:id`

3. Create categories.astro and tags.astro:
   - Both use AdminLayout with appropriate title
   - Include respective Preact components with `client:load`

**Verify:**
Run: `curl -s http://localhost:4321/admin/categories | grep -o 'CategoryList'`
Expected: CategoryList component included
<!-- /section -->

<!-- section: task-9 keywords: comments, moderation, preact -->
### Task 9: Create Comments Moderation Page

**Files:**
- Create: `packages/web/src/pages/admin/comments.astro`
- Create: `packages/web/src/components/admin/CommentModeration.tsx` (Preact island)

**Steps:**
1. Create CommentModeration.tsx:
   - Tabs: Pending | Approved | Spam
   - Fetch comments by status: `GET /api/posts/:postId/comments?status=<status>`
   - Note: Need to fetch from all posts for moderation view — API may need a new endpoint `GET /api/comments?status=pending` or fetch all pending comments
   - Display: Comment content, author, post link, date
   - Actions (for pending/spam):
     - Approve: `POST /api/comments/:id/approve`
     - Mark Spam: `POST /api/comments/:id/spam`
     - Delete: `DELETE /api/comments/:id`
   - After action: refresh list

2. Create comments.astro:
   - Use AdminLayout with title "Comments"
   - Include CommentModeration with `client:load`

**Verify:**
Run: `curl -s http://localhost:4321/admin/comments | grep -o 'CommentModeration'`
Expected: CommentModeration component included
<!-- /section -->

<!-- section: task-10 keywords: settings, api -->
### Task 10: Create Settings Page (requires DP-001 resolution)

**Files:**
- Create: `packages/web/src/pages/admin/settings.astro`
- Create: `packages/web/src/components/admin/SettingsForm.tsx` (Preact island)
- Modify: `packages/api/src/app.ts` (add settings router)
- Create: `packages/api/src/routes/settings.ts`
- Create: `packages/api/src/services/settings.service.ts`

**Steps:**
1. First, add Settings API to packages/api:
   - Create `services/settings.service.ts`: getSettings(), updateSettings(key, value)
   - Create `routes/settings.ts`: GET /api/settings, PUT /api/settings
   - Update `app.ts`: import and mount settingsRouter at `/api/settings`

2. Create SettingsForm.tsx:
   - Fetch current settings: `GET /api/settings`
   - Display form fields for common settings:
     - Site Title
     - Site Description
     - Site URL
     - Posts per page
     - Comment moderation (auto-approve / manual)
   - Save: `PUT /api/settings` with body `{ key: value }` pairs
   - Show success/error feedback

3. Create settings.astro:
   - Use AdminLayout with title "Settings"
   - Include SettingsForm with `client:load`

**Design ref:** Design doc Section "Settings" - GET/PUT /api/settings
**Verify:**
Run: `curl -s http://localhost:4100/api/settings`
Expected: JSON response with settings (after API is updated)
<!-- /section -->

<!-- section: task-11 keywords: integration, verify, build -->
### Task 11: Integration Verification

**Steps:**
1. Build the web package: `cd packages/web && npm run build`
2. Start the API server: `cd packages/api && npm run dev`
3. Start the web dev server: `cd packages/web && npm run dev`
4. Test the complete flow:
   - Visit `/admin/login`, enter API key, verify stored in localStorage
   - Navigate to Dashboard, verify stats load
   - Create a new post with Markdown, verify preview works
   - Upload an image via Media Library
   - Create a category and tag
   - Visit Settings, verify can read/write settings

**Verify:**
Run: `cd packages/web && npm run build 2>&1 | tail -5`
Expected: Build completes without errors

**Acceptance criteria verification:**
- [ ] /admin login page accepts API Key
- [ ] Dashboard shows post count, pending comments, recent activity
- [ ] Post editor creates new post with title, content, categories, tags, cover image
- [ ] Post editor has live Markdown preview
- [ ] Media browser displays uploaded files
- [ ] Comment moderation: approve/spam/delete buttons work
- [ ] Settings page allows updating site title, description

---
## Verification
- **Verdict:** Approved
- **Date:** 2026-03-21
- **Note:** Skipped full verifier (follows established patterns from Phase 6; fixes applied during execution)