"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { parseForm, type ActionState } from "@/lib/forms";
import { createSession, deleteSession } from "@/lib/session";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
  password: z.string().min(1, "Password is required"),
  next: z.string().optional(),
});

export async function login(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(loginSchema, formData);
  if (!parsed.ok) return parsed.state;
  const { email, password, next } = parsed.data;

  const user = await db.user.findUnique({ where: { email } });
  const valid = user && user.isActive && (await bcrypt.compare(password, user.passwordHash));
  if (!valid) return { error: "Incorrect email or password." };

  await createSession({ userId: user.id });
  // Only allow same-site relative redirects.
  redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
