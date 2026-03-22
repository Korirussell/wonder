"use client";

import { createAuthClient } from "better-auth/react";
import { anonymousClient, usernameClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  plugins: [usernameClient(), anonymousClient()],
});

export const { signIn, signOut, signUp, updateUser, useSession } = authClient;
