"use server";

import { redirect } from "next/navigation";
import { isSupabase } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export type PasswordState = { error?: string };

export async function setPassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const password = String(formData.get("password") ?? "");
  const again = String(formData.get("again") ?? "");
  if (password.length < 10) return { error: "Heslo musí mít aspoň 10 znaků." };
  if (password !== again) return { error: "Hesla se neshodují." };
  if (!isSupabase) redirect("/");
  const sb = await createClient();
  const { error } = await sb.auth.updateUser({ password });
  if (error) {
    return {
      error:
        error.code === "same_password"
          ? "Nové heslo musí být jiné než to původní."
          : error.code === "weak_password"
            ? "Heslo je příliš slabé. Zkus delší nebo méně běžné."
            : "Heslo se nepodařilo uložit. Odkaz mohl vypršet — nech si poslat nový.",
    };
  }
  redirect("/");
}
