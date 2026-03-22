# Plan: Authentication + Multi-Chat Management

## Context

The Wonder app has no authentication — it's fully public with user preferences stored in localStorage. The FastAPI backend already expects a `user_id` (auth subject) and `session_id` (UUID) per chat request, and has MongoDB schemas for users and sessions, but currently defaults to `"default_user"`. We need to:
1. Add **better-auth** with Spotify OAuth + email/password, backed by MongoDB
2. Add **multi-chat management** — each chat is a `session_id` UUID, multiple can run concurrently in the background
3. Wire the auth user identity through to the backend

**Key constraint**: Next.js 16.2.1 renamed `middleware.ts` → `proxy.ts` and the export from `middleware` → `proxy`. This is a breaking change from all training data.

---

## Implementation Plan

### Phase 0: Install Packages

```
better-auth
```
No UUID package needed — use native `crypto.randomUUID()`.

Add to `.env` (parent dir, per `next.config.ts`'s `envPath`):
```
BETTER_AUTH_SECRET=<openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:3000
SPOTIFY_CLIENT_ID=<from Spotify Developer Dashboard>
SPOTIFY_CLIENT_SECRET=<from Spotify Developer Dashboard>
BACKEND_URL=http://localhost:8001
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Register Spotify OAuth redirect URI: `http://localhost:3000/api/auth/callback/spotify`

---

### Phase 1: better-auth Core (server + client)

**`src/lib/auth.ts`** (server-only) — includes the `username` plugin:
```ts
import { betterAuth } from "better-auth";
import { MongoClient } from "mongodb";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { username } from "better-auth/plugins";

const client = new MongoClient(process.env.MONGODB_URI!);
const db = client.db(process.env.MONGODB_DB_NAME!);

export const auth = betterAuth({
  database: mongodbAdapter(db, { client }),
  emailAndPassword: { enabled: true },
  socialProviders: {
    spotify: {
      clientId: process.env.SPOTIFY_CLIENT_ID!,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
    },
  },
  account: {
    accountLinking: { enabled: true, trustedProviders: ["email-password", "spotify"] },
  },
  plugins: [username()],
});
```
better-auth creates its own collections (`user`, `session`, `account`, `verification`) — no collision with backend's `users`/`sessions`. The `username` plugin adds a `username` field to the `user` collection.

**`src/lib/auth-client.ts`** (client-only) — includes `usernameClient` plugin:
```ts
import { createAuthClient } from "better-auth/client";
import { usernameClient } from "better-auth/client/plugins";
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  plugins: [usernameClient()],
});
export const { useSession, signIn, signOut, signUp } = authClient;
```

**`src/app/api/auth/[...all]/route.ts`**:
```ts
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
export const { GET, POST } = toNextJsHandler(auth);
```

---

### Phase 2: Route Protection (`src/proxy.ts`)

⚠️ **CRITICAL**: Next.js 16.2.1 uses `proxy.ts`, not `middleware.ts`. Export `proxy`, not `middleware`.

```ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  const { pathname } = request.nextUrl;

  if (!sessionCookie && pathname === "/") {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  if (sessionCookie && (pathname === "/sign-in" || pathname === "/sign-up")) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/sign-in", "/sign-up"],
};
```

---

### Phase 3: AuthContext + Layout

**`src/lib/AuthContext.tsx`** — thin wrapper around `useSession()`:
```ts
export function AuthProvider({ children }) { ... }
export function useAuth() { return useContext(AuthContext); }
// Returns: { user: { id, name, email, image } | null, isPending: boolean }
```

**`src/app/layout.tsx`** — wrap `<body>` with `<AuthProvider>`.

---

### Phase 4: Auth Pages

**`src/app/sign-in/page.tsx`** — client component with:
- "Sign in with Spotify" → `signIn.social({ provider: "spotify", callbackURL: "/" })`
- Email/password form → `signIn.email({ email, password, callbackURL: "/" })`
- Wonder neobrutalist style: `border-2 border-[#2D2D2D]`, `hard-shadow`, `bg-[#FDFDFB]`, `rounded-2xl`

**`src/app/sign-up/page.tsx`** — same style, uses `signUp.email(...)`.

---

### Phase 5: Multi-Chat Management

**Types** — add to `src/types/index.ts`:
```ts
export interface Chat {
  id: string;           // UUID = backend session_id
  title: string;        // derived from first user message
  createdAt: Date;
  lastMessagePreview: string;
}
```

**`src/lib/ChatContext.tsx`** (new):
- State: `chats: Chat[]`, `activeChatId: string | null`, `messages: Map<string, ChatMessage[]>`, `loadingChats: Set<string>`
- Persisted to localStorage keyed by `user.id` (prevents profile bleed between users)
- On mount: loads from localStorage, reconciles with backend

Key functions:
- `createChat()` → `crypto.randomUUID()`, calls `POST http://localhost:8001/session/new`, adds to state, returns id
- `switchChat(id)` → sets `activeChatId`, loads messages from cache or backend
- `setLoading(chatId, bool)` → updates `loadingChats` set (enables background chat dots in sidebar)
- `updateChatPreview(chatId, text)` → updates sidebar preview text

**`src/app/layout.tsx`** — add `<ChatProvider>` inside `<AuthProvider>`:
```tsx
<AuthProvider>
  <ChatProvider>   {/* ChatProvider uses useAuth() internally */}
    {children}
  </ChatProvider>
</AuthProvider>
```

---

### Phase 6: New ChatSidebar Component

**`src/components/ChatSidebar.tsx`** (new):
- Lists all chats, highlights active chat
- "New Chat" button → calls `createChat()`, switches to it
- Per-chat loading dot when `loadingChats.has(chat.id)` (background chat indicator)
- Collapsible, neobrutalist style matching existing components
- Mounted in `src/app/page.tsx` to the left of `CopilotChat`

---

### Phase 7: Update Existing Files

**`src/components/CopilotChat.tsx`**:
- Replace `useState<ChatMessage[]>` with `activeMessages` from `ChatContext`
- Add `session_id: activeChatId` and `user_id: user.id` to every `/api/chat` POST body
- Call `setLoading(activeChatId, true/false)` around fetch (enables background chat)
- Call `updateChatPreview(activeChatId, ...)` after response
- If `activeChatId` is null (no chat yet), auto-call `createChat()` on first message send

**`src/app/api/chat/route.ts`**:
- Extract `session_id` and `user_id` from request body
- After `finalText` is resolved, fire-and-forget persist to backend:
  ```ts
  fetch(`${process.env.BACKEND_URL}/chat`, { method: "POST", ... }).catch(() => {});
  ```

**`src/components/Header.tsx`**:
- Replace the existing WonderProfileModal trigger button with an **avatar + display label** button
- Display logic:
  - If `user.username` exists → show `@username`
  - Else if `user.name` exists → show name (no `@`)
  - Else → show `anonymous`
- Avatar: `user.image` (Spotify profile picture) or initials circle fallback
- On click → opens a `UserProfileDropdown` (see below)
- Remove the standalone WonderProfileModal trigger; it moves inside the dropdown

**`src/components/UserProfileDropdown.tsx`** (new):
- Dropdown that appears when the avatar button is clicked
- Sections:
  1. **User info** — avatar, display name/username
  2. **Connect Spotify** (shown only if no Spotify account linked): `signIn.social({ provider: "spotify" })` with `fetchOptions: { onSuccess: () => router.refresh() }` to link to existing account
  3. **Set Username** (shown if no username yet): small inline input + `authClient.updateUser({ username: "..." })`
  4. **App preferences** — triggers existing WonderProfileModal
  5. **Sign out** — `signOut({ callbackURL: "/sign-in" })`
- Detecting Spotify linked status: check `useListAccounts()` from better-auth client for a `spotify` provider entry
- Style: neobrutalist dropdown, `border-2 border-[#2D2D2D]`, `hard-shadow`, positioned below avatar button

**`src/components/WonderProfileModal.tsx`**:
- Change localStorage key from `"wonderprofile"` → `` `wonderprofile:${user.id}` ``
- Triggered from the UserProfileDropdown, not directly from Header

**`next.config.ts`**:
- Add `BACKEND_URL`, `NEXT_PUBLIC_APP_URL`, `MONGODB_URI`, `MONGODB_DB_NAME` to `env` block
- Note: `BETTER_AUTH_SECRET`, `MONGODB_URI` must NOT be `NEXT_PUBLIC_*`

---

## Critical Files

| File | Action |
|------|--------|
| `src/lib/auth.ts` | **NEW** — server-side better-auth config |
| `src/lib/auth-client.ts` | **NEW** — client-side auth hooks |
| `src/app/api/auth/[...all]/route.ts` | **NEW** — better-auth handler |
| `src/proxy.ts` | **NEW** — route protection (NOT middleware.ts) |
| `src/lib/AuthContext.tsx` | **NEW** — useAuth hook |
| `src/lib/ChatContext.tsx` | **NEW** — multi-chat state manager |
| `src/app/sign-in/page.tsx` | **NEW** — sign-in page |
| `src/app/sign-up/page.tsx` | **NEW** — sign-up page |
| `src/components/ChatSidebar.tsx` | **NEW** — chat list UI |
| `src/app/layout.tsx` | **MODIFY** — add AuthProvider + ChatProvider |
| `src/app/page.tsx` | **MODIFY** — add ChatSidebar |
| `src/components/CopilotChat.tsx` | **MODIFY** — wire ChatContext + auth |
| `src/app/api/chat/route.ts` | **MODIFY** — session_id/user_id + backend persist |
| `src/components/Header.tsx` | **MODIFY** — avatar + `@username`/name/anonymous label, opens dropdown |
| `src/components/UserProfileDropdown.tsx` | **NEW** — connect Spotify, set username, app prefs, sign out |
| `src/components/WonderProfileModal.tsx` | **MODIFY** — namespace localStorage by user.id; triggered from dropdown |
| `next.config.ts` | **MODIFY** — expose new env vars |

---

## Verification

1. `npm run dev` — app should redirect to `/sign-in`
2. Sign in with Spotify → redirected to `/`, Spotify profile picture in Header
3. Create new chat → UUID appears in sidebar, POST to backend `/session/new`
4. Send message → `session_id` and `user_id` in request body, sidebar shows loading dot
5. Open second chat while first is loading → both run concurrently, sidebar shows two loading dots
6. Sign out → redirect to `/sign-in`, sign back in → chats persist (localStorage keyed by user ID)
7. Email/password sign-up + sign-in flow works independently of Spotify
